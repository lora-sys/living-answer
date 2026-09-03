import { describe, expect, it } from "vite-plus/test";

import {
  buildQueryVariants,
  compactPhrase,
  extractTechnicalTerms,
  extractTermPhrase,
  MAX_QUERY_VARIANTS,
} from "./search-query-variants";

describe("extractTechnicalTerms", () => {
  it("keeps ASCII product names in order without duplicates", () => {
    expect(extractTechnicalTerms("如何理解 React Server Components（RSC）与 SSR 的差异")).toBe(
      "React Server Components RSC SSR",
    );
  });

  it("returns empty for pure Chinese wording", () => {
    expect(extractTechnicalTerms("缓存失效策略有哪些")).toBe("");
  });
});

describe("compactPhrase", () => {
  it("attaches the Chinese topic noun to the product name", () => {
    expect(extractTermPhrase("Redis分布式锁的核心实现原理是什么？")).toBe("Redis 分布式锁");
    expect(extractTermPhrase("MySQL 索引失效的典型场景与优化方法")).toBe("MySQL 索引失效");
    expect(extractTermPhrase("常见的缓存失效策略有哪些？")).toBe("");
  });

  it("strips interrogative framing and trailing ask tails", () => {
    expect(compactPhrase("如何全面理解React Server Components的核心原理与适用场景？")).toBe(
      "React Server Components",
    );
    expect(compactPhrase("缓存失效策略有哪些？")).toBe("缓存失效策略");
    expect(compactPhrase("什么是消息队列")).toBe("消息队列");
  });

  it("caps very long wording", () => {
    const long = "如".repeat(60);
    expect(compactPhrase(long).length).toBeLessThanOrEqual(32);
  });
});

describe("buildQueryVariants", () => {
  it("searches keyword forms first and keeps the academic wording last", () => {
    const variants = buildQueryVariants({
      question: "如何理解React Server Components？",
      refinedQuery: "如何全面理解React Server Components（RSC）的核心原理与适用场景？",
      alternatives: ["React Server Components 与传统SSR、SSG的差异有哪些？"],
    });
    // The live endpoint answers a bare term with Answers and a full sentence
    // with column articles, so the sentence must not eat the first search.
    expect(variants[0]).toBe("React Server Components RSC");
    expect(variants).toContain("React Server Components");
    expect(variants.at(-1)).toBe(
      "如何全面理解React Server Components（RSC）的核心原理与适用场景？",
    );
    expect(variants.length).toBeLessThanOrEqual(MAX_QUERY_VARIANTS);
  });

  it("falls back to a Chinese core phrase when there is no technical term", () => {
    const variants = buildQueryVariants({
      question: "缓存失效策略有哪些？",
      refinedQuery: "常见的缓存失效策略有哪些？",
      alternatives: [],
    });
    // Framing words and the ask tail are gone; only the topic is searchable.
    expect(variants[0]).toBe("缓存失效策略");
    expect(variants.at(-1)).toBe("常见的缓存失效策略有哪些？");
  });

  it("dedupes case-insensitively and drops fragments too short to search", () => {
    const variants = buildQueryVariants({
      question: "Go",
      refinedQuery: "Go",
      alternatives: ["go", "？", ""],
    });
    expect(variants).toEqual(["Go"]);
  });

  it("never spends the last slot on anything but the user's own wording", () => {
    const variants = buildQueryVariants({
      question: "怎么做好服务限流？",
      refinedQuery: "如何理解服务限流的常见误区与取舍？",
      alternatives: ["限流算法有哪些？", "网关限流怎么落地？", "服务降级和限流的区别？"],
    });
    expect(variants).toHaveLength(MAX_QUERY_VARIANTS);
    expect(variants.at(-1)).toBe("如何理解服务限流的常见误区与取舍？");
  });

  it("never returns an empty list for a blank input", () => {
    expect(buildQueryVariants({ question: "", refinedQuery: "", alternatives: [] })).toEqual([]);
  });
});
