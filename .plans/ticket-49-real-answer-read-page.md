# Ticket 49 — Real answer read page

## Problem

The real analysis result is rendered inside the 900-line home route. A reader
cannot bookmark, share, return to, or cleanly finish the experience at a
dedicated answer page. The product therefore still reads like a workflow demo
rather than a learning artifact.

## Product shape

The P0 entry hierarchy is:

1. Search a question, where each valid answer candidate is immediately
   actionable.
2. Paste a Zhihu answer URL as a precise secondary entry.
3. Golden demos prove the reading language without replacing the real flow.

A browser extension and Zhihu-embedded page remain outside this ticket. The
immediate product is an honest reader workflow over summary-class Zhihu data.

## Scope

- Add a dedicated real-answer route at
  `/read/answer/$questionId/$answerId`.
- Add a JSON-safe server function that returns the stored excerpt and the
  current patch lifecycle for that answer.
- After a successful home-page analysis, navigate to the dedicated read page.
- Replace the post-analysis inline expansion with a compact completion state
  and explicit navigation.
- Make each search candidate a direct entry into its answer read page when its
  excerpt is already persisted; otherwise preserve the existing excerpt
  workflow.
- Add a low-density "recent maintained answers" section on the home page from
  existing patch lifecycle records, linking to the read page.
- Link change ledger records to their dedicated read pages.
- Normalize visible patch evidence to matched evidence; do not expose raw
  rejected retrieval candidates as product conclusions.
- Preserve golden demo routes and the design system.

## Read page states

The route must distinguish:

1. `excerpt + current lifecycle`: full reading view.
2. `excerpt only`: excerpt plus an explicit maintenance action.
3. `no excerpt`: honest fallback with the original Zhihu link and the home
   search/URL entry.
4. `store/server error`: stable, credential-free message.

The read page must clearly label the text as a search-summary excerpt, never
as the complete Zhihu answer body, and must link to the canonical original.

## Reuse constraints

- Do not add a new database, domain record, or persistence abstraction.
- Reuse `ExcerptStore.findLatest` and
  `PatchLifecycleStore.findCurrentByExcerptFingerprint` /
  `findHistoryByAnswer`.
- Keep writable state under ignored `.local/`.
- Treat stored provider text, model output, user input, and URLs as untrusted.
- Never expose credentials, headers, raw provider bodies, model names,
  confidence scores, internal workflow state, or `proposedBody`.
- Never store or display an excerpt as `AnswerSnapshot.body`.
- Preserve author respect: UPDATE is a world change, not proof the author was
  wrong.

## Component boundary

The existing `RealResultRead` should be generalized at the presentation layer:

- Accept excerpt plus either a live analysis response or a persisted lifecycle
  decision.
- Reuse the excerpt paragraph rendering, advisory view, lifecycle actions,
  history, and feedback panel.
- Keep server access and navigation in the route.

For a persisted non-UPDATE lifecycle record, reconstruct a JSON-safe advisory
decision from the immutable lifecycle record at the server boundary. Do not
mutate historical records.

For `excerpt only`, show the excerpt and a neutral action to begin maintenance.
Do not infer a patch.

## Tests and verification

- Unit test the server composition handler for:
  - excerpt plus lifecycle,
  - excerpt only,
  - missing excerpt,
  - excerpt-store failure,
  - lifecycle-store failure.
- Unit test the read presentation for UPDATE, NO_PATCH, UNKNOWN, disputed
  states, and evidence rendering.
- Test home navigation after successful analysis and search-candidate entry.
- Test that the change ledger links to the read route.
- Run `vp check --fix`, `vp test --run`, and `vp build`.
- Browser-smoke: URL analysis, search candidate, missing excerpt, read-page
  direct visit, and change-ledger link.
- Verify no horizontal overflow at 320, 375, 414, 768, and 1440px.

## Acceptance

1. A successful real analysis ends at a dedicated, shareable read URL.
2. The reader can return directly to an analyzed answer from the home page,
   search flow, and change ledger.
3. Missing excerpts and missing analyses are honest and actionable.
4. Visible evidence remains gated and source-linked.
5. Existing golden demos and all product invariants remain intact.

## Out of scope

- Browser extension or Zhihu page injection.
- Full answer body ingestion.
- User accounts, multi-user storage, remote database.
- Automatic batch review, notifications, eval changes, and deployment.
