# Design — Living Answer

Locked design system for all product surfaces. Future Hallmark runs and UI
changes read this file first. Do not introduce page-local colors, fonts, radii,
or shadows.

## System

- Genre · modern editorial product
- Theme · studied-DNA: warm paper base, black/orange hierarchy, hairline rules
- DNA source · public reference sites: cofounder.co, lineaprompt.com,
  senthora.ai
- Voice · calm, evidence-first, product-like; no decorative gradients

## Color Tokens

`src/styles.css` is canonical. Use semantic Tailwind tokens only.

```css
@theme {
  /* Background and surfaces */
  --color-paper: #f5f5f2;      /* page canvas */
  --color-paper-2: #fbfbf8;    /* raised panel / card / input */
  --color-paper-3: #ffffff;    /* optional high-contrast embedded surface */

  /* Text */
  --color-ink: #171717;        /* headings and primary body */
  --color-ink-subtle: #434343; /* secondary body */
  --color-muted: #666666;      /* supporting text */
  --color-faint: #8c8c8c;      /* timestamps and disabled labels only */

  /* Rules and chrome */
  --color-rule: #e3e3dc;       /* default hairline */
  --color-rule-strong: #d2d2ca;

  /* Orange accent */
  --color-accent: #ff6730;       /* filled controls and small marks */
  --color-accent-hover: #f05a22;
  --color-accent-active: #dd4a19;
  --color-accent-text: #d1501e;  /* links and text-level accent */
  --color-accent-soft: #fff1e9;
  --color-on-accent: #171717;    /* black on orange for contrast */

  /* Semantic status */
  --color-update: #b45309;
  --color-update-soft: #fff4e2;
  --color-success: #177245;
  --color-success-soft: #e9f6ee;
  --color-danger: #b42318;
  --color-danger-soft: #fdeceb;
  --color-info: #3b5bdb;
  --color-info-soft: #e8edfb;

  --color-focus: #ff6730;
}
```

### Usage

- Page background: `bg-paper`.
- Cards, inputs, panels: `bg-paper-2`; use `bg-paper-3` only inside a card when
  a nested surface needs more separation.
- Primary text: `text-ink`; secondary: `text-ink-subtle`; supporting:
  `text-muted`; timestamps: `text-faint`.
- Rules: `border-rule`; emphasized dividers: `border-rule-strong`.
- Accent is a small signal, not a large wash. Filled buttons, active markers,
  and short data highlights may use it. Large panels use `bg-paper-2`.
- Links: `text-accent-text`, hover `text-accent-active`.
- Forbidden: Tailwind `stone`, `amber`, `red`, `emerald`, `white`, raw hex,
  `rgb()`/`hsl()` values, and local one-off colors in `.tsx` files.

## Typography

```css
--font-sans: Inter, ui-sans-serif, system-ui, -apple-system,
  BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
```

Use `font-sans` as the base. Use `font-mono` for IDs, fingerprints, field codes,
timestamps in data rows, and compact operational labels. Do not add another
display face.

| Role | Mobile | Desktop | Weight | Line height | Tracking |
| --- | ---: | ---: | ---: | ---: | ---: |
| Display H1 | 38/44 | 54/58 | 600 | tight | -0.03em |
| Page H1 | 30/38 | 38/44 | 600 | tight | -0.03em |
| Section H2 | 24/32 | 30/36 | 600 | tight | -0.02em |
| Card H3 | 18/26 | 20/28 | 600 | normal | -0.01em |
| Body large | 16/28 | 17/30 | 400 | normal | 0 |
| Body | 15/26 | 16/28 | 400 | normal | 0 |
| Secondary | 14/22 | 14/22 | 400 | normal | 0 |
| Label | 12/16 | 12/16 | 500-600 | none | 0.06-0.08em |
| Mono data | 12/18 | 13/20 | 400-500 | normal | 0 |

Rules:

- Headings use `font-semibold` and the tracking values above. Never italicize
  headings.
