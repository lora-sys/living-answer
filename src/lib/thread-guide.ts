import type {
  LearningGuide,
  LearningGuideRole,
  LearningNode,
  TimelineStage,
} from "./thread-artifact";

const NODE_KIND_TO_ROLE: Record<LearningNode["kind"], LearningGuideRole> = {
  relationship: "baseline",
  cause: "baseline",
  consensus: "baseline",
  evolution: "extension",
  divergence: "counterpoint",
  changed_premise: "correction",
  unknown: "unclear",
};

const NODE_KIND_LABELS: Record<LearningNode["kind"], string> = {
  relationship: "关系",
  cause: "因果",
  evolution: "演变",
  consensus: "共识",
  divergence: "分歧",
  changed_premise: "前提变化",
  unknown: "待确认",
};

const nodesByAnswer = (nodes: readonly LearningNode[]): Map<string, LearningNode[]> => {
  const grouped = new Map<string, LearningNode[]>();
  for (const node of nodes) {
    const current = grouped.get(node.sourceAnswerId) ?? [];
    current.push(node);
    grouped.set(node.sourceAnswerId, current);
  }
  return grouped;
};

const primaryNode = (nodes: readonly LearningNode[]): LearningNode | undefined =>
  nodes.find((node) => node.kind !== "unknown") ?? nodes[0];

const primaryRefs = (stage: TimelineStage, nodes: readonly LearningNode[]) => {
  const refs =
    primaryNode(nodes)?.evidenceRefs.filter((ref) => stage.excerpt.excerpt.includes(ref.quote)) ??
    [];
  if (refs.length > 0) return refs;
  return [
    {
      excerptFingerprint: stage.excerpt.fingerprint,
      quote: stage.excerpt.excerpt.slice(0, Math.min(120, stage.excerpt.excerpt.length)),
    },
  ];
};

export const buildDeterministicLearningGuide = (
  question: string,
  timelineStages: readonly TimelineStage[],
  learningNodes: readonly LearningNode[],
): LearningGuide => {
  const grouped = nodesByAnswer(learningNodes);
  const kindLabels = new Set(learningNodes.map((node) => NODE_KIND_LABELS[node.kind] ?? "证据"));

  const stages = timelineStages.map((stage, index) => {
    const nodes = grouped.get(stage.answerId) ?? [];
    const node = primaryNode(nodes);
    const role = node ? NODE_KIND_TO_ROLE[node.kind] : "unclear";
    const explanation = node
      ? `${NODE_KIND_LABELS[node.kind]}证据：${node.summary}`
      : "这段摘录已作为学习来源保留；当前没有可确认的学习解释。";

    return {
      answerId: stage.answerId,
      role,
      explanation,
      transition:
        index === 0
          ? "先理解这一段的证据，再用后面的来源对照和修正它。"
          : `对照上一个来源，重点检查这里的${node ? NODE_KIND_LABELS[node.kind] : "证据"}。`,
      evidenceRefs: (() => {
        const refs = (node?.evidenceRefs ?? []).filter((ref) =>
          stage.excerpt.excerpt.includes(ref.quote),
        );
        return refs.length > 0
          ? refs
          : [
              {
                excerptFingerprint: stage.excerpt.fingerprint,
                quote: stage.excerpt.excerpt.slice(0, Math.min(120, stage.excerpt.excerpt.length)),
              },
            ];
      })(),
    };
  });

  const controversialNode = learningNodes.find(
    (node) => node.kind === "changed_premise" || node.kind === "divergence",
  );
  const openQuestions = [
    controversialNode
      ? `“${controversialNode.title}”在什么条件下仍然成立？`
      : "这个结论在哪些真实场景下会不成立？",
    "下一步可以用哪个真实例子验证这条学习线？",
  ];

  return {
    overview: {
      headline: question.length <= 32 ? `${question}：证据学习线` : "从真实摘录组织的学习线",
      summary: `当前学习线由 ${timelineStages.length} 条真实摘录和 ${learningNodes.length} 个学习节点组成，覆盖${Array.from(kindLabels).join("、")}。它保留可回指的证据，不把摘录当作完整回答。`,
      evidenceRefs: timelineStages.flatMap((stage) =>
        primaryRefs(stage, grouped.get(stage.answerId) ?? []).map((ref) => ({
          excerptFingerprint: ref.excerptFingerprint,
          quote: ref.quote,
        })),
      ),
    },
    stages,
    openQuestions,
  };
};
