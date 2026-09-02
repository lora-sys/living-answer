import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  rankAnswerCandidates,
  type CandidateRankingAnalysis,
} from "../lib/answer-candidate-ranker";
import { makeFetchOpenAiTransport, makeOpenAiChatCompletions } from "../lib/openai-adapter";

export type RankAnswerCandidatesFailureCode =
  | "INVALID_REQUEST"
  | "RANKING_UNAVAILABLE"
  | "MISSING_MODEL_KEY";

export type RankAnswerCandidatesResponse =
  | {
      readonly success: true;
      readonly analysis: CandidateRankingAnalysis;
    }
  | {
      readonly success: false;
      readonly code: RankAnswerCandidatesFailureCode;
      readonly message: string;
    };

export interface RankAnswerCandidatesInput {
  readonly question: string;
  readonly refinedQuery: string;
  readonly learningIntent: string;
  readonly candidates: readonly {
    readonly answerId: string;
    readonly title: string;
    readonly authorDisplayName: string;
    readonly preview: string;
  }[];
}

export interface RankAnswerCandidatesDeps {
  readonly getSecret: () => string | undefined;
  readonly getModel: () => string;
  readonly createChat: (
    secret: string,
    model: string,
  ) => Promise<ReturnType<typeof makeOpenAiChatCompletions>>;
}

export const createRankAnswerCandidatesHandler =
  (deps: RankAnswerCandidatesDeps) =>
  async (input: RankAnswerCandidatesInput): Promise<RankAnswerCandidatesResponse> => {
    const question = typeof input?.question === "string" ? input.question.trim() : "";
    const refinedQuery =
      typeof input?.refinedQuery === "string" ? input.refinedQuery.trim() : "";
    const learningIntent =
      typeof input?.learningIntent === "string" ? input.learningIntent.trim() : "";
    const candidates = Array.isArray(input?.candidates) ? input.candidates : [];

    if (question === "" || refinedQuery === "" || learningIntent === "" || candidates.length === 0) {
      return {
        success: false as const,
        code: "INVALID_REQUEST",
        message: "无法分析候选回答，请重新搜索。",
      };
    }

    const secret = deps.getSecret();
    if (typeof secret !== "string" || secret.trim() === "") {
      return {
        success: false as const,
        code: "MISSING_MODEL_KEY",
        message: "AI 候选分析暂时不可用，请稍后再试。",
      };
    }

    try {
      const model = deps.getModel();
      const chat = await deps.createChat(secret, model);
      const analysis = await Effect.runPromise(
        rankAnswerCandidates({ model, chat })({
          question,
          refinedQuery,
          learningIntent,
          candidates,
        }),
      );
      return { success: true as const, analysis };
    } catch {
      return {
        success: false as const,
        code: "RANKING_UNAVAILABLE",
        message: "AI 候选分析暂时不可用，请稍后再试。",
      };
    }
  };

const parseInput = (input: unknown): RankAnswerCandidatesInput => {
  if (typeof input !== "object" || input === null) {
    return { question: "", refinedQuery: "", learningIntent: "", candidates: [] };
  }
  const raw = input as Record<string, unknown>;
  const candidates = Array.isArray(raw.candidates)
    ? (raw.candidates as RankAnswerCandidatesInput["candidates"])
    : [];

  return {
    question: typeof raw.question === "string" ? raw.question : "",
    refinedQuery: typeof raw.refinedQuery === "string" ? raw.refinedQuery : "",
    learningIntent: typeof raw.learningIntent === "string" ? raw.learningIntent : "",
    candidates,
  };
};

const DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

const createChatWrapper = async (secret: string, model: string) =>
  makeOpenAiChatCompletions({
    apiKey: secret,
    model,
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    transport: makeFetchOpenAiTransport({ timeoutMs: "30 seconds" }),
    timeoutMs: "30 seconds",
  });

export const rankAnswerCandidatesFn = createServerFn({ method: "POST" })
  .validator(parseInput)
  .handler(async ({ data }): Promise<RankAnswerCandidatesResponse> => {
    if (!OPENAI_API_KEY) {
      return {
        success: false as const,
        code: "MISSING_MODEL_KEY",
        message: "AI 候选分析暂时不可用，请稍后再试。",
      };
    }

    return createRankAnswerCandidatesHandler({
      getSecret: () => OPENAI_API_KEY,
      getModel: () => OPENAI_MODEL,
      createChat: createChatWrapper,
    })(data);
  });
