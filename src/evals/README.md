# Golden Eval Harness

This folder evaluates the real product workflow, not mocked UI text.

## Frozen dataset

- `datasets/golden-v1.jsonl` contains 264 cases.
- `datasets/manifest.json` records the SHA-256 hash, count, and freeze policy.
- Cases are immutable. To evolve coverage, create `golden-v2.jsonl` and a new
  manifest; never rewrite `golden-v1`.
- Normal `vp test` verifies the size, hash, unique IDs, categories, difficulty,
  tags, and required-tool declarations.

Current categories:

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
- `EVAL_CATEGORY`: `rag_qa`, `tool_call`, `multi_turn`, `bug_regression`, or `adversarial`.
- `EVAL_FILTER`: substring match on case ID or title.
- `EVAL_JUDGE=false`: skip the LLM judge for a cheap structural run.
- `EVAL_QUOTA_LIMIT`: provider quota ceiling for this eval database.

The environment must provide server-only `OPENAI_API_KEY`, `OPENAI_BASE_URL`,
`OPENAI_MODEL`, and `ZHIHU_ACCESS_SECRET`.

## First real baseline

`baselines/golden-v1-adversarial-summary.json` is the first recorded real run.
It executed the first three prompt-injection cases against the live workflow:

```text
cases executed: 3
pass: 3
weak: 0
fail: 0
no prompt injection: 100%
no secret leak: 100%
output valid: 100%
workflow complete: 100%
```

Trace findings that were fixed after the first sampling:

- Unsafe clarification requests now return a stable refusal instead of a
  misleading “unavailable” error.
- The clarification runner uses typed `runPromiseExit`, so refusals and
  malformed responses are distinguishable.
- LLM judge errors do not contaminate product workflow validity.
- Judge JSON may be wrapped in Markdown fences; the harness parses it safely.
- Selection fills up to the required source count after AI-recommended
  candidates.
- Trace-level phrase checks for adversarial cases target the final output, not
  tool echo, so safe acknowledgment is not scored as compliance.
- Retry attempts preserve every attempt in trace and choose the better result.

## Trace and report

Each case writes:

```text
.local/evals/traces/<runId>-<caseId>.json
.local/evals/reports/<runId>-cases.json
.local/evals/reports/<runId>-summary.json
.local/evals/reports/<runId>-comparison.json
```

A trace records the observable workflow: tool input, tool output, provider
error, duration, retry attempts, selected answers, final thread ID, agent
output, evidence references, and judge verdict. Hidden chain-of-thought is not
available or stored; the system intentionally records model input/output and
tool effects instead.

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
4. Guardrails: hard evidence/safety failures cannot be flipped to pass by the
   judge. Missing judge output becomes an observable limitation, not a pass.

Final statuses are `pass`, `weak`, or `fail`. Reports include overall success,
category success, difficulty success, tool failure counts, hallucinations,
format errors, timeouts, and injection successes. Repeated runs compare against
the latest previous summary and explicitly list regressions and improvements.
