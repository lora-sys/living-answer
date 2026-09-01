import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";

import { fnv1a64 } from "../lib/answer-excerpt";
import { createEvidenceCandidate, type EvidenceCandidate } from "../lib/evidence-candidate";
import { createPatchFeedback, type PatchFeedbackRecord } from "../lib/patch-feedback";
import { makeSqlitePatchFeedbackStore, type PatchFeedbackStore } from "../lib/patch-feedback-store";

export type SubmitPatchFeedbackFailureCode = "INVALID_REQUEST" | "FEEDBACK_STORE_ERROR";

export type PatchFeedbackReviewOutcome =
  | "PENDING_REVIEW"
  | "EVIDENCE_GATE_PASSED"
  | "EVIDENCE_GATE_INSUFFICIENT"
  | "EVIDENCE_GATE_REJECTED";

export type SubmitPatchFeedbackResponse =
  | {
      readonly status: "ok";
      readonly feedbackFingerprint: string;
      readonly submittedAt: number;
      readonly reviewState: PatchFeedbackReviewOutcome;
    }
  | {
      readonly status: "error";
      readonly code: SubmitPatchFeedbackFailureCode;
      readonly message: string;
    };

export interface SubmitPatchFeedbackInput {
  readonly questionId: string;
  readonly answerId: string;
  readonly excerptFingerprint: string;
  readonly recordFingerprint?: string;
  readonly reason: PatchFeedbackRecord["reason"];
  readonly question?: string;
  readonly evidenceUrl?: string;
  readonly evidenceQuote?: string;
}

export type EvidenceReviewOutcome = "passed" | "insufficient" | "no_patch";

export interface SubmitPatchFeedbackDeps {
  readonly createFeedbackStore: () => Promise<PatchFeedbackStore>;
  readonly reviewEvidence?: (
    claimText: string,
    candidates: readonly EvidenceCandidate[],
  ) => Promise<EvidenceReviewOutcome>;
}

const parseInput = (input: unknown): SubmitPatchFeedbackInput => {
  if (typeof input !== "object" || input === null) {
    return {
      questionId: "",
      answerId: "",
      excerptFingerprint: "",
      reason: "OTHER",
    };
  }

  const raw = input as Record<string, unknown>;
  const optionalString = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;
  const reason = typeof raw.reason === "string" ? raw.reason : "OTHER";

  return {
    questionId: typeof raw.questionId === "string" ? raw.questionId : "",
    answerId: typeof raw.answerId === "string" ? raw.answerId : "",
    excerptFingerprint: typeof raw.excerptFingerprint === "string" ? raw.excerptFingerprint : "",
    ...(typeof raw.recordFingerprint === "string"
      ? { recordFingerprint: raw.recordFingerprint }
      : {}),
    reason: reason as PatchFeedbackRecord["reason"],
    ...(raw.question === undefined ? {} : { question: optionalString(raw.question) }),
    ...(raw.evidenceUrl === undefined ? {} : { evidenceUrl: optionalString(raw.evidenceUrl) }),
    ...(raw.evidenceQuote === undefined
      ? {}
      : { evidenceQuote: optionalString(raw.evidenceQuote) }),
  };
};

const safeError = (code: SubmitPatchFeedbackFailureCode): SubmitPatchFeedbackResponse => ({
  status: "error",
  code,
  message:
    code === "INVALID_REQUEST"
      ? "反馈内容不完整，请检查后重新提交。"
      : "反馈提交出现异常，请稍后再试。",
});

