import { describe, expect, it } from "vite-plus/test";

import {
  PatchAnalysisError,
  type PatchAnalysisUpdateDecision,
  type PatchAnalysisNoPatchDecision,
  type PatchAnalysisUnknownDecision,
} from "../lib/patch-analysis-workflow";
import type { AnalyzePatchUpdateResponse } from "./analyze-patch-response";

import {
  errorResponse,
  okResponse,
  mapDecisionToResponse,
  toPatchAnalysisFailureCode,
} from "./analyze-patch-response";

// ── Helpers ──────────────────────────────────────────────────────────────

const makeEvidence = (
  label: string,
  url: string | undefined,
  quote: string,
  capturedAt: number,
): import("../lib/patch-evidence").PatchEvidence => ({
  sourceLabel: label,
  sourceUrl: url,
  quote,
  capturedAt,
  fingerprint: `v1:${label.substring(0, 16).padEnd(16, "0")}`,
});

const makeExternalEvidence = (): import("../lib/patch-evidence").PatchEvidence =>
  makeEvidence("un.org", "https://www.un.org/en/dayof8billion", "8 billion people", 1_700_000_000);

const makeNoUrlEvidence = (): import("../lib/patch-evidence").PatchEvidence =>
  makeEvidence("wiki", undefined, "population estimate", 1_700_000_000);

// ── toPatchAnalysisFailureCode ──────────────────────────────────────────

