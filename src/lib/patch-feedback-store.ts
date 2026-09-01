import { Data, Effect } from "effect";

import { createRequire } from "node:module";

import type { PatchFeedbackRecord, PatchFeedbackReviewState } from "./patch-feedback";

const require = createRequire(import.meta.url);

export class PatchFeedbackStoreError extends Data.TaggedError("PatchFeedbackStoreError")<{
  readonly reason: string;
}> {}

export interface StoredPatchFeedback extends PatchFeedbackRecord {
  readonly reviewState: PatchFeedbackReviewState;
  readonly reviewedAt: number;
}

export interface PatchFeedbackStore {
  readonly save: (
    feedback: PatchFeedbackRecord,
    reviewState: PatchFeedbackReviewState,
    reviewedAt: number,
  ) => Effect.Effect<StoredPatchFeedback, PatchFeedbackStoreError>;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS patch_feedback (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_fingerprint TEXT    NOT NULL UNIQUE,
  question_id          TEXT    NOT NULL,
  answer_id            TEXT    NOT NULL,
  excerpt_fingerprint  TEXT    NOT NULL,
  record_fingerprint   TEXT,
  reason               TEXT    NOT NULL,
  question             TEXT,
  evidence_url         TEXT,
  evidence_quote       TEXT,
  submitted_at         INTEGER NOT NULL,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS patch_feedback_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_id       INTEGER NOT NULL,
  event_fingerprint TEXT    NOT NULL UNIQUE,
  review_state      TEXT    NOT NULL,
  event_at          INTEGER NOT NULL,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (feedback_id) REFERENCES patch_feedback(id)
);

CREATE INDEX IF NOT EXISTS idx_patch_feedback_target
  ON patch_feedback (question_id, answer_id, submitted_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_patch_feedback_state
  ON patch_feedback_events (review_state, event_at DESC, id DESC);
`;

const INSERT_FEEDBACK_SQL = `
INSERT OR IGNORE INTO patch_feedback
  (feedback_fingerprint, question_id, answer_id, excerpt_fingerprint, record_fingerprint,
   reason, question, evidence_url, evidence_quote, submitted_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_EVENT_SQL = `
INSERT OR IGNORE INTO patch_feedback_events
  (feedback_id, event_fingerprint, review_state, event_at)
VALUES (?, ?, ?, ?)
`;

const FIND_FEEDBACK_BY_FINGERPRINT_SQL = `
SELECT f.id,
       f.feedback_fingerprint,
       f.question_id,
       f.answer_id,
       f.excerpt_fingerprint,
       f.record_fingerprint,
       f.reason,
       f.question,
       f.evidence_url,
       f.evidence_quote,
       f.submitted_at,
       e.review_state,
       e.event_at AS reviewed_at
FROM patch_feedback f
JOIN patch_feedback_events e
  ON e.id = (
    SELECT event.id
    FROM patch_feedback_events event
    WHERE event.feedback_id = f.id
    ORDER BY event.event_at DESC, event.id DESC
    LIMIT 1
  )
WHERE f.feedback_fingerprint = ?
`;

const FIND_FEEDBACK_ID_SQL = `
SELECT id
FROM patch_feedback
WHERE feedback_fingerprint = ?
`;

const DEFAULT_DB_PATH = ".local/patch-feedback.db";

type FeedbackRow = Record<string, unknown>;

const REVIEW_STATES: readonly PatchFeedbackReviewState[] = [
  "PENDING_REVIEW",
  "EVIDENCE_GATE_PASSED",
  "EVIDENCE_GATE_INSUFFICIENT",
  "EVIDENCE_GATE_REJECTED",
  "REVIEW_ERROR",
];

const parseReviewState = (value: unknown): PatchFeedbackReviewState => {
  return typeof value === "string" && REVIEW_STATES.includes(value as PatchFeedbackReviewState)
    ? (value as PatchFeedbackReviewState)
    : "PENDING_REVIEW";
};

const optionalText = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

const mapRowToFeedback = (row: FeedbackRow): StoredPatchFeedback => {
  const recordFingerprint = optionalText(row.record_fingerprint);
  const question = optionalText(row.question);
  const evidenceUrl = optionalText(row.evidence_url);
  const evidenceQuote = optionalText(row.evidence_quote);

  return {
    questionId: String(row.question_id),
    answerId: String(row.answer_id),
    excerptFingerprint: String(row.excerpt_fingerprint),
    ...(recordFingerprint === undefined ? {} : { recordFingerprint }),
    reason: String(row.reason) as PatchFeedbackRecord["reason"],
    ...(question === undefined ? {} : { question }),
    ...(evidenceUrl === undefined ? {} : { evidenceUrl }),
    ...(evidenceQuote === undefined ? {} : { evidenceQuote }),
    submittedAt: Number(row.submitted_at),
    feedbackFingerprint: String(row.feedback_fingerprint),
    reviewState: parseReviewState(row.review_state),
    reviewedAt: Number(row.reviewed_at),
  };
};

const buildEventFingerprint = (
  feedbackFingerprint: string,
  reviewState: PatchFeedbackReviewState,
  eventAt: number,
): string => {
  const material = ["patchFeedbackEvent", feedbackFingerprint, reviewState, String(eventAt)].join(
    "\n",
  );
  const FNV_OFFSET_BASIS = 14695981039346656037n;
  const fnvPrime = 1099511628211n;
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < material.length; index += 1) {
    hash ^= BigInt(material.charCodeAt(index));
    hash *= fnvPrime;
  }
  const mask = 0xffffffffn;
  const high = Number((hash >> 32n) & mask);
  const low = Number(hash & mask);
  return `v1:${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
};

export const makeSqlitePatchFeedbackStore = (
  dbPath = DEFAULT_DB_PATH,
): Effect.Effect<PatchFeedbackStore, PatchFeedbackStoreError> =>
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
      catch: (error: unknown) =>
        new PatchFeedbackStoreError({
          reason: `failed to open sqlite db at ${dbPath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        }),
    });

    yield* Effect.try({
      try: () => database.exec(SCHEMA_SQL),
      catch: (error: unknown) =>
        new PatchFeedbackStoreError({
          reason: `schema migration failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });

    const insertFeedbackStmt = database.prepare(INSERT_FEEDBACK_SQL);
    const insertEventStmt = database.prepare(INSERT_EVENT_SQL);
    const findFeedbackStmt = database.prepare(FIND_FEEDBACK_BY_FINGERPRINT_SQL);
    const findIdStmt = database.prepare(FIND_FEEDBACK_ID_SQL);

    const save = (
      feedback: PatchFeedbackRecord,
      reviewState: PatchFeedbackReviewState,
      reviewedAt: number,
    ): Effect.Effect<StoredPatchFeedback, PatchFeedbackStoreError> =>
      Effect.try({
        try: () => {
          const transaction = database.transaction((): StoredPatchFeedback => {
            const inserted = insertFeedbackStmt.run(
              feedback.feedbackFingerprint,
              feedback.questionId,
              feedback.answerId,
              feedback.excerptFingerprint,
              feedback.recordFingerprint ?? null,
              feedback.reason,
              feedback.question ?? null,
              feedback.evidenceUrl ?? null,
              feedback.evidenceQuote ?? null,
              feedback.submittedAt,
            );

            // A repeated submission keeps its original review event; the
            // feedback fingerprint is the queue's idempotency key.
            const feedbackRow = findIdStmt.get(feedback.feedbackFingerprint) as
              | { id: number }
              | undefined;
            if (!feedbackRow) {
              throw new Error("failed to read persisted feedback");
            }

            if (inserted.changes > 0) {
              insertEventStmt.run(
                feedbackRow.id,
                buildEventFingerprint(feedback.feedbackFingerprint, reviewState, reviewedAt),
                reviewState,
                reviewedAt,
              );
            }

            const stored = findFeedbackStmt.get(feedback.feedbackFingerprint) as
              | FeedbackRow
              | undefined;
            if (!stored) {
              throw new Error("failed to read stored feedback");
            }
            return mapRowToFeedback(stored);
          });

          return transaction();
        },
        catch: (error: unknown) =>
          new PatchFeedbackStoreError({
            reason: `save feedback failed: ${error instanceof Error ? error.message : String(error)}`,
          }),
      });

    return { save };
  });
