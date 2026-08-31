/**
 * Effect-based workflow that decides whether a {@link PatchProposal} should be
 * applied by consulting the OpenAI chat-completions service.
 *
 * The workflow is a pure domain construct: it does not persist, render UI,
 * read environment variables, or create provider SDK dependencies.  It
 * enforces the product invariant at its boundary -- an {@link "UPDATE"} verdict
 * requires at least one evidence record with an external URL that actually
 * appears in the supplied evidence array.
 *
 * @module patch-analysis-workflow
 */

import type { PatchProposal } from "./patch-proposal";
import type { PatchEvidence } from "./patch-evidence";
import type { UserSuppliedContext } from "./user-supplied-context";
import type { AnswerExcerpt } from "./answer-excerpt";
import { Data, Effect } from "effect";
import type { OpenAiChatCompletions } from "./openai-adapter";

// ── Failure types ───────────────────────────────────────────────────────────────

export type PatchAnalysisFailureReason =
  | "MALFORMED_JSON"
  | "INVALID_VERDICT"
  | "INVALID_REASON"
  | "TRANSPORT_FAILED";

export class PatchAnalysisError extends Data.TaggedError("PatchAnalysisError")<{
  readonly reason: PatchAnalysisFailureReason;
  readonly detail?: string;
  readonly transportError?: import("./openai-adapter").OpenAiTransportError;
}> {}

// ── Prompt schema (sent to the model) ──────────────────────────────────────────

/**
 * Deterministic JSON payload assembled from domain data only.
 * No secrets, environment values, or raw HTML are included.
 */
type AnalysisPrompt = {
  readonly task: "analyze-patch";
  readonly version: "2";
  readonly proposal: {
    readonly proposedBody: string;
    readonly answerSnapshotFingerprint: string;
    readonly contextFingerprint: string;
    readonly evidenceFingerprint?: string;
    readonly answerContext?: {
      readonly contextText?: string;
      readonly excerptText?: string;
    };
  };
  readonly evidence: ReadonlyArray<{
    readonly fingerprint: string;
    readonly sourceLabel: string;
    readonly sourceUrl: string | null;
    readonly quote: string;
  }>;
  readonly claims?: ReadonlyArray<{
    readonly claimText: string;
    readonly volatility: string;
    readonly decisionRelevance: string;
  }>;
  readonly expectedResponse: {
    readonly verdict: "UPDATE" | "NO_PATCH" | "UNKNOWN";
    readonly reason: string;
    readonly selectedEvidenceFingerprints?: readonly string[];
    readonly affectedWording?: string;
    readonly currentState?: string;
    readonly impactOnAnswer?: string;
  };
};

// ── Model response schema (parsed from model output) ───────────────────────────

type ModelResponse = {
  readonly verdict: string;
  readonly reason: string;
  readonly selectedEvidenceFingerprints?: readonly string[];
  readonly affectedWording?: string;
  readonly currentState?: string;
  readonly impactOnAnswer?: string;
};

// ── Decision types ─────────────────────────────────────────────────────────────

export type PatchAnalysisVerdict = "UPDATE" | "NO_PATCH" | "UNKNOWN";

export interface PatchAnalysisUpdateDecision {
  readonly _tag: "UPDATE";
  readonly selectedEvidenceFingerprints: readonly string[];
  readonly reason: string;
  readonly affectedWording?: string;
  readonly currentState?: string;
  readonly impactOnAnswer?: string;
}

export interface PatchAnalysisNoPatchDecision {
  readonly _tag: "NO_PATCH";
  readonly reason: string;
}

export interface PatchAnalysisUnknownDecision {
  readonly _tag: "UNKNOWN";
  readonly reason: string;
}

export type PatchAnalysisDecision =
  | PatchAnalysisUpdateDecision
  | PatchAnalysisNoPatchDecision
  | PatchAnalysisUnknownDecision;

// ── Input type ─────────────────────────────────────────────────────────────────

