# Ticket 18: Evidence Gate

## Status

Ready — Ticket 17 supplied persisted evidence candidates; this ticket classifies
them and promotes qualified ones to `PatchEvidence` for patch analysis.

## Problem

The P0 chain is:

```text
AnswerExcerpt -> Claim -> Evidence -> Evidence Gate -> Patch
```

Ticket 17 stores pre-gate evidence candidates (community leads and web sources)
with provenance. These candidates are untrusted summaries and cannot be used
directly as patch evidence. The missing capability is a gate that:

1. Assesses each candidate against the original claim.
2. Promotes only candidates whose content supports or refutes the claim with
   enough specificity to serve as evidence.
3. Returns an honest NO_PATCH or UNKNOWN verdict when no candidate qualifies.

Without this gate, `analyze-patch` falls back to using the excerpt itself as
evidence (the Slice 4 placeholder), which is not a real patch workflow.

## Product invariants

- Evidence candidates are untrusted input; model output is also untrusted.
- A promoted candidate must have a non-empty `contentPreview` that the gate
  treats as the quote (not the full-body).
- The gate never invents evidence: if no candidate supports or refutes the
  claim, the verdict is NO_PATCH or UNKNOWN.
- `PatchEvidence` is separate from `EvidenceCandidate`; promotion copies the
  needed fields, it does not mutate the candidate.
- All provider calls go through the existing `OpenAiChatCompletions` boundary.

## Design

### Gate classification

For each evidence candidate, the gate sends the claim text and the candidate
content to the LLM and asks for a structured classification:

```text
promote    — content is specific enough to serve as patch evidence
reject     — content is irrelevant or too vague
insufficient — content hints at a change but lacks specifics
```

The LLM returns JSON: `{ "classification": "promote" | "reject" | "insufficient", "reason": string }`.

### Promotion rules

Only `promote` candidates are converted to `PatchEvidence`:

```text
sourceLabel  = candidate.sourceLabel
sourceUrl    = candidate.sourceUrl
quote        = candidate.contentPreview (bounded to 500 chars)
capturedAt   = candidate.capturedAt
```

The gate returns:

```text
{ _tag: "gate_passed", evidence: PatchEvidence[] }
{ _tag: "gate_no_patch", reason: string }
{ _tag: "gate_unknown", reason: string }
```

`gate_no_patch` when all candidates were rejected or none exist.
`gate_unknown` when all candidates were `insufficient`.

### Workflow integration

`analyze-patch` replaces the Slice 4 placeholder evidence with the gate output.
When the gate passes, the evidence array feeds into the existing
`patch-analysis-workflow`. When the gate does not pass, the server returns
NO_PATCH or UNKNOWN without calling the patch analysis LLM.

## Implementation slices

### Slice 1 - Evidence gate domain

Add `src/lib/evidence-gate.ts`.

Cover:

- Candidate assessment via structured LLM call
- Classification parsing and validation (untrusted model output)
- Promotion to PatchEvidence with bounded quote
- Honest NO_PATCH / UNKNOWN when no candidate qualifies
- Injected LLM dependency; no React/TanStack/SQLite/process.env

### Slice 2 - Server integration

Extend `src/server/analyze-patch.ts` to:

- Look up evidence candidates by claim fingerprint from the store
- Run the gate before the patch analysis
- Use gate output as the evidence array (or short-circuit on gate failure)

Cover:

- Store lookup failure returns a typed error
- Gate short-circuit returns NO_PATCH / UNKNOWN without patch LLM call
- Successful gate feeds evidence into the existing analysis workflow

## Non-goals

- No full-body ingestion (the quote is the contentPreview, not the source body).
- No evidence scoring or ranking beyond promote/reject/insufficient.
- No UI changes (the gate output feeds the existing patch display).

## Verification

```bash
vp check
vp test
vp build
```
