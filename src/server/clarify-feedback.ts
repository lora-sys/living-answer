import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";

import {
  clarifyFeedback,
  type ClarificationInput,
  type ClarificationSuccess,
  type ClarificationTurn,
} from "../lib/clarification-workflow";
import { makeFetchOpenAiTransport, makeOpenAiChatCompletions } from "../lib/openai-adapter";

export type ClarificationServerFailureCode =
  | "INVALID_REQUEST"
  | "MISSING_MODEL_KEY"
  | "CLARIFICATION_UNAVAILABLE";

export type ClarifyFeedbackResponse =
  | {
      readonly success: true;
      readonly assistantMessage: string;
      readonly draft: {
        readonly reason: ClarificationSuccess["draft"]["reason"];
        readonly question: string;
        readonly evidenceUrl?: string;
        readonly evidenceQuote?: string;
      };
      readonly needsEvidence: boolean;
      readonly isReady: boolean;
    }
  | {
      readonly success: false;
      readonly code: ClarificationServerFailureCode;
      readonly message: string;
    };

export interface ClarifyFeedbackInput {
  readonly questionId: string;
  readonly answerId: string;
  readonly excerptFingerprint: string;
  readonly excerptText: string;
  readonly recordFingerprint?: string;
  readonly currentReason?: string;
  readonly conversation: readonly { readonly role: string; readonly content: string }[];
}

export interface ClarifyFeedbackDeps {
  readonly getModel: () => string;
  readonly getOpenAiKey: () => string | undefined;
  readonly runWorkflow: (input: ClarificationInput) => Promise<ClarificationSuccess>;
}

const failureResponse = (code: ClarificationServerFailureCode): ClarifyFeedbackResponse => ({
  success: false,
  code,
  message:
    code === "INVALID_REQUEST"
      ? "请提供完整的信息。"
      : code === "MISSING_MODEL_KEY"
        ? "AI 服务暂时不可用，请稍后再试。"
        : "澄清服务暂时不可用，请稍后再试。",
});

export const createClarifyFeedbackHandler =
  (deps: ClarifyFeedbackDeps) =>
  async (input: ClarifyFeedbackInput): Promise<ClarifyFeedbackResponse> => {
    const questionId = typeof input.questionId === "string" ? input.questionId.trim() : "";
    const answerId = typeof input.answerId === "string" ? input.answerId.trim() : "";
    const excerptFingerprint =
      typeof input.excerptFingerprint === "string" ? input.excerptFingerprint.trim() : "";
    const excerptText = typeof input.excerptText === "string" ? input.excerptText.trim() : "";
    if (
      questionId === "" ||
      answerId === "" ||
      excerptFingerprint === "" ||
      excerptText === "" ||
      !Array.isArray(input.conversation)
    ) {
      return failureResponse("INVALID_REQUEST");
    }

    const openAiKey = deps.getOpenAiKey();
    if (typeof openAiKey !== "string" || openAiKey.trim() === "") {
      return failureResponse("MISSING_MODEL_KEY");
    }

    const recordFingerprint =
      typeof input.recordFingerprint === "string" && input.recordFingerprint.trim() !== ""
        ? input.recordFingerprint.trim()
        : undefined;
    const currentReason =
      typeof input.currentReason === "string" && input.currentReason.trim() !== ""
        ? (input.currentReason.trim() as ClarificationInput["currentReason"])
        : undefined;

    try {
      const result = await deps.runWorkflow({
        questionId,
        answerId,
        excerptFingerprint,
        excerptText,
        ...(recordFingerprint === undefined ? {} : { recordFingerprint }),
        ...(currentReason === undefined ? {} : { currentReason }),
        conversation: input.conversation
          .map((turn): ClarificationTurn => ({
            role: turn.role === "assistant" ? "assistant" : "user",
            content: typeof turn.content === "string" ? turn.content.trim() : "",
          }))
          .slice(-10),
      });

      return {
        success: true,
        assistantMessage: result.assistantMessage,
        draft: result.draft,
        needsEvidence: result.needsEvidence,
        isReady: result.isReady,
      };
    } catch {
      return failureResponse("CLARIFICATION_UNAVAILABLE");
    }
  };

const parseInput = (input: unknown): ClarifyFeedbackInput => {
  if (typeof input !== "object" || input === null) {
    return {
      questionId: "",
      answerId: "",
      excerptFingerprint: "",
      excerptText: "",
      conversation: [],
    };
  }

  const raw = input as Record<string, unknown>;
  const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
  const conversation = Array.isArray(raw.conversation)
    ? raw.conversation
        .filter(
          (turn): turn is { role: string; content: string } =>
            typeof turn === "object" &&
            turn !== null &&
            typeof (turn as Record<string, unknown>).role === "string" &&
            typeof (turn as Record<string, unknown>).content === "string",
        )
        .map((turn) => ({ role: turn.role, content: turn.content.trim() }))
        .filter((turn) => turn.content !== "")
        .slice(-10)
    : [];

  return {
    questionId: text(raw.questionId),
    answerId: text(raw.answerId),
    excerptFingerprint: text(raw.excerptFingerprint),
    excerptText: text(raw.excerptText),
    ...(typeof raw.recordFingerprint === "string" && raw.recordFingerprint.trim() !== ""
      ? { recordFingerprint: raw.recordFingerprint.trim() }
      : {}),
    ...(typeof raw.currentReason === "string" && raw.currentReason.trim() !== ""
      ? { currentReason: raw.currentReason.trim() }
      : {}),
    conversation,
  };
};

export const clarifyFeedbackFn = createServerFn({ method: "POST" })
  .validator(parseInput)
  .handler(async ({ data }): Promise<ClarifyFeedbackResponse> => {
    const openAiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    return createClarifyFeedbackHandler({
      getModel: () => model,
      getOpenAiKey: () => openAiKey,
      runWorkflow: async (input) => {
        const chat = makeOpenAiChatCompletions({
          apiKey: openAiKey as string,
          model,
          baseUrl: "https://api.openai.com/v1",
          transport: makeFetchOpenAiTransport({ fetch, timeoutMs: "15 seconds" }),
          timeoutMs: "15 seconds",
        });

        return Effect.runPromise(clarifyFeedback({ chat, model })(input));
      },
    })(data);
  });
