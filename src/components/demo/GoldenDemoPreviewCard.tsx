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
  const hero = variant === "hero";
  const href = `/read/golden-demo/${demo.id}`;

  return (
    <Link
      to={href as unknown as Parameters<typeof Link>[0]["to"]}
      className={[
        "group block min-w-0 overflow-hidden rounded-[14px] border border-rule",
        "bg-paper-2 shadow-[var(--shadow-card)] transition-all duration-[160ms]",
        "hover:-translate-y-0.5 hover:border-accent/35",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      ].join(" ")}
    >
      <div className={hero ? "p-6 sm:p-7" : "p-5 sm:p-6"}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="inline-flex items-center rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-muted">
            {demo.topic}
          </span>
          <span className="inline-flex items-center rounded-full border border-update/30 bg-update-soft px-2.5 py-1 text-xs font-semibold text-update">
            {PATCH_TYPE_LABELS[patch.type]}
          </span>
          <span className="inline-flex items-center rounded-full border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-muted">
            真实知乎来源
          </span>
        </div>

        <h3
          className={[
            "mt-4 font-semibold tracking-tight text-ink",
            hero ? "text-lg leading-7 sm:text-xl sm:leading-8" : "text-lg leading-7",
          ].join(" ")}
        >
          {demo.displayTitle}
        </h3>

        <p
          className={[
            "mt-2 text-ink-subtle",
            hero ? "text-sm leading-6" : "text-sm leading-6",
          ].join(" ")}
        >
          {demo.description}
        </p>
      </div>

      <div className="grid border-t border-rule">
        <div className="border-b border-rule bg-paper px-5 py-3.5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">原文前提</p>
          <p className="mt-2 break-words text-sm leading-6 text-ink-subtle">
            {truncatePreview(patch.originalExcerpt)}
          </p>
        </div>

        <div className="border-b border-update/28 bg-update-soft px-5 py-3.5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-update">现在变化</p>
          <p className="mt-2 break-words text-sm leading-6 text-ink-subtle">
            {truncatePreview(patch.currentChange)}
          </p>
        </div>

        <div className="px-5 py-3.5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">证据来源</p>
          <ul className="mt-2 space-y-2">
            {patch.evidence.slice(0, hero ? 2 : 1).map((evidence) => (
              <li
                key={evidence.sourceUrl}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
              >
                <span className="break-words text-sm font-medium text-ink">
                  {evidence.organization}
                </span>
                <span className="font-mono text-xs text-muted">
                  {formatEvidencePeriod(evidence.publishedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-rule bg-paper px-5 py-3.5 sm:px-6">
        <span className="text-xs text-muted">更新截至 {formatDateYYYYMMDD(patch.asOf)}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-accent-text transition-colors group-hover:text-accent-active">
          打开补丁
          <span
            aria-hidden="true"
            className="transition-transform duration-[160ms] group-hover:translate-x-0.5"
          >
            &rarr;
          </span>
        </span>
      </div>
    </Link>
  );
}
