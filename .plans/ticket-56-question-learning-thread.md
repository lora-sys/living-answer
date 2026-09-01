# Ticket 56 - Question Learning Thread P0

## Decision

The product's first working surface is a Question Learning Thread, not an
answer-URL repair desk. A user enters a fuzzy question, clarifies the learning
intent, selects real Zhihu answer excerpts, and receives one durable public
learning artifact. The artifact arranges real sources as a readable timeline,
adds evidence-backed learning nodes, and lets the reader inspect every source
without pretending to have the full answer.

This supersedes the "Answer Space" wording in Ticket 55. Existing read routes
remain usable as advanced analysis paths, but `/` becomes the question-thread
entry.

## Routes

### `/`

- Large fuzzy question entry is the first action.
- A compact row of real starter questions provides immediate use.
- Clarification is separate from factual answering.
- Clarified queries lead to official Zhihu search results.
- Each result card shows title, author, edit time, excerpt preview, fingerprint,
  maintenance state where available, and canonical Zhihu link.
- The user selects candidates and runs `Generate learning thread`.
- Collapsed advanced URL entry may still open the existing real-answer analysis
  route, but it is not the primary product action.
- Empty, quota, rate-limit, AI-failure, and no-excerpt states must name the
  boundary and offer the strongest next action.

### `/thread/$threadId`

- The thread artifact is persisted in ignored `.local/thread-artifacts.db`.
- `threadId` is an opaque random ID. Regeneration creates a new immutable
  artifact; it does not overwrite the previous one.
- The route loads and strictly validates the stored artifact before render.
- Unknown or invalid IDs show an honest missing-artifact state, not a fake
  example.
- The page has a sticky question header, uncertainty summary, vertical timeline,
  evidence-backed learning nodes, source inspection, and share-link action.

The artifact store is a public archive, not personal history. No user account,
session identity, or personal collection is added in P0.

## Data Boundary

### Search

Reuse the official Zhihu search path and existing `AnswerExcerpt` validation.
Extend the JSON-safe candidate response so a selected candidate can be matched
to its stored excerpt fingerprint. The server persists valid excerpts in the
existing excerpt store. It never fabricates full-answer content and never
returns raw provider envelopes.

### Thread Artifact

Add a separate `QuestionLearningThread` domain record. It contains:

- `threadId`
- `question`
- `refinedQuery`
- `created_at`
- `timelineStages`, one per selected real answer
- `learningNodes`
- overall `uncertainty`

Each `TimelineStage` contains:

- answer/question IDs
- title
- author display name
- edit time
- canonical Zhihu URL
- the validated `AnswerExcerpt`
- explicit `This is an excerpt, not the full answer` language

Each `LearningNode` contains:

- kind: `relationship`, `cause`, `evolution`, `consensus`, `divergence`,
  `changed_premise`, or `unknown`
- title
- learning summary
- evidence refs that quote the validated excerpt
- source answer ID and canonical Zhihu URL
- uncertainty

The artifact may copy the excerpt into the thread store for rendering, but it
must never be stored as `AnswerSnapshot.body`. `PatchRevision` and maintenance
lifecycle are not required for P0.

### Thread Store

Create a SQLite-backed store in the existing local pattern:

- Path: `.local/thread-artifacts.db`
- Store immutable JSON artifacts keyed by opaque `threadId`
- Store an artifact fingerprint for display-only provenance
- Use dynamic Node imports so client bundling does not include SQLite
- Validate every row read from SQLite before it enters React
- No migration or dependency change unless `better-sqlite3` is already present

## AI Boundary

### Direct-answer adapter

Create a Zhihu direct-answer adapter behind a domain-neutral interface:

- `POST https://developer.zhihu.com/v1/chat/completions`
- `Authorization: Bearer <ZHIHU_ACCESS_SECRET>`
- `X-Request-Timestamp: <unix seconds>`
- Only `model`, `messages`, and `stream` are sent
- No temperature, tools, provider headers, raw bodies, or credentials enter UI
- Default models: `zhida-thinking-1p5` for clarification and synthesis; allow a
  server-side model override only if explicitly configured

### Stage 1 - Clarification

The clarifier receives only the user question and returns:

- one primary refined query
- up to three alternatives
- learning intent
- short guidance
- confidence

It may not answer the question, cite facts, invent Zhihu content, or describe a
model name. If clarification fails, `/` allows a raw-query Zhihu search.

### Stage 2 - Official Zhihu search

Search with the user-selected refined query or raw query. Return at most five
real answer candidates. No result must be fabricated or filled by an LLM.

