import { Data, Effect } from "effect";

import { createRequire } from "node:module";
import type { EvidenceCandidate } from "./evidence-candidate";

const require = createRequire(import.meta.url);

// ── Errors ─────────────────────────────────────────────────────────────────────

export class EvidenceCandidateStoreError extends Data.TaggedError("EvidenceCandidateStoreError")<{
  readonly reason: string;
}> {}

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * A persisted evidence-candidate row joined with its parent retrieval event.
 * `searchQuery` is omitted because the gate and promotion path do not use it.
 */
export interface EvidenceCandidateRecord {
  readonly claimFingerprint: string;
  readonly retrievalEventFingerprint: string;
  readonly provider: EvidenceCandidate["provider"];
  readonly sourceKind: EvidenceCandidate["sourceKind"];
  readonly authorityHint: EvidenceCandidate["authorityHint"];
  readonly sourceContentId: string;
  readonly sourceContentType: string;
  readonly sourceLabel: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly contentPreview: string;
  readonly publishedAt?: number;
  readonly capturedAt: number;
  readonly sourceAccessState: EvidenceCandidate["sourceAccessState"];
  readonly candidateFingerprint: string;
  readonly status: EvidenceCandidate["status"];
}

export interface EvidenceCandidateStore {
  /**
   * Persist a retrieval event. Idempotent via
   * UNIQUE(claim_fingerprint, retrieval_event_fingerprint).
   */
  readonly saveRetrieval: (
    excerptFingerprint: string,
    claimFingerprint: string,
    retrievalEventFingerprint: string,
    provider: string,
    searchQuery: string,
    retrievedAt: number,
  ) => Effect.Effect<void, EvidenceCandidateStoreError>;
  /**
   * Persist candidates for a retrieval event. Idempotent via
   * UNIQUE(retrieval_id, candidate_fingerprint).
   */
  readonly saveCandidates: (
    retrievalEventFingerprint: string,
    candidates: readonly EvidenceCandidate[],
  ) => Effect.Effect<void, EvidenceCandidateStoreError>;
  /** Return all candidates for the given claim fingerprint. */
  readonly findCandidatesByClaimFingerprint: (
    claimFingerprint: string,
  ) => Effect.Effect<readonly EvidenceCandidateRecord[], EvidenceCandidateStoreError>;
  /**
   * Return all candidates whose claims belong to the given excerpt
   * fingerprint, joined through the claims table in claim-store.ts.
   */
  readonly findCandidatesByExcerptFingerprint: (
    excerptFingerprint: string,
  ) => Effect.Effect<readonly EvidenceCandidateRecord[], EvidenceCandidateStoreError>;
  /** Return all candidates, deduplicated by candidate fingerprint. */
  readonly findAll: () => Effect.Effect<
    readonly EvidenceCandidateRecord[],
    EvidenceCandidateStoreError
  >;
}

// ── SQL ────────────────────────────────────────────────────────────────────────

const RETRIEVALS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS evidence_retrievals (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  excerpt_fingerprint         TEXT    NOT NULL,
  claim_fingerprint           TEXT    NOT NULL,
  retrieval_event_fingerprint TEXT    NOT NULL,
  provider                    TEXT    NOT NULL,
  search_query                TEXT    NOT NULL,
  retrieved_at                INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(claim_fingerprint, retrieval_event_fingerprint)
);
`;

const CANDIDATES_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS evidence_candidates (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  retrieval_id          INTEGER  NOT NULL,
  claim_fingerprint     TEXT     NOT NULL,
  candidate_fingerprint TEXT     NOT NULL,
  provider              TEXT     NOT NULL,
  source_kind           TEXT     NOT NULL,
  authority_hint        TEXT     NOT NULL,
  source_content_id     TEXT     NOT NULL,
  source_content_type   TEXT     NOT NULL,
  source_label          TEXT     NOT NULL,
  title                 TEXT     NOT NULL,
  source_url            TEXT     NOT NULL,
  content_preview       TEXT     NOT NULL,
  published_at          INTEGER,
  captured_at           INTEGER  NOT NULL,
  source_access_state   TEXT     NOT NULL,
  status                TEXT     NOT NULL,
  created_at            INTEGER  NOT NULL DEFAULT (unixepoch()),
  UNIQUE(retrieval_id, candidate_fingerprint),
  FOREIGN KEY (retrieval_id) REFERENCES evidence_retrievals(id)
);
`;

const INSERT_RETRIEVAL_SQL = `
INSERT OR IGNORE INTO evidence_retrievals
  (excerpt_fingerprint, claim_fingerprint, retrieval_event_fingerprint, provider, search_query, retrieved_at)
VALUES (?, ?, ?, ?, ?, ?);
`;

