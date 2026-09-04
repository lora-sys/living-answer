# Golden Eval Harness

This folder evaluates the real product workflow, not mocked UI text.

## Frozen datasets

Two versions exist, both immutable:

| Version   | File                       | Cases | Notes                                                         |
| --------- | -------------------------- | ----: | ------------------------------------------------------------- |
| golden-v1 | `datasets/golden-v1.jsonl` |   264 | Original frozen baseline                                      |
| golden-v2 | `datasets/golden-v2.jsonl` |   264 | Additive on v1: 62 cases gain `mustIncludeAny` synonym groups |

Each version has a manifest recording the SHA-256 hash, count, and freeze policy.
Cases are immutable. To evolve coverage, create `golden-v3.jsonl` and a new
manifest; never rewrite an existing dataset.

Select via `EVAL_DATASET`:

```bash
EVAL_DATASET=golden-v2.jsonl pnpm eval   # default is golden-v1.jsonl
```

### golden-v2 changes from golden-v1

Additive only — every v1 `mustInclude` assertion is preserved verbatim.
62 cases gain `mustIncludeAny` groups for concepts the live endpoint shows
are described under more than one standard wording (e.g. 服务端组件 vs 服务器组件,
查询计划 vs 执行计划). This addresses a measurement error where substring
scoring under-counted concept coverage.

## Categories

| Category         | Cases | Purpose                                                |
| ---------------- | ----: | ------------------------------------------------------ |
| `rag_qa`         |    96 | End-to-end question to evidence-backed learning thread |
| `tool_call`      |    48 | Clarify, search, rank, select, generate, read, agent   |
| `multi_turn`     |    48 | Two- and three-turn follow-up behavior                 |
| `bug_regression` |    36 | Regressions observed during real use                   |
| `adversarial`    |    36 | Injection, garbage input, unsafe requests, overflow    |

## Commands

Offline integrity and unit checks:

```bash
vp test
```

Run a bounded real sample:

```bash
EVAL_LIMIT=3 EVAL_OFFSET=0 pnpm eval
```

Useful controls:

- `EVAL_LIMIT`: number of cases to execute.
- `EVAL_OFFSET`: dataset offset for repeatable sampling.
- `EVAL_STRIDE`: select every Nth case (for stratified samples that cover all
  topic families without bias toward the first topics in each category).
- `EVAL_DATASET`: `golden-v1.jsonl` (default) or `golden-v2.jsonl`.
- `EVAL_CATEGORY`: `rag_qa`, `tool_call`, `multi_turn`, `bug_regression`, or `adversarial`.
- `EVAL_FILTER`: substring match on case ID or title.
- `EVAL_JUDGE=false`: skip the LLM judge for a cheap structural run.
- `EVAL_QUOTA_LIMIT`: provider quota ceiling for this eval database.
- `EVAL_TIMEOUT_MS`: harness timeout (default 4 hours for full sweeps).

The environment must provide server-only `OPENAI_API_KEY`, `OPENAI_BASE_URL`,
`OPENAI_MODEL`, and `ZHIHU_ACCESS_SECRET`.

## Known data boundaries

The official Zhihu open API returns summary-class `ContentText` (~1000 chars
per item), with no full-body endpoint, no pagination (`Count` max 10,
`HasMore` always false). Concepts that only appear deep inside a body are not
retrievable. This is a hard ceiling: RAG cases expecting such concepts will
honestly report `must_include_absent` rather than fabricate coverage.

Evidence sources include both Zhihu answers and column articles
(`sourceContentType: "Answer" | "Article"`). Articles are not attached to a
question (`questionId` may be empty for that kind) and use the
`zhuanlan.zhihu.com/p/<id>` URL shape.

## Latest real results (1/4 stratified sample, golden-v2)

| Category       |   Pass / Total    |
| -------------- | :---------------: |
| adversarial    |       8 / 9       |
| bug_regression |       0 / 9       |
| tool_call      |      2 / 12       |
| multi_turn     |      1 / 12       |
| rag_qa         |      2 / 24       |
| **Total**      | **13 / 66 (20%)** |

Primary remaining gap: `must_include_absent` — concepts that only appear deep
inside Zhihu answer bodies and are not reachable from summary-class excerpts.

## Trace and report

Each case writes:

```text
.local/evals/traces/<runId>-<caseId>.json
.local/evals/reports/<runId>-cases.json
.local/evals/reports/<runId>-summary.json
.local/evals/reports/<runId>-comparison.json
```

A trace records the observable workflow: tool input, tool output, provider
error, duration, retry attempts, dispatched query forms, rejection reasons,
selected answers, final thread ID, agent output, evidence references, and
judge verdict.

## Dashboard

`/evals` renders the local reports as a product dashboard. It provides run
selection, quality summary, baseline delta, category/difficulty coverage,
quality metrics, failure map, case filters, and a full trace inspector. The
page reads only validated summaries, case lists, comparisons, and selected
trace JSON through a server boundary; filesystem paths and provider errors are
not exposed.

## Scoring

Every case receives:

1. Dead rules: expected tools, valid flow, source count, open questions, exact
   evidence substring check, secret leak, prompt-injection obedience, timeout.
2. Term similarity: expected concepts versus observable agent/thread output.
3. LLM judge: strict JSON with score, verdict, hallucination, evidence, and
   completion flags.
4. Concept coverage split: missed concepts are classified (post-scoring) as
   synonym-covered vs real gap, recorded as `conceptSynonymCovered` /
   `conceptRealGap` metrics. This diagnostic does not affect pass/fail.
5. Guardrails: hard evidence/safety failures cannot be flipped to pass by the
   judge. Missing judge output becomes an observable limitation, not a pass.

Final statuses are `pass`, `weak`, or `fail`. Reports include overall success,
category success, difficulty success, tool failure counts, hallucinations,
format errors, timeouts, injection successes, and agent gap rate. Repeated
runs compare against the latest previous summary and explicitly list
regressions and improvements.
