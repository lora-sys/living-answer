# Ticket 1R — AnswerExcerpt Domain Record (Revised)

## Context

Spike 01 Phase B confirmed no full answer-body path exists via the Zhihu open API.
Observed `ContentText` is summary-class (max 1121 chars). `ContentID` is a stable
identity candidate (safe integer, unique per content item), and `EditTime` is Int64
in live responses. `AnswerSnapshot.body` is reserved for complete content.

`parseZhihuAnswerUrl` already produces `questionId` and `answerId` as validated
non-empty numeric strings. Ticket 1R creates the honest boundary: a dedicated
`AnswerExcerpt` domain record anchored directly to that parsed answer identity,
capturing the summary-class data the API actually provides.

## Explicit Rejections

- NOT storing AnswerExcerpt text in `AnswerSnapshot.body`. That field is for
  complete content only; an excerpt is a separate observation with its own type.
- NOT storing or validating a `snapshotFingerprint` on `AnswerExcerpt`. A full
  `AnswerSnapshot` (with `fingerprint`) cannot exist from summary-only API data —
  the current design's `snapshotFingerprint` field creates a phantom dependency
  on a sibling record that has no valid path to existence in this ingestion
  boundary. Rejected.
- NOT adding database, importer, or persistence code. No storage layer, ORM, or
  migration. Pure domain value object only.
- NOT adding a network provider SDK or live API call. No HTTP client, no OAuth,
  no Effect service. Only the domain record and its tests.
- NOT creating empty abstractions — no `ExcerptRepository`, `ExcerptProvider`,
  or service interfaces. One factory function. One immutable record type.
- NOT accepting `sourceContentType: "Article"`. An `AnswerExcerpt` is an excerpt
  _of an answer_. Articles are a different content category and belong to a
  separate domain record that does not exist for this ticket. `"Article"` is
  rejected with `INVALID_SOURCE_CONTENT_TYPE`.
- NOT making network calls, calling API adapters, or importing from modules not
  listed below.

## Recommended Name

`AnswerExcerpt` — matches the product boundary (an excerpt of an answer) and
clearly distinguishes from full `AnswerSnapshot.body`.

## Proposed Name (Rejected)

`AnswerExcerpt` with `snapshotFingerprint`. Rejected: see Explicit Rejections above.

## Public Type Shape

```typescript
// src/lib/answer-excerpt.ts

export type AnswerExcerptFailureReason =
  | "INVALID_QUESTION_ID"
  | "INVALID_ANSWER_ID"
  | "INVALID_CAPTURED_AT"
  | "INVALID_SOURCE_CONTENT_ID"
  | "INVALID_SOURCE_CONTENT_TYPE"
  | "INVALID_SOURCE_EDIT_TIME"
  | "EMPTY_EXCERPT";

export interface AnswerExcerptInput {
  readonly questionId: string;
  readonly answerId: string;
  readonly capturedAt: number;
  readonly sourceContentId: string;
  readonly sourceContentType: "Answer";
  readonly sourceEditTime: number;
  readonly excerpt: string;
}

export interface AnswerExcerpt {
  readonly questionId: string;
  readonly answerId: string;
  readonly capturedAt: number;
  readonly sourceContentId: string;
  readonly sourceContentType: "Answer";
  readonly sourceEditTime: number;
  readonly excerpt: string;
  readonly fingerprint: string;
}

/** Success branch of {@link AnswerExcerptResult}. */
export interface AnswerExcerptSuccess {
  readonly _tag: "success";
  readonly excerpt: AnswerExcerpt;
}

/** Failure branch of {@link AnswerExcerptResult}. */
export interface AnswerExcerptFailure {
  readonly _tag: "failure";
  readonly reason: AnswerExcerptFailureReason;
}

export type AnswerExcerptResult = AnswerExcerptSuccess | AnswerExcerptFailure;
```

## Validation and Normalization Rules

Follows the exact pattern of `createAnswerSnapshot`, `createPatchRevision`, and
`createPatchEvidence`:

1. **capturedAt** — first (no normalisation dependency). Safe integer, >= 0.
   Failure: `INVALID_CAPTURED_AT`.
2. **questionId** — non-empty numeric string (reuses the `isNumericId` helper
   from `answer-snapshot.ts`). Failure: `INVALID_QUESTION_ID`.
