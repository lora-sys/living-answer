import { Effect, Exit } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createAnswerClaim } from "./answer-claim";
import { makeQueryCache } from "./query-cache";

import {
  EvidenceRetrievalError,
  ProviderFetchError,
  buildRetrievalEventFingerprint,
  retrieveEvidenceCandidates,
} from "./evidence-retrieval-workflow";

import type {
  EvidenceRetrievalCacheKey,
  EvidenceRetrievalWorkflowDeps,
  ProviderFetcher,
} from "./evidence-retrieval-workflow";
import type { AnswerClaim } from "./answer-claim";
import type { EvidenceCandidate, Provider } from "./evidence-candidate";

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeClaim = (suffix = ""): AnswerClaim => {
  const claimText = `The Earth orbits the Sun every year ${suffix}`;
  const excerpt = `${claimText} according to current observations.`;
  const result = createAnswerClaim({
    questionId: "123",
    answerId: "456",
    sourceContentId: "789",
    sourceContentType: "Answer",
    sourceEditTime: 1_700_000_000,
    excerptFingerprint: "v1:bbbbbbbbbbbbbbbb",
    excerpt,
    claimText,
    anchorText: claimText,
    volatility: "high",
    decisionRelevance: "high",
    candidateReason: "This premise may need verification against current observations.",
    extractedAt: 1_700_000_000_000,
  });

  if (result._tag === "failure") throw new Error(result.reason);
  return result.claim;
};

const makeRawItem = (overrides: Record<string, unknown> = {}) => ({
  Title: "Current evidence about the claim",
  ContentType: "Answer",
  ContentID: "content-1",
  ContentText: "A summary that may contain a current-world lead.",
  Url: "https://example.com/current-evidence",
  EditTime: 1_700_000_000,
  AuthorityLevel: "4",
  ...overrides,
});

interface FetchCall {
  readonly claimFingerprint: string;
  readonly provider: Provider;
  readonly query: string;
}

const makeFetcher = (
  handler: (options: {
    claimFingerprint: string;
    provider: Provider;
    query: string;
  }) => Effect.Effect<readonly unknown[], ProviderFetchError>,
): { calls: FetchCall[]; fetcher: ProviderFetcher } => {
  const calls: FetchCall[] = [];
  return {
    calls,
    fetcher: (options) =>
      Effect.suspend(() => {
        calls.push(options);
        return handler(options);
      }),
  };
};

const makeStore = (initial: readonly EvidenceCandidate[] = []) => {
  let candidates: readonly EvidenceCandidate[] = [...initial];
  const lookups: string[] = [];
  return {
    lookups,
    get candidates() {
      return candidates;
    },
    set candidates(value: readonly EvidenceCandidate[]) {
      candidates = [...value];
    },
    findCandidatesByClaimFingerprint: (_claimFingerprint: string) =>
      Effect.suspend(() => {
        return Effect.succeed(candidates);
      }),
  };
};

const makeDeps = (
  overrides: Partial<Omit<EvidenceRetrievalWorkflowDeps, "clock">> = {},
): EvidenceRetrievalWorkflowDeps => ({
  store: makeStore(),
  zhihuFetcher: () => Effect.succeed([]),
  globalFetcher: () => Effect.succeed([]),
  clock: { now: () => Effect.succeed(1_700_000_000_000) },
  retryDelayMs: 0,
  ...overrides,
});

const runSuccess = async (deps: EvidenceRetrievalWorkflowDeps, claims: readonly AnswerClaim[]) => {
  const exit = await Effect.runPromiseExit(retrieveEvidenceCandidates(deps)({ claims }));

  if (Exit.isFailure(exit)) {
    throw new Error("Expected retrieval workflow to succeed");
  }
  return exit.value;
};

