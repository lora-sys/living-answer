/**
 * Claim-anchored evidence candidate retrieval workflow.
 *
 * The workflow turns a bounded claim set into pre-gate candidates. It stays
 * independent of UI, persistence, and provider SDK details so Slice 4 can use
 * the immutable candidates directly.
 *
 * @module evidence-retrieval-workflow
 */

import { Data, Effect, Ref } from "effect";

import type { AnswerClaim } from "./answer-claim";
import { fnv1a64 } from "./answer-excerpt";
import { createEvidenceCandidate } from "./evidence-candidate";
import type { EvidenceCandidate, Provider } from "./evidence-candidate";
import type { QueryCache } from "./query-cache";

// ── Errors ────────────────────────────────────────────────────────────────────

export type EvidenceRetrievalErrorReason = "INVALID_CLAIMS_INPUT" | "STORE_LOOKUP_FAILED";

export class EvidenceRetrievalError extends Data.TaggedError("EvidenceRetrievalError")<{
  readonly reason: EvidenceRetrievalErrorReason;
  readonly claimFingerprint?: string;
}> {}

export type ProviderFetchFailureReason = "RATE_LIMITED" | "FETCH_FAILED" | "MALFORMED_RESPONSE";

/**
 * A normalized provider failure. A concrete adapter maps provider Code=30001,
 * HTTP 429, and other source errors into this boundary before the workflow.
 */
export class ProviderFetchError extends Data.TaggedError("ProviderFetchError")<{
  readonly provider: Provider;
  readonly reason: ProviderFetchFailureReason;
}> {}

// ── Dependencies ──────────────────────────────────────────────────────────────

export interface EvidenceCandidateStore {
  findCandidatesByClaimFingerprint(
    claimFingerprint: string,
  ): Effect.Effect<readonly EvidenceCandidate[], EvidenceRetrievalError>;
}

export interface ProviderFetchOptions {
  readonly claimFingerprint: string;
  readonly provider: Provider;
  readonly query: string;
}

export type ProviderFetcher = (
  options: ProviderFetchOptions,
) => Effect.Effect<readonly unknown[], ProviderFetchError>;

export interface EvidenceRetrievalCacheKey {
  readonly claimFingerprint: string;
  readonly provider: Provider;
  readonly query: string;
}

export interface EvidenceRetrievalWorkflowDeps {
  readonly store: EvidenceCandidateStore;
  readonly zhihuFetcher: ProviderFetcher;
  readonly globalFetcher: ProviderFetcher;
  readonly clock: {
    readonly now: () => Effect.Effect<number, never>;
  };
  readonly queryCache?: QueryCache<EvidenceRetrievalCacheKey, readonly unknown[]>;
  readonly attemptTimeoutMs?: number;
  readonly retryDelayMs?: number;
}

// ── Result types ──────────────────────────────────────────────────────────────

export type RetrievalAttemptState = "complete" | "rate_limited" | "failed";

export interface ProviderRetrievalResult {
  readonly state: RetrievalAttemptState;
  readonly errorReason?: ProviderFetchFailureReason;
  readonly candidates: readonly EvidenceCandidate[];
  readonly droppedCount: number;
  readonly existingCount: number;
}

export interface ClaimRetrievalResult {
  readonly claimFingerprint: string;
  readonly searchQuery: string;
  readonly zhihu: ProviderRetrievalResult;
  readonly globalSearch: ProviderRetrievalResult;
}

export interface SuccessfulRetrievalResult {
  readonly _tag: "success";
  readonly isPartial: boolean;
  readonly partialState: "none" | "rate_limited" | "failed";
  readonly claims: readonly ClaimRetrievalResult[];
}

export type EvidenceRetrievalResult = SuccessfulRetrievalResult;

// ── Fingerprints ──────────────────────────────────────────────────────────────

const RETRIEVAL_STRATEGY_VERSION = "1";

export interface RetrievalEventFingerprintInput {
  readonly claimFingerprint: string;
  readonly provider: Provider;
  readonly query: string;
}

