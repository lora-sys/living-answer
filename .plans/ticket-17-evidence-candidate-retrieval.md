# Ticket 17 - Claim-anchored Evidence Candidate Retrieval

## Status

Planned. Ticket 16 is complete: a real supported answer URL can resolve an
`AnswerExcerpt`, extract candidate claims, persist them in `.local/claims.db`,
and show them as unverified candidates.

## Goal

Retrieve claim-anchored evidence candidates and persist them under ignored local
state so the next stage can run an Evidence Gate without repeating network work.

The chain advanced by this ticket is:

```text
AnswerExcerpt -> AnswerClaim -> Evidence Candidate
```

It deliberately stops before:

```text
Evidence Candidate -> Evidence Gate -> Patch
```

Retrieved search results are candidates and community/web leads, not verified
evidence. The UI must never present them as proof or as a completed patch.

## Product context

The P0 chain is:

```text
AnswerExcerpt -> Claim -> Evidence -> Evidence Gate -> Patch
```

Ticket 16 supplied the first two nodes. The missing capability is targeted
retrieval: for each candidate claim, find possible current facts or change leads
and preserve enough provenance for later verification.

Community discussion can point at a change, but it cannot be the final proof for
a high-impact patch. Web search can surface official or primary sources, but the
response is still untrusted and must be classified before the gate. This ticket
therefore stores both classes separately and labels them as pre-gate candidates.

## Design decisions

### 1. Separate evidence candidates from patch evidence

Introduce `EvidenceCandidate`, not a new variant of `PatchEvidence`.

`PatchEvidence` represents a citation at the patch layer. A retrieval result
does not yet have that status. It needs retrieval provenance, source
classification, query identity, and an explicit candidate lifecycle.

The immutable record should live in `src/lib/evidence-candidate.ts` and contain:

- `claimFingerprint`
- `retrievalEventFingerprint`
- `provider`: `"zhihu_search" | "global_search"`
- `searchQuery`
- `sourceContentId`
- `sourceContentType`
- `sourceKind`: `"community_lead" | "web_source"`
- `authorityHint`: `"official" | "project" | "government" | "media" | "community" | "unknown"`
- `sourceLabel`
- `title`
- `sourceUrl`
- `contentPreview`
- `publishedAt` (optional, safe integer)
- `capturedAt`
- `sourceAccessState`: `"fetched" | "restricted" | "not_found" | "network_error"`
- `candidateFingerprint`
- `status`: `"candidate"`

`contentPreview` is intentionally not called `quote`. Zhihu search returns
summary-class content, so a retrieval response must not be stored as if it were
an exact full-source quotation. The Evidence Gate can later promote verified
material into `PatchEvidence`.

All text from the provider is untrusted. Normalize with NFC, CR/CRLF to LF, and
trim; reject control characters except LF; enforce practical limits; validate
HTTP/HTTPS URLs; reject unsafe or negative timestamps.

`candidateFingerprint` is a versioned FNV-1a hash over `claimFingerprint`,
provider, normalized source URL, and normalized content preview. It excludes
`capturedAt` so repeated retrieval of the same result can be deduplicated.

### 2. Reusable search adapter for both documented endpoints

The existing `zhihu_search` adapter is provider-specific: it sends the answer
canonical URL as `Query`. Evidence retrieval needs two different search intents:

1. `zhihu_search`: community/new-answer leads around the claim.
2. `global_search`: web candidates, including possible primary sources.

Preserve the current answer-excerpt behavior and add a narrower reusable fetcher
so both endpoints share one envelope validation and transport boundary:

```text
src/lib/zhihu-content-search.ts
```

The reusable fetcher accepts:

- endpoint (`zhihu_search` or `global_search`)
- access secret
- injectable transport
- query
- optional global-search filter
- injectable clock

It validates the documented response envelope and returns only raw `Data.Items`.
It must not understand claims, SQLite, React, TanStack, or environment variables.

Domain strategy code maps raw items into candidate creation attempts and drops
invalid items rather than widening the typed failure surface.

### 3. Deterministic, claim-anchored queries

Build one deterministic query per claim per provider. The first implementation
should use the normalized `claimText` directly, without another model call.

