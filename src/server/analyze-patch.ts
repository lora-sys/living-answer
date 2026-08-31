import { Effect } from "effect";
import { parseZhihuAnswerUrl } from "../lib/zhihu-answer-url";

import {
  makeFetchZhihuSearchTransport,
  makeZhihuSearchItemsFetcher,
} from "../lib/zhihu-search-adapter";

import {
  makeAnswerExcerptProvider,
  type AnswerExcerptProvider,
} from "../lib/answer-excerpt-provider";

import {
  makeOpenAiChatCompletions,
  makeFetchOpenAiTransport,
  type OpenAiChatCompletions,
} from "../lib/openai-adapter";

import { analyzePatch as runPatchAnalysis } from "../lib/patch-analysis-workflow";

import { createUserSuppliedContext, type UserSuppliedContext } from "../lib/user-supplied-context";

import { createPatchProposal, type PatchProposal } from "../lib/patch-proposal";

import { createPatchEvidence } from "../lib/patch-evidence";

import type { AnswerExcerpt } from "../lib/answer-excerpt";

import { runEvidenceGate } from "../lib/evidence-gate";

import { makeSqliteClaimStore, type ClaimStore } from "../lib/claim-store";

import {
  makeSqliteEvidenceCandidateStore,
  type EvidenceCandidateStore,
} from "../lib/evidence-candidate-store";

import {
  makeSqlitePatchLifecycleStore,
  type PatchLifecycleRecordWithStatus,
  type PatchLifecycleStore,
} from "../lib/patch-lifecycle-store";

import {
  errorResponse,
  okResponse,
  type AnalyzePatchServerFailureCode,
  toPatchAnalysisFailureCode,
  type AnalyzePatchResponse,
} from "./analyze-patch-response";

import { PatchAnalysisError } from "../lib/patch-analysis-workflow";

import { createServerFn } from "@tanstack/react-start";

import { makeSqliteExcerptStore, type ExcerptStore } from "../lib/excerpt-store";

// ═══════════════════════════════════════════════════════════════════════════════
// Handler factory (testable — receives injected dependencies)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Server handler input.
 */
export interface AnalyzePatchServerInput {
  readonly url: string;
  readonly context?: string;
}

/**
 * Boundary dependencies injected at construction.  Tests supply fakes; the
 * production wiring supplies the real transport and credential reader.
 */
export interface AnalyzePatchDeps {
  /**
   * Read the two secrets.  Returns `[openAiApiKey, zhihuSecret]`, either of
   * which may be `undefined` when the credential is absent.
   */
  readonly getSecret: () => readonly [string | undefined, string | undefined];

  /**
   * Create an AnswerExcerptProvider instance, called with the Zhihu secret.
   */
  readonly createProvider: (secret: string) => Promise<AnswerExcerptProvider>;

  /**
   * Create the OpenAI chat completions service, called with the API key.
   */
  readonly createChat: (apiKey: string) => OpenAiChatCompletions;

  /**
   * Create a ClaimStore instance for looking up extracted claims.
   */
  readonly createClaimStore: () => Promise<ClaimStore>;

  /**
   * Create an EvidenceCandidateStore instance for looking up evidence candidates.
   */
  readonly createEvidenceStore: () => Promise<EvidenceCandidateStore>;

