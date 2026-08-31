import { PatchAnalysisError } from "../lib/patch-analysis-workflow";
import type {
  PatchAnalysisDecision,
  PatchAnalysisUpdateDecision,
} from "../lib/patch-analysis-workflow";
import type { PatchEvidence } from "../lib/patch-evidence";
import type { PatchLifecycleStatus } from "../lib/patch-lifecycle";
import type { AnalyzePatchServerFailureCode } from "../lib/failure-messages";

// ── Failure codes (serializable strings) ──────────────────────────────────────

export type { AnalyzePatchServerFailureCode } from "../lib/failure-messages";

// ── Evidence summary ────────────────────────────────────────────────────────────

export interface AnalyzePatchEvidenceSummary {
  readonly fingerprint: string;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
}

// ── Matched evidence record (server-owned, built from PatchEvidence) ────────────

const EVIDENCE_QUOTE_DISPLAY_MAX = 120;

export interface MatchedEvidenceRecord {
  readonly fingerprint: string;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
  readonly quote: string;
}

export interface PatchLifecycleSummary {
  readonly recordFingerprint: string;
  readonly status: PatchLifecycleStatus;
  readonly capturedAt: number;
  readonly eventAt: number;
}

export interface PatchLifecycleHistorySummary {
  readonly recordFingerprint: string;
  readonly status: PatchLifecycleStatus;
  readonly capturedAt: number;
  readonly eventAt: number;
  readonly reason: string;
}

// ── Advisory-only UPDATE decision ───────────────────────────────────────────────

export interface AnalyzePatchUpdateResponse {
  readonly verdict: "UPDATE";
  readonly reason: string;
  readonly patchBodyStatus: "no-body-available";
  readonly selectedEvidenceFingerprints: readonly string[];
  readonly evidenceSummary: readonly AnalyzePatchEvidenceSummary[];
  readonly affectedWording?: string;
  readonly currentState?: string;
  readonly impactOnAnswer?: string;
  readonly matchedEvidence?: readonly MatchedEvidenceRecord[];
}

// ── NO_PATCH and UNKNOWN decisions ─────────────────────────────────────────────

export interface AnalyzePatchNoPatchResponse {
  readonly verdict: "NO_PATCH";
  readonly reason: string;
}

export interface AnalyzePatchUnknownResponse {
  readonly verdict: "UNKNOWN";
  readonly reason: string;
}

export interface AnalyzePatchCorrectionResponse {
  readonly verdict: "CORRECTION";
  readonly reason: string;
}

export interface AnalyzePatchConditionResponse {
  readonly verdict: "CONDITION";
  readonly reason: string;
}

export interface AnalyzePatchBetterWayResponse {
  readonly verdict: "BETTER_WAY";
  readonly reason: string;
}

// ── Decision fragment inside the ok response ────────────────────────────────────

export type AnalyzePatchDecisionResponse =
  | AnalyzePatchUpdateResponse
  | AnalyzePatchNoPatchResponse
  | AnalyzePatchUnknownResponse
  | AnalyzePatchCorrectionResponse
  | AnalyzePatchConditionResponse
  | AnalyzePatchBetterWayResponse;

// ── Response union ─────────────────────────────────────────────────────────────

export type AnalyzePatchResponse =
  | {
      readonly status: "ok";
      readonly decision: AnalyzePatchDecisionResponse;
      readonly lifecycle?: PatchLifecycleSummary;
      readonly history?: readonly PatchLifecycleHistorySummary[];
    }
  | { readonly status: "error"; readonly code: AnalyzePatchServerFailureCode };

// ── Mapper: PatchAnalysisError → server failure code ───────────────────────────

export const toPatchAnalysisFailureCode = (
  _error: PatchAnalysisError,
): AnalyzePatchServerFailureCode => {
  // Malformed model output variants collapse to one user-facing code.
  if (
    _error.reason === "MALFORMED_JSON" ||
    _error.reason === "INVALID_VERDICT" ||
    _error.reason === "INVALID_REASON"
  ) {
    return "MALFORMED_MODEL_OUTPUT";
  }

  // Transport failures from the OpenAI adapter.
  if (_error.reason === "TRANSPORT_FAILED") {
    return "MODEL_TRANSPORT_ERROR";
  }

  // Anything else is a defensive invariant failure; never expose the internal
  // error details in the response.
  return "ANALYSIS_INVARIANT_VIOLATION";
};