- A section has one H1. Product copy favors sentence case.
- Use Chinese-first copy with concise Latin/product terms where appropriate.
- Do not center long prose; left-align editorial and result content.

## Spacing

Use a 4-pt scale. Keep spacing deliberate and uneven only where hierarchy needs
it.

| Context | Mobile | Desktop |
| --- | ---: | ---: |
| Page horizontal padding | 20px | 32px |
| Page top / bottom | 64px / 80px | 96px / 112px |
| Main content max width | 100% | 1120px |
| Narrow content max width | 100% | 880px |
| Section gap | 56px | 88px |
| Card to card gap | 16px | 24px |
| Card padding | 20px | 28-32px |
| Element gap | 8 / 12 / 16px | 12 / 16 / 24px |
| Label to value | 4px | 6px |

Rules:

- `main` uses a centered content shell. Do not let body copy exceed 720px.
- Dashboard-like card grids use `minmax(0, 1fr)` so Chinese text cannot force
  horizontal overflow.
- Panels need visible breathing room: never place text within less than 16px of
  a card border.
- Long strings use `break-words` / `min-w-0`; timestamps and labels may remain
  nowrap.

## Shape, Border, Shadow

```css
--radius-control: 8px;   /* segmented controls and compact controls */
--radius-input: 10px;
--radius-card: 14px;
--radius-panel: 18px;
--radius-pill: 999px;

--shadow-card:
  0 0 0 1px rgba(23, 23, 23, 0.04),
  0 1px 2px rgba(23, 23, 23, 0.04),
  0 16px 40px rgba(23, 23, 23, 0.05),
  inset 0 1px 0 rgba(255, 255, 255, 0.72);

--shadow-panel:
  0 0 0 1px rgba(23, 23, 23, 0.05),
  0 2px 4px rgba(23, 23, 23, 0.05),
  0 24px 64px rgba(23, 23, 23, 0.08),
  inset 0 1px 0 rgba(255, 255, 255, 0.8);

--shadow-pop:
  0 0 0 1px rgba(23, 23, 23, 0.06),
  0 8px 16px rgba(23, 23, 23, 0.08),
  0 32px 80px rgba(23, 23, 23, 0.12);
```

Tailwind mapping:

| Component | Classes |
| --- | --- |
| Standard card | `rounded-[14px] border border-rule bg-paper-2 shadow-[var(--shadow-card)]` |
| Large result panel | `rounded-[18px] border border-rule bg-paper-2 shadow-[var(--shadow-panel)]` |
| Popover / modal | `rounded-[18px] border border-rule bg-paper-2 shadow-[var(--shadow-pop)]` |
| Input / textarea | `rounded-[10px] border border-rule bg-paper-2` |
| Badge / tag | `rounded-full border border-rule bg-paper` |
| Compact segmented control | `rounded-[8px]` |

Do not use `rounded-3xl`, `rounded-[2rem]`, Tailwind `shadow-lg/xl/2xl`, or
`backdrop-blur` for ordinary cards.

## Navigation

- Sticky top navigation, height 64px.
- Background: `bg-paper/88` with `backdrop-blur-md`.
- Bottom border: `border-rule`; no vertical side borders.
- Logo / product name left; primary actions right.
- Desktop nav links: 14px, `text-ink-subtle`, hover `text-ink`.
- Active nav link: `text-ink` with a 2px accent underline offset by 8px.
- Mobile: 48px minimum target; use a disclosure menu rather than horizontal
  scroll.

## Buttons

All buttons use 44px minimum height on mobile and 40px on desktop, 6px/24px
horizontal padding, `font-semibold`, pill radius, and 180ms transition.

### Primary

```text
rounded-full bg-accent px-6 text-on-accent
hover:bg-accent-hover
active:bg-accent-active
focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus
disabled:cursor-not-allowed disabled:bg-rule disabled:text-faint
```

### Secondary

