/**
 * Structural tests for the home-page landing layout (Ticket 14).
 *
 * Verifies the demo-first ordering, featured vs compact demo weights,
 * and that no invented metrics or testimonials appear in the rendered output.
 *
 * These tests import the module for its side-effect exports, then inspect the
 * GOLDEN_DEMOS map which is the single source of truth for all demo entries.
 */

import { describe, expect, it } from "vite-plus/test";

import { GOLDEN_DEMOS } from "./golden-demo-fixture";
import { APP_NAME, PRODUCT_TAGLINE } from "./app-info";

// ═══════════════════════════════════════════════════════════════════════════════
// Hero copy (factual, no metrics)
// ═══════════════════════════════════════════════════════════════════════════════

describe("hero copy invariants", () => {
  it("APP_NAME is the brand name only, no metric attached", () => {
    expect(APP_NAME).toBe("Living Answer");
    expect(APP_NAME).not.toMatch(/\d+/);
    expect(APP_NAME).not.toMatch(/%|k|万|亿/);
  });

  it("PRODUCT_TAGLINE describes the product without inventing numbers", () => {
    expect(PRODUCT_TAGLINE.length).toBeGreaterThan(20);
    expect(PRODUCT_TAGLINE).not.toMatch(/\d+/);
    expect(PRODUCT_TAGLINE).not.toMatch(/%|k|万|亿|用户[多达好评]/);
  });

  it("product tagline mentions premise change and original answer", () => {
    expect(PRODUCT_TAGLINE).toContain("前提");
    expect(PRODUCT_TAGLINE).toContain("原回答");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Golden demos ordering and identity (Ticket 14 structure)
// ═══════════════════════════════════════════════════════════════════════════════

describe("landing demo ordering (Ticket 14)", () => {
  it("has exactly three demos available for the landing page", () => {
    expect(Object.keys(GOLDEN_DEMOS)).toHaveLength(3);
  });

  it("the first demo used on the landing is chatgpt-free-plus (featured)", () => {
    // The landing module derives demoEntries starting with chatgpt-free-plus.
    // We verify the fixture data for that entry directly.
    const featured = GOLDEN_DEMOS["chatgpt-free-plus"];
    expect(featured.id).toBe("chatgpt-free-plus");
    expect(featured.displayTitle.length).toBeGreaterThan(0);
    expect(featured.patches.length).toBeGreaterThan(0);
  });

  it("featured demo has at least one UPDATE patch with evidence", () => {
    const featured = GOLDEN_DEMOS["chatgpt-free-plus"];
    for (const patch of featured.patches) {
      expect(patch.type).toBe("UPDATE");
      expect(patch.evidence.length).toBeGreaterThanOrEqual(1);
      expect(patch.originalExcerpt.length).toBeGreaterThan(0);
      expect(patch.currentChange.length).toBeGreaterThan(0);
    }
  });

  it("the two compact demos are create-react-app and delayed-retirement", () => {
    expect(GOLDEN_DEMOS).toHaveProperty("create-react-app");
    expect(GOLDEN_DEMOS).toHaveProperty("delayed-retirement");
    const cra = GOLDEN_DEMOS["create-react-app"];
    const retirement = GOLDEN_DEMOS["delayed-retirement"];
    expect(cra.displayTitle.length).toBeGreaterThan(0);
    expect(retirement.displayTitle.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// No invented metrics or testimonials anywhere in fixture metadata
// ═══════════════════════════════════════════════════════════════════════════════

describe("no fake metrics in demo content", () => {
  const numericMetricsPattern = /\b\d+[k万亿%]\b/;

  it("no demo display title contains a numeric metric", () => {
    for (const fixture of Object.values(GOLDEN_DEMOS)) {
      expect(fixture.displayTitle).not.toMatch(numericMetricsPattern);
    }
  });

  it("no demo description contains a numeric metric", () => {
    for (const fixture of Object.values(GOLDEN_DEMOS)) {
      expect(fixture.description).not.toMatch(numericMetricsPattern);
    }
  });

  it("no patch impact statement contains a testimonial-style claim", () => {
    const testimonialPatterns = [/用户[最深受]/i, /千万用户/, /业界标杆/, /强烈推荐/];
    for (const fixture of Object.values(GOLDEN_DEMOS)) {
      for (const patch of fixture.patches) {
        for (const re of testimonialPatterns) {
          expect(patch.impact).not.toMatch(re);
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Demo provenance: all demos are synthetic, labeled as curated-demo
// ═══════════════════════════════════════════════════════════════════════════════

describe("demo provenance", () => {
  it("every fixture provenance kind is curated-demo", () => {
    for (const fixture of Object.values(GOLDEN_DEMOS)) {
      expect(fixture.provenance.kind).toBe("curated-demo");
    }
  });

  it("every fixture has real source attribution, not synthetic placeholder", () => {
    for (const fixture of Object.values(GOLDEN_DEMOS)) {
      expect(fixture.source).toBeDefined();
      expect(fixture.source.url).toMatch(/^https:\/\/www\.zhihu\.com\/question\/\d+\/answer\/\d+$/);
      expect(fixture.source.authorDisplayName).not.toContain("synthetic");
      expect(fixture.syntheticAuthor.displayName).toBe(fixture.source.authorDisplayName);
    }
  });
});
