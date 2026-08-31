import { Effect } from "effect";

import { createEvidenceCandidate } from "./evidence-candidate";
import type { EvidenceCandidate } from "./evidence-candidate";
import {
  EvidenceCandidateStoreError,
  makeSqliteEvidenceCandidateStore,
} from "./evidence-candidate-store";

import { beforeAll, describe, expect, it } from "vite-plus/test";

const TEST_DB_PATH = ".local/test-evidence-candidates.db";
const TEST_EXCERPT_FINGERPRINT = "v1:excerpt0000test0001";
const FIXED_TIMESTAMP = 1_700_000_000_000;

const cleanup = (path: string): void => {
  try {
    const { unlinkSync, existsSync } = require("node:fs");
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // best-effort cleanup
  }
};

const makeCandidate = (
  overrides: Partial<Parameters<typeof createEvidenceCandidate>[0]> = {},
): EvidenceCandidate => {
  const result = createEvidenceCandidate({
    claimFingerprint: overrides.claimFingerprint ?? "v1:aaaa0000bbbb1111",
    retrievalEventFingerprint: overrides.retrievalEventFingerprint ?? "v1:cccc0000dddd1111",
    provider: overrides.provider ?? "zhihu_search",
    searchQuery: overrides.searchQuery ?? "test query for evidence",
    sourceContentId: overrides.sourceContentId ?? "123456",
    sourceContentType: overrides.sourceContentType ?? "Answer",
    sourceKind: overrides.sourceKind ?? "community_lead",
    authorityHint: overrides.authorityHint ?? "community",
    sourceLabel: overrides.sourceLabel ?? "Zhihu Community",
    title: overrides.title ?? "Example answer title",
    sourceUrl: overrides.sourceUrl ?? "https://www.zhihu.com/question/1/answer/123456",
    contentPreview: overrides.contentPreview ?? "Example content preview text for testing.",
    publishedAt: overrides.publishedAt ?? 1_690_000_000_000,
    capturedAt: overrides.capturedAt ?? FIXED_TIMESTAMP,
    sourceAccessState: overrides.sourceAccessState ?? "fetched",
  });

  if (result._tag === "failure") {
    throw new Error(`Failed to create test candidate: ${result.reason}`);
  }

  return result.candidate;
};

const buildStore = async (dbPath = TEST_DB_PATH) => {
  cleanup(dbPath);
  return Effect.runPromise(makeSqliteEvidenceCandidateStore(dbPath));
};

const runSuccess = <A>(effect: Effect.Effect<A, EvidenceCandidateStoreError>): Promise<A> =>
  Effect.runPromise(effect);

beforeAll(() => {
  cleanup(TEST_DB_PATH);
});

