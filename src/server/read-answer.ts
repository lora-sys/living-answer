import { Effect } from "effect";

import { makeSqliteExcerptStore, type ExcerptStore } from "../lib/excerpt-store";

import {
  makeSqlitePatchLifecycleStore,
  type PatchLifecycleRecordWithStatus,
  type PatchLifecycleStore,
} from "../lib/patch-lifecycle-store";

import {
  okResponse,
  excerptOnlyResponse,
  noExcerptResponse,
  errorResponse,
  type ReadAnswerAdvisoryDecision,
  type ReadAnswerEvidenceSummary,
  type ReadAnswerHistoryEntry,
  type ReadAnswerLifecycleSummary,
  type ReadAnswerResponse,
} from "./read-answer-response";

import { createServerFn } from "@tanstack/react-start";

// ═══════════════════════════════════════════════════════════════════════════════
// Input validation
// ═══════════════════════════════════════════════════════════════════════════════

const parseInput = (input: unknown): { readonly questionId: string; readonly answerId: string } => {
  if (typeof input !== "object" || input === null) {
    return { questionId: "", answerId: "" };
  }

  const raw = input as Record<string, unknown>;
  const questionId = typeof raw.questionId === "string" ? raw.questionId : "";
  const answerId = typeof raw.answerId === "string" ? raw.answerId : "";

  return { questionId, answerId };
};

const validateInput = (
  input: unknown,
): { readonly questionId: string; readonly answerId: string } => {
  const { questionId, answerId } = parseInput(input);

  if (!/^\d+$/.test(questionId) || !/^\d+$/.test(answerId)) {
    return { questionId: "", answerId: "" };
  }

  return { questionId, answerId };
};

// ═══════════════════════════════════════════════════════════════════════════════
// Advisory derivation from persisted lifecycle record
// ═══════════════════════════════════════════════════════════════════════════════

const buildAdvisoryFromLifecycle = (
  record: PatchLifecycleRecordWithStatus,
): ReadAnswerAdvisoryDecision => {
  const evidenceSummary: ReadAnswerEvidenceSummary[] = record.evidence.map((ev) => ({
    fingerprint: ev.fingerprint,
    sourceLabel: ev.sourceLabel,
    ...(ev.sourceUrl !== undefined ? { sourceUrl: ev.sourceUrl } : {}),
  }));

  const selectedSet = new Set(record.selectedEvidenceFingerprints);
  const matchedEvidenceSummary = evidenceSummary.filter((ev) => selectedSet.has(ev.fingerprint));
  const matchedFingerprints = matchedEvidenceSummary.map((ev) => ev.fingerprint);

  return {
    // A persisted lifecycle record is the immutable projection of the UPDATE
    // decision that created it. Its status describes review state, not a new
    // advisory verdict.
    verdict: "UPDATE" as const,
    reason: record.reason,
    patchBodyStatus: "no-body-available",
    selectedEvidenceFingerprints: matchedFingerprints,
    evidenceSummary: matchedEvidenceSummary,
    ...(record.affectedWording !== undefined ? { affectedWording: record.affectedWording } : {}),
    ...(record.currentState !== undefined ? { currentState: record.currentState } : {}),
    ...(record.impactOnAnswer !== undefined ? { impactOnAnswer: record.impactOnAnswer } : {}),
  };
};

const toLifecycleSummary = (
  record: PatchLifecycleRecordWithStatus,
): ReadAnswerLifecycleSummary => ({
  recordFingerprint: record.recordFingerprint,
  status: record.status,
  capturedAt: record.capturedAt,
  eventAt: record.eventAt,
  reason: record.reason,
  selectedEvidenceFingerprints: record.selectedEvidenceFingerprints,
  evidenceSummary: record.evidence.map((ev) => ({
    fingerprint: ev.fingerprint,
    sourceLabel: ev.sourceLabel,
    ...(ev.sourceUrl !== undefined ? { sourceUrl: ev.sourceUrl } : {}),
  })),
  ...(record.affectedWording !== undefined ? { affectedWording: record.affectedWording } : {}),
  ...(record.currentState !== undefined ? { currentState: record.currentState } : {}),
  ...(record.impactOnAnswer !== undefined ? { impactOnAnswer: record.impactOnAnswer } : {}),
});

const toHistoryEntry = (record: PatchLifecycleRecordWithStatus): ReadAnswerHistoryEntry => ({
  recordFingerprint: record.recordFingerprint,
  status: record.status,
  capturedAt: record.capturedAt,
  eventAt: record.eventAt,
  reason: record.reason,
});

