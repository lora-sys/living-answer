import { describe, expect, it } from "vite-plus/test";

import { parseZhihuAnswerUrl } from "./zhihu-answer-url";

describe("parseZhihuAnswerUrl", () => {
  it("parses supported answer URLs", () => {
    const result = parseZhihuAnswerUrl("https://www.zhihu.com/question/123/answer/456");

    expect(result).toEqual({
      _tag: "success",
      questionId: "123",
      answerId: "456",
      canonicalUrl: "https://www.zhihu.com/question/123/answer/456",
    });
  });

  it("accepts the host without www and normalizes it", () => {
    const result = parseZhihuAnswerUrl("https://zhihu.com/question/123/answer/456");

    expect(result).toMatchObject({
      questionId: "123",
      answerId: "456",
      canonicalUrl: "https://www.zhihu.com/question/123/answer/456",
    });
  });

  it("accepts http input but returns an https canonical URL", () => {
    const result = parseZhihuAnswerUrl("http://www.zhihu.com/question/123/answer/456");

    expect(result).toMatchObject({
      canonicalUrl: "https://www.zhihu.com/question/123/answer/456",
    });
  });

  it("accepts a trailing slash and ignores query and fragment", () => {
    const result = parseZhihuAnswerUrl(
      "https://www.zhihu.com/question/123/answer/456/?utm_source=test#excerpt",
    );

    expect(result).toEqual({
      _tag: "success",
      questionId: "123",
      answerId: "456",
      canonicalUrl: "https://www.zhihu.com/question/123/answer/456",
    });
  });

  it("rejects malformed URLs without echoing them", () => {
    const result = parseZhihuAnswerUrl("https://www.zhihu.com");

    expect(result).toEqual({
      _tag: "failure",
      reason: "UNSUPPORTED_PATH",
    });
  });

  it("rejects question-only URLs", () => {
    const result = parseZhihuAnswerUrl("https://www.zhihu.com/question/123");

    expect(result).toEqual({
      _tag: "failure",
      reason: "UNSUPPORTED_PATH",
    });
  });

  it("rejects unsupported hosts", () => {
    const result = parseZhihuAnswerUrl("https://example.com/question/123/answer/456");

    expect(result).toEqual({
      _tag: "failure",
      reason: "UNSUPPORTED_HOST",
    });
  });

  it("rejects zhuanlan URLs", () => {
    const result = parseZhihuAnswerUrl("https://zhuanlan.zhihu.com/question/123/answer/456");

    expect(result).toEqual({
      _tag: "failure",
      reason: "UNSUPPORTED_HOST",
    });
  });

  it("rejects appview URLs", () => {
    const result = parseZhihuAnswerUrl("https://www.zhihu.com/appview/question/123/answer/456");

    expect(result).toEqual({
      _tag: "failure",
      reason: "UNSUPPORTED_PATH",
    });
  });

  it("rejects extra path segments", () => {
    const result = parseZhihuAnswerUrl("https://www.zhihu.com/question/123/answer/456/comments");

    expect(result).toEqual({
      _tag: "failure",
      reason: "UNSUPPORTED_PATH",
    });
  });

  it("rejects non-numeric question IDs", () => {
    const result = parseZhihuAnswerUrl("https://www.zhihu.com/question/abc/answer/456");

    expect(result).toEqual({
      _tag: "failure",
      reason: "INVALID_QUESTION_ID",
    });
  });

  it("rejects non-numeric answer IDs", () => {
    const result = parseZhihuAnswerUrl("https://www.zhihu.com/question/123/answer/abc");

    expect(result).toEqual({
      _tag: "failure",
      reason: "INVALID_ANSWER_ID",
    });
  });

  it("rejects unsupported protocols", () => {
    const result = parseZhihuAnswerUrl("javascript:https://www.zhihu.com/question/123/answer/456");

    expect(result).toEqual({
      _tag: "failure",
      reason: "UNSUPPORTED_PROTOCOL",
    });
  });
});
