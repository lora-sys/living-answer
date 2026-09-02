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

export function PatchPanel({ patches, activePatchId, onClose, panelId }: PatchPanelProps) {
  const activePatch = patches.find((p) => p.id === activePatchId) ?? null;
  const panelRef = useRef<HTMLDivElement>(null);

  if (!activePatch) {
    return (
      <div
        ref={panelRef}
        id={panelId}
        role="region"
        aria-label="变化面板"
        aria-live="polite"
        className="border-2 border-rule bg-paper-3 p-5 shadow-[var(--shadow-panel)] lg:p-6"
      >
        <p className="text-sm leading-6 text-muted">
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
      aria-label="变化面板"
      aria-live="polite"
      className={[
        "border-2 border-update bg-update-soft p-5 shadow-[var(--shadow-panel)] lg:p-6",
        "max-h-[70vh] overflow-y-auto lg:max-h-[calc(100vh-8rem)]",
      ].join(" ")}
    >
      {/* Header with type + close */}
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 border-t-[3px] border-t-update pt-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-update">
          {PATCH_TYPE_LABELS[activePatch.type]}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center border-2 border-rule text-muted transition-colors duration-150 hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-update">
          {patches.length} PATCHES
        </p>
      )}

      {/* 2. Original excerpt */}
      <div className="mt-5">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          原文摘录
        </h3>
        <p className="mt-2 border border-rule bg-paper-3 px-4 py-3 text-sm leading-6 text-ink shadow-[var(--shadow-card)]">
          {activePatch.originalExcerpt}
        </p>
      </div>

      {/* 3. Current change */}
      <div className="mt-5">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-update">
          当前更新
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink">{activePatch.currentChange}</p>
      </div>

      {/* 4. Impact on the original answer (explicit) */}
      <div className="mt-5">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          对原文的影响
        </h3>
        <p className="mt-2 border-l-[3px] border-l-update pl-3 text-sm leading-6 text-update">
          {activePatch.impact}
        </p>
      </div>

      {/* 5. As-of date */}
      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
        AS OF {formatDateYYYYMMDD(activePatch.asOf)}
      </p>

      {/* 6. Evidence list */}
      <div className="mt-6 space-y-4">
        <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          证据来源
        </h3>
        {activePatch.evidence.map((ev) => (
          <EvidenceCard key={ev.sourceUrl + ev.quote} evidence={ev} />
        ))}
      </div>
    </div>
  );
}