export interface AnalyzePatchInput {
  readonly proposal: PatchProposal;
  readonly evidence: readonly PatchEvidence[];
  readonly claims?: readonly PatchAnalysisClaimContext[];
  readonly context?: UserSuppliedContext;
  readonly excerpt?: AnswerExcerpt;
}

/** Claim fields safe to send to the analysis model. */
export interface PatchAnalysisClaimContext {
  readonly claimText: string;
  readonly volatility: string;
  readonly decisionRelevance: string;
}

// ── Dependency injection ───────────────────────────────────────────────────────

export interface PatchAnalysisWorkflowDeps {
  readonly chat: OpenAiChatCompletions;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Validate a text field: trim, require non-empty, reject control characters
 * (charCode < 0x20), and enforce a maximum character length.
 * Returns the validated string or null when the field should be rejected.
 */
const validateTextField = (raw: unknown, maxLength: number): string | null => {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.length > maxLength) return null;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed.charCodeAt(i) < 0x20) return null;
  }
  return trimmed;
};

// ── Prompt construction ────────────────────────────────────────────────────────

const buildPrompt = (input: AnalyzePatchInput): AnalysisPrompt => {
  const evidenceEntries = input.evidence.map((e) => ({
    fingerprint: e.fingerprint,
    sourceLabel: e.sourceLabel,
    sourceUrl: e.sourceUrl ?? null,
    quote: e.quote,
  }));

  const claimEntries = (input.claims ?? []).map((claim) => ({
    claimText: claim.claimText,
    volatility: claim.volatility,
    decisionRelevance: claim.decisionRelevance,
  }));

  const proposalEntries: Record<string, unknown> = {
    proposedBody: input.proposal.proposedBody,
    answerSnapshotFingerprint: input.proposal.answerSnapshotFingerprint,
    contextFingerprint: input.proposal.contextFingerprint,
  };

  if (input.proposal.evidenceFingerprint !== undefined) {
    proposalEntries.evidenceFingerprint = input.proposal.evidenceFingerprint;
  }

  const answerContext: Record<string, string> = {};
  if (input.context !== undefined) {
    answerContext.contextText = input.context.contextText;
  }
  if (input.excerpt !== undefined) {
    answerContext.excerptText = input.excerpt.excerpt;
  }

  const hasAnswerContext = Object.keys(answerContext).length > 0;

  return Object.freeze({
    task: "analyze-patch",
    version: "2",
    proposal: Object.freeze(proposalEntries) as AnalysisPrompt["proposal"],
    evidence: Object.freeze(evidenceEntries),
    ...(claimEntries.length > 0
      ? { claims: Object.freeze(claimEntries) as AnalysisPrompt["claims"] }
      : {}),
    ...(hasAnswerContext ? { answerContext: Object.freeze(answerContext) } : {}),
    expectedResponse: Object.freeze({
      verdict: "UPDATE",
      reason: "string",
      selectedEvidenceFingerprints: ["v1:hex"],
      affectedWording: "string",
      currentState: "string",
      impactOnAnswer: "string",
    }),
  } as AnalysisPrompt);
};

// ── Parsing helpers ─────────────────────────────────────────────────────────────

const parseVerdict = (raw: unknown): PatchAnalysisVerdict | null => {
  if (raw === "UPDATE" || raw === "NO_PATCH" || raw === "UNKNOWN") {
    return raw;
  }
  return null;
};

