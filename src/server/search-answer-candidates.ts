import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";

import { parseZhihuAnswerUrl } from "../lib/zhihu-answer-url";
import {
  fetchSearchItems,
  makeFetchSearchTransport,
  SearchError,
  SearchTransportError,
} from "../lib/zhihu-content-search";

import { createAnswerExcerpt } from "../lib/answer-excerpt";
import type { AnswerExcerpt } from "../lib/answer-excerpt";

import { makeSqliteExcerptStore, type ExcerptStore } from "../lib/excerpt-store";
import { StoreError } from "../lib/excerpt-store";

import {
  makeSqlitePatchLifecycleStore,
  type PatchLifecycleStore,
} from "../lib/patch-lifecycle-store";

import { makeSqliteDailyQuotaStore } from "../lib/sqlite-daily-quota-store";

import { makeDailyQuotaGuard, QuotaExceededError, type DailyQuotaGuard } from "../lib/daily-quota";

// ═══════════════════════════════════════════════════════════════════════════════
// JSON-safe types
// ═══════════════════════════════════════════════════════════════════════════════

export interface AnswerCandidate {
  readonly questionId: string;
  readonly answerId: string;
  readonly title: string;
  readonly url: string;
  readonly preview: string;
  readonly authorDisplayName?: string;
  readonly editAt?: number;
  readonly maintenance: {
    readonly status:
      | "VISIBLE"
      | "DISPUTED"
      | "SUPERSEDED"
      | "RESOLVED"
      | "WITHDRAWN"
      | "not_tracked"
      | "unknown";
    readonly evidenceCount?: number;
  };
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
  | "SEARCH_EXCERPT_STORE_FAILURE"
  | "SEARCH_ERROR";

const MESSAGES: Record<SearchCandidatesFailureCode, string> = {
  INVALID_REQUEST: "请输入搜索关键词。",
  MISSING_ACCESS_SECRET: "知乎访问密钥未配置。",
  SEARCH_RATE_LIMITED: "搜索请求频率过高，请稍后再试。",
  SEARCH_QUOTA_EXCEEDED: "搜索配额已用完。",
  SEARCH_EXCERPT_STORE_FAILURE: "摘要存储失败，请稍后再试。",
  SEARCH_ERROR: "搜索失败，请稍后再试。",
};

const safeErrorResponse = (code: SearchCandidatesFailureCode): SearchAnswerCandidatesResponse => ({
  status: "error",
  code,
  message: MESSAGES[code],
});

// ═══════════════════════════════════════════════════════════════════════════════
// Item processing — extract candidate display fields and build AnswerExcerpts
// ═══════════════════════════════════════════════════════════════════════════════

interface SearchProcessingResult {
  readonly candidates: readonly Omit<AnswerCandidate, "maintenance">[];
  readonly excerpts: AnswerExcerpt[];
}

function processSearchItems(items: readonly unknown[], now: number): SearchProcessingResult {
  const seen = new Set<string>();
  const candidates: Omit<AnswerCandidate, "maintenance">[] = [];
  const excerpts: AnswerExcerpt[] = [];

  for (const item of items) {
    if (candidates.length >= MAX_CANDIDATES) break;
    if (typeof item !== "object" || item === null) continue;

    const record = item as Record<string, unknown>;
    if (record.ContentType !== "Answer") continue;

    const rawUrl = typeof record.Url === "string" ? record.Url : undefined;
    if (!rawUrl) continue;

    const parsed = parseZhihuAnswerUrl(rawUrl);
    if (parsed._tag !== "success") continue;
    if (seen.has(parsed.answerId)) continue;
    seen.add(parsed.answerId);

    // Validate excerpt fields (mirrors AnswerExcerptProvider.selectMatch checks).
    // Malformed items are silently skipped — not converted into invalid excerpts.
    const contentId = record.ContentID;
    const editTime = record.EditTime;
    const contentText =
      typeof record.ContentText === "string" && record.ContentText.trim() !== ""
        ? record.ContentText
        : undefined;

    const isValidForExcerpt =
      typeof contentId === "string" &&
      /^(?:0|-?[1-9][0-9]*)$/.test(contentId) &&
      typeof editTime === "number" &&
      Number.isSafeInteger(editTime) &&
      editTime >= 0 &&
      contentText !== undefined;

    let excerpt: AnswerExcerpt | undefined;
    if (isValidForExcerpt) {
      const result = createAnswerExcerpt({
        questionId: parsed.questionId,
        answerId: parsed.answerId,
        capturedAt: now,
        sourceContentId: contentId,
        sourceContentType: "Answer",
        sourceEditTime: editTime,
        excerpt: contentText, // createAnswerExcerpt normalizes and strips <em>
      });

      excerpt = result._tag === "success" ? result.excerpt : undefined;
    }

    if (!excerpt) continue;

    excerpts.push(excerpt);
    candidates.push({
      questionId: parsed.questionId,
      answerId: parsed.answerId,
      title: typeof record.Title === "string" ? record.Title.trim() : "",
      url: parsed.canonicalUrl,
      preview: excerpt.excerpt.slice(0, 200),
      authorDisplayName:
        typeof record.AuthorName === "string" && record.AuthorName.trim() !== ""
          ? record.AuthorName.trim()
          : undefined,
      editAt:
        typeof record.EditTime === "number" &&
        Number.isSafeInteger(record.EditTime) &&
        record.EditTime >= 0
          ? record.EditTime
          : undefined,
    });
  }

  return { candidates, excerpts };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Handler factory (testable — receives injected dependencies)
// ═══════════════════════════════════════════════════════════════════════════════

export interface SearchAnswerCandidatesInput {
  readonly query: string;
}

const MAX_CANDIDATES = 5;

export interface SearchAnswerCandidatesDeps {
  readonly getSecret: () => string | undefined;
  /** Create a fresh excerpt store. */
  readonly createStore: () => Promise<ExcerptStore>;
  /** Create a daily quota guard. */
  readonly createQuotaGuard: () => Promise<DailyQuotaGuard>;
  /** Create a fresh lifecycle store. */
  readonly createLifecycleStore: () => Promise<PatchLifecycleStore>;
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

    const query = input.query.trim();
    const store = await deps.createStore();
    const quotaGuard = await deps.createQuotaGuard();
    const lifecycleStore = await deps.createLifecycleStore();

    const transport = makeFetchSearchTransport({ timeoutMs: 10_000 });

    // Consume one quota unit before dispatching the network request.  Quota
    // failures are mapped to SearchError reasons so the existing error branch
    // below handles them uniformly.
    const exit = await Effect.runPromiseExit(
      quotaGuard.consume("zhihu_search").pipe(
        Effect.mapError((error): SearchError => {
          if (error instanceof QuotaExceededError) {
            return new SearchError({ reason: "API_QUOTA_EXCEEDED" });
          }
          // Store-level quota errors are surfaced as a generic search failure.
          return new SearchError({ reason: "NON_ZERO_CODE" });
        }),
        Effect.flatMap(() =>
          fetchSearchItems({
            provider: "zhihu_search",
            query,
            accessSecret: secret,
            transport,
          }),
        ),
      ),
    );

    if (exit._tag !== "Success") {
      const searchError = exit.cause._tag === "Fail" ? exit.cause.error : null;
      if (searchError instanceof SearchError) {
        if (searchError.reason === "API_RATE_LIMITED")
          return safeErrorResponse("SEARCH_RATE_LIMITED");
        if (searchError.reason === "API_QUOTA_EXCEEDED")
          return safeErrorResponse("SEARCH_QUOTA_EXCEEDED");
      }
      if (searchError instanceof SearchTransportError && searchError.reason === "HTTP_STATUS") {
        if (searchError.status === 429) return safeErrorResponse("SEARCH_RATE_LIMITED");
      }
      return safeErrorResponse("SEARCH_ERROR");
    }

    const now = Date.now();
    const { candidates, excerpts } = processSearchItems(exit.value, now);

    // Persist each valid excerpt.  Store failures are collected explicitly —
    // they must not be silently swallowed or mapped to a successful search.
    const storeErrors: StoreError[] = [];
    for (const excerpt of excerpts) {
      const saveExit = await Effect.runPromiseExit(store.save(excerpt));
      if (saveExit._tag === "Failure" && saveExit.cause._tag === "Fail") {
        const err =
          saveExit.cause.error instanceof StoreError
            ? saveExit.cause.error
            : new StoreError({ reason: "save failed" });
        storeErrors.push(err);
      }
    }

    // A candidate is only useful when its reused excerpt is durable.  Do not
    // invite the user into a selection that will miss its excerpt later.
    if (storeErrors.length > 0) {
      return safeErrorResponse("SEARCH_EXCERPT_STORE_FAILURE");
    }

    // Look up local lifecycle status for each persisted excerpt.  Lookup
    // failures are tolerated — a search candidate is never hidden because the
    // lifecycle store failed.
    const lifecycleErrorIndices = new Set<number>();

    const lifecycleResults = await Effect.runPromise(
      Effect.all(
        candidates.map((candidate, index) =>
          lifecycleStore.findHistoryByAnswer(candidate.questionId, candidate.answerId).pipe(
            Effect.catchAll(() => {
              lifecycleErrorIndices.add(index);
              return Effect.succeed([]);
            }),
          ),
        ),
      ),
    );

    const enrichedCandidates: AnswerCandidate[] = candidates.map((candidate, index) => {
      const lifecycle = lifecycleResults[index]?.[0];

      if (lifecycle && lifecycle.status) {
        return {
          ...candidate,
          maintenance: {
            status: lifecycle.status,
            evidenceCount: lifecycle.selectedEvidenceFingerprints.length,
          },
        };
      }

      if (lifecycleErrorIndices.has(index)) {
        return { ...candidate, maintenance: { status: "unknown" } };
      }

      return { ...candidate, maintenance: { status: "not_tracked" } };
    });

    return { status: "ok", candidates: enrichedCandidates };
  };

// ═══════════════════════════════════════════════════════════════════════════════
// Production wiring (reads process.env only here)
// ═══════════════════════════════════════════════════════════════════════════════

const DAILY_QUOTA_LIMIT_PER_DAY = 1000;

let storeInstance: Promise<ExcerptStore> | null = null;
let quotaGuardInstance: Promise<DailyQuotaGuard> | null = null;
let lifecycleStoreInstance: Promise<PatchLifecycleStore> | null = null;

const getOrCreateStore = async (): Promise<ExcerptStore> => {
  if (!storeInstance) {
    storeInstance = Effect.runPromise(makeSqliteExcerptStore());
  }
  return storeInstance;
};

const getOrCreateQuotaGuard = async (): Promise<DailyQuotaGuard> => {
  if (!quotaGuardInstance) {
    quotaGuardInstance = Effect.runPromise(
      Effect.map(makeSqliteDailyQuotaStore(".local/provider-quota.db"), (store) =>
        makeDailyQuotaGuard({ store, limitPerDay: DAILY_QUOTA_LIMIT_PER_DAY }),
      ),
    );
  }
  return quotaGuardInstance;
};

const getOrCreateLifecycleStore = async (): Promise<PatchLifecycleStore> => {
  if (!lifecycleStoreInstance) {
    lifecycleStoreInstance = Effect.runPromise(makeSqlitePatchLifecycleStore());
  }
  return lifecycleStoreInstance;
};

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
      createStore: getOrCreateStore,
      createQuotaGuard: getOrCreateQuotaGuard,
      createLifecycleStore: getOrCreateLifecycleStore,
    })(data);
  });
