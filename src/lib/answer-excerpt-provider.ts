import { Clock, Data, Duration, Effect } from "effect";

import type { AnswerExcerpt } from "./answer-excerpt";
import { createAnswerExcerpt } from "./answer-excerpt";

import type { CacheStats } from "./query-cache";
import { CacheMiss, makeQueryCache } from "./query-cache";

import { parseZhihuAnswerUrl } from "./zhihu-answer-url";
import type { ZhihuAnswerUrlFailureReason } from "./zhihu-answer-url";

import { StoreError, type ExcerptStore } from "./excerpt-store";

// ── Request ─────────────────────────────────────────────────────────────────────

/**
 * Validated identity for one provider fetch.  Constructed by parsing a
 * supported Zhihu answer URL.  All fields are non-empty numeric strings or
 * a canonical URL.
 */
export interface AnswerExcerptProviderRequest {
  readonly questionId: string;
  readonly answerId: string;
  readonly canonicalUrl: string;
}

/**
 * Injected fetcher contract.  Returns only candidate items; it must not
 * receive or return any HTTP response object.
 */
export type AnswerExcerptItemsFetcher = (
  request: AnswerExcerptProviderRequest,
) => Effect.Effect<readonly unknown[], AnswerExcerptProviderFailure>;

// ── Errors ─────────────────────────────────────────────────────────────────────

export class UnsupportedAnswerUrlError extends Data.TaggedError("UnsupportedAnswerUrlError")<{
  readonly reason: ZhihuAnswerUrlFailureReason;
}> {}

export class AnswerExcerptProviderError extends Data.TaggedError("AnswerExcerptProviderError")<{
  readonly reason: string;
}> {}

export class RateLimitedProviderError extends Data.TaggedError("RateLimitedProviderError") {}

export class QuotaExceededProviderError extends Data.TaggedError("QuotaExceededProviderError") {}

export class AnswerNotFoundProviderError extends Data.TaggedError("AnswerNotFoundProviderError") {}

export class AmbiguousAnswerProviderError extends Data.TaggedError("AmbiguousAnswerProviderError")<{
  readonly matches: number;
}> {}

export class InvalidProviderAnswerError extends Data.TaggedError("InvalidProviderAnswerError")<{
  readonly reason: InvalidProviderAnswerReason;
}> {}

export type InvalidProviderAnswerReason =
  | "ITEM_NOT_OBJECT"
  | "INVALID_ANSWER_URL"
  | "INVALID_CONTENT_ID"
  | "INVALID_EDIT_TIME"
  | "INVALID_CONTENT_TEXT"
  | "INVALID_ANSWER_EXCERPT";

/**
 * Union of all recoverable provider failures.  `CacheMiss` is deliberately
 * excluded — after the expired-entry fix it must not leak through the
 * provider boundary.
 */
export type AnswerExcerptProviderFailure =
  | UnsupportedAnswerUrlError
  | AnswerExcerptProviderError
  | RateLimitedProviderError
  | QuotaExceededProviderError
  | AnswerNotFoundProviderError
  | AmbiguousAnswerProviderError
  | InvalidProviderAnswerError;

// ── Options ────────────────────────────────────────────────────────────────────

export interface AnswerExcerptProviderOptions {
  /** Injected provider that returns raw candidate items. */
  readonly fetchItems: AnswerExcerptItemsFetcher;
  /** Cache TTL. */
  readonly ttl: Duration.DurationInput;
  /** Injectable clock for TTL and `capturedAt`.  Defaults to `Clock.currentTimeMillis`. */
  readonly now?: () => Effect.Effect<number, never>;
  /** Maximum cached entries. */
  readonly maxEntries?: number;
  /** Optional persistent store for surviving server restarts. */
  readonly store?: ExcerptStore;
}

// ── Service ────────────────────────────────────────────────────────────────────

export interface AnswerExcerptProvider {
  /**
   * Resolve a supported Zhihu answer URL into a validated `AnswerExcerpt`.
   * Only caches successful, fully-valid results.
   */
  readonly resolve: (url: string) => Effect.Effect<AnswerExcerpt, AnswerExcerptProviderFailure>;
  /** Read-only cache statistics. */
  readonly stats: () => Effect.Effect<CacheStats>;
}

