# Ticket 46: Patch analysis runtime reliability

## Scope

Fix only the production model transport wiring in
`src/server/analyze-patch.ts`. Do not change the patch-analysis workflow,
OpenAI adapter, Evidence Gate, verdict taxonomy, response schema, or error
classification.

The patch-analysis model path currently shares `FIVE_SECONDS_MS` with the
Zhihu excerpt provider. Ticket 45 showed that the production model needs more
time, so this ticket follows the same boundary principle: slow model requests
get a separate timeout; Zhihu summary requests remain short.

## Root cause

The production wiring uses `FIVE_SECONDS_MS` for:

- the Zhihu provider transport;
- the OpenAI chat adapter timeout;
- the OpenAI fetch transport timeout.

Real patch-analysis prompts can exceed five seconds with the configured
`step-3.7-flash` model. The transport aborts with a network failure, and the
existing JSON-safe boundary maps that failure to `MODEL_TRANSPORT_ERROR`.

## Implementation

1. Add `PATCH_ANALYSIS_TIMEOUT_MS = 40_000` in the production wiring section of
   `src/server/analyze-patch.ts`.
2. Use that constant for both `makeOpenAiChatCompletions` and
   `makeFetchOpenAiTransport`.
3. Keep `FIVE_SECONDS_MS` for the Zhihu provider transport.
4. Keep the adapter and transport timeouts aligned so the adapter-level
   deadline and fetch-level deadline do not disagree.
5. Do not add environment variables, retries, fallbacks, prompt changes, or a
   generalized timeout abstraction in this ticket.

## Tests

- Preserve existing fake-chat tests; they cover verdict parsing and JSON-safe
  error mapping without real network waits.
- Add the smallest focused test that verifies the production wiring path remains
  usable with a fake chat and a valid excerpt. Do not sleep or use the real
  40-second timeout in tests.
- If the existing coverage already proves this path, avoid adding redundant
  implementation-detail tests.

## Acceptance

Run and pass:

```bash
vp check --fix
vp test --run
vp build
```

Then smoke the real runtime path:

1. Search for a real Zhihu question.
2. Select a real candidate answer.
3. Confirm its persisted excerpt and claims load.
4. Run patch analysis and expect a valid `UPDATE`, `NO_PATCH`, or `UNKNOWN`
   result.
5. Confirm the result is no longer a generic `MODEL_TRANSPORT_ERROR` merely
   because the model request exceeded five seconds.

The Zhihu provider timeout must remain five seconds. Evidence Gate behavior,
verdict classifications, and public error codes must remain unchanged.

## Rollout and process

1. Commit the focused implementation as a `fix:` commit.
2. Push `main` and close the focused GitHub issue with verification evidence.
3. Create a Notion implementation page under Development.
