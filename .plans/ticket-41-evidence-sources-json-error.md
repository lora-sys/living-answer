# Ticket 41 — Evidence sources JSON-safe failure response

## Problem

`listPatchChanges` returns a JSON-safe `{ status: "error" }` response when its
store fails. `listEvidenceSources` does not. An `EvidenceCandidateStoreError`
therefore escapes the TanStack server-function handler, the browser receives a
framed transport error, and the UI must rely on a null-result fallback instead
of the intended typed error state.

The AGENTS.md boundary requires the server function to return a JSON-safe
result and not expose credentials, raw provider bodies, or error causes.

## Scope

1. Wrap the existing store creation and `findAll()` execution in the same
   error-shape pattern used by `list-patch-changes.ts`.
2. On any failure, return:

   ```ts
   {
     status: "error",
     code: "SOURCES_STORE_ERROR",
     message: "加载证据来源时出现异常，请稍后再试。",
   }
   ```

3. Do not include exception messages, causes, stack traces, provider bodies, or
   credentials in the response.
4. Keep the UI null-result fallback added in Ticket 40 as a transport-level
   defense.

## Non-goals

- No retry behavior.
- No changes to SQLite schema, persistence, or query logic.
- No UI redesign beyond confirming the existing typed error state renders.

## Verification

- `vp check --fix`
- `vp test --run` (829+ tests must stay green)
- `vp build`
- Load `/sources` and verify it reaches the typed error state or real empty /
  populated state instead of a server-function transport error.
