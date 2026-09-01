import {
  AmbiguousAnswerProviderError,
  AnswerExcerptProviderError,
  AnswerNotFoundProviderError,
  InvalidProviderAnswerError,
  QuotaExceededProviderError,
  RateLimitedProviderError,
  UnsupportedAnswerUrlError,
} from "../lib/answer-excerpt-provider";

import type { AnswerExcerpt } from "../lib/answer-excerpt";

// ── Failure codes (serializable strings) ──────────────────────────────────────

export type AnswerExcerptServerFailureCode =
  | "INVALID_REQUEST"
  | "MISSING_ACCESS_SECRET"
  | "UNSUPPORTED_ANSWER_URL"
  | "ANSWER_NOT_FOUND"
  | "AMBIGUOUS_ANSWER"
  | "INVALID_PROVIDER_ANSWER"
  | "PROVIDER_ERROR"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_QUOTA_EXCEEDED"
  | "THREAD_NOT_FOUND"
  | "THREAD_CORRUPTED"
  | "ARTIFACT_STORE_FAILURE";

/** All server failure codes returned by the thread flow. */
export type ThreadServerFailureCode =
  | AnswerExcerptServerFailureCode
  | "CLARIFICATION_UNAVAILABLE"
  | "SYNTHESIS_UNAVAILABLE";

// ── Response union ─────────────────────────────────────────────────────────────

export type ResolveAnswerExcerptResponse =
  | { readonly status: "ok"; readonly excerpt: AnswerExcerpt }
  | { readonly status: "error"; readonly code: AnswerExcerptServerFailureCode };

// ── Mapper ─────────────────────────────────────────────────────────────────────

/**
 * Map a provider-level failure to the serializable server failure code.
 * No credentials, headers, response bodies, stack traces, or error causes
 * are leaked in the result.
 */
export const toServerFailureCode = (error: unknown): AnswerExcerptServerFailureCode => {
  if (error instanceof UnsupportedAnswerUrlError) {
    return "UNSUPPORTED_ANSWER_URL";
  }
  if (error instanceof AnswerNotFoundProviderError) {
    return "ANSWER_NOT_FOUND";
  }
  if (error instanceof AmbiguousAnswerProviderError) {
    return "AMBIGUOUS_ANSWER";
  }
  if (error instanceof InvalidProviderAnswerError) {
    return "INVALID_PROVIDER_ANSWER";
  }
  if (error instanceof RateLimitedProviderError) {
    return "PROVIDER_RATE_LIMITED";
  }
  if (error instanceof QuotaExceededProviderError) {
    return "PROVIDER_QUOTA_EXCEEDED";
  }
  if (error instanceof AnswerExcerptProviderError) {
    return "PROVIDER_ERROR";
  }
  // Unknown failure shape — do not expose internal details.
  return "PROVIDER_ERROR";
};

export const okResponse = (excerpt: AnswerExcerpt): ResolveAnswerExcerptResponse => ({
  status: "ok",
  excerpt,
});

export const errorResponse = (
  code: AnswerExcerptServerFailureCode,
): ResolveAnswerExcerptResponse => ({
  status: "error",
  code,
});
