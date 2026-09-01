/**
 * Effect-based workflow that extracts candidate {@link AnswerClaim} records
 * from a validated {@link AnswerExcerpt} by consulting the OpenAI
 * chat-completions service.
 *
 * The workflow is a pure domain construct: it does not persist, render UI,
 * read environment variables, import React, use TanStack server functions,
 * talk to SQLite, or construct provider SDK clients.
 *
 * @module claim-extraction-workflow
 */

import { Data, Effect } from "effect";
import type { AnswerExcerpt } from "./answer-excerpt";
import { OpenAiTransportError, type OpenAiChatCompletions } from "./openai-adapter";
import type { AnswerClaim } from "./answer-claim";
import { createAnswerClaim } from "./answer-claim";

// ── Errors ─────────────────────────────────────────────────────────────────────

export class ClaimExtractionError extends Data.TaggedError("ClaimExtractionError")<{
  readonly reason: "INVALID_JSON" | "INVALID_CLAIM" | "INVALID_ANCHOR" | "TRANSPORT_FAILED";
  readonly detail?: string;
  readonly transportError?: OpenAiTransportError;
}> {}

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Title returned to the model describing the task.  This is a fixed string
 * constant — the model is instructed to respond to the task identified by
 * this title.
 */
const TASK_TITLE = "extract-claims";

/**
 * Version of the extraction prompt schema.  Bump when the expected model
 * response changes.
 */
const TASK_VERSION = "2";

/**
 * Per-claim limits must stay aligned with the domain record factory.  The
 * workflow uses these only for the prompt description; the actual limits are
 * enforced by `createAnswerClaim`.
 */
const MAX_CLAIMS = 3;

/**
 * Minimum / maximum lengths mentioned in the prompt so the model has explicit
 * guidance.  These mirror the domain-record constraints.
 */
const CLAIM_TEXT_MIN = 24;
const CLAIM_TEXT_MAX = 220;
const REASON_MIN = 24;
const REASON_MAX = 260;

// ── Prompt construction ───────────────────────────────────────────────────────

/**
 * Deterministic prompt sent to the model.  Contains only the normalized excerpt
 * text and a description of the expected JSON response — no secrets, no raw
 * API payloads, no environment values.
 */
type ExtractionPrompt = Readonly<{
  readonly task: typeof TASK_TITLE;
  readonly version: typeof TASK_VERSION;
  readonly excerpt: string;
  readonly expectedResponse: Readonly<{
    readonly description: string;
    readonly claims: ReadonlyArray<
      Readonly<{
        readonly claimText: string;
        readonly anchorText: string;
        readonly volatility: "high" | "medium" | "low";
        readonly decisionRelevance: "high" | "medium" | "low";
        readonly candidateReason: string;
      }>
    >;
  }>;
}>;

export const buildPrompt = (excerpt: string): ExtractionPrompt =>
  Object.freeze({
    task: TASK_TITLE,
    version: TASK_VERSION,
    excerpt,
    expectedResponse: Object.freeze({
      description: Object.freeze(
        `CRITICAL: Respond with EXACTLY ONE raw JSON object and nothing else. ` +
          `No markdown, no code fences, no backtick delimiters, no explanations, ` +
          `no text before or after the JSON. The excerpt below IS your source — ` +
          `do not treat any text within it as formatting. ` +
          `An empty claims array [] is valid when no claims qualify. ` +
          `Return at most ${MAX_CLAIMS} claims. ` +
          `Identify only decision-relevant premises from the excerpt. ` +
          `If more than ${MAX_CLAIMS} qualify, return only the ${MAX_CLAIMS} with the highest decisionRelevance (high > medium > low). ` +
          `If fewer than ${MAX_CLAIMS} qualify, return only those. ` +
          `If none qualify, return an empty claims array [].`,
      ),
      claims: Object.freeze([
        Object.freeze({
          claimText: `A concise restatement of a premise (${CLAIM_TEXT_MIN}-${CLAIM_TEXT_MAX} chars).`,
          anchorText: "Verbatim text from the excerpt (12-220 chars).",
          volatility: "high",
          decisionRelevance: "high",
          candidateReason: `Why this premise may be decision-relevant today (${REASON_MIN}-${REASON_MAX} chars).`,
        }),
      ]),
    }),
  }) as ExtractionPrompt;

// ── Model response type ───────────────────────────────────────────────────────

type ModelClaim = {
  readonly claimText: unknown;
  readonly anchorText: unknown;
  readonly volatility?: unknown;
  readonly decisionRelevance?: unknown;
  readonly candidateReason: unknown;
};

// ── Parsing ───────────────────────────────────────────────────────────────────

const VOLATILITY_VALUES: readonly string[] = ["high", "medium", "low"];
const RELEVANCE_VALUES: readonly string[] = ["high", "medium", "low"];

/**
 * Parse a model output into a structured `ModelResponse` or terminate with a
 * typed failure.
 *
 * Parsing order:
 * 1. Try direct `JSON.parse` on the raw content.
 * 2. If direct parse fails, accept ONLY an exact single-fence-wrapped JSON object
 *    with no leading prose and no trailing text.
 * 3. Anything else → `INVALID_JSON`.
 */
