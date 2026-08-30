# Ticket 14: demo-first landing polish

## Goal

Make the home page read as a demo-first product surface: a visitor should see
three curated golden demos in the first viewport flow, understand the product
by example, then use the real Zhihu URL workflow.

## Hallmark audit findings

- **Structural fingerprint** — The current page is a centered single-column
  hero followed by a workflow section and three equal-weight demo cards. It is
  readable, but still has a templated hero -> tool -> list rhythm. Severity:
  major.
- **Demo discoverability** — The golden demos are valuable product evidence,
  but they sit below the workflow and are visually undifferentiated. Severity:
  major.
- **No landing stamp** — The landing page has no structural/system reference,
  and later edits can drift back to generic layouts. Severity: minor.
- **Token surface** — The page mixes Tailwind palette utilities with raw hex
  values. This is not the primary visual problem, but the landing polish should
  not add more inline values. Severity: minor.

## Design

Use an asymmetric, demo-first layout:

1. Keep a compact product hero with the existing brand, tagline, and product
   invariants. Do not invent metrics or testimonials.
2. Move the three golden demos above the URL workflow.
3. Treat the first demo as a featured example with a short excerpt-versus-change
   preview. Use two compact supporting examples below or beside it depending on
   viewport.
4. Keep the real URL input as the primary action after the demos. It must remain
   obvious and accessible, not hidden as a secondary link.
5. Preserve the paper, stone, and amber product language. Amber remains reserved
   for change relationships. Do not introduce new motion dependencies.
6. Continue to label the demos as synthetic curated data. No demo may masquerade
   as a live Zhihu capture.

## Slices

1. **Landing structure**
   - Extract the demo entries into a focused landing component.
   - Reorder home sections so demos follow the compact hero and precede the URL
     workflow.
   - Give the first demo more visual and informational weight than the other two.

2. **Visual system**
   - Reuse the existing Tailwind palette and typography. Do not introduce a new
     dependency, font, or palette.
   - Use stable dimensions, constrained text, and non-overlapping responsive
     layout.
   - Keep interactive states explicit: default, hover, focus-visible, disabled,
     and active.

3. **Copy and accessibility**
   - Keep all copy factual. Demo previews must show real fixture content and
     evidence provenance.
   - Preserve heading order, link semantics, and keyboard focus visibility.
   - Do not replace the original answer, imply the author was wrong, or expose
     a proposed replacement body.

4. **Tests and verification**
   - Update route/component tests for the new section order and featured/compact
     structure.
   - Run `vp check`, `vp test`, and `vp build`.
   - Browser-check the home page at 320, 375, 414, 768, and 1440 px with no
     horizontal overflow and no text overlap.

## Non-goals

- No new golden demo content.
- No changes to golden-demo read route behavior.
- No real evidence retrieval, persistence, deployment, or PR.
- No new motion library or decorative imagery.

## Done condition

Ticket 14 is done when the first screen clearly introduces the product through
three golden demos, the URL workflow remains primary, all verification commands
pass, and the responsive layout is clean from 320px through desktop.
