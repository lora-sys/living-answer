/**
 * RealResultRead — read view for a live extracted Zhihu answer excerpt plus
 * its AI analysis result.
 *
 * Assumes the caller has already verified that `result.status` is `"ok"`.
 * For `"error"` responses, the route should continue rendering
 * `AnalysisResultPanel`.
 *
 * Product rules:
 *   • UPDATE is advisory — never implies the author was wrong.
 *   • Never display model names, confidence scores, or internal workflow state.
 *   • UPDATE never renders proposedBody.
 *   • External evidence links are presented as untrusted references.
 *
 * @module RealResultRead
 */

import type { AnswerExcerpt } from "../../lib/answer-excerpt";
import type {
  AnalyzePatchUpdateResponse,
  AnalyzePatchNoPatchResponse,
  AnalyzePatchUnknownResponse,
  AnalyzePatchResponse,
  PatchLifecycleHistorySummary,
  PatchLifecycleSummary,
} from "../../server/analyze-patch-response";
import { failureMessage, formatTimestamp } from "../../lib/failure-messages";
import type { PatchLifecycleStatus } from "../../lib/patch-lifecycle";
import type { AnalyzePatchServerFailureCode } from "../../lib/failure-messages";
import { UpdateAdvisoryCard } from "./UpdateAdvisoryCard";

// ── Types ────────────────────────────────────────────────────────────────────────

