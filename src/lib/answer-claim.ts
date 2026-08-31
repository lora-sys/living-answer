/**
 * Immutable {@link AnswerClaim} factory.
 *
 * A candidate claim extracted from a persisted {@link AnswerExcerpt}.  Captures
 * a concise, decision-relevant premise anchored verbatim to the excerpt text.
 * Claims are intermediate products: they live below the Evidence Gate and must
 * never be presented as verified patches.
 *
 * Business failures are returned as a discriminated union; this function never
 * throws.
 *
 * @module answer-claim
 */

import { fnv1a64 } from "./answer-excerpt";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Reason an {@link AnswerClaim} creation returned `{ _tag: "failure" }`. */
export type AnswerClaimFailureReason =
  | "INVALID_QUESTION_ID"
  | "INVALID_ANSWER_ID"
  | "INVALID_SOURCE_CONTENT_ID"
  | "INVALID_SOURCE_CONTENT_TYPE"
  | "INVALID_SOURCE_EDIT_TIME"
  | "INVALID_EXCERPT_FINGERPRINT"
  | "INVALID_EXCERPT_TEXT"
  | "INVALID_CLAIM_TEXT"
  | "INVALID_ANCHOR_TEXT"
  | "INVALID_VOLATILITY"
  | "INVALID_DECISION_RELEVANCE"
  | "INVALID_CANDIDATE_REASON"
  | "INVALID_EXTRACTED_AT"
  | "ANCHOR_NOT_IN_EXCERPT";

/** Volatility classification of a claim. */
export type ClaimVolatility = "high" | "medium" | "low";

/** Decision-relevance classification of a claim. */
export type ClaimDecisionRelevance = "high" | "medium" | "low";

/** Status of an AnswerClaim. */
export type ClaimStatus = "candidate";

/** Input for {@link createAnswerClaim}. */
export interface AnswerClaimInput {
  readonly questionId: string;
  readonly answerId: string;
  readonly sourceContentId: string;
  readonly sourceContentType: "Answer";
  readonly sourceEditTime: number;
  readonly excerptFingerprint: string;
  /** Normalized excerpt text; the anchor must be an exact substring of it. */
  readonly excerpt: string;
  readonly claimText: string;
  readonly anchorText: string;
  readonly volatility: "high" | "medium" | "low";
  readonly decisionRelevance: "high" | "medium" | "low";
  readonly candidateReason: string;
  readonly extractedAt: number;
  readonly status?: ClaimStatus;
}

/** Immutable candidate-claim record. */
export interface AnswerClaim {
  readonly questionId: string;
  readonly answerId: string;
  readonly sourceContentId: string;
  readonly sourceContentType: "Answer";
  readonly sourceEditTime: number;
  readonly excerptFingerprint: string;
  readonly claimText: string;
  readonly anchorText: string;
  readonly volatility: ClaimVolatility;
  readonly decisionRelevance: ClaimDecisionRelevance;
  readonly candidateReason: string;
  readonly extractedAt: number;
  readonly claimFingerprint: string;
  readonly status: ClaimStatus;
}

/** Success branch of {@link AnswerClaimResult}. */
export interface AnswerClaimSuccess {
  readonly _tag: "success";
  readonly claim: AnswerClaim;
}

/** Failure branch of {@link AnswerClaimResult}. */
export interface AnswerClaimFailure {
  readonly _tag: "failure";
  readonly reason: AnswerClaimFailureReason;
}

export type AnswerClaimResult = AnswerClaimSuccess | AnswerClaimFailure;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Validate that `value` is a non-empty numeric string. */
const isNumericId = (value: string): boolean => value !== "" && /^\d+$/.test(value);

/**
 * Normalise a text field: NFC → CRLF/CR to LF → trim.
 */
const normalizeText = (raw: string): string => {
  const nfc = raw.normalize("NFC");
  const lf = nfc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return lf.trim();
};

/**
 * Validate a text field: reject control characters and enforce length limits.
 * Returns the normalised string or null on failure.
 */
const validateTextField = (raw: string, minLength: number, maxLength: number): string | null => {
  if (typeof raw !== "string") return null;
  // Normalize before validating so CRLF and Unicode forms are treated as the
  // same text. LF is the only control character allowed after normalization.
  const normalized = normalizeText(raw);
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    if (code < 0x20 && code !== 0x0a) return null;
  }
  const trimmed = normalized.trim();
  if (trimmed === "" || trimmed.length < minLength || trimmed.length > maxLength) return null;
  return trimmed;
};

/**
 * Versioned fingerprint: `v1:` + zero-padded 16-lowercase-hex FNV-1a 64-bit hash.
 */
type FingerprintMaterial = {
  readonly fingerprint: string;
  readonly claimText: string;
  readonly anchorText: string;
};

const buildFingerprint = ({ claimText, anchorText, fingerprint }: FingerprintMaterial): string => {
  const material = [
    "excerptFingerprint:" + fingerprint,
    "claimText:" + claimText,
    "anchorText:" + anchorText,
  ].join("\n");
  const [high, low] = fnv1a64(material);

  const hex = [high.toString(16).padStart(8, "0"), low.toString(16).padStart(8, "0")].join("");

  return `v1:${hex}`;
};

// ── Validation ────────────────────────────────────────────────────────────────

