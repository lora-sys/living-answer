import { describe, expect, it } from "vite-plus/test";

import { createPatchFeedback } from "./patch-feedback";

const baseInput = {
  questionId: "42",
  answerId: "100",
  excerptFingerprint: "v1:0123456789abcdef",
  reason: "EVIDENCE_UNSUPPORTED" as const,
  question: "The selected source does not support this claim.",
  submittedAt: 1_700_000_000_000,
};

describe("createPatchFeedback", () => {
  it("normalizes and fingerprints a feedback record", () => {
    const first = createPatchFeedback({
      ...baseInput,
      question: "  The selected source does not support this claim.  ",
    });
    const second = createPatchFeedback(baseInput);

    expect(first._tag).toBe("success");
    if (first._tag !== "success") return;
    expect(second._tag).toBe("success");
    if (second._tag !== "success") return;

    expect(first.feedback.question).toBe("The selected source does not support this claim.");
    expect(first.feedback.feedbackFingerprint).toBe(second.feedback.feedbackFingerprint);
    expect(first.feedback.feedbackFingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
  });

  it("normalizes user evidence URLs without credentials", () => {
    const result = createPatchFeedback({
      ...baseInput,
      evidenceUrl: "https://user:secret@example.com/source",
      evidenceQuote: "The threshold changed in 2026.",
    });

    expect(result._tag).toBe("success");
    if (result._tag !== "success") return;
    expect(result.feedback.evidenceUrl).toBe("https://example.com/source");
  });

  it("rejects malformed evidence and invalid targets", () => {
    expect(createPatchFeedback({ ...baseInput, evidenceUrl: "not-a-url" })._tag).toBe("failure");
    expect(createPatchFeedback({ ...baseInput, questionId: "" })._tag).toBe("failure");
  });
});
