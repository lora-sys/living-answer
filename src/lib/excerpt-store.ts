import { Data, Effect } from "effect";

import type { AnswerExcerpt } from "./answer-excerpt";

// ── Errors ─────────────────────────────────────────────────────────────────────

/**
 * Tagged error for all store-level failures (open, read, write, schema).
 */
export class StoreError extends Data.TaggedError("StoreError")<{
  readonly reason: string;
}> {}

// ── Interface ──────────────────────────────────────────────────────────────────

export interface ExcerptStore {
  /** Persist a single excerpt. Duplicate (questionId, answerId, fingerprint) rows are silently ignored. */
  readonly save: (excerpt: AnswerExcerpt) => Effect.Effect<void, StoreError>;
  /** Return the most recent excerpt for the given key, or null if none exist. */
  readonly findLatest: (
    questionId: string,
    answerId: string,
  ) => Effect.Effect<AnswerExcerpt | null, StoreError>;
}

// ── SQL ────────────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS excerpts (
  question_id      TEXT    NOT NULL,
  answer_id        TEXT    NOT NULL,
  captured_at      INTEGER NOT NULL,
  source_content_id   TEXT    NOT NULL,
  source_content_type TEXT    NOT NULL,
  source_edit_time    INTEGER NOT NULL,
  excerpt          TEXT    NOT NULL,
  fingerprint      TEXT    NOT NULL,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (question_id, answer_id, fingerprint)
);
`;

const INSERT_OR_IGNORE_SQL = `
INSERT OR IGNORE INTO excerpts
  (question_id, answer_id, captured_at, source_content_id, source_content_type, source_edit_time, excerpt, fingerprint)
VALUES
  (?, ?, ?, ?, ?, ?, ?, ?);
`;

const FIND_LATEST_SQL = `
SELECT question_id, answer_id, captured_at, source_content_id, source_content_type, source_edit_time, excerpt, fingerprint
FROM excerpts
WHERE question_id = ? AND answer_id = ?
ORDER BY captured_at DESC
LIMIT 1;
`;

// ── Default DB path helper ─────────────────────────────────────────────────────

const DEFAULT_DB_PATH = ".local/excerpts.db";

/**
 * Create a lazy Effect that opens (or creates) a SQLite database at `dbPath`
 * (defaults to `.local/excerpts.db`).
 *
 * The database file and parent directories are created on first evaluation,
 * and the schema is applied idempotently.
 */
export const makeSqliteExcerptStore = (
  dbPath = DEFAULT_DB_PATH,
): Effect.Effect<ExcerptStore, StoreError> =>
  Effect.gen(function* () {
    // Open the db lazily (only when the Effect is run)
    const database = yield* Effect.try({
      try: () => {
        // Ensure parent directory exists
        const nodePath = require("node:path") as typeof import("node:path");
        const nodeFs = require("node:fs") as typeof import("node:fs");
        const parent = nodePath.dirname(dbPath);
        if (!nodeFs.existsSync(parent)) {
          nodeFs.mkdirSync(parent, { recursive: true });
        }

        // Use require because better-sqlite3 uses `module.exports` (CommonJS)
        return require("better-sqlite3")(dbPath, { fileMustExist: false });
      },
      catch: (e: unknown) =>
        new StoreError({
          reason: `failed to open sqlite db at ${dbPath}: ${e instanceof Error ? e.message : String(e)}`,
        }),
    });

    // Run schema migration (idempotent)
    yield* Effect.try({
      try: () => database.exec(SCHEMA_SQL),
      catch: (e: unknown) =>
        new StoreError({
          reason: `schema migration failed: ${e instanceof Error ? e.message : String(e)}`,
        }),
    });

    // Prepare statements once for efficiency
    const insertStmt = database.prepare(INSERT_OR_IGNORE_SQL);
    const findStmt = database.prepare(FIND_LATEST_SQL);

    const save = (excerpt: AnswerExcerpt): Effect.Effect<void, StoreError> =>
      Effect.try({
        try: () => {
          insertStmt.run(
            excerpt.questionId,
            excerpt.answerId,
            excerpt.capturedAt,
            excerpt.sourceContentId,
            excerpt.sourceContentType,
            excerpt.sourceEditTime,
            excerpt.excerpt,
            excerpt.fingerprint,
          );
        },
        catch: (e: unknown) =>
          new StoreError({
            reason: `save failed: ${e instanceof Error ? e.message : String(e)}`,
          }),
      });

    const findLatest = (
      questionId: string,
      answerId: string,
    ): Effect.Effect<AnswerExcerpt | null, StoreError> =>
      Effect.try({
        try: () => {
          const row = findStmt.get(questionId, answerId) as Record<string, unknown> | undefined;
          if (!row) return null;

          return {
            questionId: String(row.question_id),
            answerId: String(row.answer_id),
            capturedAt: Number(row.captured_at),
            sourceContentId: String(row.source_content_id),
            sourceContentType: row.source_content_type as AnswerExcerpt["sourceContentType"],
            sourceEditTime: Number(row.source_edit_time),
            excerpt: String(row.excerpt),
            fingerprint: String(row.fingerprint),
          };
        },
        catch: (e: unknown) =>
          new StoreError({
            reason: `findLatest failed: ${e instanceof Error ? e.message : String(e)}`,
          }),
      });

    return { save, findLatest };
  });
