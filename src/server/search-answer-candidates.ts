import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";

import { parseZhihuAnswerUrl } from "../lib/zhihu-answer-url";
import {
  fetchSearchItems,
  makeFetchSearchTransport,
  SearchError,
  SearchTransportError,
} from "../lib/zhihu-content-search";

// ═══════════════════════════════════════════════════════════════════════════════
// JSON-safe types
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnswerCandidate {
  readonly questionId: string;
  readonly answerId: string;
  readonly title: string;
  readonly url: string;
  readonly preview: string;
}

export type SearchAnswerCandidatesResponse =
  | {
      readonly status: "ok";
      readonly candidates: readonly AnswerCandidate[];
    }
  | {
      readonly status: "error";
      readonly code: SearchCandidatesFailureCode;
      readonly message: string;
    };

export type SearchCandidatesFailureCode =
  | "INVALID_REQUEST"
  | "MISSING_ACCESS_SECRET"
  | "SEARCH_RATE_LIMITED"
  | "SEARCH_QUOTA_EXCEEDED"
  | "SEARCH_ERROR";

const MESSAGES: Record<SearchCandidatesFailureCode, string> = {
  INVALID_REQUEST: "请输入搜索关键词。",
  MISSING_ACCESS_SECRET: "知乎访问密钥未配置。",
  SEARCH_RATE_LIMITED: "搜索请求频率过高，请稍后再试。",
  SEARCH_QUOTA_EXCEEDED: "搜索配额已用完。",
  SEARCH_ERROR: "搜索失败，请稍后再试。",
};

const safeErrorResponse = (code: SearchCandidatesFailureCode): SearchAnswerCandidatesResponse => ({
  status: "error",
  code,
  message: MESSAGES[code],
});

// ═══════════════════════════════════════════════════════════════════════════════
// Handler factory (testable — receives injected dependencies)
// ═══════════════════════════════════════════════════════════════════════════════

export interface SearchAnswerCandidatesInput {
  readonly query: string;
}

const MAX_CANDIDATES = 5;

function extractCandidates(items: readonly unknown[]): AnswerCandidate[] {
  const seen = new Set<string>();
  const candidates: AnswerCandidate[] = [];

  for (const item of items) {
    if (candidates.length >= MAX_CANDIDATES) break;
    if (typeof item !== "object" || item === null) continue;

    const record = item as Record<string, unknown>;
    const rawUrl = typeof record.Url === "string" ? record.Url : undefined;
    if (!rawUrl) continue;

    const parsed = parseZhihuAnswerUrl(rawUrl);
    if (parsed._tag !== "success") continue;
    if (seen.has(parsed.answerId)) continue;
    seen.add(parsed.answerId);

    candidates.push({
      questionId: parsed.questionId,
      answerId: parsed.answerId,
      title: typeof record.Title === "string" ? record.Title.trim() : "",
      url: parsed.canonicalUrl,
      preview: typeof record.ContentText === "string" ? record.ContentText.slice(0, 200) : "",
    });
  }

  return candidates;
}

export interface SearchAnswerCandidatesDeps {
  readonly getSecret: () => string | undefined;
}

export const createSearchAnswerCandidatesHandler =
  (deps: SearchAnswerCandidatesDeps) =>
  async (input: SearchAnswerCandidatesInput): Promise<SearchAnswerCandidatesResponse> => {
    if (typeof input?.query !== "string" || input.query.trim() === "") {
      return safeErrorResponse("INVALID_REQUEST");
    }

    const secret = deps.getSecret();
    if (typeof secret !== "string" || secret.trim() === "") {
      return safeErrorResponse("MISSING_ACCESS_SECRET");
    }

    const transport = makeFetchSearchTransport({ timeoutMs: 10_000 });

    const exit = await Effect.runPromiseExit(
      fetchSearchItems({
        provider: "zhihu_search",
        query: input.query.trim(),
        accessSecret: secret,
        transport,
      }),
    );

    if (exit._tag === "Success") {
      return { status: "ok", candidates: extractCandidates(exit.value) };
    }

    const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
    if (error instanceof SearchError) {
      if (error.reason === "API_RATE_LIMITED") return safeErrorResponse("SEARCH_RATE_LIMITED");
      if (error.reason === "API_QUOTA_EXCEEDED") return safeErrorResponse("SEARCH_QUOTA_EXCEEDED");
    }
    if (error instanceof SearchTransportError && error.reason === "HTTP_STATUS") {
      if (error.status === 429) return safeErrorResponse("SEARCH_RATE_LIMITED");
    }

    return safeErrorResponse("SEARCH_ERROR");
  };

// ═══════════════════════════════════════════════════════════════════════════════
// Production wiring (reads process.env only here)
// ═══════════════════════════════════════════════════════════════════════════════

const parseInput = (input: unknown): SearchAnswerCandidatesInput => {
  if (typeof input !== "object" || input === null || !("query" in input)) {
    return { query: "" };
  }
  const value = (input as { query: unknown }).query;
  return { query: typeof value === "string" ? value : "" };
};

export const searchAnswerCandidates = createServerFn({
  method: "POST",
})
  .validator(parseInput)
  .handler(async ({ data }) => {
    return createSearchAnswerCandidatesHandler({
      getSecret: () => process.env["ZHIHU_ACCESS_SECRET"],
    })(data);
  });
