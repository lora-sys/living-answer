import { Clock, Data, Deferred, Duration, Effect, Equal, Ref } from "effect";

// ── Errors ───────────────────────────────────────────────────────────────

/**
 * Raised by {@link QueryCache.get} when the key is absent or expired. The
 * `key` field records which lookup missed, for debugging and metrics.
 */
export class CacheMiss<K> extends Data.TaggedError("CacheMiss")<{
  readonly key: K;
}> {}

// ── Public types ─────────────────────────────────────────────────────────

export interface CacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly entries: number;
}

export interface MakeOptions {
  readonly ttl: Duration.DurationInput;
  /** Injectable clock; defaults to `Clock.currentTimeMillis`. */
  readonly now?: () => Effect.Effect<number, never>;
  readonly maxEntries?: number;
}

/**
 * A generic query cache with TTL, insertion-order eviction, and single-flight
 * `getOrSet`.
 *
 * Obligations:
 *  1. Key equality uses Effect `Equal.equals` when available, else `===`.
 *  2. Time is only read through the injectable `now` callback.
 *  3. `stats` is a read-only snapshot with no side effects.
 *  4. Failed computes are not cached: the next `getOrSet` recomputes.
 *  5. All mutable state lives in a private `Ref`; nothing mutable is exported.
 *
 * `getOrSet` keeps the compute error type `E` in the returned effect's error
 * channel. `E extends Error` because concurrent same-key callers share one
 * error mailbox; plain object failures (non-`Error`) are outside the contract.
 */
export interface QueryCache<K, V> {
  readonly get: (key: K) => Effect.Effect<V, CacheMiss<K>>;
  readonly set: (key: K, value: V) => Effect.Effect<void>;
  readonly getOrSet: <E extends Error>(
    key: K,
    compute: () => Effect.Effect<V, E>,
  ) => Effect.Effect<V, Error | CacheMiss<K>>;
  readonly invalidate: (key: K) => Effect.Effect<void>;
  readonly stats: () => Effect.Effect<CacheStats>;
}

// ── Internal state ───────────────────────────────────────────────────────

interface CacheEntry<K, V> {
  readonly key: K;
  readonly value: V;
  readonly expiresAt: number;
  readonly seq: number;
}

interface PendingOp<K, V> {
  readonly key: K;
  /**
   * Error type widens to `Error` because one mailbox serves every concurrent
   * same-key caller; the starter's success/failure paths keep it in sync with
   * whatever the running compute's `E` is, which always extends `Error`.
   */
  readonly deferred: Deferred.Deferred<V, Error>;
}

interface CacheState<K, V> {
  readonly entries: readonly CacheEntry<K, V>[];
  readonly nextSeq: number;
  readonly hits: number;
  readonly misses: number;
  readonly pending: readonly PendingOp<K, V>[];
}

// Both branches use one homogeneous deferred error channel.
type Decision<V> =
  | { readonly _tag: "hit"; readonly value: V }
  | { readonly _tag: "expired" }
  | { readonly _tag: "join"; readonly deferred: Deferred.Deferred<V, Error> }
  | { readonly _tag: "start"; readonly deferred: Deferred.Deferred<V, Error> };

const freshState = <K, V>(): CacheState<K, V> => ({
  entries: [],
  nextSeq: 0,
  hits: 0,
  misses: 0,
  pending: [],
});

// ── Key helpers ──────────────────────────────────────────────────────────

const sameKey = <K>(a: K, b: K): boolean => (Equal.isEqual(a) ? Equal.equals(a, b) : a === b);

const findEntry = <K, V>(
  entries: readonly CacheEntry<K, V>[],
  key: K,
): CacheEntry<K, V> | undefined => entries.find((e) => sameKey(e.key, key));

const findPending = <K, V>(
  pending: readonly PendingOp<K, V>[],
  key: K,
): PendingOp<K, V> | undefined => pending.find((p) => sameKey(p.key, key));

const dropPending = <K, V>(pending: readonly PendingOp<K, V>[], key: K): PendingOp<K, V>[] =>
  pending.filter((p) => !sameKey(p.key, key));

const evictToMax = <K, V>(
  entries: readonly CacheEntry<K, V>[],
  max: number,
): CacheEntry<K, V>[] => {
  if (entries.length <= max) return [...entries];
  const excess = entries.length - max;
  const ranked = [...entries].sort((a, b) => a.seq - b.seq);
  const evictSet = new Set(ranked.slice(0, excess).map((e) => e.seq));
  return entries.filter((e) => !evictSet.has(e.seq));
};

// ── Factory ──────────────────────────────────────────────────────────────

