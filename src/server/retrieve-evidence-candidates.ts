import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";

import type { AnswerClaim } from "../lib/answer-claim";
import { makeDailyQuotaGuard, QuotaExceededError, type DailyQuotaGuard } from "../lib/daily-quota";
import type { EvidenceCandidate, Provider } from "../lib/evidence-candidate";
import {
  makeSqliteEvidenceCandidateStore,
  type EvidenceCandidateStore,
} from "../lib/evidence-candidate-store";
import {
  ProviderFetchError,
  EvidenceRetrievalError,
  retrieveEvidenceCandidates,
  type ClaimRetrievalResult,
  type ProviderFetcher,
  type SuccessfulRetrievalResult,
} from "../lib/evidence-retrieval-workflow";
import { makeSqliteDailyQuotaStore } from "../lib/sqlite-daily-quota-store";
import {
  fetchSearchItems,
  makeFetchSearchTransport,
  SearchError,
  SearchTransportError,
} from "../lib/zhihu-content-search";

// ═══════════════════════════════════════════════════════════════════════════════
// JSON-safe types
// ═══════════════════════════════════════════════════════════════════════════════

export interface JsonSafeCandidate {
  readonly claimFingerprint: string;
  readonly provider: string;
  readonly sourceKind: string;
  readonly authorityHint: string;
  readonly sourceContentId: string;
  readonly sourceContentType: string;
  readonly sourceLabel: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly contentPreview: string;
  readonly publishedAt?: number;
  readonly capturedAt: number;
  readonly sourceAccessState: string;
  readonly candidateFingerprint: string;
}

export interface JsonSafeClaimRetrieval {
  readonly claimFingerprint: string;
  readonly searchQuery: string;
  readonly zhihuState: string;
  readonly globalSearchState: string;
  readonly candidates: readonly JsonSafeCandidate[];
}

export type RetrieveEvidenceResponse =
  | {
      readonly status: "ok";
      readonly isPartial: boolean;
      readonly partialState: string;
      readonly claims: readonly JsonSafeClaimRetrieval[];
    }
  | {
      readonly status: "error";
      readonly code: RetrieveEvidenceFailureCode;
      readonly message: string;
    };

export type RetrieveEvidenceFailureCode =
  | "MISSING_CREDENTIAL"
  | "INVALID_CLAIMS"
  | "EVIDENCE_STORE_ERROR"
  | "RETRIEVAL_ERROR";

// ═══════════════════════════════════════════════════════════════════════════════
// Input
// ═══════════════════════════════════════════════════════════════════════════════

export interface RetrieveEvidenceInput {
  readonly claims: ReadonlyArray<{
    readonly claimFingerprint: string;
    readonly claimText: string;
    readonly excerptFingerprint: string;
  }>;
}

const validateInput = (input: unknown): RetrieveEvidenceInput => {
  if (typeof input !== "object" || input === null || !("claims" in input)) {
    return { claims: [] };
  }
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.claims)) {
    return { claims: [] };
  }
  const claims = raw.claims
    .filter(
      (c): c is Record<string, unknown> =>
        typeof c === "object" && c !== null && "claimFingerprint" in c && "claimText" in c,
    )
    .map((c) => ({
      claimFingerprint: typeof c.claimFingerprint === "string" ? c.claimFingerprint : "",
      claimText: typeof c.claimText === "string" ? c.claimText : "",
      excerptFingerprint:
        typeof (c as Record<string, unknown>).excerptFingerprint === "string"
          ? ((c as Record<string, unknown>).excerptFingerprint as string)
          : "",
    }));
  return { claims };
};

// ═══════════════════════════════════════════════════════════════════════════════
// Provider fetcher adapter
// ═══════════════════════════════════════════════════════════════════════════════

const FIVE_SECONDS_MS = 5000;

const DAILY_QUOTA_LIMIT_PER_DAY = 1000;

const safeErrorResponse = (
  code: RetrieveEvidenceFailureCode,
  message: string,
): RetrieveEvidenceResponse => ({ status: "error", code, message });

const allowAllQuotaGuard: DailyQuotaGuard = {
  consume: () => Effect.void,
};

const mapFetchError = (provider: Provider, error: unknown): ProviderFetchError => {
  if (error instanceof SearchTransportError) {
    if (error.reason === "HTTP_STATUS" && error.status === 429) {
      return new ProviderFetchError({ provider, reason: "RATE_LIMITED" });
    }
    return new ProviderFetchError({ provider, reason: "FETCH_FAILED" });
  }
  if (error instanceof SearchError) {
    if (error.reason === "API_RATE_LIMITED") {
      return new ProviderFetchError({ provider, reason: "RATE_LIMITED" });
    }
    if (error.reason === "API_QUOTA_EXCEEDED") {
      return new ProviderFetchError({ provider, reason: "QUOTA_EXCEEDED" });
    }
    if (error.reason === "NON_ZERO_CODE") {
      return new ProviderFetchError({ provider, reason: "FETCH_FAILED" });
    }
    return new ProviderFetchError({ provider, reason: "MALFORMED_RESPONSE" });
  }
  return new ProviderFetchError({ provider, reason: "FETCH_FAILED" });
};

