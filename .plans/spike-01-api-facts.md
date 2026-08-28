# Spike 01 · API facts（Phase A，文档级证据）

## 结论

全套文档中**不存在任何"按 answer id / ContentID 取完整正文"的 endpoint**。所有 content 类接口（`zhihu_search`、`global_search`、`hot_list`、`user/contents`、MCP 对应工具）的文本字段均被文档明确定义为「摘要」，未记载可获取全文的路径。结论为**情况 C**：完整正文来源不存在于官方文档。

## Endpoint 清单

| #   | HTTP URL                                                       | 用途                 | 鉴权                         | 能否取全文             |
| --- | -------------------------------------------------------------- | -------------------- | ---------------------------- | ---------------------- |
| 1   | `GET https://developer.zhihu.com/api/v1/content/zhihu_search`  | 知乎站内搜索         | Bearer + X-Request-Timestamp | 否，ContentText 是摘要 |
| 2   | `GET https://developer.zhihu.com/api/v1/content/global_search` | 全网搜索             | Bearer + X-Request-Timestamp | 否，ContentText 是摘要 |
| 3   | `GET https://developer.zhihu.com/api/v1/content/hot_list`      | 知乎热榜             | Bearer + X-Request-Timestamp | 否，Summary 是摘要     |
| 4   | `POST https://developer.zhihu.com/v1/chat/completions`         | 知乎直答             | Bearer + X-Request-Timestamp | 不适用（生成式回答）   |
| 5   | `GET https://developer.zhihu.com/api/v1/user/contents`         | 当前用户的创作内容   | Bearer + X-Request-Timestamp | 否，Summary 是摘要     |
| 6   | `GET https://developer.zhihu.com/api/v1/user/followees`        | 当前用户的关注列表   | Bearer + X-Request-Timestamp | 否（不返回正文）       |
| 7   | `GET https://developer.zhihu.com/api/v1/user/favlists`         | 当前用户的收藏夹列表 | Bearer + X-Request-Timestamp | 否（不返回正文）       |
| 8   | `GET https://developer.zhihu.com/api/v1/user/favlist_contents` | 指定收藏夹内容       | Bearer + X-Request-Timestamp | 否，Summary 是摘要     |
| 9   | `GET https://developer.zhihu.com/api/v1/user/collections`      | 近期收藏             | Bearer + X-Request-Timestamp | 否，Summary 是摘要     |
| 10  | `SSE https://developer.zhihu.com/api/mcp/zhihu_search/v1/sse`  | MCP 知乎搜索         | Bearer                       | 否（同 zhihu_search）  |
| 11  | `SSE https://developer.zhihu.com/api/mcp/global_search/v1/sse` | MCP 全网搜索         | Bearer                       | 否（同 global_search） |
| 12  | `SSE https://developer.zhihu.com/api/mcp/hot_list/v1/sse`      | MCP 热榜             | Bearer                       | 否（同 hot_list）      |
| 13  | `POST https://developer.zhihu.com/api/mcp/zhida/v1/stream`     | MCP 直答             | Bearer                       | 不适用（生成式回答）   |

> 注：MCP 端点仅为协议封装层（SSE / Streamable HTTP），底层数据来源与 HTTP API 一致。`clouapi.md` 和 `open-platform.md` 未列举任何单独内容正文 endpoint。

## 逐问回答

### Q1. Content 类 endpoint 清单（HTTP URL + 用途 + 鉴权 + 能否取全文）

见上表。全部使用 `Authorization: Bearer <your_access_secret>` + `X-Request-Timestamp`（秒级 Unix 时间戳）鉴权。

证据：

- 鉴权说明：`http-api.md:26` — "知乎开放平台当前推荐通过 `Authorization: Bearer <your_access_secret>` 的方式调用数据接口。"
- 时间戳要求：`http-api.md:37` — "`X-Request-Timestamp` 需要传秒级 Unix 时间戳。"
- 用户数据端点基础域名：`user-api.md:38` — "基础域名：`https://developer.zhihu.com`"

### Q2. `zhihu_search` 响应体 `ContentText` 的确切含义

**官方原文定义为「内容摘要」**，不是「正文」。

证据：

