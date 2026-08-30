import { describe, expect, it } from "vite-plus/test";

import type { PatchProposal, PatchProposalResult } from "./patch-proposal";
import type { UserSuppliedContextResult } from "./user-supplied-context";
import { createPatchProposal } from "./patch-proposal";
import { createUserSuppliedContext } from "./user-supplied-context";

const expectProposal = (result: PatchProposalResult): PatchProposal => {
  if (result._tag === "failure") {
    throw new Error(`Unexpected failure: ${result.reason}`);
  }
  return result.proposal;
};

const expectContext = (
  result: UserSuppliedContextResult,
): import("./user-supplied-context").UserSuppliedContext => {
  if (result._tag === "failure") {
    throw new Error(`Unexpected failure: ${result.reason}`);
  }
  return result.context;
};

describe("createPatchProposal", () => {
  // ── success ──────────────────────────────────────────────────────────────

  it("creates a frozen proposal with all fields (no evidence)", () => {
    const result = createPatchProposal({
      proposedBody: "fix the outdated claim",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:feedfacecafebeef",
      capturedAt: 1_700_000_000,
    });

    const prop = expectProposal(result);
    expect(prop.proposedBody).toBe("fix the outdated claim");
    expect(prop.answerSnapshotFingerprint).toBe("v1:0123456789abcdef");
    expect(prop.contextFingerprint).toBe("v1:feedfacecafebeef");
    expect(prop.evidenceFingerprint).toBeUndefined();
    expect(prop.capturedAt).toBe(1_700_000_000);
    expect(Object.isFrozen(prop)).toBe(true);
  });

  it("creates a proposal with evidenceFingerprint when provided", () => {
    const result = createPatchProposal({
      proposedBody: "update the data",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:feedfacecafebeef",
      evidenceFingerprint: "v1:aabbccdd00112233",
      capturedAt: 1_700_000_000,
    });

    const prop = expectProposal(result);
    expect(prop.evidenceFingerprint).toBe("v1:aabbccdd00112233");
  });

  it("generates a deterministic fingerprint matching v1:16hex pattern", () => {
    const a = createPatchProposal({
      proposedBody: "body",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });
    const b = createPatchProposal({
      proposedBody: "body",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });

    const aProp = expectProposal(a);
    const bProp = expectProposal(b);
    expect(aProp.fingerprint).toBe(bProp.fingerprint);
    expect(aProp.fingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
  });

  it("frozen proposal is deeply immutable", () => {
    const result = createPatchProposal({
      proposedBody: "p",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    const prop = expectProposal(result);
    expect(Object.isFrozen(prop)).toBe(true);
    expect(Object.isFrozen(prop.fingerprint)).toBe(true);
  });

  // ── fingerprint: capturedAt is included ──────────────────────────────────

  it("same fields with different capturedAt produce different fingerprint", () => {
    const first = createPatchProposal({
      proposedBody: "update",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:eeeeffff00001111",
      capturedAt: 1000,
    });
    const second = createPatchProposal({
      proposedBody: "update",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:eeeeffff00001111",
      capturedAt: 9_999_999_999,
    });

    const fProp = expectProposal(first);
    const sProp = expectProposal(second);
    expect(fProp.fingerprint).not.toBe(sProp.fingerprint);
  });

  it("changed proposedBody produces different fingerprint", () => {
    const a = createPatchProposal({
      proposedBody: "version A",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });
    const b = createPatchProposal({
      proposedBody: "version B",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });

    const aProp = expectProposal(a);
    const bProp = expectProposal(b);
    expect(aProp.fingerprint).not.toBe(bProp.fingerprint);
  });

  it("changed answerSnapshotFingerprint produces different fingerprint", () => {
    const a = createPatchProposal({
      proposedBody: "fix",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });
    const b = createPatchProposal({
      proposedBody: "fix",
      answerSnapshotFingerprint: "v1:1111111111111111",
      contextFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });

    const aProp = expectProposal(a);
    const bProp = expectProposal(b);
    expect(aProp.fingerprint).not.toBe(bProp.fingerprint);
  });

  it("changed contextFingerprint produces different fingerprint", () => {
    const a = createPatchProposal({
      proposedBody: "fix",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });
    const b = createPatchProposal({
      proposedBody: "fix",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:2222222222222222",
      capturedAt: 0,
    });

    const aProp = expectProposal(a);
    const bProp = expectProposal(b);
    expect(aProp.fingerprint).not.toBe(bProp.fingerprint);
  });

  // ── evidenceFingerprint presence/absence ──────────────────────────────────

  it("same fields with and without evidenceFingerprint produce different fingerprint", () => {
    const without = createPatchProposal({
      proposedBody: "fix",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });
    const withEv = createPatchProposal({
      proposedBody: "fix",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:eeeeffff00001111",
      evidenceFingerprint: "v1:0011223344556677",
      capturedAt: 0,
    });

    const wProp = expectProposal(without);
    const weProp = expectProposal(withEv);
    expect(wProp.fingerprint).not.toBe(weProp.fingerprint);
  });

  it("treats undefined evidenceFingerprint as absent", () => {
    const result = createPatchProposal({
      proposedBody: "fix",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });

    const prop = expectProposal(result);
    expect(prop.evidenceFingerprint).toBeUndefined();
  });

  it("treats empty-string evidenceFingerprint as undefined", () => {
    const result = createPatchProposal({
      proposedBody: "fix",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:eeeeffff00001111",
      evidenceFingerprint: "",
      capturedAt: 0,
    });

    const prop = expectProposal(result);
    expect(prop.evidenceFingerprint).toBeUndefined();
  });

  it("trims whitespace from evidenceFingerprint", () => {
    const result = createPatchProposal({
      proposedBody: "fix",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:eeeeffff00001111",
      evidenceFingerprint: "  v1:0011223344556677  ",
      capturedAt: 0,
    });

    const prop = expectProposal(result);
    expect(prop.evidenceFingerprint).toBe("v1:0011223344556677");
  });

  // ── normalisation: proposedBody ──────────────────────────────────────────

  it("normalises CRLF to LF", () => {
    const result = createPatchProposal({
      proposedBody: "line1\r\nline2",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    const prop = expectProposal(result);
    expect(prop.proposedBody).toBe("line1\nline2");
  });

  it("normalises bare CR to LF", () => {
    const result = createPatchProposal({
      proposedBody: "old\rstyle",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    const prop = expectProposal(result);
    expect(prop.proposedBody).toBe("old\nstyle");
  });

  it("trims leading and trailing whitespace", () => {
    const result = createPatchProposal({
      proposedBody: "  content  ",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    const prop = expectProposal(result);
    expect(prop.proposedBody).toBe("content");
  });

  it("applies Unicode NFC normalisation", () => {
    // U+212B (angstrom sign) vs U+0041 U+030A (A + combining ring)
    const decomposed = "Å";
    const precomposed = "Å";

    const aResult = createPatchProposal({
      proposedBody: decomposed,
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });
    const bResult = createPatchProposal({
      proposedBody: precomposed,
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    const aProp = expectProposal(aResult);
    const bProp = expectProposal(bResult);
    expect(aProp.proposedBody).toBe(bProp.proposedBody);
    expect(aProp.fingerprint).toBe(bProp.fingerprint);
  });

  // ── failure reasons ────────────────────────────────────────────────────

  it("rejects non-safe-integer capturedAt", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: 1.5,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects negative capturedAt", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: -1,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects NaN capturedAt", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: NaN,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects Infinity capturedAt", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: Infinity,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects Number.MAX_SAFE_INTEGER + 1 capturedAt", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: Number.MAX_SAFE_INTEGER + 1,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects malformed answerSnapshotFingerprint (too short)", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "v1:abcd",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_SNAPSHOT_FINGERPRINT" });
  });

  it("rejects uppercase answerSnapshotFingerprint", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "v1:ABCDEF0123456789",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_SNAPSHOT_FINGERPRINT" });
  });

  it("rejects answerSnapshotFingerprint without v1: prefix", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "v2:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_SNAPSHOT_FINGERPRINT" });
  });

  it("rejects empty answerSnapshotFingerprint", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_SNAPSHOT_FINGERPRINT" });
  });

  it("rejects malformed contextFingerprint (too short)", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:1234",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CONTEXT_FINGERPRINT" });
  });

  it("rejects uppercase contextFingerprint", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:ABCDEF0123456789",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CONTEXT_FINGERPRINT" });
  });

  it("rejects empty contextFingerprint", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CONTEXT_FINGERPRINT" });
  });

  it("rejects malformed evidenceFingerprint (when provided)", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:bad",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_EVIDENCE_FINGERPRINT" });
  });

  it("rejects uppercase evidenceFingerprint (when provided)", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:ABCDEF0123456789",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_EVIDENCE_FINGERPRINT" });
  });

  it("rejects a proposedBody that is whitespace-only after normalisation", () => {
    const result = createPatchProposal({
      proposedBody: "   \t\n  ",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "EMPTY_PROPOSED_BODY" });
  });

  it("rejects an empty string proposedBody", () => {
    const result = createPatchProposal({
      proposedBody: "",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "EMPTY_PROPOSED_BODY" });
  });

  // ── validation order ──────────────────────────────────────────────────────

  it("returns INVALID_CAPTURED_AT before INVALID_ANSWER_SNAPSHOT_FINGERPRINT", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "",
      contextFingerprint: "v1:0123456789abcdef",
      capturedAt: -1,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("returns INVALID_ANSWER_SNAPSHOT_FINGERPRINT before INVALID_CONTEXT_FINGERPRINT", () => {
    const result = createPatchProposal({
      proposedBody: "ok",
      answerSnapshotFingerprint: "bad",
      contextFingerprint: "also-bad",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_SNAPSHOT_FINGERPRINT" });
  });

  it("returns INVALID_CONTEXT_FINGERPRINT before EMPTY_PROPOSED_BODY when contextFingerprint is malformed and body is empty", () => {
    const result = createPatchProposal({
      proposedBody: "",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      contextFingerprint: "bad",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CONTEXT_FINGERPRINT" });
  });

  // ── composed fingerprint stability ──────────────────────────────────────

  it("fingerprint is stable across multiple calls with identical inputs", () => {
    const inputs = {
      proposedBody: "stable proposal body",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      contextFingerprint: "v1:eeeeffff00001111",
      evidenceFingerprint: "v1:0011223344556677",
      capturedAt: 1_700_000_000,
    };

    const runs = [1, 2, 3, 4, 5].map(() => expectProposal(createPatchProposal(inputs)));
    const fingerprints = runs.map((p) => p.fingerprint);
    expect(new Set(fingerprints).size).toBe(1);
  });

  // ── no-throw behaviour ──────────────────────────────────────────────────

  it("does not throw on any input", () => {
    const badInputs: Array<{
      body?: string;
      snapFp?: string;
      ctxFp?: string;
      evFp?: string;
      ts?: number;
    }> = [
      {},
      { body: "" },
      { body: "   " },
      { snapFp: "" },
      { ctxFp: "" },
      { snapFp: "bad", ctxFp: "bad", body: "ok" },
      { evFp: "bad", body: "ok" },
      { ts: -1, body: "ok" },
      { ts: NaN, body: "ok" },
    ];

    for (const raw of badInputs) {
      const result = createPatchProposal({
        proposedBody: raw.body ?? "",
        answerSnapshotFingerprint: raw.snapFp ?? "v1:0123456789abcdef",
        contextFingerprint: raw.ctxFp ?? "v1:0123456789abcdef",
        evidenceFingerprint: raw.evFp,
        capturedAt: raw.ts ?? 0,
      });
      expect(result._tag).toBe("failure");
    }
  });

  // ── composition with UserSuppliedContext ──────────────────────────────────

  it("composes successful createUserSuppliedContext fingerprint into PatchProposal", () => {
    const ctx = expectContext(
      createUserSuppliedContext({
        questionId: "42",
        answerId: "100",
        contextText: "new data is available",
        capturedAt: 1_700_000_000,
      }),
    );

    const snapFp = "v1:eeeeffff00001111";

    const result = createPatchProposal({
      proposedBody: "update the answer with new data",
      answerSnapshotFingerprint: snapFp,
      contextFingerprint: ctx.fingerprint,
      evidenceFingerprint: "v1:1122334455667788",
      capturedAt: 1_700_000_500,
    });

    const prop = expectProposal(result);
    expect(prop.contextFingerprint).toBe(ctx.fingerprint);
    expect(prop.answerSnapshotFingerprint).toBe(snapFp);
    expect(prop.proposedBody).toBe("update the answer with new data");
    expect(prop.capturedAt).toBe(1_700_000_500);
  });
});
