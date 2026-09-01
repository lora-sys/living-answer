/**
 * Synthesize-thread server function for the Question Learning Thread product.
 *
 * Accepts a synthesis request (question, refined query, selected candidates with
 * excerpt fingerprints), looks up full excerpts from the excerpt store, and
 * runs the synthesis workflow.
 *
 * Credentials are read only in this server wiring module.
 *
 * @module synthesize-thread
 */

import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";

import { makeSqliteExcerptStore, type ExcerptStore } from "../lib/excerpt-store";
import { ThreadSynthesisError, synthesizeThread } from "../lib/thread-synthesis";
import {
  makeFetchZhihuDirectAnswerTransport,
  makeZhihuDirectAnswerCompletions,
} from "../lib/zhihu-direct-answer-adapter";
import { type AnswerExcerpt } from "../lib/answer-excerpt";

// ── Response types ─────────────────────────────────────────────────────────────

export type SynthesizeThreadFailureCode =
  | "INVALID_REQUEST"
  | "MISSING_MODEL_KEY"
  | "SYNTHESIS_UNAVAILABLE";

export interface SynthesizedNodeResponse {
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly evidenceRefs: readonly { readonly excerptFingerprint: string; readonly quote: string }[];
  readonly sourceAnswerId: string;
  readonly sourceUrl: string;
  readonly uncertainty: number;
}

export type SynthesizeThreadResponse =
  | {
      readonly success: true;
      readonly nodes: readonly SynthesizedNodeResponse[];
    }
  | {
      readonly success: false;
      readonly code: SynthesizeThreadFailureCode;
      readonly message: string;
    };

// ── Input types ────────────────────────────────────────────────────────────────

export interface SelectedCandidateInput {
  readonly questionId: string;
  readonly answerId: string;
  readonly title: string;
  readonly authorDisplayName: string;
  readonly editTime: number;
  readonly canonicalUrl: string;
  readonly excerptFingerprint: string;
}

export interface SynthesizeThreadInput {
  readonly question: string;
  readonly refinedQuery: string;
  readonly learningIntent: string;
  readonly selectedCandidates: readonly SelectedCandidateInput[];
}

// ── Handler factory ────────────────────────────────────────────────────────────

export interface SynthesizeThreadDeps {
  readonly getSecret: () => string | undefined;
  readonly getModel: () => string;
  readonly createExcerptStore: () => Promise<ExcerptStore>;
  readonly createChat: (
    secret: string,
    model: string,
  ) => Promise<ReturnType<typeof makeZhihuDirectAnswerCompletions>>;
}

export const createSynthesizeThreadHandler =
  (deps: SynthesizeThreadDeps) =>
  async (input: SynthesizeThreadInput): Promise<SynthesizeThreadResponse> => {
    const question = typeof input?.question === "string" ? input.question.trim() : "";
    const refinedQuery = typeof input?.refinedQuery === "string" ? input.refinedQuery.trim() : "";
    const learningIntent =
      typeof input?.learningIntent === "string" ? input.learningIntent.trim() : "";

    if (question === "" || refinedQuery === "" || learningIntent === "") {
      return {
        success: false as const,
        code: "INVALID_REQUEST",
        message: "请提供完整的问题、澄清查询和学习意图。",
      };
    }

    if (!Array.isArray(input.selectedCandidates) || input.selectedCandidates.length === 0) {
      return {
        success: false as const,
        code: "INVALID_REQUEST",
        message: "请至少选择一个回答候选。",
      };
    }

    const secret = deps.getSecret();
    if (typeof secret !== "string" || secret.trim() === "") {
      return {
        success: false as const,
        code: "MISSING_MODEL_KEY",
        message: "AI 服务暂时不可用，请稍后再试。",
      };
    }

    const model = deps.getModel();
    const store = await deps.createExcerptStore();

    // Build timeline stages from candidates by looking up full excerpts
    try {
      const candidates = input.selectedCandidates;
      const lookups = candidates.map((c) =>
        Effect.runPromise(
          Effect.exit(store.findLatest(c.questionId, c.answerId)).pipe(
            Effect.catchAll(() =>
              Effect.succeed({ _tag: "Failure" as const, cause: null } as never),
            ),
          ),
        ),
      );

      const lookupResults = await Promise.all(lookups);

      const timelineStages: import("../lib/thread-artifact").TimelineStage[] = [];
      for (let i = 0; i < candidates.length; i++) {
        const result = lookupResults[i] as { _tag: string; value?: AnswerExcerpt };
        if (result._tag !== "Success" || !result.value) {
          continue;
        }

        const candidate = candidates[i];
        const excerpt = result.value;

        timelineStages.push({
          questionId: excerpt.questionId,
          answerId: excerpt.answerId,
          title: candidate.title,
          authorDisplayName: candidate.authorDisplayName,
          editTime: candidate.editTime,
          canonicalUrl: candidate.canonicalUrl,
          excerpt: Object.freeze({
            questionId: excerpt.questionId,
            answerId: excerpt.answerId,
            capturedAt: excerpt.capturedAt,
            sourceContentId: excerpt.sourceContentId,
            sourceContentType: excerpt.sourceContentType,
            sourceEditTime: excerpt.sourceEditTime,
            excerpt: excerpt.excerpt,
            fingerprint: excerpt.fingerprint,
          }),
          excerptBoundaryNote: "这是摘录，不是完整回答",
        });
      }

      if (timelineStages.length === 0) {
        return {
          success: false as const,
          code: "INVALID_REQUEST",
          message: "未找到有效的回答摘录，请重新选择候选。",
        };
      }

      const chat = await deps.createChat(secret, model);

      const synthesisResult = await Effect.runPromise(
        synthesizeThread({ model, chat })({
          question,
          refinedQuery,
          learningIntent,
          timelineStages,
        }),
      );

      return {
        success: true,
        nodes: synthesisResult.nodes,
      };
    } catch (error) {
      if (error instanceof ThreadSynthesisError) {
        if (error.reason === "TRANSPORT_FAILED") {
          return {
            success: false as const,
            code: "MISSING_MODEL_KEY",
            message: "AI 服务暂时不可用，请稍后再试。",
          };
        }
      }
      return {
        success: false as const,
        code: "SYNTHESIS_UNAVAILABLE",
        message: "综合总结暂时不可用，请稍后再试。",
      };
    }
  };

