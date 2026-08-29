# Ticket 0.5: immutable PatchEvidence value object

## Goal

Add a pure, in-memory, immutable `PatchEvidence` value object and a
deterministic evidence fingerprint. This is the objective evidence record that
a future `PatchRevision` will reference. It does not decide whether a visible
patch should exist and does not fetch, persist, import, or expose anything.

## Requirements

- Only create:
  - `src/lib/patch-evidence.ts`
  - `src/lib/patch-evidence.test.ts`
- Input fields:
  - `sourceLabel: string`
  - `sourceUrl?: string`
  - `quote: string`
  - `capturedAt: number`
- Validate:
  - `sourceLabel` normalizes to a non-empty string.
  - `quote` normalizes to a non-empty string.
  - `sourceUrl`, when provided, is an absolute `http` or `https` URL with a
    non-empty hostname.
  - `capturedAt` is a finite, non-negative safe integer timestamp.
- Normalize `sourceLabel` and `quote`:
  - Unicode NFC.
  - CRLF and CR normalize to LF.
  - Trim leading and trailing whitespace.
- Keep the optional `sourceUrl` as a normalized absolute URL.
- The result must be a discriminated union:
  - `success` contains the frozen evidence.
  - `failure` contains a typed reason.
- Failure reasons:
  - `INVALID_SOURCE_LABEL`
  - `INVALID_SOURCE_URL`
  - `INVALID_QUOTE`
  - `INVALID_CAPTURED_AT`
- Freeze the success evidence with `Object.freeze`.
- Compute a versioned, deterministic fingerprint:
  - Prefix with `v1:`.
  - Use 64-bit FNV-1a.
  - Include `sourceLabel`, `sourceUrl` presence/value, and normalized `quote`.
  - Exclude `capturedAt`, so the same source and quote captured at different
    times has the same fingerprint.
  - Explicitly document that this is non-cryptographic.
- Cover success, immutability, normalization, URL validation, typed failures,
  fingerprint stability/change behavior, and explicit `sourceUrl` absence
  versus empty string handling.

## Verification

```sh
vp check
vp test
vp build
```

## Non-goals

No claim extraction, patch decision, `PatchRevision`, `NO_PATCH` workflow,
source ingestion, persistence, API integration, UI, cache integration, route
changes, dependency changes, or creation of a PR.