const build = <K, V>(
  stateRef: Ref.Ref<CacheState<K, V>>,
  options: MakeOptions,
): QueryCache<K, V> => {
  const ttlMs = Duration.toMillis(Duration.decode(options.ttl));
  const nowFn: () => Effect.Effect<number, never> = options.now ?? (() => Clock.currentTimeMillis);
  const cap = options.maxEntries ?? 256;

  // ── state transitions (pure) ──

  const addHits = (s: CacheState<K, V>): CacheState<K, V> =>
    Object.freeze({ ...s, hits: s.hits + 1 });

  const bumpMiss = (s: CacheState<K, V>): CacheState<K, V> =>
    Object.freeze({ ...s, misses: s.misses + 1 });

  const missEvict = (s: CacheState<K, V>, key: K): CacheState<K, V> =>
    Object.freeze({
      ...s,
      entries: s.entries.filter((e) => !sameKey(e.key, key)),
      misses: s.misses + 1,
    });

  const writeVal = (s: CacheState<K, V>, key: K, value: V, tick: number): CacheState<K, V> => {
    const ents = s.entries.filter((e) => !sameKey(e.key, key));
    ents.push({ key, value, expiresAt: tick + ttlMs, seq: s.nextSeq });
    return Object.freeze({
      ...s,
      entries: evictToMax(ents, cap),
      nextSeq: s.nextSeq + 1,
    });
  };

  const clearPending = (s: CacheState<K, V>, key: K): CacheState<K, V> =>
    Object.freeze({ ...s, pending: dropPending(s.pending, key) });

  // ── get ──

  const get = (key: K): Effect.Effect<V, CacheMiss<K>> =>
    Effect.flatMap(nowFn(), (nowMs) =>
      Effect.flatMap(Ref.get(stateRef), (state) => {
        const hit = findEntry(state.entries, key);
        if (hit && hit.expiresAt > nowMs) {
          return Effect.flatMap(Ref.update(stateRef, addHits), () => Effect.succeed(hit.value));
        }
        if (hit) {
          return Effect.flatMap(
            Ref.update(stateRef, (s) => missEvict(s, key)),
            () => Effect.fail(new CacheMiss({ key })),
          );
        }
        return Effect.flatMap(Ref.update(stateRef, bumpMiss), () =>
          Effect.fail(new CacheMiss({ key })),
        );
      }),
    );

  // ── set ──

  const set = (key: K, value: V): Effect.Effect<void> =>
    Effect.flatMap(nowFn(), (nowMs) => Ref.update(stateRef, (s) => writeVal(s, key, value, nowMs)));

  // ── getOrSet ──

  const getOrSet = <E extends Error>(
    key: K,
    compute: () => Effect.Effect<V, E>,
  ): Effect.Effect<V, Error | CacheMiss<K>> =>
    Effect.flatMap(nowFn(), (nowMs) =>
      Effect.flatMap(Deferred.make<V, Error>(), (deferred) =>
        // Hit check, join check, and pending registration happen inside ONE
        // Ref.modify so two concurrent callers can never both take "start".
        Effect.flatMap(
          Ref.modify(stateRef, (s): readonly [Decision<V>, CacheState<K, V>] => {
            const hit = findEntry(s.entries, key);
            if (hit && hit.expiresAt > nowMs) {
              return [{ _tag: "hit", value: hit.value }, addHits(s)];
            }
            if (hit) {
              return [{ _tag: "expired" }, missEvict(s, key)];
            }
            const pending = findPending(s.pending, key);
            if (pending) {
              return [{ _tag: "join", deferred: pending.deferred }, s];
            }
            const nextPending: PendingOp<K, V>[] = [...s.pending, { key, deferred }];
            return [{ _tag: "start", deferred }, Object.freeze({ ...s, pending: nextPending })];
          }),
          (decision): Effect.Effect<V, Error | CacheMiss<K>> => {
            switch (decision._tag) {
              case "hit": {
                return Effect.succeed(decision.value);
              }
              case "expired": {
                return Effect.fail(new CacheMiss({ key }));
              }
              case "join": {
                return Deferred.await(decision.deferred);
              }
              case "start": {
                const own = decision.deferred;
                const runCompute = Effect.ensuring(
                  Effect.flatMap(
                    Effect.exit(
                      Effect.tap(
                        Effect.mapError(compute(), (error: E): Error => error),
                        (val) => Ref.update(stateRef, (s) => writeVal(s, key, val, nowMs)),
                      ),
                    ),
                    (exit) => Deferred.done(own, exit),
                  ),
                  Ref.update(stateRef, (s) => clearPending(s, key)),
                );
                return Effect.zipRight(runCompute, Deferred.await(own));
              }
            }
          },
        ),
      ),
    );

  // ── invalidate / stats ──

  const invalidate = (key: K): Effect.Effect<void> =>
    Ref.update(stateRef, (s) =>
      Object.freeze({
        ...s,
        entries: s.entries.filter((e) => !sameKey(e.key, key)),
      }),
    );

  const stats = (): Effect.Effect<CacheStats> =>
    Effect.map(Ref.get(stateRef), (s) => ({
      hits: s.hits,
      misses: s.misses,
      entries: s.entries.length,
    }));

  return { get, set, getOrSet, invalidate, stats };
};

/**
 * Creates a new query-cache instance. All state is allocated inside the
 * returned `Ref`; the `QueryCache` surface exposes no mutable structure.
 */
export const makeQueryCache = <K, V>(options: MakeOptions): Effect.Effect<QueryCache<K, V>> =>
  Effect.map(Ref.make<CacheState<K, V>>(freshState<K, V>()), (stateRef) =>
    build<K, V>(stateRef, options),
  );
