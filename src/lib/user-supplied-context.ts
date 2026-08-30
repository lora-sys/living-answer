/**
 * Immutable {@link UserSuppliedContext} factory.
 *
 * Captures untrusted context text supplied by a user alongside metadata about
 * which answer it targets.  The context text is treated as opaque user content
 * and preserved verbatim after Unicode NFC normalisation and line-ending /
 * whitespace stabilisation.
 *
 * Business failures are returned as a discriminated union; this function never
 * throws.
 *
 * @module user-supplied-context
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/** Reason a user-supplied-context creation returned `{ _tag: "failure" }`. */
export type UserSuppliedContextFailureReason =
  | "INVALID_QUESTION_ID"
  | "INVALID_ANSWER_ID"
  | "INVALID_CAPTURED_AT"
  | "INVALID_CONTEXT_TEXT";

/** Input for {@link createUserSuppliedContext}. */
export interface UserSuppliedContextInput {
  readonly questionId: string;
  readonly answerId: string;
  readonly contextText: string;
  readonly capturedAt: number;
}

/** Immutable user-supplied-context record. */
export interface UserSuppliedContext {
  readonly questionId: string;
  readonly answerId: string;
  readonly contextText: string;
  readonly capturedAt: number;
  readonly fingerprint: string;
}

/** Success branch of {@link UserSuppliedContextResult}. */
export interface UserSuppliedContextSuccess {
  readonly _tag: "success";
  readonly context: UserSuppliedContext;
}

/** Failure branch of {@link UserSuppliedContextResult}. */
export interface UserSuppliedContextFailure {
  readonly _tag: "failure";
  readonly reason: UserSuppliedContextFailureReason;
}

export type UserSuppliedContextResult = UserSuppliedContextSuccess | UserSuppliedContextFailure;

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Validate that `value` is a non-empty numeric string. */
const isNumericId = (value: string): boolean => value !== "" && /^\d+$/.test(value);

/** Normalise a text field: NFC → CRLF/CR to LF → trim. */
const normalizeText = (raw: string): string => {
  const nfc = raw.normalize("NFC");
  const lf = nfc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return lf.trim();
};

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
 * The fingerprint covers `questionId`, `answerId`, and the **normalised**
 * `contextText`.  `capturedAt` is intentionally excluded so that the same
 * context text targeting the same answer shares identity regardless of when it
 * was captured.
 *
 * @note This is a non-cryptographic hash suitable for equality checks and
 *       cache keys only.
 */
const buildFingerprint = (
  questionId: string,
  answerId: string,
  normalizedContextText: string,
): string => {
  const material = `questionId:${questionId}\nanswerId:${answerId}\ncontextText:${normalizedContextText}`;
  const [high, low] = fnv1a64(material);

  const hex = [high.toString(16).padStart(8, "0"), low.toString(16).padStart(8, "0")].join("");

  return `v1:${hex}`;
};

// ── Public API ────────────────────────────────────────────────────────────────

const failure = (reason: UserSuppliedContextFailureReason): UserSuppliedContextFailure => ({
  _tag: "failure",
  reason,
});

/**
 * Create an immutable {@link UserSuppliedContext} from raw input.
 *
 * The `contextText` field is treated as untrusted user-supplied data.  It is
 * normalised (Unicode NFC → LF → trim) and preserved verbatim; nothing is
 * stripped or reinterpreted beyond normalisation.
 *
 * Validation order:
 * 1. Safe-integer, non-negative `capturedAt`
 * 2. `questionId` — non-empty numeric string
 * 3. `answerId` — non-empty numeric string
 * 4. `contextText` normalisation and non-empty check
 *
 * Never throws – returns {@link UserSuppliedContextFailure} on any validation
 * error.
 */
export const createUserSuppliedContext = (
  input: UserSuppliedContextInput,
): UserSuppliedContextResult => {
  // 1. capturedAt (no dependency on normalisation)

  if (!Number.isSafeInteger(input.capturedAt) || input.capturedAt < 0) {
    return failure("INVALID_CAPTURED_AT");
  }

  // 2. questionId

  if (!isNumericId(input.questionId)) {
    return failure("INVALID_QUESTION_ID");
  }

  // 3. answerId

  if (!isNumericId(input.answerId)) {
    return failure("INVALID_ANSWER_ID");
  }

  // 4. contextText normalisation and non-empty check

  const contextText = normalizeText(input.contextText);

  if (contextText === "") {
    return failure("INVALID_CONTEXT_TEXT");
  }

  // ── assemble ────────────────────────────────────────────────────────────────

  const ctx: UserSuppliedContext = Object.freeze({
    questionId: input.questionId,
    answerId: input.answerId,
    contextText,
    capturedAt: input.capturedAt,
    fingerprint: buildFingerprint(input.questionId, input.answerId, contextText),
  });

  return { _tag: "success", context: ctx };
};
