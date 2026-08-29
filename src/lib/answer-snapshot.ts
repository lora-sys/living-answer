/**
 * Immutable {@link AnswerSnapshot} factory.
 *
 * Normalises the body (Unicode NFC → CRLF/CR ⇒ LF → trim) and validates every
 * field.  The resulting snapshot is {@link Object.freeze}'d.  Business failures
 * are returned as a discriminated union; this function never throws.
 *
 * @module answer-snapshot
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** Reason a snapshot creation returned `{ _tag: "failure" }`. */
export type AnswerSnapshotFailureReason =
  | "INVALID_QUESTION_ID"
  | "INVALID_ANSWER_ID"
  | "INVALID_CAPTURED_AT"
  | "EMPTY_BODY";

/** Input for {@link createAnswerSnapshot}. */
export interface AnswerSnapshotInput {
  readonly questionId: string;
  readonly answerId: string;
  readonly capturedAt: number;
  readonly body: string;
}

/** Immutable historical record of a captured answer. */
export interface AnswerSnapshot {
  readonly questionId: string;
  readonly answerId: string;
  readonly capturedAt: number;
  readonly body: string;
  readonly fingerprint: string;
}

/** Success branch of {@link AnswerSnapshotResult}. */
export interface AnswerSnapshotSuccess {
  readonly _tag: "success";
  readonly snapshot: AnswerSnapshot;
}

/** Failure branch of {@link AnswerSnapshotResult}. */
export interface AnswerSnapshotFailure {
  readonly _tag: "failure";
  readonly reason: AnswerSnapshotFailureReason;
}

export type AnswerSnapshotResult = AnswerSnapshotSuccess | AnswerSnapshotFailure;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Validate that `value` is a non-empty numeric string. */
const isNumericId = (value: string): boolean => value !== "" && /^\d+$/.test(value);

/** Normalise body text: NFC → CRLF/CR to LF → trim. */
const normalizeBody = (raw: string): string => {
  const nfc = raw.normalize("NFC");
  const lf = nfc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return lf.trim();
};

// ── FNV-1a Fingerprint ──────────────────────────────────────────────────────

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
 * The fingerprint covers `questionId`, `answerId`, and the **normalised** body.
 * `capturedAt` is intentionally excluded so snapshots of the *same* content
 * taken at different times share an identity.
 *
 * @note This is a non-cryptographic hash suitable for equality checks and
 *       cache keys only.
 */
const buildFingerprint = (questionId: string, answerId: string, normalizedBody: string): string => {
  const material = `${questionId}\n${answerId}\n${normalizedBody}`;
  const [high, low] = fnv1a64(material);

  const hex = [high.toString(16).padStart(8, "0"), low.toString(16).padStart(8, "0")].join("");

  return `v1:${hex}`;
};

// ── Public API ──────────────────────────────────────────────────────────────

const failure = (reason: AnswerSnapshotFailureReason): AnswerSnapshotFailure => ({
  _tag: "failure",
  reason,
});

/**
 * Create an immutable {@link AnswerSnapshot} from raw input.
 *
 * Validation order:
 * 1. Numeric, non-empty IDs
 * 2. Safe-integer, non-negative `capturedAt`
 * 3. Body normalisation (NFC → LF → trim) and non-whitespace check
 *
 * Never throws – returns {@link AnswerSnapshotFailure} on any validation error.
 */
export const createAnswerSnapshot = (input: AnswerSnapshotInput): AnswerSnapshotResult => {
  if (!isNumericId(input.questionId)) {
    return failure("INVALID_QUESTION_ID");
  }
  if (!isNumericId(input.answerId)) {
    return failure("INVALID_ANSWER_ID");
  }
  if (!Number.isSafeInteger(input.capturedAt) || input.capturedAt < 0) {
    return failure("INVALID_CAPTURED_AT");
  }

  const body = normalizeBody(input.body);

  if (body === "") {
    return failure("EMPTY_BODY");
  }

  const snapshot: AnswerSnapshot = Object.freeze({
    questionId: input.questionId,
    answerId: input.answerId,
    capturedAt: input.capturedAt,
    body,
    fingerprint: buildFingerprint(input.questionId, input.answerId, body),
  });

  return { _tag: "success", snapshot };
};