  /**
   * Store lifecycle events for advisory update decisions.  Tests that only
   * exercise analysis behavior may omit this dependency.
   */
  readonly createLifecycleStore?: () => Promise<PatchLifecycleStore>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Input validation
// ═══════════════════════════════════════════════════════════════════════════════

const validateInput = (input: unknown): AnalyzePatchServerInput => {
  if (typeof input !== "object" || input === null) {
    return { url: "" };
  }

  const raw = input as Record<string, unknown>;
  const url = typeof raw.url === "string" ? raw.url : "";
  const context = typeof raw.context === "string" ? raw.context : undefined;

  return { url, context };
};

/**
 * Parse and validate the Zhihu answer URL.
 * Returns parsed fields on success or a failure code on any parse error.
 */
const validateUrl = (
  url: string,
):
  | {
      readonly _tag: "success";
      readonly questionId: string;
      readonly answerId: string;
      readonly canonicalUrl: string;
    }
  | { readonly _tag: "failure"; readonly code: AnalyzePatchServerFailureCode } => {
  const urlResult = parseZhihuAnswerUrl(url);
  if (urlResult._tag === "failure") {
    return {
      _tag: "failure",
      code: "UNSUPPORTED_ANSWER_URL",
    };
  }

  return {
    _tag: "success",
    questionId: urlResult.questionId,
    answerId: urlResult.answerId,
    canonicalUrl: urlResult.canonicalUrl,
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// Domain record creation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a client-supplied context record when the user provided maintenance notes.
 */
const createContextRecord = (
  questionId: string,
  answerId: string,
  contextText: string,
  excerpt: AnswerExcerpt,
): UserSuppliedContext | undefined => {
  const result = createUserSuppliedContext({
    questionId,
    answerId,
    contextText,
    capturedAt: excerpt.capturedAt,
  });

  if (result._tag === "failure") {
    // Defensive: should not happen for validated input
    return undefined;
  }

  return result.context;
};

/**
 * Compute a deterministic "virtual snapshot" fingerprint from answer identity
 * fields.  Slice 4 has no AnswerSnapshot domain record, but the workflow
 * requires a valid answerSnapshotFingerprint on the proposal.
 */
const computeAnswerSnapshotFingerprint = (
  questionId: string,
  answerId: string,
  sourceContentId: string,
  sourceEditTime: number,
): string => {
  const material = `snapshot:${questionId}:${answerId}:${sourceContentId}:${sourceEditTime}`;

  // Inline FNV-1a 64-bit — same algorithm used throughout the domain.
  let h64 = 14695981039346656037n;
  const fnvPrime = 1099511628211n;
  for (let i = 0; i < material.length; i++) {
    h64 ^= BigInt(material.charCodeAt(i));
    h64 *= fnvPrime;
  }

  const mask = 0xffffffffn;
  const high = Number((h64 >> 32n) & mask);
  const low = Number(h64 & mask);
  const hex = high.toString(16).padStart(8, "0") + low.toString(16).padStart(8, "0");

  return `v1:${hex}`;
};

/**
 * Build the PatchProposal for the analysis workflow.
 *
 * The proposedBody is the excerpt text (a stub per the plan rationale).
 * The server never surfaces proposedBody in the response.
 */
const createProposalRecord = (
  excerpt: AnswerExcerpt,
  contextFingerprint: string | undefined = ABSENT_CONTEXT_FINGERPRINT,
): PatchProposal => {
  const result = createPatchProposal({
    proposedBody: excerpt.excerpt,
    answerSnapshotFingerprint: computeAnswerSnapshotFingerprint(
      excerpt.questionId,
      excerpt.answerId,
      excerpt.sourceContentId,
      excerpt.sourceEditTime,
    ),
    contextFingerprint: contextFingerprint ?? "",
    capturedAt: excerpt.capturedAt,
  });

  if (result._tag === "failure") {
    // Defensive: proposal creation should not fail under normal conditions.
    throw new Error(`ANALYSIS_INVARIANT_VIOLATION: ${result.reason}`);
  }

  return result.proposal;
};

/**
 * Build the evidence array for the analysis workflow.
 *
 * For Slice 4, evidence is derived from the answer excerpt only.
 * The canonical URL serves as the sourceUrl.
 */
const createEvidenceRecords = (
  excerpt: AnswerExcerpt,
  canonicalUrl: string,
): readonly import("../lib/patch-evidence").PatchEvidence[] => {
  const result = createPatchEvidence({
    sourceLabel: excerpt.sourceContentType === "Answer" ? "知乎回答原文" : "来源",
    sourceUrl: canonicalUrl,
    quote: excerpt.excerpt,
    capturedAt: excerpt.capturedAt,
  });

  if (result._tag === "failure") {
    throw new Error(`ANALYSIS_INVARIANT_VIOLATION: ${result.reason}`);
  }

  return [result.evidence];
};

// ═══════════════════════════════════════════════════════════════════════════════
// Handler factory
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Async handler that analyzes whether a Zhihu answer needs a patch update.
 *
 * Runs entirely through injected dependencies; no env reads, no network calls
 * in the handler body itself.
 */
export const createAnalyzePatchHandler =
  (deps: AnalyzePatchDeps) =>
  async (input: AnalyzePatchServerInput): Promise<AnalyzePatchResponse> => {
    // ── Step 1: validate request shape ─────────────────────────────────────
    if (typeof input?.url !== "string" || input.url.trim() === "") {
      return errorResponse("INVALID_REQUEST");
    }

    const trimmedUrl = input.url.trim();
    const trimmedContext = typeof input.context === "string" ? input.context.trim() : undefined;

    // ── Step 2: parse and validate URL ───────────────────────────────────────
    const urlValidation = validateUrl(trimmedUrl);
    if (urlValidation._tag === "failure") {
      return errorResponse(urlValidation.code);
    }

    // ── Step 3: read credentials ─────────────────────────────────────────────
    const [openAiKey, zhihuSecret] = deps.getSecret();
    if (typeof openAiKey !== "string" || openAiKey.trim() === "") {
      return errorResponse("MISSING_OPENAI_KEY");
    }
    if (typeof zhihuSecret !== "string" || zhihuSecret.trim() === "") {
      return errorResponse("MISSING_OPENAI_KEY");
    }

    // ── Step 4: resolve excerpt through provider ─────────────────────────────
    let provider: AnswerExcerptProvider;
    try {
      provider = await deps.createProvider(zhihuSecret);
    } catch {
      return errorResponse("PROVIDER_ERROR");
    }

    const providerExit = await Effect.runPromiseExit(provider.resolve(trimmedUrl));
    if (providerExit._tag !== "Success") {
      if (providerExit.cause._tag === "Fail") {
        const error = providerExit.cause.error as Error & { _tag?: string };
        switch (error._tag) {
          case "AnswerNotFoundProviderError":
            return errorResponse("ANSWER_NOT_FOUND");
          case "AmbiguousAnswerProviderError":
            return errorResponse("AMBIGUOUS_ANSWER");
          case "InvalidProviderAnswerError":
            return errorResponse("INVALID_PROVIDER_ANSWER");
          case "UnsupportedAnswerUrlError":
            return errorResponse("UNSUPPORTED_ANSWER_URL");
          case "AnswerExcerptProviderError":
          default:
            return errorResponse("PROVIDER_ERROR");
        }
      }
      return errorResponse("PROVIDER_ERROR");
    }

    const excerpt = providerExit.value;

    // ── Step 5: build domain records ─────────────────────────────────────────
    const context = trimmedContext
      ? createContextRecord(
          urlValidation.questionId,
          urlValidation.answerId,
          trimmedContext,
          excerpt,
        )
      : undefined;

    const contextFingerprint = context?.fingerprint;
    const evidence = createEvidenceRecords(excerpt, urlValidation.canonicalUrl);
    const proposal = createProposalRecord(excerpt, contextFingerprint);

    // ── Step 5.5: evidence gate — replace placeholder with real candidates ────
    let gateEvidence: typeof evidence = evidence;
    let gateShortCircuit: {
      readonly _tag: "gate_no_patch" | "gate_unknown";
      readonly reason: string;
    } | null = null;

    let claimStore: ClaimStore;
    try {
      claimStore = await deps.createClaimStore();
    } catch {
      return errorResponse("CLAIM_STORE_ERROR");
    }

    let evidenceStore: EvidenceCandidateStore;
    try {
      evidenceStore = await deps.createEvidenceStore();
    } catch {
      return errorResponse("EVIDENCE_STORE_ERROR");
    }

    const claimsOutcome = await Effect.runPromise(
      Effect.either(claimStore.findLatestByExcerptFingerprint(excerpt.fingerprint)),
    );

    if (claimsOutcome._tag === "Left") {
      return errorResponse("CLAIM_STORE_ERROR");
    }

    const claims = claimsOutcome.right;

    if (claims.length > 0) {
      const candidatesOutcome = await Effect.runPromise(
        Effect.either(
          Effect.forEach(claims, (claim) =>
            evidenceStore.findCandidatesByClaimFingerprint(claim.claimFingerprint),
          ),
        ),
      );

      if (candidatesOutcome._tag === "Left") {
        return errorResponse("EVIDENCE_STORE_ERROR");
      }

      const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
      const gateLlm = deps.createChat(openAiKey);
      const promotedEvidence = new Map<string, (typeof evidence)[number]>();
      const unknownReasons: string[] = [];
      const noPatchReasons: string[] = [];

      for (const [claimIndex, claim] of claims.entries()) {
        const candidates = candidatesOutcome.right[claimIndex]?.map((record) => ({
          ...record,
          searchQuery: "",
        }));

        if (candidates === undefined) {
          return errorResponse("EVIDENCE_STORE_ERROR");
        }

        const gateOutcome = await Effect.runPromise(
          Effect.either(runEvidenceGate({ llm: gateLlm, model }, claim.claimText, candidates)),
        );

        if (gateOutcome._tag === "Left") {
          return errorResponse(
            gateOutcome.left.reason === "TRANSPORT_FAILED"
              ? "MODEL_TRANSPORT_ERROR"
              : "MALFORMED_MODEL_OUTPUT",
          );
        }

        const result = gateOutcome.right;
        if (result._tag === "gate_passed") {
          for (const evidenceRecord of result.evidence) {
            promotedEvidence.set(evidenceRecord.fingerprint, evidenceRecord);
          }
        } else if (result._tag === "gate_unknown") {
          unknownReasons.push(result.reason);
        } else {
          noPatchReasons.push(result.reason);
        }
      }

      if (promotedEvidence.size > 0) {
        gateEvidence = [...promotedEvidence.values()];
      } else if (unknownReasons.length > 0) {
        gateShortCircuit = {
          _tag: "gate_unknown",
          reason: unknownReasons.join(" "),
        };
      } else if (noPatchReasons.length > 0) {
        gateShortCircuit = {
          _tag: "gate_no_patch",
          reason: noPatchReasons.join(" "),
        };
      }
    }

    if (gateShortCircuit !== null) {
      if (deps.createLifecycleStore !== undefined) {
        let lifecycleStore: PatchLifecycleStore;
        try {
          lifecycleStore = await deps.createLifecycleStore();
        } catch {
          return errorResponse("LIFECYCLE_STORE_ERROR");
        }

        const eventAt = Date.now();
        const supersedeOutcome = await Effect.runPromise(
          Effect.either(lifecycleStore.supersedeByExcerptFingerprint(excerpt.fingerprint, eventAt)),
        );
        if (supersedeOutcome._tag === "Left") {
          return errorResponse("LIFECYCLE_STORE_ERROR");
        }

        const historyOutcome = await Effect.runPromise(
          Effect.either(lifecycleStore.findHistoryByAnswer(excerpt.questionId, excerpt.answerId)),
        );
        if (historyOutcome._tag === "Left") {
          return errorResponse("LIFECYCLE_STORE_ERROR");
        }

        return okResponse(
          {
            _tag: gateShortCircuit._tag === "gate_no_patch" ? "NO_PATCH" : "UNKNOWN",
            reason: gateShortCircuit.reason,
          } as never,
          gateEvidence,
          undefined,
          historyOutcome.right.map((record) => ({
            recordFingerprint: record.recordFingerprint,
            status: record.status,
            capturedAt: record.capturedAt,
            eventAt: record.eventAt,
            reason: record.reason,
          })),
        );
      }

      if (gateShortCircuit._tag === "gate_no_patch") {
        return okResponse({ _tag: "NO_PATCH", reason: gateShortCircuit.reason } as never, []);
      }
      return okResponse({ _tag: "UNKNOWN", reason: gateShortCircuit.reason } as never, []);
    }

    // ── Step 6: run the analysis workflow ────────────────────────────────────
    const chat = deps.createChat(openAiKey);

    const workflowExit = await Effect.runPromiseExit(
      runPatchAnalysis({ chat })({
        proposal,
        evidence: gateEvidence,
        claims,
        context,
        excerpt,
      }),
    );

    if (workflowExit._tag !== "Success") {
      if (workflowExit.cause._tag === "Fail") {
        const err = workflowExit.cause.error as PatchAnalysisError;
        // Defensive: never expose a Data.TaggedError instance in the response.
        return errorResponse(toPatchAnalysisFailureCode(err));
      }
      return errorResponse("ANALYSIS_INVARIANT_VIOLATION");
    }

    // ── Step 7: persist lifecycle state and map decision to JSON-safe response ─
    if (deps.createLifecycleStore === undefined) {
      return okResponse(workflowExit.value, gateEvidence);
    }

    let lifecycleStore: PatchLifecycleStore;
    try {
      lifecycleStore = await deps.createLifecycleStore();
    } catch {
      return errorResponse("LIFECYCLE_STORE_ERROR");
    }

    const eventAt = Date.now();
    const decision = workflowExit.value;
    let lifecycleRecord: PatchLifecycleRecordWithStatus | undefined;

    if (decision._tag === "UPDATE") {
      const savedOutcome = await Effect.runPromise(
        Effect.either(
          lifecycleStore.saveVisible({
            questionId: excerpt.questionId,
            answerId: excerpt.answerId,
            excerptFingerprint: excerpt.fingerprint,
            reason: decision.reason,
            selectedEvidenceFingerprints: decision.selectedEvidenceFingerprints,
            evidence: gateEvidence.map((item) => ({
              fingerprint: item.fingerprint,
              sourceLabel: item.sourceLabel,
              sourceUrl: item.sourceUrl,
              quote: item.quote,
            })),
            ...(decision.affectedWording !== undefined
              ? { affectedWording: decision.affectedWording }
              : {}),
            ...(decision.currentState !== undefined ? { currentState: decision.currentState } : {}),
            ...(decision.impactOnAnswer !== undefined
              ? { impactOnAnswer: decision.impactOnAnswer }
              : {}),
            capturedAt: excerpt.capturedAt,
            eventAt,
          }),
        ),
      );

      if (savedOutcome._tag === "Left") {
        return errorResponse("LIFECYCLE_STORE_ERROR");
      }
      lifecycleRecord = savedOutcome.right;
    } else {
      const supersedeOutcome = await Effect.runPromise(
        Effect.either(lifecycleStore.supersedeByExcerptFingerprint(excerpt.fingerprint, eventAt)),
      );
      if (supersedeOutcome._tag === "Left") {
        return errorResponse("LIFECYCLE_STORE_ERROR");
      }
    }

    const historyOutcome = await Effect.runPromise(
      Effect.either(lifecycleStore.findHistoryByAnswer(excerpt.questionId, excerpt.answerId)),
    );
    if (historyOutcome._tag === "Left") {
      return errorResponse("LIFECYCLE_STORE_ERROR");
    }

    const toHistorySummary = (record: PatchLifecycleRecordWithStatus) => ({
      recordFingerprint: record.recordFingerprint,
      status: record.status,
      capturedAt: record.capturedAt,
      eventAt: record.eventAt,
      reason: record.reason,
    });

    return okResponse(
      decision,
      gateEvidence,
      lifecycleRecord === undefined
        ? undefined
        : {
            recordFingerprint: lifecycleRecord.recordFingerprint,
            status: lifecycleRecord.status,
            capturedAt: lifecycleRecord.capturedAt,
            eventAt: lifecycleRecord.eventAt,
          },
      historyOutcome.right.map(toHistorySummary),
    );
  };

// ═══════════════════════════════════════════════════════════════════════════════
// Production wiring (reads process.env only here)
// ═══════════════════════════════════════════════════════════════════════════════

const FIVE_SECONDS_MS = 5_000 as const;

/**
 * Stable domain-record marker for requests without user-supplied context.
 * The workflow currently requires a proposal context fingerprint, while the
 * public input treats context as optional.
 */
const ABSENT_CONTEXT_FINGERPRINT = "v1:0000000000000000" as const;

/**
 * Lazy singleton store + provider for the server process.
 */
let storeInstance: Promise<ExcerptStore> | null = null;
let cachedProvider: Promise<AnswerExcerptProvider> | null = null;

const getOrCreateProvider = async (secret: string): Promise<AnswerExcerptProvider> => {
  if (!storeInstance) {
    storeInstance = Effect.runPromise(makeSqliteExcerptStore());
  }
  if (!cachedProvider) {
    const store = await storeInstance;
    cachedProvider = Effect.runPromise(
      makeAnswerExcerptProvider({
        fetchItems: makeZhihuSearchItemsFetcher({
          accessSecret: secret,
          transport: makeFetchZhihuSearchTransport({
            fetch: fetch,
            timeoutMs: FIVE_SECONDS_MS,
          }),
        }),
        ttl: 60_000,
        store,
      }),
    );
  }
  return cachedProvider;
};

/**
 * TanStack Start server function that analyzes whether a Zhihu answer
 * needs a patch update.
 *
 * Reads `OPENAI_API_KEY` and `ZHIHU_ACCESS_SECRET` from env.
 * The response is a plain JSON-safe discriminated union.
 */
export const analyzePatch = createServerFn({
  method: "POST",
})
  .validator(validateInput)
  .handler(async ({ data }) => {
    const openAiModel = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const openAiBaseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

    return createAnalyzePatchHandler({
      getSecret: () => [process.env.OPENAI_API_KEY, process.env.ZHIHU_ACCESS_SECRET] as const,
      createChat: (apiKey) =>
        makeOpenAiChatCompletions({
          apiKey,
          model: openAiModel,
          baseUrl: openAiBaseUrl,
          timeoutMs: FIVE_SECONDS_MS,
          transport: makeFetchOpenAiTransport({
            fetch: fetch,
            timeoutMs: FIVE_SECONDS_MS,
          }),
        }),
      createProvider: getOrCreateProvider,
      createClaimStore: () => Effect.runPromise(makeSqliteClaimStore(".local/claims.db")),
      createEvidenceStore: () =>
        Effect.runPromise(makeSqliteEvidenceCandidateStore(".local/evidence-candidates.db")),
      createLifecycleStore: () =>
        Effect.runPromise(makeSqlitePatchLifecycleStore(".local/patch-lifecycle.db")),
    })(data);
  });
