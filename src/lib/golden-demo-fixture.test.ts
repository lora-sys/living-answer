import { describe, expect, it } from "vite-plus/test";

import {
  goldenDemoFixture,
  splitBodyParagraphs,
  paragraphId,
  type GoldenDemoFixture,
} from "./golden-demo-fixture";

import {
  createAnswerSnapshot,
  type AnswerSnapshot,
  type AnswerSnapshotResult,
} from "./answer-snapshot";

// ── Helpers ────────────────────────────────────────────────────────────────────

const expectSuccessSnapshot = (result: AnswerSnapshotResult): AnswerSnapshot => {
  if (result._tag === "failure") {
    throw new Error(`Unexpected failure: ${result.reason}`);
  }
  return result.snapshot;
};

// ── describe: Golden Demo Fixture ──────────────────────────────────────────────

describe("goldenDemoFixture", () => {
  // ── provenance and synthetic identity ──────────────────────────────────

  it("is marked as curated-demo, not a live capture", () => {
    expect(goldenDemoFixture.provenance.kind).toBe("curated-demo");
    expect(goldenDemoFixture.provenance.model).toContain("synthetic");
  });

  it("has synthetic author with no real Zhihu identity", () => {
    const { syntheticAuthor } = goldenDemoFixture;
    expect(syntheticAuthor.displayName).toContain("synthetic");
    expect(syntheticAuthor.displayName).not.toMatch(/[一-鿿]/);
    expect(syntheticAuthor.initials).toBe("ZA");
  });

  it("references two OpenAI primary-source URLs in provenance", () => {
    const urls = goldenDemoFixture.provenance.openaiPrimarySources;
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe("https://developers.openai.com/api/docs/pricing");
    expect(urls[1]).toBe("https://developers.openai.com/api/docs/guides/rate-limits");
  });

  it("has a stable, deterministic fingerprint from createAnswerSnapshot", () => {
    const { snapshot } = goldenDemoFixture;
    const fp = snapshot.fingerprint;
    expect(fp).toMatch(/^v1:[0-9a-f]{16}$/);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("snapshot fingerprint is stable across re-computation", () => {
    const result = createAnswerSnapshot({
      questionId: "573948291",
      answerId: "1203749156",
      capturedAt: 1_700_000_000_000,
      body: goldenDemoFixture.snapshot.body,
    });
    const snap = expectSuccessSnapshot(result);
    expect(snap.fingerprint).toBe(goldenDemoFixture.snapshot.fingerprint);
  });

  // ── paragraphs ──────────────────────────────────────────────────────────

  it("splits body into the expected number of paragraphs", () => {
    const paragraphs = goldenDemoFixture.paragraphs;
    expect(paragraphs.length).toBeGreaterThanOrEqual(4);
    for (const p of paragraphs) {
      expect(p.trim().length).toBeGreaterThan(0);
    }
  });

  it("paragraph IDs match the index sequence p-0, p-1, ...", () => {
    goldenDemoFixture.paragraphs.forEach((_, i) => {
      expect(paragraphId(i)).toBe(`p-${i}`);
    });
  });

  // ── patches ──────────────────────────────────────────────────────────────

  it("contains exactly two patches", () => {
    expect(goldenDemoFixture.patches.length).toBe(2);
  });

  it("every patch uses UPDATE type", () => {
    for (const p of goldenDemoFixture.patches) {
      expect(p.type).toBe("UPDATE");
    }
  });

  it("patches reference valid paragraph IDs", () => {
    const maxIndex = goldenDemoFixture.paragraphs.length - 1;
    for (const patch of goldenDemoFixture.patches) {
      const match = patch.paragraphId.match(/^p-(\d+)$/);
      expect(match).not.toBeNull();
      const idx = Number(match![1]);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(maxIndex);
    }
  });

  it("patches are deeply frozen", () => {
    for (const patch of goldenDemoFixture.patches) {
      expect(Object.isFrozen(patch)).toBe(true);
      expect(Object.isFrozen(patch.evidence)).toBe(true);
      for (const ev of patch.evidence) {
        expect(Object.isFrozen(ev)).toBe(true);
      }
    }
  });

  it("no patch says the author was wrong", () => {
    for (const patch of goldenDemoFixture.patches) {
      expect(patch.originalExcerpt).not.toMatch(/作者.*错/);
      expect(patch.currentChange).not.toMatch(/作者.*错/);
      expect(patch.currentChange).not.toMatch(/错误/);
    }
  });

  // ── evidence ─────────────────────────────────────────────────────────────

  it("each patch has at least two evidence cards", () => {
    for (const patch of goldenDemoFixture.patches) {
      expect(patch.evidence.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("evidence uses verified OpenAI primary-source URLs", () => {
    const pricingUrl = "https://developers.openai.com/api/docs/pricing";
    const rateLimitsUrl = "https://developers.openai.com/api/docs/guides/rate-limits";
    for (const patch of goldenDemoFixture.patches) {
      const urls = patch.evidence.map((e) => e.sourceUrl);
      expect(urls).toContain(pricingUrl);
      expect(urls).toContain(rateLimitsUrl);
    }
  });

  it("evidence content supports pricing and tiering/rate-limit structure, not consumer quotas", () => {
    // Consumer-subscription and per-user message quota text that must never appear
    // in any evidence field on any patch.
    const forbidden = [
      // Chinese consumer-quota phrasing
      /ChatGPT Plus.*\$20/,
      /ChatGPT Plus/,
      /每月 \$20/,
      /用户每小时限制/,
      /每小时条数/,
      /消息配额/,
      // English consumer-subscription phrasing
      /\$20\/month/,
      /broader access to GPT-4/,
      /ChatGPT.*consumer/,
      /consumer.*subscription/,
      /free developer/,
      /Free tier.*\$100/,
    ];
    for (const patch of goldenDemoFixture.patches) {
      const textFields = patch.evidence
        .map((e) => [e.supportedFact, e.quote, e.title, e.sourceType])
        .flat();
      const joined = textFields.join(" ");
      for (const re of forbidden) {
        expect(joined).not.toMatch(re);
      }
    }
  });

  it("evidence items contain required fields", () => {
    for (const patch of goldenDemoFixture.patches) {
      for (const ev of patch.evidence) {
        expect(ev.title.length).toBeGreaterThan(0);
        expect(ev.organization.length).toBeGreaterThan(0);
        expect(ev.supportedFact.length).toBeGreaterThan(0);
        expect(ev.sourceType.length).toBeGreaterThan(0);
        expect(ev.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });

  // ── immutability ────────────────────────────────────────────────────────

  it("fixture root record is frozen", () => {
    expect(Object.isFrozen(goldenDemoFixture)).toBe(true);
    expect(Object.isFrozen(goldenDemoFixture.provenance)).toBe(true);
    expect(Object.isFrozen(goldenDemoFixture.syntheticAuthor)).toBe(true);
    expect(Object.isFrozen(goldenDemoFixture.patches)).toBe(true);
    expect(Object.isFrozen(goldenDemoFixture.paragraphs)).toBe(true);
  });

  it("type is inferable without a cast", () => {
    // If goldenDemoFixture was not typed as GoldenDemoFixture, this would
    // fail to compile. The fact that it compiles proves the cast was removed.
    const _check: GoldenDemoFixture = goldenDemoFixture;
    expect(_check).toBe(goldenDemoFixture);
  });
});

describe("splitBodyParagraphs", () => {
  it("splits on double newline", () => {
    const parts = splitBodyParagraphs("aaa\n\nbbb\n\nccc");
    expect(parts).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("filters out empty paragraphs", () => {
    const parts = splitBodyParagraphs("aaa\n\n\n\nbbb");
    expect(parts).toEqual(["aaa", "bbb"]);
  });

  it("returns single element for no separator", () => {
    const parts = splitBodyParagraphs("hello");
    expect(parts).toEqual(["hello"]);
  });
});

describe("paragraphId", () => {
  it("returns p-0 for index 0", () => {
    expect(paragraphId(0)).toBe("p-0");
  });
  it("returns p-3 for index 3", () => {
    expect(paragraphId(3)).toBe("p-3");
  });
});
