# Ticket 0.2：查询缓存核心（Effect + Schema，纯离线）

## 派发信息

- 执行者：Claude Code `fable`
- 派发者：Grok（编排）
- 日期：2026-08-28
- 依赖：无。不依赖 Spike 01 结论，不碰知乎 API。

## 背景（一句话）

比赛硬约束要求"同一搜索 Query 短时间内不得重复打官方 API"，且额度是账号共享池。缓存是架构级约束，现在先把与 ingestion 决策无关的纯缓存核心做出来。

## 目标

在 `src/lib/query-cache.ts` 实现一个泛型查询缓存模块，配套单元测试 `src/lib/query-cache.test.ts`。仅此两个新文件，不改任何既有文件。

## 功能规格

```ts
// 期望的公开接口形状（可以微调命名，但语义不得偏离）
export declare const makeQueryCache: <K, V>(options: {
  readonly ttl: Duration.Input;          // Effect Duration
  readonly now?: () => Effect.Effect<Instant.Instant>; // 可注入时钟，默认 Clock
  readonly maxEntries?: number;          // 默认 256；超出按插入序逐出最旧
}) => Effect.Effect<QueryCache<K, V>>;

export interface QueryCache<K, V> {
  readonly get: (key: K) => Effect.Effect<V, CacheMiss>;       // 过期视为 miss 并删除
  readonly set: (key: K, value: V) => Effect.Effect<void>;
  readonly getOrSet: (key: K, compute: () => Effect.Effect<V, E>) => Effect.Effect<V, E | CacheMiss>;
  readonly invalidate: (key: K) => Effect.Effect<void>;
  readonly stats: Effect.Effect<CacheStats>; // { hits, misses, entries } 只读快照
}
```

要求逐条满足：

1. Key 用 `Effect` 的 `Equal`/`Hash` 语义做键等值（泛型约束 `K: Schema AST 或 Equal+Hash`，实现从简，文档注释说明选择）。
2. `getOrSet` 对同一 key 的并发调用必须只执行一次 `compute`（single-flight）；等待方共享同一结果，包括失败共享。
3. 过期条目在任何读取路径上表现为 miss，并被顺手删除。
4. `CacheMiss` 是 `Data.TaggedError`，类型名 `"CacheMiss"`。
5. 全部状态封装在模块内部（Ref），不导出可变结构。
6. 不使用 `Date.now`、`setTimeout`、`setInterval`；时间一律走注入时钟。
7. `stats` 只读，不产生副作用。

## 测试规格（`src/lib/query-cache.test.ts`）

用 `@effect/vitest` + `TestClock`（TestClock 自带虚拟时间推进），至少覆盖：

- miss → set → hit 基本闭环
- TTL 过期后 `get` 返回 CacheMiss，`stats.entries` 减一
- `getOrSet`：两个并发 fiber 同 key，compute 只执行一次（用计数器证明）
- `getOrSet` compute 失败：两个等待方都收到同一错误，且失败不缓存（第三次调用重新 compute）
- `maxEntries` 满时最旧条目被逐出，后续 get 它返回 miss
- `invalidate` 后 get miss
- `stats.hits/misses` 计数与操作序列一致

## 项目规则（必须遵守）

- 遵守仓库 `AGENTS.md` 全部条款，特别是：Effect 用于 typed failures / 重试 / 并发边界；不新增空目录；不把实现细节泄漏到接口外。
- 依赖只允许已有的 `effect`、`@effect/vitest`、`vitest`（见 package.json / vite.config.ts 的 test 配置 `include: ["src/**/*.test.ts"]`）。禁止新增任何依赖。
- 命令入口只用 `vp check`、`vp test`。禁止 `vp install`、禁止改 lockfile。
- 禁止任何 `git` 命令（编排方负责提交）。
- 只新建上述两个文件；不改 `src/routes/*`、`vite.config.ts`、`package.json`、`.gitignore`、`.plans/*`。
- 不写知乎 API 调用、不定义 AnswerSnapshot、不做持久化。那是后续 ticket。

## 完成定义（编排方将逐条复验）

1. `vp check` 输出 `pass` 两次（格式 + lint/type），无 warning。
2. `vp test` 全绿，包含本 ticket 新增的全部用例，且既有 `app-info.test.ts` 仍通过。
3. `git status --short`（由编排方运行）只显示 `src/lib/query-cache.ts` 与 `src/lib/query-cache.test.ts` 两个新增未跟踪文件。
4. 代码中 grep 不到 `Date.now`、`setTimeout`、`setInterval`、`process.env`。

## 交付汇报格式

最终回复给出：两文件行数、`vp check` / `vp test` 关键输出行、规格 1-7 的逐条自评（做到/偏差+原因）、测试清单与用例名。
