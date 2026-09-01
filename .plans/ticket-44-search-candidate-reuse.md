# Ticket 44 — Search candidate excerpt reuse

## Problem

`searchAnswerCandidates` receives Zhihu answer items, including `ContentText`,
but only returns a 200-character preview and a canonical URL. When the user
selects a candidate, the UI calls `resolveAnswerExcerpt` with that URL. The
resolver calls `zhihu_search` again and searches for the URL. This second lookup
is not guaranteed to match, so a successful search can still produce a dead-end
`ANSWER_NOT_FOUND`.

The product must reuse the summary-class data that was already returned by the
first search.

## Decision

Use server-side reuse. Keep the frontend flow unchanged:

1. Search resolves answer candidates as today.
2. For each valid answer item, validate and normalize the provider fields.
3. Create an immutable `AnswerExcerpt` from the summary-class `ContentText`.
4. Persist that excerpt in the existing excerpt store.
5. When the selected candidate URL is resolved, `resolveAnswerExcerpt` finds the
   freshly persisted excerpt before making another network request.

Do not use the Zhihu direct-answer chat API as the ingestion path. It is a
generative response, not verifiable structured evidence. Do not expose raw
provider payloads to the client.

## Scope

- Extract and validate answer search items for candidate reuse.
- Remove Zhihu search highlight markup (`<em>` and matching `</em>`) before
  creating an excerpt.
- Persist only valid `AnswerExcerpt` records to the existing excerpt store.
- Wire the search handler through the existing daily quota guard.
- Keep `AnswerSnapshot` and `PatchRevision` immutable full-content records.
- Keep search failure states explicit and JSON-safe.
- Preserve candidate ordering and the existing maximum of five candidates.

## Out of scope

- Full-body ingestion.
- OAuth.
- Zhihu direct-answer API.
- Deployment and eval.
- Landing or Read page redesign.
- Feedback or patch lifecycle behavior changes.

## Implementation notes

- Domain and adapter code must not depend on React, TanStack, provider SDKs, or
  environment-specific paths.
- Treat provider payloads as untrusted and validate every reused field.
- A malformed answer item must not be silently converted into a valid excerpt
  unless it is intentionally skipped as a non-usable candidate.
- The reused excerpt must contain the provider `ContentID`, safe-integer
  `EditTime`, canonical URL identity, normalized text, and a capture time from
  the search response handling path.
- Store failures must not turn invalid or absent data into a success.
- The candidate response can remain limited to display fields, but the server
  must retain enough provider data to create and persist the excerpt.

## Verification

- Add focused tests for:
  - valid search answers create and persist excerpts,
  - `<em>` markup is removed,
  - malformed provider items are rejected or skipped without producing invalid
    excerpts,
  - store failures surface explicit failures,
  - resolver consumes the persisted excerpt without a second `zhihu_search`
    request,
  - search requests consume the daily quota guard.
- Run:
  - `vp check --fix`
  - `vp test --run`
  - `vp build`
- Smoke test with the dev server:
  1. Search a real question.
  2. Select an answer candidate.
  3. Confirm excerpt resolution succeeds from the reused result.

## Acceptance

- Selecting a search candidate no longer depends on a second URL-based
  `zhihu_search` call.
- The first successful search response is the ingestion event for the reused
  excerpt.
- No summary text is ever stored as an `AnswerSnapshot.body`.
- Quota consumption and failure paths remain observable through typed errors.
