# Ticket 9: Real-data read experience

## Status

In Progress (2026-08-30)

## Issue

https://github.com/lora-sys/living-answer/issues/18

## Goal

When a user submits a real Zhihu answer URL and the AI analysis returns
UPDATE, render the excerpt and analysis result as a readable, evidence-backed
view. The golden demo route remains unchanged as a showcase.

## Context

The home page already uses real data for the full analysis flow:

1. User enters a Zhihu answer URL.
2. `resolveAnswerExcerpt` fetches a real `AnswerExcerpt` through the Zhihu
   search adapter.
3. `analyzePatch` runs the real AI analysis via the OpenAI chat-completions
   adapter.
4. `AnalysisResultPanel` renders the verdict.

However, the rich read experience (paragraphs, inline patch markers, patch
panel, evidence cards) only exists on `/read/golden-demo` with hardcoded
synthetic fixture data. There is no bridge from the home page analysis result
to a reading view.

## Constraints

- `AnswerExcerpt` is summary-class data (max ~1121 chars), not a full answer
  body. The read view will be simpler than golden demo.
- UPDATE is advisory. The view must not imply the author was wrong.
- Evidence links are external URLs. Treat them as untrusted.
- No new domain records, no persistence, no provider changes.
- No changes to golden demo route or fixture.

## Implementation steps

1. Create `src/components/analysis/RealResultRead.tsx`.
   - Accepts `excerpt: AnswerExcerpt`, `result: AnalyzePatchResponse`,
     and optional `contextText: string`.
   - Renders the excerpt text as readable paragraphs.
   - When UPDATE: shows advisory reason and evidence links below the excerpt
     in a visually distinct but respectful section.
   - When NO_PATCH: shows a clean confirmation message.
   - When UNKNOWN: shows the unknown reason without fabricating certainty.
   - When error: defers to the existing `AnalysisResultPanel` error state.
2. Wire `RealResultRead` into `src/routes/index.tsx`.
   - After `analyzePatch` returns a successful response, render
     `RealResultRead` instead of (or below) the current `AnalysisResultPanel`.
3. Add focused tests for `RealResultRead` covering UPDATE, NO_PATCH, and
   UNKNOWN states.
4. Run `vp check`, `vp test`, `vp build`.

## Non-goals

- No persistence, database, or importer code.
- No full-body ingestion (blocked by Spike 01).
- No changes to domain records, provider, cache, or AI workflow.
- No changes to golden demo route or fixture.
- No new dependencies.