// ── Input parser ───────────────────────────────────────────────────────────────

const parseInput = (input: unknown): SynthesizeThreadInput => {
  if (typeof input !== "object" || input === null) {
    return {
      question: "",
      refinedQuery: "",
      learningIntent: "",
      selectedCandidates: [],
    };
  }

  const raw = input as Record<string, unknown>;

  const question = typeof raw.question === "string" ? raw.question : "";
  const refinedQuery = typeof raw.refinedQuery === "string" ? raw.refinedQuery : "";
  const learningIntent = typeof raw.learningIntent === "string" ? raw.learningIntent : "";

  let selectedCandidates: SynthesizeThreadInput["selectedCandidates"] = [];
  if (Array.isArray(raw.selectedCandidates)) {
    selectedCandidates = raw.selectedCandidates
      .filter(
        (c): c is Record<string, unknown> =>
          typeof c === "object" && c !== null && !Array.isArray(c),
      )
      .map((c) => ({
        questionId: typeof c.questionId === "string" ? c.questionId : "",
        answerId: typeof c.answerId === "string" ? c.answerId : "",
        title: typeof c.title === "string" ? c.title : "",
        authorDisplayName: typeof c.authorDisplayName === "string" ? c.authorDisplayName : "",
        editTime: typeof c.editTime === "number" ? c.editTime : 0,
        canonicalUrl: typeof c.canonicalUrl === "string" ? c.canonicalUrl : "",
        excerptFingerprint: typeof c.excerptFingerprint === "string" ? c.excerptFingerprint : "",
      }))
      .filter((c) => c.questionId !== "" && c.answerId !== "");
  }

  return { question, refinedQuery, learningIntent, selectedCandidates };
};

// ── Chat creation helper ───────────────────────────────────────────────────────

const DEFAULT_MODEL = "zhida-thinking-1p5";

// ── Production wiring ──────────────────────────────────────────────────────────

const ZHIHU_ACCESS_SECRET = process.env.ZHIHU_ACCESS_SECRET;
const ZHIHU_MODEL = process.env.ZHIHU_MODEL ?? DEFAULT_MODEL;

let excerptStoreInstance: Promise<ExcerptStore> | null = null;

const getOrCreateExcerptStore = async (): Promise<ExcerptStore> => {
  if (!excerptStoreInstance) {
    excerptStoreInstance = Effect.runPromise(makeSqliteExcerptStore());
  }
  return excerptStoreInstance;
};

const createChatWrapper = async (secret: string, model: string) =>
  makeZhihuDirectAnswerCompletions({
    accessSecret: secret,
    model,
    transport: makeFetchZhihuDirectAnswerTransport({ timeoutMs: 30_000 }),
  });

export const synthesizeThreadFn = createServerFn({ method: "POST" })
  .validator(parseInput)
  .handler(async ({ data }): Promise<SynthesizeThreadResponse> => {
    if (!ZHIHU_ACCESS_SECRET) {
      return {
        success: false as const,
        code: "MISSING_MODEL_KEY",
        message: "AI 服务暂时不可用，请稍后再试。",
      };
    }

    return createSynthesizeThreadHandler({
      getSecret: () => ZHIHU_ACCESS_SECRET,
      getModel: () => ZHIHU_MODEL,
      createExcerptStore: getOrCreateExcerptStore,
      createChat: createChatWrapper,
    })(data);
  });
