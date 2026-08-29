import type { AnswerSnapshotResult, AnswerSnapshot } from "./answer-snapshot";
import type { PatchEvidenceResult, PatchEvidence } from "./patch-evidence";
import type { PatchRevisionResult, PatchRevision } from "./patch-revision";

import { describe, expect, it } from "vite-plus/test";

import { createPatchRevision } from "./patch-revision";
import { createAnswerSnapshot } from "./answer-snapshot";
import { createPatchEvidence } from "./patch-evidence";

const expectSnapshot = (result: AnswerSnapshotResult): AnswerSnapshot => {
  if (result._tag === "success") {
    return result.snapshot;
  }
  throw new Error(`Unexpected snapshot failure: ${result.reason}`);
};

const expectEvidence = (result: PatchEvidenceResult): PatchEvidence => {
  if (result._tag === "success") {
    return result.evidence;
  }
  throw new Error(`Unexpected evidence failure: ${result.reason}`);
};

const expectRevision = (result: PatchRevisionResult): PatchRevision => {
  if (result._tag === "success") {
    return result.revision;
  }
  throw new Error(`Unexpected revision failure: ${result.reason}`);
};

describe("createPatchRevision", () => {
  // ── success ──────────────────────────────────────────────────────────────

  it("creates a frozen revision with all fields", () => {
    const result = createPatchRevision({
      patchBody: "fix typo",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:feedfacecafebeef",
      capturedAt: 1_700_000_000,
    });

    const rev = expectRevision(result);
    expect(rev.patchBody).toBe("fix typo");
    expect(rev.answerSnapshotFingerprint).toBe("v1:0123456789abcdef");
    expect(rev.evidenceFingerprint).toBe("v1:feedfacecafebeef");
    expect(rev.capturedAt).toBe(1_700_000_000);
    expect(Object.isFrozen(rev)).toBe(true);
  });

  it("generates deterministic fingerprint matching v1:16hex pattern", () => {
    const a = createPatchRevision({
      patchBody: "body",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      evidenceFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });
    const b = createPatchRevision({
      patchBody: "body",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      evidenceFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });

    const aRev = expectRevision(a);
    const bRev = expectRevision(b);
    expect(aRev.fingerprint).toBe(bRev.fingerprint);
    expect(aRev.fingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
  });

  it("frozen revision is deeply immutable", () => {
    const result = createPatchRevision({
      patchBody: "p",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    const rev = expectRevision(result);
    expect(Object.isFrozen(rev)).toBe(true);
    expect(Object.isFrozen(rev.fingerprint)).toBe(true);
  });

  // ── fingerprint: capturedAt is included ──────────────────────────────────

  it("same fields with different capturedAt produce different fingerprint", () => {
    const first = createPatchRevision({
      patchBody: "update",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      evidenceFingerprint: "v1:eeeeffff00001111",
      capturedAt: 1000,
    });
    const second = createPatchRevision({
      patchBody: "update",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      evidenceFingerprint: "v1:eeeeffff00001111",
      capturedAt: 9_999_999_999,
    });

    const fRev = expectRevision(first);
    const sRev = expectRevision(second);
    expect(fRev.fingerprint).not.toBe(sRev.fingerprint);
  });

  it("changed patchBody produces different fingerprint", () => {
    const a = createPatchRevision({
      patchBody: "version A",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      evidenceFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });
    const b = createPatchRevision({
      patchBody: "version B",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      evidenceFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });

    const aRev = expectRevision(a);
    const bRev = expectRevision(b);
    expect(aRev.fingerprint).not.toBe(bRev.fingerprint);
  });

  it("changed answerSnapshotFingerprint produces different fingerprint", () => {
    const a = createPatchRevision({
      patchBody: "fix",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      evidenceFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });
    const b = createPatchRevision({
      patchBody: "fix",
      answerSnapshotFingerprint: "v1:1111111111111111",
      evidenceFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });

    const aRev = expectRevision(a);
    const bRev = expectRevision(b);
    expect(aRev.fingerprint).not.toBe(bRev.fingerprint);
  });

  it("changed evidenceFingerprint produces different fingerprint", () => {
    const a = createPatchRevision({
      patchBody: "fix",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      evidenceFingerprint: "v1:eeeeffff00001111",
      capturedAt: 0,
    });
    const b = createPatchRevision({
      patchBody: "fix",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      evidenceFingerprint: "v1:2222222222222222",
      capturedAt: 0,
    });

    const aRev = expectRevision(a);
    const bRev = expectRevision(b);
    expect(aRev.fingerprint).not.toBe(bRev.fingerprint);
  });

  // ── normalisation: patchBody ───────────────────────────────────────────────

  it("normalises CRLF to LF", () => {
    const result = createPatchRevision({
      patchBody: "line1\r\nline2",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    const rev = expectRevision(result);
    expect(rev.patchBody).toBe("line1\nline2");
  });

  it("normalises bare CR to LF", () => {
    const result = createPatchRevision({
      patchBody: "old\rstyle",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    const rev = expectRevision(result);
    expect(rev.patchBody).toBe("old\nstyle");
  });

  it("trims leading and trailing whitespace", () => {
    const result = createPatchRevision({
      patchBody: "  content  ",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    const rev = expectRevision(result);
    expect(rev.patchBody).toBe("content");
  });

  it("applies Unicode NFC normalisation", () => {
    // U+212B (angstrom sign) and U+0041 U+030A (A + combining ring)
    const decomposed = "Å";
    const precomposed = "Å";

    const aResult = createPatchRevision({
      patchBody: decomposed,
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });
    const bResult = createPatchRevision({
      patchBody: precomposed,
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    const aRev = expectRevision(aResult);
    const bRev = expectRevision(bResult);
    expect(aRev.patchBody).toBe(bRev.patchBody);
    expect(aRev.fingerprint).toBe(bRev.fingerprint);
  });

  // ── failure reasons ────────────────────────────────────────────────────────

  it("rejects non-safe-integer capturedAt", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: 1.5,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects negative capturedAt", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: -1,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects NaN capturedAt", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: NaN,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects Infinity capturedAt", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: Infinity,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects Number.MAX_SAFE_INTEGER + 1 capturedAt", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: Number.MAX_SAFE_INTEGER + 1,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects malformed answerSnapshotFingerprint (too short)", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "v1:abcd",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_SNAPSHOT_FINGERPRINT" });
  });

  it("rejects malformed answerSnapshotFingerprint (uppercase hex)", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "v1:ABCDEF0123456789",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_SNAPSHOT_FINGERPRINT" });
  });

  it("rejects answerSnapshotFingerprint without v1: prefix", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "v2:0123456789abcdef",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_SNAPSHOT_FINGERPRINT" });
  });

  it("rejects empty answerSnapshotFingerprint", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_SNAPSHOT_FINGERPRINT" });
  });

  it("rejects malformed evidenceFingerprint (too short)", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:1234",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_EVIDENCE_FINGERPRINT" });
  });

  it("rejects uppercase evidenceFingerprint", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:ABCDEF0123456789",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_EVIDENCE_FINGERPRINT" });
  });

  it("rejects empty evidenceFingerprint", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_EVIDENCE_FINGERPRINT" });
  });

  it("rejects a patchBody that is whitespace-only after normalisation", () => {
    const result = createPatchRevision({
      patchBody: "   \t\n  ",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "EMPTY_PATCH_BODY" });
  });

  it("rejects an empty string patchBody", () => {
    const result = createPatchRevision({
      patchBody: "",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "EMPTY_PATCH_BODY" });
  });

  // ── validation order ──────────────────────────────────────────────────────

  it("returns INVALID_CAPTURED_AT before INVALID_ANSWER_SNAPSHOT_FINGERPRINT", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "",
      evidenceFingerprint: "v1:0123456789abcdef",
      capturedAt: -1,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("returns INVALID_ANSWER_SNAPSHOT_FINGERPRINT before INVALID_EVIDENCE_FINGERPRINT", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "bad",
      evidenceFingerprint: "also-bad",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_ANSWER_SNAPSHOT_FINGERPRINT" });
  });

  it("returns INVALID_EVIDENCE_FINGERPRINT before EMPTY_PATCH_BODY", () => {
    const result = createPatchRevision({
      patchBody: "",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "bad",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_EVIDENCE_FINGERPRINT" });
  });

  // ── composed fingerprint stability ─────────────────────────────────────────

  it("fingerprint is stable across multiple calls with identical inputs", () => {
    const inputs = {
      patchBody: "stable revision body",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      evidenceFingerprint: "v1:eeeeffff00001111",
      capturedAt: 1_700_000_000,
    };

    const runs = [1, 2, 3, 4, 5].map(() => expectRevision(createPatchRevision(inputs)));
    const fingerprints = runs.map((r) => r.fingerprint);
    expect(new Set(fingerprints).size).toBe(1);
  });

  // ── no-throw behaviour ─────────────────────────────────────────────────────

  it("does not throw on any input", () => {
    const badInputs: Array<{
      body?: string;
      snapFp?: string;
      evFp?: string;
      ts?: number;
    }> = [
      {},
      { body: "" },
      { body: "   " },
      { snapFp: "" },
      { evFp: "" },
      { snapFp: "bad", evFp: "bad", body: "ok" },
      { ts: -1, body: "ok" },
      { ts: NaN, body: "ok" },
    ];

    for (const raw of badInputs) {
      const result = createPatchRevision({
        patchBody: raw.body ?? "",
        answerSnapshotFingerprint: raw.snapFp ?? "v1:0123456789abcdef",
        evidenceFingerprint: raw.evFp ?? "v1:0123456789abcdef",
        capturedAt: raw.ts ?? 0,
      });
      expect(result._tag).toBe("failure");
    }
  });

  // ── composition with AnswerSnapshot ────────────────────────────────────────

  it("composes successful createAnswerSnapshot fingerprint into PatchRevision", () => {
    const snap = expectSnapshot(
      createAnswerSnapshot({
        questionId: "42",
        answerId: "100",
        capturedAt: 1_700_000_000,
        body: "The answer is 42.",
      }),
    );

    const ev = expectEvidence(
      createPatchEvidence({
        sourceLabel: "zhihu",
        sourceUrl: "https://www.zhihu.com/question/42/answer/100",
        quote: "The answer is 42.",
        capturedAt: 1_700_000_000,
      }),
    );

    const revResult = createPatchRevision({
      patchBody: "correct the answer",
      answerSnapshotFingerprint: snap.fingerprint,
      evidenceFingerprint: ev.fingerprint,
      capturedAt: 1_700_000_500,
    });

    const rev = expectRevision(revResult);
    expect(rev.answerSnapshotFingerprint).toBe(snap.fingerprint);
    expect(rev.evidenceFingerprint).toBe(ev.fingerprint);
    expect(rev.patchBody).toBe("correct the answer");
    expect(rev.capturedAt).toBe(1_700_000_500);
  });

  // ── composition with PatchEvidence ─────────────────────────────────────────

  it("composes successful createPatchEvidence fingerprint into PatchRevision", () => {
    const ev1 = expectEvidence(
      createPatchEvidence({
        sourceLabel: "source-a",
        quote: "quote A",
        capturedAt: 500,
      }),
    );
    const ev2 = expectEvidence(
      createPatchEvidence({
        sourceLabel: "source-b",
        quote: "quote B",
        capturedAt: 600,
      }),
    );

    const revResult = createPatchRevision({
      patchBody: "apply patch",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      evidenceFingerprint: ev1.fingerprint,
      capturedAt: 1_000,
    });

    const rev = expectRevision(revResult);
    expect(rev.evidenceFingerprint).toBe(ev1.fingerprint);

    // second evidence should produce a different fingerprint
    const rev2Result = createPatchRevision({
      patchBody: "apply patch",
      answerSnapshotFingerprint: "v1:aaaabbbbccccdddd",
      evidenceFingerprint: ev2.fingerprint,
      capturedAt: 1_000,
    });

    const rev2 = expectRevision(rev2Result);
    expect(rev2.evidenceFingerprint).toBe(ev2.fingerprint);
    expect(rev.fingerprint).not.toBe(rev2.fingerprint);
  });

  // ── PatchEvidence fingerprint pattern rejection ────────────────────────────

  it("rejects evidenceFingerprint from a malformed (non-v1) output", () => {
    const result = createPatchRevision({
      patchBody: "ok",
      answerSnapshotFingerprint: "v1:0123456789abcdef",
      evidenceFingerprint: "v0:0123456789abcdef",
      capturedAt: 0,
    });

    expect(result).toEqual({ _tag: "failure", reason: "INVALID_EVIDENCE_FINGERPRINT" });
  });

  // ── AnswerSnapshot fingerprint pattern acceptance ──────────────────────────

  it("accepts a valid answerSnapshotFingerprint from createAnswerSnapshot", () => {
    const snap = expectSnapshot(
      createAnswerSnapshot({
        questionId: "1",
        answerId: "1",
        capturedAt: 0,
        body: "text",
      }),
    );

    const result = createPatchRevision({
      patchBody: "patch applied",
      answerSnapshotFingerprint: snap.fingerprint,
      evidenceFingerprint: "v1:0000000000000000",
      capturedAt: 0,
    });

    const rev = expectRevision(result);
    expect(rev.answerSnapshotFingerprint).toBe(snap.fingerprint);
  });
});