// ── Implementation ─────────────────────────────────────────────────────────────

type ProviderCandidateFailure =
  | InvalidProviderAnswerError
  | AnswerNotFoundProviderError
  | AmbiguousAnswerProviderError;

type MatchedCandidate = {
  readonly contentId: string;
  readonly editTime: number;
  readonly text: string;
};

const validateAndCreate = (
  rawItems: readonly unknown[],
  targetQuestionId: string,
  targetAnswerId: string,
  clockNow: () => Effect.Effect<number, never>,
): Effect.Effect<AnswerExcerpt, ProviderCandidateFailure> => {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

  const selectMatch = ():
    | { readonly _tag: "success"; readonly candidate: MatchedCandidate }
    | { readonly _tag: "failure"; readonly error: ProviderCandidateFailure } => {
    let matched: MatchedCandidate | undefined;

    for (const item of rawItems) {
      if (!isRecord(item)) {
        return {
          _tag: "failure",
          error: new InvalidProviderAnswerError({ reason: "ITEM_NOT_OBJECT" }),
        };
      }

      if (item.ContentType !== "Answer") continue;

      const urlValue = item.Url;
      if (typeof urlValue !== "string") {
        return {
          _tag: "failure",
          error: new InvalidProviderAnswerError({ reason: "INVALID_ANSWER_URL" }),
        };
      }

      const urlResult = parseZhihuAnswerUrl(urlValue);
      if (urlResult._tag === "failure") {
        return {
          _tag: "failure",
          error: new InvalidProviderAnswerError({ reason: "INVALID_ANSWER_URL" }),
        };
      }

      if (urlResult.questionId !== targetQuestionId || urlResult.answerId !== targetAnswerId) {
        continue;
      }

      const contentId = item.ContentID;
      if (typeof contentId !== "string" || !/^(?:0|-?[1-9][0-9]*)$/.test(contentId)) {
        return {
          _tag: "failure",
          error: new InvalidProviderAnswerError({ reason: "INVALID_CONTENT_ID" }),
        };
      }

      const editTime = item.EditTime;
      if (typeof editTime !== "number" || !Number.isSafeInteger(editTime) || editTime < 0) {
        return {
          _tag: "failure",
          error: new InvalidProviderAnswerError({ reason: "INVALID_EDIT_TIME" }),
        };
      }

      const contentText = item.ContentText;
      if (typeof contentText !== "string" || contentText.trim() === "") {
        return {
          _tag: "failure",
          error: new InvalidProviderAnswerError({ reason: "INVALID_CONTENT_TEXT" }),
        };
      }

      if (matched !== undefined) {
        return {
          _tag: "failure",
          error: new AmbiguousAnswerProviderError({ matches: 2 }),
        };
      }

      matched = { contentId, editTime, text: contentText };
    }

    if (matched === undefined) {
      return { _tag: "failure", error: new AnswerNotFoundProviderError() };
    }

    return { _tag: "success", candidate: matched };
  };

  return Effect.flatMap(clockNow(), (capturedAt) => {
    const selected = selectMatch();
    if (selected._tag === "failure") {
      return Effect.fail(selected.error);
    }

    const result = createAnswerExcerpt({
      questionId: targetQuestionId,
      answerId: targetAnswerId,
      capturedAt,
      sourceContentId: selected.candidate.contentId,
      sourceContentType: "Answer",
      sourceEditTime: selected.candidate.editTime,
      excerpt: selected.candidate.text,
    });

    if (result._tag === "failure") {
      return Effect.fail(new InvalidProviderAnswerError({ reason: "INVALID_ANSWER_EXCERPT" }));
    }

    return Effect.succeed(result.excerpt);
  });
};

