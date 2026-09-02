import type { QuestionLearningThread } from "./thread-artifact";

export const COLLECTED_THREADS_STORAGE_KEY = "living-answer.collectedThreads";

export interface TextStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

export const readCollectedThreads = (storage: TextStorage): readonly string[] => {
  try {
    const raw = storage.getItem(COLLECTED_THREADS_STORAGE_KEY);
    if (raw === null || raw.trim() === "") return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const values = parsed.filter(
      (value): value is string => typeof value === "string" && /^[0-9a-f]{16}$/.test(value),
    );
    return Array.from(new Set(values));
  } catch {
    return [];
  }
};

export const saveCollectedThread = (threadId: string, storage: TextStorage): readonly string[] => {
  if (!/^[0-9a-f]{16}$/.test(threadId)) {
    return readCollectedThreads(storage);
  }
  const current = readCollectedThreads(storage);
  const next = Array.from(new Set([threadId, ...current]));
  try {
    storage.setItem(COLLECTED_THREADS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    return current;
  }
  return next;
};

export const removeCollectedThread = (
  threadId: string,
  storage: TextStorage,
): readonly string[] => {
  const current = readCollectedThreads(storage);
  if (!current.includes(threadId)) return current;
  const next = current.filter((value) => value !== threadId);
  try {
    if (next.length === 0) {
      storage.removeItem(COLLECTED_THREADS_STORAGE_KEY);
    } else {
      storage.setItem(COLLECTED_THREADS_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    return current;
  }
  return next;
};

const quoteText = (value: string): string => `> ${value.replace(/\n/g, "\n> ")}`;

export const buildThreadMarkdown = (artifact: QuestionLearningThread): string => {
  const stageMap = new Map(artifact.timelineStages.map((stage) => [stage.answerId, stage]));
  const guideStageMap = new Map(
    artifact.learningGuide.stages.map((stage) => [stage.answerId, stage]),
  );

  const lines: string[] = [
    `# ${artifact.question}`,
    "",
    `学习意图：${artifact.refinedQuery}`,
    "",
    `- 线程 ID：\`${artifact.threadId}\``,
    `- 创建时间：${new Date(artifact.createdAt).toISOString()}`,
    `- 不确定性：${artifact.uncertainty.toFixed(2)}`,
    `- 边界：${artifact.timelineStages[0]?.excerptBoundaryNote ?? "这是摘录，不是完整回答"}`,
    "",
    "## AI 学习桥",
    "",
    `**${artifact.learningGuide.overview.headline}**`,
    "",
    artifact.learningGuide.overview.summary,
  ];

  for (const ref of artifact.learningGuide.overview.evidenceRefs) {
    const stage = stageMap.get(
      artifact.timelineStages.find((stage) => stage.excerpt.fingerprint === ref.excerptFingerprint)
        ?.answerId ?? "",
    );
    if (!stage) continue;
    lines.push(
      "",
      `- 来源：[${stage.title}](${stage.canonicalUrl}) — ${stage.authorDisplayName}`,
      quoteText(ref.quote),
    );
  }

  lines.push("", "## 学习桥阶段", "");
  for (const stage of artifact.timelineStages) {
    const guideStage = guideStageMap.get(stage.answerId);
    const role =
      guideStage?.role === "baseline"
        ? "基础认知"
        : guideStage?.role === "correction"
          ? "边界修正"
          : guideStage?.role === "extension"
            ? "深化扩展"
            : guideStage?.role === "counterpoint"
              ? "不同视角"
              : guideStage?.role === "current_usage"
                ? "当前用法"
                : "待确认";
    lines.push(
      `### ${role}：${stage.title}`,
      "",
      `- 作者：${stage.authorDisplayName}`,
      `- 时间：${new Date(stage.editTime * 1000).toISOString()}`,
      `- 原文：${stage.canonicalUrl}`,
      "",
      guideStage?.explanation ?? stage.excerptBoundaryNote,
    );
    if (guideStage?.transition) {
      lines.push("", `衔接：${guideStage.transition}`);
    }
    for (const ref of guideStage?.evidenceRefs ?? []) {
      lines.push("", quoteText(ref.quote));
    }
    lines.push("");
  }

  lines.push("## 学习节点", "");
  for (const node of artifact.learningNodes) {
    const roleLabel = node.kind;
    lines.push(`### ${roleLabel}：${node.title}`, "", node.summary, "");
    for (const ref of node.evidenceRefs) {
      lines.push(quoteText(ref.quote), "");
    }
  }

  lines.push("## 继续追问", "");
  for (const question of artifact.learningGuide.openQuestions) {
    lines.push(`- ${question}`);
  }
  lines.push("", "## 来源摘录", "");
  for (const stage of artifact.timelineStages) {
    lines.push(
      `### ${stage.title}`,
      "",
      `${stage.authorDisplayName} · ${stage.excerptBoundaryNote}`,
      "",
      quoteText(stage.excerpt.excerpt),
      "",
      `[知乎原文](${stage.canonicalUrl})`,
      "",
    );
  }

  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
};
