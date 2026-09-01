# Ticket 52 — Hybrid feedback clarification

## Problem

The Read page already has a structured feedback form, SQLite persistence, and
an Evidence Gate. Its weakness is interaction: users must select a taxonomy and
fill evidence fields without guidance. This makes feedback feel like a support
form instead of an AI-assisted learning loop.

Ticket 52 adds an AI clarification layer while keeping the feedback boundary
explicit. The AI helps the user explain the problem and organize evidence. It
never judges truth, creates a patch, or rewrites a conclusion.

## Product shape

- The default feedback surface is a short clarification conversation.
- The assistant asks focused questions about what is wrong and whether a source
  is available.
- While the conversation progresses, the UI shows a reviewable structured
  draft: reason, question, optional evidence URL, and optional quoted source
  text.
- Submission remains a user-initiated action. A model response marked as ready
  does not submit automatically.
- If the user supplies evidence, the existing Evidence Gate reviews it. If the
  gate is inconclusive, feedback stays queued as insufficient. No visible patch
  is created.
- If AI clarification is unavailable, the existing structured form remains the
  fallback.

## Non-negotiable boundaries

- Model output and user messages are untrusted.
- No feedback-to-patch conversion.
- No full-body Zhihu ingestion.
- No credentials, provider internals, raw errors, or model causes in client
  responses.
- Domain/workflow code must not depend on TanStack, React, or provider SDKs.
- Use the existing `PatchFeedbackInput` as the final submission contract.
- Do not persist the ephemeral clarification transcript in this ticket.

## Implementation slices

### Slice 1 — Clarification workflow

Create a typed, Effect-based workflow around the existing chat boundary.

Input includes:

- answer identity and excerpt fingerprint;
- optional current patch record fingerprint;
- the summary excerpt or minimal relevant excerpt text;
- the currently selected feedback reason, if any;
- a bounded conversation history, user and assistant turns only.

Output is JSON-safe:

- assistant message;
- proposed feedback draft;
- whether evidence is still needed;
- whether the draft is ready for user review.

The workflow must validate model output. It must reject malformed JSON, unknown
reason values, missing text, overlong text, and control characters. Evidence
URL and quote must be proposed as a pair for an evidence-backed draft.

### Slice 2 — Server function

Add a server function behind the same dependency-injection style as other
workflows. It reads model credentials only inside the server boundary and maps
failures to stable JSON-safe codes:

- invalid request;
- missing model key;
- clarification unavailable.

It returns no provider or transport details. The server function composes the
workflow with the existing OpenAI adapter and applies a timeout.

### Slice 3 — Read-page feedback UI

Replace the default feedback experience with:

1. A bounded clarification conversation.
2. A visible structured draft under review.
3. A manual form fallback, available without hiding the persistence rule.
4. Explicit states: thinking, unavailable, draft ready, submitted, gate result,
   and error.

The submit control sends only the reviewed structured draft to
`submitPatchFeedback`. The existing review-state copy and result handling remain
in place.

## Tests

- Workflow accepts a valid clarification response and maps it to a structured
  draft.
- Workflow rejects malformed, oversized, and invalid model output.
- Evidence-backed drafts require both URL and quote.
- Server function returns safe errors and never exposes model/transport causes.
- UI submits only after user action.
- UI falls back to manual form when clarification is unavailable.
- Existing feedback persistence, idempotency, and Evidence Gate behavior remain
  covered.

## Acceptance

`vp check --fix`, `vp test --run`, and `vp build` pass. A user can clarify a
problem conversationally, inspect the structured draft, submit it, and receive
the same review-state feedback as the current form.
