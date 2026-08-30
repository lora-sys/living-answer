# Ticket 2 — Answer excerpt provider/cache boundary

## Status

Planned. Executor implementation scope; no code has been written for this
ticket yet.

## Context

Ticket 1R established `AnswerExcerpt` as the immutable record for
summary-class Zhihu data. `parseZhihuAnswerUrl` already validates a supported
answer URL and produces `questionId`, `answerId`, and `canonicalUrl`. The
existing `QueryCache` provides injectable time, TTL, bounded eviction, and
single-flight `getOrSet`.

This ticket adds the smallest Effect boundary between those pieces. It must
resolve one already-supported Zhihu answer URL into one validated
`AnswerExcerpt` through an injected provider function. It does not connect to
the real Zhihu API and does not persist anything.

One prerequisite was found during review: `QueryCache.getOrSet` currently
returns `CacheMiss` for an expired entry instead of recomputing it. That would
turn a normal TTL expiry into a caller-facing failure. Fix that behavior first.

## Goals

1. Make `getOrSet` recompute an expired entry through the normal single-flight
   path.
2. Add a typed provider/cache boundary that maps a supported answer URL to an
   `AnswerExcerpt`.
3. Treat every provider item as untrusted and validate it at runtime.
4. Cache only successful `AnswerExcerpt` results.

## Non-goals

- No real HTTP client, provider SDK, environment access, credentials, or OAuth.
- No retries, timeouts, backoff, or rate limiting. Those belong with a real
  adapter in a later ticket.
- No database, importer, persistence, repository, route, server function, UI,
  or live API call.
- No change to `AnswerSnapshot` and no extension to `AnswerExcerpt`.
- No arbitrary sleep in tests.

## Public boundary

Create `src/lib/answer-excerpt-provider.ts`.

The provider dependency returns only candidate items. It must not receive or
return an HTTP response object:

```ts
export interface AnswerExcerptProviderRequest {
  readonly questionId: string;
  readonly answerId: string;
  readonly canonicalUrl: string;
}

export type AnswerExcerptItemsFetcher = (
  request: AnswerExcerptProviderRequest,
) => Effect.Effect<readonly unknown[], AnswerExcerptProviderError>;
```

The service accepts a URL string so callers cannot bypass URL validation:

```ts
export interface AnswerExcerptProvider {
  readonly resolve: (
    url: string,
  ) => Effect.Effect<AnswerExcerpt, AnswerExcerptProviderFailure>;
  readonly stats: () => Effect.Effect<CacheStats>;
}
```

The factory mirrors the existing cache factory naming:

```ts
export interface AnswerExcerptProviderOptions {
  readonly fetchItems: AnswerExcerptItemsFetcher;
  readonly ttl: Duration.DurationInput;
  readonly now?: () => Effect.Effect<number, never>;
  readonly maxEntries?: number;
}

export const makeAnswerExcerptProvider = (
  options: AnswerExcerptProviderOptions,
): Effect.Effect<AnswerExcerptProvider> => /* ... */;
```

## Failure types

Use Effect `Data.TaggedError` classes and export a precise union. Suggested
boundary:

```ts
export type AnswerExcerptProviderFailure =
  | UnsupportedAnswerUrlError
  | AnswerExcerptProviderError
  | AnswerNotFoundProviderError
  | AmbiguousAnswerProviderError
  | InvalidProviderAnswerError;
```

- `UnsupportedAnswerUrlError` carries the reason from
  `parseZhihuAnswerUrl`.
- `AnswerExcerptProviderError` is the typed failure injected providers must
  return for transport/provider-level failure.
- `AnswerNotFoundProviderError` means the provider returned no candidate that
  matched the parsed answer identity.
- `AmbiguousAnswerProviderError` means more than one candidate matched.
- `InvalidProviderAnswerError` means a matched candidate failed runtime
  validation.

The implementation must not leak `CacheMiss` in the public provider failure
type. After the prerequisite fix, normal `getOrSet` should not produce one; if
the current cache type still includes it, adapt that internal error at the
provider boundary.

## Cache design

- Cache key is the deterministic string `` `${questionId}:${answerId}` ``.
- IDs are already validated as digits-only, so this cannot collide across
  supported answers.
- The key does not include `capturedAt`, text, provider response, or wall time.
- Reuse `makeQueryCache`; do not create another cache implementation.
- Pass the service's injectable `now` to the query cache.
- Cache only a successful `AnswerExcerpt`.
- Do not cache unsupported URLs, provider failures, validation failures,
  not-found results, or ambiguous results.