describe("evidence-candidate-store", () => {
  it("saveRetrieval + saveCandidates persists and findCandidatesByClaimFingerprint returns them", async () => {
    const store = await buildStore();
    const candidate = makeCandidate();

    await runSuccess(
      Effect.gen(function* () {
        yield* store.saveRetrieval(
          TEST_EXCERPT_FINGERPRINT,
          candidate.claimFingerprint,
          candidate.retrievalEventFingerprint,
          candidate.provider,
          candidate.searchQuery,
          Math.floor(candidate.capturedAt / 1000),
        );
        yield* store.saveCandidates(candidate.retrievalEventFingerprint, [candidate]);
      }),
    );

    const results = await runSuccess(
      store.findCandidatesByClaimFingerprint(candidate.claimFingerprint),
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.claimFingerprint).toBe(candidate.claimFingerprint);
    expect(results[0]!.candidateFingerprint).toBe(candidate.candidateFingerprint);
    expect(results[0]!.title).toBe(candidate.title);
    expect(results[0]!.publishedAt).toBe(candidate.publishedAt);
  });

  it("saveRetrieval is idempotent for the same claim+event fingerprint", async () => {
    const store = await buildStore();
    const candidate = makeCandidate();

    const save = Effect.gen(function* () {
      yield* store.saveRetrieval(
        TEST_EXCERPT_FINGERPRINT,
        candidate.claimFingerprint,
        candidate.retrievalEventFingerprint,
        candidate.provider,
        candidate.searchQuery,
        Math.floor(candidate.capturedAt / 1000),
      );
    });

    await runSuccess(save);
    await runSuccess(save);

    const results = await runSuccess(
      store.findCandidatesByClaimFingerprint(candidate.claimFingerprint),
    );
    expect(results).toHaveLength(0);
  });

  it("different retrieval events append history", async () => {
    const store = await buildStore();
    const candidate1 = makeCandidate({ retrievalEventFingerprint: "v1:eeee0000ffff1111" });
    const candidate2 = makeCandidate({ retrievalEventFingerprint: "v1:aaaa0000bbbb2222" });

    await runSuccess(
      Effect.gen(function* () {
        yield* store.saveRetrieval(
          TEST_EXCERPT_FINGERPRINT,
          candidate1.claimFingerprint,
          candidate1.retrievalEventFingerprint,
          candidate1.provider,
          candidate1.searchQuery,
          1_700_000_000,
        );
        yield* store.saveCandidates(candidate1.retrievalEventFingerprint, [candidate1]);
        yield* store.saveRetrieval(
          TEST_EXCERPT_FINGERPRINT,
          candidate2.claimFingerprint,
          candidate2.retrievalEventFingerprint,
          candidate2.provider,
          candidate2.searchQuery,
          1_700_000_100,
        );
        yield* store.saveCandidates(candidate2.retrievalEventFingerprint, [candidate2]);
      }),
    );

    const results = await runSuccess(
      store.findCandidatesByClaimFingerprint(candidate1.claimFingerprint),
    );
    expect(results).toHaveLength(2);
  });

  it("findCandidatesByExcerptFingerprint returns candidates whose claims belong to the excerpt", async () => {
    const store = await buildStore();

    const excerptFingerprint = "v1:0123456789abcdef";
    const candidate = makeCandidate();
    await runSuccess(
      Effect.gen(function* () {
        yield* store.saveRetrieval(
          excerptFingerprint,
          candidate.claimFingerprint,
          candidate.retrievalEventFingerprint,
          candidate.provider,
          candidate.searchQuery,
          Math.floor(candidate.capturedAt / 1000),
        );
        yield* store.saveCandidates(candidate.retrievalEventFingerprint, [candidate]);
      }),
    );

    const results = await runSuccess(store.findCandidatesByExcerptFingerprint(excerptFingerprint));
    expect(results).toHaveLength(1);
    expect(results[0]!.claimFingerprint).toBe(candidate.claimFingerprint);
  });

  it("findCandidatesByClaimFingerprint returns empty array for unknown fingerprint", async () => {
    const store = await buildStore();
    const results = await runSuccess(store.findCandidatesByClaimFingerprint("v1:nonexistent0000"));
    expect(results).toEqual([]);
  });

  it("persistence across reopen", async () => {
    const store = await buildStore();
    const candidate = makeCandidate();

    await runSuccess(
      Effect.gen(function* () {
        yield* store.saveRetrieval(
          TEST_EXCERPT_FINGERPRINT,
          candidate.claimFingerprint,
          candidate.retrievalEventFingerprint,
          candidate.provider,
          candidate.searchQuery,
          Math.floor(candidate.capturedAt / 1000),
        );
        yield* store.saveCandidates(candidate.retrievalEventFingerprint, [candidate]);
      }),
    );

    const reopened = await Effect.runPromise(makeSqliteEvidenceCandidateStore(TEST_DB_PATH));
    const results = await runSuccess(
      reopened.findCandidatesByClaimFingerprint(candidate.claimFingerprint),
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.candidateFingerprint).toBe(candidate.candidateFingerprint);
  });
});
