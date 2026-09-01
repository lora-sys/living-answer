# Ticket 47: Claim model output containment

## Scope

Contain the claim-extraction model output in
`src/lib/claim-extraction-workflow.ts` only.

- Tighten the prompt contract passed to the model.
- Harden `parseModelResponse` so it only accepts verifiable JSON semantics.
- Add focused tests in `src/lib/claim-extraction-workflow.test.ts` using the
  existing fake-chat pattern.

Do not touch the server wiring, adapter, response codes, timeout constants, or
store wiring.

## Root cause

During Ticket 46 runtime verification, the claim extraction model sometimes
returned valid JSON wrapped in a Markdown code fence. The current parser calls
`JSON.parse` directly, so that output becomes `INVALID_JSON` and the public
response surfaces as `PROVIDER_ERROR`.

The same real excerpt contains a Markdown fence (`tsx`). With that excerpt, the
model occasionally treats the fenced code as the instruction boundary and says
that no source excerpt was supplied, even though the prompt contained a
1,005-character excerpt.

## Implementation

1. Strengthen `buildPrompt`:
   - require one JSON object as the entire response body;
   - forbid Markdown, code fences, backtick delimiters, explanations, and text
     outside JSON;
   - reiterate that an empty claims array is valid and that the prompt excerpt is
     the source.
2. Harden `parseModelResponse`:
   - first try direct JSON parsing;
   - then accept only an exact, single-fence-wrapped JSON object;
   - extract and parse that body only when there is no leading prose and no
     trailing text;
   - reject multiple fences, arbitrary prose, malformed fence shapes, and
     embedded snippets;
   - do not scrape JSON from untrusted model text with broad regex matching.
3. Preserve existing claim validation:
   - at most 3 claims;
   - required text fields;
   - allowed volatility and relevance values;
   - anchor text must remain an exact substring of the normalized excerpt;
   - `createAnswerClaim` remains the final domain validation.
4. Preserve the public error taxonomy. `INVALID_JSON` continues to surface as
   the existing claim-flow provider failure in the server boundary.

## Tests

Use fake chat; no real model calls and no sleeps.

Cover:

1. a bare JSON object still succeeds;
2. a single complete fence around a JSON object succeeds;
3. plain prose without a complete fenced object returns `INVALID_JSON`;
4. multiple fences or a malformed fence shape returns `INVALID_JSON`;
5. an excerpt containing a code fence can still produce a valid empty or nonempty
   claims result when the model obeys the contract.

## Acceptance

Run and pass:

```bash
vp check --fix
vp test --run
vp build
```

Then run the real model at least three consecutive times against the currently
persisted 1,005-character Zhihu excerpt. Each run must be a structured success;
an empty claims array is a valid success.

No secrets, provider headers, raw provider bodies, or model error causes may be
recorded in the repository or committed.

## Rollout and process

1. Commit the implementation as a focused `fix:` change.
2. Push `main`, close the focused GitHub issue with verification evidence, and
   create a Notion implementation page under Development.