- On a cache hit, return the original immutable `AnswerExcerpt`, including its
  original `capturedAt`.
- On cache miss or expiry, capture a fresh time after the injected provider
  succeeds and use that value as `capturedAt`.

## Runtime validation and matching

Resolve in this order:

1. Run `parseZhihuAnswerUrl(url)`. On failure, return
   `UnsupportedAnswerUrlError` without calling the provider.
2. Build the provider request and cache key from the parsed identity.
3. Inside `getOrSet`, call the injected fetcher.
4. Treat the returned `readonly unknown[]` as untrusted data.
5. Validate and select one candidate:
   - A non-object candidate is invalid.
   - A candidate whose `ContentType` is not exactly the string `"Answer"` is
     ignored.
   - An `Answer` candidate must have a string `Url` accepted by
     `parseZhihuAnswerUrl`. A valid answer URL for a different identity is
     ignored; an invalid URL on an `Answer` candidate is invalid.
   - For a candidate whose parsed `questionId` and `answerId` both equal the
     target, require:
     - `ContentID` is a canonical decimal string (negative IDs are valid).
     - `EditTime` is a safe non-negative integer.
     - `ContentText` is a non-empty string.
   - Pass those values plus the freshly captured time to
     `createAnswerExcerpt`. Map any domain failure to
     `InvalidProviderAnswerError`.
6. If exactly one candidate remains, return it.
7. If none remains, return `AnswerNotFoundProviderError`.
8. If more than one remains, return `AmbiguousAnswerProviderError`.

Do not silently pick the first match. Do not preserve provider URL, search
rank, author data, or any additional raw response fields on `AnswerExcerpt`.

## Implementation steps

### Step 1 — Fix expired `getOrSet`

In `src/lib/query-cache.ts`, make an expired entry follow the same
pending/start flow as an absent key. Remove the expired early-failure branch
from `getOrSet`. Keep `get` unchanged: an expired entry is still a `CacheMiss`.

Add focused tests proving:

- an expired entry is recomputed by a subsequent `getOrSet`;
- concurrent `getOrSet` calls after expiry still compute once;
- the recomputed value is cached.

### Step 2 — Add the provider boundary

Create `src/lib/answer-excerpt-provider.ts` exactly within the boundary above.
Use `Effect`, `Data`, `Duration`, `parseZhihuAnswerUrl`, `createAnswerExcerpt`,
and `makeQueryCache`. Do not import React, TanStack, HTTP SDKs, or environment
modules.

### Step 3 — Test and document the boundary

Create `src/lib/answer-excerpt-provider.test.ts` using fake in-memory provider
closures and injectable clocks. Cover at least:

Success and cache behavior:

- valid URL and valid matching provider item resolve to `AnswerExcerpt`;
- the injected fetcher receives parsed IDs and `canonicalUrl`;
- query parameters and alternate supported host forms still match after URL
  canonicalization;
- a second resolve for the same answer identity hits the cache;
- the same parsed identity from different supported URL forms shares a cache
  entry;
- `capturedAt` comes from the injected clock and stays stable on cache hits;
- non-`Answer` candidates are ignored;
- one matching candidate is selected from unrelated valid candidates.

Failure behavior:

- unsupported URL fails before the provider is called;
- provider failure is propagated and not cached;
- zero matching candidates returns not-found and is not cached;
- multiple matching candidates returns ambiguous and is not cached;
- an `Answer` candidate with an invalid URL is invalid;
- invalid `ContentID`, `EditTime`, or `ContentText` is invalid;
- canonical decimal `ContentID` beyond `Number.MAX_SAFE_INTEGER` is accepted.

Update the boundary status in `AGENTS.md`, `CONTEXT.md`, and
`.plans/01-answer-ingestion.md`: the provider/cache boundary exists, remains
offline and injected, and persistence still requires a later approved ticket.

## Verification

Run all of the following from the repository root:

```sh
vp check
vp test
vp build
```

Additional review checks:

```sh
rg -n "fetch\\(|axios|node-fetch|ZHIHU.*TOKEN|AnswerSnapshot" src/lib/answer-excerpt-provider.ts
rg -n "Date\\.now|setTimeout|setInterval" src/lib/answer-excerpt-provider*.ts
```

The first command should show no real network/credential dependency. The second
should show no direct wall-clock access or arbitrary sleeps.

## Acceptance

- `vp check`, `vp test`, and `vp build` are green.
- The provider can be driven end to end with a fake provider and fake clock.
- No test or implementation performs network I/O, reads credentials, writes
  files, or touches a database.
- The repository remains free of persistence code for this boundary.
