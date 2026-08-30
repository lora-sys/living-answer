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

/**
 * Truncate a string to a maximum number of characters, appending an ellipsis.
 */
const truncate = (text: string, max: number): string =>
  text.length > max ? text.slice(0, max) + "…" : text;

// ── Loading view ────────────────────────────────────────────────────────────────

function LoadingView() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4">
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#d97757]"
      />
      <p className="text-sm text-stone-600">正在分析前提变化…</p>
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
        isFormError ? "border-red-200 bg-red-50" : "border-stone-200 bg-stone-50"
      }`}
    >
      <p className={`text-sm font-medium ${isFormError ? "text-red-700" : "text-stone-700"}`}>
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
  return (
    <div className="rounded-2xl border border-[#d97757]/30 bg-[#fdf6f3] px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
          信息已更新
        </span>
        <span className="text-xs text-stone-500">前提变化提示</span>
      </div>

      <p className="mt-4 text-base leading-7 text-stone-800">{decision.reason}</p>

      {decision.evidenceSummary.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-stone-500">参考来源</p>
          <ul className="space-y-1.5">
            {decision.evidenceSummary.map((ev) => (
              <li key={ev.fingerprint}>
                <a
                  href={ev.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#d97757] underline underline-offset-2 transition-colors hover:text-[#c4684a]"
                >
                  {ev.sourceLabel}
                </a>
                <span className="ml-2 text-xs text-stone-400">{truncate(ev.sourceUrl, 48)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-stone-500">
        前提说明已经发生变化，建议结合最新信息综合判断。 AI
        生成的上下文摘要作为辅助参考，内容由外部来源提供，请核对原始引用。
      </p>
    </div>
  );
}

interface NoPatchViewProps {
  readonly decision: AnalyzePatchNoPatchResponse;
}

function NoPatchView({ decision }: NoPatchViewProps) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">
          前提未变化
        </span>
      </div>
      <p className="mt-4 text-base leading-7 text-stone-700">{decision.reason}</p>
      <p className="mt-3 text-xs text-stone-500">未检测到需要更新回答的关键前提。</p>
    </div>
  );
}

interface UnknownViewProps {
  readonly decision: AnalyzePatchUnknownResponse;
}

function UnknownView({ decision }: UnknownViewProps) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">
          无法确定
        </span>
      </div>
      <p className="mt-4 text-base leading-7 text-stone-700">{decision.reason}</p>
      <p className="mt-3 text-xs text-stone-500">
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
      <p className="text-sm text-stone-500">分析完成</p>

      {resultDecision.verdict === "UPDATE" && <UpdateView decision={resultDecision} />}

      {resultDecision.verdict === "NO_PATCH" && <NoPatchView decision={resultDecision} />}

      {resultDecision.verdict === "UNKNOWN" && <UnknownView decision={resultDecision} />}

      <div>
        <button
          type="button"
          onClick={onRetry}
          className="text-sm text-stone-500 underline underline-offset-2 transition-colors hover:text-stone-800"
        >
          重新分析
        </button>
      </div>
    </div>
  );
}