### Stage 3 - Thread synthesis

The synthesizer receives only validated excerpts, metadata, and the clarified
question. It drafts nodes, but the workflow owns the final artifact:

- every learning summary must cite at least one selected excerpt
- every quote must be an exact substring of that validated excerpt after the
  project's normal whitespace normalization
- unsupported drafts become `unknown` nodes without a factual conclusion
- summaries use "the premise has changed", not "the author was wrong"
- source links must be canonical parsed Zhihu URLs
- model output with malformed citations, unknown answer IDs, or banned wording
  is rejected and mapped to a safe `ThreadSynthesisError`

A deterministic fallback may mark the selected answers as source timeline stages
without invented analysis. It must not present a fake AI interpretation.

## UI Composition

### Entry

Use the current Revision Desk system: paper surfaces, 1px rules, square
geometry, restrained shadow, compact working type. Do not use a nested card
cloud or marketing hero.

Recommended visual hierarchy:

1. `Start from a question` header and large input
2. starter-question chips
3. clarification panel
4. selected result workspace
5. generate action
6. advanced URL entry
7. existing prepared records as secondary proof

All result cards and learning nodes use stable heights and no layout shift on
loading. Actions remain at least 44px tall on mobile.

### Thread page

The thread reads like a study artifact, not a chat log:

- Question and refined query at the top.
- Overall uncertainty and artifact fingerprint in a quiet metadata strip.
- Timeline stages in edit-time order.
- Learning nodes in fixed order: relationship, causes, evolution, consensus,
  divergence, changed premise, unknown.
- Each timeline item can open a modal with source metadata, excerpt, canonical
  link, and the excerpt boundary label.
- Each learning node shows its evidence chips and links to the same modal.
- `changed_premise` and high uncertainty use vermilion only as revision/
  warning language.
- Copy share link and return to entry are always reachable.

Update `design.md`, `README.md`, and `CONTEXT.md` from the repair-desk product
to the Question Learning Thread product. Do not introduce fake metrics,
testimonials, or generated examples that are not real artifacts.

## Landing

Keep `/landing` as the product story, but rewrite it around the question-thread
flow. It may continue to use verified Golden Demo proof records, but it must not
present them as live question threads. The primary call to action sends readers
to `/`.

## Notion

Notion update is currently blocked because the CLI has no auth token. Do not
block implementation on Notion. Local product documentation must be updated now;
Notion backfill remains an explicit follow-up after `ntn login`.

## Execution Slices

1. Define `QuestionLearningThread`, validation, ordering, canonical URL, and
   fingerprint helpers.
2. Implement the thread artifact SQLite store.
3. Extend official search candidates with excerpt fingerprints and safe
   persistence behavior.
4. Add the direct-answer adapter.
5. Add clarification and synthesis workflows with strict JSON containment.
6. Add `/thread/$threadId` route and components.
7. Rework `/` into the question-thread entry while preserving advanced read
   routes and honest fallbacks.
8. Update navigation, landing copy, design doc, README, and context.
9. Clean stale `.plans/ticket-*` docs after the new implementation is accepted.
   Keep `01-answer-ingestion.md` and all `spike-01-*` facts.

## Tests

Required focused coverage:

- thread schema validation and ordering
- excerpt fingerprint matching
- artifact store save/read/invalid-row behavior
- search candidate persistence and JSON-safe mapping
- clarification output validation and failure fallback
- synthesis citation validation, unknown fallback, and author-respect wording
- entry form states
- candidate selection and generate action
- thread page valid/invalid/unknown states
- modal open/close and keyboard behavior
- navigation and landing CTA

## Acceptance

- `/` makes the fuzzy question entry immediately understandable.
- A user can clarify, search, select real excerpts, generate, and open one
  durable thread.
- No result state fabricates answers or hides a useful next action.
- Every analysis statement is evidence-cited or labeled `UNKNOWN`.
- Every source is labeled as an excerpt, with a canonical Zhihu link.
- The thread route survives a page reload and provides a shareable link.
- 320px and desktop layouts have no horizontal scroll.
- `vp check --fix`, `vp test --run`, and `vp build` pass.

## Hard Rules

- Do not run tests against real provider credentials.
- Do not print or commit credentials.
- Do not expose provider causes or raw payloads in responses.
- Do not read `process.env` outside server wiring.
- Do not add user identity, personal space, deployment, PR, or eval work.
- Do not claim a thread is a complete replacement for the original answer.
- Do not present model output as evidence.
