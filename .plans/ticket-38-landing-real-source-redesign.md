# Ticket 38 — Landing real-source redesign (UI/UX phase 1)

## Problem

The landing page (`src/routes/index.tsx`) still labels the golden demos as
`合成数据` (3 locations) even though Ticket 27 grounded every demo in real
Zhihu sources. The read page already shows the honest framing
(`精选演示 · 从公开搜索摘要整理 · 非实时抓取`). The landing also buries the
product's core action (paste URL / search) below the demo section.

## Scope (design decided by the UI/UX owner)

1. **Truthful provenance labels.** Replace every `合成数据` label with the
   real-source framing consistent with the read page:
   - section intro: `真实知乎回答 · 从公开搜索摘要整理 · 非实时抓取`
   - featured card provenance: `精选演示 · 真实知乎来源`
   - compact cards: `真实来源` (the evidence line already shows org/type/date)
2. **Entry-first hierarchy.** Move the dual-entry section (paste URL /
   search question) ABOVE the golden-demos section. The core workflow is
   first-screen; demos become the secondary "先看示例" section below.
3. **Featured card polish.** Keep the amber `现在变化` band (strongest
   signal). Render evidence provenance as compact pills (org + type +
   year-month) instead of plain text rows. Keep all existing tokens
   (`text-muted`, `text-ink-subtle`, `bg-paper`, `border-rule`,
   `text-update-amber`, `text-accent`) — no new colors, no new fonts.
4. **No structural/API changes.** Copy and JSX order only; all handlers,
   state, routes, and a11y roles preserved. `aria` labels updated where the
   section order changes.

## Constraints

- No new dependencies. No new design tokens.
- Tailwind v4 tokens from `src/styles.css` only.
- All 829+ tests must stay green (`vp test --run`); update any test that
  asserts section order.
- `vp check` and `vp build` must pass.
- Do not touch `AnswerSnapshot`/`PatchRevision` boundaries or server code.

## Verification

- `vp check --fix`, `vp test --run`, `vp build`
- Playwright screenshots at 1440/768/375 widths of the reordered landing.
