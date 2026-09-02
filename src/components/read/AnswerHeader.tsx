import type { GoldenDemoFixture } from "../../lib/golden-demo-fixture";
import { buildFreshnessNotice, formatDateYYYYMMDD, latestAsOf } from "../../lib/read-presentation";

interface AnswerHeaderProps {
  readonly fixture: GoldenDemoFixture;
}

/**
 * Header for the Golden Demo Read page.
 *
 * Displays the real Zhihu author name, question title with a canonical link,
 * and provenance metadata grounded in the public search summary source.
 */

export function AnswerHeader({ fixture }: AnswerHeaderProps) {
  const { source, capturedAt } = fixture;
  const freshnessNotice = buildFreshnessNotice(fixture.patches.length, latestAsOf(fixture));

  return (
    <header className="mb-8 border-b-2 border-rule-strong pb-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        ORIGINAL ARTIFACT
      </p>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <p className="text-lg font-semibold text-ink">{source.authorDisplayName}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
          ZHIHU · {formatDateYYYYMMDD(capturedAt)}
        </p>
      </div>
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block max-w-[68ch] break-words text-base font-medium text-accent transition-colors duration-150 hover:text-accent-active focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent underline underline-offset-2 decoration-accent/30 hover:decoration-accent"
      >
        {source.questionTitle}
      </a>

      <div className="mt-5 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule pt-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
          CURATED DEMO · SUMMARY SOURCE
        </p>
        <p className="text-sm leading-6 text-update">{freshnessNotice}</p>
      </div>
    </header>
  );
}
