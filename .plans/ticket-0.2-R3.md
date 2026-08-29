# Ticket 0.2-R3：query-cache 收尾（实现被我写坏过，你重写 + 修测试 + 双绿）

## 派发信息

- 执行者：agy CLI（编排方动态分配：fable 在此任务上连续两次未交付，改派 agy）
- 派发者：Grok（编排）
- 规格来源：`.plans/ticket-0.2-query-cache.md`（原始 7 点规格，全部有效）

## 编排方状态通报（重要）

`src/lib/query-cache.ts` 当前**编译不过**。编排方在重写时编造了不存在的 API，留下这一行垃圾代码（在 `getOrSet` 的 `case "start"` 分支）：

```ts
return Effect.zipRight(
  Effect.forkIn(Effect.makeFork(Effect.fork)) as never, // ← 不存在，必须删除
  runCompute.pipe(Effect.exit),
  Deferred.await(own),
);
```

方向是对的：已经做对的部份请保留（`getOrSet<E extends Error>` 泛型、单次 `Ref.modify` 合并 hit/join/register、`PendingOp` 的 `Deferred<V, Error>`、`CacheMiss<K>` 泛型化、`Effect.ensuring` 在成功与失败两路都清 pending）。只有 `case "start"` 的执行方式要重写。

`src/lib/query-cache.test.ts` 是 worker 留下的旧文件，有 4 处类型错误 + 死代码 + 错误的观察机制。

## 编排方已实测的 API 事实（effect 3.22.1，勿凭记忆）

在 `node_modules/effect/dist/dts/` 实测存在：

- `Deferred`: `make` / `await` / `succeed` / `fail` / `done` / `complete` / `completeWith` / `sync` / `poll` / `isDone` / `interrupt`
- `Effect`: `match` / `matchCause` / `matchCauseEffect` / `matchEffect` / `either` / `exit` / `fork` / `forkScoped` / `ensuring` / `yieldNow` / `catchAll`

**实测不存在**：`Effect.matchDeferred`（grep 无命中）。别用。

## 你要做的四件事

### 1. 重写 `case "start"`，去掉 fork

不要 fork。fork 出的 fiber 挂在父 scope 上，父 fiber 结束会打断它并可能吞掉 `ensuring` 的清理。改成 starter 内联跑 compute，结果通过 deferred 投递给可能在等的 waiter，然后自己直接拿结果：

推荐形态（用 `Deferred.done`，它把一个 Effect 的成功/失败一次性投递给 deferred）：

```
Effect.ensuring(
  Deferred.done(
    own,
    Effect.tap(compute(), (val) =>
      Ref.update(stateRef, (s) => writeVal(s, key, val, nowMs))),
  ),
  Ref.update(stateRef, (s) => clearPending(s, key)),
)
```

然后 starter 自己 `Deferred.await(own)` 拿值。`Deferred.done` 的确切参数顺序/柯里形式以 `vp check` 的真实类型报错为准；若 `done` 不合用，改用 `completeWith`。禁止用 `as never` / `as unknown` / `@ts-ignore` 绕过类型。

`case "join"` 保持 `Deferred.await`。那一行已有的 `as Deferred.Deferred<V, E | CacheMiss<K>>` 强转目前报 TS2352（类型重叠不足）。用 `Deferred<V, E>` 统一存起来（pending 里存 `Deferred<V, Error>` 时强转会被 TS 拒），或改成在 `Ref.modify` 里把该 deferred 直接以本调用的泛型返回，确保最终**一个 `as` 都不剩**。

### 2. 修测试文件的 4 处类型错误与死代码

实测报错（`vp check`）：

- `query-cache.test.ts:16` `syncCache` 声明但从未使用（死代码，内含多个 `any` 和伪 Effect 对象）→ **整段删除**，连带它独占的局部变量。注意 `advance` / `_now` 仍被 TTL 用例使用，只能删 `syncCache` 本体。
- `:23` `const effect = makeQueryCache(...)` 未使用 → 随死代码一并删除。
- `:115` `(): Effect<number> =>` → 应为 `Effect.Effect<number>`（`Effect` 是值不是类型）。
- `:149` 同样问题。

### 3. 修三个失败用例的观察机制（行为主张不得削弱）

Effect 3.x 通过 runtime 失败通道传递 typed error，**不会**抛成 JS 异常，所以 `try { await Effect.runPromise(...) } catch {}` + `toBeInstanceOf` 在任何正确实现下都过不了。换成 `Effect.runPromiseExit` + `Cause` 检查（或仓库已有 `@effect/vitest` 断言）。三个用例必须保留的主张：

- `returns CacheMiss for a key that is not yet set`：失败必须是 `CacheMiss`，且 `key === "k1"`。
- `getOrSet runs compute only once for concurrent same-key calls`：两个并发同 key 调用，`calls === 1`（计数器证明），两者都拿到 `99`。
- `getOrSet failure distributes error and does not cache`：两个并发同 key 调用都拿到同一个 `Error("boom")`，`calls === 1`；第三次调用重新 compute，`calls === 2`。

禁止删用例、禁止把 `toBe(1)` 放宽成 `toBeLessThanOrEqual`、禁止空断言。

顺带修掉 `expect((await Effect.runPromise(cache.get("b"))).valueOf()).toBe(2)` 这种对 number 做无意义 `.valueOf()` 的写法，直接断言返回值。

### 4. 双绿

`vp check` 必须两个 `pass:` 且 **0 error 0 warning**（warning 也算不过，CI 会红）；`vp test` 全绿且用例总数 >= 9，既有 `src/lib/app-info.test.ts` 仍通过。

## 硬性约束

- 只改 `src/lib/query-cache.ts` 与 `src/lib/query-cache.test.ts` 两个文件。
- 禁止 `unknown` / `any` / `as never` / `as unknown` / `@ts-ignore` / `@ts-expect-error`。类型适配靠泛型边界（如 `E extends Error`），不靠强转。
- 禁止新增依赖、禁止 `vp install`、禁止改 `package.json` / lockfile / `vite.config.ts` / `src/routes/`。
- 禁止任何 `git` 命令（连 `git status` 都不要跑），禁止改 `.plans/` 下任何文件。
- 禁止 `Date.now` / `setTimeout` / `setInterval`，时间走注入 `now`。（测试里用 `setTimeout` 做调度也禁止；用 `Effect.yieldNow` 或直接依赖 `Ref.modify` 的原子性。）

## 完成定义（编排方逐条复验）

1. `vp check` 两个 `pass:`，0 error 0 warning。
2. `vp test` 全绿，>= 9 用例，三个原失败用例名列通过。
3. `rg -n "\bas \b|\bunknown\b|\bany\b|@ts-" src/lib/query-cache.ts src/lib/query-cache.test.ts` 输出为空（注释里提到这些词的也改写，保证 grep 干净）。
4. `rg -n "Date.now|setTimeout|setInterval" src/lib/query-cache.ts src/lib/query-cache.test.ts` 输出为空。

## 汇报格式

按顺序给出：`vp check` 最终输出行、`vp test` 最终输出行、两条 grep 结果、`Deferred.done` 实际签名是什么、每个原失败用例的根因一句话、是否动过任何行为主张（动了逐条说明理由）。
