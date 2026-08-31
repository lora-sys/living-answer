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
} from "../../server/analyze-patch-response";

import { failureMessage } from "../../lib/failure-messages";
import { UpdateAdvisoryCard } from "./UpdateAdvisoryCard";

// ── Types ────────────────────────────────────────────────────────────────────────

/**
 * Props for the AnalysisResultPanel component.
 *
 * State and server binding belong to the route; this component is
 * presentation-only.
 */
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

// ── Helpers ─────────────────────────────────────────────────────────────────────

// ── Loading view ────────────────────────────────────────────────────────────────

function LoadingView() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-rule bg-paper-2 px-5 py-4">
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-accent"
      />
      <p className="text-sm text-ink-subtle">正在分析前提变化…</p>
    </div>
  );
}

// ── Error view ──────────────────────────────────────────────────────────────────

interface ErrorViewProps {
  readonly message: string;
  readonly isFormError: boolean;
}

function ErrorView({ message, isFormError }: ErrorViewProps) {
  return (
    <div
      className={`rounded-2xl border px-5 py-4 ${
        isFormError ? "border-danger/30 bg-danger-soft" : "border-rule bg-paper-2"
      }`}
    >
      <p className={`text-sm font-medium ${isFormError ? "text-danger" : "text-ink-subtle"}`}>
        {message}
      </p>
    </div>
  );
}

// ── Verdict views ───────────────────────────────────────────────────────────────

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
    <div className="rounded-2xl border border-rule bg-paper-2 px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-subtle">
          前提未变化
        </span>
      </div>
      <p className="mt-4 text-base leading-7 text-ink-subtle">{decision.reason}</p>
      <p className="mt-3 text-xs text-muted">未检测到需要更新回答的关键前提。</p>
    </div>
  );
}

interface UnknownViewProps {
  readonly decision: AnalyzePatchUnknownResponse;
}

function UnknownView({ decision }: UnknownViewProps) {
  return (
    <div className="rounded-2xl border border-rule bg-paper-2 px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-subtle">
          无法确定
        </span>
      </div>
      <p className="mt-4 text-base leading-7 text-ink-subtle">{decision.reason}</p>
      <p className="mt-3 text-xs text-muted">
        当前可获取的信息不足以形成明确结论。建议查阅更多来源或稍后再试。
      </p>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────

export function AnalysisResultPanel({
  result,
  isLoading,
  analysisError,
  onRetry,
}: AnalysisResultPanelProps) {
  // --- Loading ------------------------------------------------------------------
  if (isLoading) {
    return <LoadingView />;
  }

  // --- Client-side validation error --------------------------------------------
  if (analysisError) {
    return <ErrorView message={analysisError} isFormError={true} />;
  }

  // --- No result to display ---------------------------------------------------
  if (result === null) {
    return null;
  }

  // --- Server error -----------------------------------------------------------
  if (result.status === "error") {
    const code = result.code as AnalyzePatchServerFailureCode;
    return <ErrorView message={failureMessage(code)} isFormError={false} />;
  }

  // --- Result decision --------------------------------------------------------
  const resultDecision = result.decision;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">分析完成</p>

      {resultDecision.verdict === "UPDATE" && <UpdateView decision={resultDecision} />}

      {resultDecision.verdict === "NO_PATCH" && <NoPatchView decision={resultDecision} />}

      {resultDecision.verdict === "UNKNOWN" && <UnknownView decision={resultDecision} />}

      <div>
        <button
          type="button"
          onClick={onRetry}
          className="text-sm text-accent-text underline underline-offset-2 transition-colors hover:text-accent-active"
        >
          重新分析
        </button>
      </div>
    </div>
  );
}
