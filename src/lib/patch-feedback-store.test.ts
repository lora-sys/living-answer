import { Effect } from "effect";
import { existsSync, unlinkSync } from "node:fs";

import { createPatchFeedback } from "./patch-feedback";
import { makeSqlitePatchFeedbackStore } from "./patch-feedback-store";
import { beforeAll, describe, expect, it } from "vite-plus/test";

const TEST_DB_PATH = ".local/test-patch-feedback.db";

beforeAll(() => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
});

const createRecord = (question = "Why was this source selected?") => {
  const result = createPatchFeedback({
    questionId: "42",
    answerId: "100",
    excerptFingerprint: "v1:0123456789abcdef",
    reason: "EVIDENCE_UNSUPPORTED",
    question,
    submittedAt: 1_700_000_000_000,
  });
  if (result._tag !== "success") throw new Error("invalid test feedback");
  return result.feedback;
};

describe("patch feedback store", () => {
  it("persists a feedback item and its review state", async () => {
    const store = await Effect.runPromise(makeSqlitePatchFeedbackStore(TEST_DB_PATH));
    const saved = await Effect.runPromise(
      store.save(createRecord(), "PENDING_REVIEW", 1_700_000_001_000),
    );

    expect(saved.feedbackFingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
    expect(saved.reviewState).toBe("PENDING_REVIEW");
    expect(saved.reviewedAt).toBe(1_700_000_001_000);
  });

  it("keeps the original state when the same feedback is saved again", async () => {
    const store = await Effect.runPromise(makeSqlitePatchFeedbackStore(TEST_DB_PATH));
    const feedback = createRecord("Duplicate question.");

    await Effect.runPromise(store.save(feedback, "EVIDENCE_GATE_PASSED", 1_700_000_002_000));
    const duplicate = await Effect.runPromise(
      store.save(feedback, "PENDING_REVIEW", 1_700_000_003_000),
    );

    expect(duplicate.feedbackFingerprint).toBe(feedback.feedbackFingerprint);
    expect(duplicate.reviewState).toBe("EVIDENCE_GATE_PASSED");
    expect(duplicate.reviewedAt).toBe(1_700_000_002_000);
  });

  it("keeps data across reopening the database", async () => {
    const reopened = await Effect.runPromise(makeSqlitePatchFeedbackStore(TEST_DB_PATH));
    const saved = await Effect.runPromise(
      reopened.save(createRecord("Second question."), "EVIDENCE_GATE_INSUFFICIENT", 1_700_000_004_000),
    );

    expect(saved.question).toBe("Second question.");
    expect(saved.reviewState).toBe("EVIDENCE_GATE_INSUFFICIENT");
  });
});
