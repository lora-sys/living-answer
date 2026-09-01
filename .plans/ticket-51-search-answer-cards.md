# Ticket 51 — Browsable search answer cards

## Goal

Turn Zhihu search results from an ID list into cards a first-time reader can
judge before clicking. Each card should make the source, freshness, and
maintenance state legible without pretending that a search summary is a full
answer.

## Scope

1. Extend the JSON-safe search response (`AnswerCandidate`) with display-only
   metadata:
   - `authorDisplayName` from the documented `AuthorName` field when present.
   - `editAt` from the already-validated `EditTime`.
   - `maintenance` derived only from the existing local lifecycle store.
2. For each answer candidate, look up its local lifecycle history. Use the
   latest lifecycle status and selected-evidence count for:
   - `VISIBLE`
   - `DISPUTED`
   - `SUPERSEDED`
   - `RESOLVED`
   - `WITHDRAWN`
3. If no lifecycle record exists, use `not_tracked` and omit the evidence
   count. If the local lookup fails, use `unknown` and also omit the evidence
   count.
4. Replace the current thin result buttons with browsable answer cards that
   show title, author, edit date, excerpt preview, maintenance state, evidence
   count when applicable, and the existing canonical answer route action.
5. Preserve the current search quota, excerpt persistence, error handling,
   selection behavior, and evidence-gate invariants.

## Explicit boundaries

- Do not add author metadata to `AnswerExcerpt`; it is display metadata on the
  candidate projection only.
- Do not treat `ContentText` as a full answer body.
- Do not infer maintenance state from search ranking, freshness, or preview.
- Do not make a lifecycle-store lookup failure block otherwise valid search
  candidates; mark the state as `unknown`.

## Acceptance

1. A valid search item with `AuthorName`, `EditTime`, `Title`, and
   `ContentText` produces a card with all available fields.
2. An item missing `AuthorName` still renders with a neutral fallback and does
   not invent an author.
3. A candidate with a local `VISIBLE` lifecycle shows a maintenance state and
   its selected-evidence count.
4. A candidate without a lifecycle record shows an honest not-tracked state.
5. A lifecycle lookup failure never hides usable answer candidates.
6. Existing search and persistence tests continue to pass, with new tests
   covering metadata projection and lifecycle-derived card state.
