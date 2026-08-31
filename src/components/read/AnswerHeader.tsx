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

function initialsFromName(name: string): string {
  // For CJK names, take the first character; for mixed names, take first char of each part
  const parts = name.replace(/[\s　]/g, "").split(/(?=[一-鿿])|(?<=[a-zA-Z])/);
  if (parts.length >= 2 && parts[0].match(/[a-zA-Z]/)) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.charAt(0);
}

export function AnswerHeader({ fixture }: AnswerHeaderProps) {
  const { source, capturedAt } = fixture;
  const freshnessNotice = buildFreshnessNotice(fixture.patches.length, latestAsOf(fixture));
  const avatarInitials = initialsFromName(source.authorDisplayName);

  return (
    <header className="mb-8">
      {/* Author row */}
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-600"
        >
          {avatarInitials}
        </div>
        <div>
          <p className="text-sm font-medium text-stone-900">{source.authorDisplayName}</p>
          <p className="text-xs text-stone-600">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-stone-800"
            >
              {source.questionTitle}
            </a>
            {" · "}
            知乎回答 · 捕获于 {formatDateYYYYMMDD(capturedAt)}
          </p>
        </div>
      </div>

      {/* Provenance label */}
      <p className="mt-4 inline-flex items-center rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
        <span aria-hidden="true" className="mr-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
        精选演示 · 从公开搜索摘要整理 · 非实时抓取
      </p>

      {/* Freshness notice */}
      <p className="mt-4 text-sm leading-6 text-amber-700">{freshnessNotice}</p>
    </header>
  );
}
