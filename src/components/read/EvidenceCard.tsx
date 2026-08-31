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
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-stone-900">{evidence.title}</h4>
          <p className="text-xs text-stone-500">
            {evidence.organization} · {evidence.sourceType} ·{" "}
            {formatDateYYYYMMDD(evidence.publishedAt)}
          </p>
        </div>
        {evidence.sourceUrl && (
          <a
            href={evidence.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
          >
            原文
          </a>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 text-stone-600">{evidence.supportedFact}</p>
      {evidence.quote && (
        <blockquote className="mt-2 border-l-2 border-stone-200 pl-3 text-xs italic text-stone-500">
          "{evidence.quote}"
        </blockquote>
      )}
    </div>
  );
}