const FIND_RETRIEVAL_BY_EVENT_SQL = `
SELECT id
FROM evidence_retrievals
WHERE retrieval_event_fingerprint = ?;
`;

const INSERT_CANDIDATE_SQL = `
INSERT OR IGNORE INTO evidence_candidates
  (retrieval_id, claim_fingerprint, candidate_fingerprint, provider, source_kind,
   authority_hint, source_content_id, source_content_type, source_label, title,
   source_url, content_preview, published_at, captured_at, source_access_state, status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

const FIND_CANDIDATES_BY_CLAIM_SQL = `
SELECT ec.retrieval_id,
       ec.claim_fingerprint,
       ec.candidate_fingerprint,
       ec.provider,
       ec.source_kind,
       ec.authority_hint,
       ec.source_content_id,
       ec.source_content_type,
       ec.source_label,
       ec.title,
       ec.source_url,
       ec.content_preview,
       ec.published_at,
       ec.captured_at,
       ec.source_access_state,
       ec.status,
       er.retrieval_event_fingerprint
FROM evidence_candidates ec
JOIN evidence_retrievals er ON ec.retrieval_id = er.id
WHERE ec.claim_fingerprint = ?
ORDER BY ec.created_at DESC, ec.id DESC;
`;

const FIND_ALL_SQL = `
SELECT ec.retrieval_id,
       ec.claim_fingerprint,
       ec.candidate_fingerprint,
       ec.provider,
       ec.source_kind,
       ec.authority_hint,
       ec.source_content_id,
       ec.source_content_type,
       ec.source_label,
       ec.title,
       ec.source_url,
       ec.content_preview,
       ec.published_at,
       ec.captured_at,
       ec.source_access_state,
       ec.status,
       er.retrieval_event_fingerprint
FROM evidence_candidates ec
JOIN evidence_retrievals er ON ec.retrieval_id = er.id
ORDER BY ec.captured_at DESC, ec.id DESC;
`;

const FIND_CANDIDATES_BY_EXCERPT_SQL = `
SELECT ec.retrieval_id,
       ec.claim_fingerprint,
       ec.candidate_fingerprint,
       ec.provider,
       ec.source_kind,
       ec.authority_hint,
       ec.source_content_id,
       ec.source_content_type,
       ec.source_label,
       ec.title,
       ec.source_url,
       ec.content_preview,
       ec.published_at,
       ec.captured_at,
       ec.source_access_state,
       ec.status,
       er.retrieval_event_fingerprint
