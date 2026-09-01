# Ticket 53 — Answer Change Timeline

## Problem

`/changes` currently renders every lifecycle decision as a flat card. A reader
cannot tell which cards belong to the same Zhihu answer or how an answer's
maintenance understanding evolved across analysis runs.

## Scope

- Group visible lifecycle decisions by `(questionId, answerId)`.
- Order answer groups by their newest event, then order runs inside each group
  from newest to oldest.
- Show the number of maintenance records in each group.
- Preserve all existing lifecycle statuses and links to the Zhihu source and
  dedicated read page.
- Keep `/changes` read-only; do not add mutation, ingestion, persistence, or
  model-provider behavior.

## Non-goals

- No new database table or migration.
- No change to the evidence gate or `AnswerExcerpt` / `AnswerSnapshot`
  boundaries.
- No full answer-body ingestion.
- No redesign of the global landing page.

## Acceptance

- `/changes` renders one timeline group per answer, not one detached card per
  lifecycle decision.
- Each run still exposes status, reason, evidence count, capture time, event
  time, source link, and read-page link when applicable.
- Empty, loading, and error states remain accessible and truthful.
- `vp check --fix`, `vp test --run`, and `vp build` pass.
