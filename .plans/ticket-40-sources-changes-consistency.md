# Ticket 40 — Sources and changes consistency (UI/UX phase 3)

## Problem

`/sources` and `/changes` already expose real loading, error, empty, and
populated states. However, all three async states use the same low-emphasis
rounded rectangle, so failure does not look different from quiet success. Empty
states also do not give the user a next action. On `/changes`, status and time
metadata compete with the reason, and the list does not read as a lifecycle
timeline.

## Scope (design decided by the UI/UX owner)

1. **Shared async-state language, not shared abstraction.** Keep the markup in
   each route for this small iteration; make the visual grammar consistent:
   - Loading: a calm skeleton-style panel with `role="status"` and text that
     names the pending task.
   - Error: a clear alert panel with `role="alert"`, a short action title, the
     existing server-safe message, and a return-home link.
   - Empty: a distinct empty-state panel explaining what is missing and why,
     plus a return-home CTA.
2. **Changes timeline hierarchy.**
   - Give each card a subtle left rail and dot so the list reads as a sequence.
   - Move the lifecycle status badge into a stronger first-row position.
   - Keep the reason as the primary content; keep IDs, evidence count, capture
     time, and external link as clearly secondary metadata.
   - Keep existing status colors and labels; do not invent new semantics.
3. **Sources card hierarchy.**
   - Keep the whole card clickable, but render source kind as a bordered pill
     and separate title/preview/meta more clearly.
   - Keep provider and status out of the visible summary unless they are
     already part of the current content contract.
4. **Cross-navigation.** Each page's empty/error state gets a calm return-home
   link. Do not introduce a new global nav.

## Non-goals

- No new dependencies, routes, API calls, persistence changes, or design
  tokens.
- No retry behavior changes; do not add a client retry handler in this ticket.
- No changes to `AnswerSnapshot`, `PatchRevision`, evidence boundaries, or
  server functions.

## Files

- `src/routes/sources.tsx`
- `src/routes/changes.tsx`
- Tests only if existing assertions must be updated.

## Verification

- `vp check --fix`
- `vp test --run` (829+ tests must stay green)
- `vp build`
- Playwright desktop and mobile screenshots for `/sources` and `/changes`,
  including empty/error states where reachable without changing production
  state.