export interface RealResultReadProps {
  /** The resolved answer excerpt (always available from the route). */
  readonly excerpt: AnswerExcerpt;
  /** Successful analysis response from analyzePatch (status: "ok"). */
  readonly result: AnalyzePatchResponse;
  /** Optional maintenance context the user supplied before analysis. */
  readonly contextText?: string;
  /** Called after the user asks to dispute the currently visible patch. */
  readonly onDispute?: () => void;
  /** Called after the user asks to rerun the current analysis. */
  readonly onRecheck?: () => void;
  /** True while the dispute request is in flight. */
  readonly isDisputePending?: boolean;
  /** Stable failure code for a rejected dispute request. */
  readonly disputeError?: AnalyzePatchServerFailureCode | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Split excerpt text into paragraphs on double-newline boundaries.
 * Falls back to the single trimmed string if no paragraph break is found.
 */
function splitParagraphs(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  const parts = trimmed.split(/\n\n+/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

// ── Excerpt view ────────────────────────────────────────────────────────────────

function ExcerptView({ excerpt }: { readonly excerpt: AnswerExcerpt }) {
  const paragraphs = splitParagraphs(excerpt.excerpt);

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-5 sm:px-6">
      <div className="space-y-4">
        {paragraphs.map((para, i) => (
          <p key={i} className="text-base leading-7 text-stone-800 sm:text-lg sm:leading-8">
            {para}
          </p>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-500">
        <span>
          知乎问题 <span className="font-medium text-stone-700">#{excerpt.questionId}</span>
        </span>
        <span>
          回答 <span className="font-medium text-stone-700">#{excerpt.answerId}</span>
        </span>
        <span>摘录时间 {new Date(excerpt.capturedAt).toLocaleDateString("zh-CN")}</span>
      </div>
      <p className="mt-1 text-sm text-stone-500">
        来源编辑时间 {new Date(excerpt.sourceEditTime).toLocaleDateString("zh-CN")}
      </p>
    </div>
  );
}

// ── Context view ────────────────────────────────────────────────────────────────

function ContextView({ text }: { readonly text: string }) {
  if (text.trim() === "") return null;
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4">
      <p className="text-xs font-medium text-stone-500">维护备注</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-700">{text}</p>
    </div>
  );
}

// ── Update advisory view ────────────────────────────────────────────────────────

interface AdvisoryViewProps {
  readonly decision: AnalyzePatchUpdateResponse;
  readonly excerptText?: string;
}

function AdvisoryView({ decision, excerptText }: AdvisoryViewProps) {
  return <UpdateAdvisoryCard decision={decision} excerptText={excerptText} />;
}

// ── No patch view ───────────────────────────────────────────────────────────────

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

// ── Unknown view ────────────────────────────────────────────────────────────────

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

// ── Disputed patch view ─────────────────────────────────────────────────────────

function DisputedPatchView() {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">
          已暂停
        </span>
        <span className="text-xs text-stone-500">变更提示有争议</span>
      </div>
      <p className="mt-4 text-base leading-7 text-stone-700">
        这条补充提示已被标记为有争议，当前不再作为有效提示显示。
      </p>
      <p className="mt-3 text-xs text-stone-500">
        重新检查后会形成新的变更状态，历史记录不会被删除。
      </p>
    </div>
  );
}

// ── Lifecycle and history view ─────────────────────────────────────────────────

const lifecycleStatusLabel = (status: PatchLifecycleStatus): string => {
  if (status === "DISPUTED") return "已暂停";
  if (status === "SUPERSEDED") return "已被新检查替代";
  return "当前可见";
};

interface LifecycleViewProps {
  readonly lifecycle?: PatchLifecycleSummary;
  readonly history?: readonly PatchLifecycleHistorySummary[];
  readonly onDispute?: () => void;
  readonly onRecheck?: () => void;
  readonly isDisputePending?: boolean;
  readonly disputeError?: AnalyzePatchServerFailureCode | null;
}

function LifecycleView({
  lifecycle,
  history,
  onDispute,
  onRecheck,
  isDisputePending,
  disputeError,
}: LifecycleViewProps) {
  if (lifecycle === undefined && (history === undefined || history.length === 0)) {
    return null;
  }

  const canDispute = lifecycle?.status === "VISIBLE" && onDispute !== undefined;

  return (
    <div
      aria-busy={isDisputePending}
      className="rounded-2xl border border-stone-200 bg-white px-5 py-4 sm:px-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-stone-700">变更状态</p>
          {lifecycle !== undefined && (
            <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">
              {lifecycleStatusLabel(lifecycle.status)}
            </span>
          )}
        </div>

        {(canDispute || onRecheck !== undefined) && (
          <div className="flex flex-wrap items-center gap-2">
            {canDispute && (
              <button
                type="button"
                onClick={onDispute}
                disabled={isDisputePending}
                className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-3.5 py-1.5 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:text-stone-400"
              >
                标记有争议
              </button>
            )}
            {onRecheck !== undefined && (
              <button
                type="button"
                onClick={onRecheck}
                disabled={isDisputePending}
                className="inline-flex items-center rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500 disabled:cursor-not-allowed disabled:text-stone-400"
              >
                重新检查
              </button>
            )}
          </div>
        )}
      </div>

      {disputeError !== undefined && disputeError !== null && (
        <p aria-live="polite" className="mt-3 text-sm font-medium text-stone-700">
          {failureMessage(disputeError)}
        </p>
      )}

      {history !== undefined && history.length > 0 && (
        <div className="mt-4 border-t border-stone-200 pt-3">
          <p className="text-xs font-medium text-stone-500">变更历史</p>
          <ul className="mt-2 space-y-2" role="list">
            {history.slice(0, 5).map((record) => (
              <li key={record.recordFingerprint} className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-xs font-medium text-stone-600">
                    {lifecycleStatusLabel(record.status)}
                  </span>
                  <span className="text-xs text-stone-400">{formatTimestamp(record.eventAt)}</span>
                </div>
                <p className="mt-0.5 break-words text-xs leading-5 text-stone-500">
                  {record.reason}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────

export function RealResultRead({
  excerpt,
  result,
  contextText,
  onDispute,
  onRecheck,
  isDisputePending,
  disputeError,
}: RealResultReadProps) {
  // Defensive: if the caller passes an error response, render nothing.
  // The route is responsible for handling error results with
  // AnalysisResultPanel.
  if (result.status === "error") {
    return null;
  }

  const decision = result.decision;
  const isDisputed = result.lifecycle?.status === "DISPUTED";

  return (
    <div className="space-y-4">
      {/* Maintenance context (if supplied) */}
      {contextText && <ContextView text={contextText} />}

      {/* The extracted excerpt */}
      <ExcerptView excerpt={excerpt} />

      {/* Analysis result */}
      {decision.verdict === "UPDATE" && !isDisputed && (
        <AdvisoryView decision={decision} excerptText={excerpt.excerpt} />
      )}

      {decision.verdict === "UPDATE" && isDisputed && <DisputedPatchView />}

      {decision.verdict === "NO_PATCH" && <NoPatchView decision={decision} />}

      {decision.verdict === "UNKNOWN" && <UnknownView decision={decision} />}

      <LifecycleView
        lifecycle={result.lifecycle}
        history={result.history}
        onDispute={onDispute}
        onRecheck={onRecheck}
        isDisputePending={isDisputePending}
        disputeError={disputeError}
      />
    </div>
  );
}
