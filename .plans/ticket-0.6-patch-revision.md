# Ticket 0.6: immutable PatchRevision value object

## Goal

Add a pure, in-memory, immutable `PatchRevision` value object representing one
actual visible `UPDATE` revision. A revision records that a patch body was
applied to an answer snapshot with supporting evidence at a known time. It does
not decide whether a patch should exist and does not fetch, persist, import, or
expose anything.

## Decision

`PatchRevision` is update-only for this ticket. `NO_PATCH` and `UNKNOWN` are
decision outcomes, not revisions, and belong to a later workflow type.

## Requirements

- Only create:
  - `src/lib/patch-revision.ts`
  - `src/lib/patch-revision.test.ts`
- Input fields:
  - `patchBody: string`
  - `answerSnapshotFingerprint: string`
  - `evidenceFingerprint: string`
  - `capturedAt: number`
- Validate in this order:
  1. `capturedAt` is a finite, non-negative safe integer timestamp.
  2. `answerSnapshotFingerprint` matches `^v1:[0-9a-f]{16}$`.
  3. `evidenceFingerprint` matches `^v1:[0-9a-f]{16}$`.
  4. Normalized `patchBody` is non-empty.
- Normalize `patchBody`:
  - Unicode NFC.
  - CRLF and CR normalize to LF.
  - Trim leading and trailing whitespace.
- The result must be a discriminated union:
  - `success` contains the frozen revision.
  - `failure` contains a typed reason.
- Failure reasons:
  - `INVALID_CAPTURED_AT`
  - `INVALID_ANSWER_SNAPSHOT_FINGERPRINT`
  - `INVALID_EVIDENCE_FINGERPRINT`
  - `EMPTY_PATCH_BODY`
- Freeze the success revision with `Object.freeze`.
- Compute a versioned, deterministic fingerprint:
  - Prefix with `v1:`.
  - Use 64-bit FNV-1a.
  - Include normalized `patchBody`, `answerSnapshotFingerprint`,
    `evidenceFingerprint`, and `capturedAt`.
  - Include `capturedAt` because a revision is an event, unlike the prior
    content-only records.
  - Explicitly document that this is non-cryptographic.
- Cover success, immutability, normalization, all typed failures,
  fingerprint stability and change behavior, validation order, no-throw
  behavior, and composition with `AnswerSnapshot` and `PatchEvidence`.

## Verification

```sh
vp check
vp test
vp build
```

## Non-goals

No decision workflow, `NO_PATCH` or `UNKNOWN` type, superseding or revision
chain, diff logic, source ingestion, persistence, API integration, UI, cache
integration, route changes, dependency changes, or creation of a PR.
