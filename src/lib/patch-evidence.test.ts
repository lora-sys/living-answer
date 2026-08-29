import { describe, expect, it } from "vite-plus/test";

import type { PatchEvidence, PatchEvidenceResult } from "./patch-evidence";
import { createPatchEvidence } from "./patch-evidence";

const expectSuccess = (result: PatchEvidenceResult): PatchEvidence => {
  if (result._tag === "failure") {
    throw new Error(`Unexpected failure: ${result.reason}`);
  }
  return result.evidence;
};

describe("createPatchEvidence", () => {
  // ── success ──────────────────────────────────────────────────────────────

  it("creates a frozen evidence record with all fields", () => {
    const result = createPatchEvidence({
      sourceLabel: "zhihu",
      sourceUrl: "https://www.zhihu.com/question/42/answer/100",
      quote: "the answer is 42",
      capturedAt: 1_700_000_000,
    });

    const ev = expectSuccess(result);
    expect(ev.sourceLabel).toBe("zhihu");
    expect(ev.sourceUrl).toBe("https://www.zhihu.com/question/42/answer/100");
    expect(ev.quote).toBe("the answer is 42");
    expect(ev.capturedAt).toBe(1_700_000_000);
    expect(Object.isFrozen(ev)).toBe(true);
  });

  it("generates a deterministic fingerprint matching v1:16hex pattern", () => {
    const a = createPatchEvidence({
      sourceLabel: "src",
      quote: "text",
      capturedAt: 0,
    });
    const b = createPatchEvidence({
      sourceLabel: "src",
      quote: "text",
      capturedAt: 0,
    });

    const aEv = expectSuccess(a);
    const bEv = expectSuccess(b);
    expect(aEv.fingerprint).toBe(bEv.fingerprint);
    expect(aEv.fingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
  });

  it("frozen evidence is deeply immutable", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      quote: "q",
      capturedAt: 0,
    });

    const ev = expectSuccess(result);
    expect(Object.isFrozen(ev)).toBe(true);
    expect(Object.isFrozen(ev.fingerprint)).toBe(true);
  });

  // ── sourceUrl presence affects fingerprint ────────────────────────────────

  it("fingerprint changes when sourceUrl is added", () => {
    const without = createPatchEvidence({
      sourceLabel: "s",
      quote: "q",
      capturedAt: 0,
    });
    const withUrl = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "https://example.com",
      quote: "q",
      capturedAt: 0,
    });

    const wEv = expectSuccess(without);
    const wuEv = expectSuccess(withUrl);
    expect(wEv.fingerprint).not.toBe(wuEv.fingerprint);
  });

  it("fingerprint changes when sourceUrl value changes", () => {
    const a = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "https://a.com",
      quote: "q",
      capturedAt: 0,
    });
    const b = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "https://b.com",
      quote: "q",
      capturedAt: 0,
    });

    const aEv = expectSuccess(a);
    const bEv = expectSuccess(b);
    expect(aEv.fingerprint).not.toBe(bEv.fingerprint);
  });

  // ── capturedAt excluded from fingerprint ──────────────────────────────────

  it("same fields with different capturedAt produce identical fingerprint", () => {
    const first = createPatchEvidence({
      sourceLabel: "src",
      quote: "same quote here",
      capturedAt: 1000,
    });
    const second = createPatchEvidence({
      sourceLabel: "src",
      quote: "same quote here",
      capturedAt: 9_999_999_999,
    });

    const fEv = expectSuccess(first);
    const sEv = expectSuccess(second);
    expect(fEv.fingerprint).toBe(sEv.fingerprint);
  });

  it("changed quote produces different fingerprint", () => {
    const a = createPatchEvidence({
      sourceLabel: "s",
      quote: "version A",
      capturedAt: 0,
    });
    const b = createPatchEvidence({
      sourceLabel: "s",
      quote: "version B",
      capturedAt: 0,
    });

    const aEv = expectSuccess(a);
    const bEv = expectSuccess(b);
    expect(aEv.fingerprint).not.toBe(bEv.fingerprint);
  });

  // ── sourceUrl absence vs empty string ─────────────────────────────────────

  it("undefined sourceUrl and empty-string sourceUrl produce the same evidence", () => {
    const undefinedResult = createPatchEvidence({
      sourceLabel: "s",
      quote: "q",
      capturedAt: 0,
    });
    const emptyResult = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "",
      quote: "q",
      capturedAt: 0,
    });

    const undefEv = expectSuccess(undefinedResult);
    const emptyEv = expectSuccess(emptyResult);
    expect(undefEv.sourceUrl).toBeUndefined();
    expect(emptyEv.sourceUrl).toBeUndefined();
    expect(undefEv.fingerprint).toBe(emptyEv.fingerprint);
  });

  // ── normalisation: sourceLabel ────────────────────────────────────────────

  it("normalises sourceLabel: NFC, CRLF/CR→LF, trim", () => {
    const result = createPatchEvidence({
      sourceLabel: "  zhihuÅ\r\n",
      quote: "q",
      capturedAt: 0,
    });

    const ev = expectSuccess(result);
    // U+212B (angstrom) NFC-normalises to U+00C5
    expect(ev.sourceLabel).toBe("zhihuÅ");
  });

  it("rejects sourceLabel that is whitespace-only after normalisation", () => {
    const result = createPatchEvidence({
      sourceLabel: "   \r\n\t  ",
      quote: "q",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_LABEL" });
  });

  it("rejects empty sourceLabel", () => {
    const result = createPatchEvidence({
      sourceLabel: "",
      quote: "q",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_LABEL" });
  });

  // ── normalisation: quote ──────────────────────────────────────────────────

  it("normalises quote: NFC, CRLF/CR→LF, trim", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      quote: "  hello\r\nworld\r",
      capturedAt: 0,
    });

    const ev = expectSuccess(result);
    expect(ev.quote).toBe("hello\nworld");
  });

  it("rejects quote that is whitespace-only after normalisation", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      quote: "  \t\n  ",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_QUOTE" });
  });

  it("rejects empty quote", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      quote: "",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_QUOTE" });
  });

  // ── sourceUrl validation ──────────────────────────────────────────────────

  it("accepts a valid https URL", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "https://zhihu.com/question/1/answer/2",
      quote: "q",
      capturedAt: 0,
    });

    const ev = expectSuccess(result);
    expect(ev.sourceUrl).toBe("https://zhihu.com/question/1/answer/2");
  });

  it("accepts a valid http URL", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "http://example.com/a",
      quote: "q",
      capturedAt: 0,
    });

    const ev = expectSuccess(result);
    expect(ev.sourceUrl).toBe("http://example.com/a");
  });

  it("rejects a non-http/https sourceUrl", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "ftp://example.com/file",
      quote: "q",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_URL" });
  });

  it("rejects a sourceUrl without explicit http(s):// host separator", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "https:///path",
      quote: "q",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_URL" });
  });

  it("rejects https:/example.com (missing slash in scheme separator)", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "https:/example.com",
      quote: "q",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_URL" });
  });

  it("rejects https:example.com (missing scheme separator)", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "https:example.com",
      quote: "q",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_URL" });
  });

  it("rejects a completely malformed sourceUrl", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "://not-a-url",
      quote: "q",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_URL" });
  });

  it("trims whitespace from sourceUrl but rejects whitespace-only as undefined", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "   ",
      quote: "q",
      capturedAt: 0,
    });

    // whitespace-only trimmed to empty → treated as absent
    const ev = expectSuccess(result);
    expect(ev.sourceUrl).toBeUndefined();
  });

  it("adds trailing slash when sourceUrl has no path (URL constructor normalisation)", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "https://zhihu.com",
      quote: "q",
      capturedAt: 0,
    });

    const ev = expectSuccess(result);
    expect(ev.sourceUrl).toBe("https://zhihu.com/");
  });

  // ── capturedAt validation ─────────────────────────────────────────────────

  it("rejects a non-safe-integer capturedAt", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      quote: "q",
      capturedAt: 1.5,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects a negative capturedAt", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      quote: "q",
      capturedAt: -1,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("accepts capturedAt of 0", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      quote: "q",
      capturedAt: 0,
    });

    expect(result._tag).toBe("success");
  });

  it("rejects non-finite capturedAt (NaN)", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      quote: "q",
      capturedAt: NaN,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects non-finite capturedAt (Infinity)", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      quote: "q",
      capturedAt: Infinity,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects Number.MAX_SAFE_INTEGER + 1 (outside safe integer range)", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      quote: "q",
      capturedAt: Number.MAX_SAFE_INTEGER + 1,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  // ── Unicode NFC normalisation ─────────────────────────────────────────────

  it("NFC-collapses composed and decomposed characters in sourceLabel", () => {
    const decomposed = "café"; // é as e + combining acute (NFD)
    const precomposed = "café"; // é as single code point (NFC)

    const aResult = createPatchEvidence({
      sourceLabel: decomposed,
      quote: "q",
      capturedAt: 0,
    });
    const bResult = createPatchEvidence({
      sourceLabel: precomposed,
      quote: "q",
      capturedAt: 0,
    });

    const aEv = expectSuccess(aResult);
    const bEv = expectSuccess(bResult);
    expect(aEv.sourceLabel).toBe(bEv.sourceLabel);
    expect(aEv.fingerprint).toBe(bEv.fingerprint);
  });

  it("NFC-collapses composed and decomposed characters in quote", () => {
    // U+212B (angstrom sign) vs U+0041 U+030A (A + combining ring)
    const decomposed = "Å";
    const precomposed = "Å";

    const aResult = createPatchEvidence({
      sourceLabel: "s",
      quote: decomposed,
      capturedAt: 0,
    });
    const bResult = createPatchEvidence({
      sourceLabel: "s",
      quote: precomposed,
      capturedAt: 0,
    });

    const aEv = expectSuccess(aResult);
    const bEv = expectSuccess(bResult);
    expect(aEv.quote).toBe(bEv.quote);
    expect(aEv.fingerprint).toBe(bEv.fingerprint);
  });

  // ── validation order ──────────────────────────────────────────────────────

  it("returns INVALID_CAPTURED_AT before INVALID_SOURCE_LABEL", () => {
    const result = createPatchEvidence({
      sourceLabel: "",
      quote: "q",
      capturedAt: -1,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("returns INVALID_SOURCE_LABEL before INVALID_QUOTE when sourceLabel is empty", () => {
    const result = createPatchEvidence({
      sourceLabel: "",
      quote: "",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_LABEL" });
  });

  it("returns INVALID_SOURCE_URL before INVALID_QUOTE when url is invalid", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "bad-url",
      quote: "",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_URL" });
  });

  // ── sourceUrl trimmed before validation ───────────────────────────────────

  it("accepts a sourceUrl with leading/trailing whitespace by trimming it", () => {
    const result = createPatchEvidence({
      sourceLabel: "s",
      sourceUrl: "  https://zhihu.com/q/1/a/2  ",
      quote: "q",
      capturedAt: 0,
    });

    const ev = expectSuccess(result);
    expect(ev.sourceUrl).toBe("https://zhihu.com/q/1/a/2");
  });

  // ── composed fingerprint stability ────────────────────────────────────────

  it("fingerprint is stable across multiple calls with identical inputs", () => {
    const inputs = {
      sourceLabel: "zhihu",
      sourceUrl: "https://zhihu.com/question/1/answer/2",
      quote: "stable content",
      capturedAt: 1_700_000_000,
    };

    const runs = [1, 2, 3, 4, 5].map(() => expectSuccess(createPatchEvidence(inputs)));
    const fingerprints = runs.map((e) => e.fingerprint);
    expect(new Set(fingerprints).size).toBe(1);
  });

  it("fingerprint differs when any normalised field changes", () => {
    const base = expectSuccess(
      createPatchEvidence({
        sourceLabel: "src",
        quote: "content",
        capturedAt: 0,
      }),
    );

    const changedLabel = expectSuccess(
      createPatchEvidence({
        sourceLabel: "src2",
        quote: "content",
        capturedAt: 0,
      }),
    );

    const changedQuote = expectSuccess(
      createPatchEvidence({
        sourceLabel: "src",
        quote: "other",
        capturedAt: 0,
      }),
    );

    const addedUrl = expectSuccess(
      createPatchEvidence({
        sourceLabel: "src",
        sourceUrl: "https://x.com",
        quote: "content",
        capturedAt: 0,
      }),
    );

    expect(base.fingerprint).not.toBe(changedLabel.fingerprint);
    expect(base.fingerprint).not.toBe(changedQuote.fingerprint);
    expect(base.fingerprint).not.toBe(addedUrl.fingerprint);
  });

  it("does not throw on any input", () => {
    const badInputs: Array<{ label?: string; url?: string; quote?: string; ts?: number }> = [
      {},
      { label: "" },
      { quote: "" },
      { ts: -1 },
      { ts: NaN },
      { label: "ok", url: "bad" },
      { label: "ok", quote: "   " },
    ];

    for (const raw of badInputs) {
      const result = createPatchEvidence({
        sourceLabel: raw.label ?? "",
        sourceUrl: raw.url,
        quote: raw.quote ?? "",
        capturedAt: raw.ts ?? 0,
      });
      expect(result._tag).toBe("failure");
    }
  });
});
