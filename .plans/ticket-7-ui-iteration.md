# Ticket 7 — UI audit iteration

## Status

Draft (2026-08-30). Plan produced during Hallmark audit review; implementation
will be assigned to Claude Code `fable`.

## Context

Tickets 5 and 6 shipped the home excerpt flow and the Golden Demo read surface.
The product logic is still intentionally narrow, but the UI now carries some
development metadata, one copy choice that conflicts with the product's
`UPDATE` voice, and a read-page layout issue that appears only when the patch
panel is open.

There is no project-level `design.md`, so this is not a system-managed
Hallmark project. The audit therefore focuses on the existing stone/amber
language and the product invariants rather than forcing a new landing-page
macrostructure.

## Audit findings

### Critical

- **Layout shift on panel open.** The back link is a sibling inside the flex
  container that switches to `flex-row` when the panel opens. On desktop this
  pushes the reading column away from the expected content rhythm.
  `src/routes/read.golden-demo.tsx:66-78`
  - Fix by moving the back link above the conditional flex row, then keeping
    only the article and panel inside the layout container.

### Major

- **`证伪演示` copy is too adversarial.** The product invariant says a later
  world change is an `UPDATE`, not proof the author was wrong.
  `src/routes/index.tsx:221-235`
  - Replace with calm `UPDATE` language such as `变化演示` or `更新演示`,
    without implying the original answer was wrong.
- **Development metadata is too prominent on the user-facing home.** The
  `Foundation 0` eyebrow, environment-ready badge, and stack label read as
  engineering state rather than product value.
  `src/routes/index.tsx:103-114` and `src/routes/index.tsx:126`
  - Remove or demote development-only metadata; keep one quiet product
    orientation line if needed.
- **Read page has no `h1`.** The answer surface currently starts with an
  author block and then an `h2`, weakening the document hierarchy.
  `src/routes/read.golden-demo.tsx:84-87`
  - Promote the answer title to `h1`, or introduce a concise `h1` that makes
    the reading context explicit.

### Minor

- **Evidence quote punctuation uses straight ASCII quotes.**
  `src/components/read/EvidenceCard.tsx:37-40`
  - Use neutral typography or Chinese quotation marks appropriate to the UI.
- **Multi-patch aggregation is not wired into the route.** The helper exists,
  but the route renders one marker per patch rather than one aggregate marker
  per affected paragraph.
  `src/routes/read.golden-demo.tsx:109-121`
  - Use the grouping helper or otherwise guarantee one marker per paragraph.
- **Patch count copy is ambiguous.** `PatchPanel` says `2 处前提已有重要更新`
  even when the panel is showing one active patch.
  `src/components/read/PatchPanel.tsx:82-87`
  - Clarify whether the number describes the active paragraph or the full
    answer.
- **Mobile bottom sheet lacks a quiet affordance.** The sheet is usable, but
  the scrolled state is not obvious at first glance.
  `src/components/read/PatchPanel.tsx:55-58`
  - Add a subtle, non-novelty handle or clearer scroll affordance only if it
    can remain visually quiet.

## Goal

Make one focused UI correction pass that keeps the product quiet, evidence-first,
and consistent with the `UPDATE` language, without changing product logic,
routes, data boundaries, or provider behavior.

## Non-goals

- No new routes, provider calls, persistence, AI, or dependency additions.
- No palette redesign or wholesale visual rebuild.
- No changes to product IA.
- No new architecture abstractions.

## Iteration steps

1. **Stabilize the read layout.** Move the back link out of the conditional
   flex row and verify desktop/mobile open/close states.
2. **Correct product voice.** Replace `证伪演示`, remove or demote engineering
   metadata, and keep the home focused on the user task.
3. **Normalize hierarchy and grouping.** Promote the read-page title to `h1`
   and ensure affected paragraphs aggregate their patch markers.
4. **Polish microcopy.** Clarify panel counts and evidence quote typography.
5. **Re-verify.** Run `vp check`, `vp test`, and `vp build`; capture desktop and
   mobile screenshots for home, read closed, panel open, keyboard focus return,
   and overflow check.

## Acceptance

- Opening the panel does not shift or displace the back link or article column.
- No `证伪` language appears in user-facing UI.
- Development metadata is not a primary user-facing element.
- The read page has a clear `h1` and stable heading order.
- Each affected paragraph renders one aggregate marker.
- All existing checks remain green.
- No provider, persistence, credential, or product-logic changes are introduced.