const parseModelResponse = (
  content: string,
):
  | { readonly _tag: "success"; readonly response: ModelResponse }
  | { readonly _tag: "failure"; readonly error: PatchAnalysisError } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      _tag: "failure",
      error: new PatchAnalysisError({
        reason: "MALFORMED_JSON",
        detail: "Model returned content that is not valid JSON.",
      }),
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      _tag: "failure",
      error: new PatchAnalysisError({
        reason: "MALFORMED_JSON",
        detail: "Model output is not a JSON object.",
      }),
    };
  }

  const obj = parsed as Record<string, unknown>;

  // --- verdict ----------------------------------------------------------------

  if (!("verdict" in obj) || typeof obj.verdict !== "string") {
    return {
      _tag: "failure",
      error: new PatchAnalysisError({
        reason: "INVALID_VERDICT",
        detail: "Model output is missing a string 'verdict' field.",
      }),
    };
  }

  const verdict = parseVerdict(obj.verdict);
  if (verdict === null) {
    return {
      _tag: "failure",
      error: new PatchAnalysisError({
        reason: "INVALID_VERDICT",
        detail: `Model verdict '${obj.verdict}' is not one of UPDATE, NO_PATCH, UNKNOWN.`,
      }),
    };
  }

  // --- reason ------------------------------------------------------------------

  if (!("reason" in obj) || typeof obj.reason !== "string") {
    return {
      _tag: "failure",
      error: new PatchAnalysisError({
        reason: "INVALID_REASON",
        detail: "Model output is missing a string 'reason' field.",
      }),
    };
  }

  const reason = validateTextField(obj.reason, 500);
  if (reason === null) {
    return {
      _tag: "failure",
      error: new PatchAnalysisError({
        reason: "INVALID_REASON",
        detail: "Model output 'reason' is empty, too long, or contains control characters.",
      }),
    };
  }

  // --- selectedEvidenceFingerprints (optional) ----------------------------------

  let selectedEvidenceFingerprints: readonly string[] | undefined;
  if ("selectedEvidenceFingerprints" in obj) {
    const rawList = obj.selectedEvidenceFingerprints;
    if (!Array.isArray(rawList)) {
      return {
        _tag: "failure",
        error: new PatchAnalysisError({
          reason: "INVALID_VERDICT",
          detail: "Model output 'selectedEvidenceFingerprints' is not an array.",
        }),
      };
    }

    const fingerprints: string[] = [];
    for (const item of rawList) {
      if (typeof item !== "string" || !/^v1:[0-9a-f]{16}$/.test(item)) {
        return {
          _tag: "failure",
          error: new PatchAnalysisError({
            reason: "INVALID_VERDICT",
            detail: `Model output contains an invalid evidence fingerprint: '${String(item)}'.`,
          }),
        };
      }
      fingerprints.push(item);
    }
    selectedEvidenceFingerprints = Object.freeze(fingerprints);
  }

  // --- affectedWording (optional) ----------------------------------------------

  const affectedWording = validateTextField(
    "affectedWording" in obj ? obj.affectedWording : undefined,
    200,
  );

  // --- currentState (optional) -------------------------------------------------

  const currentState = validateTextField("currentState" in obj ? obj.currentState : undefined, 200);

  // --- impactOnAnswer (optional) -----------------------------------------------

  const impactOnAnswer = validateTextField(
    "impactOnAnswer" in obj ? obj.impactOnAnswer : undefined,
    200,
  );

  return {
    _tag: "success",
    response: {
      verdict,
      reason,
      selectedEvidenceFingerprints,
      ...(affectedWording !== null ? { affectedWording } : {}),
      ...(currentState !== null ? { currentState } : {}),
      ...(impactOnAnswer !== null ? { impactOnAnswer } : {}),
    },
  };
};

// ── Claim-anchor verification ──────────────────────────────────────────────────

/**
 * Verify that `affectedWording` (when present) is an exact contiguous substring
 * of the supplied excerpt.  If it does not match, the field is dropped rather
 * than trusting a paraphrase or fabricated quote.
 */
const verifyClaimAnchor = (
  wording: string | undefined,
  excerpt: string | undefined,
): string | undefined => {
  if (wording === undefined) return undefined;
  if (typeof excerpt !== "string" || excerpt === "") return undefined;
  if (!excerpt.includes(wording)) return undefined;
  return wording;
};

// ── Product invariant enforcement ──────────────────────────────────────────────

/**
 * Enforce the product invariant: UPDATE requires at least one evidence record
 * with an external URL, and all selected evidence fingerprints must exist in
 * the supplied array.
 *
 * If the condition is not met, downgrade UPDATE -> UNKNOWN with an explanation.
 */
