# Living Answer — 设计文档

## 核心理念

Living Answer 让一个模糊的问题变成一份可生长的学习线程。用户不必措辞完美，
系统通过澄清流程理解学习意图，再从真实知乎回答中选取摘录，最后生成结构化的
学习总结和可追溯的引用链。

## 产品表面

| 路径                    | 角色                                                        |
| ----------------------- | ----------------------------------------------------------- |
| `/`                     | 问题学习线程：输入模糊问题 → 澄清意图 → 选取摘录 → 生成线程 |
| `/thread/$threadId`     | 线程阅读器：查看完整学习线程，含时间线、学习节点和来源      |
| `/landing`              | 产品故事：展示理念与示例记录                                |
| `/changes`              | 维护时间线                                                  |
| `/sources`              | 来源说明                                                    |
| `/read/golden-demo/:id` | 旧式阅读页（兼容保留）                                      |

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

- 排版：中文正文使用系统无衬线字体，数字/标签使用等宽字体
- 颜色：暖色调纸面背景，强调色用于状态指示，所有颜色通过 CSS 变量定义
- 布局：最大宽度 1120px，响应式内边距
- 间距：使用 Tailwind 的 spacing scale，保持统一节奏
- 交互：所有按钮有清晰的视觉反馈层次（默认 / hover / active / focus）

## 域模型

```
问题学习线程（QuestionLearningThread）
  ├── question / refinedQuery / learningIntent
  ├── timelineStages[] → 时间线阶段（来源记录）
  ├── learningNodes[]   → 学习节点（关系/因果/演变/共识/分歧/前提变化/未知）
  └── uncertainty       → 整体不确定性评级
```

## 存储

SQLite `thread_artifacts` 表：

- 主键：`(thread_id, fingerprint)`
- 存储完整的线程 JSON 和指纹用于变化检测
- `makeSqliteThreadArtifactStore` 是懒单例

## 关键安全规则

1. 不向客户端暴露原始凭据或凭据提示
2. 将所有模型输出视为非受信任输入，执行严格 JSON 解析
3. 知乎数据摘要级别，始终标注"摘录"
4. 不将以摘录的 AnswerSnapshot.body 存储为 thread 的一部分
5. 无结果/配额/AI/无效状态均诚实处理并提供有用操作

## Sprint 迭代新增设计令牌（2026-09-02）

### 学习节点颜色编码

| 节点类型 | CSS 变量 | 色值 |
|---------|---------|------|
| 关系 | `--color-node-relationship` | `#1746ff` |
| 因果 | `--color-node-cause` | `#c6271a` |
| 演变 | `--color-node-evolution` | `#0d6b52` |
| 共识 | `--color-node-consensus` | `#274b8f` |
| 分歧 | `--color-node-divergence` | `#b42318` |
| 前提变化 | `--color-node-premise` | `#92400e` |
| 待确认 | `--color-node-unknown` | `#646a66` |

### 组件模式

- 学习节点卡片：`border-l-[3px]` 左侧颜色指示条，按 node.kind 映射
- 引用回指：`[来源 #XXXXXX]` 可点击标签，`bg-accent-soft rounded-[2px] px-1.5 py-0.5 font-mono text-[9px]`
- 时间线日期：卡片顶部 `font-mono text-[11px] tracking-[0.08em] uppercase` 独立年月标识
- 来源弹窗：移动端全宽底部抽屉（`items-end max-h-[85vh]`），桌面端居中面板
- 移动端底部导航：`fixed bottom-0 sm:hidden` 三 tab（首页/了解/时间线），当前页 `text-accent-text`
- 响应式间距：`space-y-6 sm:space-y-12`（移动紧凑，桌面宽松）
