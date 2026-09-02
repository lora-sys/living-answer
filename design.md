# Living Answer — 设计文档

## 核心理念

Living Answer 把一个模糊问题变成一条证据驱动、可追问、可沉淀的学习线。
用户不必措辞完美；AI 先澄清意图，再解释候选回答的学习角色。用户显式选择
证据后，系统组织成记忆廊桥和 Study Badge。核心闭环是：

`问题 → 证据 → 理解 → 追问 → 成果 → 沉淀 → 再学习`

## 产品表面

| 路径                | 角色                                                |
| ------------------- | --------------------------------------------------- |
| `/`                 | 合并入口：搜索提问、我的学习空间和 Study Badge 演示 |
| `/thread/$threadId` | 线程阅读器：Badge、记忆廊桥、学习节点和 Study Agent |

旧 `/landing` 路由已移除。产品解释和学习入口统一在 `/`，避免演示站点和
可使用站点分裂。

## 技术架构

- TanStack Start + TanStack Router（基于文件的响应式路由）
- Tailwind CSS 4 + CSS 变量令牌系统
- Effect TS（纯域模型，可组合效果）
- Vite+（测试框架）
- SQLite（`better-sqlite3`，通过动态导入用于客户端）

### 架构约束

- 纯域层不引用 React、TanStack SDK、`process.env`
- 生产凭据仅存在于 `src/server/` 服务函数内
- SQLite 通过 `require("better-sqlite3")` 懒加载以适配 Vite SSR 外部配置
- 所有 API 响应必须 JSON 安全（不包含 Effect 类型或 Error 实例）

## 设计语言

### 贴纸张贴纸 (Collage Paper) 设计系统

从深色主题迁移至名为"贴纸张贴纸"的光线设计系统，以海报/拼贴画美学为核心视觉方向。

#### 调色板

| 角色             | CSS 变量                | 色值                      | 用途             |
| ---------------- | ----------------------- | ------------------------- | ---------------- |
| 纸张 1           | `--color-paper`         | `#e6e7e8`                 | 页面主背景，浅灰 |
| 纸张 2           | `--color-paper-2`       | `#f4f4f2`                 | 提升区域，浅暖   |
| 纸张 3           | `--color-paper-3`       | `#ffffff`                 | 卡片/面板，纯白  |
| 墨色             | `--color-ink`           | `#0b0b0d`                 | 主文字           |
| 墨色副           | `--color-ink-subtle`    | `#4a4a5f`                 | 次要文字         |
| 淡化             | `--color-muted`         | `#6c6f75`                 | 辅助文字/标签    |
| faint            | `--color-faint`         | `#9a9da3`                 | 时间戳/元信息    |
| 边界线           | `--color-rule`          | `#c9c9c4`                 | 柔线/分隔        |
| 边界线强         | `--color-rule-strong`   | `#0b0b0d`                 | 边界线（加粗）   |
| 强调蓝           | `--color-accent`        | `#1e3fd8`                 | 唯一品牌色       |
| 强调蓝悬停       | `--color-accent-hover`  | `#1626b8`                 | hover            |
| 强调蓝激活       | `--color-accent-active` | `#0f1d8f`                 | active / pressed |
| 强调蓝焦点       | `--color-accent-focus`  | `#5886ff`                 | focus-visible    |
| 更新琥珀         | `--color-update`        | `#b45309`                 | 更新状态         |
| 更新琥珀软       | `--color-update-soft`   | `rgba(180, 83, 9, 0.06)`  | 更新背景         |
| 成功绿           | `--color-success`       | `#15803d`                 | 成功状态         |
| 成功绿软         | `--color-success-soft`  | `rgba(21, 128, 61, 0.08)` | 成功背景         |
| 危险红           | `--color-danger`        | `#b42318`                 | 错误/危险        |
| 信息蓝           | `--color-info`          | `#1746ff`                 | 信息状态         |
| 深色 (on-accent) | `--color-on-accent`     | `#ffffff`                 | 蓝色背景上的文字 |

#### 排版

| 用途     | Tailwind 类                                                              | 说明                                                                            |
| -------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 显示字体 | `font-display`                                                           | 粗 grotesque 系统无衬线：Space Grotesk / DM Sans / Noto Sans SC / ui-sans-serif |
| 等宽标签 | `font-mono text-[11px] uppercase tracking-[0.12em]`                      | 仅用于 ID/日期/状态/编号                                                        |
| 标题 1   | `font-display text-\\[32px\\] leading-\\[38px\\]` + `sm:text-\\[52px\\]` | 页面标题                                                                        |
| 正文     | `text-base leading-7 sm:text-lg sm:leading-8`                            | 舒适中文行高                                                                    |
| 辅助     | `text-sm leading-6 text-ink-subtle`                                      | 说明/描述                                                                       |

#### 间距

