/**
 * JSON-safe response types for the {@link readAnswer} server function.
 *
 * The function composes data from existing stores only; no new persistence
 * layer is introduced.
 */

import type { AnswerExcerpt } from "../lib/answer-excerpt";
import type { PatchLifecycleStatus } from "../lib/patch-lifecycle";

// ── Failure codes ────────────────────────────────────────────────────────────────

export type ReadAnswerServerFailureCode =
  | "INVALID_REQUEST"
  | "STORE_ERROR"
  | "LIFECYCLE_STORE_ERROR";

export const failureMessage = (code: ReadAnswerServerFailureCode): string => {
  switch (code) {
    case "INVALID_REQUEST":
      return "请求参数无效。";
    case "STORE_ERROR":
      return "检索回答记录时出现异常，请稍后再试。";
    case "LIFECYCLE_STORE_ERROR":
      return "检索变更记录时出现异常，请稍后再试。";
    default:
      return "页面加载出现异常，请稍后再试。";
  }
};

// ── Advisory decision (server-side composed from persisted lifecycle) ─────────────

/**
 * Serializable advisory decision derived from a persisted lifecycle record.
 *
 * When the read page is visited from a live analysis, the full
 * `AnalyzePatchDecisionResponse` (which carries server-internal fields like
 * `matchedEvidence` with quotes) is embedded directly in the
 * `ok_with_lifecycle` state instead.
 */
export interface ReadAnswerAdvisoryDecision {
  readonly verdict: "UPDATE" | "NO_PATCH" | "UNKNOWN";
  readonly reason: string;
  readonly patchBodyStatus: "no-body-available";
  readonly selectedEvidenceFingerprints: readonly string[];
  readonly evidenceSummary: readonly ReadAnswerEvidenceSummary[];
  readonly affectedWording?: string;
  readonly currentState?: string;
  readonly impactOnAnswer?: string;
}

export interface ReadAnswerEvidenceSummary {
  readonly fingerprint: string;
  readonly sourceLabel: string;
  readonly sourceUrl?: string;
}

// ── Lifecycle summary (subset of PatchLifecycleRecord) ──────────────────────────

export interface ReadAnswerLifecycleSummary {
  readonly recordFingerprint: string;
  readonly status: PatchLifecycleStatus;
  readonly capturedAt: number;
  readonly eventAt: number;
  readonly reason: string;
  readonly selectedEvidenceFingerprints: readonly string[];
  readonly evidenceSummary: readonly ReadAnswerEvidenceSummary[];
  readonly affectedWording?: string;
  readonly currentState?: string;
  readonly impactOnAnswer?: string;
}

export interface ReadAnswerHistoryEntry {
  readonly recordFingerprint: string;
  readonly status: PatchLifecycleStatus;
  readonly capturedAt: number;
  readonly eventAt: number;
  readonly reason: string;
}

// ── Response union ──────────────────────────────────────────────────────────────

export type ReadAnswerResponse =
  | {
      readonly status: "ok";
      readonly excerpt: AnswerExcerpt;
      readonly advisory: ReadAnswerAdvisoryDecision;
      readonly lifecycle: ReadAnswerLifecycleSummary;
      /**
       * Past lifecycle events for this answer, ordered newest-first.
       */
      readonly history?: readonly ReadAnswerHistoryEntry[];
    }
  | {
      readonly status: "excerpt_only";
      readonly excerpt: AnswerExcerpt;
      readonly message: string;
    }
  | {
      readonly status: "no_excerpt";
      readonly message: string;
    }
  | {
      readonly status: "error";
      readonly code: ReadAnswerServerFailureCode;
      readonly message: string;
    };

// ── Response constructors ───────────────────────────────────────────────────────

export const okResponse = (
  excerpt: AnswerExcerpt,
  opts: {
    readonly advisory: ReadAnswerAdvisoryDecision;
    readonly lifecycle: ReadAnswerLifecycleSummary;
    readonly history?: readonly ReadAnswerHistoryEntry[];
  },
): ReadAnswerResponse => ({
  status: "ok",
  excerpt,
  advisory: opts.advisory,
  lifecycle: opts.lifecycle,
  ...(opts.history !== undefined && opts.history.length > 0 ? { history: opts.history } : {}),
});

export const excerptOnlyResponse = (excerpt: AnswerExcerpt): ReadAnswerResponse => ({
  status: "excerpt_only",
  excerpt,
  message: "该回答已有摘录，但尚未完成前提分析。您可以先阅读摘录，或启动分析流程。",
});

export const noExcerptResponse = (): ReadAnswerResponse => ({
  status: "no_excerpt",
  message: "尚未检索到该回答的摘录。请先通过首页搜索或粘贴链接获取摘录。",
});

export const errorResponse = (code: ReadAnswerServerFailureCode): ReadAnswerResponse => ({
  status: "error",
  code,
  message: failureMessage(code),
});
