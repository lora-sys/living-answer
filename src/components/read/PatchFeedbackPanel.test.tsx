import { describe, expect, it } from "vite-plus/test";
import { renderToString } from "react-dom/server";

import type { ClarifyFeedbackResponse } from "../../server/clarify-feedback";
import type { SubmitPatchFeedbackResponse } from "../../server/submit-patch-feedback";
import { PatchFeedbackPanel } from "./PatchFeedbackPanel";

const baseProps = {
  questionId: "42",
  answerId: "100",
  excerptFingerprint: "v1:0123456789abcdef",
  excerptText: "This is the answer excerpt.",
  onSubmitFeedback: async (): Promise<SubmitPatchFeedbackResponse> => ({
    status: "ok",
    feedbackFingerprint: "v1:fedcba9876543210",
    submittedAt: 1_700_000_001_000,
    reviewState: "PENDING_REVIEW",
  }),
};

const unavailable = async (): Promise<ClarifyFeedbackResponse> => ({
  success: false,
  code: "CLARIFICATION_UNAVAILABLE",
  message: "澄清服务暂时不可用，请稍后再试。",
});

describe("PatchFeedbackPanel", () => {
  it("renders AI clarification as the default when a clarify handler is available", () => {
    const html = renderToString(<PatchFeedbackPanel {...baseProps} onClarify={unavailable} />);

    expect(html).toContain("反馈与复核");
    expect(html).toContain("正在理解您的问题");
    expect(html).toContain("您的回复");
  });

  it("renders the manual form when clarification is unavailable", () => {
    const html = renderToString(<PatchFeedbackPanel {...baseProps} />);

    expect(html).toContain("反馈类型");
    expect(html).toContain("问题或补充说明");
    expect(html).toContain("证据链接");
    expect(html).toContain("来源摘录");
    expect(html).toContain("提交反馈");
    expect(html).toContain("切换到 AI 澄清");
  });

  it("keeps the review boundary visible", () => {
    const html = renderToString(<PatchFeedbackPanel {...baseProps} />);

    expect(html).toContain("先进入复核队列，不会直接改写结论");
  });

  it("has an accessible heading and status region", () => {
    const html = renderToString(<PatchFeedbackPanel {...baseProps} onClarify={unavailable} />);

    expect(html).toContain('id="patch-feedback-heading"');
    expect(html).toContain('aria-labelledby="patch-feedback-heading"');
    expect(html).toContain('role="status"');
  });
});
