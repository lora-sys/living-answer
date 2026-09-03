# Living Answer

输入一个模糊问题，AI 澄清学习意图，从真实知乎回答中选取摘录，组织成可追问、可自测、可收藏的学习线程。

## 技术栈

- [TanStack Start](https://tanstack.com/start) — SSR 全栈框架
- [TanStack Router](https://tanstack.com/router) — TypeScript 路由器
- [Tailwind CSS 4](https://tailwindcss.com/) — 样式
- [Effect TS](https://effect.website/) — 效果系统
- [Vite+](https://vitest.dev/) — 测试框架
- SQLite (better-sqlite3) — 持久化

## 快速开始

```bash
pnpm install
pnpm dev
```

打开 dev server 输出的地址即可使用。不要假设固定端口。

## 项目结构

```
src/
  routes/        — 基于 TanStack Router 的文件式路由
    index.tsx    — 问题学习线程入口
    thread/
      $threadId.tsx — 线程阅读器
  server/        — 服务端函数
    clarify-question.ts    — 澄清模糊问题
    generate-thread-artifact.ts — 生成并持久化线程
    read-thread-artifact.ts — 读取线程
    search-answer-candidates.ts — 搜索候选
    rank-answer-candidates.ts — AI 候选解释
    ask-thread-agent.ts — 线程内学习追问
  lib/           — 纯域层和工具
    thread-artifact.ts    — 线程域记录和工厂
    thread-artifact-store.ts — SQLite 存储
    thread-clarification.ts — 澄清工作流
    thread-synthesis.ts   — 合成工作流
    thread-study-agent.ts — grounded study agent
    answer-candidate-ranker.ts — 候选解释工作流
    thread-collection.ts — 本地收藏与导出
    featured-threads.ts — 首页精选真实学习线程
    app-info.ts      — 产品信息
  components/    — 可复用 UI
  lib/           — 纯域模型、存储、工具
```

## 开发

```bash
pnpm check      # 类型检查
pnpm test       # 运行测试
pnpm build      # 生产构建
```

## 核心流程

1. **输入**：用户在 `/` 输入模糊问题
2. **澄清**：系统精炼查询，提供备选词和学习意图
3. **搜索**：在知乎搜索候选回答，每条提供摘录预览
4. **候选解释**：AI 为候选回答标注可能的学习角色，但选择权仍在用户
5. **选择**：用户手动勾选要引用的回答
6. **生成**：系统基于选中的摘录合成记忆廊桥和学习线程
7. **阅读**：在 `/thread/$threadId` 查看 Study Badge、记忆廊桥、学习节点和来源
8. **追问**：Study Agent 基于当前线程回答；模型失败或对时间线、分歧、边界类结构问题不覆盖时，给出确定性证据摘要
9. **沉淀**：加入“我的学习空间”，或导出 Markdown / JSON

## 学习闭环

产品围绕七个状态组织：问题、证据、理解、追问、成果、沉淀、再学习。
生成流程在模型不可用或学习指南校验失败时，会使用确定性证据学习线，
保留已验证摘录和学习节点，不伪造 AI 解释。Agent 离线摘要只使用当前
artifact 中已有的学习节点和开放问题，补充搜索始终回到原始学习意图。

## 搜索边界

搜索结果过少时，产品会显式说明单一来源无法构成共识、分歧或时间对照，
并提供换词和备选查询路径。AI 只解释候选并给出推荐组合，不替用户选择。
Study Agent 建议补充来源时，会回到首页并重新澄清原始学习主题。

## 评测

`src/evals/` 包含 264 条冻结黄金题、真实工作流 harness、trace、四层评分和版本对比。
普通 `vp test` 只做数据集完整性校验；真实评测使用 `pnpm eval` 并受 `EVAL_LIMIT`
控制。当前首批对抗安全题已全通过，基线保存在 `src/evals/baselines/`。

## 许可证

MIT
