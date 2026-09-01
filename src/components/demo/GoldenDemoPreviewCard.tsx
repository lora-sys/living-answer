import { Link } from "@tanstack/react-router";

import type { GoldenDemoFixture } from "../../lib/golden-demo-fixture";
import { PATCH_TYPE_LABELS, formatDateYYYYMMDD } from "../../lib/read-presentation";
import { truncatePreview } from "../../lib/golden-demo-preview";

interface GoldenDemoPreviewCardProps {
  readonly demo: GoldenDemoFixture;
  readonly variant?: "hero" | "compact";
}

function formatEvidencePeriod(publishedAt: number): string {
  const date = new Date(publishedAt);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function GoldenDemoPreviewCard({ demo, variant = "compact" }: GoldenDemoPreviewCardProps) {
  const patch = demo.patches[0];
  const href = `/read/golden-demo/${demo.id}`;

  return (
    <Link
      to={href as unknown as Parameters<typeof Link>[0]["to"]}
      className={[
        "group block min-w-0 overflow-hidden rounded-[2px] border border-rule bg-paper-2",
        "shadow-[var(--shadow-card)] transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-5 gap-y-2 border-b border-rule bg-paper px-4 py-3 sm:px-6">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          {variant === "hero" ? "FEATURED" : "PATCH RECORD"} · {formatDateYYYYMMDD(patch.asOf)}
        </span>
        <span className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-update">
          <span aria-hidden="true" className="h-1.5 w-1.5 bg-update" />
          {PATCH_TYPE_LABELS[patch.type]}
        </span>
      </div>

      <div className="border-b border-rule px-4 py-5 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{demo.topic}</p>
        <h3 className="mt-3 max-w-[68ch] text-[19px] font-semibold leading-7 tracking-[-0.02em] text-ink sm:text-[21px] sm:leading-8">
          {demo.displayTitle}
        </h3>
        <p className="mt-3 max-w-[68ch] text-sm leading-6 text-ink-subtle sm:text-[15px] sm:leading-7">
          {demo.description}
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="border-b border-rule px-4 py-5 sm:px-6 lg:border-b-0 lg:border-r">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">原文前提</p>
          <p className="mt-3 max-w-[58ch] break-words text-sm leading-6 text-ink-subtle">
            {truncatePreview(patch.originalExcerpt)}
          </p>
        </div>

        <div className="border-b border-rule px-4 py-5 sm:px-6 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 border-t-2 border-update pt-3 lg:border-t-0 lg:pt-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-update">
              现在变化
            </p>
          </div>
          <p className="mt-3 max-w-[58ch] break-words text-sm leading-6 text-ink-subtle">
            {truncatePreview(patch.currentChange)}
          </p>
        </div>

        <div className="px-4 py-5 sm:px-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">证据</p>
          <ul className="mt-3 space-y-3">
            {patch.evidence.slice(0, variant === "hero" ? 2 : 1).map((evidence) => (
              <li key={evidence.sourceUrl} className="min-w-0">
                <p className="break-words text-sm font-semibold text-ink">
                  {evidence.organization}
                </p>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  SOURCE · {formatEvidencePeriod(evidence.publishedAt)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex min-h-11 items-center justify-between gap-4 border-t border-rule bg-paper px-4 py-3 sm:px-6">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          {demo.source.authorDisplayName}
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-accent-text transition-colors duration-150 group-hover:text-accent-active">
          打开记录
          <span aria-hidden="true">&rarr;</span>
        </span>
      </div>
    </Link>
  );
}
