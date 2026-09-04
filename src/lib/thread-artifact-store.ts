import { Data, Effect } from "effect";

import { createQuestionLearningThread } from "./thread-artifact";
import type { QuestionLearningThread } from "./thread-artifact";

// ── Errors ─────────────────────────────────────────────────────────────────────

export class StoreError extends Data.TaggedError("StoreError")<{
  readonly reason: string;
}> {}

// ── Interface ──────────────────────────────────────────────────────────────────

export interface ThreadArtifactStore {
  readonly save: (artifact: QuestionLearningThread) => Effect.Effect<void, StoreError>;
  readonly findById: (threadId: string) => Effect.Effect<QuestionLearningThread | null, StoreError>;
}

// ── SQL ────────────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS thread_artifacts (
  thread_id     TEXT    NOT NULL,
  question      TEXT    NOT NULL,
  refined_query TEXT    NOT NULL,
  created_at    INTEGER NOT NULL,
  artifact_json TEXT    NOT NULL,
  fingerprint   TEXT    NOT NULL,
  created_at_db INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (thread_id, fingerprint)
);
`;

const INSERT_OR_IGNORE_SQL = `
INSERT OR IGNORE INTO thread_artifacts
  (thread_id, question, refined_query, created_at, artifact_json, fingerprint)
VALUES
  (?, ?, ?, ?, ?, ?);
`;

const FIND_BY_ID_SQL = `
SELECT thread_id, question, refined_query, created_at, artifact_json, fingerprint
FROM thread_artifacts
WHERE thread_id = ?;
`;

// ── Default DB path ────────────────────────────────────────────────────────────

const DEFAULT_DB_PATH = process.env.DATABASE_PATH ?? ".local/thread-artifacts.db";

/**
 * Create a lazy Effect that opens (or creates) a SQLite database at `dbPath`
 * (defaults to `.local/thread-artifacts.db`).
 *
 * The database file and parent directories are created on first evaluation,
 * and the schema is applied idempotently.
 */
export const makeSqliteThreadArtifactStore = (
  dbPath = DEFAULT_DB_PATH,
): Effect.Effect<ThreadArtifactStore, StoreError> =>
  Effect.gen(function* () {
    const database = yield* Effect.tryPromise({
      try: async () => {
        const nodePath = (await import("node:path")).default;
        const nodeFs = (await import("node:fs")).default;
        const betterSqlite3 = (await import("better-sqlite3")).default;

        const parent = nodePath.dirname(dbPath);
        if (!nodeFs.existsSync(parent)) {
          nodeFs.mkdirSync(parent, { recursive: true });
        }
        return betterSqlite3(dbPath, { fileMustExist: false });
      },
      catch: (e: unknown) =>
        new StoreError({
          reason: `failed to open sqlite db at ${dbPath}: ${e instanceof Error ? e.message : String(e)}`,
        }),
    });

    yield* Effect.try({
      try: () => database.exec(SCHEMA_SQL),
      catch: (e: unknown) =>
        new StoreError({
          reason: `schema migration failed: ${e instanceof Error ? e.message : String(e)}`,
        }),
    });

    const insertStmt = database.prepare(INSERT_OR_IGNORE_SQL);
    const findStmt = database.prepare(FIND_BY_ID_SQL);

    const save = (artifact: QuestionLearningThread): Effect.Effect<void, StoreError> =>
      Effect.try({
        try: () => {
          insertStmt.run(
            artifact.threadId,
            artifact.question,
            artifact.refinedQuery,
            artifact.createdAt,
            JSON.stringify(artifact),
            artifact.fingerprint,
          );
        },
        catch: (e: unknown) =>
          new StoreError({
            reason: `save failed: ${e instanceof Error ? e.message : String(e)}`,
          }),
      });

    const findById = (threadId: string): Effect.Effect<QuestionLearningThread | null, StoreError> =>
      Effect.try({
        try: () => {
          const row = findStmt.get(threadId) as Record<string, unknown> | undefined;
          if (!row) return null;

          const parsed = JSON.parse(String(row.artifact_json)) as unknown;
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new Error("artifact_json is not an object");
          }

          // Ensure threadId and fingerprint from the row match the payload
          const obj = parsed as Record<string, unknown>;
          if (obj.threadId !== String(row.thread_id)) {
            throw new Error("threadId mismatch");
          }
          if (obj.fingerprint !== String(row.fingerprint)) {
            throw new Error("fingerprint mismatch");
          }

          // Validate through the factory — this ensures every row that enters
          // React has passed the full domain validation.
          const result = createQuestionLearningThread({
            threadId: String(row.thread_id),
            question: String(row.question),
            refinedQuery: String(row.refined_query),
            createdAt: Number(row.created_at),
            timelineStages: Array.isArray((obj as { timelineStages?: unknown[] }).timelineStages)
              ? ((obj as { timelineStages: unknown[] })
                  .timelineStages as import("./thread-artifact").TimelineStageInput[])
              : [],
            learningNodes: Array.isArray((obj as { learningNodes?: unknown[] }).learningNodes)
              ? ((obj as { learningNodes: unknown[] })
                  .learningNodes as import("./thread-artifact").LearningNodeInput[])
              : [],
            learningGuide:
              typeof (obj as { learningGuide?: unknown }).learningGuide === "object" &&
              (obj as { learningGuide?: unknown }).learningGuide !== null
                ? (obj as { learningGuide: import("./thread-artifact").LearningGuideInput })
                    .learningGuide
                : undefined,
            uncertainty:
              typeof (obj as { uncertainty?: unknown }).uncertainty === "number"
                ? (obj as { uncertainty: number }).uncertainty
                : 0,
          });

          if (result._tag === "failure") {
            throw new Error(`invalid stored artifact: ${result.reason}`);
          }
          return result.artifact;
        },
        catch: (e: unknown) =>
          new StoreError({
            reason: `findById failed: ${e instanceof Error ? e.message : String(e)}`,
          }),
      });

    return { save, findById };
  });
