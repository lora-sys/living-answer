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

## Next decision

Reshape the ingestion boundary around an honest AnswerExcerpt or summary record
that matches the data the open API actually provides, or wait for a legal
full-body source. Do not add database, importer, or persistence code before
that decision is made.
