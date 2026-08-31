import { Effect } from "effect";

import { describe, expect, it } from "vite-plus/test";

import { EvidenceCandidateStoreError } from "../lib/evidence-candidate-store";
import { ProviderFetchError } from "../lib/evidence-retrieval-workflow";
import type { EvidenceCandidateStore } from "../lib/evidence-candidate-store";
import { createRetrieveEvidenceHandler } from "./retrieve-evidence-candidates";

const validInput = {
  claims: [
    {
      claimFingerprint: "v1:aaaaaaaaaaaaaaaa",
      claimText: "The library supports Python 3.9.",
      excerptFingerprint: "v1:bbbbbbbbbbbbbbbb",
    },
  ],
};

const makeStore = (overrides: Partial<EvidenceCandidateStore> = {}): EvidenceCandidateStore => ({
  saveRetrieval: () => Effect.void,
  saveCandidates: () => Effect.void,
  findCandidatesByClaimFingerprint: () => Effect.succeed([]),
  findCandidatesByExcerptFingerprint: () => Effect.succeed([]),
  ...overrides,

  findAll: () => Effect.succeed([]),
});

const makeFetcher = (effect: Effect.Effect<readonly unknown[], ProviderFetchError>) => () => effect;

describe("retrieve evidence server handler", () => {
  it("returns a structured partial result when one provider has no quota", async () => {
    const handler = createRetrieveEvidenceHandler({
      getSecret: () => "secret",
      createStore: async () => makeStore(),
      createProviderFetchers: () => ({
        zhihuFetcher: makeFetcher(
          Effect.fail(
            new ProviderFetchError({ provider: "zhihu_search", reason: "QUOTA_EXCEEDED" }),
          ),
        ),
        globalFetcher: makeFetcher(Effect.succeed([])),
      }),
    });

    const result = await handler(validInput);

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.isPartial).toBe(true);
      expect(result.partialState).toBe("quota_exceeded");
      expect(result.claims[0].zhihuState).toBe("quota_exceeded");
      expect(result.claims[0].globalSearchState).toBe("complete");
    }
  });

  it("maps store lookup failure to a safe evidence store code", async () => {
    const handler = createRetrieveEvidenceHandler({
      getSecret: () => "secret",
      createStore: async () =>
        makeStore({
          findCandidatesByClaimFingerprint: () =>
            Effect.fail(
              new EvidenceCandidateStoreError({
                reason: "database unavailable /path/with/secrets",
              }),
            ),
        }),
    });

    const result = await handler(validInput);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("EVIDENCE_STORE_ERROR");
      expect(result.message).not.toContain("secret");
      expect(result.message).not.toContain("/path");
    }
  });

  it("maps persistence failure to a safe evidence store code", async () => {
    const rawCandidate = {
      Title: "Current release notes",
      ContentType: "Answer",
      ContentID: "content-1",
      ContentText: "A current summary for the claim.",
      Url: "https://example.com/current",
      EditTime: 1_700_000_000,
    };
    const handler = createRetrieveEvidenceHandler({
      getSecret: () => "secret",
      createStore: async () =>
        makeStore({
          saveRetrieval: () =>
            Effect.fail(new EvidenceCandidateStoreError({ reason: "disk unavailable" })),
        }),
      createProviderFetchers: () => ({
        zhihuFetcher: makeFetcher(Effect.succeed([rawCandidate])),
        globalFetcher: makeFetcher(Effect.succeed([])),
      }),
    });

    const result = await handler(validInput);

    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("EVIDENCE_STORE_ERROR");
      expect(result.message).not.toContain("disk");
    }
  });
});
