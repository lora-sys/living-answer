import { createAnswerSnapshot, type AnswerSnapshot } from "./answer-snapshot";
import { createPatchEvidence } from "./patch-evidence";

/**
 * Curated "ChatGPT Free / Plus" Golden Demo fixture.
 *
 * All data is synthetic.  This is **not** a live Zhihu capture.  The snapshot
 * is created via `createAnswerSnapshot` to preserve the immutable-record shape
 * and stable fingerprint, but the provenance block bounds it as a manually
 * curated demo with synthetic author metadata.
 *
 * Evidence URLs are browser-verified OpenAI primary sources.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/** Patch kinds used in the demo. */
export type GoldenDemoPatchType = "UPDATE" | "CORRECTION" | "CONDITION" | "BETTER_WAY";

/** Evidence fields needed for the EvidenceCard presentation. */
export interface GoldenDemoEvidence {
  readonly title: string;
  readonly organization: string;
  readonly publishedAt: number;
  readonly supportedFact: string;
  readonly sourceType: string;
  readonly sourceUrl: string;
  readonly quote: string;
  readonly capturedAt: number;
}

/** One observer patch on a specific paragraph. */
export interface GoldenDemoPatch {
  readonly id: string;
  readonly type: GoldenDemoPatchType;
  readonly paragraphId: string;
  readonly originalExcerpt: string;
  readonly currentChange: string;
  readonly impact: string;
  readonly asOf: number;
  readonly evidence: readonly GoldenDemoEvidence[];
}

/** Provenance and metadata for the curated demo. */
export interface GoldenDemoFixtureProvenance {
  readonly kind: "curated-demo";
  readonly model: string;
  readonly capturedAt: number;
  readonly note: string;
  readonly openaiPrimarySources: readonly string[];
}