const createUserEvidenceCandidate = (feedback: PatchFeedbackRecord): EvidenceCandidate | null => {
  if (feedback.evidenceUrl === undefined || feedback.evidenceQuote === undefined) {
    return null;
  }

  const material = [
    "userEvidence",
    feedback.feedbackFingerprint,
    feedback.evidenceUrl,
    feedback.evidenceQuote,
  ].join("\n");
  const [high, low] = fnv1a64(material);
  const retrievalEventFingerprint = `v1:${high
    .toString(16)
    .padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;

  const result = createEvidenceCandidate({
    claimFingerprint: feedback.feedbackFingerprint,
    retrievalEventFingerprint,
    provider: "global_search",
    searchQuery: "user supplied evidence",
    sourceContentId: feedback.evidenceUrl,
    sourceContentType: "user_supplied_source",
    sourceKind: "web_source",
    authorityHint: "unknown",
    sourceLabel: "用户提供的来源",
    title: "用户提供的证据链接",
    sourceUrl: feedback.evidenceUrl,
    contentPreview: feedback.evidenceQuote,
    capturedAt: feedback.submittedAt,
    sourceAccessState: "fetched",
  });

  return result._tag === "success" ? result.candidate : null;
};

const reviewStateFor = (outcome: EvidenceReviewOutcome): PatchFeedbackReviewOutcome => {
  if (outcome === "passed") return "EVIDENCE_GATE_PASSED";
  if (outcome === "insufficient") return "EVIDENCE_GATE_INSUFFICIENT";
  return "EVIDENCE_GATE_REJECTED";
};

export const createSubmitPatchFeedbackHandler =
  (deps: SubmitPatchFeedbackDeps) =>
  async (input: SubmitPatchFeedbackInput): Promise<SubmitPatchFeedbackResponse> => {
    const submittedAt = Date.now();
    const created = createPatchFeedback({
      questionId: input.questionId,
      answerId: input.answerId,
      excerptFingerprint: input.excerptFingerprint,
      ...(input.recordFingerprint === undefined
        ? {}
        : { recordFingerprint: input.recordFingerprint }),
      reason: input.reason,
      ...(input.question === undefined ? {} : { question: input.question }),
      ...(input.evidenceUrl === undefined ? {} : { evidenceUrl: input.evidenceUrl }),
      ...(input.evidenceQuote === undefined ? {} : { evidenceQuote: input.evidenceQuote }),
      submittedAt,
    });

    if (created._tag === "failure") {
      return safeError("INVALID_REQUEST");
    }

    const feedback = created.feedback;
    const candidate = createUserEvidenceCandidate(feedback);
    let reviewState: PatchFeedbackReviewOutcome = "PENDING_REVIEW";

    if (candidate !== null && deps.reviewEvidence !== undefined) {
      try {
        const outcome = await deps.reviewEvidence(feedback.question ?? feedback.reason, [
          candidate,
        ]);
        reviewState = reviewStateFor(outcome);
      } catch {
        reviewState = "PENDING_REVIEW";
      }
    }

    try {
      const store = await deps.createFeedbackStore();
      const stored = await Effect.runPromise(store.save(feedback, reviewState, submittedAt));

      return {
        status: "ok",
        feedbackFingerprint: stored.feedbackFingerprint,
        submittedAt: stored.submittedAt,
        reviewState: stored.reviewState as PatchFeedbackReviewOutcome,
      };
    } catch {
      return safeError("FEEDBACK_STORE_ERROR");
    }
  };

const parseInputForServer = (input: unknown): SubmitPatchFeedbackInput => parseInput(input);

export const submitPatchFeedback = createServerFn({ method: "POST" })
  .validator(parseInputForServer)
  .handler(async ({ data }): Promise<SubmitPatchFeedbackResponse> => {
    const openAiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    return createSubmitPatchFeedbackHandler({
      createFeedbackStore: () =>
        Effect.runPromise(makeSqlitePatchFeedbackStore(".local/patch-feedback.db")),
      ...(typeof openAiKey === "string" && openAiKey.trim() !== ""
        ? {
            reviewEvidence: async (claimText, candidates) => {
              const { runEvidenceGate } = await import("../lib/evidence-gate");
              const { makeOpenAiChatCompletions, makeFetchOpenAiTransport } =
                await import("../lib/openai-adapter");

              const gate = runEvidenceGate(
                {
                  llm: makeOpenAiChatCompletions({
                    apiKey: openAiKey,
                    model,
                    baseUrl: "https://api.openai.com/v1",
                    transport: makeFetchOpenAiTransport({
                      fetch,
                      timeoutMs: "10 seconds",
                    }),
                    timeoutMs: "10 seconds",
                  }),
                  model,
                },
                claimText,
                candidates,
              );

              const gateExit = await Effect.runPromiseExit(gate);
              if (gateExit._tag === "Failure") {
                throw new Error("evidence gate failed");
              }

              const result = gateExit.value;
              if (result._tag === "gate_passed") return "passed" as const;
              if (result._tag === "gate_unknown") return "insufficient" as const;
              return "no_patch" as const;
            },
          }
        : {}),
    })(data);
  });