- `http-api.md:349` — `ContentText | String | 是 | 内容摘要`
- `http-api.md:142`（global_search 同上） — `ContentText | String | 是 | 内容摘要，高亮部分用 <em> 标签表示`
- `SKILL.md:78` — "优先使用返回的 `Title`、`AuthorName`、`ContentText` 和 `Url`。**搜索摘要不是完整原文**。"
- 响应示例（`http-api.md:171`）中 `ContentText` 的值为："本文介绍了主流 RAG 评测框架，包括 RAGAS、TruLens ..." — 以省略号结尾，确为摘要格式。

回答：ContentText 官方原文是 **"内容摘要"**（摘要），不是正文。

### Q3. `global_search` 的 `SearchDB` 和 `Filter`

**SearchDB 可选值：**

证据 — `http-api.md:88-93`：

```
| 值 | 说明 |
| `all` | 全部索引库，默认值 |
| `realtime` | 仅搜索实时库 |
| `static` | 仅搜索静态库 |
```

**Filter 高级语法支持的字段：**

证据 — `http-api.md:96-108`：

```
支持字段：
| 字段 | 含义 | 类型 | 示例 |
| host | 站点域名 | String | host=="example.com" |
| publish_time | 发布时间，秒级时间戳 | Int64 | publish_time>=1778494631 |

支持操作符：
- host 支持 ==、!=，字符串值必须使用双引号
- publish_time 支持 ==、!=、>、>=、<、<=，数字值不使用引号

支持逻辑符：
- AND、OR 必须大写
- AND 优先级高于 OR
- 可以使用括号 () 明确控制优先级
```

**能否按 ContentID 或 answer URL 精确取单条？**

文档未记载。Filter 仅支持 `host` 和 `publish_time` 两个字段，**没有 `content_id`、`url` 或 `answer_id` 等精确取单条的能力**。

证据 — `http-api.md:107` — "`host=="zhihu.com"` 及其子域名不支持，如需搜索仅知乎站内内容，请直接使用 `zhihu_search` 接口。"（说明 Filter 仅用于外部站点筛选，且字段受限。）

结论：**按 ContentID 或 answer URL 精确取单条未记载。**

### Q4. `/api/v1/user/contents` 的 `Summary` 和访问权限

**Summary 的定义：** `user-api.md:87` — `Summary | String | 是 | 摘要`

与搜索类接口一致，`Summary` 也是「摘要」，不是完整正文。

**能否读别人的回答？**

文档未直接记载能否读取其他知乎用户的回答。接口文档标题为「获取用户公开范围内的创作内容」，**仅描述返回 Access Secret 所属账号或 OAuth 授权用户的公开数据**。

证据 — `user-api.md:53` — `获取用户公开范围内的创作内容`；`user-api.md:23-27`：

```
| 场景 | Authorization | X-OAuth-Token | 返回的数据 |
| 当前调用方本人 | 开放平台 Access Secret | 不传 | Access Secret 所属知乎账号的公开范围数据 |
| 第三方应用中的授权用户 | 开放平台 Access Secret | 传入用户 OAuth access token | 该 OAuth 用户授权范围内的公开数据 |
```

**鉴权要求：** 必须提供 `Authorization: Bearer <access_secret>`；若要代表其他用户，还需传入 `X-OAuth-Token`（`user-api.md:44-46`）。查询其他非本人、非 OAuth 授权用户的创作：**未记载支持**。

### Q5. 是否存在按 answer id 取完整正文的 endpoint

**未找到。**

全文关键词搜索（`detail`、`content_id`、`answer`（作为 endpoint）、`body`、`full`、`原文`、`正文`、`全文`）在全部官方文档中无命中的 endpoint 或字段设计：

- `ContentID` 仅作为 response 中的内容标识 Token（`http-api.md:141`、`http-api.md:349`），无对应 GET endpoint 接受此参数。
- `body`、`detail`、`full` 在 API 文档中仅作为 HTTP Body 标识或代码示例注释出现，未作为 endpoint 路径或 response 字段名。
- `原文` 仅在 SKILL.md 中出现于"原文链接"（line 136）和"搜索摘要不是完整原文"（line 78）的否定语义。
- `正文` 仅在 SKILL.md 出现于"不把 Summary 当作完整正文"（line 111）的否定语义。
- `全文` 未出现在任何官方文档。

所有 content 端点返回的文本字段（`ContentText`、`Summary`）均被文档定性为摘要。

证据 — `SKILL.md:111` — "创作接口只返回标题与摘要，不把 `Summary` 当作完整正文。"
证据 — `SKILL.md:78` — "搜索摘要不是完整原文。"

