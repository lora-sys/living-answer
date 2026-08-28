# Ticket：Notion Spot Fix 回填（Spike 01 Phase A 事实）

## 派发信息

- 执行者：Claude Code `fable`
- 派发者：Grok（编排）
- 日期：2026-08-28
- 前置：Spike 01 Phase A 已完成并 commit `acf78e9`

## 目标

把 Phase A 的已验证事实回填到 Notion 的两个既有页面。Spot Fix 模式：**只追加一个 callout 块，不改写任何既有块，不新建页面**。

## 执行方式

文案已在本 ticket 中逐字定稿。你只负责执行下面的命令，**不改写文案、不调整格式、不增删句子**。

### 命令 1：Spike 01 页追加

页面 ID：`3c391e14dbed81bcac9dd2df0c6273e5`

```bash
ntn api v1/blocks/3c391e14dbed81bcac9dd2df0c6273e5/children --method PATCH -d '{"children":[{"type":"callout","callout":{"color":"blue_background","icon":{"type":"emoji","emoji":"🔬"},"rich_text":[{"type":"text","text":{"content":"Spike 01 · Phase A 完成 · 2026-08-28。离线核对官方 Skill v0.2.1 全部文档：13 个接口（9 HTTP + 4 MCP）全部只能取摘要，0 个可取完整正文；global_search Filter 仅支持 host / publish_time，无法按 ContentID 取单条；EditTime 文档类型矛盾（zhihu_search Int32 vs global_search Int64）；错误码无法区分空结果与无权访问。文档级结论 = 情况 C。配额差异待赛事答疑确认：Skill 文档写搜索 5,000 次/日（账号共享池），比赛资料写 1,000 次/用户/日。Phase B（真实调用）等待 Access Secret。证据：仓库 .plans/spike-01-api-facts.md（commit acf78e9）。"}}]}}]}'
```

### 命令 2：00 Start Here 页追加

页面 ID：`3c391e14dbed81ef963cea020f7f4d10`

```bash
ntn api v1/blocks/3c391e14dbed81ef963cea020f7f4d10/children --method PATCH -d '{"children":[{"type":"callout","callout":{"color":"blue_background","icon":{"type":"emoji","emoji":"🧪"},"rich_text":[{"type":"text","text":{"content":"Spike 01 Phase A 回填 · 2026-08-28。官方 Skill 文档层核对完成：无任何完整正文 endpoint（情况 C 候选）。执行方改为 Claude Code fable，编排方逐条验收证据行号。配额数字存在两版（Skill 5,000/日 vs 比赛资料 1,000/用户/日），待赛事技术答疑确认后再更新 Competition Requirements 页。"}}]}}]}'
```

## 执行顺序与自检

1. 执行命令 1，记录完整响应（含新 block 的 `id`）。
2. `ntn pages get 3c391e14dbed81bcac9dd2df0c6273e5` 拉回页面，确认新 callout 在末尾且文案与本 ticket 一致。
3. 执行命令 2，同样拉回页面确认：`ntn pages get 3c391e14dbed81ef963cea020f7f4d10`。
4. 任何一步 API 报错：停止，把完整错误贴进最终回复。不要重试超过 1 次，不要改写文案来"绕过"错误。

## 硬性约束

- 只允许两种调用形态：`ntn api v1/blocks/<id>/children --method PATCH` 和 `ntn pages get <id>`。
- 禁止 `ntn pages create` / `edit` / `trash`，禁止 DELETE，禁止碰上面两个 ID 之外的任何页面。
- 禁止任何 git 命令（`git status` 也不行）。
- 不修改仓库任何文件，包括本 ticket。

## 完成定义

两个页面各自末尾出现新 callout，文案与本 ticket 定稿一致。最终回复给出两个新 block 的 id 和两次 `pages get` 的确认结论。