export const buildRetrievalEventFingerprint = (input: RetrievalEventFingerprintInput): string => {
  const material = [
    "claimFingerprint:" + input.claimFingerprint,
    "provider:" + input.provider,
    "query:" + input.query,
    "eventType:claim_anchored_search",
    "strategyVersion:" + RETRIEVAL_STRATEGY_VERSION,
  ].join("\n");
  const [high, low] = fnv1a64(material);

  return `v1:${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
};

// ── Query and raw-item helpers ────────────────────────────────────────────────

const MAX_CLAIMS = 3;

const normalizeText = (raw: string): string | null => {
  const normalized = raw.normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    if (code < 0x20 && code !== 0x0a) return null;
  }

  return normalized;
};

export const buildSearchQuery = (claimText: string): string => normalizeText(claimText) ?? "";

const parseAuthorityHint = (
  raw: unknown,
): "official" | "project" | "government" | "media" | "unknown" => {
  if (typeof raw !== "string") return "unknown";
  const level = raw.trim();
  if (level === "1") return "official";
  if (level === "2") return "project";
  if (level === "3") return "government";
  if (level === "4") return "media";
  return "unknown";
};

const parsePublishedAt = (raw: unknown): number | undefined => {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0) return undefined;
  const millis = raw * 1000;
  return Number.isSafeInteger(millis) ? millis : undefined;
};

const sourceKindFor = (provider: Provider): "community_lead" | "web_source" =>
  provider === "zhihu_search" ? "community_lead" : "web_source";

interface ParsedBulkItems {
  readonly candidates: readonly EvidenceCandidate[];
  readonly droppedCount: number;
  readonly existingCount: number;
}

const parseCandidate = (
  claimFingerprint: string,
  eventFingerprint: string,
  query: string,
  provider: Provider,
  capturedAt: number,
  rawItem: unknown,
): EvidenceCandidate | null => {
  if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) return null;
  const item = rawItem as Record<string, unknown>;

  const title = typeof item.Title === "string" ? normalizeText(item.Title) : null;
  const sourceContentId = typeof item.ContentID === "string" ? normalizeText(item.ContentID) : null;
  const contentPreview =
    typeof item.ContentText === "string" ? normalizeText(item.ContentText) : null;
  const sourceUrl = typeof item.Url === "string" ? normalizeText(item.Url) : null;
  const rawContentType =
    typeof item.ContentType === "string" ? normalizeText(item.ContentType) : null;

  if (title === null || title === "") return null;
  if (sourceContentId === null || sourceContentId === "") return null;
  if (contentPreview === null || contentPreview === "") return null;
  if (sourceUrl === null || sourceUrl === "") return null;

  // global_search has been observed to return an empty ContentType. The
  // factory requires a label, so preserve the attempt with an explicit value.
  const sourceContentType =
    rawContentType === "" && provider === "global_search" ? "unknown" : rawContentType;
  if (sourceContentType === null || sourceContentType === "") return null;

  const result = createEvidenceCandidate({
    claimFingerprint,
    retrievalEventFingerprint: eventFingerprint,
    provider,
    searchQuery: query,
    sourceContentId,
    sourceContentType,
    sourceKind: sourceKindFor(provider),
    authorityHint: parseAuthorityHint(item.AuthorityLevel),
    sourceLabel: provider === "zhihu_search" ? "Zhihu search" : "Web search",
    title,
    sourceUrl,
    contentPreview,
    publishedAt: parsePublishedAt(item.EditTime),
    capturedAt,
    sourceAccessState: "fetched",
  });

  return result._tag === "success" ? result.candidate : null;
};

const parseBulkItems = (
  claimFingerprint: string,
  eventFingerprint: string,
  query: string,
  provider: Provider,
  capturedAt: number,
  knownFingerprints: ReadonlySet<string>,
  rawItems: readonly unknown[],
): ParsedBulkItems => {
  const seen = new Set(knownFingerprints);
  const candidates: EvidenceCandidate[] = [];
  let droppedCount = 0;
  let existingCount = 0;

  for (const rawItem of rawItems) {
    const candidate = parseCandidate(
      claimFingerprint,
      eventFingerprint,
      query,
      provider,
      capturedAt,
      rawItem,
    );

    if (candidate === null) {
      droppedCount += 1;
      continue;
    }

    if (seen.has(candidate.candidateFingerprint)) {
      existingCount += 1;
      continue;
    }

    candidates.push(candidate);
    seen.add(candidate.candidateFingerprint);
  }

  return { candidates, droppedCount, existingCount };
};

// ── Fetch attempt policy ──────────────────────────────────────────────────────

const emptyProviderResult = (): ProviderRetrievalResult => ({
  state: "complete",
  candidates: [],
  droppedCount: 0,
  existingCount: 0,
});

const providerResult = (
  state: RetrievalAttemptState,
  errorReason: ProviderFetchFailureReason | undefined,
  parsed: ParsedBulkItems,
): ProviderRetrievalResult => ({
  state,
  errorReason,
  candidates: parsed.candidates,
  droppedCount: parsed.droppedCount,
  existingCount: parsed.existingCount,
});

const fetchWithPolicy = (
  fetcher: ProviderFetcher,
  options: ProviderFetchOptions,
  attemptTimeoutMs: number,
  retryDelayMs: number,
): Effect.Effect<readonly unknown[], ProviderFetchError> => {
  const attemptOnce = (): Effect.Effect<readonly unknown[], ProviderFetchError> =>
    fetcher(options).pipe(
      Effect.timeoutFail({
        duration: attemptTimeoutMs,
        onTimeout: () =>
          new ProviderFetchError({ provider: options.provider, reason: "FETCH_FAILED" }),
      }),
    );

  const attempt = (remaining: number): Effect.Effect<readonly unknown[], ProviderFetchError> =>
    Effect.catchAll(attemptOnce(), (error) => {
      const isTransient = error.reason === "FETCH_FAILED";
      if (!isTransient || remaining === 0) return Effect.fail(error);

      return Effect.flatMap(Effect.sleep(retryDelayMs), () => attempt(remaining - 1));
    });

  return attempt(2);
};

const fetchRawItems = (
  deps: EvidenceRetrievalWorkflowDeps,
  options: ProviderFetchOptions,
): Effect.Effect<readonly unknown[], ProviderFetchError> => {
  const fetcher = options.provider === "zhihu_search" ? deps.zhihuFetcher : deps.globalFetcher;
  const attempt = fetchWithPolicy(
    fetcher,
    options,
    deps.attemptTimeoutMs ?? 5_000,
    deps.retryDelayMs ?? 50,
  );

  if (!deps.queryCache) return attempt;

  return deps.queryCache
    .getOrSet(
      Data.struct({
        claimFingerprint: options.claimFingerprint,
        provider: options.provider,
        query: options.query,
      }),
      () => attempt,
    )
    .pipe(
      Effect.catchAll((error) =>
        error instanceof ProviderFetchError
          ? Effect.fail(error)
          : Effect.fail(
              new ProviderFetchError({ provider: options.provider, reason: "FETCH_FAILED" }),
            ),
      ),
    );
};

// ── Public workflow ───────────────────────────────────────────────────────────

const completeResult = (claims: readonly ClaimRetrievalResult[]): SuccessfulRetrievalResult => {
  const hasRateLimit = claims.some(
    (claim) => claim.zhihu.state === "rate_limited" || claim.globalSearch.state === "rate_limited",
  );
  const hasFailure = claims.some(
    (claim) => claim.zhihu.state === "failed" || claim.globalSearch.state === "failed",
  );

  return {
    _tag: "success",
    isPartial: hasRateLimit || hasFailure,
    partialState: hasRateLimit ? "rate_limited" : hasFailure ? "failed" : "none",
    claims,
  };
};

export const retrieveEvidenceCandidates =
  (deps: EvidenceRetrievalWorkflowDeps) =>
  (
    input: Readonly<{ claims: readonly AnswerClaim[] }>,
  ): Effect.Effect<EvidenceRetrievalResult, EvidenceRetrievalError> =>
    Effect.gen(function* () {
      if (input.claims.length === 0 || input.claims.length > MAX_CLAIMS) {
        return yield* Effect.fail(new EvidenceRetrievalError({ reason: "INVALID_CLAIMS_INPUT" }));
      }

      const claims: AnswerClaim[] = [];
      for (const claim of input.claims) {
        const query = buildSearchQuery(claim.claimText);
        const validFingerprint = /^v1:[0-9a-f]{16}$/.test(claim.claimFingerprint);
        if (!validFingerprint || query === "") {
          return yield* Effect.fail(
            new EvidenceRetrievalError({
              reason: "INVALID_CLAIMS_INPUT",
              claimFingerprint: claim.claimFingerprint,
            }),
          );
        }
        claims.push(claim);
      }

      const existingByClaim = new Map<string, ReadonlySet<string>>();
      for (const claim of claims) {
        const existing = yield* deps.store.findCandidatesByClaimFingerprint(claim.claimFingerprint);
        existingByClaim.set(
          claim.claimFingerprint,
          new Set(existing.map((candidate) => candidate.candidateFingerprint)),
        );
      }

      const capturedAt = yield* deps.clock.now();
      const rateLimitRef = yield* Ref.make(false);

      interface Pair {
        readonly claimFingerprint: string;
        readonly query: string;
        readonly provider: Provider;
      }

      const pairs: Pair[] = claims.flatMap((claim) => [
        {
          claimFingerprint: claim.claimFingerprint,
          query: buildSearchQuery(claim.claimText),
          provider: "zhihu_search" as const,
        },
        {
          claimFingerprint: claim.claimFingerprint,
          query: buildSearchQuery(claim.claimText),
          provider: "global_search" as const,
        },
      ]);

      interface PairOutcome extends Pair {
        readonly result: ProviderRetrievalResult;
      }

      const outcomes = yield* Effect.forEach(
        pairs,
        (pair): Effect.Effect<PairOutcome, never> =>
          Effect.gen(function* () {
            const alreadyRateLimited = yield* Ref.get(rateLimitRef);
            if (alreadyRateLimited) {
              return {
                ...pair,
                result: providerResult("rate_limited", "RATE_LIMITED", {
                  candidates: [],
                  droppedCount: 0,
                  existingCount: 0,
                }),
              };
            }

            const eventFingerprint = buildRetrievalEventFingerprint({
              claimFingerprint: pair.claimFingerprint,
              provider: pair.provider,
              query: pair.query,
            });
            const fetchResult = yield* Effect.either(
              fetchRawItems(deps, {
                claimFingerprint: pair.claimFingerprint,
                provider: pair.provider,
                query: pair.query,
              }),
            );

            if (fetchResult._tag === "Left") {
              const error = fetchResult.left;
              if (error.reason === "RATE_LIMITED") {
                yield* Ref.set(rateLimitRef, true);
                return {
                  ...pair,
                  result: providerResult("rate_limited", "RATE_LIMITED", {
                    candidates: [],
                    droppedCount: 0,
                    existingCount: 0,
                  }),
                };
              }

              return {
                ...pair,
                result: providerResult("failed", error.reason, {
                  candidates: [],
                  droppedCount: 0,
                  existingCount: 0,
                }),
              };
            }

            const parsed = parseBulkItems(
              pair.claimFingerprint,
              eventFingerprint,
              pair.query,
              pair.provider,
              capturedAt,
              existingByClaim.get(pair.claimFingerprint) ?? new Set(),
              fetchResult.right,
            );

            return {
              ...pair,
              result: providerResult("complete", undefined, parsed),
            };
          }),
        { concurrency: 2 },
      );

      const outcomeByPair = new Map<string, PairOutcome>();
      for (const outcome of outcomes) {
        outcomeByPair.set(`${outcome.claimFingerprint}:${outcome.provider}`, outcome);
      }

      const claimResults = claims.map((claim) => {
        const zhihu = outcomeByPair.get(`${claim.claimFingerprint}:zhihu_search`);
        const globalSearch = outcomeByPair.get(`${claim.claimFingerprint}:global_search`);

        return {
          claimFingerprint: claim.claimFingerprint,
          searchQuery: buildSearchQuery(claim.claimText),
          zhihu: zhihu?.result ?? emptyProviderResult(),
          globalSearch: globalSearch?.result ?? emptyProviderResult(),
        };
      });

      return completeResult(claimResults);
    });
