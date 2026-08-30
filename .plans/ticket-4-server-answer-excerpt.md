# Ticket 4 — Server-side answer excerpt caller

## Status

Planned.

## Context

Ticket 2 provides the offline, injected `AnswerExcerptProvider`. Ticket 3
provides the protocol-only Zhihu search adapter and its bounded fetch
transport. The remaining gap between those boundaries and the application is
an explicit TanStack Start server boundary.

The server boundary is the only place allowed to read the credential. Domain
and library modules remain environment-free. The current ticket does not add
product UI because the first user-facing flow must be designed after the
server contract is verified.

## Goal

Create the smallest server function that accepts a Zhihu answer URL and
returns a serializable result:

1. validate the request shape;
2. construct the provider/adapter boundary with the server-only credential;
3. resolve the URL through `AnswerExcerptProvider`;
4. map the typed result to a JSON-safe response.

## Non-goals

- No UI, route content change, route loader, form, or component change.
- No database, persistence, repository, importer, or file cache.
- No full-body ingestion and no conversion to `AnswerSnapshot`.
- No retry, backoff, rate limiting, metrics, logging of payloads, or logging of
  credentials.
- No real network call in tests.
- No dependency on a specific deployment port or host.

## Public boundary

Create a server function module under `src/server/`. Its response must be a
plain discriminated union:

```ts
type AnswerExcerptServerFailureCode =
  | "INVALID_REQUEST"
  | "MISSING_ACCESS_SECRET"
  | "UNSUPPORTED_ANSWER_URL"
  | "ANSWER_NOT_FOUND"
  | "AMBIGUOUS_ANSWER"
  | "INVALID_PROVIDER_ANSWER"
  | "PROVIDER_ERROR";

type ResolveAnswerExcerptResponse =
  | { readonly status: "ok"; readonly excerpt: AnswerExcerpt }
  | { readonly status: "error"; readonly code: AnswerExcerptServerFailureCode };
```

The server function accepts `{ url: string }`. A blank or non-string URL
maps to `INVALID_REQUEST` without touching the provider.

## Credential and runtime behavior

- Read `process.env.ZHIHU_ACCESS_SECRET` only in `src/server/`.
- A missing or blank credential maps to `MISSING_ACCESS_SECRET` before network
  access.
- Create the fetch transport with a bounded timeout.
- Compose `makeFetchZhihuSearchTransport`,
  `makeZhihuSearchItemsFetcher`, and `makeAnswerExcerptProvider`.
- Preserve the provider cache across requests in a long-lived server process
  with a lazy singleton. Do not persist that cache outside process memory.
- Do not include the credential, transport headers, raw response bodies, stack
  traces, or error causes in the server response.

## Implementation steps

1. Add a pure response mapper from `AnswerExcerptProviderFailure` and boundary
   failures to the serializable response union.
2. Add a testable handler factory that receives an injected secret provider and
   provider factory.
3. Add the `createServerFn` wrapper that reads the secret and uses the real
   fetch transport.
4. Add focused offline tests for request validation, missing credentials,
   success, not-found, unsupported URL, ambiguous answers, invalid provider
   data, and provider failures.

## Tests

Create `src/server/answer-excerpt-response.test.ts` and
`src/server/resolve-answer-excerpt.test.ts` as appropriate.

Tests must use injected fake providers and must not instantiate the real
network transport. They must assert that valid `AnswerExcerpt` output is
returned without wrapper loss and that no failure branch leaks a
`Data.TaggedError` instance or credential.

## Verification

Run from the repository root:

```sh
vp check
vp test
vp build
```

Additional review checks:

```sh
rg -n "process\\.env" src
rg -n "AnswerSnapshot|Prisma|Drizzle|sqlite|postgres|mongodb" src/server
```

`process.env` may appear only in the server function wiring module. The second
check must have no matches.

## Acceptance

- `vp check`, `vp test`, and `vp build` are green.
- The server response is JSON-safe and does not leak errors, headers, bodies,
  or credentials.
- Missing credentials and invalid requests fail before network access.
- Summary data remains an `AnswerExcerpt`, never a full answer body.
