# Ticket 50 — Outcome-first live answer read page

## Goal

Make `/read/answer/$questionId/$answerId` read like an answer dossier instead of
an internal analysis pipeline. A first-time reader should see what conclusion
applies, why it matters, and how to verify it before encountering workflow
terminology or controls.

## Scope

- Presentation-only changes to the live read route and its read component.
- Reorder the active reading flow so the source boundary and conclusion appear
  before the excerpt, lifecycle controls, history, and feedback.
- Keep `UPDATE`, `NO_PATCH`, and `UNKNOWN` visibly distinct and honest.
- Keep lifecycle actions available, but subordinate them to the reading flow.
- Improve copy so search-derived data is clearly an excerpt, not the full answer.
- Preserve immutable records, evidence selection, author respect, and all
  existing feedback behavior.

## Non-goals

- No new persistence, providers, API calls, or server contracts.
- No invented full-body ingestion.
- No AI model changes.
- No marketing landing-page redesign.

## Acceptance

1. A visible `UPDATE` page shows the source boundary, conclusion, affected
   premise, current state, impact, and evidence before lifecycle actions.
2. `NO_PATCH` and `UNKNOWN` do not imply that the answer was replaced.
3. The excerpt is explicitly labeled as summary-class and links to the original
   Zhihu answer.
4. Lifecycle status, history, and feedback remain reachable without blocking the
   primary reading flow.
5. Tests cover primary-section ordering and honest status presentation.
