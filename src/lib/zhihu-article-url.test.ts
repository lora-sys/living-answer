import { describe, expect, it } from "vite-plus/test";

import { parseZhihuArticleUrl } from "./zhihu-article-url";

describe("parseZhihuArticleUrl", () => {
  it("canonicalises a provider URL with tracking params", () => {
    const result = parseZhihuArticleUrl(
      "https://zhuanlan.zhihu.com/p/2075564972172694052?utm_medium=openapi_platform&utm_source=cf621feb3f2d",
    );
    expect(result._tag).toBe("success");
    if (result._tag === "success") {
      expect(result.articleId).toBe("2075564972172694052");
      expect(result.canonicalUrl).toBe("https://zhuanlan.zhihu.com/p/2075564972172694052");
    }
  });

  it("rejects an answer URL and a non-article host", () => {
    expect(parseZhihuArticleUrl("https://www.zhihu.com/question/1/answer/2")._tag).toBe("failure");
    expect(parseZhihuArticleUrl("https://example.com/p/42")._tag).toBe("failure");
  });

  it("rejects a path that is not /p/<digits>", () => {
    expect(parseZhihuArticleUrl("https://zhuanlan.zhihu.com/p/abc")._tag).toBe("failure");
    expect(parseZhihuArticleUrl("https://zhuanlan.zhihu.com/p/42/extra")._tag).toBe("failure");
  });
});
