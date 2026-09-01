import type { GoldenDemoEvidence } from "../../lib/golden-demo-fixture";
import { formatDateYYYYMMDD } from "../../lib/read-presentation";

interface EvidenceCardProps {
  readonly evidence: GoldenDemoEvidence;
}

/**
 * One primary-source evidence card.
 *
 * Shows the source title, organization, type, and a link. The card is
 * informational only — no AI/provider/network calls.
 */
export function EvidenceCard({ evidence }: EvidenceCardProps) {
  return (
    <div className="border border-rule bg-paper-2 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-6 text-ink">{evidence.title}</h4>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
            {evidence.organization} · {evidence.sourceType} ·{" "}
            {formatDateYYYYMMDD(evidence.publishedAt)}
          </p>
        </div>
        {evidence.sourceUrl && (
          <a
            href={evidence.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${evidence.title}（在新标签页中打开）`}
            className="shrink-0 inline-flex items-center gap-0.5 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
          >
            原文
            <svg
              aria-hidden="true"
              className="ml-0.5 h-3 w-3"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9h7M8 4l3 3-3 3" />
            </svg>
          </a>
        )}
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-subtle">{evidence.supportedFact}</p>
      {evidence.quote && (
        <blockquote className="mt-3 border-l-2 border-rule-strong pl-3 text-xs leading-5 text-muted">
          "{evidence.quote}"
        </blockquote>
      )}
    </div>
  );
}