| 用途     | Tailwind 类                              |
| -------- | ---------------------------------------- |
| 页面容器 | `max-w-[1120px] mx-auto`                 |
| 线程容器 | `max-w-[1280px] mx-auto`                 |
| 内容区域 | `max-w-5xl`                              |
| 面板宽度 | `w-[380px]`（桌面端侧栏）                |
| 单元间距 | `space-y-6` 移动端 / `space-y-12` 桌面端 |
| 卡片内部 | `px-5 py-5 sm:px-6`                      |

#### 组件规则

1. **圆角**: 全部 0px。`rounded-none` 或不设置圆角类。不使用 `rounded-lg` / `rounded-xl` / `rounded-2xl` / `rounded-full`。
2. **阴影**: 仅硬偏移（hard offset），不含模糊：
   - 卡片阴影 `shadow-[var(--shadow-card)]` → `3px 3px 0 #000`
   - 面板阴影 `shadow-[var(--shadow-panel)]` → `4px 4px 0 #000`
   - hover 提升 → `shadow-[5px_5px_0]` 或 `shadow-[6px_6px_0]`
   - 交互式按钮 hover → `shadow-[3px_3px_0_var(--color-accent)]`
3. **边框**: 主卡片 `border-2 border-rule-strong`；次级面板 `border border-rule`。
4. **按钮**: `inline-flex min-h-11 items-center justify-center`（44px 最小触摸目标）。
   - 主要行为: `border-2 border-accent bg-accent text-white`
   - 次要/危险行为: `border-2 border-rule-strong bg-paper-3 text-ink`
   - 焦点环: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`
5. **链接**: `text-accent underline underline-offset-2`
6. **等宽标签**: `font-mono text-[11px] uppercase tracking-[0.12em] text-muted`
7. **强调文本**: 一律使用 `text-accent`（旧 `text-accent-text` 已弃用）

#### 拼贴贴纸 (Collage) 处理

- **半色调网点**: `.bg-collage-halftone` — CSS `radial-gradient` 产生青色半圆点
- **黑色贴纸**: `.bg-black-strip` — 顶部黑色条装饰，模拟黑色胶带
- **蓝色贴纸**: `.bg-blue-strip` — 顶部蓝色条装饰
- **线条**: `.bg-contour` — 底部细蓝线
- **海报框架**: `.bg-collage-frame` — 内外双层黑框效果
- **应用场景**: 精选线程卡片使用蓝色贴纸；海报区域使用黑色贴纸

#### 交互状态

| 状态           | 效果                                                      |
| -------------- | --------------------------------------------------------- |
| Hover（按钮）  | 硬阴影放大 + 颜色微变                                     |
| Active（按钮） | `translate-y-px` + 背景色加深                             |
| Focus-visible  | `outline-2 outline-offset-2 outline-accent`               |
| 悬停（卡片）   | `shadow-[var(--shadow-card)]` → `shadow-[3px_3px_0_#000]` |

#### 辅助功能

- 所有交互元素满足 44px 触摸目标（`min-h-11` = 44px）
- `focus-visible`（非 focus）时显示焦点环
- `aria-live="polite"` 用于加载/更新状态
- `aria-label` 用于图标按钮
- 感知颜色不用于传递唯一信息

#### 响应式断点

| 断点           | Tailwind 前缀 | 典型变化                 |
| -------------- | ------------- | ------------------------ |
| 移动端（默认） | 无前缀        | 单列、紧凑间距           |
| 平板/桌面      | `sm:`         | 更大字号、展开延伸间距   |
| 桌面           | `lg:`         | 侧栏布局切换（flex-row） |

## 域模型

```
问题学习线程（QuestionLearningThread）
  ├── question / refinedQuery
  ├── timelineStages[] → 时间线阶段（来源记录）
  ├── learningNodes[]   → 学习节点（关系/因果/演变/共识/分歧/前提变化/未知）
  ├── learningGuide     → AI 学习桥：概览 / 阶段角色 / 开放追问
  └── uncertainty       → 整体不确定性评级
```

## 存储

SQLite `thread_artifacts` 表：

- 主键：`(thread_id, fingerprint)`
- 存储完整的线程 JSON 和指纹用于变化检测
- `makeSqliteThreadArtifactStore` 是懒单例

## 学习成果沉淀

- 收藏状态保存在浏览器 `localStorage`，key 为 `living-answer.collectedThreads`
- 收藏状态校验 16 位十六进制线程 ID；非法或损坏数据会被过滤
- 导出格式包括 Markdown 与 JSON
- Markdown 包含学习意图、AI 学习桥、学习节点、开放追问、精确摘录、知乎原文和“这是摘录，不是完整回答”边界
- JSON 导出当前线程完整 artifact，适合后续导入个人学习空间
- 当前是轻量本地收藏；不做登录系统和跨端同步

## Study Badge

Study Badge 是学习线结束后的可收藏学习成果，不是虚拟奖杯。

- 第一屏回答：学到什么、核心结论、关键分歧和继续追问。
- 展示学习概览、年份跨度、来源数、作者数和节点角色统计。
- 最多展示 3 个核心学习点、2 个继续追问。
- 新增反常识提醒、2 个自测问题和 1 个下一步行动。
- 提供“带走 Markdown 笔记”和“导出 JSON”。
- Badge 是当前首页 demo 的叙事模型，也是个人学习空间的最小单位。

## 记忆廊桥

记忆廊桥必须呈现路径关系，而不是摘录列表。

- 来源不足或年份集中时，从“跨年时间线”降级为“观点对照线”。
- 每一步显示 `BRIDGE STEP`：这段支持、修正，还是扩展上一段。
- 每段显示“带走这一步”，把学习节点映射成用户应记住的判断。
- 所有解释都保留证据引用和摘要边界。

## AI 降级

- 线程生成：模型不可用或学习指南校验失败时，保留有效节点，并生成确定性
  证据学习线；不伪造 AI 概览，也不隐藏降级原因。
- Study Agent：模型失败时使用离线证据摘要；模型对时间线、分歧、边界或
  下一步动作返回证据不足，但当前 artifact 已有对应节点时，也使用确定性
  证据摘要。其他问题诚实返回证据不足。
- 补充搜索：永远携带线程原始学习主题，不把 UI 快捷提示当成用户问题。
- 候选解释：AI 推荐组合不自动选择；分析失败提供可见重试。

## 我的学习空间

- 收藏保存两组本地数据：兼容旧版线程 ID 列表，以及新的学习空间摘要。
- 摘要包含问题、创建时间、来源数、学习点数和年份跨度。
- 首页可继续学习；不支持跨设备同步，也没有账号系统。

## 关键安全规则

1. 不向客户端暴露原始凭据或凭据提示
2. 将所有模型输出视为非受信任输入，执行严格 JSON 解析
3. 知乎数据摘要级别，始终标注"摘录"
4. 不把摘要或摘录当作完整回答正文存储
5. 无结果/配额/AI/无效状态均诚实处理并提供有用操作

## Sprint 迭代新增设计令牌（2026-09-02）

### AI 学习桥角色令牌

| 学习桥角色      | 中文标签 | 语义                           |
| --------------- | -------- | ------------------------------ |
| `baseline`      | 基础认知 | 建立问题、定义或基础事实       |
| `correction`    | 边界修正 | 修正旧前提、缺失条件或过度概括 |
| `extension`     | 深化扩展 | 补充原理、工程细节或跨场景延伸 |
| `counterpoint`  | 不同视角 | 保留真实分歧，不强行合并观点   |
| `current_usage` | 当前用法 | 给出今天可直接验证的用法       |
| `unclear`       | 待确认   | 来源不足、匹配不明或证据冲突   |

### 学习节点颜色编码

| 节点类型 | CSS 变量                    | 色值      |
| -------- | --------------------------- | --------- |
| 关系     | `--color-node-relationship` | `#1746ff` |
| 因果     | `--color-node-cause`        | `#c6271a` |
| 演变     | `--color-node-evolution`    | `#0d6b52` |
| 共识     | `--color-node-consensus`    | `#274b8f` |
| 分歧     | `--color-node-divergence`   | `#b42318` |
| 前提变化 | `--color-node-premise`      | `#92400e` |
| 待确认   | `--color-node-unknown`      | `#646a66` |

### 组件模式

### AI 候选地图

- 搜索结果先显示 `AI CANDIDATE MAP` 摘要块：`border border-accent bg-accent-soft`
- 每个候选卡显示角色 badge 与一段入选理由
- AI 只解释候选，不代替用户勾选；选择操作仍由用户显式完成

### Study Badge 卡

- 容器：`border-2 border-accent bg-accent-soft`
- 标题：`font-display text-[24px] font-bold`，移动端起 24px，桌面 28px
- 核心点：每条使用 accent 方点 + 标题加粗 + 一句话说明
- 操作主次：`带走 Markdown 笔记` 是主按钮，`导出 JSON` 是次按钮

- 学习节点卡片：`border-l-[3px]` 左侧颜色指示条，按 node.kind 映射
- 引用回指：`[来源 #XXXXXX]` 可点击标签，`bg-accent-soft rounded-[2px] px-1.5 py-0.5 font-mono text-[9px]`
- 时间线日期：卡片顶部 `font-mono text-[11px] tracking-[0.08em] uppercase` 独立年月标识
- 来源弹窗：移动端全宽底部抽屉（`items-end max-h-[85vh]`），桌面端居中面板
- 导航只保留品牌入口，不再做首页/了解重复分栏
- 响应式间距：`space-y-6 sm:space-y-12`（移动紧凑，桌面宽松）
