/**
 * Immutable {@link AnswerExcerpt} factory.
 *
 * Captures a summary-class excerpt of a Zhihu answer (the `ContentText` value
 * from the open API). The excerpt is a *separate observation* from
 * {@link AnswerSnapshot} — it lives at the ingestion boundary and never stores
 * summary data in a full snapshot's `body`.
 *
 * Business failures are returned as a discriminated union; this function never
 * throws.
 *
 * @module answer-excerpt
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Reason an excerpt creation returned `{ _tag: "failure" }`. */
export type AnswerExcerptFailureReason =
  | "INVALID_QUESTION_ID"
  | "INVALID_ANSWER_ID"
  | "INVALID_CAPTURED_AT"
  | "INVALID_SOURCE_CONTENT_ID"
  | "INVALID_SOURCE_CONTENT_TYPE"
  | "INVALID_SOURCE_EDIT_TIME"
  | "EMPTY_EXCERPT";

/** Input for {@link createAnswerExcerpt}. */
export interface AnswerExcerptInput {
  readonly questionId: string;
  readonly answerId: string;
  readonly capturedAt: number;
  readonly sourceContentId: string;
  readonly sourceContentType: "Answer";
  readonly sourceEditTime: number;
  readonly excerpt: string;
}

/** Immutable excerpt record. */
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Validate that `value` is a non-empty numeric string. */
const isNumericId = (value: string): boolean => value !== "" && /^\d+$/.test(value);

/** Normalise a text field: NFC → CRLF/CR to LF → trim. */
const normalizeText = (raw: string): string => {
  const nfc = raw.normalize("NFC");
  const lf = nfc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return lf.trim();
};

// ── FNV-1a Fingerprint ────────────────────────────────────────────────────────

/**
 * Compute the FNV-1a hash over `data`.
 *
 * Returns a 64-bit result (high + low 32-bit parts) as two unsigned integers.
 * This hash is **non-cryptographic** and intended only for identity/caching;
 * it must never be used for security, signing, or deduplication against
 * adversarial inputs.
 */
export const fnv1a64 = (data: string): [high: number, low: number] => {
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
 * The fingerprint covers the answer identity, the source meta-data, the
 * **normalised** excerpt, and `capturedAt`.  `capturedAt` is intentionally
 * included because an excerpt is a time-stamped event — two API calls at
 * different moments returning the same text are different observations.
 *
 * @note This is a non-cryptographic hash suitable for equality checks and
 *       cache keys only.
 */
const buildFingerprint = ({
  questionId,
  answerId,
  sourceContentId,
  sourceContentType,
  sourceEditTime,
  excerpt,
  capturedAt,
}: {
  questionId: string;
  answerId: string;
  sourceContentId: string;
  sourceContentType: string;
  sourceEditTime: number;
  excerpt: string;
  capturedAt: number;
}): string => {
  const material = [
    "questionId:" + questionId,
    "answerId:" + answerId,
    "sourceContentId:" + sourceContentId,
    "sourceContentType:" + sourceContentType,
    "sourceEditTime:" + String(sourceEditTime),
    "excerpt:" + excerpt,
    "capturedAt:" + String(capturedAt),
  ].join("\n");
  const [high, low] = fnv1a64(material);

  const hex = [high.toString(16).padStart(8, "0"), low.toString(16).padStart(8, "0")].join("");

  return `v1:${hex}`;
};

// ── Public API ────────────────────────────────────────────────────────────────

const failure = (reason: AnswerExcerptFailureReason): AnswerExcerptFailure => ({
  _tag: "failure",
  reason,
});

/**
 * Create an immutable {@link AnswerExcerpt} from raw input.
 *
 * Validation order:
 * 1. Safe-integer, non-negative `capturedAt`
 * 2. `questionId` — non-empty numeric string
 * 3. `answerId` — non-empty numeric string
 * 4. `sourceContentId` — canonical decimal string matching `^-?(?:0|[1-9][0-9]*)$`
 * 5. `sourceContentType` — runtime equality with `"Answer"`
 * 6. `sourceEditTime` — safe integer, non-negative
 * 7. Excerpt normalisation (NFC → LF → trim) and non-empty check
 *
 * Never throws – returns {@link AnswerExcerptFailure} on any validation error.
 *
 * The input interface uses the literal type `sourceContentType: "Answer"` for
 * ergonomics and compile-time narrowing, but the factory still performs a
 * runtime equality check because API payloads and other external data are
 * untrusted: a TypeScript type does not validate runtime data.
 */
export const createAnswerExcerpt = (input: AnswerExcerptInput): AnswerExcerptResult => {
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

  // 4. sourceContentId

  if (
    typeof input.sourceContentId !== "string" ||
    !/^(?:0|-?[1-9][0-9]*)$/.test(input.sourceContentId)
  ) {
    return failure("INVALID_SOURCE_CONTENT_ID");
  }

  // 5. sourceContentType

  if (input.sourceContentType !== "Answer") {
    return failure("INVALID_SOURCE_CONTENT_TYPE");
  }

  // 6. sourceEditTime

  if (!Number.isSafeInteger(input.sourceEditTime) || input.sourceEditTime < 0) {
    return failure("INVALID_SOURCE_EDIT_TIME");
  }

  // 7. excerpt normalisation and non-empty check

  if (typeof input.excerpt !== "string") {
    return failure("EMPTY_EXCERPT");
  }

  const excerpt = normalizeText(input.excerpt);

  if (excerpt === "") {
    return failure("EMPTY_EXCERPT");
  }

  // ── assemble ────────────────────────────────────────────────────────────────

  const answerExcerpt: AnswerExcerpt = Object.freeze({
    questionId: input.questionId,
    answerId: input.answerId,
    capturedAt: input.capturedAt,
    sourceContentId: input.sourceContentId,
    sourceContentType: "Answer",
    sourceEditTime: input.sourceEditTime,
    excerpt,
    fingerprint: buildFingerprint({
      questionId: input.questionId,
      answerId: input.answerId,
      sourceContentId: input.sourceContentId,
      sourceContentType: input.sourceContentType,
      sourceEditTime: input.sourceEditTime,
      excerpt,
      capturedAt: input.capturedAt,
    }),
  });

  return { _tag: "success", excerpt: answerExcerpt };
};
