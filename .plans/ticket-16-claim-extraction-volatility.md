# Ticket 16 - AnswerClaim extraction and volatility storage

## Status

Planned. No implementation has started.

## Goal

Turn a persisted `AnswerExcerpt` into at most three candidate claims that can
later drive evidence retrieval and the Evidence Gate. This ticket establishes
the `AnswerClaim` domain record, the extraction workflow, persistence, and a
honest read-only UI surface.

This is not patch generation. A candidate claim does not assert that the author
was wrong and does not create a visible patch.

## Product context

The P0 chain is:

```text
AnswerExcerpt -> Claim -> Evidence -> Evidence Gate -> Patch
```

The app can currently resolve and persist a real `AnswerExcerpt`. The next
missing step is to identify the small number of volatile, decision-relevant
premises inside that excerpt. Without this step, evidence retrieval has no
precise target and the product risks generating broad commentary instead of
specific maintenance notes.

Because Spike 01 established that the official Zhihu API returns summary-class
excerpt data rather than a complete answer body, this ticket explicitly works
at the excerpt boundary. It must not pretend that the excerpt is a complete
`AnswerSnapshot` or invent missing original text.

## Design decisions

### 1. New immutable `AnswerClaim` record

Create `src/lib/answer-claim.ts`.

An `AnswerClaim` must contain:

- `questionId`
- `answerId`
- `sourceContentId`
- `sourceContentType`
- `sourceEditTime`
- `excerptFingerprint`
- `claimText`
- `anchorText`
- `volatility`: `"high" | "medium" | "low"`
- `decisionRelevance`: `"high" | "medium" | "low"`
- `candidateReason`
- `extractedAt`
- `claimFingerprint`
- `status: "candidate"`

Validation rules:

- Reuse the same identity fields already present on `AnswerExcerpt`.
- Normalize text as NFC, CRLF/CR to LF, then trim.
- `claimText` is a concise restatement of a premise already present in the
  excerpt, not a new essay.
- `anchorText` must be an exact substring of the normalized excerpt. This is
  the anti-hallucination anchor.
- `candidateReason` explains why this premise may matter today. It must not
  claim that evidence already proves an update.
- Reject control characters in model-derived text.
- Enforce practical length limits for excerpt-sized claims, for example:
  - `claimText`: 24-220 chars
  - `anchorText`: 12-220 chars
  - `candidateReason`: 24-260 chars
- `claimFingerprint` is a versioned FNV-1a fingerprint over the excerpt
  fingerprint, normalized claim text, and normalized anchor text.
- The factory returns a discriminated success/failure result and never throws.

### 2. Deterministic extraction workflow

Create `src/lib/claim-extraction-workflow.ts`.

The workflow receives:

- a validated `AnswerExcerpt`;
- an injected `OpenAiChatCompletions` service;
- an injected clock or captured timestamp.

It must:

1. Build a deterministic JSON prompt containing only the normalized excerpt and
   the expected response schema.
2. Ask for at most three claims.
3. Require every claim to return an exact `anchorText` from the excerpt.
4. Reject a claim if its normalized anchor is not a substring of the normalized
   excerpt.
5. Sort candidate claims by model order, but cap the result at three.
6. Return `[]` as a valid result when the excerpt has no volatile or
   decision-relevant candidate claim.
7. Return typed failures for malformed JSON, invalid anchors, invalid fields, or
   transport failure.

The domain workflow must not read environment variables, import React, use
TanStack server functions, talk to SQLite, or construct provider SDK clients.

### 3. Persistence boundary

Create `src/lib/claim-store.ts`.

Use SQLite under ignored local state, preferably:

```text
.local/claims.db
```

Recommended schema:

- `claim_sets`: one extraction event per excerpt fingerprint.
- `claims`: candidate claims linked to that set.

Suggested key behavior:

- Primary identity for the claim set is `excerpt_fingerprint`.
- Primary identity for a claim is `(claim_set_id, claim_fingerprint)`.
- Saving the same claim set must be idempotent.
- The latest set for an excerpt fingerprint can be read back without calling AI.
- If a later extraction for the same excerpt returns a different set, preserve
  the previous set and insert the new set; do not overwrite historical
  analysis events.

All writes stay under `.local/`. No credentials, API payloads, or production
state are committed.

### 4. Server boundary

Create `src/server/extract-answer-claims.ts`.

This boundary is responsible for:

- validating the request URL;
- resolving or reading the cached `AnswerExcerpt`;
- creating the OpenAI adapter from environment values;
- running the claim extraction workflow;
- persisting the resulting claim set;
- returning a JSON-safe response.

Failure codes should be stable and non-leaky, for example:

- `INVALID_REQUEST`
- `UNSUPPORTED_ANSWER_URL`
- `MISSING_ACCESS_SECRET`
- `MISSING_OPENAI_KEY`
- `ANSWER_NOT_FOUND`
- `INVALID_PROVIDER_ANSWER`
- `PROVIDER_ERROR`
- `CLAIM_STORE_ERROR`

The server must not expose secret values, raw provider payloads, model names,
tokens, or stack traces.

### 5. Read-only UI surface

Update the real-result area of `src/routes/index.tsx` after a successful real
excerpt request.

Add a compact section with:

- title: `候选关键前提`;
- status: `摘录级候选 · 尚未核验`;
- up to three claim cards;
- each card showing `claimText`, `anchorText`, volatility, decision relevance,
  and `candidateReason`;
- a single loading state;
- a quiet empty state when no candidate claim is found;
- stable failure states.

The UI must not say or imply that:

- a claim is a verified patch;
- the excerpt is the complete original answer;
- the author was wrong;
- the AI found evidence that is not yet present.

The featured golden demo flow remains unchanged in this ticket.

## Implementation slices

### Slice 1 - domain record

- Add `AnswerClaim` validation and fingerprinting.
- Cover valid input, normalization, invalid anchors, control characters, length
  limits, identity stability, and immutability.

### Slice 2 - extraction workflow

- Add the deterministic claim extraction workflow.
- Inject the OpenAI service and clock.
- Test successful extraction, empty extraction, invalid JSON, non-substring
  anchors, excessive claims, and transport failure.

### Slice 3 - persistence

- Add the SQLite claim store.
- Test schema creation, idempotent save, latest-set lookup, and preservation of
  multiple extraction events.

### Slice 4 - server and UI

- Add the server boundary and JSON-safe response mapping.
- Add the real-result claims section.
- Keep loading, empty, error, and success states explicit.

## Non-goals

- No evidence retrieval.
- No Evidence Gate.
- No patch generation.
- No changes to immutable golden demos.
- No public deployment.
- No PR.
- No generic search page.
- No OAuth.
- No full-answer ingestion.

## Verification

Run:

```bash
vp check
vp test
vp build
```

Additional checks:

- Confirm claims are saved only under `.local/`.
- Confirm every model-derived `anchorText` exists in the source excerpt.
- Confirm zero model text is treated as evidence.
- Browser-check the real-result claims area at 320, 375, 414, 768, and 1440 px.
- Verify no horizontal overflow, text overlap, or broken focus states.

## Done condition

A real supported Zhihu answer URL can resolve its persisted excerpt, extract at
most three candidate claims anchored to that excerpt, persist them locally, and
show them in the UI as unverified candidates. The result clearly stays below the
Evidence Gate and does not create a patch.
