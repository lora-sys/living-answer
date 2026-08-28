# Ticket 0.2-R2：query-cache 收尾（实现已重写，你负责测试改造 + matchDeferred 精化 + 双绿）

## 派发信息

- 执行者：Claude Code `fable`
- 派发者：Grok（编排）
- 前置：`.plans/ticket-0.2-query-cache.md`（原始 7 点规格，全部有效）、`.plans/ticket-0.2-R-fix.md`（上一轮修复单）

## 编排方状态通报（不要重做已完成部分）

`src/lib/query-cache.ts` 已由编排方重写完毕：`getOrSet<E extends Error>` 已带错误泛型、所有 `as Effect.Effect<...>` 强转和 `unknown` 联合已删除、hit/join/pending 注册已合并进单次 `Ref.modify`（消除并发双方都走 start 的竞态）、`PendingOp` 的 Deferred 类型为 `Deferred<V, Error>`、`CacheMiss` 改为泛型 `CacheMiss<K>`。

你的工作不是重写实现，而是下面四项。

## 任务 1：starter 路径去掉 fork，改用 `Effect.matchDeferred`

当前 `case "start"` 用 `Effect.fork(runCompute)` + `Deferred.await`。这有两个隐患：fork 出的 fiber 挂在父 fiber scope 上，父 fiber 结束时会打断它，可能吞掉 `ensuring` 里的 `clearPending`；starter 还要额外 await 一次。

改成 starter 直接内联执行 compute，用 `Effect.matchDeferred` 把结果（成功/失败/中断）一次性投递给 deferred：

```
Effect.ensuring(
  Effect.matchDeferred(own, Effect.flatMap(compute(), (val) =>
    Effect.zipRight(Ref.update(stateRef, (s) => writeVal(s, key, val, nowMs)), Effect.succeed(val)))),
  Ref.update(stateRef, (s) => clearPending(s, key)),
)
```

`join` 路径保持不变（waiter 继续 `Deferred.await`）。

注意：`Effect.matchDeferred` 的参数顺序请以 `vp check` 的类型报错为准自行确认，不要凭记忆写。若该 API 在本仓库 Effect 版本不存在，停止并汇报，不要自行发明替代品。

## 任务 2：改造三个失败用例的观察机制（行为断言不得削弱）

Effect 3.x 通过 runtime 失败通道传递 typed error，不会把它抛成 JS 异常，所以 `try { await Effect.runPromise(...) } catch {}` + `toBeInstanceOf` 这种观察机制在任何正确实现下都无法通过。把观察机制换成 `Effect.runPromiseExit` + `Cause` 检查（或仓库已有的 `@effect/vitest` 断言）。三个用例要保留的行为主张分别是：

- `returns CacheMiss for a key that is not yet set`：失败原因必须是 `CacheMiss`，且 `key` 字段为 `"k1"`。
- `getOrSet runs compute only once for concurrent same-key calls`：两个并发同 key 调用，compute 只执行一次（用计数器证明），两个调用都拿到同一个值 `99`。
- `getOrSet failure distributes error and does not cache`：两个并发同 key 调用都拿到同一个 `Error("boom")`；`calls` 为 1；第三次调用重新 compute，`calls` 变 2。

禁止删除用例、禁止把 `toBe(1)` 改成 `toBeLessThanOrEqual`、禁止用 `expect(true).toBe(true)` 之类的空断言替换。

## 任务 3：删除测试文件里的死代码

文件顶部 `syncCache` 辅助函数（约 15-34 行）是死代码：创建了 `cache = {} as any` 却从未被任何用例调用，且带多个 `any`，必然触发 lint。整段删除，连带它引用的 `_now` 相关死变量。注意 `_now` / `advance` 仍被 TTL 用例使用，只能删 `syncCache` 本体。

顺带修正 `stats()` 返回值的读取方式：现有 `expect((await Effect.runPromise(cache.get("b"))).valueOf()).toBe(2)` 这种 `.valueOf()` 是对 number 做无意义转换，直接断言返回值即可。

## 任务 4：双绿

`vp check` 必须输出两个 `pass:` 且 0 error 0 warning（warning 也算不过，CI 会红）；`vp test` 必须全绿且用例总数不少于 9，既有 `src/lib/app-info.test.ts` 仍通过。

## 硬性约束

- 只改 `src/lib/query-cache.ts` 与 `src/lib/query-cache.test.ts`。
- 禁止 `unknown` / `any` / `as never` / `@ts-ignore` / `@ts-expect-error`。类型适配优先靠泛型边界（例如 `E extends Error`），而非强转。
- 禁止新增依赖、禁止 `vp install`、禁止改 `package.json` / lockfile / `vite.config.ts`。
- 禁止任何 git 命令（连 `git status` 都不要跑），禁止改 `.plans/` 下任何文件。
- 禁止 `Date.now` / `setTimeout` / `setInterval`，时间走注入 `now`。

## 完成定义（编排方逐条复验）

1. `vp check` 两个 `pass:`，0 error 0 warning。
2. `vp test` 全绿，>= 9 用例，三个原失败用例名列通过。
3. `rg -n "\bunknown\b|\bany\b|@ts-ignore" src/lib/query-cache.ts src/lib/query-cache.test.ts` 无命中（注释里提及该词的也请改写，保证 grep 干净）。

## 汇报格式

按顺序给出：`vp check` 最终输出行、`vp test` 最终输出行、任务 3 的 grep 结果、`Effect.matchDeferred` 实际签名是什么、每个原失败用例的根因一句话、是否动过任何行为主张（动了必须逐条说明理由）。
