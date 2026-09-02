/**
 * AnalysisResultPanel — pure presentation component for the patch-analysis result.
 *
 * Renders exactly one outcome:
 *   • Loading state with a calm progress indicator.
 *   • UPDATE advisory card (amber) with reason, evidence links, and a note that
 *     no replacement body is generated.
 *   • NO_PATCH neutral card (stone) stating no important premise change was found.
 *   • UNKNOWN neutral card (stone) explaining that evidence is insufficient.
 *   • Error card displaying the matching Chinese message from `failureMessage`.
 *
 * Product rules:
 *   • Never display model names, confidence scores, tokens, logs, or internal
 *     workflow state.
 *   • UPDATE language never implies the original author was wrong.
 *   • UPDATE must never render proposedBody or replacement answer text.
 *   • NO_PATCH and UNKNOWN use neutral stone styling; amber is reserved for UPDATE.
 *   • Provider payloads are treated as untrusted presentation data.
 *
 * @module AnalysisResultPanel
 */

import type {
  AnalyzePatchUpdateResponse,
  AnalyzePatchNoPatchResponse,
  AnalyzePatchUnknownResponse,
  AnalyzePatchResponse,
  AnalyzePatchServerFailureCode,
  AnalyzePatchCorrectionResponse,
  AnalyzePatchConditionResponse,
  AnalyzePatchBetterWayResponse,
} from "../../server/analyze-patch-response";

import { failureMessage } from "../../lib/failure-messages";
import { UpdateAdvisoryCard } from "./UpdateAdvisoryCard";

// Props

export interface AnalysisResultPanelProps {
  /** Server response from analyzePatch, or null while no result is ready. */
  readonly result: AnalyzePatchResponse | null;
  /** Whether the analysis request is in flight. */
  readonly isLoading: boolean;
  /** Client-side validation error (e.g. blank URL on retry). */
  readonly analysisError: string | null;
  /** Callback invoked when the user requests a fresh analysis. */
  readonly onRetry: () => void;
}

// Loading

function LoadingView() {
  return (
    <div className="flex min-h-14 items-center gap-3 border-2 border-rule bg-paper-3 px-5 py-4 shadow-[var(--shadow-card)]">
      <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
      <p className="text-sm text-ink-subtle">正在分析前提变化…</p>
    </div>
  );
}

// Error

interface ErrorViewProps {
  readonly message: string;
  readonly isFormError: boolean;
  readonly onRetry?: () => void;
}

function ErrorView({ message, isFormError, onRetry }: ErrorViewProps) {
  return (
    <div
      className={`border-2 px-5 py-4 ${
        isFormError ? "border-update bg-update-soft" : "border-rule bg-paper-3"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-sm font-medium ${isFormError ? "text-update" : "text-ink-subtle"}`}>
          {message}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-9 shrink-0 items-center justify-center border-2 border-accent bg-accent px-4 text-xs font-semibold text-white transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-accent)] hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            重试
          </button>
        )}
      </div>
    </div>
  );
}

// Verdict views

interface UpdateViewProps {
  readonly decision: AnalyzePatchUpdateResponse;
}

function UpdateView({ decision }: UpdateViewProps) {
  return <UpdateAdvisoryCard decision={decision} />;
}

interface NoPatchViewProps {
  readonly decision: AnalyzePatchNoPatchResponse;
}

function NoPatchView({ decision }: NoPatchViewProps) {
  return (
    <div className="border-2 border-rule bg-paper-3 px-5 py-5 sm:px-6 shadow-[var(--shadow-card)]">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        NO_PATCH
      </p>
      <p className="mt-4 max-w-[68ch] text-base leading-7 text-ink">{decision.reason}</p>
      <p className="mt-3 text-xs text-muted">未检测到需要更新回答的关键前提。</p>
    </div>
  );
}

interface UnknownViewProps {
  readonly decision: AnalyzePatchUnknownResponse;
}

function UnknownView({ decision }: UnknownViewProps) {
  return (
    <div className="border-2 border-accent bg-accent-soft px-5 py-5 sm:px-6 shadow-[var(--shadow-card)]">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
        UNKNOWN
      </p>
      <p className="mt-4 max-w-[68ch] text-base leading-7 text-ink-subtle">{decision.reason}</p>
      <p className="mt-3 text-xs text-muted">
        当前可获取的信息不足以形成明确结论。建议查阅更多来源或稍后再试。
      </p>
    </div>
  );
}

type OtherDecision =
  | AnalyzePatchCorrectionResponse
  | AnalyzePatchConditionResponse
  | AnalyzePatchBetterWayResponse;

const OTHER_VERDICT_LABELS = {
  CORRECTION: "更正",
  CONDITION: "条件变化",
  BETTER_WAY: "更好的方式",
} as const;

interface OtherVerdictViewProps {
  readonly decision: OtherDecision;
}

function OtherVerdictView({ decision }: OtherVerdictViewProps) {
  return (
    <div className="border-2 border-rule bg-paper-3 px-5 py-5 sm:px-6 shadow-[var(--shadow-card)]">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        {OTHER_VERDICT_LABELS[decision.verdict]}
      </p>
      <p className="mt-4 max-w-[68ch] text-base leading-7 text-ink-subtle">{decision.reason}</p>
      <p className="mt-3 text-xs text-muted">这是分析结论，尚未生成原文补丁。</p>
    </div>
  );
}

// Main

export function AnalysisResultPanel({
  result,
  isLoading,
  analysisError,
  onRetry,
}: AnalysisResultPanelProps) {
  if (isLoading) {
    return <LoadingView />;
  }

  if (analysisError) {
    return <ErrorView message={analysisError} isFormError={true} onRetry={onRetry} />;
  }

  if (result === null) {
    return null;
  }

  if (result.status === "error") {
    const code = result.code as AnalyzePatchServerFailureCode;
    return <ErrorView message={failureMessage(code)} isFormError={false} onRetry={onRetry} />;
  }

  const resultDecision = result.decision;

  return (
    <div className="space-y-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">DONE</p>

      {resultDecision.verdict === "UPDATE" && <UpdateView decision={resultDecision} />}

      {resultDecision.verdict === "NO_PATCH" && <NoPatchView decision={resultDecision} />}

      {resultDecision.verdict === "UNKNOWN" && <UnknownView decision={resultDecision} />}

      {resultDecision.verdict === "CORRECTION" && <OtherVerdictView decision={resultDecision} />}
      {resultDecision.verdict === "CONDITION" && <OtherVerdictView decision={resultDecision} />}
      {resultDecision.verdict === "BETTER_WAY" && <OtherVerdictView decision={resultDecision} />}

      <div>
        <button
          type="button"
          onClick={onRetry}
          className="text-sm text-accent underline underline-offset-2 transition-colors hover:text-accent-active"
        >
          重新分析
        </button>
      </div>
    </div>
  );
}
