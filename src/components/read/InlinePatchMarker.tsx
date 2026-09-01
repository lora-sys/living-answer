interface InlinePatchMarkerProps {
  readonly paragraphId: string;
  readonly patchCount: number;
  readonly isOpen: boolean;
  readonly panelIds: string | undefined;
  readonly onClick: () => void;
}

/**
 * Lightweight accessible `<button>` marker for a paragraph with patches.
 *
 * Native Enter/Space triggers `onClick`. `aria-expanded` reflects the open
 * state and `aria-controls` points to the PatchPanel `role="region"`.
 * Focus return and Escape handling are managed by the parent page.
 */
export function InlinePatchMarker({
  paragraphId,
  patchCount,
  isOpen,
  panelIds,
  onClick,
}: InlinePatchMarkerProps) {
  const label = patchCount === 1 ? "1 处变化" : `${patchCount} 处变化`;

  return (
    <button
      type="button"
      data-paragraph-id={paragraphId}
      className={[
        "inline-flex items-center rounded-[2px] border border-update/32 bg-update-soft",
        "min-h-11 px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-update",
        "cursor-pointer transition-colors duration-150 hover:border-update/56 active:translate-y-px",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      ].join(" ")}
      aria-expanded={isOpen}
      aria-controls={panelIds}
      aria-label={label}
      onClick={onClick}
    >
      <span aria-hidden="true" className="mr-1.5 h-1.5 w-1.5 bg-update" />
      {label}
      <svg
        aria-hidden="true"
        className={`ml-0.5 h-3 w-3 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="2,4 6,8 10,4" />
      </svg>
    </button>
  );
}
