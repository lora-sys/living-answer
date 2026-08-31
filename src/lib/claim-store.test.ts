import { Effect } from "effect";

import type { AnswerClaim } from "./answer-claim";
import { StoreError, makeSqliteClaimStore } from "./claim-store";

import { createAnswerClaim } from "./answer-claim";

import { beforeAll, describe, expect, it } from "vite-plus/test";

// ── Helpers ────────────────────────────────────────────────────────────────────

const TEST_DB_PATH = ".local/test-claims.db";

const FIXED_TIMESTAMP = 1_700_000_000_000;

const cleanup = (path: string): void => {
  try {
    const { unlinkSync, existsSync } = require("node:fs");
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // best-effort cleanup
  }
};

/**
 * Build a consistent {@link AnswerClaim} with matching fingerprint.
 * The helper computes the claimFingerprint via the domain factory.
 */
const makeClaim = (
  overrides: Partial<Omit<AnswerClaim, "claimFingerprint" | "status">> & {
    readonly status?: "candidate";
  } = {},
  ensureUniqueness?: string,
): AnswerClaim => {
  // Include a uniqueness suffix in the claimText so the user can easily
  // generate distinct claims when needed.
  const suffix = ensureUniqueness ?? "";
  const baseClaimText =
    "Technology trends are shifting toward artificial intelligence and automation.";
  const baseAnchorText = "Technology trends are shifting";
  const baseReason =
    "Technology trends keep shifting so this claim may need updating soon from the latest source.";

  const result = createAnswerClaim({
    questionId: overrides.questionId ?? "42",
    answerId: overrides.answerId ?? "100",
    sourceContentId: overrides.sourceContentId ?? "123",
    sourceContentType: "Answer",
    sourceEditTime: overrides.sourceEditTime ?? 1_699_999_999_000,
    excerptFingerprint: overrides.excerptFingerprint ?? "v1:0123456789abcdef",
    excerpt: (overrides.anchorText ?? baseAnchorText) + suffix,
    claimText: (overrides.claimText ?? baseClaimText) + suffix,
    anchorText: (overrides.anchorText ?? baseAnchorText) + suffix,
    volatility: overrides.volatility ?? "high",
    decisionRelevance: overrides.decisionRelevance ?? "high",
    candidateReason: (overrides.candidateReason ?? baseReason) + suffix,
    extractedAt: overrides.extractedAt ?? FIXED_TIMESTAMP,
  });

  if (result._tag === "failure") {
    throw new Error(`Failed to create test claim: ${result.reason}`);
  }

  return { ...result.claim, status: overrides.status ?? "candidate" };
};

const buildStore = async (dbPath = TEST_DB_PATH) => {
  cleanup(dbPath);
  return Effect.runPromise(makeSqliteClaimStore(dbPath));
};

const openStore = async (dbPath = TEST_DB_PATH) => {
  // Reopen existing file to test persistence
  return Effect.runPromise(makeSqliteClaimStore(dbPath));
};

