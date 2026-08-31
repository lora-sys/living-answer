import { Data, Effect } from "effect";

import {
  buildLifecycleEventFingerprint,
  createPatchLifecycleRecord,
  type PatchLifecycleInput,
  type PatchLifecycleRecord,
  type PatchLifecycleStatus,
} from "./patch-lifecycle";

export class PatchLifecycleStoreError extends Data.TaggedError("PatchLifecycleStoreError")<{
  readonly reason: string;
}> {}

export interface PatchLifecycleRecordWithStatus extends PatchLifecycleRecord {
  readonly status: PatchLifecycleStatus;
}

export interface PatchLifecycleStore {
  readonly saveVisible: (
    input: PatchLifecycleInput,
  ) => Effect.Effect<PatchLifecycleRecordWithStatus, PatchLifecycleStoreError>;
  readonly supersedeByExcerptFingerprint: (
    excerptFingerprint: string,
    eventAt: number,
  ) => Effect.Effect<number, PatchLifecycleStoreError>;
  readonly dispute: (
    recordFingerprint: string,
    eventAt: number,
  ) => Effect.Effect<boolean, PatchLifecycleStoreError>;
  readonly findCurrentByExcerptFingerprint: (
    excerptFingerprint: string,
  ) => Effect.Effect<PatchLifecycleRecordWithStatus | null, PatchLifecycleStoreError>;
  readonly findHistoryByAnswer: (
    questionId: string,
    answerId: string,
  ) => Effect.Effect<readonly PatchLifecycleRecordWithStatus[], PatchLifecycleStoreError>;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS patch_lifecycle_decisions (
  id                            INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id                   TEXT    NOT NULL,
  answer_id                     TEXT    NOT NULL,
  excerpt_fingerprint           TEXT    NOT NULL,
  record_fingerprint            TEXT    NOT NULL UNIQUE,
  reason                        TEXT    NOT NULL,
  selected_evidence_fingerprints TEXT   NOT NULL,
  evidence_summary              TEXT    NOT NULL,
  affected_wording              TEXT,
  current_state                 TEXT,
  impact_on_answer              TEXT,
  captured_at                   INTEGER NOT NULL,
  event_at                      INTEGER NOT NULL,
  created_at                    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_patch_lifecycle_excerpt
  ON patch_lifecycle_decisions (excerpt_fingerprint, event_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS patch_lifecycle_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id       INTEGER NOT NULL,
  event_fingerprint TEXT    NOT NULL UNIQUE,
  status            TEXT    NOT NULL,
  event_at          INTEGER NOT NULL,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (decision_id) REFERENCES patch_lifecycle_decisions(id)
);

CREATE INDEX IF NOT EXISTS idx_patch_lifecycle_events_decision
  ON patch_lifecycle_events (decision_id, event_at DESC, id DESC);
`;

const LATEST_STATUS_JOIN_SQL = `
JOIN patch_lifecycle_events current_event
  ON current_event.id = (
    SELECT e.id
    FROM patch_lifecycle_events e
    WHERE e.decision_id = d.id
    ORDER BY e.event_at DESC, e.id DESC
    LIMIT 1
  )
`;

const SELECT_FIELDS = `
d.id,
d.question_id,
d.answer_id,
d.excerpt_fingerprint,
d.record_fingerprint,
d.reason,
d.selected_evidence_fingerprints,
d.evidence_summary,
d.affected_wording,
d.current_state,
d.impact_on_answer,
d.captured_at,
d.event_at,
current_event.status
`;

const FIND_HISTORY_SQL = `
SELECT ${SELECT_FIELDS}
FROM patch_lifecycle_decisions d
${LATEST_STATUS_JOIN_SQL}
WHERE d.question_id = ? AND d.answer_id = ?
ORDER BY d.event_at DESC, d.id DESC
`;

const FIND_ACTIVE_BY_EXCERPT_SQL = `
SELECT ${SELECT_FIELDS}
FROM patch_lifecycle_decisions d
${LATEST_STATUS_JOIN_SQL}
WHERE d.excerpt_fingerprint = ? AND current_event.status != 'SUPERSEDED'
ORDER BY d.event_at DESC, d.id DESC
`;

const FIND_CURRENT_BY_EXCERPT_SQL = `
SELECT ${SELECT_FIELDS}
FROM patch_lifecycle_decisions d
${LATEST_STATUS_JOIN_SQL}
WHERE d.excerpt_fingerprint = ? AND current_event.status != 'SUPERSEDED'
ORDER BY d.event_at DESC, d.id DESC
LIMIT 1
`;

const FIND_BY_RECORD_FINGERPRINT_SQL = `
SELECT ${SELECT_FIELDS}
FROM patch_lifecycle_decisions d
${LATEST_STATUS_JOIN_SQL}
WHERE d.record_fingerprint = ?
`;

const FIND_DECISION_ID_SQL = `
SELECT id
FROM patch_lifecycle_decisions
WHERE record_fingerprint = ?
`;

const INSERT_DECISION_SQL = `
INSERT OR IGNORE INTO patch_lifecycle_decisions
  (question_id, answer_id, excerpt_fingerprint, record_fingerprint, reason,
   selected_evidence_fingerprints, evidence_summary, affected_wording,
   current_state, impact_on_answer, captured_at, event_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_EVENT_SQL = `
INSERT OR IGNORE INTO patch_lifecycle_events
  (decision_id, event_fingerprint, status, event_at)
VALUES (?, ?, ?, ?)
`;

const DEFAULT_DB_PATH = ".local/patch-lifecycle.db";

type LifecycleRow = Record<string, unknown>;

const parseLifecycleStatus = (value: unknown): PatchLifecycleStatus => {
  return value === "DISPUTED" || value === "SUPERSEDED" ? value : "VISIBLE";
};

const optionalText = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const mapRowToRecord = (row: LifecycleRow): PatchLifecycleRecordWithStatus => {
  const selectedRaw = JSON.parse(String(row.selected_evidence_fingerprints)) as unknown;
  const evidenceRaw = JSON.parse(String(row.evidence_summary)) as unknown;
  const selected = Array.isArray(selectedRaw)
    ? selectedRaw.filter((item): item is string => typeof item === "string")
    : [];
  const evidence = Array.isArray(evidenceRaw)
    ? (evidenceRaw as PatchLifecycleRecord["evidence"])
    : [];

  return {
    questionId: String(row.question_id),
    answerId: String(row.answer_id),
    excerptFingerprint: String(row.excerpt_fingerprint),
    reason: String(row.reason),
    selectedEvidenceFingerprints: selected,
    evidence,
    ...(optionalText(row.affected_wording) !== undefined
      ? { affectedWording: optionalText(row.affected_wording) }
      : {}),
    ...(optionalText(row.current_state) !== undefined
      ? { currentState: optionalText(row.current_state) }
      : {}),
    ...(optionalText(row.impact_on_answer) !== undefined
      ? { impactOnAnswer: optionalText(row.impact_on_answer) }
      : {}),
    capturedAt: Number(row.captured_at),
    eventAt: Number(row.event_at),
    recordFingerprint: String(row.record_fingerprint),
    status: parseLifecycleStatus(row.status),
  };
};

export const makeSqlitePatchLifecycleStore = (
  dbPath = DEFAULT_DB_PATH,
): Effect.Effect<PatchLifecycleStore, PatchLifecycleStoreError> =>
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
        new PatchLifecycleStoreError({
          reason: `failed to open sqlite db at ${dbPath}: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });

    yield* Effect.try({
      try: () => database.exec(SCHEMA_SQL),
      catch: (error: unknown) =>
        new PatchLifecycleStoreError({
          reason: `schema migration failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });

    const findHistoryStmt = database.prepare(FIND_HISTORY_SQL);
    const findActiveStmt = database.prepare(FIND_ACTIVE_BY_EXCERPT_SQL);
    const findCurrentStmt = database.prepare(FIND_CURRENT_BY_EXCERPT_SQL);
    const findByRecordStmt = database.prepare(FIND_BY_RECORD_FINGERPRINT_SQL);
    const findDecisionIdStmt = database.prepare(FIND_DECISION_ID_SQL);
    const insertDecisionStmt = database.prepare(INSERT_DECISION_SQL);
    const insertEventStmt = database.prepare(INSERT_EVENT_SQL);

    const appendEvent = (
      decisionId: number,
      recordFingerprint: string,
      status: PatchLifecycleStatus,
      eventAt: number,
    ): void => {
      insertEventStmt.run(
        decisionId,
        buildLifecycleEventFingerprint(recordFingerprint, status, eventAt),
        status,
        eventAt,
      );
    };

    const saveVisible = (
      input: PatchLifecycleInput,
    ): Effect.Effect<PatchLifecycleRecordWithStatus, PatchLifecycleStoreError> =>
      Effect.try({
        try: () => {
          const created = createPatchLifecycleRecord(input);
          if (created._tag === "failure") {
            throw new Error(created.reason);
          }
          const record = created.record;

          const transaction = database.transaction((): PatchLifecycleRecordWithStatus => {
            const activeRows = findActiveStmt.all(
              input.excerptFingerprint,
            ) as ReadonlyArray<LifecycleRow>;
            for (const activeRow of activeRows) {
              appendEvent(
                Number(activeRow.id),
                String(activeRow.record_fingerprint),
                "SUPERSEDED",
                input.eventAt,
              );
            }

            insertDecisionStmt.run(
              record.questionId,
              record.answerId,
              record.excerptFingerprint,
              record.recordFingerprint,
              record.reason,
              JSON.stringify(record.selectedEvidenceFingerprints),
              JSON.stringify(record.evidence),
              record.affectedWording ?? null,
              record.currentState ?? null,
              record.impactOnAnswer ?? null,
              record.capturedAt,
              record.eventAt,
            );

            const decisionRow = findDecisionIdStmt.get(record.recordFingerprint) as
              | { id: number }
              | undefined;
            if (!decisionRow) {
              throw new Error("failed to read persisted lifecycle decision");
            }
            appendEvent(decisionRow.id, record.recordFingerprint, "VISIBLE", input.eventAt);

            return { ...record, status: "VISIBLE" as const };
          });

          return transaction();
        },
        catch: (error: unknown) =>
          new PatchLifecycleStoreError({
            reason: `saveVisible failed: ${error instanceof Error ? error.message : String(error)}`,
          }),
      });

    const supersedeByExcerptFingerprint = (
      excerptFingerprint: string,
      eventAt: number,
    ): Effect.Effect<number, PatchLifecycleStoreError> =>
      Effect.try({
        try: () => {
          const transaction = database.transaction((): number => {
            const activeRows = findActiveStmt.all(
              excerptFingerprint,
            ) as ReadonlyArray<LifecycleRow>;
            for (const activeRow of activeRows) {
              appendEvent(
                Number(activeRow.id),
                String(activeRow.record_fingerprint),
                "SUPERSEDED",
                eventAt,
              );
            }
            return activeRows.length;
          });
          return transaction();
        },
        catch: (error: unknown) =>
          new PatchLifecycleStoreError({
            reason: `supersede failed: ${error instanceof Error ? error.message : String(error)}`,
          }),
      });

    const dispute = (
      recordFingerprint: string,
      eventAt: number,
    ): Effect.Effect<boolean, PatchLifecycleStoreError> =>
      Effect.try({
        try: () => {
          const transaction = database.transaction((): boolean => {
            const row = findByRecordStmt.get(recordFingerprint) as
              | (LifecycleRow & { id: number })
              | undefined;
            if (!row || parseLifecycleStatus(row.status) !== "VISIBLE") {
              return false;
            }
            appendEvent(Number(row.id), recordFingerprint, "DISPUTED", eventAt);
            return true;
          });
          return transaction();
        },
        catch: (error: unknown) =>
          new PatchLifecycleStoreError({
            reason: `dispute failed: ${error instanceof Error ? error.message : String(error)}`,
          }),
      });

    const findCurrentByExcerptFingerprint = (
      excerptFingerprint: string,
    ): Effect.Effect<PatchLifecycleRecordWithStatus | null, PatchLifecycleStoreError> =>
      Effect.try({
        try: () => {
          const row = findCurrentStmt.get(excerptFingerprint) as LifecycleRow | undefined;
          return row === undefined ? null : mapRowToRecord(row);
        },
        catch: (error: unknown) =>
          new PatchLifecycleStoreError({
            reason: `findCurrent failed: ${error instanceof Error ? error.message : String(error)}`,
          }),
      });

    const findHistoryByAnswer = (
      questionId: string,
      answerId: string,
    ): Effect.Effect<readonly PatchLifecycleRecordWithStatus[], PatchLifecycleStoreError> =>
      Effect.try({
        try: () => {
          const rows = findHistoryStmt.all(questionId, answerId) as ReadonlyArray<LifecycleRow>;
          return rows.map(mapRowToRecord);
        },
        catch: (error: unknown) =>
          new PatchLifecycleStoreError({
            reason: `findHistory failed: ${error instanceof Error ? error.message : String(error)}`,
          }),
      });

    return {
      saveVisible,
      supersedeByExcerptFingerprint,
      dispute,
      findCurrentByExcerptFingerprint,
      findHistoryByAnswer,
    };
  });
