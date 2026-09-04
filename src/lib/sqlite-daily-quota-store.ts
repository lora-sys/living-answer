import { Effect } from "effect";

import { createRequire } from "node:module";
import type { DailyQuotaOutcome, DailyQuotaStore } from "./daily-quota";
import { DailyQuotaStoreError } from "./daily-quota";

const require = createRequire(import.meta.url);

// ── SQL ───────────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS provider_quota_usage (
  provider   TEXT    NOT NULL,
  quota_day  TEXT    NOT NULL,
  used_count INTEGER NOT NULL CHECK (used_count >= 0),
  PRIMARY KEY (provider, quota_day)
);
`;

const INSERT_DAY_SQL = `
INSERT OR IGNORE INTO provider_quota_usage (provider, quota_day, used_count)
VALUES (?, ?, 0);
`;

const SELECT_DAY_SQL = `
SELECT used_count
FROM provider_quota_usage
WHERE provider = ? AND quota_day = ?;
`;

const INCREMENT_DAY_SQL = `
UPDATE provider_quota_usage
SET used_count = used_count + 1
WHERE provider = ? AND quota_day = ?;
`;

// ── Store ─────────────────────────────────────────────────────────────────────

const DEFAULT_DB_PATH = process.env.QUOTA_DB_PATH ?? ".local/provider-quota.db";

export const makeSqliteDailyQuotaStore = (
  dbPath = DEFAULT_DB_PATH,
): Effect.Effect<DailyQuotaStore, DailyQuotaStoreError> =>
  Effect.gen(function* () {
    const database = yield* Effect.try({
      try: () => {
        const nodePath = require("node:path") as typeof import("node:path");
        const nodeFs = require("node:fs") as typeof import("node:fs");
        const parent = nodePath.dirname(dbPath);
        if (!nodeFs.existsSync(parent)) {
          nodeFs.mkdirSync(parent, { recursive: true });
        }

        return require("better-sqlite3")(dbPath, { fileMustExist: false });
      },
      catch: (error) =>
        new DailyQuotaStoreError({
          reason: `failed to open sqlite db: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });

    yield* Effect.try({
      try: () => database.exec(SCHEMA_SQL),
      catch: (error) =>
        new DailyQuotaStoreError({
          reason: `schema migration failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });

    const insertDayStmt = database.prepare(INSERT_DAY_SQL);
    const selectDayStmt = database.prepare(SELECT_DAY_SQL);
    const incrementDayStmt = database.prepare(INCREMENT_DAY_SQL);

    const reserve = (
      provider: string,
      quotaDay: string,
      limit: number,
    ): Effect.Effect<DailyQuotaOutcome, DailyQuotaStoreError> =>
      Effect.try({
        try: () =>
          database.transaction((): DailyQuotaOutcome => {
            insertDayStmt.run(provider, quotaDay);
            const row = selectDayStmt.get(provider, quotaDay) as { used_count: number } | undefined;

            if (!row || Number(row.used_count) >= limit) {
              return "exhausted";
            }

            incrementDayStmt.run(provider, quotaDay);
            return "allowed";
          })(),
        catch: (error) =>
          new DailyQuotaStoreError({
            reason: `reserve failed: ${error instanceof Error ? error.message : String(error)}`,
          }),
      });

    return { reserve };
  });
