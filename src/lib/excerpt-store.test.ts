import { beforeAll, describe, expect, it } from "vite-plus/test";

import { Effect } from "effect";

import { createAnswerExcerpt } from "./answer-excerpt";

import type { AnswerExcerpt } from "./answer-excerpt";
import type { ExcerptStore, StoreError } from "./excerpt-store";
import { makeSqliteExcerptStore } from "./excerpt-store";

// ── Helpers ────────────────────────────────────────────────────────────────────

const TEST_DB_PATH = ".local/test-excerpts.db";

/** Build a fully-consistent excerpt with matching fingerprint for the given fields. */
const makeExcerpt = (
  overrides: {
    readonly questionId?: string;
    readonly answerId?: string;
    readonly capturedAt?: number;
    readonly sourceContentId?: string;
    readonly sourceEditTime?: number;
    readonly excerpt?: string;
  } = {},
): AnswerExcerpt => {
  const result = createAnswerExcerpt({
    questionId: overrides.questionId ?? "42",
    answerId: overrides.answerId ?? "100",
    capturedAt: overrides.capturedAt ?? 1_700_000_000_000,
    sourceContentId: overrides.sourceContentId ?? "123",
    sourceContentType: "Answer",
    sourceEditTime: overrides.sourceEditTime ?? 1_699_999_999_000,
    excerpt: overrides.excerpt ?? "This is a test excerpt",
  });

  if (result._tag === "failure") {
    throw new Error(`Failed to create test excerpt: ${result.reason}`);
  }

  return result.excerpt;
};

const cleanup = (path: string): void => {
  try {
    const { unlinkSync, existsSync } = require("node:fs");
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // best-effort cleanup
  }
};

const buildStore = async (dbPath = TEST_DB_PATH): Promise<ExcerptStore> => {
  cleanup(dbPath);
  const store = await Effect.runPromise(makeSqliteExcerptStore(dbPath));
  return store;
};

const reopenStore = async (dbPath = TEST_DB_PATH): Promise<ExcerptStore> => {
  // Do NOT cleanup — just reopen the existing file
  const store = await Effect.runPromise(makeSqliteExcerptStore(dbPath));
  return store;
};

const runSuccess = <A>(effect: Effect.Effect<A, StoreError>): Promise<A> =>
  Effect.runPromise(effect);

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("excerpt-store", () => {
  beforeAll(() => {
    cleanup(TEST_DB_PATH);
  });

  // ------------------------------------------------------------------
  // 1. save and findLatest round-trip
  // ------------------------------------------------------------------
  it("saves and retrieves an excerpt via findLatest", async () => {
    const store = await buildStore();
    const excerpt = makeExcerpt();

    await runSuccess(store.save(excerpt));
    const found = await runSuccess(store.findLatest("42", "100"));

    expect(found).not.toBeNull();
    expect(found!.questionId).toBe("42");
    expect(found!.answerId).toBe("100");
    expect(found!.excerpt).toBe("This is a test excerpt");
    expect(found!.fingerprint).toBe(excerpt.fingerprint);
    expect(found!.capturedAt).toBe(1_700_000_000_000);
  });

  // ------------------------------------------------------------------
  // 2. findLatest returns null for unknown key
  // ------------------------------------------------------------------
  it("returns null for an unknown questionId/answerId pair", async () => {
    const store = await buildStore();

    const found = await runSuccess(store.findLatest("999", "888"));

    expect(found).toBeNull();
  });

  // ------------------------------------------------------------------
  // 3. save dedupes by fingerprint (INSERT OR IGNORE)
  // ------------------------------------------------------------------
  it("does not duplicate rows for the same fingerprint", async () => {
    const store = await buildStore();
    const excerpt = makeExcerpt();

    // Save twice with identical content
    await runSuccess(store.save(excerpt));
    await runSuccess(store.save(excerpt));

    // Should return the same single record
    const found = await runSuccess(store.findLatest("42", "100"));
    expect(found).not.toBeNull();
    expect(found!.fingerprint).toBe(excerpt.fingerprint);
  });

  // ------------------------------------------------------------------
  // 4. INSERT OR IGNORE: different content creates new row
  // ------------------------------------------------------------------
  it("saves a second record with different fingerprint", async () => {
    const store = await buildStore();
    const excerpt1 = makeExcerpt({ excerpt: "first version" });
    const excerpt2 = makeExcerpt({
      excerpt: "second version",
      capturedAt: 1_700_000_000_100,
    });

    await runSuccess(store.save(excerpt1));
    await runSuccess(store.save(excerpt2));

    // findLatest should return the newer one (higher capturedAt)
    const found = await runSuccess(store.findLatest("42", "100"));
    expect(found).not.toBeNull();
    expect(found!.fingerprint).toBe(excerpt2.fingerprint);
    expect(found!.excerpt).toBe("second version");
  });

  // ------------------------------------------------------------------
  // 5. multiple excerpts for same answer (different capturedAt)
  // ------------------------------------------------------------------
  it("stores multiple excerpts for the same answer", async () => {
    const store = await buildStore();
    const excerpt1 = makeExcerpt({ capturedAt: 1_000, excerpt: "v1" });
    const excerpt2 = makeExcerpt({ capturedAt: 2_000, excerpt: "v2" });

    await runSuccess(store.save(excerpt1));
    await runSuccess(store.save(excerpt2));

    const found = await runSuccess(store.findLatest("42", "100"));
    expect(found).not.toBeNull();
    expect(found!.capturedAt).toBe(2_000);
    expect(found!.excerpt).toBe("v2");
  });

  // ------------------------------------------------------------------
  // 6. persistence survives db close and reopen
  // ------------------------------------------------------------------
  it("persists data across store close and reopen", async () => {
    const excerpt = makeExcerpt({ excerpt: "persistent data" });

    // Write with first store instance
    {
      const store = await buildStore();
      await runSuccess(store.save(excerpt));
    }

    // Read with a new store instance (new db connection, same file)
    {
      const store = await reopenStore();
      const found = await runSuccess(store.findLatest("42", "100"));
      expect(found).not.toBeNull();
      expect(found!.excerpt).toBe("persistent data");
    }
  });
});
