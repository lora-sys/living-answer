# Ticket 20: minimal durable patch lifecycle

## Goal

Make an analysis result durable enough to support the smallest meaningful
Changes / lifecycle surface without pretending that the system currently has a
full answer body or an applied patch.

The current real-data flow produces advisory `UPDATE`, `NO_PATCH`, and
`UNKNOWN` decisions. This ticket will not fabricate an applied `PatchRevision`.
Instead, it will persist immutable decision and lifecycle events for
`UPDATE`-class advisory patches, while retaining the stronger `PatchRevision`
boundary for a later ticket that has a real applied body.

## Scope

### Slice 1 — durable lifecycle records

Add a domain-safe `PatchLifecycleEvent` record and a SQLite store under
`.local/` with:

- an immutable UPDATE decision snapshot: reason, selected evidence fingerprints,
  source/evidence summary, and optional analysis fields;
- answer identity: question id, answer id, and excerpt fingerprint;
- an append-only lifecycle event with `VISIBLE`, `DISPUTED`, or `SUPERSEDED`;
- a current-state query by excerpt fingerprint;
- a history query by answer identity;
- explicit supersession when a later analysis replaces the previous patch.

The store must be injectable, fail closed, and never expose SQL errors to the
client.

### Slice 2 — server wiring

Persist successful analysis outcomes after the Evidence Gate and patch analysis.

- A new `UPDATE` decision creates a `VISIBLE` lifecycle record.
- A later analysis supersedes the prior visible/disputed record for the same
  excerpt.
- A `NO_PATCH` or `UNKNOWN` result supersedes a prior patch rather than creating
  a fake visible patch.
- Store failures use a stable JSON-safe error code.
- The response exposes only the lifecycle id/status and a compact history; it
  never exposes credentials, raw provider payloads, SQL errors, or model errors.

### Slice 3 — minimal dispute and recheck UI

On the real-data read result:

- show whether the advisory patch is currently visible or disputed;
- let a user dispute the patch, which pauses it as `DISPUTED`;
- let a user request recheck, which reruns the existing analysis path;
- when disputed, hide the active patch details and show a calm paused state;
- show a compact prior-record history so Changes is not a hidden table.

## Non-goals

- No full-body ingestion or `AnswerSnapshot.body`.
- No real `PatchRevision` with a fabricated patch body.
- No author OAuth or identity claims.
- No full review queue, moderation UI, scheduler, or browser extension.
- No eval work, deployment, or broad landing-page redesign.
- No destructive updates: old lifecycle events remain immutable.

## Product invariants

- A later world change is an `UPDATE`, not proof that the author was wrong.
- A disputed advisory patch is paused from active presentation.
- Supersession never overwrites or deletes history.
- Lifecycle data is local product state, not a source of truth about Zhihu.

## Verification

```sh
vp check
vp test
vp build
```
