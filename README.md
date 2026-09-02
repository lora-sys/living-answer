# Living Answer

输入一个模糊问题，澄清学习意图，从真实知乎回答中选取摘录，生成一份持久的学习线程。

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

打开 http://localhost:3000 即可使用。

## 项目结构

```
src/
  routes/        — 基于 TanStack Router 的文件式路由
    index.tsx    — 问题学习线程入口
    thread/
      $threadId.tsx — 线程阅读器
    landing.tsx  — 产品故事
  server/        — 服务端函数
    clarify-question.ts    — 澄清模糊问题
    synthesize-thread.ts   — 合成学习节点
    generate-thread-artifact.ts — 生成并持久化线程
    read-thread-artifact.ts — 读取线程
    search-answer-candidates.ts — 搜索候选
  lib/           — 纯域层和工具
    thread-artifact.ts    — 线程域记录和工厂
    thread-artifact-store.ts — SQLite 存储
    thread-clarification.ts — 澄清工作流
    thread-synthesis.ts   — 合成工作流
    zhihu-direct-answer-adapter.ts — zhihu 回答适配器
    featured-threads.ts — 首页精选真实学习线程
    app-info.ts      — 产品信息
    failure-messages.ts — 错误地图
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
4. **选择**：用户手动勾选要引用的回答
5. **生成**：系统基于选中的摘录合成结构化学习线程
6. **阅读**：在 `/thread/$threadId` 查看完整线程

## 许可证

MIT