const makeProviderFetcher =
  (
    accessSecret: string,
    quotaGuard: DailyQuotaGuard,
  ): ((
    provider: Provider,
  ) => (options: {
    claimFingerprint: string;
    provider: Provider;
    query: string;
  }) => Effect.Effect<readonly unknown[], ProviderFetchError>) =>
  (provider) =>
  (options) =>
    quotaGuard.consume(provider).pipe(
      Effect.mapError((error) =>
        error instanceof QuotaExceededError
          ? new ProviderFetchError({ provider, reason: "QUOTA_EXCEEDED" })
          : new ProviderFetchError({ provider, reason: "FETCH_FAILED" }),
      ),
      Effect.flatMap(() =>
        fetchSearchItems({
          provider: options.provider,
          query: options.query,
          accessSecret,
          transport: makeFetchSearchTransport({ fetch, timeoutMs: FIVE_SECONDS_MS }),
        }).pipe(Effect.mapError((error) => mapFetchError(provider, error))),
      ),
    );

// ═══════════════════════════════════════════════════════════════════════════════
// JSON-safe mapping
// ═══════════════════════════════════════════════════════════════════════════════

const toSafeCandidate = (c: EvidenceCandidate): JsonSafeCandidate => ({
  claimFingerprint: c.claimFingerprint,
  provider: c.provider,
  sourceKind: c.sourceKind,
  authorityHint: c.authorityHint,
  sourceContentId: c.sourceContentId,
  sourceContentType: c.sourceContentType,
  sourceLabel: c.sourceLabel,
  title: c.title,
  sourceUrl: c.sourceUrl,
  contentPreview: c.contentPreview,
  ...(c.publishedAt !== undefined ? { publishedAt: c.publishedAt } : {}),
  capturedAt: c.capturedAt,
  sourceAccessState: c.sourceAccessState,
  candidateFingerprint: c.candidateFingerprint,
});

const toSafeClaimRetrieval = (r: ClaimRetrievalResult): JsonSafeClaimRetrieval => ({
  claimFingerprint: r.claimFingerprint,
  searchQuery: r.searchQuery,
  zhihuState: r.zhihu.state,
  globalSearchState: r.globalSearch.state,
  candidates: [...r.zhihu.candidates, ...r.globalSearch.candidates].map(toSafeCandidate),
});

