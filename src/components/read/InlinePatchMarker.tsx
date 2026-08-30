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
        "inline-flex items-center rounded-full border border-amber-300 bg-amber-50",
        "px-2 py-0.5 text-xs font-medium text-amber-800",
        "cursor-pointer transition-colors hover:bg-amber-100",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500",
      ].join(" ")}
      aria-expanded={isOpen}
      aria-controls={panelIds}
      aria-label={label}
      onClick={onClick}
    >
      <span aria-hidden="true" className="mr-1 inline-block h-1 w-1 rounded-full bg-amber-500" />
      {label}
    </button>
  );
}
