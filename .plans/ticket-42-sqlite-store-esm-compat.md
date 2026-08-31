# Ticket 42 — SQLite store ESM compatibility

## Problem

Several production SQLite stores use bare `require("node:path")`,
`require("node:fs")`, and `require("better-sqlite3")`. In the TanStack Start
server-function runtime, at least `evidence-candidate-store.ts` is transformed
into a browser-compatibility `__require` shim that is undefined, so creating the
store fails with `require is not defined`. This causes `/sources` to fail even
though it has an empty database.

ESM modules must not rely on implicit CommonJS `require`.

## Scope

1. In all production store modules that open SQLite, create a Node require
   function explicitly with `createRequire(import.meta.url)`.
2. Replace bare `require(...)` calls for `node:path`, `node:fs`, and
   `better-sqlite3` with that explicit function.
3. Do not change schemas, query behavior, persistence paths, or error semantics.
4. Do not change test-only `require` usage unless a production test utility is
   affected.

## Files

- `src/lib/evidence-candidate-store.ts`
- `src/lib/patch-lifecycle-store.ts`
- `src/lib/excerpt-store.ts`
- `src/lib/claim-store.ts`
- `src/lib/sqlite-daily-quota-store.ts`

## Verification

- `vp check --fix`
- `vp test --run` (829+ tests must stay green)
- `vp build`
- Load `/sources` in a fresh dev server and confirm it reaches an empty or
  populated state, not the JSON error state.
- Smoke-test `/changes` and the existing real-analysis flow where SQLite stores
  are involved.
