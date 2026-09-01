/**
 * Clarification workflow for the Question Learning Thread product.
 *
 * Receives a fuzzy user question and asks the Zhihu direct-answer model to
 * produce a refined search query, alternatives, learning intent, guidance, and
 * confidence score.  The model never answers the question, cites facts, or
 * describes itself.
 *
 * All model output is validated as strict JSON against the expected shape.
 * Violations map to typed workflow errors.
 *
 * @module thread-clarification
 */

import { Data, Effect } from "effect";

import type { ZhihuDirectAnswerCompletions } from "./zhihu-direct-answer-adapter";

// ── Errors ─────────────────────────────────────────────────────────────────────

export class ClarificationWorkflowError extends Data.TaggedError("ClarificationWorkflowError")<{
  readonly reason:
    | "INVALID_QUESTION"
    | "EMPTY_REFINED_QUERY"
    | "MALFORMED_RESPONSE"
    | "MISSING_INTENT"
    | "EMPTY_ALTERNATIVES"
    | "TRANSPORT_FAILED";
}> {}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ClarificationResult {
  readonly _tag: "success";
  readonly refinedQuery: string;
  readonly alternatives: readonly string[];
  readonly learningIntent: string;
  readonly guidance: string;
  readonly confidence: number;
}

export interface ClarificationInput {
  readonly question: string;
  readonly maxAlternatives?: number;
}

export interface ThreadClarificationDeps {
  readonly model: string;
  readonly chat: ZhihuDirectAnswerCompletions;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_QUESTION_LENGTH = 500;
const MAX_ALTERNATIVES = 3;

const SYSTEM_PROMPT =
  "You help clarify a learning question. Given a fuzzy question, produce a refined search query for Zhihu, up to 3 alternative queries, a 1-sentence learning intent, a short next-step guidance, and a confidence score. Reply with only raw JSON: " +
  '{"refinedQuery":"...","alternatives":["...","..."],"learningIntent":"...","guidance":"...","confidence":0.0-1.0}. ' +
  "Do not answer the question, cite facts, invent Zhihu content, or describe yourself.";

// ── Parsing ───────────────────────────────────────────────────────────────────

const parseResponse = (
  content: string,
):
  | { readonly _tag: "success"; readonly value: ClarificationResult }
  | { readonly _tag: "failure"; readonly error: ClarificationWorkflowError } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.trim());
  } catch {
    return {
      _tag: "failure",
      error: new ClarificationWorkflowError({ reason: "MALFORMED_RESPONSE" }),
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      _tag: "failure",
      error: new ClarificationWorkflowError({ reason: "MALFORMED_RESPONSE" }),
    };
  }

  const obj = parsed as Record<string, unknown>;

  const refinedQuery = typeof obj.refinedQuery === "string" ? obj.refinedQuery.trim() : "";
  if (refinedQuery === "") {
    return {
      _tag: "failure",
      error: new ClarificationWorkflowError({ reason: "EMPTY_REFINED_QUERY" }),
    };
  }

  const alternativesRaw = obj.alternatives;
  if (
    !Array.isArray(alternativesRaw) ||
    alternativesRaw.length === 0 ||
    alternativesRaw.length > MAX_ALTERNATIVES ||
    !alternativesRaw.every((a) => typeof a === "string" && a.trim() !== "")
  ) {
    return {
      _tag: "failure",
      error: new ClarificationWorkflowError({ reason: "EMPTY_ALTERNATIVES" }),
    };
  }
  const alternatives = alternativesRaw.map((a) => (a as string).trim());

  const learningIntent = typeof obj.learningIntent === "string" ? obj.learningIntent.trim() : "";
  if (learningIntent === "") {
    return { _tag: "failure", error: new ClarificationWorkflowError({ reason: "MISSING_INTENT" }) };
  }

  const guidance = typeof obj.guidance === "string" ? obj.guidance.trim() : "";
  if (guidance === "") {
    return { _tag: "failure", error: new ClarificationWorkflowError({ reason: "MISSING_INTENT" }) };
  }

  const confidence = obj.confidence;
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    return {
      _tag: "failure",
      error: new ClarificationWorkflowError({ reason: "MALFORMED_RESPONSE" }),
    };
  }

  return {
    _tag: "success",
    value: {
      _tag: "success",
      refinedQuery,
      alternatives,
      learningIntent,
      guidance,
      confidence,
    },
  };
};

// ── Workflow ───────────────────────────────────────────────────────────────────

export const clarifyQuestion =
  (deps: ThreadClarificationDeps) =>
  (input: ClarificationInput): Effect.Effect<ClarificationResult, ClarificationWorkflowError> =>
    Effect.gen(function* () {
      const question = input.question.trim();
      if (question === "" || question.length > MAX_QUESTION_LENGTH) {
        return yield* Effect.fail(new ClarificationWorkflowError({ reason: "INVALID_QUESTION" }));
      }

      const raw = yield* deps.chat
        .complete({
          model: deps.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: question },
          ],
        })
        .pipe(
          Effect.mapError(() => new ClarificationWorkflowError({ reason: "TRANSPORT_FAILED" })),
        );

      const parsed = parseResponse(raw);
      if (parsed._tag === "failure") {
        return yield* Effect.fail(parsed.error);
      }
      return parsed.value;
    });
