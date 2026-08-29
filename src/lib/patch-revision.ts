/**
 * Immutable {@link PatchRevision} factory.
 *
 * Records one actual visible UPDATE revision. A revision captures that a patch
 * body was applied to an answer snapshot with supporting evidence at a known
 * time. It does not decide whether a patch should exist and does not fetch,
 * persist, import, or expose anything.
 *
 * Business failures are returned as a discriminated union; this function never
 * throws.
 *
 * @module patch-revision
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Reason a patch-revision creation returned `{ _tag: "failure" }`. */
export type PatchRevisionFailureReason =
  | "INVALID_CAPTURED_AT"
  | "INVALID_ANSWER_SNAPSHOT_FINGERPRINT"
  | "INVALID_EVIDENCE_FINGERPRINT"
  | "EMPTY_PATCH_BODY";

/** Input for {@link createPatchRevision}. */
export interface PatchRevisionInput {
  readonly patchBody: string;
  readonly answerSnapshotFingerprint: string;
  readonly evidenceFingerprint: string;
  readonly capturedAt: number;
}

/** Immutable patch-revision record. */
export interface PatchRevision {
  readonly patchBody: string;
  readonly answerSnapshotFingerprint: string;
  readonly evidenceFingerprint: string;
  readonly capturedAt: number;
  readonly fingerprint: string;
}

/** Success branch of {@link PatchRevisionResult}. */
export interface PatchRevisionSuccess {
  readonly _tag: "success";
  readonly revision: PatchRevision;
}

/** Failure branch of {@link PatchRevisionResult}. */
export interface PatchRevisionFailure {
  readonly _tag: "failure";
  readonly reason: PatchRevisionFailureReason;
}

export type PatchRevisionResult = PatchRevisionSuccess | PatchRevisionFailure;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise body text: NFC → CRLF/CR to LF → trim. */
const normalizeBody = (raw: string): string => {
  const nfc = raw.normalize("NFC");
  const lf = nfc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return lf.trim();
};

/**
 * Validate that `value` matches a versioned 64-bit fingerprint produced by
 * this module's {@link buildFingerprint}: `v1:` followed by exactly 16
 * lowercase hex characters.
 */
const isValidFingerprint = (value: string): boolean => /^v1:[0-9a-f]{16}$/.test(value);

// ── FNV-1a Fingerprint ────────────────────────────────────────────────────────

/**
 * Compute the FNV-1a hash over `data`.
 *
 * Returns a 64-bit result (high + low 32-bit parts) as two unsigned integers.
 *
 * **This hash is non-cryptographic** and intended only for identity/caching;
 * it must never be used for security, signing, or deduplication against
 * adversarial inputs.
 */
const fnv1a64 = (data: string): [high: number, low: number] => {
  const FNV_OFFSET_BASIS = 14695981039346656037n;
  const fnvPrime = 1099511628211n;

  let h64 = FNV_OFFSET_BASIS;

  for (let i = 0; i < data.length; i++) {
    h64 ^= BigInt(data.charCodeAt(i));
    h64 *= fnvPrime;
  }

  const mask = 0xffffffffn;
  const high = Number((h64 >> 32n) & mask);
  const low = Number(h64 & mask);

  return [high, low];
};

/**
 * Versioned fingerprint: `v1:` + zero-padded 16-lowercase-hex FNV-1a 64-bit
 * hash of the composite key.
 *
 * The fingerprint covers the normalised `patchBody`, the
 * `answerSnapshotFingerprint`, the `evidenceFingerprint`, and `capturedAt`.
 * `capturedAt` is intentionally included because a revision is an _event_;
 * the same patch applied at a different moment is a different revision.
 *
 * @note This is a non-cryptographic hash suitable for equality checks and
 *       cache keys only.
 */
const buildFingerprint = (
  patchBody: string,
  answerSnapshotFingerprint: string,
  evidenceFingerprint: string,
  capturedAt: number,
): string => {
  const material = [
    "patchBody:" + patchBody,
    "answerSnapshotFingerprint:" + answerSnapshotFingerprint,
    "evidenceFingerprint:" + evidenceFingerprint,
    "capturedAt:" + String(capturedAt),
  ].join("\n");
  const [high, low] = fnv1a64(material);

  const hex = [high.toString(16).padStart(8, "0"), low.toString(16).padStart(8, "0")].join("");

  return `v1:${hex}`;
};

// ── Public API ────────────────────────────────────────────────────────────────

const failure = (reason: PatchRevisionFailureReason): PatchRevisionFailure => ({
  _tag: "failure",
  reason,
});

/**
 * Create an immutable {@link PatchRevision} from raw input.
 *
 * Validation order:
 * 1. Safe-integer, non-negative `capturedAt`
 * 2. `answerSnapshotFingerprint` format `^v1:[0-9a-f]{16}$`
 * 3. `evidenceFingerprint` format `^v1:[0-9a-f]{16}$`
 * 4. Patch-body normalisation (NFC → LF → trim) and non-empty check
 *
 * Never throws – returns {@link PatchRevisionFailure} on any validation error.
 */
export const createPatchRevision = (input: PatchRevisionInput): PatchRevisionResult => {
  // 1. capturedAt (no dependency on normalisation)

  if (!Number.isSafeInteger(input.capturedAt) || input.capturedAt < 0) {
    return failure("INVALID_CAPTURED_AT");
  }

  // 2. answerSnapshotFingerprint

  if (!isValidFingerprint(input.answerSnapshotFingerprint)) {
    return failure("INVALID_ANSWER_SNAPSHOT_FINGERPRINT");
  }

  // 3. evidenceFingerprint

  if (!isValidFingerprint(input.evidenceFingerprint)) {
    return failure("INVALID_EVIDENCE_FINGERPRINT");
  }

  // 4. patchBody normalisation and non-empty check

  const patchBody = normalizeBody(input.patchBody);

  if (patchBody === "") {
    return failure("EMPTY_PATCH_BODY");
  }

  // ── assemble ────────────────────────────────────────────────────────────────

  const revision: PatchRevision = Object.freeze({
    patchBody,
    answerSnapshotFingerprint: input.answerSnapshotFingerprint,
    evidenceFingerprint: input.evidenceFingerprint,
    capturedAt: input.capturedAt,
    fingerprint: buildFingerprint(
      patchBody,
      input.answerSnapshotFingerprint,
      input.evidenceFingerprint,
      input.capturedAt,
    ),
  });

  return { _tag: "success", revision };
};