```text
rounded-full border border-rule bg-paper-2 px-6 text-ink
hover:border-accent/35 hover:bg-paper
active:translate-y-[1px]
focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus
disabled:cursor-not-allowed disabled:border-rule disabled:bg-paper disabled:text-faint
```

### Tertiary / link

```text
inline-flex items-center gap-1 text-sm font-medium text-accent-text
underline-offset-4 transition-colors hover:text-accent-active hover:underline
focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus
```

Destructive actions use `text-danger`, never a filled red button unless the
action is irreversible.

## Inputs

- Text inputs: `h-12 rounded-[10px] border border-rule bg-paper-2 px-4`.
- Textareas: `rounded-[10px] border border-rule bg-paper-2 p-4`.
- Placeholder: `text-faint`; label: 14px `text-ink-subtle`; helper: 13px
  `text-muted`.
- Hover: `border-rule-strong`.
- Focus: `border-accent` plus `ring-4 ring-accent/18`.
- Error: `border-danger` plus `ring-4 ring-danger/14`; error text is
  `text-danger`.
- Disabled: `bg-paper text-faint border-rule cursor-not-allowed`.
- Selected segmented item: `bg-ink text-paper`; unselected:
  `bg-paper-2 text-ink-subtle hover:text-ink`.

## Cards And Content Patterns

- Evidence card: paper-2 panel, 14px radius, hairline border, title 16/24
  600, quote 14/22 muted, source link accent-text.
- Result / analysis panel: 18px radius, 28-32px padding, status row first, then
  primary conclusion, then evidence.
- Update notice: `bg-update-soft border-update/28 text-update` for the status
  badge only; body text remains `text-ink-subtle`.
- Success / danger notices use their respective soft and normal tokens.
- Timeline: 8px dot, 1px `bg-rule` line, 24px card gap.
- Empty state: one 18/28 600 title, one secondary line, and at most one
  secondary action. No illustration required.
- Loading state: pulse an 8px accent dot, keep actual layout stable, and use
  `aria-live="polite"`.

## Interaction And Motion

- Duration: 160ms for hover/focus, 220ms for state/layout reveals.
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)`.
- Animate only `opacity` and `transform`; do not animate layout properties,
  shadows, or focus rings.
- Hover card lift: `hover:-translate-y-0.5`; active: `translate-y-[1px]`.
- Do not use bouncy easing, parallax, decorative gradients, or full-page scroll
  reveals.
- Focus ring appears instantly and has at least 3:1 visible contrast.
- Loading controls disable themselves and preserve their width.
- Async errors are inline, actionable, and use `role="alert"`.

## State Matrix

| State | Required treatment |
| --- | --- |
| Default | Semantic token style |
| Hover | Subtle background/border or text transition; no scale jump |
| Focus visible | 2px `outline-focus` ring, 2px offset |
| Active | One-pixel press or slightly deeper color |
| Disabled | Reduced contrast and no pointer affordance |
| Loading | Disabled control + accessible status + stable layout |
| Error | `danger` tokens, inline message, retry path when possible |
| Success | `success` tokens or quiet confirmation; no confetti/toast inflation |

## Layout Composition

- Landing flow: product promise -> primary dual-entry workflow -> three golden
  demos -> supporting routes/footer. Keep the first screen focused on usage.
- Workflow blocks use an asymmetric 12-column grid: workflow panel around 7
  columns, context/proof around 5 columns on desktop.
- Golden demos use three equal cards on desktop and one column on mobile; each
  card shows original premise, current change, and evidence count without
  hiding the demo boundary.
- Read view uses a single content column with a sticky patch rail only when
  viewport width permits both without compression.
- Sources / changes pages use the 880px narrow shell and one card per record.

## Verification

- No horizontal scroll at 320, 375, 414, 768, 1024, and 1440px.
- No style-level raw color literals in source files.
- Interactive controls expose hover, focus-visible, active, disabled, loading,
  error, and success behavior where applicable.
- Route screenshots must show one consistent paper system: same canvas, card
  surface, radius family, accent footprint, and heading rhythm.
