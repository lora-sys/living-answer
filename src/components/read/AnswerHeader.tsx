import type { GoldenDemoFixture } from "../../lib/golden-demo-fixture";
import { buildFreshnessNotice, formatDateYYYYMMDD, latestAsOf } from "../../lib/read-presentation";

interface AnswerHeaderProps {
  readonly fixture: GoldenDemoFixture;
}

/**
 * Synthetic header for the Golden Demo Read page.
 *
 * Displays synthetic author information, provenance metadata, and a
 * freshness notice summarising how many paragraphs have changed.
 */
export function AnswerHeader({ fixture }: AnswerHeaderProps) {
  const { syntheticAuthor, capturedAt } = fixture;
  const freshnessNotice = buildFreshnessNotice(fixture.patches.length, latestAsOf(fixture));

  return (
    <header className="mb-8">
      {/* Author row */}
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-600"
        >
          {syntheticAuthor.initials}
        </div>
        <div>
          <p className="text-sm font-medium text-stone-900">{syntheticAuthor.displayName}</p>
          <p className="text-xs text-stone-500">
            知乎回答 · 捕获于 {formatDateYYYYMMDD(capturedAt)}
          </p>
        </div>
      </div>

      {/* Provenance label */}
      <p className="mt-4 inline-flex items-center rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
        <span aria-hidden="true" className="mr-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
        精选演示 · 合成数据
      </p>

      {/* Freshness notice */}
      <p className="mt-4 text-sm leading-6 text-amber-700">{freshnessNotice}</p>
    </header>
  );
}
