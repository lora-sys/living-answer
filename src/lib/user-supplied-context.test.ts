import { describe, expect, it } from "vite-plus/test";

import type { UserSuppliedContext, UserSuppliedContextResult } from "./user-supplied-context";
import { createUserSuppliedContext } from "./user-supplied-context";

const expectContext = (result: UserSuppliedContextResult): UserSuppliedContext => {
  if (result._tag === "failure") {
    throw new Error(`Unexpected failure: ${result.reason}`);
  }
  return result.context;
};

describe("createUserSuppliedContext", () => {
  // ── success ──────────────────────────────────────────────────────────────

  it("creates a frozen context record with all fields", () => {
    const result = createUserSuppliedContext({
      questionId: "42",
      answerId: "100",
      contextText: "the answer needs updating",
      capturedAt: 1_700_000_000,
    });

    const ctx = expectContext(result);
    expect(ctx.questionId).toBe("42");
    expect(ctx.answerId).toBe("100");
    expect(ctx.contextText).toBe("the answer needs updating");
    expect(ctx.capturedAt).toBe(1_700_000_000);
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  it("generates a deterministic fingerprint matching v1:16hex pattern", () => {
    const a = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "some text",
      capturedAt: 0,
    });
    const b = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "some text",
      capturedAt: 0,
    });

    const aCtx = expectContext(a);
    const bCtx = expectContext(b);
    expect(aCtx.fingerprint).toBe(bCtx.fingerprint);
    expect(aCtx.fingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
  });

  it("frozen context is deeply immutable", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "text",
      capturedAt: 0,
    });

    const ctx = expectContext(result);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.isFrozen(ctx.fingerprint)).toBe(true);
  });

  // ── fingerprint: capturedAt is excluded ──────────────────────────────────

  it("same fields with different capturedAt produce identical fingerprint", () => {
    const first = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "same text",
      capturedAt: 1000,
    });
    const second = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "same text",
      capturedAt: 9_999_999_999,
    });

    const fCtx = expectContext(first);
    const sCtx = expectContext(second);
    expect(fCtx.fingerprint).toBe(sCtx.fingerprint);
  });

  it("changed contextText produces different fingerprint", () => {
    const a = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "version A",
      capturedAt: 0,
    });
    const b = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "version B",
      capturedAt: 0,
    });

    const aCtx = expectContext(a);
    const bCtx = expectContext(b);
    expect(aCtx.fingerprint).not.toBe(bCtx.fingerprint);
  });

  it("different answerId produces different fingerprint", () => {
    const a = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "same text",
      capturedAt: 0,
    });
    const b = createUserSuppliedContext({
      questionId: "1",
      answerId: "2",
      contextText: "same text",
      capturedAt: 0,
    });

    const aCtx = expectContext(a);
    const bCtx = expectContext(b);
    expect(aCtx.fingerprint).not.toBe(bCtx.fingerprint);
  });

  it("different questionId produces different fingerprint", () => {
    const a = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "same text",
      capturedAt: 0,
    });
    const b = createUserSuppliedContext({
      questionId: "2",
      answerId: "1",
      contextText: "same text",
      capturedAt: 0,
    });

    const aCtx = expectContext(a);
    const bCtx = expectContext(b);
    expect(aCtx.fingerprint).not.toBe(bCtx.fingerprint);
  });

  // ── normalisation: contextText ────────────────────────────────────────────

  it("normalises CRLF to LF", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "line1\r\nline2",
      capturedAt: 0,
    });

    const ctx = expectContext(result);
    expect(ctx.contextText).toBe("line1\nline2");
  });

  it("normalises bare CR to LF", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "old\rstyle",
      capturedAt: 0,
    });

    const ctx = expectContext(result);
    expect(ctx.contextText).toBe("old\nstyle");
  });

  it("trims leading and trailing whitespace", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "  content  ",
      capturedAt: 0,
    });

    const ctx = expectContext(result);
    expect(ctx.contextText).toBe("content");
  });

  it("applies Unicode NFC normalisation", () => {
    // U+212B (angstrom sign) NFC-normalises to U+00C5
    const input = "temperature is 50Å";
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: input,
      capturedAt: 0,
    });

    const ctx = expectContext(result);
    expect(ctx.contextText).toBe("temperature is 50Å");
  });

  it("rejects contextText that is whitespace-only after normalisation", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "   \r\n\t  ",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CONTEXT_TEXT" });
  });

  it("rejects empty contextText", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CONTEXT_TEXT" });
  });

  // ── capturedAt validation ─────────────────────────────────────────────────

  it("rejects a non-safe-integer capturedAt", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "text",
      capturedAt: 1.5,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects a negative capturedAt", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "text",
      capturedAt: -1,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("accepts capturedAt of 0", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "text",
      capturedAt: 0,
    });

    expect(result._tag).toBe("success");
  });

  it("rejects non-finite capturedAt (NaN)", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "text",
      capturedAt: NaN,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects non-finite capturedAt (Infinity)", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "text",
      capturedAt: Infinity,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects Number.MAX_SAFE_INTEGER + 1 capturedAt", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "1",
      contextText: "text",
      capturedAt: Number.MAX_SAFE_INTEGER + 1,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  // ── questionId / answerId validation ──────────────────────────────────────

  it("rejects non-numeric questionId", () => {
    const result = createUserSuppliedContext({
      questionId: "abc",
      answerId: "1",
      contextText: "text",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_QUESTION_ID" });
  });

  it("rejects empty questionId", () => {
    const result = createUserSuppliedContext({
      questionId: "",
      answerId: "1",
      contextText: "text",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_QUESTION_ID" });
  });

  it("rejects non-numeric answerId", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "xyz",
      contextText: "text",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_ID" });
  });

  it("rejects empty answerId", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "",
      contextText: "text",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_ID" });
  });

  // ── validation order ──────────────────────────────────────────────────────

  it("returns INVALID_CAPTURED_AT before INVALID_QUESTION_ID", () => {
    const result = createUserSuppliedContext({
      questionId: "",
      answerId: "1",
      contextText: "text",
      capturedAt: -1,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("returns INVALID_QUESTION_ID before INVALID_ANSWER_ID when both are empty", () => {
    const result = createUserSuppliedContext({
      questionId: "",
      answerId: "",
      contextText: "text",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_QUESTION_ID" });
  });

  it("returns INVALID_ANSWER_ID before INVALID_CONTEXT_TEXT when answerId is empty", () => {
    const result = createUserSuppliedContext({
      questionId: "1",
      answerId: "",
      contextText: "",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_ID" });
  });

  // ── composed fingerprint stability ────────────────────────────────────────

  it("fingerprint is stable across multiple calls with identical inputs", () => {
    const inputs = {
      questionId: "42",
      answerId: "100",
      contextText: "stable context text",
      capturedAt: 1_700_000_000,
    };

    const runs = [1, 2, 3, 4, 5].map(() => expectContext(createUserSuppliedContext(inputs)));
    const fingerprints = runs.map((c) => c.fingerprint);
    expect(new Set(fingerprints).size).toBe(1);
  });

  // ── no-throw behaviour ─────────────────────────────────────────────────────

  it("does not throw on any input", () => {
    const badInputs: Array<{ qId?: string; aId?: string; text?: string; ts?: number }> = [
      {},
      { qId: "" },
      { aId: "" },
      { text: "" },
      { text: "   " },
      { ts: -1 },
      { ts: NaN },
      { qId: "ok", aId: "ok", text: "ok", ts: -1 },
    ];

    for (const raw of badInputs) {
      const result = createUserSuppliedContext({
        questionId: raw.qId ?? "",
        answerId: raw.aId ?? "",
        contextText: raw.text ?? "",
        capturedAt: raw.ts ?? 0,
      });
      expect(result._tag).toBe("failure");
    }
  });
});
