# Ticket 19: Quota and Failure Readiness

## Status

Ready.  The P0 chain now reaches Patch, but provider failures still mix local
store problems, transport failures, rate limits, and quota exhaustion.  This
ticket makes those states observable without exposing internal details and adds
a durable daily cap before real provider calls.

## Problem

The provider search API documents `Code=30001` for rate limiting and
`Code=30002` for quota exhaustion.  Current boundaries collapse both into
generic non-zero-code failures.  Evidence retrieval also converts every caught
exception into `RETRIEVAL_FAILED` and includes the underlying error message.

At the same time, repeated users can spend the shared provider account quota.
In-memory deduplication and persisted results reduce calls, but no durable
daily counter stops a burst once cache and persistence both miss.

## Product invariants

- Cache and persisted-result hits do not consume provider quota.
- A provider call consumes quota even when the provider later fails, unless it
  is rejected before being sent.
- Quota exhaustion and rate limiting are distinct observable failures.
- The core reading page must remain usable when evidence retrieval is partial
  or unavailable.
- User-facing failures never expose credentials, headers, raw payloads, stack
  traces, database paths, or error causes.
- Until OAuth exists, the durable cap protects the shared service account.  It
  is not a per-browser-user identity system.

## Design

### Provider failure taxonomy

Extend the shared content-search error reasons with:

```text
API_RATE_LIMITED   — provider Code 30001
API_QUOTA_EXCEEDED — provider Code 30002
```

Map HTTP 429 to rate limiting.  Map the answer-excerpt adapter's provider
failures to distinct provider failures and server codes:

```text
PROVIDER_RATE_LIMITED     — temporary, user can retry later
PROVIDER_QUOTA_EXCEEDED   — daily service quota is gone
```

Keep generic provider failures unchanged.  Messages remain calm, Chinese, and
safe to display.

### Evidence retrieval states

Add `quota_exceeded` as a per-provider and partial-run state.  A quota stop
remains a partial success when some providers or claims have results.  The
JSON-safe response preserves the state so the UI can distinguish:

```text
rate limit      — temporarily too frequent
quota exceeded  — today's provider allowance is used
failed          — provider or source attempt failed
```

Server-level failures remain reserved for invalid input, missing credentials,
or local workflow/store failures.  Provider fetch failures normally become
partial results, not a whole-request error.

### Durable daily quota guard

Introduce a domain `DailyQuotaStore` boundary and a guard that owns policy:

```text
provider             — zhihu_search | global_search
day                  — UTC calendar day
limit                — 1000 attempts/provider/day by default
allocation           — one attempt per real provider call
rejection            — QuotaExceededError before network construction
store failure        — QuotaStoreError, fail closed
```

The SQLite adapter records only provider, UTC day, and attempts in ignored
`.local/provider-quota.db`.  It uses an atomic transaction so concurrent
requests cannot exceed the configured limit.  It is intentionally not a user,
session, billing, or analytics system.

The evidence server wraps each provider fetcher with the guard.  The excerpt
server wraps only the underlying items fetcher, so in-memory and SQLite excerpt
hits can still resolve without consuming quota.

## Implementation slices

### Slice 1 - Structured provider failures

Update the shared search boundary and adapter mappings.  Cover provider codes
30001/30002, HTTP 429, safe server-code mapping, and failure messages.

### Slice 2 - Durable daily quota

Add the quota store boundary, UTC day policy, SQLite adapter, and guard.  Cover
allowance, exhaustion, day rollover, provider separation, and fail-closed
errors.

### Slice 3 - Server and UI failure paths

Wire the guard into excerpt and evidence retrieval, remove raw exception
messages from server responses, preserve partial retrieval results, and update
failure text for quota/rate-limit states.

## Non-goals

- No OAuth, user identity, per-login accounting, or admin dashboard.
- No hot-ranking or direct-answer quota integration because those surfaces do
  not exist yet.
- No retry after quota exhaustion.
- No Changes, lifecycle, feedback, eval, deployment, or visual redesign work.

## Verification

```bash
vp check
vp test
vp build
```