const enforceUpdateInvariant = (
  decision: PatchAnalysisUpdateDecision,
  evidence: readonly PatchEvidence[],
): PatchAnalysisDecision => {
  if (
    !decision.selectedEvidenceFingerprints ||
    decision.selectedEvidenceFingerprints.length === 0
  ) {
    return {
      _tag: "UNKNOWN",
      reason: "Model returned UPDATE without selected evidence fingerprints.",
    };
  }

  // Build a lookup set of evidence fingerprints that have an external URL.
  const externalSet = new Set(
    evidence
      .filter((e) => typeof e.sourceUrl === "string" && e.sourceUrl !== "")
      .map((e) => e.fingerprint),
  );

  // Verify every selected fingerprint has an external URL in the evidence set.
  for (const fp of decision.selectedEvidenceFingerprints) {
    if (!externalSet.has(fp)) {
      return {
        _tag: "UNKNOWN",
        reason:
          "Model selected evidence that does not have a valid external URL in the supplied evidence array.",
      };
    }
  }

  return decision;
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Analyze a {@link PatchProposal} against its {@link PatchEvidence} records by
 * consulting the injected OpenAI chat-completions service.
 *
 * **Contract:**
 * - Calls `chat.complete()` exactly once.
 * - Returns a typed {@link PatchAnalysisDecision} or raises a
 *   {@link PatchAnalysisError}.
 * - Effect error is {@link PatchAnalysisError} with one of:
 *   `MALFORMED_JSON`, `INVALID_VERDICT`, `INVALID_REASON`, or
 *   `TRANSPORT_FAILED`.
 * - Transport errors from the OpenAI adapter are preserved in
 *   `PatchAnalysisError` under `transportError`.
 */
export const analyzePatch =
  (deps: PatchAnalysisWorkflowDeps) =>
  (input: AnalyzePatchInput): Effect.Effect<PatchAnalysisDecision, PatchAnalysisError> =>
    Effect.gen(function* () {
      // Build a deterministic prompt containing only domain-relevant data.
      const prompt = buildPrompt(input);

      // Call the injected OpenAI service exactly once.
      const content: string = yield* deps.chat
        .complete({
          model: "patch-analysis",
          messages: [{ role: "user", content: JSON.stringify(prompt) }],
        })
        .pipe(
          Effect.catchAll((transportErr) =>
            Effect.fail(
              new PatchAnalysisError({
                reason: "TRANSPORT_FAILED",
                transportError: transportErr,
              }),
            ),
          ),
        );

      // Parse and validate the model response.
      const parseResult = parseModelResponse(content);
      if (parseResult._tag === "failure") {
        return yield* Effect.fail(parseResult.error);
      }

      const {
        verdict,
        reason,
        selectedEvidenceFingerprints,
        affectedWording,
        currentState,
        impactOnAnswer,
      } = parseResult.response;

      // Build the typed decision.
      switch (verdict) {
        case "UPDATE": {
          const verifiedWording = verifyClaimAnchor(affectedWording, input.excerpt?.excerpt);
          const updateDecision: PatchAnalysisUpdateDecision = {
            _tag: "UPDATE",
            selectedEvidenceFingerprints: selectedEvidenceFingerprints ?? [],
            reason,
            affectedWording: verifiedWording,
            currentState,
            impactOnAnswer,
          };
          return enforceUpdateInvariant(updateDecision, input.evidence);
        }
        case "NO_PATCH":
          return {
            _tag: "NO_PATCH",
            reason,
          } as PatchAnalysisNoPatchDecision;
        case "UNKNOWN":
          return {
            _tag: "UNKNOWN",
            reason,
          } as PatchAnalysisUnknownDecision;
        default:
          return yield* Effect.fail(
            new PatchAnalysisError({
              reason: "INVALID_VERDICT",
              detail: `Unreachable: verdict '${verdict}' was not caught by parser.`,
            }),
          );
      }
    });
