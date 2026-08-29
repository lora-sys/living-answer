import { beforeAll, describe, expect, it } from "vite-plus/test";

import { CacheMiss, makeQueryCache } from "./query-cache";

// ---- Helpers -----------------------------------------------------------

let _now = 0;
export const advance = (ms: number): void => {
  _now += ms;
};

// ---- Tests -------------------------------------------------------------

describe("query-cache", () => {
  beforeAll(() => {
    _now = 0;
  });

  // ------------------------------------------------------------------
  // 1. miss → set → hit basic cycle
  // ------------------------------------------------------------------
  it("returns CacheMiss for a key that is not yet set", async () => {
    const { Effect } = await import("effect");

    // Build cache synchronously with fake clock
    let localNow = 0;
    const cacheResult = await Effect.runPromise(
      makeQueryCache<string, number>({ ttl: 1000, now: () => Effect.succeed(localNow) }),
    );

    const exit = await Effect.runPromiseExit(cacheResult.get("k1"));
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
      expect(failure).toBeInstanceOf(CacheMiss);
      if (failure instanceof CacheMiss) expect(failure.key).toBe("k1");
    }
  });

  it("set then get returns the cached value", async () => {
    const { Effect } = await import("effect");
    const localNow = 0;
    const cache = await Effect.runPromise(
      makeQueryCache<string, number>({ ttl: 1000, now: () => Effect.succeed(localNow) }),
    );

    await Effect.runPromise(cache.set("k1", 42));
    const value = await Effect.runPromise(cache.get("k1"));
    expect(value).toBe(42);
  });

  // ------------------------------------------------------------------
  // 2. TTL expiry: get returns CacheMiss and entries count decreases
  // ------------------------------------------------------------------
  it("expired entry becomes a miss and is removed", async () => {
    const { Effect } = await import("effect");
    const ttl = 500;
    const cache = await Effect.runPromise(
      makeQueryCache<string, number>({ ttl, now: () => Effect.succeed(_now) }),
    );

    await Effect.runPromise(cache.set("k1", 10));
    expect((await Effect.runPromise(cache.stats())).entries).toBe(1);

    advance(ttl + 10);

    let threw = false;
    try {
      await Effect.runPromise(cache.get("k1"));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect((await Effect.runPromise(cache.stats())).entries).toBe(0);
  });

  // ------------------------------------------------------------------
  // 3. getOrSet single-flight: compute runs exactly once
  // ------------------------------------------------------------------
  it("getOrSet runs compute only once for concurrent same-key calls", async () => {
    const { Deferred, Effect, Fiber } = await import("effect");
    const cache = await Effect.runPromise(
      makeQueryCache<string, number>({ ttl: 2000, now: () => Effect.succeed(_now) }),
    );

    const gate = await Effect.runPromise(Deferred.make<void>());
    let calls = 0;
    const compute = () => {
      calls++;
      return Effect.zipRight(Deferred.await(gate), Effect.succeed(99));
    };

    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const fib1 = yield* Effect.fork(cache.getOrSet("sf", compute));
        const fib2 = yield* Effect.fork(cache.getOrSet("sf", compute));
        yield* Effect.yieldNow();
        yield* Deferred.succeed(gate, undefined);
        const result1 = yield* Fiber.join(fib1);
        const result2 = yield* Fiber.join(fib2);
        return [result1, result2];
      }),
    );
    expect(results[0]).toBe(99);
    expect(results[1]).toBe(99);

    expect(calls).toBe(1); // single-flight
  });

  // ------------------------------------------------------------------
  // 4. getOrSet compute failure: not cached; third call re-computes
  // ------------------------------------------------------------------
  it("getOrSet failure distributes error and does not cache", async () => {
    const { Deferred, Effect, Fiber } = await import("effect");
    const cache = await Effect.runPromise(
      makeQueryCache<string, number>({ ttl: 2000, now: () => Effect.succeed(_now) }),
    );

    const gate = await Effect.runPromise(Deferred.make<void>());
    let calls = 0;
    const boom = () => {
      calls++;
      return Effect.zipRight(Deferred.await(gate), Effect.fail(new Error("boom")));
    };

    const [exit1, exit2] = await Effect.runPromise(
      Effect.gen(function* () {
        const fib1 = yield* Effect.fork(cache.getOrSet("failKey", boom));
        const fib2 = yield* Effect.fork(cache.getOrSet("failKey", boom));
        yield* Effect.yieldNow();
        yield* Deferred.succeed(gate, undefined);
        const exit1 = yield* Effect.exit(Fiber.join(fib1));
        const exit2 = yield* Effect.exit(Fiber.join(fib2));
        return [exit1, exit2];
      }),
    );
    const err1 =
      exit1._tag === "Failure" && exit1.cause._tag === "Fail" ? exit1.cause.error : undefined;
    const err2 =
      exit2._tag === "Failure" && exit2.cause._tag === "Fail" ? exit2.cause.error : undefined;

    expect(calls).toBe(1);
    expect(err1).toBeInstanceOf(Error);
    expect(err1!.message).toBe("boom");
    expect(err2).toBeInstanceOf(Error);
    expect(err2!.message).toBe("boom");

    // Third call should recompute (failure was not cached)
    expect(calls).toBe(1);
    const thirdExit = await Effect.runPromiseExit(cache.getOrSet("failKey", boom));
    expect(thirdExit._tag).toBe("Failure");
    expect(calls).toBe(2); // recomputed
  });

  // ------------------------------------------------------------------
  // 5. maxEntries: oldest entry is evicted; get returns miss
  // ------------------------------------------------------------------
  it("evicts oldest entries when capacity is exceeded", async () => {
    const { Effect } = await import("effect");
    const cache = await Effect.runPromise(
      makeQueryCache<string, number>({
        ttl: 5000,
        now: () => Effect.succeed(_now),
        maxEntries: 2,
      }),
    );

    await Effect.runPromise(cache.set("a", 1));
    await Effect.runPromise(cache.set("b", 2));
    await Effect.runPromise(cache.set("c", 3)); // should evict "a"

    const { entries } = await Effect.runPromise(cache.stats());
    expect(entries).toBe(2);

    // "a" is gone
    let threw = false;
    try {
      await Effect.runPromise(cache.get("a"));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // "b" and "c" still present
    expect(await Effect.runPromise(cache.get("b"))).toBe(2);
    expect(await Effect.runPromise(cache.get("c"))).toBe(3);
  });

  // ------------------------------------------------------------------
  // 6. invalidate after set: get returns miss
  // ------------------------------------------------------------------
  it("invalidate removes the entry", async () => {
    const { Effect } = await import("effect");
    const cache = await Effect.runPromise(
      makeQueryCache<string, number>({ ttl: 5000, now: () => Effect.succeed(_now) }),
    );

    await Effect.runPromise(cache.set("k", 7));
    await Effect.runPromise(cache.invalidate("k"));

    let threw = false;
    try {
      await Effect.runPromise(cache.get("k"));
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  // ------------------------------------------------------------------
  // 7. stats.hits/misses/entries match the operation sequence
  // ------------------------------------------------------------------
  it("stats tracks hits and misses", async () => {
    const { Effect } = await import("effect");
    const cache = await Effect.runPromise(
      makeQueryCache<string, number>({ ttl: 5000, now: () => Effect.succeed(_now) }),
    );

    // 3 misses (keys not present)
    for (const key of ["x", "y", "z"]) {
      let threw = false;
      try {
        await Effect.runPromise(cache.get(key));
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    }

    // 2 sets
    await Effect.runPromise(cache.set("x", 1));
    await Effect.runPromise(cache.set("y", 2));

    // 2 hits
    expect(await Effect.runPromise(cache.get("x"))).toBe(1);
    expect(await Effect.runPromise(cache.get("y"))).toBe(2);

    const { hits, misses, entries } = await Effect.runPromise(cache.stats());
    expect(hits).toBe(2);
    expect(misses).toBe(3);
    expect(entries).toBe(2);
  });
});
