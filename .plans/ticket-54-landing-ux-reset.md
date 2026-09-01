# Ticket 54 — Landing UX Reset

## Problem

The current landing page has a strong visual language but a weak first-use
path. The primary entry sits below the hero, users cannot see what happens
after pasting or searching, and empty or unmatched results do not offer a clear
next action. Maintenance records also expose only opaque numeric IDs.

## Product goal

Make the first screen feel like a working revision desk: immediately usable,
honest about the evidence boundary, and legible to a new visitor.

## Scope

- Integrate the URL/search entry into the black hero.
- Show a compact workflow: capture excerpt -> identify premises -> retrieve
  evidence -> create a reviewable record.
- Clarify URL/search mode switching without moving the form away from the
  first viewport.
- Improve search result cards so title, preview, edit time, and maintenance
  state are scannable.
- Give unmatched URL, empty search, no claims, no evidence, and unknown
  maintenance states concrete next-step language.
- Make recent maintenance records show status, time, evidence count, and a
  stable action.
- Preserve all product invariants and existing server behavior.

## Non-goals

- No change to AI workflows, evidence gating, storage schemas, or lifecycle
  actions.
- No full-body Zhihu ingestion.
- No new analytics or authentication.
- No redesign of `/read` in this slice.

## Acceptance

- A first-time user can start from the hero without scrolling.
- Every primary input state has a visible next action or explanation.
- Maintenance status language never implies the original author was wrong.
- The page has no horizontal scroll at 320px and remains legible at 1440px.
- `vp check --fix`, `vp test --run`, and `vp build` pass.

## Progress

- The hero is now the single URL/search input surface.
- `#answer-entry` is now a result workspace rather than a duplicate form.
- Unmatched URLs and failed search selections move into a visible fallback
  state instead of leaving the page unchanged.
- Search cards, recent records, and empty states now use concrete maintenance
  language and next actions.
