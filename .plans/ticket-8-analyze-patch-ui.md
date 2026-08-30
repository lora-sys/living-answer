# Ticket 8 — Analyze-patch product UI

## Status

Approved (2026-08-30). Plan produced by `plan_agent`; implementation is
assigned to Claude Code `fable`.

## Context

Slices 1-4 established the immutable domain records, the OpenAI Effect
adapter, the patch-analysis workflow, and the JSON-safe TanStack Start server
boundary. The server accepts `{ url, context? }` and returns one of `UPDATE`,
`NO_PATCH`, `UNKNOWN`, or a typed error. For `UPDATE`, the response is advisory
only: `patchBodyStatus` is `"no-body-available"` and no proposed body is
exposed.

The current home route resolves an excerpt, but the analysis capability has no
user-facing flow. The Golden Demo remains synthetic and must not be converted
into a fake live capture.

## Recommendation

Extend the existing home excerpt flow instead of adding a route or modifying
the Golden Demo. After a successful excerpt, offer optional maintenance context
and an explicit analysis action. Render the analysis result in the same quiet,
reading-first visual language.

## User flow

1. The user submits a Zhihu answer URL and receives an excerpt.
2. The excerpt result reveals an optional context textarea and an
   `分析前提变化` action.
3. Submitting the action invokes `analyzePatch` and shows a lightweight
   analyzing state.
4. The UI renders exactly one current result:
   - `UPDATE`: advisory reason, evidence summary links, and a note that no
     replacement text is generated;
   - `NO_PATCH`: calm result saying no important premise change was found;
   - `UNKNOWN`: calm result explaining that evidence is insufficient or
     inconclusive;
   - error: the matching Chinese message from `failureMessage`.
5. A new excerpt request clears the previous analysis result.

## Product and UI rules

- Do not display model names, Agent names, confidence, tokens, logs, or
  internal workflow state.
- Do not imply that the original author was wrong. Use `UPDATE` language.
- Amber is reserved for the change relationship; `NO_PATCH` and `UNKNOWN` use
  neutral stone styling.
- Treat model output and provider payloads as untrusted presentation data.
- Keep the component presentation-only. State and server binding belong to the
  route.
- Interactive controls must have coherent default, hover, focus, active,
  disabled, loading, error, and success semantics.
- Verify mobile widths 320, 375, 414, and 768; no horizontal scrolling is
  allowed.
- Do not expand the decorative gradient or redesign the product.

## Implementation steps

1. Add a pure `AnalysisResultPanel` presentation component under
   `src/components/analysis/`.
2. Add offline component tests for every result state and the key failure
   states, asserting that no proposed body is rendered.
3. Extend `src/routes/index.tsx` with analysis state, optional context input,
   the analysis action, server-function binding, stale-result clearing, and
   result rendering.
4. Run a focused Hallmark pass on the new states: preserve the paper/neutral
   voice, keep amber limited to `UPDATE`, and verify text remains legible and
   non-overflowing.
5. Run the full verification matrix.

## File boundary

May add or modify:

```text
.plans/ticket-8-analyze-patch-ui.md
src/components/analysis/AnalysisResultPanel.tsx
src/components/analysis/AnalysisResultPanel.test.tsx
src/routes/index.tsx
```

Do not modify server boundaries, domain records, Golden Demo components, or
fixture data.

## Verification

Run:

```sh
vp check
vp test
vp build
```

Additional browser checks:

- successful excerpt followed by `UPDATE`, `NO_PATCH`, and `UNKNOWN`
  presentation paths;
- typed failure presentation;
- retry and stale-result clearing;
- desktop and mobile layouts;
- no horizontal overflow at 320/375/414/768;
- focus visibility and disabled/loading behavior.

## Acceptance

- `vp check`, `vp test`, and `vp build` are green.
- The user can trigger analysis after a successful excerpt.
- Every response type maps to a clear UI outcome.
- `UPDATE` never renders `proposedBody` or replacement answer text.
- No credentials are read in component or test code.
- No persistence, provider call in tests, or Golden Demo change is introduced.
- Browser evidence records the desktop and mobile flows under `.local/`.