FROM evidence_candidates ec
JOIN evidence_retrievals er ON ec.retrieval_id = er.id
WHERE er.excerpt_fingerprint = ?
ORDER BY ec.created_at DESC, ec.id DESC;
`;

// ── Default DB path ────────────────────────────────────────────────────────────

const DEFAULT_DB_PATH = ".local/evidence-candidates.db";

// ── Helpers ────────────────────────────────────────────────────────────────────

const mapRowToRecord = (row: Record<string, unknown>): EvidenceCandidateRecord => {
  const candidate: EvidenceCandidate = {
    claimFingerprint: String(row.claim_fingerprint),
    retrievalEventFingerprint: String(row.retrieval_event_fingerprint),
    provider: String(row.provider) as EvidenceCandidate["provider"],
    searchQuery: "",
    sourceKind: String(row.source_kind) as EvidenceCandidate["sourceKind"],
    authorityHint: String(row.authority_hint) as EvidenceCandidate["authorityHint"],
    sourceContentId: String(row.source_content_id),
    sourceContentType: String(row.source_content_type),
    sourceLabel: String(row.source_label),
    title: String(row.title),
    sourceUrl: String(row.source_url),
    contentPreview: String(row.content_preview),
    publishedAt:
      row.published_at !== null && row.published_at !== undefined
        ? Number(row.published_at)
        : undefined,
    capturedAt: Number(row.captured_at),
    sourceAccessState: String(row.source_access_state) as EvidenceCandidate["sourceAccessState"],
    candidateFingerprint: String(row.candidate_fingerprint),
    status: String(row.status) as EvidenceCandidate["status"],
  };
  return candidate;
};

// ── Public API ─────────────────────────────────────────────────────────────────

export const makeSqliteEvidenceCandidateStore = (
  dbPath = DEFAULT_DB_PATH,
): Effect.Effect<EvidenceCandidateStore, EvidenceCandidateStoreError> =>
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
      catch: (e: unknown) =>
        new EvidenceCandidateStoreError({
          reason: `failed to open sqlite db at ${dbPath}: ${e instanceof Error ? e.message : String(e)}`,
        }),
    });

    yield* Effect.try({
      try: () => {
        database.exec(RETRIEVALS_SCHEMA_SQL + "\n" + CANDIDATES_SCHEMA_SQL);
      },
      catch: (e: unknown) =>
        new EvidenceCandidateStoreError({
          reason: `schema migration failed: ${e instanceof Error ? e.message : String(e)}`,
        }),
    });

    const insertRetrievalStmt = database.prepare(INSERT_RETRIEVAL_SQL);
    const findRetrievalByEventStmt = database.prepare(FIND_RETRIEVAL_BY_EVENT_SQL);
    const insertCandidateStmt = database.prepare(INSERT_CANDIDATE_SQL);
    const findCandidatesByClaimStmt = database.prepare(FIND_CANDIDATES_BY_CLAIM_SQL);
    const findCandidatesByExcerptStmt = database.prepare(FIND_CANDIDATES_BY_EXCERPT_SQL);

    const saveRetrieval = (
      excerptFingerprint: string,
      claimFingerprint: string,
      retrievalEventFingerprint: string,
      provider: string,
      searchQuery: string,
      retrievedAt: number,
    ): Effect.Effect<void, EvidenceCandidateStoreError> =>
      Effect.try({
        try: () => {
          insertRetrievalStmt.run(
            excerptFingerprint,
            claimFingerprint,
            retrievalEventFingerprint,
            provider,
            searchQuery,
            retrievedAt,
          );
        },
        catch: (e: unknown) =>
          new EvidenceCandidateStoreError({
            reason: `saveRetrieval failed: ${e instanceof Error ? e.message : String(e)}`,
          }),
      });

    const saveCandidates = (
      retrievalEventFingerprint: string,
      candidates: readonly EvidenceCandidate[],
    ): Effect.Effect<void, EvidenceCandidateStoreError> =>
      Effect.try({
        try: () => {
          const retrievalRow = findRetrievalByEventStmt.get(retrievalEventFingerprint) as
            | { id: number }
            | undefined;
          if (!retrievalRow) {
            throw new Error(
              `No retrieval found for event fingerprint: ${retrievalEventFingerprint}`,
            );
          }

          const tx = database.transaction(() => {
            for (const candidate of candidates) {
              insertCandidateStmt.run(
                retrievalRow.id,
                candidate.claimFingerprint,
                candidate.candidateFingerprint,
                candidate.provider,
                candidate.sourceKind,
                candidate.authorityHint,
                candidate.sourceContentId,
                candidate.sourceContentType,
                candidate.sourceLabel,
                candidate.title,
                candidate.sourceUrl,
                candidate.contentPreview,
                candidate.publishedAt ?? null,
                candidate.capturedAt,
                candidate.sourceAccessState,
                candidate.status,
              );
            }
          });
          tx();
        },
        catch: (e: unknown) =>
          new EvidenceCandidateStoreError({
            reason: `saveCandidates failed: ${e instanceof Error ? e.message : String(e)}`,
          }),
      });

    const findCandidatesByClaimFingerprint = (
      claimFingerprint: string,
    ): Effect.Effect<readonly EvidenceCandidateRecord[], EvidenceCandidateStoreError> =>
      Effect.try({
        try: () => {
          const rows = findCandidatesByClaimStmt.all(claimFingerprint) as ReadonlyArray<
            Record<string, unknown>
          >;
          return rows.map(mapRowToRecord);
        },
        catch: (e: unknown) =>
          new EvidenceCandidateStoreError({
            reason: `findCandidatesByClaimFingerprint failed: ${e instanceof Error ? e.message : String(e)}`,
          }),
      });

    const findCandidatesByExcerptFingerprint = (
      excerptFingerprint: string,
    ): Effect.Effect<readonly EvidenceCandidateRecord[], EvidenceCandidateStoreError> =>
      Effect.try({
        try: () => {
          const rows = findCandidatesByExcerptStmt.all(excerptFingerprint) as ReadonlyArray<
            Record<string, unknown>
          >;
          return rows.map(mapRowToRecord);
        },
        catch: (e: unknown) =>
          new EvidenceCandidateStoreError({
            reason: `findCandidatesByExcerptFingerprint failed: ${e instanceof Error ? e.message : String(e)}`,
          }),
      });

    const findAllStmt = database.prepare(FIND_ALL_SQL);

    const findAll = (): Effect.Effect<
      readonly EvidenceCandidateRecord[],
      EvidenceCandidateStoreError
    > =>
      Effect.try({
        try: () => {
          const rows = findAllStmt.all() as ReadonlyArray<Record<string, unknown>>;
          return rows.map(mapRowToRecord);
        },
        catch: (e: unknown) =>
          new EvidenceCandidateStoreError({
            reason: `findAll failed: ${e instanceof Error ? e.message : String(e)}`,
          }),
      });

    return {
      saveRetrieval,
      saveCandidates,
      findCandidatesByClaimFingerprint,
      findCandidatesByExcerptFingerprint,
      findAll,
    };
  });