const runError = async (deps: EvidenceRetrievalWorkflowDeps, claims: readonly AnswerClaim[]) => {
  const exit = await Effect.runPromiseExit(retrieveEvidenceCandidates(deps)({ claims }));

  if (Exit.isSuccess(exit)) {
    throw new Error("Expected retrieval workflow to fail");
  }
  return exit.cause;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("evidence retrieval workflow", () => {
  it("retrieves both providers and preserves full candidate provenance", async () => {
    const zhihu = makeFetcher(() =>
      Effect.succeed([
        makeRawItem({
          ContentType: "Answer",
          AuthorityLevel: "1",
        }),
      ]),
    );
    const global = makeFetcher(() =>
      Effect.succeed([
        makeRawItem({
          ContentType: "",
          ContentID: "web-content-1",
          Url: "https://user:secret@example.com/web-source",
          AuthorityLevel: "4",
        }),
      ]),
    );
    const claim = makeClaim();
    const result = await runSuccess(
      makeDeps({ zhihuFetcher: zhihu.fetcher, globalFetcher: global.fetcher }),
      [claim],
    );

    expect(result._tag).toBe("success");
    expect(result.isPartial).toBe(false);
    expect(result.partialState).toBe("none");
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0].claimFingerprint).toBe(claim.claimFingerprint);
    expect(result.claims[0].searchQuery).toBe(claim.claimText);

    const zhihuCandidate = result.claims[0].zhihu.candidates[0];
    expect(zhihuCandidate.provider).toBe("zhihu_search");
    expect(zhihuCandidate.sourceKind).toBe("community_lead");
    expect(zhihuCandidate.authorityHint).toBe("official");
    expect(zhihuCandidate.claimFingerprint).toBe(claim.claimFingerprint);
    expect(zhihuCandidate.retrievalEventFingerprint).toMatch(/^v1:[0-9a-f]{16}$/);

    const globalCandidate = result.claims[0].globalSearch.candidates[0];
    expect(globalCandidate.provider).toBe("global_search");
    expect(globalCandidate.sourceKind).toBe("web_source");
    expect(globalCandidate.sourceContentType).toBe("unknown");
    expect(globalCandidate.sourceUrl).toBe("https://example.com/web-source");
    expect(globalCandidate.publishedAt).toBe(1_700_000_000_000);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("uses deterministic retrieval event fingerprints", async () => {
    const zhihu = makeFetcher(() => Effect.succeed([makeRawItem()]));
    const global = makeFetcher(() => Effect.succeed([]));
    const deps = makeDeps({ zhihuFetcher: zhihu.fetcher, globalFetcher: global.fetcher });
    const claim = makeClaim();
    const first = await runSuccess(deps, [claim]);
    const second = await runSuccess(deps, [claim]);
    const expected = buildRetrievalEventFingerprint({
      claimFingerprint: claim.claimFingerprint,
      provider: "zhihu_search",
      query: claim.claimText,
    });

    expect(first.claims[0].zhihu.candidates[0].retrievalEventFingerprint).toBe(expected);
    expect(second.claims[0].zhihu.candidates[0].retrievalEventFingerprint).toBe(expected);
  });

  it("treats empty provider results as a complete success", async () => {
    const zhihu = makeFetcher(() => Effect.succeed([]));
    const global = makeFetcher(() => Effect.succeed([]));
    const result = await runSuccess(
      makeDeps({ zhihuFetcher: zhihu.fetcher, globalFetcher: global.fetcher }),
      [makeClaim()],
    );

    expect(result.isPartial).toBe(false);
    expect(result.claims[0].zhihu.state).toBe("complete");
    expect(result.claims[0].zhihu.candidates).toEqual([]);
    expect(result.claims[0].globalSearch.state).toBe("complete");
    expect(result.claims[0].globalSearch.candidates).toEqual([]);
  });

  it("drops invalid and duplicate raw items without crashing", async () => {
    const valid = makeRawItem();
    const zhihu = makeFetcher(() =>
      Effect.succeed([
        null,
        { ...valid, Title: "" },
        valid,
        { ...valid, ContentText: "  A summary that may contain a current-world lead.  " },
      ]),
    );
    const global = makeFetcher(() => Effect.succeed([makeRawItem({ Url: "not-a-url" })]));
    const result = await runSuccess(
      makeDeps({ zhihuFetcher: zhihu.fetcher, globalFetcher: global.fetcher }),
      [makeClaim()],
    );

    expect(result.claims[0].zhihu.state).toBe("complete");
    expect(result.claims[0].zhihu.candidates).toHaveLength(1);
    expect(result.claims[0].zhihu.droppedCount).toBe(2);
    expect(result.claims[0].zhihu.existingCount).toBe(1);
    expect(result.claims[0].globalSearch.droppedCount).toBe(1);
    expect(result.claims[0].globalSearch.candidates).toEqual([]);
  });

  it("does not duplicate candidates already returned by the store", async () => {
    const zhihu = makeFetcher(() => Effect.succeed([makeRawItem()]));
    const global = makeFetcher(() => Effect.succeed([]));
    const deps = makeDeps({ zhihuFetcher: zhihu.fetcher, globalFetcher: global.fetcher });
    const claim = makeClaim();

    const first = await runSuccess(deps, [claim]);
    const known = [...first.claims[0].zhihu.candidates, ...first.claims[0].globalSearch.candidates];
    const cachedStore = makeStore(known);

    const second = await runSuccess({ ...deps, store: cachedStore }, [claim]);
    expect(second.claims[0].zhihu.candidates).toEqual([]);
    expect(second.claims[0].zhihu.existingCount).toBe(1);
  });

  it("stops later network attempts after a rate limit and marks the run partial", async () => {
    const firstClaim = makeClaim();
    const secondClaim = makeClaim("two");
    const zhihu = makeFetcher((options) =>
      options.provider === "zhihu_search" &&
      options.claimFingerprint === firstClaim.claimFingerprint
        ? Effect.fail(new ProviderFetchError({ provider: "zhihu_search", reason: "RATE_LIMITED" }))
        : Effect.succeed([]),
    );
    const global = makeFetcher(() => Effect.succeed([]));
    const result = await runSuccess(
      makeDeps({ zhihuFetcher: zhihu.fetcher, globalFetcher: global.fetcher }),
      [firstClaim, secondClaim],
    );

    expect(zhihu.calls).toHaveLength(1);
    expect(global.calls).toHaveLength(1);
    expect(result.isPartial).toBe(true);
    expect(result.partialState).toBe("rate_limited");
    expect(result.claims[0].zhihu.state).toBe("rate_limited");
    expect(result.claims[0].globalSearch.state).toBe("complete");
    expect(result.claims[1].zhihu.state).toBe("rate_limited");
    expect(result.claims[1].globalSearch.state).toBe("rate_limited");
  });

  it("does not stop the other provider after one provider's quota is exhausted", async () => {
    const zhihu = makeFetcher(() =>
      Effect.fail(new ProviderFetchError({ provider: "zhihu_search", reason: "QUOTA_EXCEEDED" })),
    );
    const global = makeFetcher(() => Effect.succeed([makeRawItem()]));
    const result = await runSuccess(
      makeDeps({ zhihuFetcher: zhihu.fetcher, globalFetcher: global.fetcher }),
      [makeClaim()],
    );

    expect(zhihu.calls).toHaveLength(1);
    expect(global.calls).toHaveLength(1);
    expect(result.isPartial).toBe(true);
    expect(result.partialState).toBe("quota_exceeded");
    expect(result.claims[0].zhihu.state).toBe("quota_exceeded");
    expect(result.claims[0].globalSearch.state).toBe("complete");
  });

  it("retries only transient fetch failures", async () => {
    let calls = 0;
    const zhihu: ProviderFetcher = () =>
      Effect.suspend(() => {
        calls += 1;
        return calls === 1
          ? Effect.fail(
              new ProviderFetchError({ provider: "zhihu_search", reason: "FETCH_FAILED" }),
            )
          : Effect.succeed([makeRawItem()]);
      });
    const global = makeFetcher(() => Effect.succeed([]));
    const result = await runSuccess(
      makeDeps({ zhihuFetcher: zhihu, globalFetcher: global.fetcher }),
      [makeClaim()],
    );

    expect(calls).toBe(2);
    expect(result.claims[0].zhihu.state).toBe("complete");
    expect(result.claims[0].zhihu.candidates).toHaveLength(1);
  });

  it("does not retry malformed provider responses", async () => {
    let calls = 0;
    const zhihu: ProviderFetcher = () =>
      Effect.suspend(() => {
        calls += 1;
        return Effect.fail(
          new ProviderFetchError({ provider: "zhihu_search", reason: "MALFORMED_RESPONSE" }),
        );
      });
    const global = makeFetcher(() => Effect.succeed([]));
    const result = await runSuccess(
      makeDeps({ zhihuFetcher: zhihu, globalFetcher: global.fetcher }),
      [makeClaim()],
    );

    expect(calls).toBe(1);
    expect(result.isPartial).toBe(true);
    expect(result.partialState).toBe("failed");
    expect(result.claims[0].zhihu.state).toBe("failed");
    expect(result.claims[0].zhihu.errorReason).toBe("MALFORMED_RESPONSE");
    expect(result.claims[0].globalSearch.state).toBe("complete");
  });

  it("limits provider work to two concurrent attempts", async () => {
    let current = 0;
    let max = 0;
    const fetcher: ProviderFetcher = () =>
      Effect.gen(function* () {
        current += 1;
        max = Math.max(max, current);
        yield* Effect.yieldNow();
        current -= 1;
        return [];
      });

    await runSuccess(makeDeps({ zhihuFetcher: fetcher, globalFetcher: fetcher }), [
      makeClaim(),
      makeClaim("two"),
      makeClaim("three"),
    ]);

    expect(max).toBe(2);
  });

  it("uses a short-lived query cache for repeated workflow calls", async () => {
    const cache = await Effect.runPromise(
      makeQueryCache<EvidenceRetrievalCacheKey, readonly unknown[]>({
        ttl: "1 minute",
        now: () => Effect.succeed(1_700_000_000_000),
      }),
    );
    const zhihu = makeFetcher(() => Effect.succeed([makeRawItem()]));
    const global = makeFetcher(() => Effect.succeed([]));
    const deps = makeDeps({
      zhihuFetcher: zhihu.fetcher,
      globalFetcher: global.fetcher,
      queryCache: cache,
    });
    const claim = makeClaim();

    const first = await runSuccess(deps, [claim]);
    const second = await runSuccess(deps, [claim]);

    expect(zhihu.calls).toHaveLength(1);
    expect(global.calls).toHaveLength(1);
    expect(first.claims[0].zhihu.candidates[0].candidateFingerprint).toBe(
      second.claims[0].zhihu.candidates[0].candidateFingerprint,
    );
  });

  it("fails without network calls for invalid claim input", async () => {
    const zhihu = makeFetcher(() => Effect.succeed([makeRawItem()]));
    const global = makeFetcher(() => Effect.succeed([makeRawItem()]));
    const deps = makeDeps({ zhihuFetcher: zhihu.fetcher, globalFetcher: global.fetcher });

    await runError(deps, []);

    const invalidFingerprint = { ...makeClaim("invalid"), claimFingerprint: "not-a-fingerprint" };
    await runError(deps, [invalidFingerprint]);

    await runError(deps, [
      makeClaim("one"),
      makeClaim("two"),
      makeClaim("three"),
      makeClaim("four"),
    ]);

    expect(zhihu.calls).toEqual([]);
    expect(global.calls).toEqual([]);
  });

  it("propagates a typed store failure before any network call", async () => {
    const zhihu = makeFetcher(() => Effect.succeed([makeRawItem()]));
    const global = makeFetcher(() => Effect.succeed([makeRawItem()]));
    const deps = makeDeps({
      zhihuFetcher: zhihu.fetcher,
      globalFetcher: global.fetcher,
      store: {
        findCandidatesByClaimFingerprint: () =>
          Effect.fail(new EvidenceRetrievalError({ reason: "STORE_LOOKUP_FAILED" })),
      },
    });

    await runError(deps, [makeClaim()]);
    expect(zhihu.calls).toEqual([]);
    expect(global.calls).toEqual([]);
  });
});
