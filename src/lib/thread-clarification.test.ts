import { Effect } from "effect";

import { describe, expect, it } from "vite-plus/test";

import type { ZhihuDirectAnswerCompletions } from "./zhihu-direct-answer-adapter";
import { DirectAnswerError, ZhihuDirectAnswerTransportError } from "./zhihu-direct-answer-adapter";

import {
  ClarificationWorkflowError,
  clarifyQuestion,
  type ClarificationInput,
  type ClarificationResult,
  type ThreadClarificationDeps,
} from "./thread-clarification";

// ── Helpers ──────────────────────────────────────────────────────────────

const makeDeps = (response: string): ThreadClarificationDeps => ({
  model: "zhida-thinking-1p5",
  chat: {
    complete: () => Effect.succeed(response),
  },
});

const makeFailDeps = (error: ClarificationWorkflowError): ThreadClarificationDeps => ({
  model: "zhida-thinking-1p5",
  chat: {
    complete: () =>
      Effect.fail(error) as unknown as Effect.Effect<
        string,
        DirectAnswerError | ZhihuDirectAnswerTransportError,
        never
      >,
  },
});

const makeRawChat = (response: string): ZhihuDirectAnswerCompletions => ({
  complete: () => Effect.succeed(response),
});

const validResponse = (): string =>
  JSON.stringify({
    refinedQuery: "modern web framework state management",
    alternatives: ["redux vs mobx", "signal-based state"],
    learningIntent: "Understand how state management evolved in front-end frameworks.",
    guidance: "Compare React, Vue, and Svelte approaches.",
    confidence: 0.85,
  });

const runSuccess = async (
  deps: ThreadClarificationDeps,
  input: ClarificationInput,
): Promise<ClarificationResult> => Effect.runPromise(clarifyQuestion(deps)(input));

const runError = async (
  deps: ThreadClarificationDeps,
  input: ClarificationInput,
): Promise<ClarificationWorkflowError> => {
  const exit = await Effect.runPromiseExit(clarifyQuestion(deps)(input));
  if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
    return exit.cause.error;
  }
  throw new Error("Expected clarification workflow to fail");
};

// ── clarifyQuestion workflow ─────────────────────────────────────────────

