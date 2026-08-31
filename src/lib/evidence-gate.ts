/**
 * Evidence Gate: classifies pre-gate evidence candidates against a claim and
 * promotes qualified ones to {@link PatchEvidence}.
 *
 * Candidates and model output are treated as untrusted. The gate never invents
 * evidence: if no candidate supports or refutes the claim, the verdict is
 * NO_PATCH or UNKNOWN.
 *
 * @module evidence-gate
 */

import { Data, Effect } from "effect";

import type { EvidenceCandidate } from "./evidence-candidate";
import { createPatchEvidence } from "./patch-evidence";
import type { PatchEvidence } from "./patch-evidence";
import type { OpenAiChatCompletions } from "./openai-adapter";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GateClassification = "promote" | "reject" | "insufficient";

export interface CandidateAssessment {
  readonly candidateFingerprint: string;
  readonly classification: GateClassification;
  readonly reason: string;
}

export type GateResult =
  | { readonly _tag: "gate_passed"; readonly evidence: readonly PatchEvidence[] }
  | { readonly _tag: "gate_no_patch"; readonly reason: string }
  | { readonly _tag: "gate_unknown"; readonly reason: string };

export type GateErrorReason = "MALFORMED_MODEL_OUTPUT" | "TRANSPORT_FAILED";

export class EvidenceGateError extends Data.TaggedError("EvidenceGateError")<{
  readonly reason: GateErrorReason;
}> {}

export interface EvidenceGateDeps {
  readonly llm: OpenAiChatCompletions;
  readonly model: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_QUOTE_LENGTH = 500;

const SYSTEM_PROMPT = `You are an evidence gate for a fact-maintenance system.
Given a claim extracted from an old answer and a candidate source, classify the candidate:

promote: the source content is specific enough to serve as evidence for or against the claim.
reject: the source content is irrelevant, too vague, or does not address the claim.
insufficient: the source hints at a change but lacks specifics to confirm or refute.

Return only JSON: {"classification":"promote"|"reject"|"insufficient","reason":"<one sentence>"}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

const parseModelOutput = (raw: string): CandidateAssessment | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    const classification = obj.classification;
    const reason = obj.reason;
    if (
      (classification === "promote" ||
        classification === "reject" ||
        classification === "insufficient") &&
      typeof reason === "string"
    ) {
      return { candidateFingerprint: "", classification, reason };
    }
    return null;
  } catch {
    return null;
  }
};

const truncateQuote = (text: string): string =>
  text.length > MAX_QUOTE_LENGTH ? text.slice(0, MAX_QUOTE_LENGTH) : text;

const buildUserMessage = (claimText: string, candidate: EvidenceCandidate): string =>
  `Claim: ${claimText}\n\nSource: ${candidate.title}\nURL: ${candidate.sourceUrl}\nContent: ${candidate.contentPreview}`;

// ── Gate ──────────────────────────────────────────────────────────────────────

export const runEvidenceGate = (
  deps: EvidenceGateDeps,
  claimText: string,
  candidates: readonly EvidenceCandidate[],
): Effect.Effect<GateResult, EvidenceGateError> =>
  Effect.gen(function* () {
    if (candidates.length === 0) {
      return {
        _tag: "gate_unknown" as const,
        reason: "No evidence candidates were found for this claim.",
      };
    }

    const assessments: CandidateAssessment[] = [];
    for (const candidate of candidates) {
      const userMessage = buildUserMessage(claimText, candidate);
      const raw = yield* deps.llm
        .complete({
          model: deps.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
        })
        .pipe(
          Effect.mapError(
            (): EvidenceGateError => new EvidenceGateError({ reason: "TRANSPORT_FAILED" }),
          ),
        );

      const parsed = parseModelOutput(raw);
      if (parsed === null) {
        return yield* Effect.fail(new EvidenceGateError({ reason: "MALFORMED_MODEL_OUTPUT" }));
      }

      assessments.push({
        candidateFingerprint: candidate.candidateFingerprint,
        classification: parsed.classification,
        reason: parsed.reason,
      });
    }

    const promoted: PatchEvidence[] = [];
    let hasInsufficient = false;

    for (const assessment of assessments) {
      if (assessment.classification === "promote") {
        const candidate = candidates.find(
          (c) => c.candidateFingerprint === assessment.candidateFingerprint,
        );
        if (!candidate) continue;

        const result = createPatchEvidence({
          sourceLabel: candidate.sourceLabel,
          sourceUrl: candidate.sourceUrl,
          quote: truncateQuote(candidate.contentPreview),
          capturedAt: candidate.capturedAt,
        });
        if (result._tag === "success") {
          promoted.push(result.evidence);
        }
      } else if (assessment.classification === "insufficient") {
        hasInsufficient = true;
      }
    }

    if (promoted.length > 0) {
      return { _tag: "gate_passed" as const, evidence: promoted };
    }

    if (hasInsufficient) {
      return {
        _tag: "gate_unknown" as const,
        reason: "Evidence candidates hint at a change but lack specifics to confirm or refute.",
      };
    }

    return {
      _tag: "gate_no_patch" as const,
      reason: "No evidence candidate addresses this claim with enough specificity.",
    };
  });
