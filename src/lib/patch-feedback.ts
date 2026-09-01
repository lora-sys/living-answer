import { fnv1a64 } from "./answer-excerpt";

export type PatchFeedbackReason =
  | "QUESTION"
  | "EVIDENCE_UNSUPPORTED"
  | "WRONG_CONDITION"
  | "NOT_IMPORTANT"
  | "SOURCE_UPDATED"
  | "OTHER";

export type PatchFeedbackReviewState =
  | "PENDING_REVIEW"
  | "EVIDENCE_GATE_PASSED"
  | "EVIDENCE_GATE_INSUFFICIENT"
  | "EVIDENCE_GATE_REJECTED"
  | "REVIEW_ERROR";

export interface PatchFeedbackInput {
  readonly questionId: string;
  readonly answerId: string;
  readonly excerptFingerprint: string;
  readonly recordFingerprint?: string;
  readonly reason: PatchFeedbackReason;
  readonly question?: string;
  readonly evidenceUrl?: string;
  readonly evidenceQuote?: string;
  readonly submittedAt: number;
}

export interface PatchFeedbackRecord {
  readonly questionId: string;
  readonly answerId: string;
  readonly excerptFingerprint: string;
  readonly recordFingerprint?: string;
  readonly reason: PatchFeedbackReason;
  readonly question?: string;
  readonly evidenceUrl?: string;
  readonly evidenceQuote?: string;
  readonly submittedAt: number;
  readonly feedbackFingerprint: string;
}

export type PatchFeedbackFailureReason =
  | "INVALID_ANSWER_IDENTITY"
  | "INVALID_EXCERPT_FINGERPRINT"
  | "INVALID_RECORD_FINGERPRINT"
  | "INVALID_REASON"
  | "INVALID_QUESTION"
  | "INVALID_EVIDENCE_URL"
  | "INVALID_EVIDENCE_QUOTE"
  | "INVALID_TIMESTAMP";

export type PatchFeedbackResult =
  | { readonly _tag: "success"; readonly feedback: PatchFeedbackRecord }
  | { readonly _tag: "failure"; readonly reason: PatchFeedbackFailureReason };

const FP_PATTERN = /^v1:[0-9a-f]{16}$/;

const normalizeText = (raw: string): string =>
  raw.normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

const isValidTimestamp = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

const optionalText = (value: string | undefined, maxLength: number): string | undefined | null => {
  if (value === undefined) return undefined;
  const normalized = normalizeText(value);
  if (normalized === "" || normalized.length > maxLength) return null;
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized.charCodeAt(index) < 0x20) return null;
  }
  return normalized;
};

const normalizeEvidenceUrl = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!/^https?:\/\/[^/]/i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
};

const buildFeedbackFingerprint = (record: PatchFeedbackRecord): string => {
  const material = [
    "patchFeedback",
    "questionId:" + record.questionId,
    "answerId:" + record.answerId,
    "excerptFingerprint:" + record.excerptFingerprint,
    "recordFingerprint:" + (record.recordFingerprint ?? ""),
    "reason:" + record.reason,
    "question:" + (record.question ?? ""),
    "evidenceUrl:" + (record.evidenceUrl ?? ""),
    "evidenceQuote:" + (record.evidenceQuote ?? ""),
  ].join("\n");
  const [high, low] = fnv1a64(material);
  return `v1:${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
};

export const createPatchFeedback = (input: PatchFeedbackInput): PatchFeedbackResult => {
  const questionId = normalizeText(input.questionId);
  const answerId = normalizeText(input.answerId);
  if (questionId === "" || answerId === "" || questionId.length > 64 || answerId.length > 64) {
    return { _tag: "failure", reason: "INVALID_ANSWER_IDENTITY" };
  }
  if (!FP_PATTERN.test(input.excerptFingerprint)) {
    return { _tag: "failure", reason: "INVALID_EXCERPT_FINGERPRINT" };
  }
  if (input.recordFingerprint !== undefined && !FP_PATTERN.test(input.recordFingerprint)) {
    return { _tag: "failure", reason: "INVALID_RECORD_FINGERPRINT" };
  }
  if (!isValidTimestamp(input.submittedAt)) {
    return { _tag: "failure", reason: "INVALID_TIMESTAMP" };
  }

  const allowedReasons: readonly PatchFeedbackReason[] = [
    "QUESTION",
    "EVIDENCE_UNSUPPORTED",
    "WRONG_CONDITION",
    "NOT_IMPORTANT",
    "SOURCE_UPDATED",
    "OTHER",
  ];
  const reason = allowedReasons.find((item) => item === input.reason);
  if (reason === undefined) {
    return { _tag: "failure", reason: "INVALID_REASON" };
  }

  const question = optionalText(input.question, 800);
  if (question === null) {
    return { _tag: "failure", reason: "INVALID_QUESTION" };
  }

  let evidenceUrl: string | undefined;
  if (input.evidenceUrl !== undefined) {
    const normalizedEvidenceUrl = normalizeEvidenceUrl(input.evidenceUrl);
    if (normalizedEvidenceUrl === null) {
      return { _tag: "failure", reason: "INVALID_EVIDENCE_URL" };
    }
    evidenceUrl = normalizedEvidenceUrl;
  }

  const evidenceQuote = optionalText(input.evidenceQuote, 1000);
  if (evidenceQuote === null) {
    return { _tag: "failure", reason: "INVALID_EVIDENCE_QUOTE" };
  }

  const feedback: PatchFeedbackRecord = Object.freeze({
    questionId,
    answerId,
    excerptFingerprint: input.excerptFingerprint,
    ...(input.recordFingerprint === undefined
      ? {}
      : { recordFingerprint: input.recordFingerprint }),
    reason,
    ...(question === undefined ? {} : { question }),
    ...(evidenceUrl === undefined ? {} : { evidenceUrl }),
    ...(evidenceQuote === undefined ? {} : { evidenceQuote }),
    submittedAt: input.submittedAt,
    feedbackFingerprint: "",
  });

  return {
    _tag: "success",
    feedback: Object.freeze({
      ...feedback,
      feedbackFingerprint: buildFeedbackFingerprint(feedback),
    }),
  };
};

export const FEEDBACK_REASON_LABELS: Readonly<Record<PatchFeedbackReason, string>> = Object.freeze({
  QUESTION: "提问",
  EVIDENCE_UNSUPPORTED: "证据不支持这条提示",
  WRONG_CONDITION: "适用条件写错了",
  NOT_IMPORTANT: "这个变化不重要",
  SOURCE_UPDATED: "原文或来源已经更新",
  OTHER: "其他问题",
});