describe("thread-clarification clarifyQuestion", () => {
  const baseInput: ClarificationInput = {
    question: "What is the relationship between React hooks and state?",
    maxAlternatives: 3,
  };

  it("returns success with the structured result for a valid model response", async () => {
    const result = await runSuccess(makeDeps(validResponse()), baseInput);
    expect(result._tag).toBe("success");
    expect(result.refinedQuery).toBe("modern web framework state management");
    expect(result.alternatives).toEqual(["redux vs mobx", "signal-based state"]);
    expect(result.learningIntent).toBe(
      "Understand how state management evolved in front-end frameworks.",
    );
    expect(result.guidance).toBe("Compare React, Vue, and Svelte approaches.");
    expect(result.confidence).toBe(0.85);
  });

  it("builds the correct system prompt and user message", async () => {
    let capturedRequest: {
      model: string;
      messages: { role: string; content: string }[];
    } | null = null;

    const deps: ThreadClarificationDeps = {
      model: "test-model",
      chat: {
        complete: (request) => {
          capturedRequest = {
            model: request.model,
            messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
          };
          return Effect.succeed(validResponse());
        },
      },
    };

    await runSuccess(deps, baseInput);

    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.model).toBe("test-model");
    expect(capturedRequest!.messages[0].role).toBe("system");
    expect(capturedRequest!.messages[0].content).toContain("clarify a learning question");
    expect(capturedRequest!.messages[1].role).toBe("user");
    expect(capturedRequest!.messages[1].content).toBe(baseInput.question);
  });

  it("returns INVALID_QUESTION when the question is an empty string", async () => {
    const error = await runError(makeDeps(validResponse()), { ...baseInput, question: "" });
    expect(error.reason).toBe("INVALID_QUESTION");
  });

  it("returns INVALID_QUESTION when the question is whitespace only", async () => {
    const error = await runError(makeDeps(validResponse()), { ...baseInput, question: "   " });
    expect(error.reason).toBe("INVALID_QUESTION");
  });

  it("returns INVALID_QUESTION when the question exceeds max length", async () => {
    const longQuestion = "x".repeat(501);
    const error = await runError(makeDeps(validResponse()), {
      ...baseInput,
      question: longQuestion,
    });
    expect(error.reason).toBe("INVALID_QUESTION");
  });

  it("does not call the model when the question is empty", async () => {
    let calls = 0;
    const deps: ThreadClarificationDeps = {
      model: "test",
      chat: {
        complete: () => {
          calls += 1;
          return Effect.succeed(validResponse());
        },
      },
    };
    await runError(deps, { ...baseInput, question: "" });
    await runError(deps, { ...baseInput, question: "   " });
    expect(calls).toBe(0);
  });

  it("returns TRANSPORT_FAILED when the chat service throws a transport error", async () => {
    const deps = makeFailDeps(new ClarificationWorkflowError({ reason: "TRANSPORT_FAILED" }));
    const error = await runError(deps, baseInput);
    expect(error.reason).toBe("TRANSPORT_FAILED");
  });

  it("returns MALFORMED_RESPONSE for non-JSON model output", async () => {
    const deps: ThreadClarificationDeps = {
      model: "test",
      chat: makeRawChat("not json at all"),
    };
    const error = await runError(deps, baseInput);
    expect(error.reason).toBe("MALFORMED_RESPONSE");
  });

  it("returns MALFORMED_RESPONSE for a JSON array response", async () => {
    const deps: ThreadClarificationDeps = {
      model: "test",
      chat: makeRawChat(JSON.stringify([1, 2, 3])),
    };
    const error = await runError(deps, baseInput);
    expect(error.reason).toBe("MALFORMED_RESPONSE");
  });

  it("returns MALFORMED_RESPONSE for JSON that is not an object", async () => {
    const deps: ThreadClarificationDeps = {
      model: "test",
      chat: makeRawChat("42"),
    };
    const error = await runError(deps, baseInput);
    expect(error.reason).toBe("MALFORMED_RESPONSE");
  });

  it("returns EMPTY_REFINED_QUERY when refinedQuery is an empty string", async () => {
    const response = JSON.stringify({
      refinedQuery: "",
      alternatives: ["a"],
      learningIntent: "i",
      guidance: "g",
      confidence: 0.5,
    });
    const error = await runError(makeDeps(response), baseInput);
    expect(error.reason).toBe("EMPTY_REFINED_QUERY");
  });

  it("returns EMPTY_ALTERNATIVES when alternatives is empty", async () => {
    const response = JSON.stringify({
      refinedQuery: "q",
      alternatives: [],
      learningIntent: "i",
      guidance: "g",
      confidence: 0.5,
    });
    const error = await runError(makeDeps(response), baseInput);
    expect(error.reason).toBe("EMPTY_ALTERNATIVES");
  });

  it("returns EMPTY_ALTERNATIVES when alternatives exceeds max of 3", async () => {
    const response = JSON.stringify({
      refinedQuery: "q",
      alternatives: ["a", "b", "c", "d"],
      learningIntent: "i",
      guidance: "g",
      confidence: 0.5,
    });
    const error = await runError(makeDeps(response), baseInput);
    expect(error.reason).toBe("EMPTY_ALTERNATIVES");
  });

  it("returns EMPTY_ALTERNATIVES when a non-empty-string alternative is in the array", async () => {
    const response = JSON.stringify({
      refinedQuery: "q",
      alternatives: ["valid", null as unknown as string],
      learningIntent: "i",
      guidance: "g",
      confidence: 0.5,
    });
    const error = await runError(makeDeps(response), baseInput);
    expect(error.reason).toBe("EMPTY_ALTERNATIVES");
  });

  it("returns MISSING_INTENT when learningIntent is empty", async () => {
    const response = JSON.stringify({
      refinedQuery: "q",
      alternatives: ["a"],
      learningIntent: "",
      guidance: "g",
      confidence: 0.5,
    });
    const error = await runError(makeDeps(response), baseInput);
    expect(error.reason).toBe("MISSING_INTENT");
  });

  it("returns MISSING_INTENT when guidance is empty", async () => {
    const response = JSON.stringify({
      refinedQuery: "q",
      alternatives: ["a"],
      learningIntent: "i",
      guidance: "",
      confidence: 0.5,
    });
    const error = await runError(makeDeps(response), baseInput);
    expect(error.reason).toBe("MISSING_INTENT");
  });

  it("returns MALFORMED_RESPONSE when confidence is below 0", async () => {
    const response = JSON.stringify({
      refinedQuery: "q",
      alternatives: ["a"],
      learningIntent: "i",
      guidance: "g",
      confidence: -0.1,
    });
    const error = await runError(makeDeps(response), baseInput);
    expect(error.reason).toBe("MALFORMED_RESPONSE");
  });

  it("returns MALFORMED_RESPONSE when confidence is above 1", async () => {
    const response = JSON.stringify({
      refinedQuery: "q",
      alternatives: ["a"],
      learningIntent: "i",
      guidance: "g",
      confidence: 1.5,
    });
    const error = await runError(makeDeps(response), baseInput);
    expect(error.reason).toBe("MALFORMED_RESPONSE");
  });

  it("returns MALFORMED_RESPONSE when confidence is a string", async () => {
    const response = JSON.stringify({
      refinedQuery: "q",
      alternatives: ["a"],
      learningIntent: "i",
      guidance: "g",
      confidence: "high" as unknown as number,
    });
    const error = await runError(makeDeps(response), baseInput);
    expect(error.reason).toBe("MALFORMED_RESPONSE");
  });

  it("returns MALFORMED_RESPONSE when confidence is null", async () => {
    const response = JSON.stringify({
      refinedQuery: "q",
      alternatives: ["a"],
      learningIntent: "i",
      guidance: "g",
      confidence: null,
    });
    const error = await runError(makeDeps(response), baseInput);
    expect(error.reason).toBe("MALFORMED_RESPONSE");
  });

  it("accepts a single alternative", async () => {
    const response = JSON.stringify({
      refinedQuery: "single alt",
      alternatives: ["only option"],
      learningIntent: "intent",
      guidance: "go",
      confidence: 0.6,
    });
    const result = await runSuccess(makeDeps(response), baseInput);
    expect(result.alternatives).toEqual(["only option"]);
  });

  it("accepts confidence of exactly 0", async () => {
    const response = JSON.stringify({
      refinedQuery: "q",
      alternatives: ["a"],
      learningIntent: "i",
      guidance: "g",
      confidence: 0,
    });
    const result = await runSuccess(makeDeps(response), baseInput);
    expect(result.confidence).toBe(0);
  });

  it("accepts confidence of exactly 1", async () => {
    const response = JSON.stringify({
      refinedQuery: "q",
      alternatives: ["a"],
      learningIntent: "i",
      guidance: "g",
      confidence: 1,
    });
    const result = await runSuccess(makeDeps(response), baseInput);
    expect(result.confidence).toBe(1);
  });
});
