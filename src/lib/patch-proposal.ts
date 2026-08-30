/**
 * Immutable {@link PatchProposal} factory.
 *
 * A draft proposal that links a proposed patch body to the context that
 * motivated it and an optional piece of supporting evidence.  All references
 * are validated as versioned FNV-1a fingerprints before the record is frozen.
 *
 * Business failures are returned as a discriminated union; this function never
 * throws.
 *
 * @module patch-proposal
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/** Reason a patch-proposal creation returned `{ _tag: "failure" }`. */
export type PatchProposalFailureReason =
  | "INVALID_CAPTURED_AT"
  | "INVALID_ANSWER_SNAPSHOT_FINGERPRINT"
  | "INVALID_CONTEXT_FINGERPRINT"
  | "INVALID_EVIDENCE_FINGERPRINT"
  | "EMPTY_PROPOSED_BODY";

/** Input for {@link createPatchProposal}. */
export interface PatchProposalInput {
  readonly proposedBody: string;
  readonly answerSnapshotFingerprint: string;
  readonly contextFingerprint: string;
  readonly evidenceFingerprint?: string;
  readonly capturedAt: number;
}

/** Immutable patch-proposal record. */
export interface PatchProposal {
  readonly proposedBody: string;
  readonly answerSnapshotFingerprint: string;
  readonly contextFingerprint: string;
  readonly evidenceFingerprint: string | undefined;
  readonly capturedAt: number;
  readonly fingerprint: string;
}

/** Success branch of {@link PatchProposalResult}. */
export interface PatchProposalSuccess {
  readonly _tag: "success";
  readonly proposal: PatchProposal;
}

/** Failure branch of {@link PatchProposalResult}. */
export interface PatchProposalFailure {
  readonly _tag: "failure";
  readonly reason: PatchProposalFailureReason;
}

export type PatchProposalResult = PatchProposalSuccess | PatchProposalFailure;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Normalise body text: NFC → CRLF/CR to LF → trim. */
const normalizeBody = (raw: string): string => {
  const nfc = raw.normalize("NFC");
  const lf = nfc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return lf.trim();
};

/**
 * Validate a versioned 64-bit fingerprint: `v1:` followed by exactly 16
 * lowercase hex characters.
 */
const isValidFingerprint = (value: string): boolean => /^v1:[0-9a-f]{16}$/.test(value);

// ── FNV-1a Fingerprint ─────────────────────────────────────────────────────────

/**
 * Compute the FNV-1a hash over `data`.
 *
 * Returns a 64-bit result (high + low 32-bit parts) as two unsigned integers.
 * This hash is **non-cryptographic** and intended only for identity/caching;
 * it must never be used for security, signing, or deduplication against
 * adversarial inputs.
 */
const fnv1a64 = (data: string): [high: number, low: number] => {
  // 64-bit FNV-1a
  const FNV_OFFSET_BASIS = 14695981039346656037n;
  const fnvPrime = 1099511628211n;

  let h64 = FNV_OFFSET_BASIS;

  for (let i = 0; i < data.length; i++) {
    h64 ^= BigInt(data.charCodeAt(i));
    h64 *= fnvPrime;
  }

  // Split into two 32-bit unsigned halves for the prefix
  const mask = 0xffffffffn;
  const high = Number((h64 >> 32n) & mask);
  const low = Number(h64 & mask);

  return [high, low];
};

/**
 * Versioned fingerprint: `v1:` + zero-padded 16-lowercase-hex FNV-1a 64-bit
 * hash of the composite key.
 *
 * The fingerprint covers the normalised `proposedBody`, the
 * `answerSnapshotFingerprint`, the `contextFingerprint`, an explicit presence
 * marker for `evidenceFingerprint`, and `capturedAt`.  `capturedAt` is
 * intentionally included because a proposal is an _event_; the same patch
 * proposed at a different moment is a different proposal.
 *
 * @note This is a non-cryptographic hash suitable for equality checks and
 *       cache keys only.
 */
