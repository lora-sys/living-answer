# Living Answer current context

## Product

Living Answer points out materially changed premises when a reader uses an old
Zhihu answer today. The original answer remains primary. A patch explains the
change, its present impact, and the supporting evidence.

## Current technical baseline

- TanStack Start with React and TanStack Router
- Vite+ as the toolchain and pnpm as the pinned package manager
- Tailwind CSS 4 through `@tailwindcss/vite`
- Effect for later application and infrastructure reliability boundaries
- Node.js 24 LTS

## Current status

Ticket 0 verified (2026-08-28): `vp install --frozen-lockfile`, `vp check`,
`vp test`, `vp build` all green; desktop 1440x900 and mobile 375x667 renders
match `.local/evidence/ticket-0-{desktop,mobile}.png`. Ticket 0.1 closes the
remaining open issue (favicon 404, README troubleshooting) without introducing
new dependencies. Ticket 0.2 verified (2026-08-29): the offline Effect query
cache provides injectable time, TTL, bounded eviction, and single-flight
`getOrSet`; `vp check` and `vp test` are green. It makes no external API calls.
Tickets 0.4-0.6 verified (2026-08-30): the immutable AnswerSnapshot,
PatchEvidence, and PatchRevision value objects are implemented as pure domain
records with typed results and deterministic v1 fingerprints; `vp check` and
`vp test` are green. PatchRevision is update-only and includes its capture
time in the fingerprint as an event identity. Spike 01 Phase B completed (2026-08-30, see `.plans/spike-01-phase-b-facts.md`):

1. The official open API surface exposes no documented full Zhihu answer-body
   path. Observed Zhihu ContentText is summary-class (max 1121 characters).
   Official search and user-content data is summary-class. A summary / excerpt
   must never be stored as `AnswerSnapshot.body`.
2. `ContentID` is a stable-identity candidate (unique integer per content item,
   does not map to URL slug ID). Longitudinal update behavior remains
   unverified.
3. OpenAPI documentation at `http-api.md:357` states EditTime is Int32; live
   responses confirm Int64. Schema must use Int64.
4. Ticket 1 is not Ready.

Ticket 1R verified (2026-08-30): `AnswerExcerpt` is a separate immutable domain
record for summary-class data. It anchors to the parsed question/answer IDs and
preserves provider provenance; `sourceContentId` is a canonical decimal string
because observed ContentIDs exceed `Number.MAX_SAFE_INTEGER`. It is never stored
as `AnswerSnapshot.body`. `vp check`, `vp test`, and `vp build` are green.

Ticket 2 verified (2026-08-30): the `AnswerExcerptProvider` boundary
(`src/lib/answer-excerpt-provider.ts`) resolves a supported Zhihu answer URL
into a validated `AnswerExcerpt` through an injected provider function. It
reuses the offline `QueryCache` (with the expired-entry recompute fix), treats
all provider data as untrusted, and caches only successful results. It remains
offline, injected, and persistent-free; persistence requires a later approved
ticket. `vp check`, `vp test`, and `vp build` are green.

Ticket 3 verified (2026-08-30): the Zhihu search adapter
(`src/lib/zhihu-search-adapter.ts`) builds the documented `zhihu_search`
request, validates its response envelope, and returns only raw
`Data.Items` to `AnswerExcerptProvider`. Its transport is injectable; HTTP,
timeout, and malformed-JSON failures map to `AnswerExcerptProviderError`.
It remains persistence-free, does not read `process.env`, and never treats
search summaries as a full `AnswerSnapshot` body. `vp check`, `vp test`, and
`vp build` are green.

## Next decision

Wire the verified Zhihu search adapter into an approved server-side caller for
one real answer excerpt, while keeping the secret and network boundary outside
domain code. Do not add database, importer, or persistence code until that plan
is approved. Revisit a legal full-body source separately.