// ═══════════════════════════════════════════════════════════════════════════════
// Handler factory (testable)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReadAnswerServerInput {
  readonly questionId: string;
  readonly answerId: string;
}

export interface ReadAnswerDeps {
  readonly createExcerptStore: () => Promise<ExcerptStore>;
  readonly createLifecycleStore: () => Promise<PatchLifecycleStore>;
}

export const createReadAnswerHandler =
  (deps: ReadAnswerDeps) =>
  async (input: ReadAnswerServerInput): Promise<ReadAnswerResponse> => {
    // ── Step 1: validate input ─────────────────────────────────────────────
    const { questionId, answerId } = validateInput(input);

    if (questionId === "" || answerId === "") {
      return errorResponse("INVALID_REQUEST");
    }

    // ── Step 2: open excerpt store ─────────────────────────────────────────
    let excerptStore: ExcerptStore;
    try {
      excerptStore = await deps.createExcerptStore();
    } catch {
      return errorResponse("STORE_ERROR");
    }

    // ── Step 3: find latest excerpt ────────────────────────────────────────
    const excerptOutcome = await Effect.runPromise(
      Effect.either(excerptStore.findLatest(questionId, answerId)),
    );

    if (excerptOutcome._tag === "Left") {
      return errorResponse("STORE_ERROR");
    }

    const excerpt = excerptOutcome.right;

    if (excerpt === null) {
      return noExcerptResponse();
    }

    // ── Step 4: open lifecycle store ──────────────────────────────────────
    let lifecycleStore: PatchLifecycleStore;
    try {
      lifecycleStore = await deps.createLifecycleStore();
    } catch {
      return errorResponse("LIFECYCLE_STORE_ERROR");
    }

    // ── Step 5: find current lifecycle by excerpt fingerprint ──────────────
    const lifecycleOutcome = await Effect.runPromise(
      Effect.either(lifecycleStore.findCurrentByExcerptFingerprint(excerpt.fingerprint)),
    );

    if (lifecycleOutcome._tag === "Left") {
      return errorResponse("LIFECYCLE_STORE_ERROR");
    }

    const currentLifecycle = lifecycleOutcome.right;

    if (currentLifecycle === null) {
      // Excerpt exists but no lifecycle decision yet — show excerpt with guidance.
      return excerptOnlyResponse(excerpt);
    }

    // ── Step 6: fetch history ──────────────────────────────────────────────
    const historyOutcome = await Effect.runPromise(
      Effect.either(lifecycleStore.findHistoryByAnswer(questionId, answerId)),
    );

    if (historyOutcome._tag === "Left") {
      return errorResponse("LIFECYCLE_STORE_ERROR");
    }

    const history = historyOutcome.right;

    // ── Step 7: derive advisory and compose response ──────────────────────
    const advisory = buildAdvisoryFromLifecycle(currentLifecycle);
    const lifecycle = toLifecycleSummary(currentLifecycle);
    const historyEntries = history.map(toHistoryEntry);

    return okResponse(excerpt, {
      advisory,
      lifecycle,
      history: historyEntries,
    });
  };

// ═══════════════════════════════════════════════════════════════════════════════
// Production wiring
// ═══════════════════════════════════════════════════════════════════════════════

let storeInstance: Promise<ExcerptStore> | null = null;
let lifecycleStoreInstance: Promise<PatchLifecycleStore> | null = null;

const getOrCreateExcerptStore = async (): Promise<ExcerptStore> => {
  if (!storeInstance) {
    storeInstance = Effect.runPromise(makeSqliteExcerptStore());
  }
  return storeInstance;
};

const getOrCreateLifecycleStore = async (): Promise<PatchLifecycleStore> => {
  if (!lifecycleStoreInstance) {
    lifecycleStoreInstance = Effect.runPromise(
      makeSqlitePatchLifecycleStore(".local/patch-lifecycle.db"),
    );
  }
  return lifecycleStoreInstance;
};

/**
 * TanStack Start server function that reads a persisted answer read page.
 *
 * Looks up the latest excerpt for the given question/answer pair, then loads
 * the current lifecycle decision. Returns one of: ok, excerpt_only,
 * no_excerpt, or error.
 */
export const readAnswer = createServerFn({
  method: "GET",
})
  .validator(validateInput)
  .handler(async ({ data }) => {
    return createReadAnswerHandler({
      createExcerptStore: getOrCreateExcerptStore,
      createLifecycleStore: getOrCreateLifecycleStore,
    })(data);
  });

// Re-export response types for consumers
export type { ReadAnswerResponse } from "./read-answer-response";
export { failureMessage } from "./read-answer-response";
export type { ReadAnswerServerFailureCode } from "./read-answer-response";
