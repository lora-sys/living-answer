import { Effect } from "effect";

import { describe, expect, it } from "vite-plus/test";

import {
  DailyQuotaStoreError,
  QuotaExceededError,
  makeDailyQuotaGuard,
  utcDayKey,
  type DailyQuotaOutcome,
  type DailyQuotaStore,
} from "./daily-quota";

const makeStore = (results: DailyQuotaOutcome[]): { store: DailyQuotaStore; calls: string[][] } => {
  const calls: string[][] = [];
  let index = 0;

  return {
    calls,
    store: {
      reserve: (provider, quotaDay, limit) =>
        Effect.sync(() => {
          calls.push([provider, quotaDay, String(limit)]);
          const result = results[index];
          index += 1;
          return result ?? "exhausted";
        }),
    },
  };
};

describe("daily quota guard", () => {
  it("uses a UTC calendar-day key", () => {
    expect(utcDayKey(Date.UTC(2026, 7, 31, 23, 59, 59))).toBe("2026-08-31");
    expect(utcDayKey(Date.UTC(2026, 8, 1, 0, 0, 0))).toBe("2026-09-01");
  });

  it("reserves one attempt when the store allows it", async () => {
    const { store, calls } = makeStore(["allowed"]);
    const guard = makeDailyQuotaGuard({
      store,
      limitPerDay: 1000,
      now: () => Effect.succeed(Date.UTC(2026, 7, 31, 12, 0, 0)),
    });

    await Effect.runPromise(guard.consume("zhihu_search"));

    expect(calls).toEqual([["zhihu_search", "2026-08-31", "1000"]]);
  });

  it("fails with a structured quota error before any fetch can run", async () => {
    const { store } = makeStore(["exhausted"]);
    const guard = makeDailyQuotaGuard({
      store,
      limitPerDay: 1000,
      now: () => Effect.succeed(Date.UTC(2026, 7, 31, 12, 0, 0)),
    });

    const exit = await Effect.runPromiseExit(
      Effect.flatMap(guard.consume("global_search"), () => Effect.succeed("called")),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(QuotaExceededError);
    }
  });

  it("propagates store failures so callers can fail closed", async () => {
    const store: DailyQuotaStore = {
      reserve: () => Effect.fail(new DailyQuotaStoreError({ reason: "unavailable" })),
    };
    const guard = makeDailyQuotaGuard({ store, limitPerDay: 1000 });

    const exit = await Effect.runPromiseExit(guard.consume("zhihu_search"));

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure" && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(DailyQuotaStoreError);
    }
  });

  it("rejects an unsafe limit at construction", () => {
    const { store } = makeStore(["allowed"]);

    expect(() => makeDailyQuotaGuard({ store, limitPerDay: Number.NaN })).toThrow();
  });
});
