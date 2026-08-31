import { fnv1a64 } from "./answer-excerpt";

export type PatchLifecycleStatus = "VISIBLE" | "DISPUTED" | "SUPERSEDED";

export interface PatchEvidenceSummary {
  readonly fingerprint: string;
  readonly sourceLabel: string;
  readonly sourceUrl?: string;
  readonly quote: string;
}

export interface PatchLifecycleInput {
  readonly questionId: string;
  readonly answerId: string;
  readonly excerptFingerprint: string;
  readonly reason: string;
  readonly selectedEvidenceFingerprints: readonly string[];
  readonly evidence: readonly PatchEvidenceSummary[];
  readonly affectedWording?: string;
  readonly currentState?: string;
  readonly impactOnAnswer?: string;
  readonly capturedAt: number;
  readonly eventAt: number;
}

export interface PatchLifecycleRecord {
  readonly questionId: string;
  readonly answerId: string;
  readonly excerptFingerprint: string;
  readonly reason: string;
  readonly selectedEvidenceFingerprints: readonly string[];
  readonly evidence: readonly PatchEvidenceSummary[];
  readonly affectedWording?: string;
  readonly currentState?: string;
  readonly impactOnAnswer?: string;
  readonly capturedAt: number;
  readonly eventAt: number;
  readonly recordFingerprint: string;
}

export interface PatchLifecycleEvent {
  readonly recordFingerprint: string;
  readonly status: PatchLifecycleStatus;
  readonly eventAt: number;
  readonly eventFingerprint: string;
}

export type PatchLifecycleFailureReason =
  | "INVALID_ANSWER_IDENTITY"
  | "INVALID_EXCERPT_FINGERPRINT"
  | "INVALID_REASON"
  | "INVALID_EVIDENCE"
  | "INVALID_ANALYSIS_FIELD"
  | "INVALID_TIMESTAMP";

export interface PatchLifecycleSuccess {
  readonly _tag: "success";
  readonly record: PatchLifecycleRecord;
}

export interface PatchLifecycleFailure {
  readonly _tag: "failure";
  readonly reason: PatchLifecycleFailureReason;
}

export type PatchLifecycleResult = PatchLifecycleSuccess | PatchLifecycleFailure;

const FP_PATTERN = /^v1:[0-9a-f]{16}$/;

const normalizeText = (raw: string): string => {
  return raw.normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
};

const isValidTimestamp = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

const isValidOptionalText = (value: string | undefined, maxLength: number): boolean => {
  if (value === undefined) return true;
  const normalized = normalizeText(value);
  if (normalized === "" || normalized.length > maxLength) return false;
  return normalized.search(/[\u0000-\u001f]/) === -1;
};

const buildRecordFingerprint = (record: PatchLifecycleRecord): string => {
  const material = [
    "questionId:" + record.questionId,
    "answerId:" + record.answerId,
    "excerptFingerprint:" + record.excerptFingerprint,
    "reason:" + record.reason,
    ...[...record.selectedEvidenceFingerprints].sort().map((fp) => `selected:${fp}`),
    ...[...record.evidence]
      .map((item) => item.fingerprint)
      .sort()
      .map((fp) => `evidence:${fp}`),
    "affectedWording:" + (record.affectedWording ?? ""),
    "currentState:" + (record.currentState ?? ""),
    "impactOnAnswer:" + (record.impactOnAnswer ?? ""),
    "capturedAt:" + String(record.capturedAt),
    "eventAt:" + String(record.eventAt),
  ].join("\n");
  const [high, low] = fnv1a64(material);
  return `v1:${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
};

export const createPatchLifecycleRecord = (input: PatchLifecycleInput): PatchLifecycleResult => {
  const questionId = normalizeText(input.questionId);
  const answerId = normalizeText(input.answerId);
  const reason = normalizeText(input.reason);

  if (questionId === "" || answerId === "" || questionId.length > 64 || answerId.length > 64) {
    return { _tag: "failure", reason: "INVALID_ANSWER_IDENTITY" };
  }
  if (!FP_PATTERN.test(input.excerptFingerprint)) {
    return { _tag: "failure", reason: "INVALID_EXCERPT_FINGERPRINT" };
  }
  if (reason === "" || reason.length > 500) {
    return { _tag: "failure", reason: "INVALID_REASON" };
  }
  if (!isValidTimestamp(input.capturedAt) || !isValidTimestamp(input.eventAt)) {
    return { _tag: "failure", reason: "INVALID_TIMESTAMP" };
  }
  if (
    !isValidOptionalText(input.affectedWording, 200) ||
    !isValidOptionalText(input.currentState, 200) ||
    !isValidOptionalText(input.impactOnAnswer, 200)
  ) {
    return { _tag: "failure", reason: "INVALID_ANALYSIS_FIELD" };
  }

  const selected = [...new Set(input.selectedEvidenceFingerprints)];
  if (selected.some((fp) => !FP_PATTERN.test(fp))) {
    return { _tag: "failure", reason: "INVALID_EVIDENCE" };
  }

  const evidence: PatchEvidenceSummary[] = [];
  for (const raw of input.evidence) {
    const sourceLabel = normalizeText(raw.sourceLabel);
    const quote = normalizeText(raw.quote);
    const sourceUrl = raw.sourceUrl === undefined ? undefined : raw.sourceUrl.trim();
    if (!FP_PATTERN.test(raw.fingerprint)) {
      return { _tag: "failure", reason: "INVALID_EVIDENCE" };
    }
    if (sourceLabel === "" || sourceLabel.length > 120) {
      return { _tag: "failure", reason: "INVALID_EVIDENCE" };
    }
    if (quote === "" || quote.length > 500) {
      return { _tag: "failure", reason: "INVALID_EVIDENCE" };
    }
    if (sourceUrl !== undefined && !/^https?:\/\/[^/]/i.test(sourceUrl)) {
      return { _tag: "failure", reason: "INVALID_EVIDENCE" };
    }
    evidence.push(
      Object.freeze({
        fingerprint: raw.fingerprint,
        sourceLabel,
        ...(sourceUrl !== undefined && sourceUrl !== "" ? { sourceUrl } : {}),
        quote,
      }),
    );
  }

  const record: PatchLifecycleRecord = {
    questionId,
    answerId,
    excerptFingerprint: input.excerptFingerprint,
    reason,
    selectedEvidenceFingerprints: Object.freeze(selected),
    evidence: Object.freeze(evidence),
    ...(input.affectedWording !== undefined
      ? { affectedWording: normalizeText(input.affectedWording) }
      : {}),
    ...(input.currentState !== undefined
      ? { currentState: normalizeText(input.currentState) }
      : {}),
    ...(input.impactOnAnswer !== undefined
      ? { impactOnAnswer: normalizeText(input.impactOnAnswer) }
      : {}),
    capturedAt: input.capturedAt,
    eventAt: input.eventAt,
    recordFingerprint: "",
  };

  return {
    _tag: "success",
    record: Object.freeze({
      ...record,
      recordFingerprint: buildRecordFingerprint(record),
    }),
  };
};

export const buildLifecycleEventFingerprint = (
  recordFingerprint: string,
  status: PatchLifecycleStatus,
  eventAt: number,
): string => {
  const [high, low] = fnv1a64(
    ["patchLifecycleEvent", recordFingerprint, status, String(eventAt)].join("\n"),
  );
  return `v1:${high.toString(16).padStart(8, "0")}${low.toString(16).padStart(8, "0")}`;
};
