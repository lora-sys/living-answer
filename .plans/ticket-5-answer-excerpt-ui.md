# Ticket 5 — Answer excerpt user flow

## Status

Implemented (2026-08-30, commit 92d874e).

## Context

Ticket 4 verified the TanStack Start server function
`resolveAnswerExcerpt`. It accepts a Zhihu answer URL and returns a JSON-safe
discriminated union with `ok` / `error` states. The home route is still a
static Foundation card. The next smallest product step is to expose one
user-facing excerpt flow over that verified boundary.

The home route already establishes the product's stone/amber palette, a large
rounded content panel, and quiet supporting text. Ticket 5 should stay within
that visual language and avoid creating a new product surface.

## Goal

Add a single-screen request flow that lets a user paste a Zhihu answer URL,
call `resolveAnswerExcerpt`, and see the result in one of four honest states:

1. request: a labeled URL input and submit action;
2. loading: a visible pending state only while the server call is in flight;
3. error: a readable failure state, including an explicit no-match state;
4. success: a clearly separated answer excerpt with its answer identity and
   capture time.

## Non-goals

- No database, persistence, importer, file storage, or server cache changes.
- No full answer body ingestion and no conversion of an excerpt into
  `AnswerSnapshot`.
- No AI generation, patch creation, patch preview, or author-visible content.
- No route loader, new route, new dependency, or new external provider.
- No retry, polling, metrics, logging of inputs/results, or credential access
  from client code.

## UX and states

Use the home route as the one-screen flow. Keep the existing product name,
tagline, and Foundation status as the opening context. Add the request flow
below or within the existing content panel using the established design
language. The interface remains usable at mobile width.

Required behavior:

- The form must submit with the Enter key and an explicit submit button.
- Submitting a blank or whitespace-only URL shows `INVALID_REQUEST` without
  pretending a network request occurred.
- While pending, the submit action is disabled and the screen visibly says the
  excerpt is being retrieved.
- A successful response shows only the safe, user-facing excerpt fields: the
  excerpt text, question/answer identity, and captured time. The raw fingerprint
  is not the primary UI and need not be shown.
- `ANSWER_NOT_FOUND` is explicitly described as no matching answer, not as a
  generic crash.
- Other server failure codes map to short, calm Chinese copy that does not
  expose headers, provider payloads, stack traces, credentials, or internal
  error details.
- The same code can be retried after an error without a page reload.
- A new request replaces the previous state; the UI never shows stale success
  and error simultaneously.

## Implementation boundary

- Import the verified server function from
  `src/server/resolve-answer-excerpt.ts`.
- Add a pure failure-code-to-user-message mapping under `src/lib/`, suitable
  for offline tests. The route remains presentational and stateful.
- Keep `process.env` restricted to the existing server wiring module.
- Keep all provider data untrusted at the product display boundary. Render it as
  text; do not parse it as markup.
- Format `capturedAt` and `sourceEditTime` deterministically enough for the UI
  without introducing a date dependency. If locale behavior makes tests brittle,
  use a simple stable UTC display.

## Implementation steps

1. Add the pure failure-code-to-user-message mapping and focused offline tests
   covering every server failure code.
2. Update the home route with the controlled URL form and the four required
   states, using TanStack Start server-function invocation and React state
   without new dependencies.
3. Run the existing toolchain and browser checks; fix only issues introduced by
   this ticket.

## Tests and verification

Run from the repository root:

```sh
vp check --fix
vp test
vp build
```

The plan does not add a UI component-testing dependency. Browser evidence must
cover desktop and mobile render dimensions and the request, loading, error,
no-match, and success states. Save evidence under `.local/evidence/`; it is not
committed.

Additional review checks:

```sh
rg -n "process\\.env" src
rg -n "AnswerSnapshot|Prisma|Drizzle|sqlite|postgres|mongodb" src/server
```

`process.env` may appear only in the server function wiring module. The second
check must have no matches.

## Acceptance

- All existing checks remain green.
- The home route provides a real request path over `resolveAnswerExcerpt`.
- Loading, success, error, and no-match states are visually distinct and honest.
- No credential, raw failure payload, full body, or persistence path is added.
- The UI remains responsive at 1440x900 and 375x667.
