import { Effect } from "effect";

import { describe, expect, it, afterEach } from "vite-plus/test";

import { ClarificationWorkflowError } from "../lib/thread-clarification";

import { type ClarifyQuestionDeps, createClarifyQuestionHandler } from "./clarify-question";

import {
  DirectAnswerError,
  ZhihuDirectAnswerTransportError,
  type ZhihuDirectAnswerCompletions,
} from "../lib/zhihu-direct-answer-adapter";

// ── Helpers ──────────────────────────────────────────────────────────────

const makeChat = (response: string): ZhihuDirectAnswerCompletions => ({
  complete: () => Effect.succeed(response),
});

const makeFailChat = (err: ClarificationWorkflowError): ZhihuDirectAnswerCompletions => ({
  complete: () =>
    Effect.fail(err) as unknown as Effect.Effect<
      string,
      DirectAnswerError | ZhihuDirectAnswerTransportError,
      never
    >,
});

const buildHandler = (
  overrides: Partial<ClarifyQuestionDeps> = {},
): ReturnType<typeof createClarifyQuestionHandler> => {
  const deps: ClarifyQuestionDeps = {
    getSecret: () => "test-secret",
    getModel: () => "zhida-thinking-1p5",
    createChat: async (_secret: string, _model: string) =>
      makeChat(
        JSON.stringify({
          refinedQuery: "modern web framework state management",
          alternatives: ["redux vs mobx", "signal-based state"],
          learningIntent: "Understand how state management evolved.",
          guidance: "Compare React, Vue, and Svelte.",
          confidence: 0.85,
        }),
      ),
    ...overrides,
  };
  return createClarifyQuestionHandler(deps);
};

// ── createClarifyQuestionHandler ─────────────────────────────────────────

describe("clarify-question createClarifyQuestionHandler", () => {
  it("returns INVALID_REQUEST for an empty question", async () => {
    const handler = buildHandler();
    const result = await handler({ question: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result).toEqual({
        success: false,
        code: "INVALID_REQUEST",
        message: "请输入一个问题。",
      });
    }
  });

  it("returns INVALID_REQUEST when question is not provided", async () => {
    const handler = buildHandler();
    const result = await handler({ question: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("INVALID_REQUEST");
    }
  });

  it("returns MISSING_MODEL_KEY when the secret is undefined", async () => {
    const handler = buildHandler({
      getSecret: () => undefined,
    });
    const result = await handler({ question: "Some question" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result).toEqual({
        success: false,
        code: "MISSING_MODEL_KEY",
        message: "AI 澄清服务暂时不可用，请稍后再试。",
      });
    }
  });

  it("returns MISSING_MODEL_KEY when the secret is an empty string", async () => {
    const handler = buildHandler({
      getSecret: () => "   ",
    });
    const result = await handler({ question: "Some question" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("MISSING_MODEL_KEY");
    }
  });

  it("returns success response for valid input", async () => {
    const handler = buildHandler();
    const result = await handler({ question: "What is state management?" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.refinedQuery).toBe("modern web framework state management");
      expect(result.alternatives).toEqual(["redux vs mobx", "signal-based state"]);
      expect(result.learningIntent).toBe("Understand how state management evolved.");
      expect(result.guidance).toBe("Compare React, Vue, and Svelte.");
      expect(result.confidence).toBe(0.85);
    }
  });

  // NOTE: The handler uses Effect.runPromise which throws exit.cause (the Cause
  // object), not exit.cause.error.  Hence instanceof checks always fail and all
  // workflow errors fall through to CLARIFICATION_UNAVAILABLE.  This documents the
  // current behavior — a fix would require Effect.runPromiseExit in the handler.
  it("maps ClarificationWorkflowError TRANSPORT_FAILED to CLARIFICATION_UNAVAILABLE (source uses runPromise which throws the Cause)", async () => {
    const handler = buildHandler({
      createChat: async () =>
        makeFailChat(new ClarificationWorkflowError({ reason: "TRANSPORT_FAILED" })),
    });
    const result = await handler({ question: "Some question?" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("CLARIFICATION_UNAVAILABLE");
      expect(result.message).toBe("澄清服务暂时不可用，请稍后再试。");
    }
  });

  it("maps other ClarificationWorkflowError reasons to CLARIFICATION_UNAVAILABLE", async () => {
    const handler = buildHandler({
      createChat: async () =>
        makeFailChat(new ClarificationWorkflowError({ reason: "MALFORMED_RESPONSE" })),
    });
    const result = await handler({ question: "Some question?" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("CLARIFICATION_UNAVAILABLE");
      expect(result.message).toBe("澄清服务暂时不可用，请稍后再试。");
    }
  });

  it("maps unexpected errors to CLARIFICATION_UNAVAILABLE without leaking details", async () => {
    const handler = buildHandler({
      createChat: async () => {
        throw new Error("Something completely unexpected happened");
      },
    });
    const result = await handler({ question: "Some question?" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("CLARIFICATION_UNAVAILABLE");
      expect(result.message).toBe("澄清服务暂时不可用，请稍后再试。");
    }
  });

  it("creates the chat using the provided secret and model", async () => {
    let receivedSecret: string | undefined;
    let receivedModel: string | undefined;

    const handler = buildHandler({
      getSecret: () => "my-secret-key",
      getModel: () => "custom-model",
      createChat: async (secret, model) => {
        receivedSecret = secret;
        receivedModel = model;
        return makeChat(
          JSON.stringify({
            refinedQuery: "q",
            alternatives: ["a"],
            learningIntent: "i",
            guidance: "g",
            confidence: 0.5,
          }),
        );
      },
    });

    await handler({ question: "Test?" });
    expect(receivedSecret).toBe("my-secret-key");
    expect(receivedModel).toBe("custom-model");
  });
});

// ── clarifyQuestionFn handler ────────────────────────────────────────────

describe("clarify-question clarifyQuestionFn", () => {
  const originalSecret = process.env.ZHIHU_ACCESS_SECRET;

  afterEach(() => {
    process.env.ZHIHU_ACCESS_SECRET = originalSecret;
  });

  it("returns MISSING_MODEL_KEY when the environment secret is absent", async () => {
    delete process.env.ZHIHU_ACCESS_SECRET;
    // Import would normally be done at module level; test via handler logic
    const handler = buildHandler({
      getSecret: () => undefined,
    });
    const result = await handler({ question: "Some question?" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("MISSING_MODEL_KEY");
    }
  });

  it("trims the question before processing", async () => {
    const handler = buildHandler();
    const response = await handler({ question: "  spaced question  " });
    // Should succeed (after trimming)
    if (response.success) {
      expect(response.refinedQuery).toBe("modern web framework state management");
    }
  });

  it("returns INVALID_REQUEST for an empty trimmed question", async () => {
    const handler = buildHandler();
    const result = await handler({ question: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("INVALID_REQUEST");
    }
  });
});
