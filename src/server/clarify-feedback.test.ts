import { describe, expect, it } from "vite-plus/test";

import type { ClarificationSuccess } from "../lib/clarification-workflow";
import { createClarifyFeedbackHandler, type ClarifyFeedbackInput } from "./clarify-feedback";

const key = "sk-test";
const model = "test-model";

const success: ClarificationSuccess = {
  _tag: "success",
  assistantMessage: "Thanks for the details.",
  draft: {
    reason: "EVIDENCE_UNSUPPORTED",
    question: "The source contradicts the claim.",
    evidenceUrl: "https://example.com/doc",
    evidenceQuote: "Updated threshold.",
  },
  needsEvidence: true,
  isReady: false,
};

const baseInput: ClarifyFeedbackInput = {
  questionId: "42",
  answerId: "100",
  excerptFingerprint: "v1:0123456789abcdef",
  excerptText: "Test excerpt text.",
  conversation: [],
};

const makeHandler = (
  overrides: Partial<{
    readonly keyValue: string | undefined;
    readonly runWorkflow: (input: ClarifyFeedbackInput) => Promise<ClarificationSuccess>;
  }> = {},
) =>
  createClarifyFeedbackHandler({
    getModel: () => model,
    getOpenAiKey: () => overrides.keyValue ?? key,
    runWorkflow:
      overrides.runWorkflow ??
      (async () => {
        return success;
      }),
  });

describe("clarify feedback server handler", () => {
  it("rejects an incomplete request", async () => {
    for (const input of [
      { ...baseInput, questionId: "" },
      { ...baseInput, answerId: "" },
      { ...baseInput, excerptFingerprint: "" },
      { ...baseInput, excerptText: "" },
    ]) {
      const response = await makeHandler()(input);
      expect(response).toEqual({
        success: false,
        code: "INVALID_REQUEST",
        message: "请提供完整的信息。",
      });
    }
  });

  it("does not call the workflow when the key is missing", async () => {
    let calls = 0;
    const response = await makeHandler({
      keyValue: " ",
      runWorkflow: async () => {
        calls += 1;
        return success;
      },
    })(baseInput);

    expect(calls).toBe(0);
    expect(response).toEqual({
      success: false,
      code: "MISSING_MODEL_KEY",
      message: "AI 服务暂时不可用，请稍后再试。",
    });
  });

  it("returns a successful structured draft", async () => {
    const response = await makeHandler()(baseInput);

    expect(response).toEqual({
      success: true,
      assistantMessage: success.assistantMessage,
      draft: success.draft,
      needsEvidence: success.needsEvidence,
      isReady: success.isReady,
    });
  });

  it("trims identity and excerpt fields and passes optional context", async () => {
    let received: ClarifyFeedbackInput | undefined;
    const response = await makeHandler({
      runWorkflow: async (input) => {
        received = input;
        return success;
      },
    })({
      ...baseInput,
      questionId: " 42 ",
      answerId: " 100 ",
      excerptText: "  Test excerpt text.  ",
      recordFingerprint: " v1:aaaabbbbccccdddd ",
      currentReason: " SOURCE_UPDATED ",
    });

    expect(response.success).toBe(true);
    expect(received).toMatchObject({
      questionId: "42",
      answerId: "100",
      excerptText: "Test excerpt text.",
      recordFingerprint: "v1:aaaabbbbccccdddd",
      currentReason: "SOURCE_UPDATED",
    });
  });

  it("normalizes conversation roles and keeps the last 10 turns", async () => {
    let received: ClarifyFeedbackInput["conversation"] = [];
    await makeHandler({
      runWorkflow: async (input) => {
        received = input.conversation;
        return success;
      },
    })({
      ...baseInput,
      conversation: Array.from({ length: 14 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: ` Turn ${index + 1} `,
      })),
    });

    expect(received).toHaveLength(10);
    expect(received?.[0]).toEqual({ role: "user", content: "Turn 5" });
    expect(received?.[9]).toEqual({ role: "assistant", content: "Turn 14" });
  });

  it("maps workflow errors to a safe response", async () => {
    const response = await makeHandler({
      runWorkflow: async () => {
        throw new Error("connection lost with secret");
      },
    })(baseInput);

    expect(response).toEqual({
      success: false,
      code: "CLARIFICATION_UNAVAILABLE",
      message: "澄清服务暂时不可用，请稍后再试。",
    });
    expect(JSON.stringify(response)).not.toContain("secret");
  });
});
