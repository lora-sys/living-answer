# Ticket 3 — Zhihu search adapter behind the answer excerpt provider

## Status

Planned.

## Context

Ticket 2 established `AnswerExcerptProvider`: it parses a supported Zhihu
answer URL, calls an injected items fetcher, treats the returned candidates as
untrusted data, and caches only a validated `AnswerExcerpt`.

Spike 01 established that the documented Zhihu open API has no full answer-body
path. `zhihu_search` returns summary-class `ContentText`. The adapter in this
ticket must therefore return raw search candidates only. The existing provider
remains the sole place that validates a candidate and creates an
`AnswerExcerpt`.

The adapter must stay behind an injectable transport so tests remain offline.
`ZHIHU_ACCESS_SECRET` may be supplied by a server caller as a string, but the
adapter must not read `process.env`, expose the secret, or print it.

## Goal

Create the smallest Zhihu search adapter that:

1. builds a documented `zhihu_search` request;
2. validates the response envelope;
3. returns `Data.Items` to `AnswerExcerptProvider`.

This is a protocol adapter, not a retrieval guarantee. Searching by canonical
URL may return no matching candidate. `AnswerNotFoundProviderError` is the
correct provider result in that case.

## Non-goals

- No database, persistence, repository, importer, route, server function, or UI.
- No claim extraction, evidence retrieval, patch generation, or recheck.
- No full-body ingestion and no conversion of `AnswerExcerpt` into
  `AnswerSnapshot`.
- No OAuth user identity.
- No retries, backoff, rate limiting, metrics, or caching inside the adapter.
- No reading credentials from `process.env` inside library code.
- No validation of item fields inside the adapter; `AnswerExcerptProvider`
  already owns that validation.

## Public boundary

Create `src/lib/zhihu-search-adapter.ts`.

The transport receives the fully constructed request and returns parsed JSON.
It deliberately does not know about `AnswerExcerpt`:

```ts
export type ZhihuSearchTransportFailureReason =
  | "NETWORK_FAILED"
  | "HTTP_STATUS"
  | "NON_JSON_RESPONSE";

export class ZhihuSearchTransportError extends Data.TaggedError(
  "ZhihuSearchTransportError",
)<{
  readonly reason: ZhihuSearchTransportFailureReason;
  readonly status?: number;
}> {}

export interface ZhihuSearchTransportRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

export type ZhihuSearchTransport = (
  request: ZhihuSearchTransportRequest,
) => Effect.Effect<unknown, ZhihuSearchTransportError>;
```

The adapter options are explicit and server-only by convention:

```ts
export interface ZhihuSearchAdapterOptions {
  readonly accessSecret: string;
  readonly transport: ZhihuSearchTransport;
  readonly now?: () => Effect.Effect<number, never>;
  readonly baseUrl?: string;
}

export const makeZhihuSearchItemsFetcher = (
  options: ZhihuSearchAdapterOptions,
): AnswerExcerptItemsFetcher => /* ... */;
```

`AnswerExcerptItemsFetcher` permits only `AnswerExcerptProviderError`, so the
adapter maps every transport and envelope failure into that public provider
failure type. It must not leak `ZhihuSearchTransportError`, response bodies,
or credentials.

## Request construction

For each provider request:

1. Use the supplied `baseUrl`, defaulting to
   `https://developer.zhihu.com`.
2. Request `/api/v1/content/zhihu_search`.
3. Set `Query` to `request.canonicalUrl`.
4. Use the injectable clock, defaulting to `Clock.currentTimeMillis`.
5. Set `X-Request-Timestamp` to integer seconds.
6. Set `Authorization` to `Bearer ${accessSecret}`.

The timestamp is transport metadata only. It is not captured time and must not
become `capturedAt`.

## Response envelope validation

Validate in this order:

1. Transport success returns an unknown JSON value.
2. The JSON value must be a non-array object.
3. `Code` must be a number. `Code === 0` is success.
4. On success, `Data` must be a non-array object and `Data.Items` must be an
   array.
5. Return that array unchanged as `readonly unknown[]`.
6. On a non-zero code, return `AnswerExcerptProviderError` without including
   the raw response body or secret.
7. Missing/invalid `Data`, missing/invalid `Items`, or a non-object envelope is
   also an `AnswerExcerptProviderError`.

The adapter must not reject a malformed candidate. Returning the array lets the
provider apply the authoritative validation rules.

## Fetch transport helper

Add a second factory in the same adapter module:

```ts
export interface FetchZhihuSearchTransportOptions {
  readonly fetch?: typeof fetch;
  readonly timeoutMs: Duration.DurationInput;
}

export const makeFetchZhihuSearchTransport = (
  options: FetchZhihuSearchTransportOptions,
): ZhihuSearchTransport => /* ... */;
```

Behavior:

- Use the injected fetch, defaulting to global `fetch`.
- Apply a bounded timeout with `AbortSignal.timeout`.
- Map thrown transport failure to `NETWORK_FAILED`.
- Map non-2xx responses to `HTTP_STATUS` and include the numeric status only.
- Map failed JSON parsing to `NON_JSON_RESPONSE`.
- Do not log or include response bodies.
- Do not retry.

## Implementation steps

1. Add transport and adapter types plus request construction.
2. Add envelope validation and the items fetcher factory.
3. Add the fetch transport helper and focused offline tests.

## Tests

Create `src/lib/zhihu-search-adapter.test.ts`.

Adapter tests:

- constructs the documented path and sends the canonical URL as `Query`;
- sends integer-second timestamp and Bearer auth without exposing the secret;
- returns valid `Data.Items` unchanged;
- returns an empty array for an empty valid `Items` array;
- maps a non-zero API code to `AnswerExcerptProviderError`;
- maps non-object JSON, invalid `Data`, and invalid `Items` to
  `AnswerExcerptProviderError`;
- maps all transport failures to `AnswerExcerptProviderError`;
- fails before calling transport when `accessSecret` is blank;
- does not read `process.env`.

End-to-end offline test:

- connect `makeZhihuSearchItemsFetcher` to `makeAnswerExcerptProvider`;
- feed one matching `Answer` candidate and one non-matching candidate;
- assert that the result is a valid `AnswerExcerpt`, not a raw response object.

Fetch transport tests:

- forwards URL and headers to the injected fetch;
- maps a network throw to `NETWORK_FAILED`;
- maps non-2xx to `HTTP_STATUS` with the numeric status;
- maps invalid JSON to `NON_JSON_RESPONSE`.

Do not use arbitrary sleeps. Timeout tests are not required in this ticket.

## Verification

Run all of the following from the repository root:

```sh
vp check
vp test
vp build
```

Additional review checks:

```sh
rg -n "process\\.env" src/lib/zhihu-search-adapter.ts
rg -n "AnswerSnapshot|Prisma|Drizzle|sqlite|postgres|mongodb" src/lib/zhihu-search-adapter.ts
```

The first must have no matches. The second must have no persistence or
full-body representation.

## Acceptance

- `vp check`, `vp test`, and `vp build` are green.
- The adapter can produce a validated `AnswerExcerpt` end to end using an
  offline transport fixture.
- No real network call, credential read, persistence, retry, or UI is added.
- The public provider failure taxonomy does not widen beyond
  `AnswerExcerptProviderError`.
- Summary data remains excerpt-only and is never represented as
  `AnswerSnapshot.body`.
