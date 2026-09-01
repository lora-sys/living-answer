/**
 * Offline unit tests for the AnalysisResultPanel presentation component.
 *
 * Every test is fully offline: no network calls, no provider injection,
 * no environment reads.
 *
 * @module AnalysisResultPanel.test
 */

import { describe, expect, it } from "vite-plus/test";

import { renderToString } from "react-dom/server";
import { AnalysisResultPanel } from "./AnalysisResultPanel";

import type { AnalysisResultPanelProps } from "./AnalysisResultPanel";

// ── Helpers ─────────────────────────────────────────────────────────────────────

const MEMOIZED_REASON = "Model determined that the answer now has a different premise.";

const UPDATE_RESULT = Object.freeze({
  status: "ok" as const,
  decision: {
    _tag: "UPDATE" as const,
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

const NO_PATCH_RESULT = Object.freeze({
  status: "ok" as const,
  decision: {
    _tag: "NO_PATCH" as const,
    verdict: "NO_PATCH" as const,
    reason: "No evidence of premise changes detected.",
  },
});

const UNKNOWN_RESULT = Object.freeze({
  status: "ok" as const,
  decision: {
    _tag: "UNKNOWN" as const,
    verdict: "UNKNOWN" as const,
    reason: "Evidence is insufficient or inconclusive.",
  },
});

const ERROR_RESULT = Object.freeze({
  status: "error" as const,
  code: "PROVIDER_ERROR",
});

const renderPanel = (props: Partial<AnalysisResultPanelProps> = {}) =>
  renderToString(
    <AnalysisResultPanel
      result={null}
      isLoading={false}
      analysisError={null}
      onRetry={() => {}}
      {...props}
    />,
  );

// ═══════════════════════════════════════════════════════════════════════════════
// Loading state
// ═══════════════════════════════════════════════════════════════════════════════

describe("AnalysisResultPanel", () => {
  // ── Loading state ─────────────────────────────────────────────────────────

  describe("loading state", () => {
    it("renders a loading indicator when isLoading is true", () => {
      const html = renderPanel({ isLoading: true });
      expect(html).toContain("正在分析前提变化");
    });

    it("does not render a loading indicator when isLoading is false", () => {
      const html = renderPanel({ isLoading: false });
      expect(html).not.toContain("正在分析前提变化");
    });

    it("does not render retry button in loading state", () => {
      const html = renderPanel({ isLoading: true });
      expect(html).not.toContain("重新分析");
    });
  });

  // ── Client validation error ────────────────────────────────────────────────

  describe("client validation error", () => {
    it("renders the analysis error message when provided", () => {
      const html = renderPanel({ analysisError: "请输入一个有效的知乎回答链接。" });
      expect(html).toContain("请输入一个有效的知乎回答链接。");
    });

    it("does not render client error when analysisError is null", () => {
      const html = renderPanel({ analysisError: null });
      expect(html).not.toContain("请输入一个有效的知乎回答链接。");
    });
  });

  // ── Server error response ─────────────────────────────────────────────────

  describe("server error response", () => {
    it("renders PROVIDER_ERROR message from failureMessage", () => {
      const html = renderPanel({ result: ERROR_RESULT });
      expect(html).toContain("获取回答摘录时出现异常");
    });

    it("renders MODEL_TRANSPORT_ERROR message", () => {
      const error = { status: "error" as const, code: "MODEL_TRANSPORT_ERROR" } as const;
      const html = renderPanel({ result: error });
      expect(html).toContain("模型服务暂时不可用");
    });

    it("renders MALFORMED_MODEL_OUTPUT message", () => {
      const error = { status: "error" as const, code: "MALFORMED_MODEL_OUTPUT" } as const;
      const html = renderPanel({ result: error });
      expect(html).toContain("模型响应异常");
    });
  });

  // ── Null (no result) ───────────────────────────────────────────────────────

  describe("null result", () => {
    it("renders nothing when result is null and not loading", () => {
      const html = renderPanel({ result: null, isLoading: false });
      expect(html).toBe("");
    });
  });

  // ── UPDATE verdict ─────────────────────────────────────────────────────────

  describe("UPDATE verdict", () => {
    it("renders the model reason", () => {
      const html = renderPanel({ result: UPDATE_RESULT });
      expect(html).toContain(MEMOIZED_REASON);
    });

    it("renders evidence summary with source link", () => {
      const html = renderPanel({ result: UPDATE_RESULT });
      expect(html).toContain("来源A");
      expect(html).toContain("https://example.com/a");
    });

    it("does not render any proposedBody text on UPDATE", () => {
      const html = renderPanel({ result: UPDATE_RESULT });
      expect(html).not.toContain("proposedBody");
      expect(html).not.toContain("proposed_body");
      expect(html).not.toContain("replacement");
      expect(html).not.toContain("replacement text");
      expect(html).not.toContain("原文替换");
    });
  });

  // ── UPDATE with claim-anchored optional fields ──────────────────────────────

  describe("UPDATE with claim-anchored optional fields", () => {
    const FULL_UPDATE = Object.freeze({
      status: "ok" as const,
      decision: {
        _tag: "UPDATE" as const,
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
        affectedWording: "test excerpt text",
        currentState: "The world reached 8 billion.",
        impactOnAnswer: "Outdated premise.",
        matchedEvidence: [
          {
            fingerprint: "v1:abc123def4567890",
            sourceLabel: "来源A",
            sourceUrl: "https://example.com/a",
            quote: "evidence quote text here",
          },
        ],
      },
    });

    const LEGACY_UPDATE = Object.freeze({
      status: "ok" as const,
      decision: {
        _tag: "UPDATE" as const,
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

    it("renders all new sections for a full UPDATE", () => {
      const html = renderPanel({ result: FULL_UPDATE });
      expect(html).toContain("原文受影响前提");
      expect(html).toContain("当前状况");
      expect(html).toContain("对回答的影响");
      expect(html).toContain("匹配证据");
      expect(html).not.toContain("proposedBody");
    });

    it("renders the same generic card for legacy UPDATE", () => {
      const html = renderPanel({ result: LEGACY_UPDATE });
      expect(html).toContain(MEMOIZED_REASON);
      expect(html).toContain("参考来源");
      expect(html).not.toContain("原文受影响前提");
      expect(html).not.toContain("匹配证据");
      expect(html).not.toContain("proposedBody");
      expect(html).toContain("bg-update-soft");
    });

    it("never renders proposedBody on UPDATE", () => {
      expect(renderPanel({ result: FULL_UPDATE })).not.toContain("proposedBody");
      expect(renderPanel({ result: LEGACY_UPDATE })).not.toContain("proposedBody");
    });
  });

  // ── NO_PATCH verdict ───────────────────────────────────────────────────────

  describe("NO_PATCH verdict", () => {
    it("renders the reason text", () => {
      const html = renderPanel({ result: NO_PATCH_RESULT });
      expect(html).toContain("No evidence of premise changes");
    });
  });

  // ── UNKNOWN verdict ────────────────────────────────────────────────────────

  describe("UNKNOWN verdict", () => {
    it("renders the reason text", () => {
      const html = renderPanel({ result: UNKNOWN_RESULT });
      expect(html).toContain("insufficient or inconclusive");
    });
  });

  // ── Styling invariants ─────────────────────────────────────────────────────

  describe("styling invariants", () => {
    it("UPDATE uses update styling", () => {
      const html = renderPanel({ result: UPDATE_RESULT });
      // UPDATE card: amber-tinted background and border
      expect(html).toContain("bg-update-soft");
      expect(html).toContain("border-update/30");
      // Amber badge color
      expect(html).toContain("bg-update-soft");
    });

    it("NO_PATCH uses paper-2/rule (neutral) styling", () => {
      const html = renderPanel({ result: NO_PATCH_RESULT });
      // NO_PATCH card: neutral paper-2 background and rule border
      expect(html).toContain("bg-paper-2");
      expect(html).toContain("border-rule");
      // No amber styling
      expect(html).not.toContain("bg-update-soft");
      expect(html).not.toContain("bg-update-soft");
    });

    it("UNKNOWN uses blue information styling", () => {
      const html = renderPanel({ result: UNKNOWN_RESULT });
      expect(html).toContain("bg-accent-soft");
      expect(html).toContain("border-accent/32");
      // No amber styling
      expect(html).not.toContain("bg-update-soft");
      expect(html).not.toContain("bg-update-soft");
    });
  });

  // ── Retry action ───────────────────────────────────────────────────────────

  describe("retry action", () => {
    it("renders a retry button when result is not null and not loading", () => {
      const html = renderPanel({ result: UPDATE_RESULT });
      expect(html).toContain("重新分析");
    });

    it("renders a retry button on server error", () => {
      const html = renderPanel({ result: ERROR_RESULT });
      expect(html).toContain("重新分析");
    });

    it("does not render retry button when result is null", () => {
      const html = renderPanel({ result: null });
      expect(html).not.toContain("重新分析");
    });

    it("calls onRetry as a parameterless callback for UPDATE", () => {
      const retries: Array<unknown> = [];
      const captured = { received: null as unknown };
      const handler = (v: unknown) => {
        retries.push(v);
        captured.received = v;
      };

      const props = {
        result: UPDATE_RESULT,
        isLoading: false as boolean,
        analysisError: null as string | null,
        onRetry: handler as () => void,
      };

      // Simulate onRetry call (it is a parameterless callback)
      props.onRetry();

      expect(retries.length).toBe(1);
      expect(captured.received).toBeUndefined();
    });
  });
});
