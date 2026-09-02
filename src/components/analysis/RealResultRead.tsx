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
import {
  failureMessage,
  formatDateFromUnixSeconds,
  formatTimestamp,
} from "../../lib/failure-messages";
import type { PatchLifecycleStatus } from "../../lib/patch-lifecycle";
import type { AnalyzePatchServerFailureCode } from "../../lib/failure-messages";
import { UpdateAdvisoryCard } from "./UpdateAdvisoryCard";
import { PatchFeedbackPanel } from "../read/PatchFeedbackPanel";
import type { PatchFeedbackReason } from "../../lib/patch-feedback";
import type { SubmitPatchFeedbackResponse } from "../../server/submit-patch-feedback";
import type { ClarifyFeedbackResponse } from "../../server/clarify-feedback";

// Props

export interface RealResultReadProps {
  /** The resolved answer excerpt (always available from the route). */
  readonly excerpt: AnswerExcerpt;
  /** Successful analysis response from analyzePatch (status: "ok"). */
  readonly result: AnalyzePatchResponse;
  /** Optional maintenance context the user supplied before analysis. */
  readonly contextText?: string;
  /** Called after the user asks to dispute the currently visible patch. */
  readonly onDispute?: () => void;
  /** Called after the user marks the patch as resolved. */
  readonly onResolve?: () => void;
  /** Called after the user withdraws the patch. */
  readonly onWithdraw?: () => void;
  /** Called after the user asks to rerun the current analysis. */
  readonly onRecheck?: () => void;
  /** True while the dispute request is in flight. */
  readonly isDisputePending?: boolean;
  /** Stable failure code for a rejected dispute request. */
  readonly disputeError?: AnalyzePatchServerFailureCode | null;
  /** Persist a structured patch review. The route owns the server boundary. */
  readonly onSubmitFeedback: (input: {
    readonly questionId: string;
    readonly answerId: string;
    readonly excerptFingerprint: string;
    readonly recordFingerprint?: string;
    readonly reason: PatchFeedbackReason;
    readonly question?: string;
    readonly evidenceUrl?: string;
    readonly evidenceQuote?: string;
  }) => Promise<SubmitPatchFeedbackResponse>;
  readonly onClarify?: (input: {
    readonly questionId: string;
    readonly answerId: string;
    readonly excerptFingerprint: string;
    readonly excerptText: string;
    readonly recordFingerprint?: string;
    readonly currentReason?: string;
    readonly conversation: readonly { readonly role: string; readonly content: string }[];
  }) => Promise<ClarifyFeedbackResponse>;
}

// Formatting

