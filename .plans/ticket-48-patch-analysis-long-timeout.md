# Ticket 48: Patch analysis long-model timeout

## Scope

Change only the patch-analysis-specific timeout in
`src/server/analyze-patch.ts`. Do not change prompt shape, Evidence Gate,
verdict taxonomy, public response schema, retries, fallbacks, or provider
wiring.

The real smoke for Ticket 47 showed that the configured patch-analysis model can
legitimately need more than 40 seconds. The current 40-second deadline still
turns a slow but valid model call into `MODEL_TRANSPORT_ERROR`.

## Implementation

1. Raise `PATCH_ANALYSIS_TIMEOUT_MS` from `40_000` to `120_000`.
2. Keep that constant applied to both the OpenAI adapter and fetch transport.
3. Keep the Zhihu provider timeout at `5_000`.
4. Keep the adapter and transport deadlines aligned.

## Tests

Run:

```bash
vp check --fix
vp test --run
vp build
```

## Runtime smoke

1. Start the dev server.
2. Load a real excerpt with persisted claims and evidence.
3. Run patch analysis without changing the prompt.
4. Accept only a structured `UPDATE`, `NO_PATCH`, or `UNKNOWN` decision.
5. Do not accept a transport-only failure as passing.

## Rollout and process

1. Commit as `fix(patch-analysis): raise model timeout to 120s`.
2. Push `main`.
3. Close Ticket 47 with the successful runtime evidence.
