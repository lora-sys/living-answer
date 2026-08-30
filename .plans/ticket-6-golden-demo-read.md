# Ticket 6 — Golden Demo Read Patch Slice

## Status

Planned (2026-08-30). Plan produced by `plan_agent`; implementation is assigned
to Claude Code `fable`.

## Context

Ticket 5 shipped the home URL form and the request/loading/error/success flow
over the verified server boundary. The next product-facing gap is the Read
experience: a reader must see an old answer as the primary surface and open a
curated patch beside it.

This ticket introduces one Golden Demo only. It uses a manually curated fixture
because the ingestion boundary still has no legal full-answer source. The
fixture must not pretend to be a live Zhihu capture. It may use
`createAnswerSnapshot` to preserve the immutable-record shape, but the wrapper
must mark it as a synthetic demo and it must not use a real Zhihu author or
answer identity.

The design follows the Notion UI/visual specs: neutral answer reading first,
amber only for the change relationship, light inline markers, and a panel that
explains the patch and evidence. AI and the existing Zhihu provider are out of
scope.

## Goal

Ship one Read route for a ChatGPT Free/Plus Golden Demo:

1. expose a quiet Golden Demo entry from the home route;
2. render a curated answer body with its synthetic metadata and provenance;
3. attach at least two `UPDATE` patches to specific paragraphs;
4. open a PatchPanel with original claim, current change, impact, `as_of`, and
   evidence;
5. show at least two real, browser-verified OpenAI primary-source links.

## Non-goals

- No database, persistence, importer, file storage, or server cache changes.
- No full-body ingestion or conversion of an excerpt into a live snapshot.
- No AI generation, provider calls, credential reads, or real Zhihu requests.
- No Changes/Sources routes, author feedback, review queue, recheck, or chat.
- No generic demo catalog beyond the single ChatGPT case.

## Architecture

### Data fixture

Create a dedicated `GoldenDemoFixture` in `src/lib/golden-demo-fixture.ts`.
It contains a `snapshot` created by `createAnswerSnapshot`, a provenance
block marked `curated-demo`, synthetic author metadata, paragraphs, and
patches. The fixture is a demo record, not a live capture or provider response.

Each patch has:

```ts
type GoldenDemoPatchType = "UPDATE" | "CORRECTION" | "CONDITION" | "BETTER_WAY";

interface GoldenDemoPatch {
  readonly id: string;
  readonly type: GoldenDemoPatchType;
  readonly originalExcerpt: string;
  readonly currentChange: string;
  readonly impact: string;
  readonly asOf: string;
  readonly evidence: readonly GoldenDemoEvidence[];
}
```

Each evidence card has title, organization, published date, supported fact,
source type, and URL. Use OpenAI primary sources only. The implementer must
open both URLs in a browser, verify the supported facts, and capture local
screenshots under `.local/evidence/`; if a URL is inaccessible, stop and report
rather than substituting a secondary source.

All fixture text is authored in Chinese and uses `UPDATE` language: the claim
held at its time, the relevant condition changed, and it does not say the
author was wrong.

### Presentation logic

Create `src/lib/read-presentation.ts` as a pure module:

- group patches by paragraph ID;
- build the freshness notice in the required form;
- format dates as `YYYY-MM-DD` without relying on runtime locale.

The desktop/mobile freshness notice is:

`这篇回答有 N 个关键前提已经变化 · 截至 YYYY-MM-DD`

### Routes and components

- `src/routes/read.golden-demo.tsx`: Read page assembly and metadata.
- `src/components/read/AnswerHeader.tsx`: synthetic author, vote count,
  dates, source-style note, and freshness notice.
- `src/components/read/InlinePatchMarker.tsx`: accessible `<button>` marker.
- `src/components/read/PatchPanel.tsx`: fixed panel structure.
- `src/components/read/EvidenceCard.tsx`: one primary source per card.

The marker exposes `aria-expanded` and `aria-controls`. Enter/Space opens it,
Escape closes it, and focus returns to the triggering marker. Multiple patches
on one paragraph aggregate into one `N changes` marker.

PatchPanel order is fixed:

1. type and impact;
2. original answer excerpt;
3. current change;
4. impact on the original answer;
5. `截至 YYYY-MM-DD`;
6. evidence list;
7. feedback entry disabled with a later-release note.

Desktop uses a right-side panel without hiding the affected paragraph. Mobile
uses a bottom panel capped near `70vh`, leaves visible reading context, and
keeps text from overflowing. Amber is limited to the patch relationship; the
answer body remains black or neutral gray.

## Implementation steps

1. **Fixture and pure presentation.** Add the curated ChatGPT Free/Plus
   fixture and presentation helpers with focused offline tests. Verify
   provenance, patch counts, grouping, evidence counts, and stable date/notice
   text.
2. **Read route skeleton.** Generate the `/read/golden-demo` route and render
   the header, answer body, paragraph anchors, and lightweight markers. At this
   step the route must be usable without the panel.
3. **Panel and evidence.** Implement the accessible PatchPanel and
   EvidenceCard, connect markers, support desktop/mobile layouts, and preserve
   focus return.
4. **Home entry and final polish.** Add a quiet Golden Demo entry, align
   spacing/focus/color across widths, and run the full verification matrix.

Steps 1-3 are the implementation slice for this ticket; step 4 completes it.

## File boundary

May add or modify:

```text
.plans/ticket-6-golden-demo-read.md
src/lib/golden-demo-fixture.ts
src/lib/golden-demo-fixture.test.ts
src/lib/read-presentation.ts
src/lib/read-presentation.test.ts
src/routes/read.golden-demo.tsx
src/routes/index.tsx
src/components/read/AnswerHeader.tsx
src/components/read/InlinePatchMarker.tsx
src/components/read/PatchPanel.tsx
src/components/read/EvidenceCard.tsx
src/routeTree.gen.ts
```

`src/routeTree.gen.ts` is generated by the toolchain, not hand edited. No
other files should change.

## Verification

Run from the repository root:

```sh
vp check
vp test
vp build
```

Focused tests must cover:

- fixture immutability and stable `AnswerSnapshot` fingerprint;
- `curated-demo` provenance and synthetic author/ID;
- paragraph grouping and multi-patch aggregation;
- exact freshness notice and `YYYY-MM-DD` formatting;
- panel field order and evidence-card content.

Browser evidence under `.local/evidence/` must include:

- desktop `1440x900` home entry, Read route, open panel, close panel;
- mobile `375x667` Read route, bottom panel, overflow check;
- keyboard Tab/Enter/Escape/focus-return path;
- screenshots of both OpenAI source pages or the concrete access blocker.

## Acceptance

- `vp check`, `vp test`, and `vp build` are green.
- `/read/golden-demo` renders the answer as the primary reading surface.
- Both patches are visible as light markers and open the required panel.
- Each panel shows at least two real OpenAI primary-source links.
- No AI/provider/network call is added and no credential is read.
- No fake live-capture language, real Zhihu author, or exaggerated Verified
  badge appears.
- Desktop and mobile layouts pass the browser checks above.

## Commit plan

1. `docs(plan): add golden demo read ticket`
2. `feat(read): add golden demo fixture`
3. `feat(read): add golden demo read page`
4. `feat(read): add patch panel and evidence cards`
5. `feat(home): add golden demo entry`
