import { formatDateFromUnixSeconds, formatTimestamp } from "../../lib/failure-messages";
import type { AnswerExcerpt } from "../../lib/answer-excerpt";
import type { PatchFeedbackReason } from "../../lib/patch-feedback";
import type { PatchLifecycleStatus } from "../../lib/patch-lifecycle";
import type { SubmitPatchFeedbackResponse } from "../../server/submit-patch-feedback";
import type {
  ReadAnswerAdvisoryDecision,
  ReadAnswerHistoryEntry,
  ReadAnswerEvidenceSummary,
  ReadAnswerLifecycleSummary,
} from "../../server/read-answer-response";
import { PatchFeedbackPanel } from "../read/PatchFeedbackPanel";

export interface GeneralizedRealResultReadProps {
  readonly excerpt: AnswerExcerpt;
  readonly advisory: ReadAnswerAdvisoryDecision;
  readonly lifecycle: ReadAnswerLifecycleSummary;
  readonly history?: readonly ReadAnswerHistoryEntry[];
  readonly onDispute: () => void;
  readonly onResolve: () => void;
  readonly onWithdraw: () => void;
  readonly isLifecyclePending?: boolean;
  readonly lifecycleError?: string | null;
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
}

const LIFECYCLE_LABELS: Record<PatchLifecycleStatus, string> = {
  VISIBLE: "当前可见",
  DISPUTED: "已暂停",
  SUPERSEDED: "已被新检查替代",
  RESOLVED: "已解决",
  WITHDRAWN: "已撤回",
};