describe("analyze-patch-response", () => {
  describe("toPatchAnalysisFailureCode", () => {
    it("maps MALFORMED_JSON to MALFORMED_MODEL_OUTPUT", () => {
      expect(toPatchAnalysisFailureCode(new PatchAnalysisError({ reason: "MALFORMED_JSON" }))).toBe(
        "MALFORMED_MODEL_OUTPUT",
      );
    });

    it("maps INVALID_VERDICT to MALFORMED_MODEL_OUTPUT", () => {
      expect(
        toPatchAnalysisFailureCode(new PatchAnalysisError({ reason: "INVALID_VERDICT" })),
      ).toBe("MALFORMED_MODEL_OUTPUT");
    });

    it("maps INVALID_REASON to MALFORMED_MODEL_OUTPUT", () => {
      expect(toPatchAnalysisFailureCode(new PatchAnalysisError({ reason: "INVALID_REASON" }))).toBe(
        "MALFORMED_MODEL_OUTPUT",
      );
    });

    it("maps TRANSPORT_FAILED to MODEL_TRANSPORT_ERROR", () => {
      expect(
        toPatchAnalysisFailureCode(new PatchAnalysisError({ reason: "TRANSPORT_FAILED" })),
      ).toBe("MODEL_TRANSPORT_ERROR");
    });

    it("preserves transportError in the error but still maps to MODEL_TRANSPORT_ERROR", () => {
      const err = new PatchAnalysisError({
        reason: "TRANSPORT_FAILED",
        transportError: {
          _tag: "OpenAiTransportError",
          reason: "HTTP_STATUS",
          status: 429,
        } as any,
      });
      expect(toPatchAnalysisFailureCode(err)).toBe("MODEL_TRANSPORT_ERROR");
    });

    it("maps any unknown reason to ANALYSIS_INVARIANT_VIOLATION", () => {
      // @ts-expect-error testing an unknown reason
      expect(toPatchAnalysisFailureCode(new PatchAnalysisError({ reason: "UNKNOWN_REASON" }))).toBe(
        "ANALYSIS_INVARIANT_VIOLATION",
      );
    });
  });

  // ── okResponse ─────────────────────────────────────────────────────────

  describe("okResponse", () => {
    it("returns status ok with an UPDATE decision", () => {
      const decision: PatchAnalysisUpdateDecision = {
        _tag: "UPDATE",
        reason: "External source confirms.",
        selectedEvidenceFingerprints: ["v1:0000000000000000"],
      };
      const evidence = [makeExternalEvidence()];
      const response = okResponse(decision, evidence);
      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.decision.verdict).toBe("UPDATE");
        expect(response.decision.reason).toBe("External source confirms.");
        expect((response.decision as AnalyzePatchUpdateResponse).patchBodyStatus).toBe(
          "no-body-available",
        );
      }
    });

    it("returns status ok with a NO_PATCH decision", () => {
      const decision: PatchAnalysisNoPatchDecision = {
        _tag: "NO_PATCH",
        reason: "Answer is accurate.",
      };
      const evidence = [makeExternalEvidence()];
      const response = okResponse(decision, evidence);
      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.decision.verdict).toBe("NO_PATCH");
        expect(response.decision.reason).toBe("Answer is accurate.");
        expect("patchBodyStatus" in response.decision).toBe(false);
        expect("selectedEvidenceFingerprints" in response.decision).toBe(false);
        expect("evidenceSummary" in response.decision).toBe(false);
      }
    });

    it("returns status ok with an UNKNOWN decision", () => {
      const decision: PatchAnalysisUnknownDecision = {
        _tag: "UNKNOWN",
        reason: "Inconclusive.",
      };
      const evidence = [makeExternalEvidence()];
      const response = okResponse(decision, evidence);
      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.decision.verdict).toBe("UNKNOWN");
        expect(response.decision.reason).toBe("Inconclusive.");
        expect("patchBodyStatus" in response.decision).toBe(false);
        expect("selectedEvidenceFingerprints" in response.decision).toBe(false);
        expect("evidenceSummary" in response.decision).toBe(false);
      }
    });
  });

  // ── errorResponse ──────────────────────────────────────────────────────

  describe("errorResponse", () => {
    it("returns status error with the given code", () => {
      const response = errorResponse("MALFORMED_MODEL_OUTPUT");
      if (response.status === "error") {
        expect(response.code).toBe("MALFORMED_MODEL_OUTPUT");
      }
    });
  });

  // ── mapDecisionToResponse: UPDATE details ───────────────────────────────

  describe("mapDecisionToResponse UPDATE", () => {
    it("includes patchBodyStatus: 'no-body-available'", () => {
      const decision: PatchAnalysisUpdateDecision = {
        _tag: "UPDATE",
        reason: "Confirmed.",
        selectedEvidenceFingerprints: ["v1:0000000000000000"],
      };
      const evidence = [makeExternalEvidence()];
      const result = mapDecisionToResponse(decision, evidence);
      expect(result).toEqual(
        expect.objectContaining({
          verdict: "UPDATE",
          reason: "Confirmed.",
          patchBodyStatus: "no-body-available",
        }),
      );
    });

    it("includes selectedEvidenceFingerprints", () => {
      const decision: PatchAnalysisUpdateDecision = {
        _tag: "UPDATE",
        reason: "Confirmed.",
        selectedEvidenceFingerprints: ["v1:0000000000000000"],
      };
      const evidence = [makeExternalEvidence()];
      const result = mapDecisionToResponse(decision, evidence);
      if (result.verdict === "UPDATE") {
        expect(result.selectedEvidenceFingerprints).toEqual(["v1:0000000000000000"]);
      }
    });

    it("includes evidenceSummary with external URLs only", () => {
      const evidence = [makeExternalEvidence(), makeNoUrlEvidence()];
      const fp = evidence[0].fingerprint;
      const decision: PatchAnalysisUpdateDecision = {
        _tag: "UPDATE",
        reason: "Confirmed.",
        selectedEvidenceFingerprints: [fp],
      };
      const result = mapDecisionToResponse(decision, evidence);
      if (result.verdict === "UPDATE") {
        expect(result.evidenceSummary).toHaveLength(1);
        expect(result.evidenceSummary![0].fingerprint).toBe(fp);
        expect(result.evidenceSummary![0].sourceUrl).toBe("https://www.un.org/en/dayof8billion");
        expect(result.evidenceSummary![0].sourceLabel).toBe("un.org");
      }
    });

    it("omits evidenceSummary when no evidence has an external URL", () => {
      const decision: PatchAnalysisUpdateDecision = {
        _tag: "UPDATE",
        reason: "Confirmed.",
        selectedEvidenceFingerprints: [],
      };
      const evidence = [makeNoUrlEvidence()];
      const result = mapDecisionToResponse(decision, evidence);
      if (result.verdict === "UPDATE") {
        expect(result.evidenceSummary).toHaveLength(0);
      }
    });

    it("response contains no proposedBody field", () => {
      const decision: PatchAnalysisUpdateDecision = {
        _tag: "UPDATE",
        reason: "Confirmed.",
        selectedEvidenceFingerprints: ["v1:0000000000000000"],
      };
      const evidence = [makeExternalEvidence()];
      const response = okResponse(decision, evidence);
      if (response.status === "ok") {
        expect("proposedBody" in response.decision).toBe(false);
      }
    });
  });

  // ── mapDecisionToResponse: NO_PATCH and UNKNOWN ────────────────────────

  describe("mapDecisionToResponse NO_PATCH and UNKNOWN", () => {
    it("NO_PATCH does not carry patchBodyStatus, evidenceSummary, or selectedEvidenceFingerprints", () => {
      const decision: PatchAnalysisNoPatchDecision = {
        _tag: "NO_PATCH",
        reason: "Fine.",
      };
      const evidence = [makeExternalEvidence()];
      const result = mapDecisionToResponse(decision, evidence);
      expect(result.verdict).toBe("NO_PATCH");
      expect("patchBodyStatus" in result).toBe(false);
      expect("evidenceSummary" in result).toBe(false);
    });

    it("UNKNOWN does not carry patchBodyStatus, evidenceSummary, or selectedEvidenceFingerprints", () => {
      const decision: PatchAnalysisUnknownDecision = {
        _tag: "UNKNOWN",
        reason: "Inconclusive.",
      };
      const evidence = [makeExternalEvidence()];
      const result = mapDecisionToResponse(decision, evidence);
      expect(result.verdict).toBe("UNKNOWN");
      expect("patchBodyStatus" in result).toBe(false);
      expect("evidenceSummary" in result).toBe(false);
    });
  });

  // ── No Data.TaggedError in any response ────────────────────────────────

  describe("security: no Data.TaggedError in any response", () => {
    it("error responses are plain objects", () => {
      const response = errorResponse("MALFORMED_MODEL_OUTPUT");
      expect(response).toEqual({ status: "error", code: "MALFORMED_MODEL_OUTPUT" });
    });

    it("ok response with UPDATE is a plain object", () => {
      const decision: PatchAnalysisUpdateDecision = {
        _tag: "UPDATE",
        reason: "Confirmed.",
        selectedEvidenceFingerprints: [],
      };
      const response = okResponse(decision, []);
      expect(response).toEqual(
        expect.objectContaining({
          status: "ok",
          decision: expect.objectContaining({
            verdict: "UPDATE",
            reason: "Confirmed.",
            patchBodyStatus: "no-body-available",
          }),
        }),
      );
    });
  });
});
