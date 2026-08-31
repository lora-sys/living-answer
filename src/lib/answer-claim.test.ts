import { describe, expect, it } from "vite-plus/test";

import { createAnswerClaim } from "./answer-claim";

import type { AnswerClaim, AnswerClaimResult } from "./answer-claim";

// ── Helpers ────────────────────────────────────────────────────────────────────

const expectClaim = (result: AnswerClaimResult): AnswerClaim => {
  if (result._tag === "success") {
    return result.claim;
  }
  throw new Error(`Unexpected claim failure: ${result.reason}`);
};

/** Shared excerpt text containing every anchor used in positive tests. */
const TEST_EXCERPT =
  "The Earth orbits the Sun in an elliptical path. This is a valid claim " +
  "about how the planet orbits. fooish anchor claim text. same text here. " +
  "same text diff. first claim text. second claim text. " +
  "A claim about technology and the future.";

/**
 * Build a fully-consistent claim with matching fingerprint for the given fields.
 * The anchor must be a substring of the shared excerpt.
 */
const makeClaim = (
  overrides: {
    readonly questionId?: string;
    readonly answerId?: string;
    readonly sourceContentId?: string;
    readonly sourceEditTime?: number;
    readonly excerptFingerprint?: string;
    readonly excerpt?: string;
    readonly claimText?: string;
    readonly anchorText?: string;
    readonly volatility?: "high" | "medium" | "low";
    readonly decisionRelevance?: "high" | "medium" | "low";
    readonly candidateReason?: string;
    readonly extractedAt?: number;
  } = {},
): AnswerClaim => {
  const claimText = overrides.claimText ?? "The Earth orbits around the Sun in an elliptical path.";
  const anchorText = overrides.anchorText ?? "The Earth orbits the Sun";
  const candidateReason =
    overrides.candidateReason ??
    "This was stated as a timeless fact but new observations may refine it.";

  const result = createAnswerClaim({
    questionId: overrides.questionId ?? "42",
    answerId: overrides.answerId ?? "100",
    sourceContentId: overrides.sourceContentId ?? "123",
    sourceContentType: "Answer",
    sourceEditTime: overrides.sourceEditTime ?? 1_699_999_999_000,
    excerptFingerprint: overrides.excerptFingerprint ?? "v1:0123456789abcdef",
    excerpt: overrides.excerpt ?? TEST_EXCERPT,
    claimText,
    anchorText,
    volatility: overrides.volatility ?? "high",
    decisionRelevance: overrides.decisionRelevance ?? "high",
    candidateReason,
    extractedAt: overrides.extractedAt ?? 1_700_000_000_000,
  });

  if (result._tag === "failure") {
    throw new Error(`Failed to create test claim: ${result.reason}`);
  }

  return result.claim;
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("createAnswerClaim", () => {
  // ── success ──────────────────────────────────────────────────────────────

  it("creates a frozen claim with all fields", () => {
    const claim = makeClaim();

    expect(claim.questionId).toBe("42");
    expect(claim.answerId).toBe("100");
    expect(claim.sourceContentId).toBe("123");
    expect(claim.sourceContentType).toBe("Answer");
    expect(claim.sourceEditTime).toBe(1_699_999_999_000);
    expect(claim.excerptFingerprint).toBe("v1:0123456789abcdef");
    expect(claim.volatility).toBe("high");
    expect(claim.decisionRelevance).toBe("high");
    expect(claim.status).toBe("candidate");
    expect(Object.isFrozen(claim)).toBe(true);
  });

  it("generates deterministic fingerprint matching v1:16hex pattern", () => {
    const a = makeClaim({
      claimText: "foo anchor text restated clearly",
      anchorText: "fooish anchor",
    });
    const b = makeClaim({
      claimText: "foo anchor text restated clearly",
      anchorText: "fooish anchor",
    });

    expect(a.claimFingerprint).toBe(b.claimFingerprint);
    expect(a.claimFingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
  });

  it("output is Object.freeze'd", () => {
    const claim = makeClaim();
    expect(Object.isFrozen(claim)).toBe(true);
    expect(Object.isFrozen(claim.claimFingerprint)).toBe(true);
  });

  it("candidateReason is trimmed and within length limits", () => {
    const longReason = "x".repeat(260);
    const result = createAnswerClaim({
      questionId: "1",
      answerId: "1",
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerptFingerprint: "v1:0123456789abcdef",
      excerpt: TEST_EXCERPT,
      claimText: "This is a valid claim with enough text to pass the test harness.",
      anchorText: "is a valid claim",
      volatility: "medium",
      decisionRelevance: "low",
      candidateReason: longReason,
      extractedAt: 1_000,
    });

    expect(result._tag).toBe("success");
    const claim = expectClaim(result);
    expect(claim.candidateReason.length).toBeLessThanOrEqual(260);
    expect(claim.candidateReason.length).toBeGreaterThanOrEqual(24);
  });

  it("same content with different extractedAt produces the same fingerprint", () => {
    const first = makeClaim({ extractedAt: 1000 });
    const second = makeClaim({ extractedAt: 9_999_999_999 });

    expect(first.claimFingerprint).toBe(second.claimFingerprint);
  });

  it("changed claimText produces different fingerprint", () => {
    const a = makeClaim({
      claimText: "first claim text here restated fully",
      anchorText: "first claim text",
    });
    const b = makeClaim({
      claimText: "second claim text here restated fully",
      anchorText: "second claim text",
    });

    expect(a.claimFingerprint).not.toBe(b.claimFingerprint);
  });

  it("changed anchorText produces different fingerprint", () => {
    const a = makeClaim({
      claimText: "same text here restated fully",
      anchorText: "same text here",
    });
    const b = makeClaim({
      claimText: "same text here restated fully",
      anchorText: "same text diff",
    });

    expect(a.claimFingerprint).not.toBe(b.claimFingerprint);
  });

  // ── normalisation ────────────────────────────────────────────────────────

  it("normalises CRLF to LF in claimText", () => {
    const longClaim = "The Earth\r\norbits the Sun";
    const result = createAnswerClaim({
      questionId: "1",
      answerId: "1",
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerptFingerprint: "v1:0123456789abcdef",
      excerpt: TEST_EXCERPT,
      claimText: longClaim,
      anchorText: "The Earth orbits",
      volatility: "low",
      decisionRelevance: "low",
      candidateReason: "This is a valid reason with enough text to pass the test.",
      extractedAt: 1_000,
    });

    const claim = expectClaim(result);
    expect(claim.claimText).not.toContain("\r");
  });

  it("trims leading and trailing whitespace in claimText", () => {
    const result = createAnswerClaim({
      questionId: "1",
      answerId: "1",
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerptFingerprint: "v1:0123456789abcdef",
      excerpt: TEST_EXCERPT,
      claimText: "  The planet orbits the star in an elliptical fashion.",
      anchorText: "the planet orbits",
      volatility: "low",
      decisionRelevance: "low",
      candidateReason: "This is a valid reason with enough text to pass the test.",
      extractedAt: 1_000,
    });

    const claim = expectClaim(result);
    expect(claim.claimText).not.toMatch(/^\s/);
    expect(claim.claimText).not.toMatch(/\s$/);
  });

  // ── failures ─────────────────────────────────────────────────────────────

  it("rejects empty questionId", () => {
    expect(
      createAnswerClaim({
        questionId: "",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "This is a valid claim with enough text.",
        anchorText: "valid claim",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a valid reason with enough text to pass the test.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_QUESTION_ID" });
  });

  it("rejects non-numeric questionId", () => {
    expect(
      createAnswerClaim({
        questionId: "abc",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "This is a valid claim with enough text.",
        anchorText: "valid claim",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a valid reason with enough text to pass the test.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_QUESTION_ID" });
  });

  it("rejects non-numeric answerId", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "x",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "This is a valid claim with enough text.",
        anchorText: "valid claim",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a valid reason with enough text to pass the test.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_ID" });
  });

  it("rejects negative sourceEditTime", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: -1,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "This is a valid claim with enough text.",
        anchorText: "valid claim",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a valid reason with enough text to pass the test.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_EDIT_TIME" });
  });

  it("rejects invalid excerptFingerprint format", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "not-a-fingerprint",
        excerpt: TEST_EXCERPT,
        claimText: "This is a valid claim with enough text.",
        anchorText: "valid claim",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a valid reason with enough text to pass the test.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_EXCERPT_FINGERPRINT" });
  });

  it("rejects empty excerptFingerprint", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "",
        excerpt: TEST_EXCERPT,
        claimText: "This is a valid claim with enough text.",
        anchorText: "valid claim",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a valid reason with enough text to pass the test.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_EXCERPT_FINGERPRINT" });
  });

  it("rejects empty excerpt text", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: "",
        claimText: "This is a valid claim with enough text.",
        anchorText: "valid claim",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a valid reason with enough text to pass the test.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_EXCERPT_TEXT" });
  });

  it("rejects claimText below minimum length", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "too short",
        anchorText: "too short",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a reason.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CLAIM_TEXT" });
  });

  it("rejects claimText above maximum length", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "x".repeat(221),
        anchorText: "x",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a reason that is long enough.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CLAIM_TEXT" });
  });

  it("rejects anchorText below minimum length", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "This is a valid claim with enough text.",
        anchorText: "short",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a reason that is long enough.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_ANCHOR_TEXT" });
  });

  it("rejects anchorText above maximum length", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "This is a valid claim with enough text.",
        anchorText: "x".repeat(221),
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a reason that is long enough.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_ANCHOR_TEXT" });
  });

  it("rejects anchorText not present in the excerpt", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "This claims specific technology fact as a premise.",
        anchorText: "The technology causes a difference.",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a reason that is long enough.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "ANCHOR_NOT_IN_EXCERPT" });
  });

  it("rejects invalid volatility", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "The claim text has sufficient length to pass validation.",
        anchorText: "anchor claim text",
        volatility: "critical" as "high",
        decisionRelevance: "low",
        candidateReason: "This is a reason that is long enough.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_VOLATILITY" });
  });

  it("rejects invalid decisionRelevance", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "The claim text has sufficient length to pass validation.",
        anchorText: "anchor claim text",
        volatility: "low",
        decisionRelevance: "must" as "high",
        candidateReason: "This is a reason that is long enough.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_DECISION_RELEVANCE" });
  });

  it("rejects candidateReason below minimum length", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "The claim text has sufficient length to pass validation.",
        anchorText: "anchor claim text",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "too short",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CANDIDATE_REASON" });
  });

  it("rejects candidateReason above maximum length", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "The claim text has sufficient length to pass validation.",
        anchorText: "anchor claim text",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "x".repeat(261),
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CANDIDATE_REASON" });
  });

  it("rejects control characters in claimText", () => {
    // Bell character (U+0007) in claimText
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "The claim text has\tcontrol chars.",
        anchorText: "anchor claim text",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a reason that is long enough.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CLAIM_TEXT" });
  });

  it("rejects control characters in anchorText", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "The claim text has sufficient length.",
        anchorText: "claim\x00text",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a reason that is long enough.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_ANCHOR_TEXT" });
  });

  it("rejects control characters in candidateReason", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "The claim text has sufficient length.",
        anchorText: "anchor claim text",
        volatility: "low",
        decisionRelevance: "low",
        // Tab character in reason
        candidateReason: "This\tis a reason.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CANDIDATE_REASON" });
  });

  it("rejects negative extractedAt", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "The claim text has sufficient length.",
        anchorText: "anchor claim text",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a reason that is long enough.",
        extractedAt: -1,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_EXTRACTED_AT" });
  });

  // ── validation order ──────────────────────────────────────────────────────

  it("returns INVALID_EXTRACTED_AT before INVALID_QUESTION_ID", () => {
    expect(
      createAnswerClaim({
        questionId: "",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "The claim text has sufficient length.",
        anchorText: "claim",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a reason that is long enough.",
        extractedAt: -1,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_EXTRACTED_AT" });
  });

  it("returns INVALID_QUESTION_ID before INVALID_ANSWER_ID", () => {
    expect(
      createAnswerClaim({
        questionId: "",
        answerId: "bad",
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "The claim text has sufficient length to pass validation.",
        anchorText: "anchor claim text",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a reason that is long enough.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_QUESTION_ID" });
  });

  // ── Unicode normalisation ─────────────────────────────────────────────────

  it("applies Unicode NFC normalisation to claimText", () => {
    const decomposed = "Ä claim about technology and the future";
    const precomposed = "Ä claim about technology and the future";

    const aResult = createAnswerClaim({
      questionId: "1",
      answerId: "1",
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerptFingerprint: "v1:0123456789abcdef",
      excerpt: TEST_EXCERPT,
      claimText: decomposed,
      anchorText: "claim about technology",
      volatility: "low",
      decisionRelevance: "low",
      candidateReason: "This is a reason that is long enough.",
      extractedAt: 1_000,
    });
    const bResult = createAnswerClaim({
      questionId: "1",
      answerId: "1",
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerptFingerprint: "v1:0123456789abcdef",
      excerpt: TEST_EXCERPT,
      claimText: precomposed,
      anchorText: "claim about technology",
      volatility: "low",
      decisionRelevance: "low",
      candidateReason: "This is a reason that is long enough.",
      extractedAt: 1_000,
    });

    const aEx = expectClaim(aResult);
    const bEx = expectClaim(bResult);
    expect(aEx.claimText).toBe(bEx.claimText);
  });

  // ── sourceContentType validation ─────────────────────────────────────────

  it("rejects Article sourceContentType", () => {
    expect(
      createAnswerClaim({
        questionId: "1",
        answerId: "1",
        sourceContentId: "1",
        sourceContentType: "Article" as "Answer",
        sourceEditTime: 0,
        excerptFingerprint: "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText: "The claim text has sufficient length.",
        anchorText: "claim",
        volatility: "low",
        decisionRelevance: "low",
        candidateReason: "This is a reason that is long enough.",
        extractedAt: 1_000,
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_CONTENT_TYPE" });
  });

  // ── no-throw behaviour ────────────────────────────────────────────────────

  it("does not throw on any input", () => {
    const badInputs: Array<Record<string, unknown>> = [
      {
        questionId: "",
        answerId: "1",
        claimText: "The claim text has sufficient length.",
        anchorText: "claim",
      },
      {
        questionId: "1",
        answerId: "",
        claimText: "The claim text has sufficient length.",
        anchorText: "claim",
      },
      { questionId: "1", answerId: "1", sourceEditTime: -1, claimText: "text.", anchorText: "tx" },
      {
        questionId: "1",
        answerId: "1",
        excerptFingerprint: "bad",
        claimText: "text.",
        anchorText: "tx",
      },
      { questionId: "1", answerId: "1", claimText: "short", anchorText: "sh" },
      { questionId: "1", answerId: "1", claimText: "x".repeat(221), anchorText: "x" },
      {
        questionId: "1",
        answerId: "1",
        claimText: "The claim text has sufficient length.",
        anchorText: "not in text",
      },
      { questionId: "1", answerId: "1", volatility: "extreme" as "high" },
      { questionId: "1", answerId: "1", decisionRelevance: "mandatory" as "high" },
      { questionId: "1", answerId: "1", extractedAt: -1 },
      {
        questionId: "bad",
        answerId: "bad",
        sourceEditTime: -1,
        sourceContentId: "bad",
        excerptFingerprint: "bad",
        excerpt: TEST_EXCERPT,
        claimText: "short",
        anchorText: "tx",
        volatility: "x" as "high",
        decisionRelevance: "x" as "high",
        candidateReason: "short",
        extractedAt: -1,
      },
    ];

    for (const raw of badInputs) {
      const result = createAnswerClaim({
        questionId: raw.questionId as string,
        answerId: raw.answerId as string,
        sourceContentId: (raw.sourceContentId as string) ?? "1",
        sourceContentType: "Answer",
        sourceEditTime: (raw.sourceEditTime as number) ?? 0,
        excerptFingerprint: (raw.excerptFingerprint as string) ?? "v1:0123456789abcdef",
        excerpt: TEST_EXCERPT,
        claimText:
          (raw.claimText as string) ?? "The claim text has sufficient length to pass validation.",
        anchorText: (raw.anchorText as string) ?? "claim",
        volatility: (raw.volatility as "high" | "medium" | "low") ?? "low",
        decisionRelevance: (raw.decisionRelevance as "high" | "medium" | "low") ?? "low",
        candidateReason: (raw.candidateReason as string) ?? "This is a reason that is long enough.",
        extractedAt: (raw.extractedAt as number) ?? 1_000,
      });
      expect(result._tag).toBe("failure");
    }
  });
});
