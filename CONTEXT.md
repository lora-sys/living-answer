# Living Answer — 项目上下文

## 产品本体

Living Answer 是一个问题学习线程生成器。用户在唯一主入口输入模糊问题 →
系统澄清学习意图 → 搜索知乎回答 → AI 解释候选、用户选取摘录 → AI 合成记忆廊桥 →
持久化到 SQLite → 在 `/thread/$threadId` 阅读、追问和收藏导出。

核心价值：同一知识点在知乎上有不同年份、不同视角的真实回答。Living Answer
把它们整理成可追溯的学习线程，让用户理解定义、因果、演变和分歧，而不是只看到
一个孤立答案。

## 当前功能

- [x] 模糊问题澄清
- [x] 知乎回答搜索（候选 + 摘录）
- [x] AI Candidate Map 解释候选作用，用户仍手动选择
- [x] 手动选取摘录
- [x] AI 合成记忆廊桥和学习节点（关系/因果/演变/共识/分歧）
- [x] 持久化的学习线程与学习指南
- [x] 线程阅读器（学习桥 + 学习节点 + 来源模态框）
- [x] Thread Study Agent（有依据 / 证据不足，提供下一步动作）
- [x] 首页和 landing 展示三条真实学习线程
- [x] 本地收藏与 Markdown / JSON 导出

## 环境变量

以下变量必须设置在 `.env` 中（本地未提供时 CI 会设置）：

| 变量                  | 用途                       |
| --------------------- | -------------------------- |
| `ZHIHU_ACCESS_SECRET` | Zhihu API 访问密钥         |
| `OPENAI_BASE_URL`     | 兼容 OpenAI 的模型服务地址 |
| `OPENAI_API_KEY`      | 模型服务密钥               |
| `OPENAI_MODEL`        | 兼容 OpenAI 的模型名称     |

## 数据流

```
用户输入 → clarifyQuestionFn → refinedQuery + learningIntent
       ↓
searchAnswerCandidates → AnswerCandidate[] (含 excerptFingerprint)
       ↓
rankAnswerCandidatesFn → CandidateRankingAnalysis（解释候选，不代选）
       ↓
用户选择 → generateThreadArtifactFn → LearningNode[] + TimelineStage[]
       ↓
SQLite → 持久化 → threadId
       ↓
/thread/$threadId → askThreadAgentFn / thread-collection
```

## 依赖关系

- `better-sqlite3` 通过动态 `require` 导入（SSR 兼容）
- Zhihu 搜索通过官方 `zhihu_search` 接口获取摘要级 `Data.Items`
- 模型调用通过兼容 OpenAI 的 `/chat/completions` 适配器
- Effect TS 用于组合服务端效果，所有结果序列化为 JSON 安全类型
- Vite+ 测试框架，测试文件与源文件同目录

## 链接

- [Roadmap](https://github.com/lora-sys/living-answer/issues/51)
