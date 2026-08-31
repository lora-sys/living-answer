import { Data, Effect } from "effect";

import { createRequire } from "node:module";
import type { AnswerClaim } from "./answer-claim";
import { fnv1a64 } from "./answer-excerpt";

const require = createRequire(import.meta.url);

// ── Errors ─────────────────────────────────────────────────────────────────────

export class StoreError extends Data.TaggedError("StoreError")<{
  readonly reason: string;
}> {}

// ── Interface ──────────────────────────────────────────────────────────────────

/**
 * A row representing one extracted claim (immutable record).
 */
export interface ClaimRecord {
  readonly questionId: string;
  readonly answerId: string;
  readonly sourceContentId: string;
  readonly sourceContentType: string;
  readonly sourceEditTime: number;
  readonly excerptFingerprint: string;
  readonly claimFingerprint: string;
  readonly claimText: string;
  readonly anchorText: string;
  readonly volatility: string;
  readonly decisionRelevance: string;
  readonly candidateReason: string;
  readonly extractedAt: number;
  readonly status: string;
}

export interface ClaimStore {
  /**
   * Persist a full set of claims for an excerpt.
   *
   * Save is idempotent: saving the same set of claim fingerprints for the same
   * excerpt creates no duplicate rows.  A later extraction that produces a
   * **different** set creates a new historical event; `findLatestByExcerptFingerprint`
   * returns the most recent.
   */
  readonly saveClaimSet: (
    excerptFingerprint: string,
    claims: readonly AnswerClaim[],
  ) => Effect.Effect<void, StoreError>;
  /** Return all distinct excerpt fingerprints that have at least one stored claim set. */
  readonly listExcerptFingerprints: () => Effect.Effect<ReadonlyArray<string>, StoreError>;
  /**
   * Return the latest set of claims for the given excerpt fingerprint (by
   * `created_at`), or an empty array if none exist.
   */
  readonly findLatestByExcerptFingerprint: (
    excerptFingerprint: string,
  ) => Effect.Effect<ReadonlyArray<ClaimRecord>, StoreError>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Compute a deterministic signature for a set of claim fingerprints.
 * Claims are sorted by fingerprint so the signature is order-independent.
 */
const computeSetFingerprint = (claimFingerprints: readonly string[]): string => {
  const material = [...claimFingerprints].sort().join("\n");
  const [high, low] = fnv1a64(material);

  const hex = [high.toString(16).padStart(8, "0"), low.toString(16).padStart(8, "0")].join("");

  return `v1:${hex}`;
};

// ── SQL ────────────────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS claim_sets (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  excerpt_fingerprint TEXT    NOT NULL,
  set_fingerprint     TEXT    NOT NULL,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(excerpt_fingerprint, set_fingerprint)
);
`;

const CLAIMS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS claims (
  claim_set_id         INTEGER  NOT NULL,
  claim_fingerprint    TEXT     NOT NULL,
  question_id          TEXT     NOT NULL,
  answer_id            TEXT     NOT NULL,
  source_content_id    TEXT     NOT NULL,
  source_content_type  TEXT     NOT NULL,
  source_edit_time     INTEGER  NOT NULL,
  excerpt_fingerprint  TEXT     NOT NULL,
  claim_text           TEXT     NOT NULL,
  anchor_text          TEXT     NOT NULL,
  volatility           TEXT     NOT NULL,
  decision_relevance   TEXT     NOT NULL,
  candidate_reason     TEXT     NOT NULL,
  extracted_at         INTEGER  NOT NULL,
  status               TEXT     NOT NULL,
  created_at           INTEGER  NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (claim_set_id, claim_fingerprint),
  FOREIGN KEY (claim_set_id) REFERENCES claim_sets(id)
);
`;

const INSERT_CLAIM_SET_SQL = `
INSERT OR IGNORE INTO claim_sets (excerpt_fingerprint, set_fingerprint)
VALUES (?, ?);
`;

