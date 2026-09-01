/**
 * Offline unit tests for the RealResultRead presentation component.
 *
 * Every test is fully offline: no network calls, no provider injection,
 * no environment reads.
 *
 * @module RealResultRead.test
 */

import { describe, expect, it } from "vite-plus/test";

import { renderToString } from "react-dom/server";
import React from "react";
import { RealResultRead } from "./RealResultRead";

import type { RealResultReadProps } from "./RealResultRead";
import type { AnswerExcerpt } from "../../lib/answer-excerpt";
import type { AnalyzePatchResponse } from "../../server/analyze-patch-response";

// ── Helpers ─────────────────────────────────────────────────────────────────────

const h = (el: React.ReactElement) => renderToString(el);

/**
 * Render a RealResultRead with optional overrides. Omits null-falsy keys
 * (undefined/empty context) automatically.
 */
const renderRead = (overrides?: Partial<RealResultReadProps>): string => {
  const props: RealResultReadProps = {
    excerpt: overrides?.excerpt ?? EXCERPT,
    result: overrides?.result ?? UPDATE_RESULT,
    contextText: overrides?.contextText ?? undefined,
    onSubmitFeedback: overrides?.onSubmitFeedback ?? (async () => ({
      status: "error",
      code: "FEEDBACK_STORE_ERROR",
      message: "unused",
    })),
    ...overrides,
  };
  return h(React.createElement(RealResultRead, props));
};

// ── Fixtures ────────────────────────────────────────────────────────────────────

const MEMOIZED_REASON = "Model determined that the answer now has a different premise.";

const EXCERPT: AnswerExcerpt = Object.freeze({
  questionId: "123456",
  answerId: "987654",
  capturedAt: 1700000000000,
  sourceContentId: "123456",
  sourceContentType: "Answer",
  sourceEditTime: 1699000000000,
  excerpt: "这是回答的第一段。\n\n这是回答的第二段，包含更多内容。\n\n这是第三段。",
  fingerprint: "v1:abcdef1234567890",
});

const UPDATE_RESULT: AnalyzePatchResponse = Object.freeze({
  status: "ok" as const,
  decision: {
    verdict: "UPDATE" as const,
    reason: MEMOIZED_REASON,
    patchBodyStatus: "no-body-available" as const,
    selectedEvidenceFingerprints: ["v1:abc123def4567890"],
    evidenceSummary: [
      {
        fingerprint: "v1:abc123def4567890",
        sourceLabel: "来源A",
        sourceUrl: "https://example.com/a",
      },
    ],
  },
});

const LIFECYCLE_HISTORY = Object.freeze([
  {
    recordFingerprint: "v1:1111111111111111",
    status: "VISIBLE" as const,
    capturedAt: 1700000000000,
    eventAt: 1700000001000,
    reason: MEMOIZED_REASON,
  },
]);

const VISIBLE_LIFECYCLE = {
  recordFingerprint: "v1:1111111111111111",
  status: "VISIBLE" as const,
  capturedAt: 1700000000000,
  eventAt: 1700000001000,
};

const updateWithLifecycle = (status: "VISIBLE" | "DISPUTED"): AnalyzePatchResponse => ({
  ...UPDATE_RESULT,
  lifecycle: {
    ...VISIBLE_LIFECYCLE,
    status,
  },
  history: LIFECYCLE_HISTORY.map((record) =>
    record.recordFingerprint === VISIBLE_LIFECYCLE.recordFingerprint
      ? { ...record, status }
      : record,
  ),
});

const NO_PATCH_RESULT: AnalyzePatchResponse = Object.freeze({
  status: "ok" as const,
  decision: {
    verdict: "NO_PATCH" as const,
    reason: "No evidence of premise changes detected.",
  },
});

