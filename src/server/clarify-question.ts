/**
 * Clarify-question server function for the Question Learning Thread product.
 *
 * Accepts a fuzzy question from the client, calls the clarification workflow,
 * and returns a JSON-safe response.
 *
 * Credentials are read only in this server wiring module.
 *
 * @module clarify-question
 */

import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  makeFetchOpenAiTransport,
  makeOpenAiChatCompletions,
  type OpenAiChatCompletions,
} from "../lib/openai-adapter";
import { clarifyQuestion } from "../lib/thread-clarification";

// ── Response types ─────────────────────────────────────────────────────────────

export type ClarifyQuestionFailureCode =
  | "INVALID_REQUEST"
  | "MISSING_MODEL_KEY"
  | "CLARIFICATION_UNAVAILABLE";

export type ClarifyQuestionResponse =
  | {
      readonly success: true;
      readonly refinedQuery: string;
      readonly alternatives: readonly string[];
      readonly learningIntent: string;
      readonly guidance: string;
      readonly confidence: number;
    }
  | {
      readonly success: false;
      readonly code: ClarifyQuestionFailureCode;
      readonly message: string;
    };

// ── Handler factory ────────────────────────────────────────────────────────────

export interface ClarifyQuestionDeps {
  readonly getSecret: () => string | undefined;
  readonly getModel: () => string;
  readonly createChat: (secret: string, model: string) => Promise<OpenAiChatCompletions>;
}

export const createClarifyQuestionHandler =
  (deps: ClarifyQuestionDeps) =>
  async (input: { readonly question: string }): Promise<ClarifyQuestionResponse> => {
    const question = typeof input?.question === "string" ? input.question.trim() : "";
    if (question === "") {
      return {
        success: false as const,
        code: "INVALID_REQUEST",
        message: "请输入一个问题。",
      };
    }

    const secret = deps.getSecret();
    if (typeof secret !== "string" || secret.trim() === "") {
      return {
        success: false as const,
        code: "MISSING_MODEL_KEY",
        message: "AI 澄清服务暂时不可用，请稍后再试。",
      };
    }

    const model = deps.getModel();

    try {
      const chat = await deps.createChat(secret, model);

      const result = await Effect.runPromise(clarifyQuestion({ model, chat })({ question }));

      return {
        success: true,
        refinedQuery: result.refinedQuery,
        alternatives: result.alternatives,
        learningIntent: result.learningIntent,
        guidance: result.guidance,
        confidence: result.confidence,
      };
    } catch (raw: unknown) {
      if (
        typeof raw === "object" &&
        raw !== null &&
        "reason" in raw &&
        (raw as Record<string, unknown>).reason === "TRANSPORT_FAILED"
      ) {
        return {
          success: false as const,
          code: "MISSING_MODEL_KEY",
          message: "AI 澄清服务暂时不可用，请稍后再试。",
        };
      }
      return {
        success: false as const,
        code: "CLARIFICATION_UNAVAILABLE",
        message: "澄清服务暂时不可用，请稍后再试。",
      };
    }
  };

// ── Input parser ───────────────────────────────────────────────────────────────

const parseInput = (input: unknown): { readonly question: string } => {
  if (typeof input !== "object" || input === null || !("question" in input)) {
    return { question: "" };
  }
  const value = (input as { question: unknown }).question;
  return { question: typeof value === "string" ? value : "" };
};

// ── Chat creation helper ───────────────────────────────────────────────────────

const createChat = async (apiKey: string, model: string) =>
  makeOpenAiChatCompletions({
    apiKey,
    model,
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    transport: makeFetchOpenAiTransport({ timeoutMs: "30 seconds" }),
    timeoutMs: "30 seconds",
  });

// ── Production wiring ──────────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export const clarifyQuestionFn = createServerFn({ method: "POST" })
  .validator(parseInput)
  .handler(async ({ data }) => {
    if (!OPENAI_API_KEY) {
      return {
        success: false as const,
        code: "MISSING_MODEL_KEY",
        message: "AI 澄清服务暂时不可用，请稍后再试。",
      };
    }

    return createClarifyQuestionHandler({
      getSecret: () => OPENAI_API_KEY,
      getModel: () => OPENAI_MODEL,
      createChat: async (apiKey, model) => {
        return createChat(apiKey, model);
      },
    })(data);
  });
