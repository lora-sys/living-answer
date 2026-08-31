# Ticket 15: P0 landing trust polish

## Why now

Ticket 14 made the landing demo-first. The next P0 gap is still real evidence
retrieval, but before adding another backend ticket, the public-facing surface
should explain the product with the same restraint as the domain: a reader
should understand what changes, why it matters, and why it is trustworthy
within one screen.

Public deployment is deliberately last. This ticket only improves the local
product surface and keeps the current URL workflow primary.

## Hallmark audit findings

- The current page is clean but still reads as a conventional
  hero -> featured card -> compact cards -> tool flow.
- Product invariants are present, but they are small secondary text rather
  than part of the visual argument.
- The featured demo and real URL workflow compete less clearly than they
  should: the visitor may not know whether to explore first or paste a URL.
- Raw color values are still scattered through JSX, so later pages can drift
  away from the paper/stone/amber system.

## Design intent

Use an evidence-led workbench layout, not a marketing hero.

1. Keep the headline left-aligned and factual. Add a compact primary action to
   the featured demo, while the real URL workflow remains the main action below
   the demos.
2. Make the featured demo read like a small case file: original premise, current
   change, impact, and evidence provenance are visually distinct.
3. Keep two supporting demos compact and clearly secondary.
4. Give the URL workflow a quieter, workbench-like section so it does not
   compete with the featured demo.
5. Preserve author respect: always frame the patch as an update, never as proof
   that the author was wrong.
6. Keep amber exclusively for change relationships.
7. Label all demos as synthetic curated data. Do not imply live Zhihu capture.

## Implementation slices

1. **Token baseline**
   - Extend the existing Tailwind theme with semantic paper, ink, muted, rule,
     accent, amber, and focus tokens.
   - Keep the existing global stylesheet append-only. Do not introduce a new
     dependency or motion library.
   - Replace landing-page raw color usage with semantic tokens.

2. **Landing structure**
   - Refine the current route in place.
   - Keep the order: compact product statement -> featured demo -> two
     supporting demos -> real URL workflow -> results.
   - Improve hierarchy with stable dimensions, constrained text, and clear
     spacing.
   - Add a one-line closing statement that repeats the product boundary without
     inventing metrics.

3. **Accessibility and states**
   - Preserve heading order and link semantics.
   - Keep visible focus states on every interactive element.
   - Keep primary button and link labels short enough to avoid wrapping at
     mobile widths.
   - Verify no text overlap or horizontal overflow at 320, 375, 414, 768, and
     1440 px.

4. **Tests and verification**
   - Keep structural tests for demo count, ordering, provenance, and absence of
     fake metrics.
   - Add only the smallest useful assertions for new copy or structural labels.
   - Run `vp check`, `vp test`, and `vp build`.
   - Browser-check the home page at all required widths.

## Non-goals

- No new golden demo content.
- No real evidence retrieval or storage changes.
- No public deployment or PR.
- No fake metrics, testimonials, avatars, or decorative imagery.
- No full visual rebuild of the read, changes, or sources pages.

## Done condition

The first screen communicates the product through one strong example and two
secondary examples, the real URL workflow remains obvious, colors use semantic
tokens, all verification commands pass, and responsive checks are clean from
320 px through desktop.