### Q6. `EditTime` 的类型和语义

**类型不一致：** `zhihu_search` 定义为 `Int32`，`global_search` 定义为 `Int64`。

**语义描述不一致：**

证据 — `http-api.md:357`（zhihu_search） — `EditTime | Int32 | 是 | 发布时间或更新时间戳`
证据 — `http-api.md:150`（global_search） — `EditTime | Int64 | 是 | 最后编辑时间戳，如 1745486539`

两处都确认它代表时间戳（Unix 秒级），但 zhihu_search 写的是「发布时间**或**更新时间戳」（两个语义混用），global_search 写的是「最后编辑时间戳」（单一语义）。

结论：文档确认它代表时间戳，但类型在 Int32 与 Int64 之间存在矛盾，语义描述亦有出入（"发布或更新" vs "最后编辑"）。**不能确定它一定代表最后编辑时间**（特别是 zhihu_search 的描述包含"发布时间"）。全局用户 API（user-api.md）中未出现 `EditTime` 字段。

### Q7. `zhihu_search` 和 `global_search` 的错误码表

**zhihu_search 错误码：**

证据 — `http-api.md:401-407`：

```
| 错误码 | 说明 |
| 0 | 成功 |
| 10001 | 参数错误 |
| 20001 | 鉴权失败 |
| 30001 | 频率限制 |
| 90001 | 内部错误 |
```

**global_search 错误码：**

证据 — `http-api.md:499-505`：

```
| 错误码 | 说明 |
| 0 | 成功 |
| 20001 | 鉴权失败 |
| 30001 | 频率限制 |
| 90001 | 内部错误 |
```

注意：global_search **未列出 `10001`**。

**区分"内容不存在/无权访问" vs "调用失败/超限"：**

| 场景                       | 判断方式                                                                                                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 内容不存在 / 无权访问      | 两接口均**未记载**独立的「内容不存在」或「无权访问该内容」错误码。空结果以 `EmptyReason`（zhihu_search）或 `HasMore=false` + 空 `Items`（global_search）表示。无内容时 HTTP 200，Code=0，仅数据为空。推测为服务端逻辑过滤，并非 error。 |
| 鉴权失败                   | `20001`                                                                                                                                                                                                                                 |
| 频率限制                   | `30001`                                                                                                                                                                                                                                 |
| 配额耗尽                   | 仅 user-api.md 列出 `30002`；搜索类接口**未单独列出**配额错误码，推测可能复用 `30001` 或其他码，**未记载**。                                                                                                                            |
| 调用失败 / 超限 / 内部错误 | `90001`                                                                                                                                                                                                                                 |

CLI 层还有独立错误码（`cli.md:294-317`）：`AUTH_REQUIRED`（未配置）、`AUTH_INVALID`（凭证无效）、`30001`（频率限制，服务端）、`30002`（配额耗尽，服务端）、`NETWORK_ERROR`/`TIMEOUT`、`UPSTREAM_ERROR`。

### Q8. 配额

**每日调用额度（邀测阶段，per 账号共享池）：**

证据 — `open-platform.md:33-38`：

```
| 能力 | 每日额度 |
|---|---:|
| 全网搜索 | 5,000 次 |
| 知乎搜索 | 5,000 次 |
| 知乎热榜 | 100 次 |
| 知乎直答 | 100 次 |
```

**维度说明：**

证据 — `open-platform.md:42-44` — "单个账号最多可申请 20 个 Access Secret。同一账号下所有 Access Secret 共享同一个试用调用额度池。"

**总结：**

- 配额维度为 **per 账号**（所有 Access Secret 共享），不是 per app 或 per user。
- 未记载 OAuth 授权用户有独立配额。
- 同一账号下所有 Access Secret 共享额度池，对应能力额度耗尽后该账号下所有 Access Secret 均无法继续调用。
- 页面效果测试与 API 直接调用共享同一额度池。
- `cli.md:142` 确认："v0.1 没有剩余额度查询 API，也不从网页抓取额度。"

### Q9. `manifest.json` 官方 Skill 版本号

证据 — `manifest.json:3` — `"version": "0.2.1"`

内层 SKILL.md 同步确认：`SKILL.md:9` — `当前 Skill 版本：0.2.1`

### Q10. 外层 `zhihu-hackathon` Skill 与内层官方 Skill 的互相矛盾之处

