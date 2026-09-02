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

const SOURCE_ROLE_LABELS: Record<string, string> = {
  baseline: "基础认知",
  correction: "边界修正",
  extension: "深化扩展",
  counterpoint: "不同视角",
  current_usage: "当前用法",
  unclear: "待确认",
};

const SOURCE_ROLE_DOT_CLASSES: Record<string, string> = {
  baseline: "bg-info",
  correction: "bg-update",
  extension: "bg-success",
  counterpoint: "bg-accent",
  current_usage: "bg-ink",
  unclear: "bg-rule",
};

export function StudyBadgeCard({ artifact, onExportMarkdown, onExportJson }: StudyBadgeCardProps) {
  const stages = artifact.timelineStages;
  const years = stages.map((stage) => new Date(stage.editTime * 1000).getFullYear());
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const yearRange = minYear === maxYear ? String(minYear) : `${minYear}-${maxYear}`;
  const yearSpan = Math.max(1, maxYear - minYear);
  const authorCount = new Set(stages.map((stage) => stage.authorDisplayName)).size;
  const sourceRoleCounts = artifact.learningGuide.stages.reduce<Record<string, number>>(
    (counts, stage) => {
      counts[stage.role] = (counts[stage.role] ?? 0) + 1;
      return counts;
    },
    {},
  );

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
  const counterIntuition =
    artifact.learningNodes.find(
      (node) => node.kind === "changed_premise" || node.kind === "divergence",
    ) ?? coreNodes[1];
  const selfChecks = [
    openQuestions[0] ?? "这个结论在什么条件下会不成立？",
    openQuestions[1] ?? "你能用一个真实例子解释核心证据吗？",
  ];
  const nextAction =
    counterIntuition?.kind === "changed_premise"
      ? "先写出现有方法的适用边界，再找一个反例检查它。"
      : "选一条最新来源，用你自己的问题重述一次核心结论。";

  return (
    <article
      aria-labelledby="study-badge-heading"
      className="border-2 border-rule-strong bg-paper-3 shadow-[var(--shadow-panel)]"
    >
      <div className="bg-accent-soft px-5 py-5 sm:px-6">
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
          <div className="grid shrink-0 grid-cols-3 border-2 border-rule-strong bg-paper-3">
            {[
              { label: "年份", value: yearRange },
              { label: "来源", value: String(stages.length) },
              { label: "作者", value: String(authorCount) },
            ].map((stat, index) => (
              <div
                key={stat.label}
                className={index > 0 ? "border-l border-rule px-3 py-2" : "px-3 py-2"}
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                  {stat.label}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-ink">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-3 max-w-[72ch] text-sm leading-6 text-ink-subtle">
          {artifact.learningGuide.overview.summary}
        </p>
      </div>

      <div className="border-t-2 border-rule-strong px-5 py-5 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
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

          <div className="border-t border-rule pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <h3 className="text-sm font-semibold text-ink">来源角色</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(sourceRoleCounts).map(([role, count]) => (
                <span
                  key={role}
                  className="inline-flex min-h-7 items-center border border-rule-strong bg-paper-2 px-2 font-mono text-[10px] font-semibold text-ink"
                >
                  {SOURCE_ROLE_LABELS[role] ?? role} {count}
                </span>
              ))}
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.06em] text-muted">
                <span>{minYear}</span>
                <span>{maxYear}</span>
              </div>
              <div aria-hidden="true" className="relative mt-2 h-2 w-full bg-rule">
                {stages.map((stage) => {
                  const year = new Date(stage.editTime * 1000).getFullYear();
                  const guideStage = artifact.learningGuide.stages.find(
                    (item) => item.answerId === stage.answerId,
                  );
                  const position = ((year - minYear) / yearSpan) * 100;
                  return (
                    <span
                      key={stage.answerId}
                      className={`absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 ${
                        SOURCE_ROLE_DOT_CLASSES[guideStage?.role ?? "unclear"]
                      }`}
                      style={{ left: `${position}%` }}
                    />
                  );
                })}
              </div>
              <ul className="sr-only">
                {stages.map((stage) => (
                  <li key={stage.answerId}>
                    {new Date(stage.editTime * 1000).getFullYear()} 年，
                    {SOURCE_ROLE_LABELS[
                      artifact.learningGuide.stages.find((item) => item.answerId === stage.answerId)
                        ?.role ?? "unclear"
                    ] ?? "待确认"}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 flex flex-wrap gap-1.5">
              {Object.entries(roleCounts).map(([kind, count]) => (
                <span
                  key={kind}
                  className="inline-flex min-h-6 items-center border border-accent bg-accent-soft px-1.5 font-mono text-[9px] font-semibold text-accent"
                >
                  {NODE_LABELS[kind] ?? kind} {count}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5 border-t border-rule bg-paper-2 px-5 py-5 sm:px-6">
        {counterIntuition && (
          <div className="border-l-2 border-accent bg-paper-3 px-4 py-4">
            <h3 className="text-sm font-semibold text-ink">反常识提醒</h3>
            <p className="mt-2 max-w-[72ch] text-sm leading-6 text-ink-subtle">
              {counterIntuition.title}：{counterIntuition.summary}
            </p>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-ink">自测 2 题</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            {selfChecks.map((question) => (
              <li key={question} className="text-sm leading-6 text-ink-subtle">
                {question}
              </li>
            ))}
          </ol>
        </div>

        <div className="border border-rule bg-paper-3 px-4 py-4">
          <h3 className="text-sm font-semibold text-ink">下一步行动</h3>
          <p className="mt-2 text-sm leading-6 text-ink-subtle">{nextAction}</p>
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

        <div className="border-t border-rule pt-4">
          <p className="mb-3 font-mono text-[10px] leading-4 tracking-[0.04em] text-muted">
            本 Badge 由真实知乎回答摘录组成；这是摘要边界，不是完整正文。
          </p>
          <div className="flex flex-wrap gap-3">
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
      </div>
    </article>
  );
}