// ── Response constructors ──────────────────────────────────────────────────────

/**
 * Map a PatchAnalysisDecision to an advisory decision object.
 *
 * For UPDATE, the server never exposes a proposed patch body.  Instead it
 * signals `patchBodyStatus: "no-body-available"` and includes only evidence
 * records that carry an external URL (no `null` source URLs).
 *
 * For NO_PATCH and UNKNOWN, the decision is returned verbatim without extra
 * fields.
 */
export const mapDecisionToResponse = (
  decision: PatchAnalysisDecision,
  evidence: readonly PatchEvidence[],
): AnalyzePatchDecisionResponse => {
  switch (decision._tag) {
    case "UPDATE": {
      const update = decision as PatchAnalysisUpdateDecision;
      const evidenceSummary = evidence
        .filter((e) => typeof e.sourceUrl === "string" && e.sourceUrl !== "")
        .map((e) => ({
          fingerprint: e.fingerprint,
          sourceLabel: e.sourceLabel,
          sourceUrl: e.sourceUrl as string,
        }));

      const matchedSet = new Set(update.selectedEvidenceFingerprints);
      const matchedRecords: MatchedEvidenceRecord[] = [];
      for (const e of evidence) {
        if (
          typeof e.sourceUrl === "string" &&
          e.sourceUrl !== "" &&
          matchedSet.has(e.fingerprint)
        ) {
          const truncatedQuote =
            e.quote.length > EVIDENCE_QUOTE_DISPLAY_MAX
              ? e.quote.slice(0, EVIDENCE_QUOTE_DISPLAY_MAX) + "…"
              : e.quote;
          matchedRecords.push({
            fingerprint: e.fingerprint,
            sourceLabel: e.sourceLabel,
            sourceUrl: e.sourceUrl,
            quote: truncatedQuote,
          });
        }
      }

      const response: AnalyzePatchUpdateResponse = {
        verdict: "UPDATE",
        reason: update.reason,
        patchBodyStatus: "no-body-available",
        selectedEvidenceFingerprints: update.selectedEvidenceFingerprints,
        evidenceSummary,
        ...(update.affectedWording !== undefined
          ? { affectedWording: update.affectedWording }
          : {}),
        ...(update.currentState !== undefined ? { currentState: update.currentState } : {}),
        ...(update.impactOnAnswer !== undefined ? { impactOnAnswer: update.impactOnAnswer } : {}),
        ...(matchedRecords.length > 0 ? { matchedEvidence: matchedRecords } : {}),
      };

      return response;
    }

    case "NO_PATCH":
      return {
        verdict: "NO_PATCH",
        reason: decision.reason,
      };

    case "UNKNOWN":
      return {
        verdict: "UNKNOWN",
        reason: decision.reason,
      };

    case "CORRECTION":
      return {
        verdict: "CORRECTION",
        reason: decision.reason,
      };

    case "CONDITION":
      return {
        verdict: "CONDITION",
        reason: decision.reason,
      };

    case "BETTER_WAY":
      return {
        verdict: "BETTER_WAY",
        reason: decision.reason,
      };
  }
};

export const okResponse = (
  decision: PatchAnalysisDecision,
  evidence: readonly PatchEvidence[],
  lifecycle?: PatchLifecycleSummary,
  history?: readonly PatchLifecycleHistorySummary[],
): AnalyzePatchResponse => ({
  status: "ok",
  decision: mapDecisionToResponse(decision, evidence),
  ...(lifecycle !== undefined ? { lifecycle } : {}),
  ...(history !== undefined ? { history } : {}),
});

export const errorResponse = (code: AnalyzePatchServerFailureCode): AnalyzePatchResponse => ({
  status: "error",
  code,
});