const VOLATILITY_VALUES: readonly string[] = ["high", "medium", "low"];
const RELEVANCE_VALUES: readonly string[] = ["high", "medium", "low"];

const validateVolatility = (raw: unknown): ClaimVolatility | null => {
  return typeof raw === "string" && VOLATILITY_VALUES.includes(raw)
    ? (raw as ClaimVolatility)
    : null;
};

const validateRelevance = (raw: unknown): ClaimDecisionRelevance | null => {
  return typeof raw === "string" && RELEVANCE_VALUES.includes(raw)
    ? (raw as ClaimDecisionRelevance)
    : null;
};

// ── Public API ────────────────────────────────────────────────────────────────

const failure = (reason: AnswerClaimFailureReason): AnswerClaimFailure => ({
  _tag: "failure",
  reason,
});

/**
 * Create an immutable {@link AnswerClaim} from raw input.
 *
 * Validation order:
 * 1. `capturedAt` - safe integer, non-negative
 * 2. `questionId` - non-empty numeric string
 * 3. `answerId` - non-empty numeric string
 * 4. `sourceContentId` - canonical decimal
 * 5. `sourceContentType` - must be "Answer"
 * 6. `sourceEditTime` - safe integer, non-negative
 * 7. `excerpt` - non-empty normalized excerpt text
 * 8. `excerptFingerprint` - non-empty v1:16hex string
 * 9. `claimText` - 24-220 chars, NFC+LF+trim, no control chars
 * 10. `anchorText` - 12-220 chars, NFC+LF+trim, no control chars, exact substring of excerpt
 * 11. `candidateReason` - 24-260 chars, NFC+LF+trim, no control chars
 * 12. `volatility` - "high" | "medium" | "low"
 * 13. `decisionRelevance` - "high" | "medium" | "low"
 *
 * Never throws.
 */
export const createAnswerClaim = (input: AnswerClaimInput): AnswerClaimResult => {
  // 1. validate capturedAt (aligned with excerpt convention)
  if (!Number.isSafeInteger(input.extractedAt) || input.extractedAt < 0) {
    return failure("INVALID_EXTRACTED_AT");
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

  // 5. sourceContentType (runtime check for untrusted input)
  if (input.sourceContentType !== "Answer") {
    return failure("INVALID_SOURCE_CONTENT_TYPE");
  }

  // 6. sourceEditTime
  if (!Number.isSafeInteger(input.sourceEditTime) || input.sourceEditTime < 0) {
    return failure("INVALID_SOURCE_EDIT_TIME");
  }

  // 7. excerpt - normalized source text used for the anchor check
  const excerpt = typeof input.excerpt === "string" ? input.excerpt.trim() : "";
  if (excerpt === "") {
    return failure("INVALID_EXCERPT_TEXT");
  }

  // 8. excerptFingerprint - non-empty v1:16hex string
  if (
    typeof input.excerptFingerprint !== "string" ||
    !input.excerptFingerprint ||
    !/^v1:[0-9a-f]{16}$/.test(input.excerptFingerprint)
  ) {
    return failure("INVALID_EXCERPT_FINGERPRINT");
  }

  // 9. claimText - 24-220 chars
  const rawClaimText = typeof input.claimText === "string" ? input.claimText : "";
  const claimText = validateTextField(rawClaimText, 24, 220);
  if (claimText === null) {
    return failure("INVALID_CLAIM_TEXT");
  }

  // 10. anchorText - 12-220 chars, must be substring of excerpt
  const rawAnchorText = typeof input.anchorText === "string" ? input.anchorText : "";
  const anchorText = validateTextField(rawAnchorText, 12, 220);
  if (anchorText === null) {
    return failure("INVALID_ANCHOR_TEXT");
  }

  // 11. candidateReason - 24-260 chars
  const rawCandidateReason = typeof input.candidateReason === "string" ? input.candidateReason : "";
  const candidateReason = validateTextField(rawCandidateReason, 24, 260);
  if (candidateReason === null) {
    return failure("INVALID_CANDIDATE_REASON");
  }

  // 12. volatility
  const volatility = validateVolatility(input.volatility);
  if (volatility === null) {
    return failure("INVALID_VOLATILITY");
  }

  // 13. decisionRelevance
  const decisionRelevance = validateRelevance(input.decisionRelevance);
  if (decisionRelevance === null) {
    return failure("INVALID_DECISION_RELEVANCE");
  }

  // Anti-hallucination: the anchor must come verbatim from the excerpt, not
  // from the claim restatement.
  if (!excerpt.includes(anchorText)) {
    return failure("ANCHOR_NOT_IN_EXCERPT");
  }

  // Assemble with label-prefixed fingerprint
  const answerClaim: AnswerClaim = Object.freeze({
    questionId: input.questionId,
    answerId: input.answerId,
    sourceContentId: input.sourceContentId,
    sourceContentType: "Answer",
    sourceEditTime: input.sourceEditTime,
    excerptFingerprint: input.excerptFingerprint,
    claimText,
    anchorText,
    volatility,
    decisionRelevance,
    candidateReason,
    extractedAt: input.extractedAt,
    claimFingerprint: buildFingerprint({
      fingerprint: input.excerptFingerprint,
      claimText,
      anchorText,
    }),
    status: input.status ?? "candidate",
  });

  return { _tag: "success", claim: answerClaim };
};
