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
    threadId: "7717a55363d44765",
    label: "REACT RSC",
    title: "React Server Components 的核心机制是什么？",
    description:
      "从 RSC 渲染完备性和序列化模型，到 Pages Router 到 App Router 的架构变迁，用 3 条真实知乎回答串起 RSC 的完整演进路径。",
    yearRange: "2023—2026",
    stageCount: 3,
    nodeCount: 7,
    takeaways: [
      "组件级数据获取替代页面级数据获取的边界在哪里。",
      "序列化模型如何决定 Server / Client 组件的分界。",
      "RSC 与传统 SSR 在 SEO 和首屏加载上的真实差异。",
    ],
  },
  {
    threadId: "376d90bd70194b24",
    label: "DATABASE INDEX",
    title: "数据库索引失效的常见场景有哪些？",
    description:
      "从函数包裹、隐式类型转换、LIKE 前导通配符到成本优化器主动放弃，用 2 条真实知乎回答拆解索引失效的根因和排查方法。",
    yearRange: "2025—2026",
    stageCount: 2,
    nodeCount: 6,
    takeaways: [
      "B+ 树有序性被破坏和优化器成本评估是两大根因。",
      "函数索引和跳跃扫描在 InnoDB 中的实现差异。",
      "如何通过 EXPLAIN 快速定位索引失效的具体原因。",
    ],
  },
  {
    threadId: "3beed55578484f1b",
    label: "ALGORITHM",
    title: "算法时间复杂度到底怎么理解？",
    description:
      "从 2025 年知乎上最详细的复杂度教程出发，理解大 O 的严格数学定义和行业通用惯例之间的差异。",
    yearRange: "2025—2025",
    stageCount: 2,
    nodeCount: 7,
    takeaways: [
      "大 O 的严格数学定义和行业口诀不完全一致。",
      "递归树和主定理是推导递归复杂度的两个工具。",
      "复杂度选型要综合考虑常数因子和硬件特性。",
    ],
  },
];
