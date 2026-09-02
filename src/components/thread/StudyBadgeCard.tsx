import type { QuestionLearningThread } from "../../lib/thread-artifact";

interface StudyBadgeCardProps {
  readonly artifact: QuestionLearningThread;
  readonly onExportMarkdown: () => void;
  readonly onExportJson: () => void;
}

const CORE_NODE_ORDER = [
  "relationship",
  "cause",
  "consensus",
  "evolution",
  "divergence",
  "changed_premise",
  "unknown",
];

const NODE_LABELS: Record<string, string> = {
  relationship: "关系",
  cause: "因果",
  evolution: "演变",
  consensus: "共识",
  divergence: "分歧",
  changed_premise: "前提变化",
  unknown: "待确认",
};

export function StudyBadgeCard({ artifact, onExportMarkdown, onExportJson }: StudyBadgeCardProps) {
  const years = artifact.timelineStages.map((stage) =>
    new Date(stage.editTime * 1000).getFullYear(),
  );
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const yearRange = minYear === maxYear ? String(minYear) : `${minYear}-${maxYear}`;

  const coreNodes = [...artifact.learningNodes]
    .sort((left, right) => {
      const leftIndex = CORE_NODE_ORDER.indexOf(left.kind);
      const rightIndex = CORE_NODE_ORDER.indexOf(right.kind);
      return leftIndex - rightIndex;
    })
    .slice(0, 3);
  const openQuestions = artifact.learningGuide.openQuestions.slice(0, 2);
  const roleCounts = artifact.learningNodes.reduce<Record<string, number>>((counts, node) => {
    counts[node.kind] = (counts[node.kind] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <section
      aria-labelledby="study-badge-heading"
      className="border-2 border-accent bg-accent-soft"
    >
      <div className="border-b border-accent/20 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">
              STUDY BADGE
            </p>
            <h2
              id="study-badge-heading"
              className="mt-2 font-display text-[24px] font-bold leading-8 tracking-tight text-ink sm:text-[28px]"
            >
              {artifact.learningGuide.overview.headline}
            </h2>
          </div>
          <span className="inline-flex min-h-8 shrink-0 items-center border-2 border-ink bg-paper-3 px-2.5 font-mono text-[11px] font-semibold text-ink">
            {yearRange} · {artifact.timelineStages.length} 来源
          </span>
        </div>

        <p className="mt-3 max-w-[72ch] text-sm leading-6 text-ink-subtle">
          {artifact.learningGuide.overview.summary}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(roleCounts).map(([kind, count]) => (
            <span
              key={kind}
              className="inline-flex min-h-7 items-center border border-accent bg-paper-3 px-2 font-mono text-[10px] font-semibold text-accent"
            >
              {NODE_LABELS[kind] ?? kind} {count}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <div>
          <h3 className="text-sm font-semibold text-ink">核心学习点</h3>
          <ul className="mt-3 list-none space-y-3">
            {coreNodes.map((node) => (
              <li key={`${node.kind}-${node.sourceAnswerId}`} className="flex gap-3">
                <span aria-hidden="true" className="mt-1.5 block h-2 w-2 shrink-0 bg-accent" />
                <p className="min-w-0 text-sm leading-6 text-ink-subtle">
                  <span className="font-medium text-ink">{node.title}</span>
                  {node.summary}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {openQuestions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-ink">继续追问</h3>
            <ul className="mt-3 list-none space-y-2">
              {openQuestions.map((question) => (
                <li key={question} className="text-sm leading-6 text-ink-subtle">
                  - {question}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-3 border-t border-accent/20 pt-4">
          <button
            type="button"
            onClick={onExportMarkdown}
            className="inline-flex h-11 items-center justify-center border-2 border-accent bg-accent px-5 text-sm font-semibold text-white transition-all duration-120 hover:bg-accent-hover hover:shadow-[3px_3px_0_var(--color-accent)] active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            带走 Markdown 笔记
          </button>
          <button
            type="button"
            onClick={onExportJson}
            className="inline-flex h-11 items-center justify-center border-2 border-rule-strong bg-paper-3 px-4 text-sm font-medium text-ink transition-colors duration-150 hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            导出 JSON
          </button>
        </div>
      </div>
    </section>
  );
}
