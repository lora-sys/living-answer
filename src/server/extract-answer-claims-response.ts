import type { AnswerClaim } from "../lib/answer-claim";

// ── Failure codes (serializable strings) ────────────────────────────────────────

export type ExtractAnswerClaimsFailureCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_ANSWER_URL"
  | "MISSING_ACCESS_SECRET"
  | "MISSING_OPENAI_KEY"
  | "ANSWER_NOT_FOUND"
  | "INVALID_PROVIDER_ANSWER"
  | "PROVIDER_ERROR"
  | "CLAIM_STORE_ERROR";

// ── Serializable claim (strips Effect-specific fields) ─────────────────────────

/**
 * JSON-safe representation of an {@link AnswerClaim}.
 * All fields are plain strings or numbers — safe for serialization.
 */
export interface ClaimRecord {
  readonly questionId: string;
  readonly answerId: string;
  readonly sourceContentId: string;
  readonly sourceContentType: string;
  readonly sourceEditTime: number;
  readonly excerptFingerprint: string;
  readonly claimFingerprint: string;
  readonly claimText: string;
  readonly anchorText: string;
  readonly volatility: "high" | "medium" | "low";
  readonly decisionRelevance: "high" | "medium" | "low";
  readonly candidateReason: string;
  readonly extractedAt: number;
  readonly status: "candidate";
}

/**
 * Convert an {@link AnswerClaim} to a JSON-safe {@link ClaimRecord}.
 */
export const toClaimRecord = (claim: AnswerClaim): ClaimRecord => ({
  questionId: claim.questionId,
  answerId: claim.answerId,
  sourceContentId: claim.sourceContentId,
  sourceContentType: claim.sourceContentType,
  sourceEditTime: claim.sourceEditTime,
  excerptFingerprint: claim.excerptFingerprint,
  claimFingerprint: claim.claimFingerprint,
  claimText: claim.claimText,
  anchorText: claim.anchorText,
  volatility: claim.volatility,
  decisionRelevance: claim.decisionRelevance,
  candidateReason: claim.candidateReason,
  extractedAt: claim.extractedAt,
  status: claim.status,
});

// ── Response union ──────────────────────────────────────────────────────────────

export type ExtractAnswerClaimsResponse =
  | { readonly status: "ok"; readonly claims: readonly ClaimRecord[] }
  | { readonly status: "error"; readonly code: ExtractAnswerClaimsFailureCode };

// ── Response constructors ───────────────────────────────────────────────────────

export const okResponse = (claims: readonly AnswerClaim[]): ExtractAnswerClaimsResponse => ({
  status: "ok",
  claims: claims.map(toClaimRecord),
});

export const errorResponse = (
  code: ExtractAnswerClaimsFailureCode,
): ExtractAnswerClaimsResponse => ({
  status: "error",
  code,
});
