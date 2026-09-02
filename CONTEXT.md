# Living Answer — 项目上下文

## 产品本体

Living Answer 是一个问题学习线程生成器。用户输入模糊问题 → 系统澄清学习意图 →
搜索知乎回答 → 用户选取摘录 → AI 合成结构化学习线程 → 持久化到 SQLite →
在 `/thread/$threadId` 查看。

核心价值：同一知识点在知乎上有不同年份、不同视角的真实回答。Living Answer
把它们整理成可追溯的学习线程，让用户理解定义、因果、演变和分歧，而不是只看到
一个孤立答案。

## 当前功能

- [x] 模糊问题澄清
- [x] 知乎回答搜索（候选 + 摘录）
- [x] 手动选取摘录
- [x] AI 合成学习节点（关系/因果/演变/共识/分歧）
- [x] 持久化的学习线程
- [x] 线程阅读器（时间线 + 学习节点 + 来源模态框）
- [x] 首页和 landing 展示三条真实学习线程

## 环境变量

以下变量必须设置在 `.env` 中（本地未提供时 CI 会设置）：

| 变量                  | 用途                                                 |
| --------------------- | ---------------------------------------------------- |
| `ZHIHU_ACCESS_SECRET` | Zhihu API 访问密钥 |
| `OPENAI_BASE_URL`     | 兼容 OpenAI 的模型服务地址 |
| `OPENAI_API_KEY`      | 模型服务密钥 |
| `OPENAI_MODEL`        | 兼容 OpenAI 的模型名称 |

## 数据流

```
用户输入 → clarifyQuestionFn → refinedQuery + learningIntent
       ↓
searchAnswerCandidates → AnswerCandidate[] (含 excerptFingerprint)
       ↓
用户选择 → generateThreadArtifactFn → LearningNode[] + TimelineStage[]
       ↓
SQLite → 持久化 → threadId
       ↓
/thread/$threadId
```

## 依赖关系

- `better-sqlite3` 通过动态 `require` 导入（SSR 兼容）
- Zhihu API 通过自定义 `fetch` 适配器调用（POST /v1/chat/completions）
- Effect TS 用于组合服务端效果，所有结果序列化为 JSON 安全类型
- Vite+ 测试框架，测试文件与源文件同目录

## 链接

- [Ticket 56 计划](.plans/ticket-56-question-learning-thread.md)
- [实体设计](.plans/01-answer-ingestion.md)
- [Spike 笔记](.plans/spike-01-viteplus-test-setup.md)
