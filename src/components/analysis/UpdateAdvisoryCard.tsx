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

// ── Types ───────────────────────────────────────────────────────────────────────

export interface UpdateAdvisoryCardProps {
  /** Parsed UPDATE decision (status: "ok" — caller confirmed). */
  readonly decision: AnalyzePatchUpdateResponse;
  /** Excerpt text the affected wording is anchored to, or undefined. */
  readonly excerptText?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

const truncate = (text: string, max: number): string =>
  text.length > max ? text.slice(0, max) + "…" : text;

// ── Component ───────────────────────────────────────────────────────────────────

export function UpdateAdvisoryCard({ decision, excerptText }: UpdateAdvisoryCardProps) {
  return (
    <div className="rounded-2xl border border-[#d97757]/30 bg-[#fdf6f3] px-5 py-5 sm:px-6">
      {/* Badge */}

      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
          信息已更新
        </span>
        <span className="text-xs text-stone-500">前提变化提示</span>
      </div>

      {/* 原文受影响前提 */}

      {decision.affectedWording !== undefined && (
        <div className="mt-4 rounded-xl border border-[#d97757]/20 bg-white/60 px-4 py-3">
          <p className="text-xs font-medium text-[#d97757]">原文受影响前提</p>
          <p className="mt-1 text-sm leading-6 text-stone-800">
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

      {/* 当前状况 */}

      {decision.currentState !== undefined && (
        <div className="mt-3">
          <p className="text-xs font-medium text-stone-500">当前状况</p>
          <p className="mt-1 text-sm leading-6 text-stone-800">{decision.currentState}</p>
        </div>
      )}

      {/* 对回答的影响 */}

      {decision.impactOnAnswer !== undefined && (
        <div className="mt-3">
          <p className="text-xs font-medium text-stone-500">对回答的影响</p>
          <p className="mt-1 text-sm leading-6 text-stone-800">{decision.impactOnAnswer}</p>
        </div>
      )}

      {/* Generic reason (always shown) */}

      <p className="mt-4 text-base leading-7 text-stone-800">{decision.reason}</p>

      {/* 匹配证据 */}

      {decision.matchedEvidence !== undefined && decision.matchedEvidence.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-stone-500">匹配证据</p>
          <ul className="space-y-2">
            {decision.matchedEvidence.map((ev) => (
              <li
                key={ev.fingerprint}
                className="rounded-lg border border-stone-200 bg-white/70 px-3 py-2"
              >
                <p className="text-xs leading-5 text-stone-600">{ev.quote}</p>
                <a
                  href={ev.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-block text-xs text-[#d97757] underline underline-offset-2 transition-colors hover:text-[#c4684a]"
                >
                  {ev.sourceLabel}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 参考来源 */}

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

      {/* Advisory disclaimer (always shown) */}

      <p className="mt-4 text-xs text-stone-500">
        前提说明已经发生变化，建议结合最新信息综合判断。&nbsp; AI
        生成的上下文摘要作为辅助参考，内容由外部来源提供，请核对原始引用。
      </p>
    </div>
  );
}
