/**
 * Structural tests for the product entry and featured learning threads.
 */

import { describe, expect, it } from "vite-plus/test";

import { FEATURED_THREADS } from "./featured-threads";
import { APP_NAME, PRODUCT_TAGLINE } from "./app-info";

// ═══════════════════════════════════════════════════════════════════════════════
// Hero copy (factual, no metrics)
// ═══════════════════════════════════════════════════════════════════════════════

describe("hero copy invariants", () => {
  it("APP_NAME is the brand name only, no metric attached", () => {
    expect(APP_NAME).toBe("Zhihu Threads");
    expect(APP_NAME).not.toMatch(/\d+/);
    expect(APP_NAME).not.toMatch(/%|k|万|亿/);
  });

  it("PRODUCT_TAGLINE describes the product without inventing numbers", () => {
    expect(PRODUCT_TAGLINE.length).toBeGreaterThan(20);
    expect(PRODUCT_TAGLINE).not.toMatch(/\d+/);
    expect(PRODUCT_TAGLINE).not.toMatch(/%|k|万|亿|用户[多达好评]/);
  });

  it("product tagline describes learning-thread value", () => {
    expect(PRODUCT_TAGLINE).toContain("AI");
    expect(PRODUCT_TAGLINE).toContain("真实知乎回答");
    expect(PRODUCT_TAGLINE).toContain("学习线程");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Featured threads ordering and identity
// ═══════════════════════════════════════════════════════════════════════════════

describe("featured learning threads", () => {
  it("has exactly three featured threads", () => {
    expect(FEATURED_THREADS).toHaveLength(3);
  });

  it("uses stable 16-character thread ids", () => {
    for (const thread of FEATURED_THREADS) {
      expect(thread.threadId).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it("each featured thread is a learning-thread summary with a timeline", () => {
    for (const thread of FEATURED_THREADS) {
      expect(thread.title.length).toBeGreaterThan(0);
      expect(thread.description.length).toBeGreaterThan(0);
      expect(thread.yearRange).toMatch(/^\d{4}—\d{4}$/);
      expect(thread.stageCount).toBeGreaterThan(0);
      expect(thread.nodeCount).toBeGreaterThan(0);
    }
  });
});
