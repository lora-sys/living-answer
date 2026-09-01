import type { AnswerExcerpt, AnswerExcerptResult } from "./answer-excerpt";
import { parseZhihuAnswerUrl } from "./zhihu-answer-url";
import { createAnswerExcerpt } from "./answer-excerpt";

import { describe, expect, it } from "vite-plus/test";

const SPIKE_01_CONTENT_ID = "-8765571236311781284"; // Spike 01 Call 5 observed ContentID, returned as a JSON string

const expectExcerpt = (result: AnswerExcerptResult): AnswerExcerpt => {
  if (result._tag === "success") {
    return result.excerpt;
  }
  throw new Error(`Unexpected excerpt failure: ${result.reason}`);
};

describe("createAnswerExcerpt", () => {
  // ── success ──────────────────────────────────────────────────────────────

  it("creates a frozen excerpt with all fields", () => {
    const result = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 1_700_000_000,
      sourceContentId: SPIKE_01_CONTENT_ID,
      sourceContentType: "Answer",
      sourceEditTime: 1_787_987_553,
      excerpt: "Summary-class content text",
    });

    const ex = expectExcerpt(result);
    expect(ex.questionId).toBe("42");
    expect(ex.answerId).toBe("100");
    expect(ex.capturedAt).toBe(1_700_000_000);
    expect(ex.sourceContentId).toBe(SPIKE_01_CONTENT_ID);
    expect(ex.sourceContentType).toBe("Answer");
    expect(ex.sourceEditTime).toBe(1_787_987_553);
    expect(ex.excerpt).toBe("Summary-class content text");
    expect(Object.isFrozen(ex)).toBe(true);
  });

  it("generates deterministic fingerprint matching v1:16hex pattern", () => {
    const a = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "text",
    });
    const b = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "text",
    });

    const aEx = expectExcerpt(a);
    const bEx = expectExcerpt(b);
    expect(aEx.fingerprint).toBe(bEx.fingerprint);
    expect(aEx.fingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
  });

  it("output is Object.freeze'd", () => {
    const result = createAnswerExcerpt({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "p",
    });

    const ex = expectExcerpt(result);
    expect(Object.isFrozen(ex)).toBe(true);
    expect(Object.isFrozen(ex.fingerprint)).toBe(true);
  });

  it("same input produces identical fingerprint (determinism)", () => {
    const inputs = {
      questionId: "42",
      answerId: "100",
      capturedAt: 1_700_000_000,
      sourceContentId: SPIKE_01_CONTENT_ID,
      sourceContentType: "Answer" as const,
      sourceEditTime: 1_787_987_553,
      excerpt: "Summary-class content text",
    };

    const runs = [1, 2, 3, 4, 5].map(() => expectExcerpt(createAnswerExcerpt(inputs)));
    const fingerprints = runs.map((r) => r.fingerprint);
    expect(new Set(fingerprints).size).toBe(1);
  });

  it("accepts negative sourceContentId (Spike 01 Call 5 fact)", () => {
    const result = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 0,
      sourceContentId: SPIKE_01_CONTENT_ID,
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "text",
    });

    const ex = expectExcerpt(result);
    expect(ex.sourceContentId).toBe(SPIKE_01_CONTENT_ID);
  });

  it("accepts large negative sourceContentId beyond Number.MAX_SAFE_INTEGER (Ticket 1R precision)", () => {
    const observed = "-8765571236311781284";

    const result = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 0,
      sourceContentId: observed,
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "text",
    });

    const ex = expectExcerpt(result);
    expect(ex.sourceContentId).toBe(observed);
  });

  it("rejects sourceContentId with leading zero", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "0123",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_CONTENT_ID" });
  });

  it("rejects sourceContentId with plus sign", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "+123",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_CONTENT_ID" });
  });

  it('rejects sourceContentId "-0" (double negative not allowed by canonical form)', () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "-0",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_CONTENT_ID" });
  });

  it("accepts sourceEditTime exceeding Int32 max (Spike 01 fact)", () => {
    const result = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 1_787_987_553,
      excerpt: "text",
    });

    const ex = expectExcerpt(result);
    expect(ex.sourceEditTime).toBe(1_787_987_553);
  });

  it("sourceContentType output is narrow literal 'Answer' (TypeScript)", () => {
    // This test verifies at compile time that the type narrows correctly.
    // At runtime the value is "Answer".
    const result = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "text",
    });

    const ex = expectExcerpt(result);
    expect(ex.sourceContentType).toBe("Answer");
  });

  // ── fingerprint: capturedAt is included ──────────────────────────────────

  it("same fields with different capturedAt produce different fingerprint", () => {
    const first = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 1000,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "text",
    });
    const second = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 9_999_999_999,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "text",
    });

    const fEx = expectExcerpt(first);
    const sEx = expectExcerpt(second);
    expect(fEx.fingerprint).not.toBe(sEx.fingerprint);
  });

  it("changed excerpt produces different fingerprint", () => {
    const a = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "version A",
    });
    const b = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "version B",
    });

    const aEx = expectExcerpt(a);
    const bEx = expectExcerpt(b);
    expect(aEx.fingerprint).not.toBe(bEx.fingerprint);
  });

  it("changed sourceEditTime produces different fingerprint", () => {
    const a = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 1000,
      excerpt: "text",
    });
    const b = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 2000,
      excerpt: "text",
    });

    const aEx = expectExcerpt(a);
    const bEx = expectExcerpt(b);
    expect(aEx.fingerprint).not.toBe(bEx.fingerprint);
  });

  it("strips Zhihu search <em> highlight markup", () => {
    const result = createAnswerExcerpt({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "some <em>highlighted</em> and more text",
    });

    const ex = expectExcerpt(result);
    expect(ex.excerpt).toBe("some highlighted and more text");
  });

  it("strips multiple <em> tags and leaves plain text", () => {
    const result = createAnswerExcerpt({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "<em>first</em> middle <em>second</em> end",
    });

    const ex = expectExcerpt(result);
    expect(ex.excerpt).toBe("first middle second end");
  });

  // ── normalisation: excerpt ────────────────────────────────────────────────

  it("normalises CRLF to LF", () => {
    const result = createAnswerExcerpt({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "line1\r\nline2",
    });

    const ex = expectExcerpt(result);
    expect(ex.excerpt).toBe("line1\nline2");
  });

  it("normalises bare CR to LF", () => {
    const result = createAnswerExcerpt({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "old\rstyle",
    });

    const ex = expectExcerpt(result);
    expect(ex.excerpt).toBe("old\nstyle");
  });

  it("trims leading and trailing whitespace", () => {
    const result = createAnswerExcerpt({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "  content  ",
    });

    const ex = expectExcerpt(result);
    expect(ex.excerpt).toBe("content");
  });

  it("applies Unicode NFC normalisation", () => {
    // U+212B (angstrom sign) and U+0041 U+030A (A + combining ring)
    const decomposed = "Å";
    const precomposed = "Å";

    const aResult = createAnswerExcerpt({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: decomposed,
    });
    const bResult = createAnswerExcerpt({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: precomposed,
    });

    const aEx = expectExcerpt(aResult);
    const bEx = expectExcerpt(bResult);
    expect(aEx.excerpt).toBe(bEx.excerpt);
    // Same normalised text → same fingerprint
    expect(aEx.fingerprint).toBe(bEx.fingerprint);
  });

  // ── failure reasons ────────────────────────────────────────────────────────

  it("rejects empty questionId", () => {
    const result = createAnswerExcerpt({
      questionId: "",
      answerId: "1",
      capturedAt: 0,
      sourceContentId: "1",
      sourceContentType: "Answer",
      sourceEditTime: 0,
      excerpt: "ok",
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_QUESTION_ID" });
  });

  it("rejects non-numeric questionId", () => {
    expect(
      createAnswerExcerpt({
        questionId: "12a",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_QUESTION_ID" });
  });

  it("rejects whitespace questionId", () => {
    expect(
      createAnswerExcerpt({
        questionId: " ",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_QUESTION_ID" });
  });

  it("rejects questionId with leading/trailing spaces", () => {
    expect(
      createAnswerExcerpt({
        questionId: " 42 ",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_QUESTION_ID" });
  });

  it("rejects empty answerId", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_ID" });
  });

  it("rejects non-numeric answerId", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "12a",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_ID" });
  });

  it("rejects whitespace answerId", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: " ",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_ID" });
  });

  it("rejects answerId with leading/trailing spaces", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: " 100 ",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_ID" });
  });

  it("rejects negative capturedAt", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: -1,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects NaN capturedAt", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: NaN,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects non-integer-float capturedAt", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 1.5,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects Infinity capturedAt", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: Infinity,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects Number.MAX_SAFE_INTEGER + 1 capturedAt", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: Number.MAX_SAFE_INTEGER + 1,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects non-string number sourceContentId (NaN)", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: NaN as unknown as string,
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_CONTENT_ID" });
  });

  it("rejects non-string number sourceContentId (1.5)", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: 1.5 as unknown as string,
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_CONTENT_ID" });
  });

  it("rejects non-string number sourceContentId (Infinity)", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: Infinity as unknown as string,
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_CONTENT_ID" });
  });

  it("rejects Article sourceContentType", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Article" as "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_CONTENT_TYPE" });
  });

  it("rejects lowercase 'answer' sourceContentType", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "answer" as "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_CONTENT_TYPE" });
  });

  it("rejects empty string sourceContentType", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "" as "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_CONTENT_TYPE" });
  });

  it("rejects unknown string sourceContentType", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Zvideo" as "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_CONTENT_TYPE" });
  });

  it("rejects negative sourceEditTime", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: -1,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_EDIT_TIME" });
  });

  it("rejects NaN sourceEditTime", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: NaN,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_EDIT_TIME" });
  });

  it("rejects non-safe-integer-float sourceEditTime", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 1.5,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_EDIT_TIME" });
  });

  it("rejects Infinity sourceEditTime", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: Infinity,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_EDIT_TIME" });
  });

  it("rejects whitespace-only excerpt after normalisation", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "   \t\n  ",
      }),
    ).toEqual({ _tag: "failure", reason: "EMPTY_EXCERPT" });
  });

  it("rejects empty string excerpt", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "",
      }),
    ).toEqual({ _tag: "failure", reason: "EMPTY_EXCERPT" });
  });

  it("rejects non-string excerpt", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: null as unknown as string,
      }),
    ).toEqual({ _tag: "failure", reason: "EMPTY_EXCERPT" });
  });

  // ── validation order ──────────────────────────────────────────────────────

  it("returns INVALID_CAPTURED_AT before INVALID_QUESTION_ID", () => {
    expect(
      createAnswerExcerpt({
        questionId: "",
        answerId: "1",
        capturedAt: -1,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("returns INVALID_QUESTION_ID before INVALID_ANSWER_ID", () => {
    expect(
      createAnswerExcerpt({
        questionId: "bad",
        answerId: "bad",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_QUESTION_ID" });
  });

  it("returns INVALID_ANSWER_ID before INVALID_SOURCE_CONTENT_ID", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "bad",
        capturedAt: 0,
        sourceContentId: NaN as unknown as string,
        sourceContentType: "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_ID" });
  });

  it("returns INVALID_SOURCE_CONTENT_ID before INVALID_SOURCE_CONTENT_TYPE", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: NaN as unknown as string,
        sourceContentType: "Article" as "Answer",
        sourceEditTime: 0,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_CONTENT_ID" });
  });

  it("returns INVALID_SOURCE_CONTENT_TYPE before INVALID_SOURCE_EDIT_TIME", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Article" as "Answer",
        sourceEditTime: -1,
        excerpt: "ok",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_CONTENT_TYPE" });
  });

  it("returns INVALID_SOURCE_EDIT_TIME before EMPTY_EXCERPT", () => {
    expect(
      createAnswerExcerpt({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        sourceContentId: "1",
        sourceContentType: "Answer",
        sourceEditTime: -1,
        excerpt: "",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_EDIT_TIME" });
  });

  // ── composition with parseZhihuAnswerUrl ─────────────────────────────────

  it("composes with parseZhihuAnswerUrl success output", () => {
    const urlResult = parseZhihuAnswerUrl("https://www.zhihu.com/question/42/answer/100");

    if (urlResult._tag !== "success") {
      throw new Error("Expected URL parsing to succeed");
    }

    const exResult = createAnswerExcerpt({
      questionId: urlResult.questionId,
      answerId: urlResult.answerId,
      capturedAt: 1_700_000_000,
      sourceContentId: SPIKE_01_CONTENT_ID,
      sourceContentType: "Answer",
      sourceEditTime: 1_787_987_553,
      excerpt: "captured excerpt text",
    });

    const ex = expectExcerpt(exResult);
    expect(ex.questionId).toBe("42");
    expect(ex.answerId).toBe("100");
    expect(ex.capturedAt).toBe(1_700_000_000);
    expect(ex.sourceContentId).toBe(SPIKE_01_CONTENT_ID);
    expect(ex.sourceContentType).toBe("Answer");
    expect(ex.sourceEditTime).toBe(1_787_987_553);
    expect(ex.excerpt).toBe("captured excerpt text");
  });

  // ── no-throw behaviour ─────────────────────────────────────────────────────

  it("does not throw on any input", () => {
    const badInputs: Array<{
      questionId?: string;
      answerId?: string;
      capturedAt?: number;
      sourceContentId?: unknown;
      sourceContentType?: "Answer";
      sourceEditTime?: number;
      excerpt?: unknown;
    }> = [
      { questionId: "", answerId: "1", excerpt: "ok" },
      { questionId: "1", answerId: "", excerpt: "ok" },
      { questionId: "1", answerId: "1", capturedAt: -1, excerpt: "ok" },
      { questionId: "1", answerId: "1", capturedAt: NaN, excerpt: "ok" },
      { questionId: "1", answerId: "1", sourceContentId: NaN, excerpt: "ok" },
      { questionId: "1", answerId: "1", sourceContentId: 1.5, excerpt: "ok" },
      {
        questionId: "1",
        answerId: "1",
        sourceContentId: Infinity as unknown as string,
        excerpt: "ok",
      },
      { questionId: "1", answerId: "1", sourceEditTime: -1, excerpt: "ok" },
      { questionId: "1", answerId: "1", sourceEditTime: NaN, excerpt: "ok" },
      { questionId: "1", answerId: "1", excerpt: "" },
      { questionId: "1", answerId: "1", excerpt: "   " as string },
      {
        questionId: "bad",
        answerId: "bad",
        capturedAt: -1,
        sourceContentId: NaN as unknown as string,
        sourceContentType: "Article" as "Answer",
        sourceEditTime: NaN,
        excerpt: null as unknown as string,
      },
    ];

    for (const raw of badInputs) {
      const result = createAnswerExcerpt({
        questionId: raw.questionId ?? "1",
        answerId: raw.answerId ?? "1",
        capturedAt: raw.capturedAt ?? 0,
        sourceContentId: (raw.sourceContentId as string) ?? "1",
        sourceContentType: "Answer",
        sourceEditTime: raw.sourceEditTime ?? 0,
        excerpt: (raw.excerpt as string) ?? "ok",
      });
      expect(result._tag).toBe("failure");
    }
  });
});