const buildFingerprint = (
  proposedBody: string,
  answerSnapshotFingerprint: string,
  contextFingerprint: string,
  evidenceFingerprint: string | undefined,
  capturedAt: number,
): string => {
  const evidenceComponent =
    evidenceFingerprint !== undefined
      ? `evidenceFingerprint:${evidenceFingerprint}`
      : "evidenceFingerprint:";
  const material = [
    "proposedBody:" + proposedBody,
    "answerSnapshotFingerprint:" + answerSnapshotFingerprint,
    "contextFingerprint:" + contextFingerprint,
    evidenceComponent,
    "capturedAt:" + String(capturedAt),
  ].join("\n");
  const [high, low] = fnv1a64(material);

  const hex = [high.toString(16).padStart(8, "0"), low.toString(16).padStart(8, "0")].join("");

  return `v1:${hex}`;
};

// ── Public API ────────────────────────────────────────────────────────────────

const failure = (reason: PatchProposalFailureReason): PatchProposalFailure => ({
  _tag: "failure",
  reason,
});

/**
 * Create an immutable {@link PatchProposal} from raw input.
 *
 * The `proposedBody` field is treated as untrusted content.  It is normalised
 * (Unicode NFC → LF → trim) and preserved verbatim; nothing is stripped or
 * reinterpreted beyond normalisation.
 *
 * Validation order:
 * 1. Safe-integer, non-negative `capturedAt`
 * 2. `answerSnapshotFingerprint` format `^v1:[0-9a-f]{16}$`
 * 3. `contextFingerprint` format `^v1:[0-9a-f]{16}$`
 * 4. `evidenceFingerprint` format `^v1:[0-9a-f]{16}$` when provided;
 *    whitespace-only is treated as absent
 * 5. `proposedBody` normalisation and non-empty check
 *
 * Never throws – returns {@link PatchProposalFailure} on any validation error.
 */
export const createPatchProposal = (input: PatchProposalInput): PatchProposalResult => {
  // 1. capturedAt (no dependency on normalisation)

  if (!Number.isSafeInteger(input.capturedAt) || input.capturedAt < 0) {
    return failure("INVALID_CAPTURED_AT");
  }

  // 2. answerSnapshotFingerprint

  if (!isValidFingerprint(input.answerSnapshotFingerprint)) {
    return failure("INVALID_ANSWER_SNAPSHOT_FINGERPRINT");
  }

  // 3. contextFingerprint

  if (!isValidFingerprint(input.contextFingerprint)) {
    return failure("INVALID_CONTEXT_FINGERPRINT");
  }

  // 4. evidenceFingerprint (optional; trim and validate if present)

  let evidenceFingerprint: string | undefined;
  if (input.evidenceFingerprint !== undefined) {
    const trimmed = input.evidenceFingerprint.trim();
    if (trimmed === "") {
      evidenceFingerprint = undefined;
    } else if (!isValidFingerprint(trimmed)) {
      return failure("INVALID_EVIDENCE_FINGERPRINT");
    } else {
      evidenceFingerprint = trimmed;
    }
  }

  // 5. proposedBody normalisation and non-empty check

  const proposedBody = normalizeBody(input.proposedBody);

  if (proposedBody === "") {
    return failure("EMPTY_PROPOSED_BODY");
  }

  // ── assemble ────────────────────────────────────────────────────────────────

  const proposal: PatchProposal = Object.freeze({
    proposedBody,
    answerSnapshotFingerprint: input.answerSnapshotFingerprint,
    contextFingerprint: input.contextFingerprint,
    evidenceFingerprint,
    capturedAt: input.capturedAt,
    fingerprint: buildFingerprint(
      proposedBody,
      input.answerSnapshotFingerprint,
      input.contextFingerprint,
      evidenceFingerprint,
      input.capturedAt,
    ),
  });

  return { _tag: "success", proposal };
};
