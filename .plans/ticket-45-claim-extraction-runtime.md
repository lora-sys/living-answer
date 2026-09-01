# Ticket 45 — Claim extraction runtime reliability

## Problem

Ticket 44 proved that a search candidate can resolve from the persisted
summary-class excerpt store. The follow-up claim extraction call then returned
`PROVIDER_ERROR` repeatedly. A simple StepFun request returned HTTP 200, so the
credential and endpoint are healthy. With the real extraction prompt,
`step-3.7-flash` was observed needing more than 12 seconds and still failing
when given 30 seconds. The production claim extraction currently reuses
`FIVE_SECONDS_MS`, which is almost certainly too short.

## Decision

Separate the Zhihu network timeout from the model timeout. First run a small
Spike against the configured OpenAI-compatible endpoint with a real excerpt
representative of the persisted summaries. Measure total latency and validate
whether the response is parseable as the claims schema. Use the result to select
the production model and a realistic timeout.

The Zhihu provider should keep its current 5-second boundary. The model boundary
should be independent and generous enough for real summaries, with 60 seconds as
the upper bound unless the Spike proves a better value.

## Scope

1. Run an ignored, local Spike:
   - Load credentials only into the process environment.
   - Compare plausible StepFun models with the real claim-extraction prompt.
   - Record total latency, HTTP status, finish reason where available, and
     whether the output parses as JSON.
   - Store only non-secret results under `.local/`.
   - Remove any temporary script after the measurement.
2. Add a dedicated model timeout for `extract-answer-claims`:
   - Keep `FIVE_SECONDS_MS` only for the Zhihu provider transport.
   - Add `CLAIM_EXTRACTION_TIMEOUT_MS` for the OpenAI-compatible transport.
   - The Spike determines the initial production value, capped at 60 seconds.
3. Cover timeout behavior with a focused unit test:
   - A transport that hangs fails into the existing `PROVIDER_ERROR` mapping.
   - The test must not rely on real network latency or arbitrary sleeps.
4. Improve the waiting state only if it is needed to make the longer wait
   honest. Do not redesign the page.
5. Run the full verification suite and a real runtime smoke test.

## Out of scope

- Full-body ingestion or `AnswerSnapshot.body`.
- Evidence Gate changes or feedback-driven automatic patching.
- Deployment, eval, PR creation, or UI redesign.
- New environment variables unless the Spike proves they are required.
- Exposing model names, URLs, tokens, provider headers, raw provider responses,
  or error causes.

## Verification

- `vp check --fix`
- `vp test --run`
- `vp build`
- Runtime smoke: search a real question, select a candidate, let the excerpt
  resolve, and verify claim extraction either succeeds within the selected
  timeout or returns a structured product-facing error.

## Acceptance

- Claim extraction no longer fails from a shared 5-second transport timeout.
- The selected model and timeout are evidence-based rather than guessed.
- Zhihu provider behavior and quota accounting are unchanged.
- No secret, provider payload, model error cause, or `.env` value is committed.
- The runtime path can produce either valid claims or an honest structured
  failure; it must not return a generic dead-end after a successful excerpt
  lookup.