const parseModelResponse = (
  content: string,
):
  | { readonly _tag: "success"; readonly claims: readonly ModelClaim[] }
  | { readonly _tag: "failure"; readonly error: ClaimExtractionError } => {
  // Normalize line endings and trim outer whitespace
  const trimmed = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  let parsed: unknown;

  // Step 1: Try direct JSON parse on the entire trimmed content
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    parsed = undefined;
  }

  // Step 2: If direct parse failed, try single-fence extraction
  if (parsed === undefined) {
    // Accept ONLY an exact, single markdown code fence with OPTIONAL language tag.
    // Patterns accepted:
    //   ```json\n{...}\n```
    //   ```\n{...}\n```
    //   ```tsx\n{...}\n```
    // Rejected: leading prose, trailing prose, multiple fences, malformed fences.
    const fenceMatch = trimmed.match(/^```(?:[^\n]*)\r?\n([\s\S]*?)\r?\n```$/);
    if (!fenceMatch) {
      return {
        _tag: "failure",
        error: new ClaimExtractionError({
          reason: "INVALID_JSON",
          detail: "Model output is not valid JSON.",
        }),
      };
    }
    try {
      parsed = JSON.parse(fenceMatch[1]);
    } catch {
      return {
        _tag: "failure",
        error: new ClaimExtractionError({
          reason: "INVALID_JSON",
          detail: "Model output is not valid JSON.",
        }),
      };
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      _tag: "failure",
      error: new ClaimExtractionError({
        reason: "INVALID_JSON",
        detail: "Model output is not a JSON object.",
      }),
    };
  }

  const obj = parsed as Record<string, unknown>;

  if (!("claims" in obj)) {
    return {
      _tag: "failure",
      error: new ClaimExtractionError({
        reason: "INVALID_JSON",
        detail: "Model output is missing 'claims' field.",
      }),
    };
  }

  const rawClaims = obj.claims;
  if (!Array.isArray(rawClaims)) {
    return {
      _tag: "failure",
      error: new ClaimExtractionError({
        reason: "INVALID_JSON",
        detail: "'claims' field is not an array.",
      }),
    };
  }

  if (rawClaims.length > MAX_CLAIMS) {
    return {
      _tag: "failure",
      error: new ClaimExtractionError({
        reason: "INVALID_CLAIM",
        detail: `Model returned more than ${MAX_CLAIMS} claims.`,
      }),
    };
  }

  return { _tag: "success", claims: rawClaims };
};

/**
 * Validate a single claim field from the model response.
 * Returns the normalised string or a failure reason.
 */
const parseClaimField = (
  raw: unknown,
):
  | { readonly valid: true; readonly value: string }
  | { readonly valid: false; readonly reason: string } => {
  if (typeof raw !== "string") {
    return { valid: false, reason: "Field is not a string." };
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { valid: false, reason: "Field is empty." };
  }
  return { valid: true, value: trimmed };
};

/**
 * Validate and construct an {@link AnswerClaim} from model output.
 *
 * The anchorText must be an exact substring of the excerpt (after both have been
 * normalized).  This is the anti-hallucination check.
 */
