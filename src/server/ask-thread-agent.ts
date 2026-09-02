import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";

import { makeSqliteThreadArtifactStore } from "../lib/thread-artifact-store";
import type { ThreadArtifactStore } from "../lib/thread-artifact-store";
import {
  askThreadAgent,
  type ThreadAgentResult,
} from "../lib/thread-study-agent";
import { makeFetchOpenAiTransport, makeOpenAiChatCompletions } from "../lib/openai-adapter";

// ── JSON-safe response ──────────────────────────────────────────────────────

export type AskThreadAgentFailureCode =
  | "INVALID_REQUEST"
  | "THREAD_NOT_FOUND"
  | "THREAD_STORE_ERROR"
  | "AGENT_UNAVAILABLE"
  | "MISSING_MODEL_KEY";

export type AskThreadAgentResponse =
  | {
      readonly success: true;
      readonly response: ThreadAgentResult;
    }
  | {
      readonly success: false;
      readonly code: AskThreadAgentFailureCode;
      readonly message: string;
    };

// ── Types ───────────────────────────────────────────────────────────────────

export interface AskThreadAgentInput {
  readonly threadId: string;
  readonly question: string;
  readonly conversation: readonly {
    readonly role: "user" | "assistant";
    readonly content: string;
  }[];
}

export interface AskThreadAgentDeps {
  readonly getSecret: () => string | undefined;
  readonly getModel: () => string;
  readonly createThreadStore: () => Promise<ThreadArtifactStore>;
  readonly createChat: (
    secret: string,
    model: string,
  ) => Promise<ReturnType<typeof makeOpenAiChatCompletions>>;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export const createAskThreadAgentHandler =
  (deps: AskThreadAgentDeps) =>
  async (input: AskThreadAgentInput): Promise<AskThreadAgentResponse> => {
    const threadId = typeof input?.threadId === "string" ? input.threadId.trim() : "";
    const question = typeof input?.question === "string" ? input.question.trim() : "";
    const conversation = Array.isArray(input?.conversation) ? input.conversation : [];

    if (threadId === "" || question === "") {
      return {
        success: false as const,
        code: "INVALID_REQUEST",
        message: "请先选择学习线程并输入问题。",
      };
    }

    const secret = deps.getSecret();
    if (typeof secret !== "string" || secret.trim() === "") {
      return {
        success: false as const,
        code: "MISSING_MODEL_KEY",
        message: "AI 学习助手暂时不可用，请稍后再试。",
      };
    }

    try {
      const store = await deps.createThreadStore();
      const artifact = await Effect.runPromise(store.findById(threadId));
      if (!artifact) {
        return {
          success: false as const,
          code: "THREAD_NOT_FOUND",
          message: "该学习线程不存在或已被移除。",
        };
      }

      const model = deps.getModel();
      const chat = await deps.createChat(secret, model);
      const response = await Effect.runPromise(
        askThreadAgent({ model, chat })(artifact, { question, conversation }),
      );

      return { success: true as const, response };
    } catch {
      return {
        success: false as const,
        code: "AGENT_UNAVAILABLE",
        message: "AI 学习助手暂时不可用，请稍后再试。",
      };
    }
  };

// ── Input parser ────────────────────────────────────────────────────────────

const parseInput = (input: unknown): AskThreadAgentInput => {
  if (typeof input !== "object" || input === null) {
    return { threadId: "", question: "", conversation: [] };
  }

  const raw = input as Record<string, unknown>;
  const conversation: AskThreadAgentInput["conversation"] = Array.isArray(raw.conversation)
    ? (raw.conversation as AskThreadAgentInput["conversation"])
    : [];

  return {
    threadId: typeof raw.threadId === "string" ? raw.threadId : "",
    question: typeof raw.question === "string" ? raw.question : "",
    conversation,
  };
};

// ── Production wiring ───────────────────────────────────────────────────────

const DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

let threadStoreInstance: Promise<ThreadArtifactStore> | null = null;

const getOrCreateThreadStore = async (): Promise<ThreadArtifactStore> => {
  if (!threadStoreInstance) {
    threadStoreInstance = Effect.runPromise(makeSqliteThreadArtifactStore());
  }
  return threadStoreInstance;
};

const createChatWrapper = async (secret: string, model: string) =>
  makeOpenAiChatCompletions({
    apiKey: secret,
    model,
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    transport: makeFetchOpenAiTransport({ timeoutMs: "60 seconds" }),
    timeoutMs: "60 seconds",
  });

export const askThreadAgentFn = createServerFn({ method: "POST" })
  .validator(parseInput)
  .handler(async ({ data }): Promise<AskThreadAgentResponse> => {
    if (!OPENAI_API_KEY) {
      return {
        success: false as const,
        code: "MISSING_MODEL_KEY",
        message: "AI 学习助手暂时不可用，请稍后再试。",
      };
    }

    return createAskThreadAgentHandler({
      getSecret: () => OPENAI_API_KEY,
      getModel: () => OPENAI_MODEL,
      createThreadStore: getOrCreateThreadStore,
      createChat: createChatWrapper,
    })(data);
  });
