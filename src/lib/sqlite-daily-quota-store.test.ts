import { Effect } from "effect";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { makeSqliteDailyQuotaStore } from "./sqlite-daily-quota-store";

const tempDirs: string[] = [];

const makeDbPath = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "living-answer-quota-"));
  tempDirs.push(dir);
  return join(dir, "provider-quota.db");
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("sqlite daily quota store", () => {
  it("reserves attempts up to the daily limit", async () => {
    const store = await Effect.runPromise(makeSqliteDailyQuotaStore(makeDbPath()));

    expect(await Effect.runPromise(store.reserve("zhihu_search", "2026-08-31", 2))).toBe("allowed");
    expect(await Effect.runPromise(store.reserve("zhihu_search", "2026-08-31", 2))).toBe("allowed");
    expect(await Effect.runPromise(store.reserve("zhihu_search", "2026-08-31", 2))).toBe(
      "exhausted",
    );
  });

  it("separates providers and resets on a new UTC day", async () => {
    const store = await Effect.runPromise(makeSqliteDailyQuotaStore(makeDbPath()));

    expect(await Effect.runPromise(store.reserve("zhihu_search", "2026-08-31", 1))).toBe("allowed");
    expect(await Effect.runPromise(store.reserve("global_search", "2026-08-31", 1))).toBe(
      "allowed",
    );
    expect(await Effect.runPromise(store.reserve("zhihu_search", "2026-09-01", 1))).toBe("allowed");
  });

  it("does not advance usage when the limit is zero", async () => {
    const store = await Effect.runPromise(makeSqliteDailyQuotaStore(makeDbPath()));

    expect(await Effect.runPromise(store.reserve("zhihu_search", "2026-08-31", 0))).toBe(
      "exhausted",
    );
  });
});