function splitParagraphs(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  return trimmed
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function ExcerptView({ excerpt }: { readonly excerpt: AnswerExcerpt }) {
  const paragraphs = splitParagraphs(excerpt.excerpt);

  return (
    <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-5 sm:px-6">
      <div className="space-y-4">
        {paragraphs.map((paragraph, index) => (
          <p
            key={`${paragraph.slice(0, 20)}-${index}`}
            className="text-base leading-7 text-ink sm:text-lg sm:leading-8"
          >
            {paragraph}
          </p>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
        <span>
          问题 <span className="font-medium text-ink-subtle">#{excerpt.questionId}</span>
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

function EvidenceList({
  evidenceSummary,
}: {
  readonly evidenceSummary: readonly ReadAnswerEvidenceSummary[];
}) {
  if (evidenceSummary.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
        参考来源
      </p>
      <ul className="space-y-1.5" role="list">
        {evidenceSummary.map((evidence) => (
          <li key={evidence.fingerprint}>
            {evidence.sourceUrl ? (
              <a
                href={evidence.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent-text underline underline-offset-2 transition-colors duration-150 hover:text-accent-active"
              >
                {evidence.sourceLabel}
              </a>
            ) : (
              <span className="text-sm text-ink-subtle">{evidence.sourceLabel}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UpdateAdvisoryView({ advisory }: { readonly advisory: ReadAnswerAdvisoryDecision }) {
  if (advisory.verdict !== "UPDATE") return null;

  return (
    <div className="rounded-[2px] border border-update/30 bg-update-soft px-5 py-5 sm:px-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-update/24 pb-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-update">
          UPDATE
        </p>
        <p className="text-sm font-medium text-ink-subtle">前提变化提示</p>
      </div>

      {advisory.affectedWording !== undefined && (
        <div className="mt-5 rounded-[2px] border border-update/24 bg-paper-2 px-4 py-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-update">
            原文受影响前提
          </p>
          <p className="mt-1 text-sm leading-6 text-ink">{advisory.affectedWording}</p>
        </div>
      )}

      {advisory.currentState !== undefined && (
        <div className="mt-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            当前状况
          </p>
          <p className="mt-1 text-sm leading-6 text-ink">{advisory.currentState}</p>
        </div>
      )}

      {advisory.impactOnAnswer !== undefined && (
        <div className="mt-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            对回答的影响
          </p>
          <p className="mt-1 text-sm leading-6 text-ink">{advisory.impactOnAnswer}</p>
        </div>
      )}

      <p className="mt-5 max-w-[68ch] text-base leading-7 text-ink">{advisory.reason}</p>
      <EvidenceList evidenceSummary={advisory.evidenceSummary} />

      <p className="mt-4 text-xs text-muted">
        前提说明已经发生变化，建议结合最新信息综合判断。上下文摘要作为辅助参考，请核对原始引用。
      </p>
    </div>
  );
}

function NoPatchView({ advisory }: { readonly advisory: ReadAnswerAdvisoryDecision }) {
  if (advisory.verdict !== "NO_PATCH") return null;

  return (
    <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-5 sm:px-6">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        可学习 · 暂无更新
      </p>
      <p className="mt-4 max-w-[68ch] text-base leading-7 text-ink">
        这份回答仍可以作为理解问题的基础，目前没有可确认的关键前提更新。
      </p>
      <p className="mt-3 max-w-[68ch] text-sm leading-6 text-ink-subtle">{advisory.reason}</p>
    </div>
  );
}

function UnknownView({ advisory }: { readonly advisory: ReadAnswerAdvisoryDecision }) {
  if (advisory.verdict !== "UNKNOWN") return null;

  return (
    <div className="rounded-[2px] border border-accent/32 bg-accent-soft px-5 py-5 sm:px-6">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-text">
        UNKNOWN
      </p>
      <p className="mt-4 max-w-[68ch] text-base leading-7 text-ink-subtle">{advisory.reason}</p>
    </div>
  );
}

function DisputedPatchView() {
  return (
    <div className="rounded-[2px] border border-update/32 bg-update-soft px-5 py-5 sm:px-6">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-update">
          DISPUTED
        </span>
        <span className="text-sm font-medium text-ink-subtle">变更提示有争议</span>
      </div>
      <p className="mt-4 text-base leading-7 text-ink-subtle">
        这条补充提示已被标记为有争议，当前不再作为有效提示显示。
      </p>
      <p className="mt-3 text-xs text-muted">复核后会形成新的变更状态，历史记录不会被删除。</p>
    </div>
  );
}

function ClosedPatchView({ lifecycle }: { readonly lifecycle: ReadAnswerLifecycleSummary }) {
  const copy =
    lifecycle.status === "SUPERSEDED"
      ? "这条提示已被新的检查结果替代。"
      : lifecycle.status === "RESOLVED"
        ? "这条提示已被标记为已解决。"
        : "这条提示已被撤回，当前不再显示。";

  return (
    <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-5 sm:px-6">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        {LIFECYCLE_LABELS[lifecycle.status]}
      </p>
      <p className="mt-4 text-base leading-7 text-ink-subtle">{copy}</p>
      <p className="mt-3 max-w-[68ch] break-words text-sm leading-6 text-muted">
        {lifecycle.reason}
      </p>
    </div>
  );
}

function LifecycleView({
  lifecycle,
  history,
  onDispute,
  onResolve,
  onWithdraw,
  isPending,
  actionError,
}: {
  readonly lifecycle: ReadAnswerLifecycleSummary;
  readonly history?: readonly ReadAnswerHistoryEntry[];
  readonly onDispute: () => void;
  readonly onResolve: () => void;
  readonly onWithdraw: () => void;
  readonly isPending: boolean;
  readonly actionError: string | null;
}) {
  const canAct = lifecycle.status === "VISIBLE" && !isPending;

  return (
    <div
      aria-busy={isPending}
      className="rounded-[2px] border border-rule bg-paper-2 px-5 py-4 sm:px-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-2">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            变更状态
          </p>
          <span className="inline-flex min-h-8 items-center rounded-[2px] border border-rule bg-paper px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
            {LIFECYCLE_LABELS[lifecycle.status]}
          </span>
        </div>

        {canAct && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onDispute}
              className="inline-flex min-h-11 items-center rounded-[6px] border border-rule bg-paper px-3.5 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              标记有争议
            </button>
            <button
              type="button"
              onClick={onResolve}
              className="inline-flex min-h-11 items-center rounded-[6px] border border-rule bg-paper px-3.5 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              标记已解决
            </button>
            <button
              type="button"
              onClick={onWithdraw}
              className="inline-flex min-h-11 items-center rounded-[6px] border border-rule bg-paper px-3.5 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              撤回补丁
            </button>
          </div>
        )}
      </div>

      {actionError !== null && (
        <p aria-live="polite" className="mt-3 text-sm font-medium text-danger">
          {actionError}
        </p>
      )}

      {history !== undefined && history.length > 1 && (
        <div className="mt-4 border-t border-rule pt-3">
          <p className="text-xs font-medium text-muted">变更历史</p>
          <ul className="mt-2 space-y-2" role="list">
            {history.slice(0, 5).map((record) => (
              <li key={record.recordFingerprint} className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-xs font-medium text-ink-subtle">
                    {LIFECYCLE_LABELS[record.status]}
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

export function GeneralizedRealResultRead({
  excerpt,
  advisory,
  lifecycle,
  history,
  onDispute,
  onResolve,
  onWithdraw,
  isLifecyclePending = false,
  lifecycleError = null,
  onSubmitFeedback,
}: GeneralizedRealResultReadProps) {
  const showActiveAnalysis = lifecycle.status === "VISIBLE";

  return (
    <div className="space-y-4">
      <ExcerptView excerpt={excerpt} />

      {showActiveAnalysis && <UpdateAdvisoryView advisory={advisory} />}
      {showActiveAnalysis && <NoPatchView advisory={advisory} />}
      {showActiveAnalysis && <UnknownView advisory={advisory} />}
      {lifecycle.status === "DISPUTED" && <DisputedPatchView />}
      {lifecycle.status !== "VISIBLE" && lifecycle.status !== "DISPUTED" && (
        <ClosedPatchView lifecycle={lifecycle} />
      )}

      <LifecycleView
        lifecycle={lifecycle}
        history={history}
        onDispute={onDispute}
        onResolve={onResolve}
        onWithdraw={onWithdraw}
        isPending={isLifecyclePending}
        actionError={lifecycleError}
      />

      <PatchFeedbackPanel
        questionId={excerpt.questionId}
        answerId={excerpt.answerId}
        excerptFingerprint={excerpt.fingerprint}
        recordFingerprint={lifecycle.recordFingerprint}
        onSubmitFeedback={onSubmitFeedback}
      />
    </div>
  );
}