| #   | 矛盾点                        | 外层说法                                                                                                                         | 内层说法                                                                       | 判定                                                                            |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1   | 版本号                        | 外层 SKILL.md 未声明自身版本号                                                                                                   | 内层 SKILL.md:9 — `当前 Skill 版本：0.2.1`；manifest.json `"version": "0.2.1"` | 外层无版本声明，内层有 `0.2.1`；严格说不是互斥，是外层缺失。                    |
| 2   | 用户数据接口的 `Summary` 语义 | 外层 SKILL.md:111 — "创作接口只返回标题与摘要"                                                                                   | 内层 SKILL.md 作同样的说明                                                     | 一致，无矛盾。                                                                  |
| 3   | ContentText 语义              | 外层 SKILL.md:78 — "搜索摘要不是完整原文"                                                                                        | 内层 SKILL.md 作同样的说明                                                     | 一致，无矛盾。                                                                  |
| 4   | OAuth 支持                    | 外层 SKILL.md:148 — "CLI 日常调用不使用 OAuth"；cli.md:246 — "所有 me 命令只查询当前 Access Secret 所属账号，不接受 OAuth Token" | 内层 oauth.md 独立说明 OAuth 集成方式；user-api.md:27-33 描述两种身份模型      | 无矛盾。外层说明 CLI 不实现 OAuth，内层 oauth.md 面向"应用开发者代表其他用户"。 |
| 5   | 安装路径                      | 外层 SKILL.md:61 — 官方 Skill 安装到 `.codex/skills/zhihu`                                                                       | 内层 SKILL.md 不指定安装路径                                                   | 外层定义了安装位置，内层未约束。这不是内容上的矛盾，而是分层职责不同。          |

**结论：外层与内层在接口定义、字段语义、鉴权方式上无互相矛盾。** 外层作为编排层只描述安装/部署流程，内层作为接口 reference 定义协议契约，两者引用关系清晰。最接近的"不一致"地方是外层 SKILL.md 未声明版本号（内层有 `0.2.1`），但这属于信息缺失而非互斥。以外层版本号缺失标为观察项。

## 文档未解答、必须真实调用才能确认的事实

以下条目在文档中未闭合，Phase B 需通过真实 API 调用验证：

| #   | 待验证项                                                                    | 来源问题 | 为什么必须验证                                                         |
| --- | --------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| 1   | `zhihu_search` 是否存在真正返回「完整正文」的分支路径                       | Q5       | 文档所有路径均只返回摘要，但不排除未文档化的参数或内部变体             |
| 2   | `zhihu_search` 的 `ContentID` 是否可传入其他 endpoint 取全文                | Q5       | `ContentID` 存在但未文档化其作为请求参数的任何 endpoint                |
| 3   | `EditTime` 的实际返回类型                                                   | Q6       | zhihu_search 写 Int32、global_search 写 Int64，schema 级别矛盾         |
| 4   | `EditTime` 在 zhihu_search 的实际语义（发布 or 编辑）                       | Q6       | 描述为「发布时间或更新时间戳」，语义模糊                               |
| 5   | `zhihu_search` 空结果 / 无权访问的精确 HTTP 状态码与响应结构                | Q7       | 文档说 Code=0 + EmptyReason 表示无结果，未记载无权访问他人内容的错误码 |
| 6   | `global_search` 是否也有 `10001` 错误码（文档未列出但可能共用）             | Q7       | global_search 错误码表缺少 `10001`，是否遗漏或有意省略                 |
| 7   | `global_search` 配额耗尽时的错误码（是否复用 30001）                        | Q7、Q8   | 搜索类接口错误码表仅列出 30001，未区分频率限制和配额耗尽               |
| 8   | `/api/v1/user/contents` 能否通过某种方式读取非本人、非 OAuth 授权用户的内容 | Q4       | 仅记载了"本人"和"OAuth 授权用户"两种场景，未明确禁止或其他方式         |
| 9   | 开放平台实际配额剩余量（文档无实时查询 API）                                | Q8       | `cli.md:142` 确认 v0.1 无额度查询 API，需去开发者中心查看              |
| 10  | 直答 API 的错误码体系（文档只给了一个示例结构，无完整码表）                 | Q7       | `http-api.md` 直答章节仅给了一个示例错误 JSON，无完整错误码表          |

## 与公开 developer.zhihu.com 文档的差异

未核对，需要联网。
