import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { OpenAiTransportError, type OpenAiChatCompletions } from "./openai-adapter";
import {
  ClarificationWorkflowError,
  clarifyFeedback,
  type ClarificationInput,
  type ClarificationTurn,
} from "./clarification-workflow";

const makeChat = (content: string | OpenAiTransportError): OpenAiChatCompletions => ({
  complete: () => (typeof content === "string" ? Effect.succeed(content) : Effect.fail(content)),
});

const baseInput: ClarificationInput = {
  questionId: "42",
  answerId: "100",
  excerptFingerprint: "v1:0123456789abcdef",
  excerptText: "This is a test excerpt.",
  conversation: [],
};

const validResponse = (): string =>
  JSON.stringify({
    assistantMessage: "Thanks for the details.",
    draft: {
      reason: "EVIDENCE_UNSUPPORTED",
      question: "The source does not support the claim.",
    },
    needsEvidence: false,
    isReady: true,
  });

const runLeft = async (
  effect: Effect.Effect<unknown, ClarificationWorkflowError>,
): Promise<ClarificationWorkflowError> => {
  const exit = await Effect.runPromiseExit(effect);
  if (exit._tag === "Failure" && exit.cause._tag === "Fail") return exit.cause.error;
  throw new Error("Expected the workflow to fail");
};

describe("clarification workflow", () => {
  it("maps a valid response to a structured draft", async () => {
    const result = await Effect.runPromise(
      clarifyFeedback({ model: "test-model", chat: makeChat(validResponse()) })(baseInput),
    );

    expect(result.assistantMessage).toBe("Thanks for the details.");
    expect(result.draft.reason).toBe("EVIDENCE_UNSUPPORTED");
    expect(result.draft.question).toBe("The source does not support the claim.");
    expect(result.needsEvidence).toBe(false);
    expect(result.isReady).toBe(true);
  });

  it("normalizes evidence and keeps the pair intact", async () => {
    const response = JSON.stringify({
      assistantMessage: "Got it.",
      draft: {
        reason: "SOURCE_UPDATED",
        question: "The source has changed.",
        evidenceUrl: "https://user:pass@example.com/source?a=1",
        evidenceQuote: "The current value is 2.",
      },
      needsEvidence: false,
      isReady: true,
    });
    const result = await Effect.runPromise(
      clarifyFeedback({ model: "test-model", chat: makeChat(response) })(baseInput),
    );

    expect(result.draft.evidenceUrl).toBe("https://example.com/source?a=1");
    expect(result.draft.evidenceQuote).toBe("The current value is 2.");
  });

  it("sends the system prompt, task prompt, conversation, and current reason", async () => {
    let request: unknown;
    const chat: OpenAiChatCompletions = {
      complete: (value) => {
        request = value;
        return Effect.succeed(validResponse());
      },
    };
    const conversation: ClarificationTurn[] = [
      { role: "user", content: "The threshold changed." },
      { role: "assistant", content: "Do you have a source?" },
    ];

    await Effect.runPromise(
      clarifyFeedback({ model: "test-model", chat })({
        ...baseInput,
        currentReason: "SOURCE_UPDATED",
        conversation,
      }),
    );

    expect(request).toMatchObject({
      model: "test-model",
      messages: [
        { role: "system", content: expect.stringContaining("clarify user feedback") },
        { role: "user", content: expect.any(String) },
      ],
    });
    const taskPrompt = JSON.parse(
      (request as { messages: { content: string }[] }).messages[1]!.content,
    );
    expect(taskPrompt.currentReason).toBe("SOURCE_UPDATED");
    expect(taskPrompt.conversation).toEqual(conversation);
  });

  it("rejects malformed model output", async () => {
    const cases = ["not json", "[1, 2, 3]", "42"];
    for (const content of cases) {
      const error = await runLeft(
        clarifyFeedback({ model: "test-model", chat: makeChat(content) })(baseInput),
      );
      expect(error.reason).toBe("INVALID_JSON");
    }
  });

  it("rejects a response without an assistant message", async () => {
    const error = await runLeft(
      clarifyFeedback({ model: "test-model", chat: makeChat(JSON.stringify({ draft: {} })) })(
        baseInput,
      ),
    );

    expect(error.reason).toBe("MISSING_TEXT");
  });

  it("rejects invalid model output fields", async () => {
    const cases = [
      {
        content: JSON.stringify({
          assistantMessage: "",
          draft: { reason: "OTHER", question: "Why?" },
          needsEvidence: false,
          isReady: true,
        }),
        expected: "MISSING_TEXT",
      },
      {
        content: JSON.stringify({
          assistantMessage: "Thanks.",
          draft: { reason: "UNKNOWN", question: "Why?" },
          needsEvidence: false,
          isReady: true,
        }),
        expected: "INVALID_REASON",
      },
      {
        content: JSON.stringify({
          assistantMessage: "Thanks.",
          draft: { reason: "OTHER", question: "Why?", evidenceQuote: "quote only" },
          needsEvidence: false,
          isReady: true,
        }),
        expected: "MISMATCHED_EVIDENCE",
      },
      {
        content: JSON.stringify({
          assistantMessage: "Thanks.",
          draft: { reason: "OTHER", question: "Why?", evidenceUrl: "https://example.com" },
          needsEvidence: false,
          isReady: true,
        }),
        expected: "MISMATCHED_EVIDENCE",
      },
    ] as const;

    for (const { content, expected } of cases) {
      const error = await runLeft(
        clarifyFeedback({ model: "test-model", chat: makeChat(content) })(baseInput),
      );
      expect(error.reason).toBe(expected);
    }
  });

  it("validates input before contacting the model", async () => {
    let calls = 0;
    const chat: OpenAiChatCompletions = {
      complete: () => {
        calls += 1;
        return Effect.succeed(validResponse());
      },
    };

    await runLeft(clarifyFeedback({ model: "test-model", chat })({ ...baseInput, questionId: "" }));
    await runLeft(
      clarifyFeedback({ model: "test-model", chat })({
        ...baseInput,
        excerptFingerprint: "invalid",
      }),
    );
    await runLeft(
      clarifyFeedback({ model: "test-model", chat })({
        ...baseInput,
        currentReason: "UNKNOWN" as ClarificationInput["currentReason"],
      }),
    );
    await runLeft(
      clarifyFeedback({ model: "test-model", chat })({
        ...baseInput,
        conversation: Array.from({ length: 11 }, () => ({ role: "user", content: "x" })),
      }),
    );

    expect(calls).toBe(0);
  });

  it("maps transport failure without leaking the cause", async () => {
    const error = await runLeft(
      clarifyFeedback({
        model: "test-model",
        chat: makeChat(new OpenAiTransportError({ reason: "NETWORK_FAILED" })),
      })(baseInput),
    );

    expect(error.reason).toBe("TRANSPORT_FAILED");
  });
});