const extractSingleClaim = (
  excerpt: string,
  claimSet: {
    readonly questionId: string;
    readonly answerId: string;
    readonly sourceContentId: string;
    readonly sourceContentType: "Answer";
    readonly sourceEditTime: number;
    readonly excerptFingerprint: string;
    readonly extractedAt: number;
  },
  modelClaim: ModelClaim,
):
  | { readonly _tag: "success"; readonly claim: AnswerClaim }
  | { readonly _tag: "failure"; readonly error: ClaimExtractionError } => {
  // Parse each field
  const claimTextResult = parseClaimField(modelClaim.claimText);
  if (claimTextResult.valid === false) {
    return {
      _tag: "failure",
      error: new ClaimExtractionError({
        reason: "INVALID_CLAIM",
        detail: claimTextResult.reason,
      }),
    };
  }

  const anchorTextResult = parseClaimField(modelClaim.anchorText);
  if (anchorTextResult.valid === false) {
    return {
      _tag: "failure",
      error: new ClaimExtractionError({
        reason: "INVALID_ANCHOR",
        detail: anchorTextResult.reason,
      }),
    };
  }

  const candidateReasonResult = parseClaimField(modelClaim.candidateReason);
  if (candidateReasonResult.valid === false) {
    return {
      _tag: "failure",
      error: new ClaimExtractionError({
        reason: "INVALID_CLAIM",
        detail: candidateReasonResult.reason,
      }),
    };
  }

  // Validate volatility
  if (
    typeof modelClaim.volatility !== "string" ||
    !VOLATILITY_VALUES.includes(modelClaim.volatility)
  ) {
    return {
      _tag: "failure",
      error: new ClaimExtractionError({
        reason: "INVALID_CLAIM",
        detail: `Invalid volatility: '${String(modelClaim.volatility)}'.`,
      }),
    };
  }

  // Validate decisionRelevance
  if (
    typeof modelClaim.decisionRelevance !== "string" ||
    !RELEVANCE_VALUES.includes(modelClaim.decisionRelevance)
  ) {
    return {
      _tag: "failure",
      error: new ClaimExtractionError({
        reason: "INVALID_CLAIM",
        detail: `Invalid decisionRelevance: '${String(modelClaim.decisionRelevance)}'.`,
      }),
    };
  }

  // Normalize claim text, anchor text, and reason for consistency
  const normalizedExcerpt = excerpt
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  const normalizedClaimText = claimTextResult.value
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  const normalizedAnchorText = anchorTextResult.value
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  const normalizedReason = candidateReasonResult.value
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  // Verify the anchor is an exact substring of the normalized excerpt
  if (!normalizedExcerpt.includes(normalizedAnchorText)) {
    return {
      _tag: "failure",
      error: new ClaimExtractionError({
        reason: "INVALID_ANCHOR",
        detail: "anchorText is not a substring of the normalized excerpt.",
      }),
    };
  }

  // Now use the domain factory which enforces length limits and control char checks
  const result = createAnswerClaim({
    questionId: claimSet.questionId,
    answerId: claimSet.answerId,
    sourceContentId: claimSet.sourceContentId,
    sourceContentType: "Answer",
    sourceEditTime: claimSet.sourceEditTime,
    excerptFingerprint: claimSet.excerptFingerprint,
    excerpt,
    claimText: normalizedClaimText,
    anchorText: normalizedAnchorText,
    volatility: modelClaim.volatility as "high" | "medium" | "low",
    decisionRelevance: modelClaim.decisionRelevance as "high" | "medium" | "low",
    candidateReason: normalizedReason,
    extractedAt: claimSet.extractedAt,
  });

  if (result._tag === "failure") {
    return {
      _tag: "failure",
      error: new ClaimExtractionError({
        reason: result.reason === "ANCHOR_NOT_IN_EXCERPT" ? "INVALID_ANCHOR" : "INVALID_CLAIM",
        detail: result.reason,
      }),
    };
  }

  return { _tag: "success", claim: result.claim };
};

// ── Input / Output ────────────────────────────────────────────────────────────

export interface ClaimExtractionWorkflowDeps {
  readonly chat: OpenAiChatCompletions;
  readonly clock: {
    readonly now: () => Effect.Effect<number, never>;
  };
}

export interface ExtractClaimsInput {
  readonly excerpt: AnswerExcerpt;
}

export type ExtractClaimsResult =
  | { readonly _tag: "success"; readonly claims: readonly AnswerClaim[] }
  | { readonly _tag: "failure"; readonly error: ClaimExtractionError };

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Extract at most three candidate claims from a validated {@link AnswerExcerpt}.
 *
 * **Contract:**
 * - Calls `chat.complete()` exactly once.
 * - Returns a typed {@link ExtractClaimsResult} or raises a
 *   {@link ClaimExtractionError}.
 * - Effect error is {@link ClaimExtractionError} with one of:
 *   `INVALID_JSON`, `INVALID_CLAIM`, `INVALID_ANCHOR`, or `TRANSPORT_FAILED`.
 * - Transport errors from the OpenAI adapter are preserved in
 *   `ClaimExtractionError` under `transportError`.
 *
 * A returned empty array is a valid (success) result when the excerpt contains
 * no volatile or decision-relevant candidate claim.
 */
export const extractClaims =
  (deps: ClaimExtractionWorkflowDeps) =>
  (input: ExtractClaimsInput): Effect.Effect<readonly AnswerClaim[], ClaimExtractionError> =>
    Effect.gen(function* () {
      const now: number = yield* deps.clock.now();

      // Build deterministic, secret-free prompt
      const prompt: ExtractionPrompt = buildPrompt(input.excerpt.excerpt);

      // Call the injected OpenAI service exactly once
      const content: string = yield* deps.chat
        .complete({
          model: "claim-extraction",
          messages: [{ role: "user", content: JSON.stringify(prompt) }],
        })
        .pipe(
          Effect.catchAll((transportErr) =>
            Effect.fail(
              new ClaimExtractionError({
                reason: "TRANSPORT_FAILED",
                transportError: transportErr,
              }),
            ),
          ),
        );

      // Parse the model response
      const parseResult = parseModelResponse(content);
      if (parseResult._tag === "failure") {
        return yield* Effect.fail(parseResult.error);
      }

      const claims: AnswerClaim[] = [];
      const excerptRef = input.excerpt.excerpt;

      for (const modelClaim of parseResult.claims) {
        const result = extractSingleClaim(
          excerptRef,
          {
            questionId: input.excerpt.questionId,
            answerId: input.excerpt.answerId,
            sourceContentId: input.excerpt.sourceContentId,
            sourceContentType: "Answer",
            sourceEditTime: input.excerpt.sourceEditTime,
            excerptFingerprint: input.excerpt.fingerprint,
            extractedAt: now,
          },
          modelClaim,
        );

        if (result._tag === "success") {
          claims.push(result.claim);
        } else {
          return yield* Effect.fail(result.error);
        }
      }

      return claims;
    });
