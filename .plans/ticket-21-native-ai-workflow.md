# Ticket 21 - Native AI evidence workflow

Issue: #31

Status: complete

## Problem

The product has isolated AI building blocks, but the current experience still
feels like separate tools: claim extraction, optional evidence retrieval, a
maintenance note, and a final analysis. The model pipeline also only gates
evidence for the first extracted claim, so later claims can silently disappear.

## Goal

Make the P0 AI path feel like one evidence-bound workflow:

1. Extract claims from the answer excerpt.
2. Retrieve candidate evidence for every claim.
3. Gate every claim against its candidates.
4. Analyze the original excerpt and its claims against verified evidence.
5. Present the connected result without exposing internal model details.

The system remains a deterministic workflow, not an autonomous agent. The LLM
does not receive arbitrary tool authority.

## Changes

### Slice 1 - Complete evidence gating

- Evaluate each stored claim separately.
- Aggregate promoted evidence without duplicating fingerprints.
- Treat missing or unusable evidence as `UNKNOWN`, not `NO_PATCH`.
- Preserve external candidate URLs and captured-at provenance.

### Slice 2 - Claim-aware analysis

- Pass the validated claims into the patch-analysis prompt.
- Keep model output constrained to existing evidence fingerprints.
- Continue returning advisory-only UPDATE decisions.

### Slice 3 - Native read experience

- Automatically retrieve candidates after claims load.
- Disable analysis until retrieval reaches a terminal state.
- Show a compact pipeline state: candidate premises, candidate evidence, user
  context, then decision.
- Preserve partial retrieval, quota, rate-limit, and failure messaging.

## Safety boundaries

- No full Zhihu answer-body ingestion.
- No autonomous browsing or arbitrary tool invocation.
- No model-generated evidence URLs or fingerprints.
- No visible UPDATE without external evidence.
- No model names, confidence scores, credentials, or raw provider payloads.

## Verification

- `vp check`
- `vp test`
- `vp build`
- Local browser smoke on desktop and mobile widths.
