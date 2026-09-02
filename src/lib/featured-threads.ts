export interface FeaturedThreadSummary {
  readonly threadId: string;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly yearRange: string;
  readonly stageCount: number;
  readonly nodeCount: number;
  readonly takeaways: readonly string[];
}

export const FEATURED_THREADS: readonly FeaturedThreadSummary[] = [
  {
    threadId: "cb07a763224b4119",
    label: "ALGORITHM",
    title: "如何真正理解算法时间复杂度？",
    description:
      "从 2018 年的工程直觉，到 2025 年的真实项目取舍，再到渐进分析与学习误区，把一个大O概念串成完整理解路径。",
    yearRange: "2018—2026",
    stageCount: 4,
    nodeCount: 4,
    takeaways: [
      "核心：大 O 关注增长趋势，不是精确耗时。",
      "分歧：相同复杂度的实际速度可能差距很大。",
      "追问：为什么算法选择不能只看大 O？",
    ],
  },
  {
    threadId: "b6dc2142b5a4420d",
    label: "CSS LAYOUT",
    title: "Flexbox 和 Grid 应该怎么选？",
    description:
      "把一维与二维布局的边界、典型使用场景和发展趋势放回真实回答里比较，避免只记住一句话口诀。",
    yearRange: "2022—2024",
    stageCount: 3,
    nodeCount: 7,
    takeaways: [
      "基础：Flex 适合一维，Grid 适合二维。",
      "深化：真实页面常把两者组合使用。",
      "追问：哪些场景 Grid 反而更麻烦？",
    ],
  },
  {
    threadId: "a8959e9f4fe2409c",
    label: "REACT RSC",
    title: "React Server Components 为什么重要？",
    description: "从服务器资源的利用动机，到序列化模型与客户端组件边界，理解 RSC 解决的真正问题。",
    yearRange: "2023—2024",
    stageCount: 2,
    nodeCount: 2,
    takeaways: [
      "动机：减少客户端资源消耗。",
      "边界：序列化模型决定组件边界。",
      "追问：什么场景还适合客户端组件？",
    ],
  },
];
