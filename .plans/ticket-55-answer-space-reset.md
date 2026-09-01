# Ticket 55 — Answer Space Reset

## Problem

The current `/` page still leads with marketing language and a URL/search mode
toggle. That works for the person who already has a Zhihu answer URL, but it
does not help a first-time reader choose a question, see a maintained record,
or understand why an answer cannot be resolved. An unmatched URL can produce an
honest dead end, but the page does not visibly offer the strongest next action:
search the question or enter a prepared record.

The product needs two different surfaces:

1. `/` is the working Answer Space. It is search-first, answer-card-first, and
   shows prepared or maintained records that can be opened immediately.
2. `/landing` is the separate proof story. It explains the product, shows the
   same ledger language, and sends readers into the working space.

This is not a clone of Zhihu. It is a reading and maintenance surface that uses
question-oriented entry patterns while keeping Living Answer's evidence
boundary.

## Product design

### Answer Space (`/`)

The first screen must contain:

- A compact working header, not a marketing hero.
- A prominent search input as the default entry.
- A small row of starter questions that run real Zhihu searches.
- A directly readable set of prepared Golden Demo records.
- A "recently maintained answers" feed when local records exist.
- A collapsed advanced URL entry for users who already have an answer link.

The search flow remains real:

1. Search a question through `searchAnswerCandidates`.
2. Show valid answer cards with author, edit time, maintenance status, and
   preview.
3. Select a card and enter its answer read page only when its excerpt is
   available.
4. If no candidate is found, show an honest empty state and suggest a more
   specific question; never invent a result.

The URL flow remains precise but secondary:

1. The URL field is not hidden from users who need it, but it is not the first
   visual action.
2. A recognized URL that cannot resolve through the excerpt provider must show:
   - the parsed Zhihu question and answer IDs,
   - why the provider could not return it,
   - a direct external link to the Zhihu source,
   - a one-click switch to question search,
   - prepared records as fallback examples.

No failed URL should become an empty page, a silent reset, or a fabricated
answer.

### Landing (`/landing`)

The landing page is not a working form. It is a narrative proof page:

1. Statement: old answers can remain useful when today's changed premises are
   made explicit.
2. Featured proof record.
3. Three compact proof records.
4. Four-step workflow: capture excerpt, identify premises, retrieve evidence,
   create a reviewable record.
5. Boundary rules: preserve the author, require evidence, do not replace the
   original, do not imply the author was wrong.
6. Primary CTA: enter the Answer Space.

## Visual language

Keep the Revision Desk system:

- Paper surfaces, 1px rules, square geometry, restrained shadows.
- Black panels are reserved for the Landing statement and Answer Space header.
- Blue is for the default search action and links.
- Vermilion is only for UPDATE/CORRECTION/dispute signals.
- The Answer Space uses the working scale, not display-scale hero typography.

`design.md` should describe the dual IA instead of describing `/` as a
marketing landing page.

## Implementation scope

1. Add `/landing` as a separate route.
2. Move the marketing hero statement, featured proof, proof ledger, and closing
   story from `/` into `/landing`.
3. Refactor `/` into the Answer Space:
   - search-first header,
   - starter question chips,
   - search result list,
   - prepared Golden Demo records,
   - recently maintained answers,
   - advanced URL entry,
   - result and fallback workspace.
4. Update global navigation so the working space and product story are both
   discoverable.
5. Preserve the existing analysis workspace for URL-triggered excerpt runs.
6. Preserve search persistence, quota behavior, and read-page routing.
7. Add focused structural tests for the Answer Space entry hierarchy and
   fallback language.

## Non-goals

- No full Zhihu body ingestion.
- No change to AI workflow internals or evidence gating.
- No authentication, deployment, or eval work.
- No browser extension.
- No fabricated recommendations or fake success states.

## Acceptance

- `/` reads as a working question space, not as a marketing hero.
- A first-time visitor can click a starter question and reach a maintained
  reading path without needing to know a URL.
- Search results remain honest, persistent, and route directly to read pages.
- An unmatched URL still shows a useful external-source action and the
  strongest next step.
- `/landing` tells the product story without being the working entry form.
- Navigation exposes both surfaces.
- Desktop and 320px mobile have no horizontal scroll.
- `vp check --fix`, `vp test --run`, and `vp build` pass.

## Claude Code execution notes

- Keep code style consistent with the existing route.
- Do not split this into speculative architecture. Reuse the current local
  state in `/` unless a concrete behavior requires a new server function.
- Do not add a query cache or persistence schema in this ticket.
- Do not alter provider request behavior or quota behavior.
- Keep Chinese UI copy concise and factual.
