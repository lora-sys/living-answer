import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { AnswerExcerpt } from "../../lib/answer-excerpt";
import type { ReadAnswerAdvisoryDecision } from "../../server/read-answer-response";
import type {
  ReadAnswerEvidenceSummary,
  ReadAnswerHistoryEntry,
  ReadAnswerLifecycleSummary,
} from "../../server/read-answer-response";
import { GeneralizedRealResultRead } from "./GeneralizedRealResultRead";

const excerpt: AnswerExcerpt = Object.freeze({
  questionId: "42",
  answerId: "100",
  capturedAt: 1_700_000_000_000,
  sourceContentId: "42",
  sourceContentType: "Answer",
  sourceEditTime: 1_699_000_000,
  excerpt: "旧回答摘录",
  fingerprint: "v1:abcdef1234567890",
});

const evidence: ReadAnswerEvidenceSummary[] = [
  {
    fingerprint: "v1:aaaa111111111111",
    sourceLabel: "官方说明",
    sourceUrl: "https://example.com/official",
  },
];

const advisory: ReadAnswerAdvisoryDecision = {
  verdict: "UPDATE",
  reason: "该 API 已经进入稳定版本。",
  patchBodyStatus: "no-body-available",
  selectedEvidenceFingerprints: [evidence[0]!.fingerprint],
  evidenceSummary: evidence,
};

const lifecycle: ReadAnswerLifecycleSummary = {
  recordFingerprint: "v1:1111111111111111",
  status: "VISIBLE",
  capturedAt: excerpt.capturedAt,
  eventAt: 1_700_000_001_000,
  reason: advisory.reason,
  selectedEvidenceFingerprints: advisory.selectedEvidenceFingerprints,
  evidenceSummary: evidence,
};

const history: ReadAnswerHistoryEntry[] = [
  {
    recordFingerprint: "v1:2222222222222222",
    status: "VISIBLE",
    capturedAt: 1_699_000_000_000,
    eventAt: 1_699_000_001_000,
    reason: "旧检查结果。",
  },
  {
    recordFingerprint: lifecycle.recordFingerprint,
    status: "VISIBLE",
    capturedAt: lifecycle.capturedAt,
    eventAt: lifecycle.eventAt,
    reason: lifecycle.reason,
  },
];

const render = (advisoryOverride: ReadAnswerAdvisoryDecision, status?: string): string => {
  const statusValue = (status ?? "VISIBLE") as ReadAnswerLifecycleSummary["status"];
  return renderToString(
    React.createElement(GeneralizedRealResultRead, {
      excerpt,
      advisory: advisoryOverride,
      lifecycle: { ...lifecycle, status: statusValue },
      history,
      onDispute: () => undefined,
      onResolve: () => undefined,
      onWithdraw: () => undefined,
      onSubmitFeedback: async (_input) => ({
        status: "error",
        code: "FEEDBACK_STORE_ERROR",
        message: "unused",
      }),
    }),
  );
};

describe("GeneralizedRealResultRead", () => {
  it("renders a visible UPDATE with matched evidence only", () => {
    const html = render(advisory);
    const updatePos = html.indexOf("UPDATE");
    const excerptPos = html.indexOf("旧回答摘录");
    expect(updatePos).toBeGreaterThanOrEqual(0);
    expect(excerptPos).toBeGreaterThanOrEqual(0);
    expect(updatePos).toBeLessThan(excerptPos);
    expect(html).toContain("前提变化提示");
    expect(html).toContain("官方说明");
    expect(html).toContain("https://example.com/official");
    expect(html).not.toContain("未匹配候选");
  });

  it("renders NO_PATCH and UNKNOWN with human labels and without implying replacement", () => {
    const noPatch = render({
      ...advisory,
      verdict: "NO_PATCH",
      selectedEvidenceFingerprints: [],
      evidenceSummary: [],
    });
    expect(noPatch).toContain("暂无更新");
    expect(noPatch).not.toMatch(/>UPDATE</);

    const unknown = render({
      ...advisory,
      verdict: "UNKNOWN",
      selectedEvidenceFingerprints: [],
      evidenceSummary: [],
    });
    expect(unknown).toContain("UNKNOWN");
    expect(unknown).toContain("状态待确定");
    expect(unknown).not.toMatch(/>UPDATE</);
  });

  it("places the advisory conclusion before the excerpt for UPDATE, NO_PATCH, and UNKNOWN", () => {
    for (const verdict of ["UPDATE", "NO_PATCH", "UNKNOWN"] as const) {
      const advisoryMarker = verdict === "NO_PATCH" ? "暂无更新" : verdict;
      const html = render({
        ...advisory,
        verdict,
        selectedEvidenceFingerprints: [],
        evidenceSummary: [],
      });
      const advisoryPos = html.indexOf(advisoryMarker);
      const excerptLabelPos = html.indexOf("旧回答摘录");
      expect(advisoryPos).toBeGreaterThanOrEqual(0);
      expect(excerptLabelPos).toBeGreaterThanOrEqual(0);
      expect(advisoryPos).toBeLessThan(excerptLabelPos);
    }
  });

  it("renders a disputed lifecycle as paused and hides the active advisory", () => {
    const html = render(advisory, "DISPUTED");
    expect(html).toContain("DISPUTED");
    expect(html).toContain("这条补充提示已被标记为有争议");
    expect(html).not.toContain("前提变化提示");
  });

  it("renders lifecycle history without exposing internal record fields", () => {
    const html = render(advisory);
    expect(html).toContain("变更历史");
    expect(html).not.toContain("recordFingerprint");
    expect(html).not.toContain("capturedAt");
  });
});