/** Top-level fixture record. */
export interface GoldenDemoFixture {
  readonly provenance: GoldenDemoFixtureProvenance;
  readonly snapshot: AnswerSnapshot;
  /** Synthetic author — no real Zhihu identity. */
  readonly syntheticAuthor: {
    readonly displayName: string;
    readonly initials: string;
  };
  readonly capturedAt: number;
  readonly patches: readonly GoldenDemoPatch[];
  /** Lazily derived — paragraphs split from the snapshot body. */
  readonly paragraphs: readonly string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PARAGRAPH_SEPARATOR = "\n\n";

export function splitBodyParagraphs(body: string): readonly string[] {
  return body.split(PARAGRAPH_SEPARATOR).filter((p) => p.trim() !== "");
}

export function paragraphId(index: number): string {
  return `p-${index}`;
}

// ── Browser-verified OpenAI primary-source URLs ──────────────────────────────────
// Verified via direct browser access as primary OpenAI documentation pages.

const OPENAI_PRICING_URL = "https://developers.openai.com/api/docs/pricing";
const OPENAI_RATE_LIMITS_URL = "https://developers.openai.com/api/docs/guides/rate-limits";

// ── Immutable fixture ──────────────────────────────────────────────────────────

const snapshotResult = createAnswerSnapshot({
  questionId: "573948291",
  answerId: "1203749156",
  capturedAt: 1_700_000_000_000,
  body: [
    // ── P0 ────────────────────────────────────────────────────────────────
    "ChatGPT 的免费用户与付费（Plus）用户之间存在几个关键差异。这些差异会影响模型访问权限、使用频率和功能可用性，了解这些区分有助于根据自身需求选择合适的档位。",
    // ── P1 ────────────────────────────────────────────────────────────────
    "在消息数量方面，免费用户在使用 GPT-4 模型时存在每小时限制。在该系统限定下，用户每小时只能发送有限条数的消息，超出后需要等待重置才能继续使用。Plus 用户则享有更高的使用配额，基本不受这一限制的约束。",
    // ── P2 ────────────────────────────────────────────────────────────────
    "在模型访问权限方面，最初只有 Plus 用户才能使用 GPT-4 级别的模型。随后 OpenAI 逐步向免费用户开放了部分 GPT-4 模型的体验资格。2024 年中期推出的 GPT-4o 系列使免费用户也能接触到该类模型，但使用频率仍然受到更严格的管控。",
    // ── P3 ────────────────────────────────────────────────────────────────
    "在功能特性上，Plus 用户可以享用多项增强功能，包括在高峰期仍可保障的使用额度、增强的数据分析能力、优先接收新功能的资格以及更快的响应速度。免费用户的图像理解功能则经历过从受限到逐步放开的过程，但仍受制于使用档位。",
  ].join(PARAGRAPH_SEPARATOR),
});

if (snapshotResult._tag === "failure") {
  throw new Error(`Golden Demo snapshot creation failed`);
}

const GOOD_SNAPSHOT = snapshotResult.snapshot;

// ── Evidence (created via existing factory for stable fingerprints) ───────────

const evidence1_pricing = createPatchEvidence({
  sourceLabel: "OpenAI API 定价",
  sourceUrl: OPENAI_PRICING_URL,
  quote:
    "Per-token API pricing for current model families, including output at $20.00 per million tokens",
  capturedAt: 1_700_000_000_000,
});
const evidence2_limits = createPatchEvidence({
  sourceLabel: "OpenAI API 速率限制",
  sourceUrl: OPENAI_RATE_LIMITS_URL,
  quote: "Rate limits vary by usage tier and are applied at the organization level",
  capturedAt: 1_700_000_000_000,
});

if (evidence1_pricing._tag === "failure") {
  throw new Error(`Evidence 1 failed: ${evidence1_pricing.reason}`);
}
if (evidence2_limits._tag === "failure") {
  throw new Error(`Evidence 2 failed: ${evidence2_limits.reason}`);
}

// ── Fixture record ─────────────────────────────────────────────────────────────

export const goldenDemoFixture: GoldenDemoFixture = Object.freeze({
  provenance: Object.freeze({
    kind: "curated-demo",
    model: "ChatGPT Free / Plus (Golden Demo, synthetic)",
    capturedAt: 1_700_000_000_000,
    note: "Manually curated demo fixture using synthetic author and ID metadata. Not a live Zhihu capture.",
    openaiPrimarySources: [OPENAI_PRICING_URL, OPENAI_RATE_LIMITS_URL] as const,
  }),
  snapshot: GOOD_SNAPSHOT,
  syntheticAuthor: Object.freeze({
    displayName: "zhihu-demo-author-synthetic",
    initials: "ZA",
  }),
  capturedAt: 1_700_000_000_000,
  patches: Object.freeze([
    Object.freeze({
      id: "patch-1-msg-limit",
      type: "UPDATE" as GoldenDemoPatchType,
      paragraphId: paragraphId(0),
      originalExcerpt:
        "免费用户在使用 GPT-4 模型时存在每小时限制。在该系统限定下，用户每小时只能发送有限条数的消息，超出后需要等待重置才能继续使用。Plus 用户则享有更高的使用配额，基本不受这一限制的约束。",
      currentChange:
        "官方 API 文档现在按模型和使用层级描述访问：定价页记录当前模型的按 token 计价，速率限制页记录按组织、按使用层级设置的限额。原回答中的“固定每小时条数”不再适合解释当前文档中的访问框架。",
      impact:
        "原文引用的具体配额数字不应继续当作当前通用规则使用；判断可用量时，应参考当前官方按层级和模型给出的说明，而不是固定每小时条数。",
      asOf: 1_700_000_000_000,
      evidence: Object.freeze([
        Object.freeze({
          title: "OpenAI API Pricing",
          organization: "OpenAI",
          publishedAt: 1_700_000_000_000,
          supportedFact: "官方 API Pricing 页展示当前模型的按 token 计价，不是消费端订阅价目表。",
          sourceType: "官方定价文档",
          sourceUrl: OPENAI_PRICING_URL,
          quote: "Pricing | OpenAI API",
          capturedAt: 1_700_000_000_000,
        }),
        Object.freeze({
          title: "OpenAI API Rate Limits",
          organization: "OpenAI Developers",
          publishedAt: 1_700_000_000_000,
          supportedFact: "官方 Rate Limits 页展示 Free 与更高付费层级，说明限额按使用层级设置。",
          sourceType: "官方速率限制文档",
          sourceUrl: OPENAI_RATE_LIMITS_URL,
          quote: "Rate limits vary by usage tier and are applied at the organization level",
          capturedAt: 1_700_000_000_000,
        }),
      ]),
    }),
    Object.freeze({
      id: "patch-2-model-access",
      type: "UPDATE" as GoldenDemoPatchType,
      paragraphId: paragraphId(2),
      originalExcerpt:
        "最初只有 Plus 用户才能使用 GPT-4 级别的模型。随后 OpenAI 逐步向免费用户开放了部分 GPT-4 模型的体验资格",
      currentChange:
        "官方 API 文档把模型和吞吐组织为层级化框架：定价页按当前模型家族记录 API 价格，速率限制页按使用层级记录限额。原回答中的订阅分界不能直接套用到当前开发者文档的层级框架。",
      impact:
        "原文中“只有付费用户才能使用”的前提在今天不能作为通用结论；实际可用范围和吞吐取决于具体产品或 API 使用层级的当前说明。",
      asOf: 1_700_000_000_000,
      evidence: Object.freeze([
        Object.freeze({
          title: "OpenAI API Pricing",
          organization: "OpenAI",
          publishedAt: 1_700_000_000_000,
          supportedFact: "官方 API Pricing 页展示当前模型的按 token 计价，不是消费端订阅价目表。",
          sourceType: "官方定价文档",
          sourceUrl: OPENAI_PRICING_URL,
          quote: "Pricing | OpenAI API",
          capturedAt: 1_700_000_000_000,
        }),
        Object.freeze({
          title: "OpenAI API Rate Limits",
          organization: "OpenAI Developers",
          publishedAt: 1_700_000_000_000,
          supportedFact: "官方 Rate Limits 页展示 Free 与更高付费层级，说明限额按使用层级设置。",
          sourceType: "官方速率限制文档",
          sourceUrl: OPENAI_RATE_LIMITS_URL,
          quote: "Rate limits vary by usage tier and are applied at the organization level",
          capturedAt: 1_700_000_000_000,
        }),
      ]),
    }),
  ]),
  paragraphs: Object.freeze(splitBodyParagraphs(GOOD_SNAPSHOT.body)),
});