function splitParagraphs(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  const parts = trimmed.split(/\n\n+/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

// Section views

function ExcerptView({ excerpt }: { readonly excerpt: AnswerExcerpt }) {
  const paragraphs = splitParagraphs(excerpt.excerpt);

  return (
    <div className="border-2 border-rule bg-paper-3 px-5 py-5 sm:px-6 shadow-[var(--shadow-card)]">
      <div className="space-y-4">
        {paragraphs.map((paragraph, index) => (
          <p
            key={index}
            className="text-base leading-7 text-ink sm:text-lg sm:leading-8"
          >
            {paragraph}
          </p>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
        <span>
          知乎问题 <span className="font-medium text-ink-subtle">#{excerpt.questionId}</span>
        </span>
        <span>
          回答 <span className="font-medium text-ink-subtle">#{excerpt.answerId}</span>
        </span>
        <span>摘录时间 {formatTimestamp(excerpt.capturedAt)}</span>
      </div>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
        来源编辑时间 {formatDateFromUnixSeconds(excerpt.sourceEditTime)}
      </p>
    </div>
  );
}

function ContextView({ text }: { readonly text: string }) {
  if (text.trim() === "") return null;
  return (
    <div className="border-2 border-rule bg-paper-3 px-5 py-4 shadow-[var(--shadow-card)]">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
        维护备注
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">{text}</p>
    </div>
  );
}

function AdvisoryView({ decision, excerptText }: { readonly decision: AnalyzePatchUpdateResponse; readonly excerptText?: string }) {
  return <UpdateAdvisoryCard decision={decision} excerptText={excerptText} />;
}

function NoPatchView({ decision }: { readonly decision: AnalyzePatchNoPatchResponse }) {
  return (
    <div className="border-2 border-rule bg-paper-3 px-5 py-5 sm:px-6 shadow-[var(--shadow-card)]">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        可学习 · 暂无更新
      </p>
      <p className="mt-4 max-w-[68ch] text-base leading-7 text-ink">
        这份回答仍可以作为理解问题的基础，目前没有可确认的关键前提更新。
      </p>
      <p className="mt-3 max-w-[68ch] text-sm leading-6 text-ink-subtle">{decision.reason}</p>
      <ol className="mt-4 grid gap-2 border-t-2 border-rule pt-4 text-sm leading-6 text-ink-subtle">
        <li>1. 先读摘录，注意作者当时给出的判断条件。</li>
        <li>2. 如果发现过时点，请在下方提交原因和可核对的证据。</li>
      </ol>
    </div>
  );
}

function UnknownView({ decision }: { readonly decision: AnalyzePatchUnknownResponse }) {
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

function DisputedPatchView() {
  return (
    <div className="border-2 border-update bg-update-soft px-5 py-5 sm:px-6 shadow-[var(--shadow-card)]">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-update">
          DISPUTED
        </span>
        <span className="text-sm font-medium text-ink-subtle">变更提示有争议</span>
      </div>
      <p className="mt-4 text-base leading-7 text-ink-subtle">
        这条补充提示已被标记为有争议，当前不再作为有效提示显示。
      </p>
      <p className="mt-3 text-xs text-muted">重新检查后会形成新的变更状态，历史记录不会被删除。</p>
    </div>
  );
}

// Lifecycle view

const lifecycleStatusLabel = (status: PatchLifecycleStatus): string => {
  if (status === "DISPUTED") return "已暂停";
  if (status === "SUPERSEDED") return "已被新检查替代";
  if (status === "RESOLVED") return "已解决";
  if (status === "WITHDRAWN") return "已撤回";
  return "当前可见";
};

interface LifecycleViewProps {
  readonly lifecycle?: PatchLifecycleSummary;
  readonly history?: readonly PatchLifecycleHistorySummary[];
  readonly onDispute?: () => void;
  readonly onResolve?: () => void;
  readonly onWithdraw?: () => void;
  readonly onRecheck?: () => void;
  readonly isDisputePending?: boolean;
  readonly disputeError?: AnalyzePatchServerFailureCode | null;
}

function LifecycleView({
  lifecycle,
  history,
  onDispute,
  onResolve,
  onWithdraw,
  onRecheck,
  isDisputePending,
  disputeError,
}: LifecycleViewProps) {
  if (lifecycle === undefined && (history === undefined || history.length === 0)) {
    return null;
  }

  const canDispute = lifecycle?.status === "VISIBLE" && onDispute !== undefined;
  const canResolve = lifecycle?.status === "VISIBLE" && onResolve !== undefined;
  const canWithdraw = lifecycle?.status === "VISIBLE" && onWithdraw !== undefined;
  const hasActions = canDispute || canResolve || canWithdraw || onRecheck !== undefined;

  return (
    <div
      aria-busy={isDisputePending}
      className="border-2 border-rule bg-paper-3 px-5 py-4 sm:px-6 shadow-[var(--shadow-card)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-2">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            变更状态
          </p>
          {lifecycle !== undefined && (
            <span className="inline-flex min-h-8 items-center justify-center border-2 border-rule bg-paper-3 px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink">
              {lifecycleStatusLabel(lifecycle.status)}
            </span>
          )}
        </div>

        {hasActions && (
          <div className="flex flex-wrap items-center gap-2">
            {canDispute && (
              <button
                type="button"
                onClick={onDispute}
                disabled={isDisputePending}
                className="inline-flex min-h-11 items-center justify-center border-2 border-rule-strong bg-paper-3 px-3.5 text-xs font-semibold text-ink transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent shadow-[var(--shadow-card)]"
              >
                标记有争议
              </button>
            )}
            {canResolve && (
              <button
                type="button"
                onClick={onResolve}
                disabled={isDisputePending}
                className="inline-flex min-h-11 items-center justify-center border-2 border-rule-strong bg-paper-3 px-3.5 text-xs font-semibold text-ink transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent shadow-[var(--shadow-card)]"
              >
                标记已解决
              </button>
            )}
            {canWithdraw && (
              <button
                type="button"
                onClick={onWithdraw}
                disabled={isDisputePending}
                className="inline-flex min-h-11 items-center justify-center border-2 border-rule-strong bg-paper-3 px-3.5 text-xs font-semibold text-ink transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent shadow-[var(--shadow-card)]"
              >
                撤回补丁
              </button>
            )}
            {onRecheck !== undefined && (
              <button
                type="button"
                onClick={onRecheck}
                disabled={isDisputePending}
                className="inline-flex min-h-11 items-center justify-center border-2 border-rule-strong bg-paper px-3.5 text-xs font-semibold text-ink transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent shadow-[var(--shadow-card)]"
              >
                重新检查
              </button>
            )}
          </div>
        )}
      </div>

      {disputeError !== undefined && disputeError !== null && (
        <p aria-live="polite" className="mt-3 text-sm font-medium text-ink-subtle">
          {failureMessage(disputeError)}
        </p>
      )}

      {history !== undefined && history.length > 0 && (
        <div className="mt-4 border-t-2 border-rule pt-3">
          <p className="text-xs font-medium text-muted">变更历史</p>
          <ul className="mt-2 space-y-2" role="list">
            {history.slice(0, 5).map((record) => (
              <li key={record.recordFingerprint} className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-xs font-medium text-ink-subtle">
                    {lifecycleStatusLabel(record.status)}
                  </span>
                  <span className="text-xs text-faint">{formatTimestamp(record.eventAt)}</span>
                </div>
                <p className="mt-0.5 break-words text-xs leading-5 text-muted">{record.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Main component

export function RealResultRead({
  excerpt,
  result,
  contextText,
  onDispute,
  onResolve,
  onWithdraw,
  onRecheck,
  isDisputePending,
  disputeError,
  onSubmitFeedback,
}: RealResultReadProps) {
  if (result.status === "error") {
    return null;
  }

  const decision = result.decision;
  const isDisputed = result.lifecycle?.status === "DISPUTED";

  return (
    <div className="space-y-4">
      {contextText && <ContextView text={contextText} />}
      <ExcerptView excerpt={excerpt} />

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
        onResolve={onResolve}
        onWithdraw={onWithdraw}
        onRecheck={onRecheck}
        isDisputePending={isDisputePending}
        disputeError={disputeError}
      />

      <PatchFeedbackPanel
        questionId={excerpt.questionId}
        answerId={excerpt.answerId}
        excerptFingerprint={excerpt.fingerprint}
        excerptText={excerpt.excerpt}
        {...(result.lifecycle === undefined
          ? {}
          : { recordFingerprint: result.lifecycle.recordFingerprint })}
        onSubmitFeedback={onSubmitFeedback}
      />
    </div>
  );
}
