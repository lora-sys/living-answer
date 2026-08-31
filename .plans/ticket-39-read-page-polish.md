# Ticket 39 — Read page polish (UI/UX phase 2)

## Problem

The read page works functionally but has small polish gaps:
`InlinePatchMarker` lacks a visual open/closed affordance and a pressed
state; `EvidenceCard` uses raw hex colors (`#d97757`/`#c4684a`) instead of
the project's design tokens; the read page root uses `bg-[#f5f3ee]` instead
of `bg-paper`.

## Scope (design decided by the UI/UX owner)

1. **InlinePatchMarker** (`src/components/read/InlinePatchMarker.tsx`):
   - Add a small chevron that rotates with state (▸ closed / ▾ open) after
     the label, using an inline SVG or unicode arrow, `aria-hidden="true"`.
   - Add `active:bg-amber-200 active:scale-[0.98]` pressed state.
   - Keep all existing classes, aria attributes, and behavior.
2. **EvidenceCard** (`src/components/read/EvidenceCard.tsx`):
   - Replace `text-[#d97757]` with `text-accent` and
     `hover:text-[#c4684a]` with `hover:text-accent-hover` (tokens exist in
     `src/styles.css`).
3. **Read page root** (`src/routes/read.golden-demo.$id.tsx`):
   - Replace `bg-[#f5f3ee]` with `bg-paper`.
4. **AnswerHeader** (`src/components/read/AnswerHeader.tsx`): no structural
   change; keep the provenance pill and freshness notice as-is.

## Constraints

- No new dependencies or tokens.
- No behavior/a11y changes beyond the chevron + active state.
- All 829+ tests stay green (`vp test --run`); update tests that assert the
  old marker structure if any.
- `vp check` and `vp build` pass.

## Verification

- `vp check --fix`, `vp test --run`, `vp build`
- Playwright screenshots of a golden-demo read page (desktop + mobile),
  including an open patch panel.
