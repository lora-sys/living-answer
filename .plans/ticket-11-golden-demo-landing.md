# Ticket 11: Three Golden Demos and Landing Experience

## Goal

Make the home page explain Living Answer in 30 seconds and let a stranger enter the
product without reading documentation. Deliver three curated golden demos:

1. `chatgpt-free-plus` — current fixture.
2. `create-react-app` — old answer claims CRA is the standard way to start React.
3. `delayed-retirement` — old answer treats the old statutory retirement ages as a
   fixed current rule.

## Non-goals

- Do not add Changes or Sources views.
- Do not deploy.
- Do not change `resolveAnswerExcerpt`, `analyzePatch`, Effect workflows, or the
  persistence layer.
- Do not replace the paper/stone/terracotta visual language.

## Product decisions

- All visible patches must have accessible evidence. There is no `archive-required`
  or "source to be added" fixture in this ticket.
- Keep the original answer as the protagonist. The landing page demonstrates the
  reading model, it does not become a marketing page.
- Use the existing answer reading interaction; do not invent a second patch UI.

## Verified evidence

### Create React App

- React blog, 2025-02-14: `https://react.dev/blog/2025/02/14/sunsetting-create-react-app`
  - States React is deprecating Create React App.
- CRA README: `https://github.com/facebook/create-react-app`
  - Displays a `Deprecated` caution, calls the project long-term stasis, and says
    production apps should not start with CRA.
- React docs: `https://react.dev/learn/creating-a-react-app`
  - Recommends starting with full-stack frameworks and documents Next.js, React
    Router, and Expo as framework choices.

### Delayed retirement

- NPC decision republished by gov.cn, 2024-09-13:
  `https://www.gov.cn/yaowen/liebiao/202409/content_6974294.htm`
  - Adopted by the Standing Committee of the 14th NPC on 2024-09-13.
  - Effective from 2025-01-01.
  - Applies a 15-year transition.
  - Changes men from 60 to 63.
  - Changes women from 50 to 55 and from 55 to 58.
  - States the principles: small-step adjustment, flexible implementation,
    category-based advancement, and coordinated consideration.

## Implementation

1. Extend fixture metadata without changing the immutable snapshot/patch domain
   records:
   - Keep `GoldenDemoFixture` shape compatible.
   - Add a stable demo id, display title, topic label, and one-sentence description.
   - Export a list or map of three fixtures for the home page and parameter route.
2. Add a parameterized route for `/read/golden-demo/$id`.
   - Resolve one fixture by id.
   - Reuse `AnswerHeader`, `InlinePatchMarker`, and `PatchPanel`.
   - Render an unknown id as a normal not-found/error state; do not crash.
3. Preserve the current `/read/golden-demo` path as a redirect to the ChatGPT demo.
4. Rebuild the home page around three sections:
   - A restrained hero: product name, one-sentence promise, and concrete explanation
     of the current-reader use case.
   - Three golden demo entries with title, topic, and the change a reader should
     expect to see.
   - The URL-first entry flow for a real Zhihu answer.
5. Preserve the existing live excerpt/analysis states. Do not remove or visually
   bury the URL workflow.
6. Keep the landing page in the existing design system:
   - Paper background, stone text, and terracotta accent only for change relations
     or the primary action.
   - Large whitespace and readable editorial typography.
   - No chat-style panels, no AI SaaS gradients, no invented metrics.

## Tests

- Unit-test fixture lookup for all three ids and an unknown id.
- Route/link tests should cover:
  - home renders three demo entries,
  - each entry reaches a reader,
  - the legacy reader path redirects to the ChatGPT demo,
  - unknown demo id does not throw.
- Run `vp check`, `vp test`, and `vp build`.
- Manually verify no horizontal scroll at 320, 375, 414, and 768 px.

## Acceptance

- Home page communicates Search / URL → Read → Patch → Evidence without explanation
  from a developer.
- Three demos are reachable from the home page.
- Each visible patch has primary-source evidence.
- Original-answer copy remains the center of the reader experience.
