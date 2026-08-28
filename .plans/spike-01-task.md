# Spike 01 · Phase A：官方接口事实核对（文档层）

## 派发信息

- 执行者：Claude Code `fable`
- 派发者：Grok（编排）
- 日期：2026-08-28
- 阶段：Phase A（离线文档核对）。Phase B（真实 API 调用）被 `ZHIHU_ACCESS_SECRET` 缺失阻塞，不在本 Ticket 范围内。

## 目标

只读官方 Hackathon Skill 的接口文档，产出一份**只包含文档级证据**的 API 事实表，用来回答"完整正文来源是否存在"。不写生产代码，不建数据库，不猜。

## 唯一可信输入

官方 skill 已 vendored 在本地（gitignored，不入仓）：

```
.local/vendor/zhihu-skill/zhihu-hackathon/SKILL.md
.local/vendor/zhihu-skill/zhihu-hackathon/references/*.md
.local/vendor/zhihu-skill/zhihu-hackathon/assets/official-skill/zhihu/SKILL.md
.local/vendor/zhihu-skill/zhihu-hackathon/assets/official-skill/zhihu/references/*.md
.local/vendor/zhihu-skill/zhihu-hackathon/assets/official-skill/zhihu/manifest.json
```

注意路径层级：外层是 `zhihu-hackathon` 编排层，内层 `assets/official-skill/zhihu/` 才是官方 `zhihu` Skill。内层优先级高于外层转述。

## 要回答的问题

逐条给出答案，每条必须附「文件名 + 行号 + 原文片段」作为证据。文档没写的就写 `未记载`，禁止推断成事实。

1. 官方一共暴露哪些 content 类 endpoint？逐个列 `HTTP URL` + 用途 + 鉴权方式。
2. `zhihu_search` 响应体里每个字段的确切含义。重点：`ContentText` 官方原文是"摘要"还是"正文"？贴原文。
3. `global_search` 的 `SearchDB` 可选值和 `Filter` 高级语法有哪些？能否按 `ContentID` 或 answer URL 精确取单条？
4. `user-api.md` 里 `/api/v1/user/contents` 返回的 `Summary` 是否同样只是摘要？它能不能读别人的回答？需要什么鉴权？
5. 全套文档里是否存在任何"按 answer id 取完整正文"的 endpoint？包括 `cli.md`、`mcp.md`、`open-platform.md`。用词表扩展搜索：`detail`、`content_id`、`answer`、`body`、`full`、`原文`、`正文`、`全文`。命中就贴证据，没有就明确写"未找到"。
6. `EditTime` 的类型和语义是什么？文档有没有说它代表最后编辑时间？
7. 错误码：`zhihu_search` 和 `global_search` 各自的错误码表是什么？哪些码能区分"内容不存在/无权访问"和"调用失败/超限"？
8. 配额：文档里写的配额数字和维度是什么（per user / per app / per day）？
9. `manifest.json` 里的官方 Skill 版本号是多少？
10. 外层 `zhihu-hackathon` Skill 与内层官方 Skill 之间有没有**互相矛盾**的地方？有就逐条列出。

## 交付物

写一个文件：`.plans/spike-01-api-facts.md`，结构固定为：

```
# Spike 01 · API facts（Phase A，文档级证据）

## 结论
（三行以内。明确判定：情况 A / B / C，对应 Notion Spike 01 页的停止条件）

## Endpoint 清单
（表格：URL / 用途 / 鉴权 / 能否取全文）

## 逐问回答
（1-10，每条带证据引用）

## 文档未解答、必须真实调用才能确认的事实
（这一节直接成为 Phase B 的测试清单）

## 与公开 developer.zhihu.com 文档的差异
（无网络访问时写"未核对，需要联网"）
```

## 硬性约束

- 不改 `.local/` 以外的任何文件，除了新建 `.plans/spike-01-api-facts.md`。
- 不执行 `git add` / `git commit` / `git push` / `git checkout`。git 由编排者负责。
- 不碰 `src/`、`vite.config.ts`、`package.json`、`pnpm-lock.yaml`。
- 不新增依赖，不运行 `vp install`。
- 不调用任何知乎线上 API。本 Ticket 是纯离线核对。
- 不把 `ContentText` 或 `Summary` 描述成完整正文，哪怕只是举例。
- 文档没写的，写 `未记载`。推测必须显式标 `推测：` 前缀。

## 完成定义

编排者会自己重新打开被引用的文件和行号，逐条核对你给的证据是否真实存在。任何一条证据对不上，Ticket 打回重做。
