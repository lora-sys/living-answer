import { describe, expect, it } from "vite-plus/test";

import { createPatchLifecycleRecord } from "./patch-lifecycle";

const baseInput = {
  questionId: "42",
  answerId: "100",
  excerptFingerprint: "v1:0123456789abcdef",
  reason: "The cited release threshold has changed.",
  selectedEvidenceFingerprints: ["v1:1111111111111111"],
  evidence: [
    {
      fingerprint: "v1:1111111111111111",
      sourceLabel: "官方说明",
      sourceUrl: "https://example.com/official",
      quote: "The current threshold is 2026.",
    },
  ],
  affectedWording: "The original wording",
  currentState: "The current state",
  impactOnAnswer: "The impact",
  capturedAt: 1_700_000_000_000,
  eventAt: 1_700_000_100_000,
} as const;

describe("patch-lifecycle", () => {
  it("creates an immutable fingerprinted record", () => {
    const result = createPatchLifecycleRecord(baseInput);
    expect(result._tag).toBe("success");
    if (result._tag !== "success") return;

    expect(Object.isFrozen(result.record)).toBe(true);
    expect(result.record.recordFingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
  });

  it("rejects an invalid evidence fingerprint", () => {
    const result = createPatchLifecycleRecord({
      ...baseInput,
      selectedEvidenceFingerprints: ["invalid"],
    });
    expect(result).toEqual({ _tag: "failure", reason: "INVALID_EVIDENCE" });
  });

  it("rejects an invalid optional analysis field", () => {
    const result = createPatchLifecycleRecord({
      ...baseInput,
      currentState: "bad\ncontrol",
    });
    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANALYSIS_FIELD" });
  });
});
