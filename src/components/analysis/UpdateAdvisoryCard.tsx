/**
 * UpdateAdvisoryCard — shared UPDATE presentation used by both
 * {@link RealResultRead} and {@link AnalysisResultPanel}.
 *
 * Renders conditional sections in this order:
 *   原文受影响前提, 当前状况, 对回答的影响, generic reason,
 *   匹配证据, 参考来源, advisory disclaimer.
 *
 * A section is omitted when its data is absent.
 * Amber styling is reserved for UPDATE.
 *
 * @module UpdateAdvisoryCard
 */

import type { AnalyzePatchUpdateResponse } from "../../server/analyze-patch-response";

export interface UpdateAdvisoryCardProps {
  readonly decision: AnalyzePatchUpdateResponse;
  readonly excerptText?: string;
}

const truncate = (text: string, max: number): string =>
  text.length > max ? text.slice(0, max) + "…" : text;

export function UpdateAdvisoryCard({ decision, excerptText }: UpdateAdvisoryCardProps) {
  return (
    <div className="border-2 border-update bg-update-soft px-5 py-5 sm:px-6 shadow-[var(--shadow-card)]">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b-2 border-update/30 pb-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-update">
          UPDATE
        </p>
        <p className="text-sm font-medium text-ink-subtle">前提变化提示</p>
      </div>

      {decision.affectedWording !== undefined && (
        <div className="mt-5 border border-update/30 bg-paper-3 px-4 py-3 shadow-[var(--shadow-card)]">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-update">
            原文受影响前提
          </p>
          <p className="mt-1 text-sm leading-6 text-ink">
            {excerptText !== undefined ? (
              <>
                &ldquo;<span className="font-medium">{truncate(decision.affectedWording, 80)}</span>
                &rdquo;
              </>
            ) : (
              truncate(decision.affectedWording, 80)
            )}
          </p>
        </div>
      )}

      {decision.currentState !== undefined && (
        <div className="mt-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            当前状况
          </p>
          <p className="mt-1 text-sm leading-6 text-ink">{decision.currentState}</p>
        </div>
      )}

      {decision.impactOnAnswer !== undefined && (
        <div className="mt-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            对回答的影响
          </p>
          <p className="mt-1 text-sm leading-6 text-ink">{decision.impactOnAnswer}</p>
        </div>
      )}

      <p className="mt-5 max-w-[68ch] text-base leading-7 text-ink">{decision.reason}</p>

      {decision.matchedEvidence !== undefined && decision.matchedEvidence.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            匹配证据
          </p>
          <ul className="space-y-2">
            {decision.matchedEvidence.map((ev) => (
              <li
                key={ev.fingerprint}
                className="border-2 border-rule bg-paper-3 px-4 py-3 shadow-[var(--shadow-card)]"
              >
                <p className="text-xs leading-5 text-ink-subtle">{ev.quote}</p>
                <a
                  href={ev.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-block text-xs text-accent underline underline-offset-2 transition-colors hover:text-accent-active"
                >
                  {ev.sourceLabel}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {decision.evidenceSummary.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            参考来源
          </p>
          <ul className="space-y-1.5">
            {decision.evidenceSummary.map((ev) => (
              <li key={ev.fingerprint}>
                <a
                  href={ev.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent underline underline-offset-2 transition-colors hover:text-accent-active"
                >
                  {ev.sourceLabel}
                </a>
                <span className="ml-2 inline-flex items-center text-xs text-faint">
                  <svg
                    aria-hidden="true"
                    className="mr-0.5 h-3 w-3"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 9h7M8 4l3 3-3 3" />
                  </svg>
                  {truncate(ev.sourceUrl, 36)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        前提说明已经发生变化，建议结合最新信息综合判断。&nbsp;
        AI 生成的上下文摘要作为辅助参考，内容由外部来源提供，请核对原始引用。
      </p>
    </div>
  );
}
