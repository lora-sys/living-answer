# Answer ingestion and snapshots

## Goal

Accept a supported Zhihu Answer URL, resolve a stable Answer identity, and
preserve immutable content snapshots. Re-importing unchanged content must not
create a duplicate snapshot. Changed content must create a new snapshot while
the previous version remains available.

## Current status

Ready for Spike, not Ready for implementation.

Official search and user-content capabilities return summaries. They do not
document an arbitrary Answer full-body endpoint. Until a legal complete-content
path is confirmed, Ticket 1 must not implement persistence or treat a summary
as `AnswerSnapshot.body`.

## Spike 01 exit criteria

- Verify stable mapping among Answer URL, `ContentID`, and answer identity.
- Verify `EditTime`, response shape, deletion, permission, quota, and failure behavior.
- Confirm the legal complete-body source, or explicitly reshape the competition
  Snapshot boundary if no such source exists.
- Preserve one sanitized real response fixture and a short API facts record.
- Decide the cache boundary before production API calls are added.

## Planned tickets after the Spike

1. Import one real answer and persist its first snapshot.
2. Re-import unchanged content without duplicate snapshots.
3. Preserve history when answer content changes.
4. Expose snapshot history for developer verification.

## Non-goals for Ticket 1

Claim extraction, evidence retrieval, patch generation, OAuth, review UI,
recheck scheduling, browser extensions, and production deployment.
