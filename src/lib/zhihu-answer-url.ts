export type ZhihuAnswerUrlFailureReason =
  | "UNKNOWN_URL"
  | "UNSUPPORTED_PROTOCOL"
  | "UNSUPPORTED_HOST"
  | "UNSUPPORTED_PATH"
  | "INVALID_QUESTION_ID"
  | "INVALID_ANSWER_ID";

export interface ZhihuAnswerUrlSuccess {
  readonly _tag: "success";
  readonly questionId: string;
  readonly answerId: string;
  readonly canonicalUrl: string;
}

export interface ZhihuAnswerUrlFailure {
  readonly _tag: "failure";
  readonly reason: ZhihuAnswerUrlFailureReason;
}

export type ZhihuAnswerUrlResult = ZhihuAnswerUrlSuccess | ZhihuAnswerUrlFailure;

const SUPPORTED_HOSTS = new Set(["zhihu.com", "www.zhihu.com"]);

const failure = (reason: ZhihuAnswerUrlFailureReason): ZhihuAnswerUrlFailure => ({
  _tag: "failure",
  reason,
});

const isNumericId = (value: string): boolean => /^\d+$/.test(value);

export const parseZhihuAnswerUrl = (input: string): ZhihuAnswerUrlResult => {
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
    return failure("UNSUPPORTED_HOST");
  }

  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  if (segments.length !== 4 || segments[0] !== "question" || segments[2] !== "answer") {
    return failure("UNSUPPORTED_PATH");
  }

  const questionId = segments[1];
  const answerId = segments[3];
  if (!isNumericId(questionId)) {
    return failure("INVALID_QUESTION_ID");
  }
  if (!isNumericId(answerId)) {
    return failure("INVALID_ANSWER_ID");
  }

  return {
    _tag: "success",
    questionId,
    answerId,
    canonicalUrl: `https://www.zhihu.com/question/${questionId}/answer/${answerId}`,
  };
};
