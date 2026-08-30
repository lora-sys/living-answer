# Ticket 12: Home-page UX Realignment

Issue: https://github.com/lora-sys/living-answer/issues/21

## Goal

Make the real-answer workflow the first action on the home page while keeping the
paper/stone/terracotta reading system and three golden demos.

## Context

Ticket 11 added the three demos and the real URL workflow, but the demos render
above the paste-URL flow. The Notion red-team review makes URL-first checking the
narrower product identity: the user is checking an old answer they are already
reading, not searching from scratch.

## Scope

- Reorder the home page to `hero -> paste URL -> golden demos`.
- Keep the hero product promise and boundary statement unchanged.
- Make the real-link section heading action-oriented.
- Add one short expectation line after the action.
- Audit rendered copy for development metadata.

## Implementation

1. In `src/routes/index.tsx`, move the URL workflow section above the golden
   demo section. Preserve all existing handlers, states, and route behavior.
2. Rename `用真实链接体验` to `粘贴一个知乎回答链接`.
3. Add a quiet hint below the submit action: `粘贴后点击获取摘录，查看该回答的前提是否已变化。`
4. Keep all failure, loading, excerpt, and analysis states unchanged.
5. Do not introduce new dependencies, routes, providers, AI behavior, or persistence.

## Verification

- `vp check`
- `vp test`
- `vp build`
- Browser render at 320, 375, 414, 768, and 1440 px
- No horizontal overflow
- URL form appears before demos at every tested width

## Non-goals

- No deployment changes.
- No new landing-page sections.
- No invented metrics or testimonials.
- No full-answer reader from the summary-class excerpt.
- No redesign of golden demo pages.