const INSERT_CLAIM_SQL = `
INSERT OR IGNORE INTO claims
  (claim_set_id, claim_fingerprint, question_id, answer_id, source_content_id,
   source_content_type, source_edit_time, excerpt_fingerprint, claim_text, anchor_text,
   volatility, decision_relevance, candidate_reason, extracted_at, status)
VALUES
  (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

const FIND_LATEST_CLAIM_SET_SQL = `
SELECT id
FROM claim_sets
WHERE excerpt_fingerprint = ?
ORDER BY created_at DESC, id DESC
LIMIT 1;
`;

const FIND_CLAIM_SET_BY_FINGERPRINT_SQL = `
SELECT id
FROM claim_sets
WHERE excerpt_fingerprint = ? AND set_fingerprint = ?;
`;

const FIND_CLAIMS_BY_SET_ID_SQL = `
SELECT question_id, answer_id, source_content_id, source_content_type, source_edit_time,
       excerpt_fingerprint, claim_fingerprint, claim_text, anchor_text, volatility,
       decision_relevance, candidate_reason, extracted_at, status
FROM claims
WHERE claim_set_id = ?
ORDER BY rowid ASC;
`;

const LIST_EXCERPT_FINGERPRINTS_SQL = `
SELECT DISTINCT excerpt_fingerprint
FROM claim_sets
ORDER BY excerpt_fingerprint ASC;
`;

// ── Default DB path ────────────────────────────────────────────────────────────

const DEFAULT_DB_PATH = ".local/claims.db";

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Create a lazy Effect that opens (or creates) a SQLite database at `dbPath`
 * (defaults to `.local/claims.db`).
 *
 * Uses lazy `require()` for `node:path`, `node:fs`, and `better-sqlite3` so
 * that bundlers can tree-shake these modules when the store is unused.
 *
 * The parent directory is created on first evaluation, and the schema is
 * applied idempotently.
 */
export const makeSqliteClaimStore = (
  dbPath = DEFAULT_DB_PATH,
): Effect.Effect<ClaimStore, StoreError> =>
  Effect.gen(function* () {
    const database = yield* Effect.try({
      try: () => {
        // Lazy CJS require for tree-shaking compatibility
        const nodePath = require("node:path") as typeof import("node:path");
        const nodeFs = require("node:fs") as typeof import("node:fs");
        const parent = nodePath.dirname(dbPath);
        if (!nodeFs.existsSync(parent)) {
          nodeFs.mkdirSync(parent, { recursive: true });
        }

        return require("better-sqlite3")(dbPath, { fileMustExist: false });
      },
      catch: (e: unknown) =>
        new StoreError({
          reason: `failed to open sqlite db at ${dbPath}: ${e instanceof Error ? e.message : String(e)}`,
        }),
    });

    // Run schema migrations (idempotent)
    yield* Effect.try({
      try: () => {
        database.exec(SCHEMA_SQL + "\n" + CLAIMS_SCHEMA_SQL);
      },
      catch: (e: unknown) =>
        new StoreError({
          reason: `schema migration failed: ${e instanceof Error ? e.message : String(e)}`,
        }),
    });

    // Prepare statements once for efficiency
    const insertClaimSetStmt = database.prepare(INSERT_CLAIM_SET_SQL);
    const insertClaimStmt = database.prepare(INSERT_CLAIM_SQL);
    const findLatestSetStmt = database.prepare(FIND_LATEST_CLAIM_SET_SQL);
    const findClaimSetByFingerprintStmt = database.prepare(FIND_CLAIM_SET_BY_FINGERPRINT_SQL);
    const findClaimsBySetIdStmt = database.prepare(FIND_CLAIMS_BY_SET_ID_SQL);
    const listExcerptFingerprintsStmt = database.prepare(LIST_EXCERPT_FINGERPRINTS_SQL);

    const saveClaimSet = (
      excerptFingerprint: string,
      claims: readonly AnswerClaim[],
    ): Effect.Effect<void, StoreError> =>
      Effect.try({
        try: () => {
          // Compute a deterministic set fingerprint from the claim fingerprints.
          // Sorted so that order of the `claims` array does not affect the signature.
          const setFingerprint = computeSetFingerprint(claims.map((c) => c.claimFingerprint));

          const insertStmt = database.transaction(() => {
            // Insert a new claim_set row; idempotent via UNIQUE(excerpt_fingerprint, set_fingerprint).
            insertClaimSetStmt.run(excerptFingerprint, setFingerprint);

            // Look up the exact claim_set row that was just inserted (or already
            // existed); the latest-set query is not safe here because another
            // set for the same excerpt may share the same second-precision
            // created_at timestamp.
            const setRow = findClaimSetByFingerprintStmt.get(excerptFingerprint, setFingerprint) as
              | { id: number }
              | undefined;
            if (!setRow) {
              throw new Error("Failed to retrieve claim_set id after insert");
            }

            // Insert each claim (idempotent via composite PK (claim_set_id, claim_fingerprint)).
            for (const claim of claims) {
              insertClaimStmt.run(
                setRow.id,
                claim.claimFingerprint,
                claim.questionId,
                claim.answerId,
                claim.sourceContentId,
                claim.sourceContentType,
                claim.sourceEditTime,
                claim.excerptFingerprint,
                claim.claimText,
                claim.anchorText,
                claim.volatility,
                claim.decisionRelevance,
                claim.candidateReason,
                claim.extractedAt,
                claim.status,
              );
            }
          });

          insertStmt();
        },
        catch: (e: unknown) =>
          new StoreError({
            reason: `saveClaimSet failed: ${e instanceof Error ? e.message : String(e)}`,
          }),
      });

    const findLatestByExcerptFingerprint = (
      excerptFingerprint: string,
    ): Effect.Effect<ReadonlyArray<ClaimRecord>, StoreError> =>
      Effect.try({
        try: () => {
          const setRow = findLatestSetStmt.get(excerptFingerprint) as { id: number } | undefined;
          if (!setRow) return [];

          const rows = findClaimsBySetIdStmt.all(setRow.id) as ReadonlyArray<
            Record<string, unknown>
          >;
          const result: ClaimRecord[] = [];
          for (const row of rows) {
            result.push({
              questionId: String(row.question_id),
              answerId: String(row.answer_id),
              sourceContentId: String(row.source_content_id),
              sourceContentType: String(row.source_content_type),
              sourceEditTime: Number(row.source_edit_time),
              excerptFingerprint: String(row.excerpt_fingerprint),
              claimFingerprint: String(row.claim_fingerprint),
              claimText: String(row.claim_text),
              anchorText: String(row.anchor_text),
              volatility: String(row.volatility),
              decisionRelevance: String(row.decision_relevance),
              candidateReason: String(row.candidate_reason),
              extractedAt: Number(row.extracted_at),
              status: String(row.status),
            });
          }
          return result;
        },
        catch: (e: unknown) =>
          new StoreError({
            reason: `findLatestByExcerptFingerprint failed: ${e instanceof Error ? e.message : String(e)}`,
          }),
      });

    const listExcerptFingerprints = (): Effect.Effect<ReadonlyArray<string>, StoreError> =>
      Effect.try({
        try: () => {
          const rows = listExcerptFingerprintsStmt.all() as ReadonlyArray<{
            excerpt_fingerprint: string;
          }>;
          return rows.map((row) => row.excerpt_fingerprint);
        },
        catch: (e: unknown) =>
          new StoreError({
            reason: `listExcerptFingerprints failed: ${e instanceof Error ? e.message : String(e)}`,
          }),
      });

    return { saveClaimSet, findLatestByExcerptFingerprint, listExcerptFingerprints };
  });
