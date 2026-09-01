# Design — Revision Desk

Living Answer is not a generic article site. It is a controlled repair desk for
old answers: the original author remains intact, while the UI marks what the
world has changed since. The interface should feel like a precision instrument
and a public archive at the same time.

This system replaces the previous visual system. Do not preserve the old warm
orange landing language.

## 1. Product attitude

- The page reads like a public record, not marketing.
- The old answer is the stable artifact; patches are explicit interventions.
- Evidence is never decoration. Every color signal has a meaning.
- The hero must answer three things in ten seconds: what is repaired, why it is
  trustworthy, and where the user starts.
- Product copy is short, factual, and Chinese-first. Latin product names may use
  the display font.

## 2. Color

`src/styles.css` owns tokens. Components consume semantic Tailwind token names,
never raw hex values.

```css
@theme {
  --color-paper: #f0f0ea;
  --color-paper-2: #f8f8f4;
  --color-paper-3: #ffffff;

  --color-ink: #101413;
  --color-ink-subtle: #3d4340;
  --color-muted: #646a66;
  --color-faint: #878d89;

  --color-rule: #d8d9cf;
  --color-rule-strong: #b9bab1;

  /* Source blue is the sole action color. */
  --color-accent: #1746ff;
  --color-accent-hover: #0c2fd2;
  --color-accent-active: #08249f;
  --color-accent-text: #1640da;
  --color-accent-soft: #e8edff;
  --color-on-accent: #ffffff;

  /* Vermilion is reserved for revision, dispute, and correction. */
  --color-update: #c6271a;
  --color-update-soft: #fbeae7;
  --color-success: #0d6b52;
  --color-success-soft: #e6f2ec;
  --color-danger: #b42318;
  --color-danger-soft: #fdeceb;
  --color-info: #274b8f;
  --color-info-soft: #e8edfb;

  --color-focus: #1746ff;
}
```

Usage:

- Page background is `bg-paper`; raised evidence surfaces are `bg-paper-2`.
- Use `bg-paper-3` only for a small card inside a larger panel.
- Blue is for primary action, active state, link, and selected input focus.
- Vermilion is for UPDATE/CORRECTION and dispute states only. It is a warning,
  not the brand accent.
- Black panels may be used for the hero and primary result header only. They
  create the sense that the original answer is the fixed artifact.

## 3. Type

Use a three-voice system:

```css
--font-display: "Instrument Serif", "Noto Serif SC", "Songti SC", "SimSun", serif;
--font-sans: Inter, "Noto Sans SC", ui-sans-serif, system-ui, "Segoe UI", sans-serif;
--font-mono: "JetBrains Mono", "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;
```

| Role          | Type    | Mobile | Desktop | Notes                                                       |
| ------------- | ------- | -----: | ------: | ----------------------------------------------------------- |
| Display       | display |  44/48 |   78/82 | For the home H1 and major page statements only. Weight 400. |
| Page title    | display |  32/38 |   52/56 | For a section-defining page title.                          |
| Section title | sans    |  20/28 |   26/34 | Weight 650, tracking `-0.02em`.                             |
| Card title    | sans    |  17/26 |   19/28 | Weight 650.                                                 |
| Body          | sans    |  15/27 |   16/29 | Weight 420-450.                                             |
| Metadata      | mono    |  11/17 |   12/19 | IDs, dates, source fingerprints, coordinates.               |

Rules:

- Display text is sentence case, never italic.
- Mono text can be uppercase only for short labels under twelve characters.
- Do not use display font for buttons or input values.
- Long Chinese paragraphs use a max width of 68 characters.

## 4. Structure

- Page shell uses a centered 1120px working area, with 20px mobile padding and
  32px desktop padding.
- Landing order: fixed nav → black hero with integrated entry → three proof
  patches → workflow explanation → public archive footer.
- The hero is not a text-only banner. It contains the URL/search entry and one
  featured patch proof.
- Cards use square geometry. No rounded 2xl, no floating card-clouds.
- A patch record is a ledger row, not a generic product card: index, status,
  original premise, revision, source.

## 5. Shape, rules, shadow

```css
--radius-control: 6px;
--radius-input: 4px;
--radius-card: 2px;
--radius-panel: 4px;

--shadow-flat: 0 0 0 1px var(--color-rule);
--shadow-card: 0 1px 0 var(--color-rule-strong), 0 18px 40px rgb(16 20 19 / 0.06);
--shadow-panel: 0 1px 0 var(--color-rule-strong), 0 32px 72px rgb(16 20 19 / 0.1);
```

Cards and panels use 1px hard rules. Shadows are subtle and never colored.
Ordinary UI never uses Tailwind `shadow-lg`, `shadow-xl`, `rounded-3xl`, or
`backdrop-blur`.

## 6. Components

### Navigation

- Height 64px, bottom rule only.
- Left: `LIVING ANSWER` in mono, letter-spacing `.18em`.
- Right: `时间线` and `来源`.
- Active link has a 2px blue underline, not a pill background.
- Mobile links are full-height rows in a white sheet with a 1px top rule.

### Primary button

```text
h-12 rounded-[6px] bg-accent px-5 text-sm font-semibold text-on-accent
hover:bg-accent-hover active:bg-accent-active
focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus
```

Use one primary action per visual region. Secondary buttons are bordered, not
filled.

### Input / search

- Height 56px on the landing hero; 44px elsewhere.
- Square-corner 4px radius.
- Label sits above the field in mono.
- On focus: 2px blue border plus a 3px outer ring using 18% accent.
- Never hide validation inside a tooltip.

### Patch proof

The main proof record has three columns on desktop and stacked rows on mobile:

1. `原文前提` — paper background, black text, fixed artifact.
2. `现在变化` — vermilion top rule, neutral body text.
3. `证据` — source name, publication month, and external link.

The metadata strip uses mono text and always shows `UPDATE / date / source
count`. Do not turn evidence into decorative badges.

### Status

- `UPDATE`, `CORRECTION`, `DISPUTED`: vermilion signal.
- `NO_PATCH`: neutral black on paper.
- `UNKNOWN`: blue information signal.
- `VISIBLE`: success green.
- Loading uses a 10px accent dot and preserves layout height.

## 7. Motion

- 150ms for hover and focus; 220ms for reveal.
- Easing: `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Cards do not lift. Their top rule changes from rule-strong to accent.
- Buttons may translate down 1px on active.
- Respect `prefers-reduced-motion`.

## 8. Responsive floor

- No horizontal scroll at 320, 375, 768, and 1440px.
- Every action has a 44px minimum target.
- Grid tracks that contain text use `minmax(0, 1fr)`.
- Metadata can wrap, but buttons and nav labels do not wrap to two lines.

## 9. Implementation slices

1. Token reset: colors, fonts, radii, shadows, body background, nav.
2. Landing reset: black hero, integrated entry, proof ledger, archive footer.
3. Read reset: same patch language, stronger source strip, sticky evidence.
4. Lifecycle/sources/changes reset into ledger tables and timeline records.
5. Final polish: focus, empty states, loading, error, and motion.

Each slice must preserve tests, product invariants, and honest failure states.
