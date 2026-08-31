import { Clock, Data, Effect } from "effect";

// ── Errors ────────────────────────────────────────────────────────────────────

export class DailyQuotaStoreError extends Data.TaggedError("DailyQuotaStoreError")<{
  readonly reason: string;
}> {}

export class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
  readonly provider: string;
  readonly quotaDay: string;
}> {}

// ── Types ─────────────────────────────────────────────────────────────────────

export type DailyQuotaOutcome = "allowed" | "exhausted";

/**
 * A durable reservation boundary.  Implementations must atomically reserve one
 * attempt when usage is below `limit`; exhausted reservations must not advance
 * the counter.
 */
export interface DailyQuotaStore {
  readonly reserve: (
    provider: string,
    quotaDay: string,
    limit: number,
  ) => Effect.Effect<DailyQuotaOutcome, DailyQuotaStoreError>;
}

export interface DailyQuotaGuard {
  readonly consume: (
    provider: string,
  ) => Effect.Effect<void, QuotaExceededError | DailyQuotaStoreError>;
}

export interface DailyQuotaGuardOptions {
  readonly store: DailyQuotaStore;
  readonly limitPerDay: number;
  readonly now?: () => Effect.Effect<number, never>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const utcDayKey = (millis: number): string => {
  const date = new Date(millis);
  const yyyy = String(date.getUTCFullYear()).padStart(4, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// ── Guard ─────────────────────────────────────────────────────────────────────

export const makeDailyQuotaGuard = (options: DailyQuotaGuardOptions): DailyQuotaGuard => {
  if (!Number.isSafeInteger(options.limitPerDay) || options.limitPerDay < 0) {
    throw new Error("limitPerDay must be a non-negative safe integer");
  }

  const clockNow = options.now ?? (() => Clock.currentTimeMillis);

  return {
    consume: (provider) =>
      Effect.flatMap(clockNow(), (millis) => {
        const quotaDay = utcDayKey(millis);

        return Effect.flatMap(
          options.store.reserve(provider, quotaDay, options.limitPerDay),
          (outcome) =>
            outcome === "allowed"
              ? Effect.void
              : Effect.fail(new QuotaExceededError({ provider, quotaDay })),
        );
      }),
  };
};
