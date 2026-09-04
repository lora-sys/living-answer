/**
 * Canonical Zhihu column-article URL parsing.
 *
 * Provider URLs carry `utm_*` tracking params; the canonical form is the
 * path.  The trailing numeric id is what the API calls `ContentID` and what
 * the excerpt store keys on, so stripping the tracking params matters both for
 * deduplication and for the visible source link.
 *
 * @module zhihu-article-url
 */

export type ZhihuArticleUrlFailureReason = "UNKNOWN_URL" | "UNSUPPORTED_PROTOCOL" | "UNSUPPORTED_PATH";

export interface ZhihuArticleUrlSuccess {
  readonly _tag: "success";
  readonly articleId: string;
  readonly canonicalUrl: string;
}

export interface ZhihuArticleUrlFailure {
  readonly _tag: "failure";
  readonly reason: ZhihuArticleUrlFailureReason;
}

export type ZhihuArticleUrlResult = ZhihuArticleUrlSuccess | ZhihuArticleUrlFailure;

const SUPPORTED_HOSTS = new Set(["zhuanlan.zhihu.com", "www.zhuanlan.zhihu.com"]);

const failure = (reason: ZhihuArticleUrlFailureReason): ZhihuArticleUrlFailure => ({
  _tag: "failure",
  reason,
});

export const parseZhihuArticleUrl = (input: string): ZhihuArticleUrlResult => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return failure("UNKNOWN_URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return failure("UNSUPPORTED_PROTOCOL");
  }

  if (!SUPPORTED_HOSTS.has(url.hostname)) {
    return failure("UNSUPPORTED_PATH");
  }

  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  if (segments.length !== 2 || segments[0] !== "p" || !/^\d+$/.test(segments[1] ?? "")) {
    return failure("UNSUPPORTED_PATH");
  }

  return {
    _tag: "success",
    articleId: segments[1] ?? "",
    canonicalUrl: `https://zhuanlan.zhihu.com/p/${segments[1] ?? ""}`,
  };
};