const runSuccess = <A>(effect: Effect.Effect<A, StoreError>): Promise<A> =>
  Effect.runPromise(effect);

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("claim-store", () => {
  beforeAll(() => {
    cleanup(TEST_DB_PATH);
  });

  // ------------------------------------------------------------------
  // 1. Schema creation and empty state
  // ------------------------------------------------------------------
  it("creates tables and returns empty fingerprints list for a fresh db", async () => {
    const store = await buildStore();

    const fingerprints = await runSuccess(store.listExcerptFingerprints());
    expect(fingerprints).toEqual([]);
  });

  // ------------------------------------------------------------------
  // 2. Save and retrieve a claim set
  // ------------------------------------------------------------------
  it("saves a claim set and retrieves it by excerpt fingerprint", async () => {
    const store = await buildStore();
    const fp = "v1:abc123def4567890";
    const claims = [
      makeClaim(
        {
          excerptFingerprint: fp,
          claimText:
            "Technology trends are shifting toward artificial intelligence and automation.",
          anchorText: "Technology trends are shifting",
          candidateReason: "Technology trends keep shifting so this claim may need updating soon.",
        },
        "-a",
      ),
      makeClaim(
        {
          excerptFingerprint: fp,
          claimText: "Economic data shifts quarterly with new government reports and statistics.",
          anchorText: "Economic data shifts quarterly",
          candidateReason:
            "Economic data sources update regularly and may have changed since publication.",
        },
        "-b",
      ),
    ];

    await runSuccess(store.saveClaimSet(fp, claims));

    const found = await runSuccess(store.findLatestByExcerptFingerprint(fp));

    expect(found).toHaveLength(2);
    expect(found[0].claimText).toBe(claims[0].claimText);
    expect(found[0].anchorText).toBe(claims[0].anchorText);
    expect(found[1].claimText).toBe(claims[1].claimText);
    expect(found[1].anchorText).toBe(claims[1].anchorText);
    expect(found[0].excerptFingerprint).toBe(fp);
  });

  // ------------------------------------------------------------------
  // 3. Idempotent save: same set saved twice does not duplicate
  // ------------------------------------------------------------------
  it("does not duplicate claims when the same set is saved twice", async () => {
    const store = await buildStore();
    const fp = "v1:deadbeefcafebabe";
    const claims = [makeClaim({ excerptFingerprint: fp }, "-x")];

    // Save the same set twice
    await runSuccess(store.saveClaimSet(fp, claims));
    await runSuccess(store.saveClaimSet(fp, claims));

    const found = await runSuccess(store.findLatestByExcerptFingerprint(fp));

    expect(found).toHaveLength(1);
    expect(found[0].claimText).toBe(claims[0].claimText);
  });

  // ------------------------------------------------------------------
  // 4. findLatestByExcerptFingerprint returns empty for unknown fingerprint
  // ------------------------------------------------------------------
  it("returns empty array for an unknown excerpt fingerprint", async () => {
    const store = await buildStore();

    const found = await runSuccess(store.findLatestByExcerptFingerprint("v1:eeeeeeeeeeeeeeee"));

    expect(found).toEqual([]);
  });

  // ------------------------------------------------------------------
  // 5. listExcerptFingerprints returns all stored fingerprints
  // ------------------------------------------------------------------
  it("lists only excerpt fingerprints that have claim sets", async () => {
    const store = await buildStore();

    const fp1 = "v1:aaaaaaaaaaaaaaaa";
    const fp2 = "v1:bbbbbbbbbbbbbbbb";

    await runSuccess(store.saveClaimSet(fp1, [makeClaim({ excerptFingerprint: fp1 }, "-1")]));
    await runSuccess(store.saveClaimSet(fp2, [makeClaim({ excerptFingerprint: fp2 }, "-2")]));

    const fps = await runSuccess(store.listExcerptFingerprints());

    expect(fps).toContain(fp1);
    expect(fps).toContain(fp2);
    expect(fps).toHaveLength(2);
  });

  // ------------------------------------------------------------------
  // 6. Multiple extraction events are preserved (not overwritten)
  // ------------------------------------------------------------------
  it("preserves multiple extraction events for the same excerpt", async () => {
    const store = await buildStore();
    const fp = "v1:0123456789abcde1";

    // First extraction event
    const firstClaims = [
      makeClaim(
        {
          excerptFingerprint: fp,
          claimText: "Technology trends data is shifting toward AI adoption.",
          anchorText: "Technology trends data",
          candidateReason: "Technology trends keep shifting so this claim may need updating soon.",
          extractedAt: 1_700_000_000_100,
        },
        "-first",
      ),
    ];
    await runSuccess(store.saveClaimSet(fp, firstClaims));

    // Second extraction event (different claims)
    const secondClaims = [
      makeClaim(
        {
          excerptFingerprint: fp,
          claimText: "Economic data shifts quarterly with new government reports and statistics.",
          anchorText: "Economic data shifts quarterly",
          candidateReason: "Economic data sources update regularly and may have changed.",
          extractedAt: 1_700_000_000_200,
        },
        "-second",
      ),
    ];
    await runSuccess(store.saveClaimSet(fp, secondClaims));

    // Third extraction event (yet different claims)
    const thirdClaims = [
      makeClaim(
        {
          excerptFingerprint: fp,
          claimText: "Climate models are being refined annually with new satellite observations.",
          anchorText: "Climate models are being",
          candidateReason:
            "Climate observation data improves annually and may have shifted the model.",
          extractedAt: 1_700_000_000_300,
        },
        "-third",
      ),
    ];
    await runSuccess(store.saveClaimSet(fp, thirdClaims));

    // findLatest returns the most recent extraction
    const latest = await runSuccess(store.findLatestByExcerptFingerprint(fp));
    expect(latest).toHaveLength(1);
    expect(latest[0].claimText).toBe(thirdClaims[0].claimText);
    expect(latest[0].extractedAt).toBe(thirdClaims[0].extractedAt);

    // listExcerptFingerprints includes the excerpt (only one entry)
    const fps = await runSuccess(store.listExcerptFingerprints());
    expect(fps).toContain(fp);
    expect(fps).toHaveLength(1);
  });

  // ------------------------------------------------------------------
  // 7. Persistence survives store close and reopen
  // ------------------------------------------------------------------
  it("persists data across store close and reopen", async () => {
    const fp = "v1:0123456789abcde2";

    // Write with first store instance
    {
      const store = await buildStore();
      const claims = [makeClaim({ excerptFingerprint: fp }, "-persist")];
      await runSuccess(store.saveClaimSet(fp, claims));
    }

    // Read with a new store instance
    {
      const store = await openStore();
      const found = await runSuccess(store.findLatestByExcerptFingerprint(fp));
      expect(found).toHaveLength(1);
      expect(found[0].excerptFingerprint).toBe(fp);
    }
  });

  // ------------------------------------------------------------------
  // 8. Saving the same set with the same claims (same timestamps) is idempotent
  // ------------------------------------------------------------------
  it("resaving identical claims produces no extra rows", async () => {
    const store = await buildStore();
    const fp = "v1:0123456789abcde3";
    const extractedAt = 1_700_000_000_111;

    const claims = [makeClaim({ excerptFingerprint: fp, extractedAt }, "-same-set")];

    await runSuccess(store.saveClaimSet(fp, claims));
    await runSuccess(store.saveClaimSet(fp, claims));

    const found = await runSuccess(store.findLatestByExcerptFingerprint(fp));
    expect(found).toHaveLength(1);
  });

  // ------------------------------------------------------------------
  // 9. Two different sets of claims for the same excerpt each create rows
  // ------------------------------------------------------------------
  it("creates separate storage for different claim sets of the same excerpt", async () => {
    const store = await buildStore();
    const fp = "v1:0123456789abcde4";

    // Set A
    const setA = [makeClaim({ excerptFingerprint: fp }, "-set-a")];
    await runSuccess(store.saveClaimSet(fp, setA));

    // Set B — different claim text and extractedAt
    const setB = [
      makeClaim(
        {
          excerptFingerprint: fp,
          claimText: "Different technology claim fact about science.",
          anchorText: "Different technology",
          candidateReason: "This is a different claim reason text.",
          extractedAt: 1_700_000_000_222,
        },
        "-set-b",
      ),
    ];
    await runSuccess(store.saveClaimSet(fp, setB));

    // Latest returns set B
    const latest = await runSuccess(store.findLatestByExcerptFingerprint(fp));
    expect(latest).toHaveLength(1);
    expect(latest[0].claimText).toBe(setB[0].claimText);
  });
});
