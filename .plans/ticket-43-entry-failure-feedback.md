# Ticket 43 — Entry failure transparency and structured feedback

## Problem

1. A valid Zhihu answer URL can fail with `ANSWER_NOT_FOUND`, but the UI only
   says the answer was not found. This hides the provider boundary: the search
   API cannot reliably resolve a full answer URL.
2. `NO_PATCH` reads like a dead end even though the excerpt remains useful for
   learning.
3. The Read page feedback control is disabled. Product rules require feedback to
   enter a structured review queue, never to rewrite a conclusion automatically.

## Scope

- Keep the current dual entry. Do not clone Zhihu and do not add a generic AI
  chat surface.
- Explain recognized-answer failures at the entry, including that the URL was
  parsed but the summary-class provider did not return it.
- Present `NO_PATCH` as "learnable now, no confirmed update" with the next
  review path.
- Add a structured Read-page feedback form with reason, optional question,
  optional evidence URL, and optional quoted source text.
- Persist every accepted feedback item to SQLite under `.local/`.
- If and only if quoted evidence is supplied, run the existing Evidence Gate.
  The gate result is review state only; it never creates a visible patch.
- Treat all user input and provider/model output as untrusted.

## Out of scope

- Full-body Zhihu ingestion.
- Human moderation UI.
- Automatic feedback-to-patch conversion.
- Deployment and eval changes.

## Acceptance

- `ANSWER_NOT_FOUND` shows why the valid URL may not be retrievable and offers
  the search path as the next step.
- `NO_PATCH` says the answer is usable for learning and offers an explicit way
  to submit evidence-backed feedback.
- Feedback is stored with target identity, reason, question, optional evidence,
  timestamp, and review state.
- Duplicate feedback submissions are idempotent.
- Evidence-backed feedback does not mutate `AnswerSnapshot` or
  `PatchRevision`, and does not bypass the Evidence Gate.
