# Ticket 27 — Real-source golden demos

Status: pending
Issue: #37

## Goal

Upgrade the three golden demos from fully synthetic provenance to
real-source provenance: real Zhihu question/answer URLs and IDs, real author
display names, and curated read bodies grounded in the real answers' subject
matter — without claiming live ingestion and without inventing a full-answer
capture path.

## Constraints (from AGENTS.md and Spike 01)

- No live Zhihu capture claim. The official API has no full-answer path.
- A summary/excerpt must never be stored as `AnswerSnapshot.body`. The read
  bodies stay manually curated text; provenance describes where the curation
  came from.
- `AnswerSnapshot` / `PatchRevision` remain immutable historical records.
- Preserve author respect; patches stay `UPDATE`-framed.

## Real sources (verified via Zhihu search API summaries)

1. chatgpt-free-plus
   - URL: https://www.zhihu.com/question/655951342/answer/3498259423
   - questionId 655951342, answerId 3498259423
   - author: chengxd 达达
   - question: 为什么 OpenAI 突然把 GPT-4o 免费了?
   - searchEditTime 1715679954 (2024-05-14)
2. create-react-app
   - URL: https://www.zhihu.com/question/265479404/answer/1932577682752767964
   - questionId 265479404, answerId 1932577682752767964
   - author: 空山新雨后
   - question: 怎么学习React?
   - searchEditTime 1753544170 (2025-07-26)
3. delayed-retirement
   - URL: https://www.zhihu.com/question/8433630300/answer/69130072250
   - questionId 8433630300, answerId 69130072250
   - author: 北海皆非
   - question: 《实施弹性退休制度暂行办法》发布…哪些内容值得关注?
   - searchEditTime 1735722820 (2025-01-01)

## Implementation steps

1. Extend `GoldenDemoFixture` with a `source` block:
   `{ url, questionId, answerId, authorDisplayName, questionTitle,
sourceKind: "curated-from-search-summary", capturedAt }`. Keep
   `syntheticAuthor` as a derived presentation alias (initials + display name)
   so existing components keep working; display name now comes from the real
   author.
2. Point each fixture's `snapshot` identity (questionId/answerId) at the real
   IDs and set `capturedAt` from `searchEditTime` (ms). Recompute fingerprints
   implicitly via `createAnswerSnapshot`.
3. Update `provenance.note` to state: curated read body derived from the real
   Zhihu answer's public search summary; not a live capture; no full body
   stored.
4. Update `AnswerHeader` to link the canonical Zhihu URL and show the real
   question title; keep the author-respect framing.
5. Update tests: `golden-demo-fixture.test.ts` (synthetic-author assertions →
   real-source assertions), `landing-structure.test.ts` (line ~121), and any
   `read-presentation.test.ts` fixtures that construct fixtures by hand.
6. Keep the existing evidence URLs; optionally add the OpenAI help-center
   consumer-access URL to the ChatGPT fixture evidence.

## Verification

- `vp check --fix`, `vp test --run`, `vp build`
- Live routes on the dev server: all three `/read/golden-demo/$id` pages show
  real author, real question title, and a working Zhihu link.

## Out of scope

- Live ingestion, persistence, network adapters (needs approved ticket).
- UI polish pass (deferred per user).
