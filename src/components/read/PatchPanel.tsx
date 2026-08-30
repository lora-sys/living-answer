import { useRef } from "react";

import type { GoldenDemoPatch } from "../../lib/golden-demo-fixture";
import { PATCH_TYPE_LABELS, formatDateYYYYMMDD } from "../../lib/read-presentation";

import { EvidenceCard } from "./EvidenceCard";

interface PatchPanelProps {
  readonly patches: readonly GoldenDemoPatch[];
  readonly activePatchId: string | null;
  readonly onClose: () => void;
  readonly panelId: string;
}

/**
 * Fixed PatchPanel showing patch details and evidence cards.
 *
 * Order (per ticket):
 *   1. Type and impact summary
 *   2. Original answer excerpt
 *   3. Current change
 *   4. Impact on the original answer (explicit)
 *   5. 截至 YYYY-MM-DD
 *   6. Evidence list
 *   7. Feedback entry (disabled)
 *
 * Non-modal: does not trap focus. Escape is handled by the parent.
 */
export function PatchPanel({ patches, activePatchId, onClose, panelId }: PatchPanelProps) {
  const activePatch = patches.find((p) => p.id === activePatchId) ?? null;
  const panelRef = useRef<HTMLDivElement>(null);

  if (!activePatch) {
    return (
      <div
        ref={panelRef}
        id={panelId}
        role="region"
        aria-live="polite"
        className="rounded-[2rem] border border-stone-300/80 bg-white/90 p-6 shadow-lg lg:p-8"
      >
        <p className="text-sm leading-6 text-stone-500">
          点击正文中的变化标记，查看此处的前提变化说明与证据来源。
        </p>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      id={panelId}
      role="region"
      aria-live="polite"
      className={[
        "rounded-[2rem] border border-amber-200 bg-white/95 p-6 shadow-lg lg:p-8",
        "max-h-[70vh] overflow-y-auto lg:max-h-none",
      ].join(" ")}
    >
      {/* Header with type + close */}
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          {PATCH_TYPE_LABELS[activePatch.type]}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full p-1.5 text-stone-400 transition-colors hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
          aria-label="关闭变化面板"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path
              d="M4 4L14 14M14 4L4 14"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* 1. Compact type + impact summary */}
      {patches.length > 1 && (
        <p className="mt-4 text-sm font-medium text-amber-900">
          {patches.length} 处前提已有重要更新
        </p>
      )}

      {/* 2. Original excerpt */}
      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">原文摘录</h3>
        <p className="mt-1.5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
          {activePatch.originalExcerpt}
        </p>
      </div>

      {/* 3. Current change */}
      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">当前更新</h3>
        <p className="mt-1.5 text-sm leading-6 text-stone-800">{activePatch.currentChange}</p>
      </div>

      {/* 4. Impact on the original answer (explicit) */}
      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
          对原文的影响
        </h3>
        <p className="mt-1.5 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3 text-sm leading-6 text-amber-900">
          {activePatch.impact}
        </p>
      </div>

      {/* 5. As-of date */}
      <p className="mt-4 text-xs text-stone-500">截至 {formatDateYYYYMMDD(activePatch.asOf)}</p>

      {/* 6. Evidence list */}
      <div className="mt-6 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">证据来源</h3>
        {activePatch.evidence.map((ev) => (
          <EvidenceCard key={ev.sourceUrl + ev.quote} evidence={ev} />
        ))}
      </div>

      {/* 7. Feedback (disabled, for later release) */}
      <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
        <p className="text-xs text-stone-400">反馈功能即将上线，敬请期待。</p>
      </div>
    </div>
  );
}
