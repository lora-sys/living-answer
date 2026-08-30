import { describe, expect, it } from "vite-plus/test";

import {
  buildFreshnessNotice,
  groupPatchesByParagraph,
  totalPatchCount,
  latestAsOf,
  formatDateYYYYMMDD,
  type ParagraphPatchGroup,
} from "./read-presentation";

import { goldenDemoFixture, type GoldenDemoFixture } from "./golden-demo-fixture";

// ── describe: read-presentation ────────────────────────────────────────────────

describe("read-presentation", () => {
  // ── formatDateYYYYMMDD ───────────────────────────────────────────────────

  describe("formatDateYYYYMMDD", () => {
    it("formats a known timestamp as 2023-12-15", () => {
      // 2023-12-15T00:00:00.000Z
      const result = formatDateYYYYMMDD(1_702_598_400_000);
      expect(result).toBe("2023-12-15");
    });

    it("formats another known timestamp", () => {
      // 2024-01-01T00:00:00.000Z
      const result = formatDateYYYYMMDD(1_704_096_000_000);
      expect(result).toBe("2024-01-01");
    });

    it("handles epoch 0", () => {
      const result = formatDateYYYYMMDD(0);
      expect(result).toBe("1970-01-01");
    });
  });

  // ── groupPatchesByParagraph ─────────────────────────────────────────────

  describe("groupPatchesByParagraph", () => {
    const result = groupPatchesByParagraph(goldenDemoFixture);

    it("returns entries only for paragraphs that have patches", () => {
      const patches = (
        goldenDemoFixture as unknown as { patches: readonly { paragraphId: string }[] }
      ).patches;
      for (const p of patches) {
        const found = result.some((g: ParagraphPatchGroup) => g.paragraphId === p.paragraphId);
        expect(found).toBe(true);
      }
    });

    it("returned groups have non-empty text and at least one patch", () => {
      for (const group of result) {
        expect(group.text.trim().length).toBeGreaterThan(0);
        expect(group.patches.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("patch count in groups equals total patch count", () => {
      const total = result.reduce((sum, g: ParagraphPatchGroup) => sum + g.patches.length, 0);
      expect(total).toBe(totalPatchCount(goldenDemoFixture));
    });

    it("paragraph indices remain in ascending fixture order", () => {
      const indices = result.map((g: ParagraphPatchGroup) => g.paragraphIndex);
      const sorted = [...indices].sort((left, right) => left - right);
      expect(indices).toEqual(sorted);
      expect(new Set(indices).size).toBe(indices.length);
    });
  });

  // ── buildFreshnessNotice ─────────────────────────────────────────────────

  describe("buildFreshnessNotice", () => {
    it("produces the expected sentence for N patches", () => {
      const notice = buildFreshnessNotice(2, 1_704_096_000_000);
      expect(notice).toBe("这篇回答有 2 个关键前提已经变化 · 截至 2024-01-01");
    });

    it("pluralises correctly for 1 patch", () => {
      const notice = buildFreshnessNotice(1, 1_700_000_000_000);
      expect(notice).toContain("这篇回答有 1 个关键前提已经变化");
      expect(notice).toContain("截至 ");
    });

    it("handles 0 patches gracefully", () => {
      const notice = buildFreshnessNotice(0, 1_700_000_000_000);
      expect(notice).toContain("0 个关键前提已经变化");
    });
  });

  // ── totalPatchCount ─────────────────────────────────────────────────────

  describe("totalPatchCount", () => {
    it("returns 2 for the golden demo fixture", () => {
      expect(totalPatchCount(goldenDemoFixture)).toBe(2);
    });

    it("returns 0 for an empty fixture", () => {
      const empty: GoldenDemoFixture = {
        id: "test-empty",
        displayTitle: "Test Empty",
        topic: "testing",
        description: "",
        provenance: {
          kind: "curated-demo",
          model: "test",
          capturedAt: 0,
          note: "",
          openaiPrimarySources: [],
        },
        snapshot: {
          questionId: "",
          answerId: "",
          capturedAt: 0,
          body: "",
          fingerprint: "v1:0000000000000000",
        },
        syntheticAuthor: { displayName: "", initials: "" },
        capturedAt: 0,
        patches: [],
        paragraphs: [],
      };
      expect(totalPatchCount(empty)).toBe(0);
    });
  });

  // ── latestAsOf ──────────────────────────────────────────────────────────

  describe("latestAsOf", () => {
    it("returns the most recent patch asOf timestamp", () => {
      const asOf = latestAsOf(goldenDemoFixture);
      const allAsOfs = goldenDemoFixture.patches.map((p) => p.asOf);
      expect(Math.max(...allAsOfs)).toBe(asOf);
    });

    it("falls back to provenance.capturedAt for empty patches", () => {
      const empty: GoldenDemoFixture = {
        id: "test-empty",
        displayTitle: "Test Empty",
        topic: "testing",
        description: "",
        provenance: {
          kind: "curated-demo",
          model: "",
          capturedAt: 9_999,
          note: "",
          openaiPrimarySources: [],
        },
        snapshot: {
          questionId: "",
          answerId: "",
          capturedAt: 0,
          body: "",
          fingerprint: "v1:0000000000000000",
        },
        syntheticAuthor: { displayName: "", initials: "" },
        capturedAt: 9_999,
        patches: [],
        paragraphs: [],
      };
      expect(latestAsOf(empty)).toBe(9_999);
    });
  });
});
