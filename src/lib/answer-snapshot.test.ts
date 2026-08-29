import { describe, expect, it } from "vite-plus/test";

import type { AnswerSnapshot, AnswerSnapshotResult } from "./answer-snapshot";
import { parseZhihuAnswerUrl } from "./zhihu-answer-url";
import { createAnswerSnapshot } from "./answer-snapshot";

const expectSuccessSnapshot = (result: AnswerSnapshotResult): AnswerSnapshot => {
  if (result._tag === "failure") {
    throw new Error(`Unexpected failure: ${result.reason}`);
  }

  return result.snapshot;
};

describe("createAnswerSnapshot", () => {
  // ── success ──────────────────────────────────────────────────────────────

  it("creates a frozen snapshot with correct fields", () => {
    const result = createAnswerSnapshot({
      questionId: "42",
      answerId: "100",
      capturedAt: 1_700_000_000,
      body: "hello world",
    });

    const snap = expectSuccessSnapshot(result);
    expect(snap.questionId).toBe("42");
    expect(snap.answerId).toBe("100");
    expect(snap.capturedAt).toBe(1_700_000_000);
    expect(snap.body).toBe("hello world");
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it("generates deterministic fingerprint covering questionId, answerId, and body", () => {
    const a = createAnswerSnapshot({
      questionId: "1",
      answerId: "2",
      capturedAt: 0,
      body: "abc",
    });
    const b = createAnswerSnapshot({
      questionId: "1",
      answerId: "2",
      capturedAt: 0,
      body: "abc",
    });

    const aSnapshot = expectSuccessSnapshot(a);
    const bSnapshot = expectSuccessSnapshot(b);
    expect(aSnapshot.fingerprint).toBe(bSnapshot.fingerprint);
    expect(aSnapshot.fingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
  });

  it("same content with different capturedAt produces identical fingerprint", () => {
    const first = createAnswerSnapshot({
      questionId: "99",
      answerId: "88",
      capturedAt: 1000,
      body: "same body",
    });
    const second = createAnswerSnapshot({
      questionId: "99",
      answerId: "88",
      capturedAt: 999_999,
      body: "same body",
    });

    const firstSnapshot = expectSuccessSnapshot(first);
    const secondSnapshot = expectSuccessSnapshot(second);
    expect(firstSnapshot.fingerprint).toBe(secondSnapshot.fingerprint);
  });

  it("changed body produces different fingerprint", () => {
    const a = createAnswerSnapshot({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      body: "version A",
    });
    const b = createAnswerSnapshot({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      body: "version B",
    });

    const aSnapshot = expectSuccessSnapshot(a);
    const bSnapshot = expectSuccessSnapshot(b);
    expect(aSnapshot.fingerprint).not.toBe(bSnapshot.fingerprint);
  });

  it("freezes the snapshot", () => {
    const result = createAnswerSnapshot({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      body: "frozen",
    });

    const snapshot = expectSuccessSnapshot(result);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  // ── normalisation ────────────────────────────────────────────────────────

  it("normalises CRLF to LF", () => {
    const result = createAnswerSnapshot({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      body: "line1\r\nline2",
    });

    const snapshot = expectSuccessSnapshot(result);
    expect(snapshot.body).toBe("line1\nline2");
  });

  it("normalises bare CR to LF", () => {
    const result = createAnswerSnapshot({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      body: "old\rstyle",
    });

    const snapshot = expectSuccessSnapshot(result);
    expect(snapshot.body).toBe("old\nstyle");
  });

  it("trims leading and trailing whitespace", () => {
    const result = createAnswerSnapshot({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      body: "  content  ",
    });

    const snapshot = expectSuccessSnapshot(result);
    expect(snapshot.body).toBe("content");
  });

  it("applies Unicode NFC normalisation", () => {
    // U+212B (angstrom sign) and U+0041 U+030A (A + combining ring)
    // NFC-collapses to the same character
    const decomposed = "Å"; // A + combining ring above
    const precomposed = "Å"; // angstrom sign

    const decomposedResult = createAnswerSnapshot({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      body: decomposed,
    });
    const precomposedResult = createAnswerSnapshot({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      body: precomposed,
    });

    const decomposedSnapshot = expectSuccessSnapshot(decomposedResult);
    const precomposedSnapshot = expectSuccessSnapshot(precomposedResult);
    expect(decomposedSnapshot.body).toBe(precomposedSnapshot.body);
  });

  // ── failure reasons ─────────────────────────────────────────────────────

  it("rejects empty questionId", () => {
    const result = createAnswerSnapshot({
      questionId: "",
      answerId: "1",
      capturedAt: 0,
      body: "ok",
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_QUESTION_ID" });
  });

  it("rejects non-numeric questionId", () => {
    const result = createAnswerSnapshot({
      questionId: "abc",
      answerId: "1",
      capturedAt: 0,
      body: "ok",
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_QUESTION_ID" });
  });

  it("rejects empty answerId", () => {
    const result = createAnswerSnapshot({
      questionId: "1",
      answerId: "",
      capturedAt: 0,
      body: "ok",
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_ID" });
  });

  it("rejects non-numeric answerId", () => {
    const result = createAnswerSnapshot({
      questionId: "1",
      answerId: "xyz",
      capturedAt: 0,
      body: "ok",
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_ID" });
  });

  it("rejects non-safe-integer capturedAt", () => {
    const result = createAnswerSnapshot({
      questionId: "1",
      answerId: "1",
      capturedAt: 1.5,
      body: "ok",
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects negative capturedAt", () => {
    const result = createAnswerSnapshot({
      questionId: "1",
      answerId: "1",
      capturedAt: -1,
      body: "ok",
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects a body that is whitespace-only after normalisation", () => {
    const result = createAnswerSnapshot({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      body: "   \t\n  ",
    });

    expect(result).toEqual({ _tag: "failure", reason: "EMPTY_BODY" });
  });

  it("rejects an empty string body", () => {
    const result = createAnswerSnapshot({
      questionId: "1",
      answerId: "1",
      capturedAt: 0,
      body: "",
    });

    expect(result).toEqual({ _tag: "failure", reason: "EMPTY_BODY" });
  });

  // ── composition with parseZhihuAnswerUrl ─────────────────────────────────

  it("composes with parseZhihuAnswerUrl success output", () => {
    const urlResult = parseZhihuAnswerUrl("https://www.zhihu.com/question/42/answer/100");

    if (urlResult._tag !== "success") {
      throw new Error("Expected URL parsing to succeed");
    }

    const snapResult = createAnswerSnapshot({
      questionId: urlResult.questionId,
      answerId: urlResult.answerId,
      capturedAt: 1_700_000_000,
      body: "captured body text",
    });

    const snapshot = expectSuccessSnapshot(snapResult);
    expect(snapshot.questionId).toBe("42");
    expect(snapshot.answerId).toBe("100");
    expect(snapshot.capturedAt).toBe(1_700_000_000);
    expect(snapshot.body).toBe("captured body text");
  });
});