This keeps retrieval explainable and avoids spending quota to generate queries.
A later ticket can improve query construction only after the base retrieval path
is measured.

Cap the workflow to the latest claim set. For the initial implementation, one
claim set has at most three claims. With both providers this produces at most six
network calls for a cold, uncached run. Calls are serialized or limited to small
concurrency.

### 4. Workflow and failure behavior

Create `src/lib/evidence-retrieval-workflow.ts`.

Dependencies are injected:

- an evidence candidate store for pre-call deduplication
- a Zhihu search fetcher
- a global search fetcher
- an injectable clock

Input is a bounded claim set, not arbitrary claims. Output is a structured
success union containing per-claim retrieval results and dropped-item counts.

Use Effect for:

- typed failures
- per-attempt timeout
- limited retry only for network/transport failures
- controlled concurrency (`concurrency: 1` or `2`)
- deterministic time injection

Do not retry `RATE_LIMITED`, authentication failures, or malformed provider
responses. A rate limit stops new network attempts for the current run. Results
already retrieved may still be saved, and the response should say the run is
partial rather than pretending all claims were checked.

Empty results for a claim are a valid success state. They do not refute or verify
the claim.

### 5. Persistence

Create `src/lib/evidence-candidate-store.ts` using SQLite at
`.local/evidence-candidates.db`.

Use two logical tables:

```text
evidence_retrievals
  id
  claim_fingerprint
  retrieval_event_fingerprint
  provider
  search_query
  retrieved_at
  UNIQUE(claim_fingerprint, retrieval_event_fingerprint)

evidence_candidates
  id
  retrieval_id
  claim_fingerprint
  candidate_fingerprint
  provider
  source_kind
  authority_hint
  source_content_id
  source_content_type
  source_label
  title
  source_url
  content_preview
  published_at
  captured_at
  source_access_state
  status
  created_at
  UNIQUE(retrieval_id, candidate_fingerprint)
```

API:

- `saveRetrieval(...)`
- `saveCandidates(...)`
- `findCandidatesByClaimFingerprint(...)`
- `findCandidatesByExcerptFingerprint(...)`

Saving the same retrieval event is idempotent. Different retrieval events append
history; they never overwrite prior candidates. The store returns plain records,
not Effect values, to the server after `Effect.runPromise` boundaries.

The exact store method signatures may be adjusted during implementation to match
the existing `ClaimStore` patterns, as long as typed errors and idempotence are
preserved.

### 6. Quota and cache boundary

Use three layers of quota protection:

1. Check the SQLite store before making a provider call.
2. Reuse in-process `QueryCache` for short-lived query-level deduplication.
3. Cap search calls and stop on rate limits.

The cache key must include provider, normalized query, and claim fingerprint. A
short TTL is enough to protect a retry from double-spending; SQLite remains the
longer-lived record. The official Zhihu API has a shared account quota, so tests
must never perform real network calls.

### 7. Server boundary

Create `src/server/retrieve-evidence-candidates.ts`.

The TanStack Start server function accepts `{ url: string }` and:

1. Validates and resolves the supported answer URL.
2. Resolves or reads the corresponding `AnswerExcerpt`.
3. Reads the latest persisted claim set for that excerpt fingerprint.
4. Runs the retrieval workflow.
5. Saves candidates and retrieval events.
6. Returns a JSON-safe discriminated union.

It reads only `ZHIHU_ACCESS_SECRET` for this ticket. `OPENAI_API_KEY` and
`OPENAI_MODEL` are not used because this workflow does not invoke a model.

Stable response failure codes:

- `INVALID_REQUEST`
- `UNSUPPORTED_ANSWER_URL`
- `MISSING_ACCESS_SECRET`
- `ANSWER_NOT_FOUND`
- `INVALID_PROVIDER_ANSWER`
- `PROVIDER_ERROR`
- `CLAIMS_NOT_FOUND`
- `RETRIEVAL_RATE_LIMITED`
- `RETRIEVAL_ERROR`
- `EVIDENCE_STORE_ERROR`

The server may return a partial-success response when some claims were checked
and some provider attempts failed, as long as the response explicitly marks the
failed claims and does not label the run complete.

