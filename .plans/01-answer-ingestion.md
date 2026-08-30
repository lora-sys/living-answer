# Answer ingestion and snapshots

## Goal

Accept a supported Zhihu Answer URL, resolve a stable Answer identity, and
preserve immutable content snapshots. Re-importing unchanged content must not
create a duplicate snapshot. Changed content must create a new snapshot while
the previous version remains available.

## Current status

Spike 01 Phase B complete (2026-08-30).

**Key finding:** The official open API has no documented full Zhihu answer-body
path. Search and user-content endpoints return summary-class ContentText
(max 1121 chars observed on Zhihu items). An excerpt / summary must be treated
as a separate record type (e.g., `AnswerExcerpt`); it must not be stored as
`AnswerSnapshot.body`.

`ContentID` (integer, unique per content item, does not map to URL slug ID) is
a stable-identity candidate for the source. Longitudinal update behavior is
unverified; this does not authorize storing a summary as `AnswerSnapshot.body`.

`EditTime` actual type in live responses is Int64, not Int32 as documented in
`http-api.md:357`. Schema must use Int64.

Ticket 1R therefore reshaped the domain boundary: `AnswerExcerpt` is a separate
immutable record for summary-class data and is never stored as
`AnswerSnapshot.body`. The original full-body Ticket 1 remains not Ready.

Ticket 2 verified (2026-08-30): the `AnswerExcerptProvider` boundary
(`src/lib/answer-excerpt-provider.ts`) connects a supported Zhihu answer URL to
a validated `AnswerExcerpt` through an injected provider function. It reuses
the offline `QueryCache` (with expired-entry recompute fix), treats all provider
data as untrusted, and caches only successful results. The boundary remains
offline and injected — no live API, no credentials, no persistence. Persistence
and importer code require a later approved ticket.

Provider/cache integration needs its own approved plan before persistence or
importer code is added.

## Spike 01 exit criteria

- [x] Probe stable mapping among Answer URL, `ContentID`, and answer identity.
      **Result:** ContentID is a stable-identity candidate, unique per content
      item, and does not map to the URL slug ID. The mapping is not fully
      verified across time or content updates.
- [x] Verify `EditTime`, response shape, deletion, permission, quota, and
      failure behavior.
      **Result:** EditTime is Int64 in live responses. Error envelope shape
      distinguishable from success (Code=10001, Data=null). Empty-result
      behavior not fully resolved.
- [x] Confirm the legal complete-body source, or explicitly reshape the
      competition Snapshot boundary if no such source exists.
      **Result:** No full-body path exists. Boundary must be reshaped around
      summary-class data or wait for a legal source.
- [x] Preserve one sanitized real response fixture and a short API facts record.
      **Result:** Done — sanitized and raw probe artifacts under
      `.local/spike-01-phase-b/` and the facts record at
      `.plans/spike-01-phase-b-facts.md`.
- [x] Decide the cache boundary before production API calls are added.
      **Result:** Pending — cache boundary decision deferred until ingestion
      boundary is reshaped.

## Spike 01 results summary

- **Ingestion ceiling:** ContentText is summary-class for Zhihu content (max
  1121 chars). No full-body path exists through the open API.
- **Identity anchor:** ContentID stable, integer, unique per content item.
  Longitudinal update behavior (does ContentText change over time for a given
  ContentID) unverified.
- **Schema discrepancy:** EditTime is Int64, not Int32 (`http-api.md:357` is
  incorrect; `http-api.md:150` is correct).
- **Error handling:** Three shapes observed — success (Code=0, Items), invalid
  params (Code=10001, Data=null), empty results (EmptyReason, not observed
  but defined in docs).
- **User boundary:** Self-only without OAuth. Summary-only content returned.

See `.plans/spike-01-phase-b-facts.md` for full endpoint response details.

## Planned tickets after the Spike (superseded pending boundary redesign)

These original snapshot-persistence tickets are not Ready. They remain listed
only as historical intent until the ingestion boundary is redesigned and
approved.

1. Import one real answer and persist its first snapshot.
2. Re-import unchanged content without duplicate snapshots.
3. Preserve history when answer content changes.
4. Expose snapshot history for developer verification.

## Non-goals for Ticket 1

Claim extraction, evidence retrieval, patch generation, OAuth, review UI,
recheck scheduling, browser extensions, and production deployment. Database,
importer, or persistence code must not be added until the ingestion boundary
is redesigned and approved.
