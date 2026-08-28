# Ticket 0.2-R：修复 query-cache 的 lint 错误与失败测试

## 派发信息

- 执行者：Claude Code `fable`
- 派发者：Grok（编排）
- 前置：上一轮 worker 因 API 错误中断，留下半成品。原始规格见 `.plans/ticket-0.2-query-cache.md`，仍然全部有效。

## 当前实际状态（编排方已复核）

- `src/lib/query-cache.ts` 和 `src/lib/query-cache.test.ts` 已存在。
- `vp check`：**4 errors + 12 warnings**。4 个 error 全部是 `typescript(no-redundant-type-constituents)`，出现在 `query-cache.ts` 约 229/247/248/251/253 行，模式都是 `CacheMiss | unknown` 这种联合——`unknown` 吸收了整个联合类型，说明 `getOrSet` 的错误类型泛型 `E` 丢失了，被降级成 `unknown`，并用 `as` 强转绕过类型检查。
- `vp test`：**3 failed / 6 passed**。至少一处失败在 `query-cache.test.ts:170`（`expect(calls).toBe(1)` 实际为 0，即 compute 一次都没执行——single-flight 的失败路径逻辑有误）。

## 你要做的

1. 先完整跑 `vp check` 和 `vp test`，拿到全部 4 个 error 与 3 个失败用例的原文，再动手。
2. **删除所有 `as Effect.Effect<..., unknown>` 之类的强制类型转换**。正确做法是让 `getOrSet` 自己带上错误类型泛型 `E`（`<E>(key: K, compute: () => Effect.Effect<V, E>) => Effect.Effect<V, E | CacheMiss>`），内部用 Deferred 传递 `Either` 或直接 `Deferred<V, E>`，让类型自然流通。禁止用 `unknown`、`any`、`as never` 或 `@ts-ignore` 绕过。
3. 修好 3 个失败测试所暴露的真实实现缺陷。**不许改测试断言来迁就实现**；若你判断某条断言本身写错了，停止并在汇报里说明理由，等编排方裁定。
4. 修完后 `vp check` 与 `vp test` 必须双绿（含 12 个 warning 一并清零，warning 也属于 CI 门槛）。

## 硬性约束

- 只改 `src/lib/query-cache.ts` 与 `src/lib/query-cache.test.ts`。
- 禁止新增依赖、禁止 `vp install`、禁止改 `package.json` / lockfile / `vite.config.ts`。
- 禁止任何 git 命令。
- 禁止 `Date.now` / `setTimeout` / `setInterval`，时间走注入时钟。
- 禁止修改 `.plans/` 下任何文件。

## 完成定义（编排方逐条复验）

1. `vp check` 输出 `pass`，0 error 0 warning。
2. `vp test` 全绿，用例总数不少于 9，且既有 `app-info.test.ts` 仍通过。
3. 文件内 grep 不到 `as Effect.Effect`、`unknown`、`any`、`@ts-ignore`。
4. `.plans/ticket-0.2-query-cache.md` 的规格 1-7 仍全部成立。

## 汇报格式

给出：`vp check` 与 `vp test` 最终输出行、grep 自检结果、每个原失败用例的根因一句话、是否动过测试断言（动了必须逐条说明理由）。