export const makeAnswerExcerptProvider = (
  options: AnswerExcerptProviderOptions,
): Effect.Effect<AnswerExcerptProvider> => {
  // Use the injected clock for capturedAt; fall back to Clock if not provided.
  const clockNow = options.now ?? ((): Effect.Effect<number, never> => Clock.currentTimeMillis);

  const isProviderFailure = (value: unknown): value is AnswerExcerptProviderFailure =>
    value instanceof UnsupportedAnswerUrlError ||
    value instanceof AnswerExcerptProviderError ||
    value instanceof RateLimitedProviderError ||
    value instanceof QuotaExceededProviderError ||
    value instanceof AnswerNotFoundProviderError ||
    value instanceof AmbiguousAnswerProviderError ||
    value instanceof InvalidProviderAnswerError;

  return Effect.flatMap(
    makeQueryCache<string, AnswerExcerpt>({
      ttl: options.ttl,
      now: options.now,
      maxEntries: options.maxEntries,
    }),
    (cache) => {
      const resolve = (url: string): Effect.Effect<AnswerExcerpt, AnswerExcerptProviderFailure> => {
        // Step 1: validate URL — fail before calling the provider on unsupported input.
        const urlResult = parseZhihuAnswerUrl(url);
        if (urlResult._tag === "failure") {
          return Effect.fail(new UnsupportedAnswerUrlError({ reason: urlResult.reason }));
        }

        const { questionId, answerId, canonicalUrl } = urlResult;
        const cacheKey = `${questionId}:${answerId}`;

        // Step 2: try in-memory cache first
        const onCacheMiss = (): Effect.Effect<AnswerExcerpt, AnswerExcerptProviderFailure> => {
          // Step 3: try persistent store on cache miss
          if (!options.store) {
            return fetchAndCache();
          }

          return Effect.flatMap(
            Effect.exit(options.store.findLatest(questionId, answerId)),
            (storeExit) => {
              if (storeExit._tag === "Failure") {
                // Store error — the store error is surfaced as a provider error
                return Effect.fail(
                  new AnswerExcerptProviderError({
                    reason: `store error: ${storeExit.cause._tag === "Fail" && storeExit.cause.error instanceof StoreError ? storeExit.cause.error.reason : "unknown"}`,
                  }),
                );
              }

              if (storeExit.value !== null) {
                // Store hit: write to in-memory cache and return
                return Effect.flatMap(cache.set(cacheKey, storeExit.value), () =>
                  Effect.succeed(storeExit.value as AnswerExcerpt),
                );
              }

              // Store miss: fall through to API fetch
              return fetchAndCache();
            },
          );
        };

        // Step 4: fetch from API and cache the result
        const fetchAndCache = (): Effect.Effect<AnswerExcerpt, AnswerExcerptProviderFailure> => {
          return cache
            .getOrSet(cacheKey, () =>
              Effect.flatMap(
                options.fetchItems({
                  questionId,
                  answerId,
                  canonicalUrl,
                }),
                (rawItems) => validateAndCreate(rawItems, questionId, answerId, clockNow),
              ),
            )
            .pipe(
              Effect.tap((excerpt) => {
                // Save to persistent store on successful fetch (best-effort)
                if (options.store) {
                  return Effect.ignore(options.store.save(excerpt));
                }
                return Effect.void;
              }),
              Effect.mapError((raw): AnswerExcerptProviderFailure => {
                // Compute failures are already part of the public taxonomy.
                if (isProviderFailure(raw)) {
                  return raw;
                }
                if (raw instanceof CacheMiss) {
                  // Should never occur after the expired-entry fix but is mapped
                  // to avoid leaking internal cache types.
                  return new AnswerExcerptProviderError({
                    reason: `unexpected cache miss for ${String(raw.key)}`,
                  });
                }
                return new AnswerExcerptProviderError({
                  reason: raw instanceof Error ? raw.message : "unknown provider failure",
                });
              }),
            );
        };

        return cache.get(cacheKey).pipe(Effect.catchAll(() => onCacheMiss()));
      };

      const stats = (): Effect.Effect<CacheStats> => cache.stats();

      return Effect.succeed({ resolve, stats });
    },
  );
};
