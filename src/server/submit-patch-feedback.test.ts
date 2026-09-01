import { describe, expect, it } from "vite-plus/test";

import {
  createSubmitPatchFeedbackHandler,
  type SubmitPatchFeedbackInput,
} from "./submit-patch-feedback";
import {
  PatchFeedbackStoreError,
  type PatchFeedbackRecord,
  type PatchFeedbackStore,
} from "../lib/patch-feedback-store";
import { Effect } from "effect";

const FAILED_STORE: PatchFeedbackStore = {
  save: () => Effect.fail(new PatchFeedbackStoreError({ reason: "unused" })),
};

const SUCCESS_STORE: PatchFeedbackStore = {
  save: (feedback: PatchFeedbackRecord, reviewState, reviewedAt) =>
    Effect.succeed({
      ...feedback,
      reviewState,
      reviewedAt,
    }),
};

const baseInput: SubmitPatchFeedbackInput = {
  questionId: "42",
  answerId: "100",
  excerptFingerprint: "v1:0123456789abcdef",
  reason: "EVIDENCE_UNSUPPORTED",
  question: "The source does not support the claim.",
};

describe("submit-patch-feedback", () => {
  it("queues feedback without evidence", async () => {
    const response = await createSubmitPatchFeedbackHandler({
      createFeedbackStore: async () => SUCCESS_STORE,
    })(baseInput);

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;
    expect(response.reviewState).toBe("PENDING_REVIEW");
    expect(response.feedbackFingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
  });

  it("reviews quoted evidence and does not create a patch", async () => {
    let reviewedClaim = "";
    const response = await createSubmitPatchFeedbackHandler({
      createFeedbackStore: async () => SUCCESS_STORE,
      reviewEvidence: async (claimText) => {
        reviewedClaim = claimText;
        return "passed";
      },
    })({
      ...baseInput,
      evidenceUrl: "https://example.com/source",
      evidenceQuote: "The threshold changed in 2026.",
    });

    expect(reviewedClaim).toBe(baseInput.question);
    expect(response).toMatchObject({
      status: "ok",
      reviewState: "EVIDENCE_GATE_PASSED",
    });
  });

  it("keeps feedback queued when the reviewer is unavailable", async () => {
    const response = await createSubmitPatchFeedbackHandler({
      createFeedbackStore: async () => SUCCESS_STORE,
      reviewEvidence: async () => {
        throw new Error("reviewer unavailable");
      },
    })({
      ...baseInput,
      evidenceUrl: "https://example.com/source",
      evidenceQuote: "The threshold changed in 2026.",
    });

    expect(response).toMatchObject({
      status: "ok",
      reviewState: "PENDING_REVIEW",
    });
  });

  it("returns a stable store error without exposing details", async () => {
    const response = await createSubmitPatchFeedbackHandler({
      createFeedbackStore: async () => {
        throw new Error("database unavailable");
      },
    })(baseInput);

    expect(response).toEqual({
      status: "error",
      code: "FEEDBACK_STORE_ERROR",
      message: "反馈提交出现异常，请稍后再试。",
    });
  });

  it("rejects malformed feedback without opening the store", async () => {
    let storeOpened = false;
    const response = await createSubmitPatchFeedbackHandler({
      createFeedbackStore: async () => {
        storeOpened = true;
        return SUCCESS_STORE;
      },
    })({ ...baseInput, excerptFingerprint: "invalid" });

    expect(response.status).toBe("error");
    expect(storeOpened).toBe(false);
  });
});