const toSafeResult = (result: SuccessfulRetrievalResult): RetrieveEvidenceResponse => ({
  status: "ok",
  isPartial: result.isPartial,
  partialState: result.partialState,
  claims: result.claims.map(toSafeClaimRetrieval),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Handler factory (testable)
// ═══════════════════════════════════════════════════════════════════════════════

export interface RetrieveEvidenceDeps {
  readonly getSecret: () => string | undefined;
  readonly createStore: () => Promise<EvidenceCandidateStore>;
  readonly createProviderFetchers?: () => {
    readonly zhihuFetcher: ProviderFetcher;
    readonly globalFetcher: ProviderFetcher;
  };
  readonly createQuotaGuard?: () => Promise<DailyQuotaGuard>;
}

export const createRetrieveEvidenceHandler =
  (deps: RetrieveEvidenceDeps) =>
  async (input: RetrieveEvidenceInput): Promise<RetrieveEvidenceResponse> => {
    const secret = deps.getSecret();
    if (!secret || secret.trim() === "") {
      return safeErrorResponse("MISSING_CREDENTIAL", "服务暂时不可用，请稍后再试。");
    }

    if (input.claims.length === 0 || input.claims.length > 3) {
      return safeErrorResponse("INVALID_CLAIMS", "候选前提无效，请重新分析回答。");
    }

    const answerClaims: AnswerClaim[] = input.claims.map((c) => ({
      questionId: "0",
      answerId: "0",
      sourceContentId: "0",
      sourceContentType: "Answer" as const,
      sourceEditTime: 0,
      excerptFingerprint: c.excerptFingerprint,
      excerpt: c.claimText,
      claimText: c.claimText,
      anchorText: c.claimText,
      volatility: "medium" as const,
      decisionRelevance: "medium" as const,
      candidateReason: "",
      extractedAt: Date.now(),
      claimFingerprint: c.claimFingerprint,
      status: "candidate" as const,
    }));

    try {
      const store = await deps.createStore();
      const quotaGuard = deps.createQuotaGuard ? await deps.createQuotaGuard() : allowAllQuotaGuard;
      const defaultFetchers = () => ({
        zhihuFetcher: makeProviderFetcher(secret, quotaGuard)("zhihu_search"),
        globalFetcher: makeProviderFetcher(secret, quotaGuard)("global_search"),
      });
      const { zhihuFetcher, globalFetcher } = deps.createProviderFetchers?.() ?? defaultFetchers();

      const workflow = retrieveEvidenceCandidates({
        store: {
          findCandidatesByClaimFingerprint: (fp: string) =>
            Effect.mapError(
              Effect.map(
                store.findCandidatesByClaimFingerprint(fp),
                (records): readonly EvidenceCandidate[] =>
                  records.map((r) => ({
                    claimFingerprint: r.claimFingerprint,
                    retrievalEventFingerprint: r.retrievalEventFingerprint,
                    provider: r.provider as EvidenceCandidate["provider"],
                    searchQuery: "",
                    sourceContentId: r.sourceContentId,
                    sourceContentType: r.sourceContentType,
                    sourceKind: r.sourceKind as EvidenceCandidate["sourceKind"],
                    authorityHint: r.authorityHint as EvidenceCandidate["authorityHint"],
                    sourceLabel: r.sourceLabel,
                    title: r.title,
                    sourceUrl: r.sourceUrl,
                    contentPreview: r.contentPreview,
                    ...(r.publishedAt !== undefined ? { publishedAt: r.publishedAt } : {}),
                    capturedAt: r.capturedAt,
                    sourceAccessState:
                      r.sourceAccessState as EvidenceCandidate["sourceAccessState"],
                    candidateFingerprint: r.candidateFingerprint,
                    status: "candidate" as const,
                  })),
              ),
              (): EvidenceRetrievalError =>
                new EvidenceRetrievalError({ reason: "STORE_LOOKUP_FAILED" }),
            ),
        },
        zhihuFetcher,
        globalFetcher,
        clock: { now: () => Effect.succeed(Date.now()) },
        attemptTimeoutMs: FIVE_SECONDS_MS,
        retryDelayMs: 1000,
      });

      const workflowExit = await Effect.runPromiseExit(workflow({ claims: answerClaims }));
      if (workflowExit._tag === "Failure") {
        if (workflowExit.cause._tag === "Fail") {
          const error = workflowExit.cause.error;
          if (error instanceof EvidenceRetrievalError && error.reason === "INVALID_CLAIMS_INPUT") {
            return safeErrorResponse("INVALID_CLAIMS", "候选前提无效，请重新分析回答。");
          }
        }

        return safeErrorResponse("EVIDENCE_STORE_ERROR", "证据记录暂不可用，请稍后再试。");
      }

      const result = workflowExit.value;

      // Persist retrieval events and candidates
      for (const claimResult of result.claims) {
        const candidates = [
          ...claimResult.zhihu.candidates,
          ...claimResult.globalSearch.candidates,
        ];

        // Group candidates by retrievalEventFingerprint; each group is one retrieval event.
        const byEvent = new Map<string, EvidenceCandidate[]>();
        for (const c of candidates) {
          const group = byEvent.get(c.retrievalEventFingerprint);
          if (group) {
            group.push(c);
          } else {
            byEvent.set(c.retrievalEventFingerprint, [c]);
          }
        }

        const excerptFp =
          input.claims.find((c) => c.claimFingerprint === claimResult.claimFingerprint)
            ?.excerptFingerprint ?? "";

        for (const [eventFingerprint, group] of byEvent) {
          const first = group[0]!;
          const persistExit = await Effect.runPromiseExit(
            Effect.flatMap(
              store.saveRetrieval(
                excerptFp,
                claimResult.claimFingerprint,
                eventFingerprint,
                first.provider,
                claimResult.searchQuery,
                Math.floor(Date.now() / 1000),
              ),
              () => store.saveCandidates(eventFingerprint, group),
            ),
          );
          if (persistExit._tag === "Failure") {
            return safeErrorResponse("EVIDENCE_STORE_ERROR", "证据记录暂不可用，请稍后再试。");
          }
        }
      }

      return toSafeResult(result);
    } catch {
      return safeErrorResponse("RETRIEVAL_ERROR", "检索候选证据时出现异常，请稍后再试。");
    }
  };

// ═══════════════════════════════════════════════════════════════════════════════
// Server function
// ═══════════════════════════════════════════════════════════════════════════════

let quotaGuardInstance: Promise<DailyQuotaGuard> | null = null;

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

export const retrieveEvidenceCandidatesFn = createServerFn({
  method: "POST",
})
  .validator(validateInput)
  .handler(async ({ data }): Promise<RetrieveEvidenceResponse> => {
    return createRetrieveEvidenceHandler({
      getSecret: () => process.env.ZHIHU_ACCESS_SECRET,
      createStore: () =>
        Effect.runPromise(makeSqliteEvidenceCandidateStore(".local/evidence-candidates.db")),
      createQuotaGuard: getOrCreateQuotaGuard,
    })(data);
  });