### 8. UI behavior

Add a compact evidence-candidate section after the claims section.

Initial state:

```text
证据候选 · 未核验
```

The section should not automatically consume network quota on excerpt load. Use
an explicit, low-noise action such as `检索候选证据`. During retrieval, show one
quiet loading state. On success, group candidates under each claim and show only
a bounded number initially.

For each candidate show:

- source label/title
- concise content preview
- source kind and authority hint
- captured time
- open-source link

Empty state text must say that no candidate was found; it must not say the claim
is correct, outdated, or refuted. Failure state must distinguish rate limit,
provider failure, and local store failure without exposing raw payloads or
credentials.

Do not change the golden demo read pages in this ticket.

## Implementation slices

### Slice 1 - reusable Zhihu content search boundary

Add `src/lib/zhihu-content-search.ts` while preserving current answer-excerpt
provider behavior.

Cover:

- request construction for `zhihu_search`
- request construction for `global_search`, including optional filter
- envelope validation
- zero/non-zero code handling
- typed transport failure mapping
- injectable clock and transport
- no real network in tests

### Slice 2 - `EvidenceCandidate` domain record

Add `src/lib/evidence-candidate.ts`.

Cover:

- valid records for both `community_lead` and `web_source`
- text normalization and control-character rejection
- HTTP/HTTPS URL validation
- safe-integer time validation
- stable and input-sensitive fingerprint
- optional `publishedAt`
- no Effect/React/TanStack/SQLite dependencies

### Slice 3 - retrieval workflow

Add `src/lib/evidence-retrieval-workflow.ts`.

Cover:

- per-claim Zhihu and web retrieval
- deterministic query construction
- controlled concurrency
- timeout and retry policy
- rate-limit stop behavior
- invalid item filtering
- duplicate candidate filtering
- partial result representation
- empty result as success
- injected clock

### Slice 4 - SQLite evidence candidate store

Add `src/lib/evidence-candidate-store.ts`.

Cover:

- schema creation
- idempotent retrieval and candidate saves
- multiple retrieval events
- lookup by claim fingerprint
- lookup by excerpt fingerprint
- plain record deserialization
- typed storage errors
- in-memory SQLite tests

### Slice 5 - server boundary and read-only UI

Add `src/server/retrieve-evidence-candidates.ts` and extend the real-result
section.

Cover:

- request validation
- credential handling
- provider failure mapping
- claims-not-found state
- partial retrieval response
- evidence store failure
- JSON-safe response
- explicit retrieval action
- loading, empty, partial, error, and success UI states

## Testing strategy

All tests are offline and dependency-injected. Use fake transports, fake routers,
fake stores, fixed clocks, and in-memory SQLite.

Required checks:

- valid candidate creation and rejection paths
- stable fingerprints for identical normalized content
- invalid raw search items are dropped without crashing
- successful retrieval saves candidates
- repeated retrieval does not duplicate candidates in one event
- older retrieval events remain readable
- rate limits stop remaining calls and preserve partial results
- transport failures produce stable server errors
- malformed provider responses never leak raw payloads
- no real network call occurs in any test

## Verification

Run:

```bash
vp check
vp test
vp build
```

Also browser-check the real-result evidence-candidate section at:

```text
320 / 375 / 414 / 768 / 1440 px
```

Confirm:

- no horizontal overflow or overlapping text
- all external source links are real anchor elements
- candidates are labelled as unverified
- empty and partial states are honest
- no credential or raw provider payload appears in the UI

## Non-goals

- No full-answer ingestion.
- No Evidence Gate.
- No Evidence scoring or entailment.
- No Patch engine or visible patch generation.
- No model-generated search queries.
- No OAuth.
- No public deployment.
- No golden demo changes.
- No real API calls in tests.
- No background scheduler.

## Done condition

A developer can paste a supported Zhihu answer URL, extract claims, explicitly
trigger claim-anchored candidate retrieval, and see persisted, claim-linked
candidates with source URLs, previews, source classification, and capture time.
Empty, partial, and failed runs are explicit. The data is clearly pre-gate and
can be consumed by a later Evidence Gate without repeating retrieval.
