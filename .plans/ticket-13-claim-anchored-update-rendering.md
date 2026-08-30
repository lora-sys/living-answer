# Ticket 13: claim-anchored UPDATE rendering

## Goal

Let a live UPDATE explain which part of the original answer is affected, what
is different now, why it matters, and which selected evidence supports the
conclusion. The card must remain advisory, evidence-backed, and safe when the
model cannot provide these details.

## Current gap

`RealResultRead` and `AnalysisResultPanel` render an UPDATE as a generic
`reason` paragraph plus evidence links. The response has no claim anchor,
current state, impact, or evidence quote. The golden demo has this shape, but
the live analysis flow does not.

## Design

Keep the model behind the existing analysis workflow. Extend the model output
with three optional plain-text fields:

- `affectedWording`: an exact contiguous substring copied from the supplied
  excerpt. The workflow must verify this substring before allowing it into a
  decision. If it does not match, drop the field rather than trusting a
  paraphrase or fabricated quote.
- `currentState`: a concise statement of the current situation.
- `impactOnAnswer`: a concise statement of the effect on the old answer.

Do not ask the model to return evidence quotes. The server already owns the
trusted evidence records. Build the response's `matchedEvidence` from the
model-selected fingerprints by looking those fingerprints up in the server-side
evidence array. A model fingerprint that is absent from the evidence array is
already downgraded to `UNKNOWN` by the existing invariant.

All new fields are optional. Legacy output must continue to parse and render as
the existing generic UPDATE card.

## Slices

1. **Workflow schema and parser**
   - Bump the analysis prompt schema version from `1` to `2`.
   - Add the three optional fields to the prompt contract and model response
     type.
   - Parse each field with a shared validator: trim, require non-empty, reject
     control characters, and reject text longer than 200 characters.
   - Preserve valid fields in `PatchAnalysisUpdateDecision`.
   - Before creating the UPDATE decision, verify that `affectedWording` is an
     exact substring of `input.excerpt.excerpt`; otherwise omit it. Do not fail
     the whole UPDATE for a bad claim anchor.

2. **Server response mapping**
   - Extend `AnalyzePatchUpdateResponse` with the three optional fields.
   - Add `matchedEvidence` containing only selected evidence records that exist
     in the supplied evidence array.
   - Each matched item exposes `fingerprint`, `sourceLabel`, `sourceUrl`, and
     `quote`. The quote is copied from the server-owned `PatchEvidence` record
     and truncated to a bounded display length.
   - Keep `patchBodyStatus: "no-body-available"` and never expose
     `proposedBody`.

3. **Shared UPDATE presentation**
   - Extract or introduce one focused UPDATE advisory card used by both
     `RealResultRead` and `AnalysisResultPanel`, preserving each parent's
     existing placement and controls.
   - Render conditional sections in this order:
     `原文受影响前提`, `当前状况`, `对回答的影响`, generic `reason`,
     `匹配证据`, `参考来源`, and the existing advisory disclaimer.
   - Omit a section when its field is absent or the matched evidence list is
     empty.
   - Keep amber styling reserved for UPDATE and preserve the current visual
     language.

4. **Tests**
   - Workflow: optional fields survive parsing; absent fields remain absent;
     oversized or control-character fields are omitted; exact claim-anchor
     matching accepts a copied substring and drops a paraphrase.
   - Server mapping: selected evidence becomes matched evidence; unselected or
     unknown evidence is not included; optional fields are carried through.
   - UI: full claim-anchored UPDATE renders all new sections; legacy UPDATE
     renders the same generic card as today; partial fields render only what is
     present; `proposedBody` never appears.

## Verification

- `vp check`
- `vp test`
- `vp build`
- Browser check for full and fallback UPDATE rendering at 320, 375, 414, 768,
  and 1440 px, with no horizontal overflow.

## Non-goals

- No persistence, ingestion, OAuth, provider, or transport changes.
- No golden-demo fixture or read-route changes.
- No confidence scores, model names, logs, or replacement answer text.
- No deployment or PR.

## Done condition

Ticket 13 is done when full, partial, and legacy UPDATE responses all render
correctly; claim anchors are verified against the excerpt; matched evidence is
built only from server-owned records; all verification commands pass; and the
browser layout remains stable at the required widths.