3. **answerId** — non-empty numeric string (same helper). Failure: `INVALID_ANSWER_ID`.
4. **sourceContentId** — must be a canonical decimal string matching
   `^(?:0|-?[1-9][0-9]*)$`. The API returns ContentID as a JSON string and
   observed values exceed `Number.MAX_SAFE_INTEGER`; using `number` would lose
   precision. Negative values are valid (observed in Spike 01 Call 5:
   ContentID `-8765571236311781284`).
   Failure: `INVALID_SOURCE_CONTENT_ID`.
5. **sourceContentType** — must equal `"Answer"` at runtime. Even though the
   input type is the literal `"Answer"`, API-shaped data can enter through
   unsafe casts or untrusted boundaries. Reject `"Article"` and every other
   value with `INVALID_SOURCE_CONTENT_TYPE`.
6. **sourceEditTime** — must be a safe integer, >= 0. Live values (~1.787e9)
   exceed Int32 max; Int64 JSON integer accepted as-is.
   Failure: `INVALID_SOURCE_EDIT_TIME`.
7. **excerpt** — normalise (NFC -> CRLF/CR to LF -> trim), then non-empty check.
   Failure: `EMPTY_EXCERPT`.

Factory never throws. All failures return the discriminated union. Output is
`Object.freeze`'d.

The input interface uses the literal type `sourceContentType: "Answer"` for
ergonomics and compile-time narrowing, but the factory still performs an
equality check. This follows the project rule that API payloads and other
external data are untrusted: a TypeScript type does not validate runtime data.

## Fingerprint Strategy

Versioned `v1:` FNV-1a 64-bit, identical algorithm to existing records.

**Material:**

```
questionId:<questionId>
answerId:<answerId>
sourceContentId:<sourceContentId>
sourceContentType:<sourceContentType>
sourceEditTime:<sourceEditTime>
excerpt:<normalisedExcerpt>
capturedAt:<capturedAt>
```

`capturedAt` is included because an excerpt is a time-stamped observation.
Two API calls at different moments returning the same text are different events
(PatchRevision event-identity semantics). Fingerprint uses the **normalised**
excerpt, not raw input.

The shared `fnv1a64` implementation is duplicated from `patch-revision.ts` (as
done across existing files) rather than creating a shared utility. This avoids
creating a "utility" abstraction before one is needed.

The `isNumericId` helper is duplicated from `answer-snapshot.ts` — same rationale.

## Design Rationale: Why No snapshotFingerprint

The previous design required `snapshotFingerprint` to link the excerpt to an
`AnswerSnapshot`. This creates a logical impossibility:

1. `AnswerSnapshot.fingerprint` is computed from `questionId + answerId + body`.
2. The only valid `body` for an `AnswerSnapshot` is **complete content** (the
   field's documented contract: "reserved for complete content").
3. The Zhihu open API does not expose complete answer body content (Spike 01).
4. Therefore, no valid `AnswerSnapshot` can be constructed from the available
   API data, and no valid `snapshotFingerprint` can exist.
5. Requiring `snapshotFingerprint` in `AnswerExcerpt` means every valid
   `AnswerExcerpt` must have an impossible prerequisite.

The fix: anchor `AnswerExcerpt` directly to `questionId` + `answerId` (already
produced by `parseZhihuAnswerUrl`). This identity is stable, observable from the
API trajectory alone, and needs no upstream record to exist.

## Test Matrix

Framework: `vite-plus/test` (Vitest-compatible), matching every existing test file.

### Success path (7 cases)

- Valid input produces `_tag: "success"` with correct field values
- Output is `Object.freeze`'d (immutability)
- Fingerprint format is `v1:` + 16 lowercase hex chars
- Same input produces identical fingerprint (determinism)
- Canonical numeric `sourceContentId` string accepted as a negative value
  (Spike 01 Call 5 fact)
- `sourceEditTime` exceeding Int32 max (~1.787e9) accepted (Spike 01 fact)
- `sourceContentType` output is narrow literal `"Answer"` (TypeScript narrows)

### Validation failures (13 cases — one per failure reason, plus edge variants)

- `INVALID_QUESTION_ID`: empty, non-numeric, `" "`, `"12a"`, `" 42 "`
- `INVALID_ANSWER_ID`: empty, non-numeric, `" "`, `"12a"`, `" 100 "`
- `INVALID_CAPTURED_AT`: negative, `NaN`, non-integer float, `Infinity`
- `INVALID_SOURCE_CONTENT_ID`: empty, `"-0"`, leading zero, whitespace, plus
  sign, non-numeric, and number input
- `INVALID_SOURCE_CONTENT_TYPE`: `"Article"`, `"answer"`, `""`, unknown string
- `INVALID_SOURCE_EDIT_TIME`: negative, `NaN`, non-safe-integer float, `Infinity`
- `EMPTY_EXCERPT`: whitespace-only, empty string, non-string input

### Normalisation (3 cases)

- Excerpt with CRLF normalises to LF
- Excerpt with leading/trailing whitespace is trimmed
- Excerpt in decomposed Unicode form is NFC-normalised

### Provenance round-trip (1 case)

- The `questionId` + `answerId` on the excerpt match the output of
  `parseZhihuAnswerUrl("https://www.zhihu.com/question/<id>/answer/<id>")`

### No-throw guarantee (1 case)

- Garbage input returns failure tag, never throws

## Implementation Steps

### Step 1: Create `src/lib/answer-excerpt.ts`

Create the domain record file following the exact structural pattern of
`src/lib/patch-revision.ts`:

- Failure reasons as string literal union
- `AnswerExcerptInput` interface with `readonly` fields
- Output interfaces (`AnswerExcerpt`, `AnswerExcerptSuccess`, `AnswerExcerptFailure`,
  `AnswerExcerptResult` union)
- Private `isNumericId` helper (duplicates from `answer-snapshot.ts`)
- Private `normalizeText` helper (pattern from `patch-evidence.ts`)
- Private `fnv1a64` — same algorithm as all existing files
- Private `buildFingerprint` — material composition with `questionId`, `answerId`,
  `sourceContentId`, `sourceContentType`, `sourceEditTime`, normalised `excerpt`,
  `capturedAt`
- Public `failure` helper
- Public `createAnswerExcerpt` factory — discriminated union, never throws,
  `Object.freeze` output, documented validation order

The file is self-contained. No imports from sibling modules — helpers are
duplicated inline following the existing `patch-revision.ts` precedent.

**Validation order documented in the factory JSDoc:**

1. Safe-integer, non-negative `capturedAt`
2. `questionId` — non-empty numeric string
3. `answerId` — non-empty numeric string
4. `sourceContentId` — canonical decimal string
5. `sourceContentType` — runtime equality with `"Answer"`
6. `sourceEditTime` — safe integer, non-negative
7. Excerpt normalisation (NFC → LF → trim) and non-empty check

### Step 2: Create `src/lib/answer-excerpt.test.ts`

Write tests using `vite-plus/test` imports, matching the style of
`src/lib/patch-revision.test.ts` and `src/lib/answer-snapshot.test.ts`:

- Import: `describe, expect, it` from `"vite-plus/test"`
- Import: `createAnswerExcerpt` and all type exports from `"./answer-excerpt"`
- Import: `parseZhihuAnswerUrl` from `"./zhihu-answer-url"` (for composition test)
- Describe block: `"createAnswerExcerpt"`
- One `it` per test case from the test matrix above
- Use `toEqual` for exact equality, `toMatchObject` for partial
- Helper function `expectExcerpt` (same pattern as `expectRevision`)

Key test fixture values (matching Spike 01 observed data):

- `questionId`: `"42"`, `answerId`: `"100"` (standard test pair)
- `sourceContentId`: `-8765571236311781284` (negative, from Call 5)
- `sourceEditTime`: `1787987553` (from Call 1, exceeds Int32 max)
- `excerpt`: `"Summary-class content text"` (realistic Zhihu ContentText)

### Step 3: Verify

Run the project's verification commands:

```bash
vp check    # TypeScript type checking — must pass, no errors
vp test     # All tests green — existing + new
```

Confirm:

- No new dependencies added
- No files outside `src/lib/` modified
- No barrel/index files created
- No `Object.freeze` missing on output

## Non-Goals

- Database, persistence, or storage layer of any kind
- Network calls, HTTP client, API adapter, or provider SDK
- Effect service or workflow
- React component, TanStack Router route, or UI of any kind
- `AnswerSnapshot.body` usage or extension
- Shared utility extraction (keep `fnv1a64` and `isNumericId` duplicated per file, as existing pattern)
- `AnswerExcerpt` indexing, deduplication, or search logic
- `Article` records of any kind
- `AnswerSnapshot.body` mutation or extended use

## Recommendation: Implement All Three Steps Now

All three steps are small, independent, and follow established patterns exactly.
The domain record is the smallest useful unit of work — it decouples the ingestion
boundary decision from the product invariant (never store summary in `AnswerSnapshot.body`).
Future tickets (network adapter, persistence, UI) can build on this record without
revisiting the boundary decision.

The redesigned token removes the phantom `snapshotFingerprint` dependency, making
`AnswerExcerpt` independently constructible from data the parser already produces.

(2 files created, 0 files modified)
