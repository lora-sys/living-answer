import { describe, expect, it } from "vite-plus/test";

import { formatEvidenceLine, truncatePreview } from "./golden-demo-preview";

describe("truncatePreview", () => {
  it("keeps a short excerpt unchanged", () => {
    expect(truncatePreview("ChatGPT 免费版可以上传文件。")).toBe("ChatGPT 免费版可以上传文件。");
  });

  it("truncates a 53-character excerpt and adds an ellipsis", () => {
    const text = "x".repeat(53);
    expect(text).toHaveLength(53);
    expect(truncatePreview(text)).toBe(`${text.slice(0, 52)}…`);
  });

  it("prefers a nearby punctuation boundary over a hard character cut", () => {
    const text =
      "官方 API 文档现在按模型和使用层级描述访问：定价页记录当前模型的按 token 计价，速率限制页记录限额。";
    expect(truncatePreview(text)).toBe(
      "官方 API 文档现在按模型和使用层级描述访问：定价页记录当前模型的按 token 计价，…",
    );
  });
});

describe("formatEvidenceLine", () => {
  it("formats organization, source type, and UTC year-month", () => {
    expect(formatEvidenceLine("React", "官方博客", Date.UTC(2025, 1, 14))).toBe(
      "React · 官方博客 · 2025-02",
    );
  });
});