const UNKNOWN_RESULT: AnalyzePatchResponse = Object.freeze({
  status: "ok" as const,
  decision: {
    verdict: "UNKNOWN" as const,
    reason: "Evidence is insufficient or inconclusive.",
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Excerpt rendering
// ═══════════════════════════════════════════════════════════════════════════════

describe("RealResultRead", () => {
  // ── Excerpt rendering ───────────────────────────────────────────────────────

  describe("excerpt rendering", () => {
    it("renders the excerpt text in paragraphs", () => {
      const html = renderRead({ result: UPDATE_RESULT });
      expect(html).toContain("这是回答的第一段");
      expect(html).toContain("这是回答的第二段");
      expect(html).toContain("这是第三段");
    });

    it("renders question and answer IDs", () => {
      const html = renderRead({ result: UPDATE_RESULT });
      expect(html).toContain("123456");
      expect(html).toContain("987654");
    });
  });

  // ── UPDATE verdict ─────────────────────────────────────────────────────────

  describe("UPDATE verdict", () => {
    it("renders the advisory reason", () => {
      const html = renderRead({ result: UPDATE_RESULT });
      expect(html).toContain(MEMOIZED_REASON);
    });

    it("renders evidence links when present", () => {
      const html = renderRead({ result: UPDATE_RESULT });
      expect(html).toContain("来源A");
      expect(html).toContain("https://example.com/a");
    });

    it("does not contain proposedBody text", () => {
      const html = renderRead({ result: UPDATE_RESULT });
      expect(html).not.toContain("proposedBody");
      expect(html).not.toContain("replacement");
    });

    it("does not contain model name or confidence", () => {
      const html = renderRead({ result: UPDATE_RESULT });
      expect(html).not.toContain("gpt");
      expect(html).not.toContain("confident");
      expect(html).not.toContain("confidence");
    });
  });

  // ── NO_PATCH verdict ───────────────────────────────────────────────────────

  describe("NO_PATCH verdict", () => {
    it("renders the clean confirmation", () => {
      const html = renderRead({ result: NO_PATCH_RESULT });
      expect(html).toContain("No evidence of premise changes");
    });

    it("presents the answer as learnable while review remains explicit", () => {
      const html = renderRead({ result: NO_PATCH_RESULT });
      expect(html).toContain("可学习 · 暂无更新");
      expect(html).toContain("这份回答仍可以作为理解问题的基础");
      expect(html).toContain("反馈与复核");
      expect(html).toContain("先进入复核队列，不会直接改写结论");
    });

    it("uses paper-2/rule neutral styling", () => {
      const html = renderRead({ result: NO_PATCH_RESULT });
      expect(html).toContain("bg-paper-2");
    });

    it("does not render update styling for NO_PATCH", () => {
      const html = renderRead({ result: NO_PATCH_RESULT });
      expect(html).not.toContain("bg-update-soft");
      expect(html).not.toContain("bg-update-soft");
    });
  });

  // ── UNKNOWN verdict ────────────────────────────────────────────────────────

  describe("UNKNOWN verdict", () => {
    it("renders the reason without fabricating certainty", () => {
      const html = renderRead({ result: UNKNOWN_RESULT });
      expect(html).toContain("insufficient or inconclusive");
    });

    it("uses accent informational styling", () => {
      const html = renderRead({ result: UNKNOWN_RESULT });
      expect(html).toContain("bg-accent-soft");
      expect(html).toContain("border-accent/32");
    });

    it("does not render update styling for UNKNOWN", () => {
      const html = renderRead({ result: UNKNOWN_RESULT });
      expect(html).not.toContain("bg-update-soft");
      expect(html).not.toContain("bg-update-soft");
    });
  });

  // ── Error response (defensive) ─────────────────────────────────────────────

  describe("error response", () => {
    it("renders nothing when result status is error, delegating to route", () => {
      const errorResult = { status: "error" as const, code: "PROVIDER_ERROR" as const };
      const html = renderRead({ result: errorResult });
      expect(html).toBe("");
    });
  });

  // ── Context text ───────────────────────────────────────────────────────────

  describe("context text", () => {
    it("renders context text when provided", () => {
      const html = renderRead({ result: NO_PATCH_RESULT, contextText: "Some maintenance note" });
      expect(html).toContain("Some maintenance note");
    });

    it("omits context section when contextText is empty", () => {
      const html = renderRead({ result: NO_PATCH_RESULT, contextText: "" });
      expect(html).not.toContain("维护备注");
    });
  });

  // ── Lifecycle actions and history ─────────────────────────────────────────

  describe("lifecycle actions and history", () => {
    it("shows the current status, history, and available actions", () => {
      const html = renderRead({
        result: updateWithLifecycle("VISIBLE"),
        onDispute: () => {},
        onRecheck: () => {},
      });

      expect(html).toContain("变更状态");
      expect(html).toContain("当前可见");
      expect(html).toContain("变更历史");
      expect(html).toContain("标记有争议");
      expect(html).toContain("重新检查");
      expect(html).toContain(MEMOIZED_REASON);
    });

    it("pauses advisory details when the patch is disputed", () => {
      const html = renderRead({ result: updateWithLifecycle("DISPUTED") });

      expect(html).toContain("已暂停");
      expect(html).toContain("当前不再作为有效提示显示");
      expect(html).not.toContain("参考来源");
      expect(html).not.toContain("匹配证据");
      expect(html).not.toContain("标记有争议");
    });

    it("disables actions while a dispute request is pending", () => {
      const html = renderRead({
        result: updateWithLifecycle("VISIBLE"),
        onDispute: () => {},
        onRecheck: () => {},
        isDisputePending: true,
      });

      expect(html).toContain("disabled");
    });

    it("shows a stable dispute error without changing the status", () => {
      const html = renderRead({
        result: updateWithLifecycle("VISIBLE"),
        disputeError: "DISPUTE_PATCH_STORE_ERROR",
      });

      expect(html).toContain("暂停变更时出现异常，请稍后再试。");
      expect(html).toContain("当前可见");
    });
  });

  // ── UPDATE with claim-anchored optional fields ──────────────────────────────

  describe("UPDATE with claim-anchored optional fields", () => {
    const FULL_REASON = "The answer premise about the world population has changed.";
    const FULL_UPDATE_RESULT: AnalyzePatchResponse = Object.freeze({
      status: "ok" as const,
      decision: {
        verdict: "UPDATE" as const,
        reason: FULL_REASON,
        patchBodyStatus: "no-body-available" as const,
        selectedEvidenceFingerprints: ["v1:abc123def4567890"],
        evidenceSummary: [
          {
            fingerprint: "v1:abc123def4567890",
            sourceLabel: "来源A",
            sourceUrl: "https://example.com/a",
          },
        ],
        affectedWording: "这是回答的第一段。",
        currentState: "World population reached 8 billion in 2022.",
        impactOnAnswer: "The original answer's premise about population is outdated.",
        matchedEvidence: [
          {
            fingerprint: "v1:abc123def4567890",
            sourceLabel: "来源A",
            sourceUrl: "https://example.com/a",
            quote: "这是有效的引用文本，超长了的时候会被截断。",
          },
        ],
      },
    });

    const PARTIAL_UPDATE_RESULT: AnalyzePatchResponse = Object.freeze({
      status: "ok" as const,
      decision: {
        verdict: "UPDATE" as const,
        reason: "Some premise changed.",
        patchBodyStatus: "no-body-available" as const,
        selectedEvidenceFingerprints: ["v1:abc123def4567890"],
        evidenceSummary: [
          {
            fingerprint: "v1:abc123def4567890",
            sourceLabel: "来源A",
            sourceUrl: "https://example.com/a",
          },
        ],
        affectedWording: "这是回答的第一段。",
      },
    });

    const LEGACY_UPDATE_RESULT: AnalyzePatchResponse = Object.freeze({
      status: "ok" as const,
      decision: {
        verdict: "UPDATE" as const,
        reason: "The answer now has a different premise.",
        patchBodyStatus: "no-body-available" as const,
        selectedEvidenceFingerprints: ["v1:abc123def4567890"],
        evidenceSummary: [
          {
            fingerprint: "v1:abc123def4567890",
            sourceLabel: "来源A",
            sourceUrl: "https://example.com/a",
          },
        ],
      },
    });

    const renderFull = (): string =>
      h(
        React.createElement(RealResultRead, {
          excerpt: EXCERPT,
          result: FULL_UPDATE_RESULT,
        }),
      );

    const renderPartial = (): string =>
      h(
        React.createElement(RealResultRead, {
          excerpt: EXCERPT,
          result: PARTIAL_UPDATE_RESULT,
        }),
      );

    const renderLegacy = (): string =>
      h(
        React.createElement(RealResultRead, {
          excerpt: EXCERPT,
          result: LEGACY_UPDATE_RESULT,
        }),
      );

    it("renders all new sections for a full claim-anchored UPDATE", () => {
      const html = renderFull();
      expect(html).toContain("原文受影响前提");
      expect(html).toContain("当前状况");
      expect(html).toContain("对回答的影响");
      expect(html).toContain(FULL_REASON);
      expect(html).toContain("匹配证据");
      expect(html).toContain("参考来源");
      expect(html).toContain("来源A");
      expect(html).not.toContain("proposedBody");
    });

    it("renders only present sections for a partial UPDATE", () => {
      const html = renderPartial();
      expect(html).toContain("原文受影响前提");
      expect(html).not.toContain("当前状况");
      expect(html).not.toContain("对回答的影响");
      expect(html).not.toContain("匹配证据");
      expect(html).toContain("Some premise changed.");
      expect(html).toContain("参考来源");
      expect(html).not.toContain("proposedBody");
    });

    it("renders the same generic card as today for a legacy UPDATE", () => {
      const html = renderLegacy();
      expect(html).toContain("The answer now has a different premise.");
      expect(html).toContain("参考来源");
      expect(html).toContain("来源A");
      expect(html).not.toContain("原文受影响前提");
      expect(html).not.toContain("匹配证据");
      expect(html).not.toContain("proposedBody");
      expect(html).toContain("bg-update-soft");
    });

    it("never renders proposedBody in any UPDATE variant", () => {
      expect(renderFull()).not.toContain("proposedBody");
      expect(renderPartial()).not.toContain("proposedBody");
      expect(renderLegacy()).not.toContain("proposedBody");
    });
  });

  // ── Styling invariants ──────────────────────────────────────────────────────

  describe("styling invariants", () => {
    it("UPDATE uses update styling", () => {
      const html = renderRead({ result: UPDATE_RESULT });
      expect(html).toContain("bg-update-soft");
      expect(html).toContain("border-update/30");
      expect(html).toContain("bg-update-soft");
    });

    it("UPDATE with matchedEvidence renders update styling", () => {
      const result: AnalyzePatchResponse = {
        status: "ok",
        decision: {
          verdict: "UPDATE",
          reason: MEMOIZED_REASON,
          patchBodyStatus: "no-body-available",
          selectedEvidenceFingerprints: [],
          evidenceSummary: [],
          matchedEvidence: [
            {
              fingerprint: "v1:testtesttesttest",
              sourceLabel: "T",
              sourceUrl: "https://example.com",
              quote: "Q",
            },
          ],
        },
      };
      const html = h(
        React.createElement(RealResultRead, {
          excerpt: EXCERPT,
          result,
        }),
      );
      expect(html).toContain("bg-update-soft");
      expect(html).toContain("border-update/30");
    });

    it("NO_PATCH uses paper-2/rule (neutral) styling", () => {
      const html = renderRead({ result: NO_PATCH_RESULT });
      expect(html).toContain("bg-paper-2");
      expect(html).toContain("border-rule");
    });

    it("UNKNOWN uses accent informational styling", () => {
      const html = renderRead({ result: UNKNOWN_RESULT });
      expect(html).toContain("bg-accent-soft");
      expect(html).toContain("border-accent/32");
    });
  });
});
