import { createAnswerSnapshot, type AnswerSnapshot } from "./answer-snapshot";

/**
 * Curated golden-demo fixtures — synthetic data, not live Zhihu captures.
 *
 * Snapshots are created via `createAnswerSnapshot` to preserve the immutable-record
 * shape and stable fingerprint. Provenance blocks bound each demo as manually
 * curated with synthetic author metadata. Evidence URLs reference verified primary
 * sources.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/** Patch kinds used in the demo. */
export type GoldenDemoPatchType = "UPDATE" | "CORRECTION" | "CONDITION" | "BETTER_WAY";

/** Source provenance for a curated-from-search-summary golden demo. */
export interface GoldenDemoSource {
  readonly url: string;
  readonly questionId: string;
  readonly answerId: string;
  readonly authorDisplayName: string;
  readonly questionTitle: string;
  readonly sourceKind: "curated-from-search-summary";
  readonly capturedAt: number;
}

/**
 * Top-level fixture record.
 *
 * Extended with route-addressable metadata (id, displayTitle, topic, description)
 * and a `source` block for real-source provenance, without changing the immutable
 * snapshot / patch domain shape.
 *
 * `syntheticAuthor` is retained as a presentation alias: `initials` is derived
 * from the real author name and `displayName` uses the real author name.
 */
export interface GoldenDemoFixture {
  readonly provenance: GoldenDemoFixtureProvenance;
  readonly snapshot: AnswerSnapshot;
  readonly syntheticAuthor: {
    readonly displayName: string;
    readonly initials: string;
  };
  readonly capturedAt: number;
  readonly patches: readonly GoldenDemoPatch[];
  readonly paragraphs: readonly string[];
  /** Stable id for the parameterized route and the GOLDEN_DEMOS map key. */
  readonly id: string;
  /** Display title shown on the landing page and the reader page header. */
  readonly displayTitle: string;
  /** Topic label (e.g. "AI 产品", "React 生态", "社会政策"). */
  readonly topic: string;
  /** One-sentence description for the landing page entry. */
  readonly description: string;
  /** Real-source provenance derived from a public Zhihu search summary. */
  readonly source: GoldenDemoSource;
}

/** Evidence fields needed for the EvidenceCard presentation. */
export interface GoldenDemoEvidence {
  readonly title: string;
  readonly organization: string;
  readonly publishedAt: number;
  readonly supportedFact: string;
  readonly sourceType: string;
  readonly sourceUrl: string;
  readonly quote: string;
  readonly capturedAt: number;
}

/** One observer patch on a specific paragraph. */
export interface GoldenDemoPatch {
  readonly id: string;
  readonly type: GoldenDemoPatchType;
  readonly paragraphId: string;
  readonly originalExcerpt: string;
  readonly currentChange: string;
  readonly impact: string;
  readonly asOf: number;
  readonly evidence: readonly GoldenDemoEvidence[];
}

/** Provenance and metadata for a curated demo. */
export interface GoldenDemoFixtureProvenance {
  readonly kind: "curated-demo";
  readonly model: string;
  readonly capturedAt: number;
  readonly note: string;
  readonly openaiPrimarySources?: readonly string[];
}

/**
 * Top-level fixture record.
 *
 * Extended with route-addressable metadata (id, displayTitle, topic, description)
 * without changing the immutable snapshot / patch domain shape.
 */
export interface GoldenDemoFixture {
  readonly provenance: GoldenDemoFixtureProvenance;
  readonly snapshot: AnswerSnapshot;
  readonly syntheticAuthor: {
    readonly displayName: string;
    readonly initials: string;
  };
  readonly capturedAt: number;
  readonly patches: readonly GoldenDemoPatch[];
  readonly paragraphs: readonly string[];
  /** Stable id for the parameterized route and the GOLDEN_DEMOS map key. */
  readonly id: string;
  /** Display title shown on the landing page and the reader page header. */
  readonly displayTitle: string;
  /** Topic label (e.g. "AI 产品", "React 生态", "社会政策"). */
  readonly topic: string;
  /** One-sentence description for the landing page entry. */
  readonly description: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PARAGRAPH_SEPARATOR = "\n\n";

export function splitBodyParagraphs(body: string): readonly string[] {
  return body.split(PARAGRAPH_SEPARATOR).filter((p) => p.trim() !== "");
}

export function paragraphId(index: number): string {
  return `p-${index}`;
}

/** Build a deeply frozen GoldenDemoEvidence. */
function makeEvidence(evidence: GoldenDemoEvidence): GoldenDemoEvidence {
  return Object.freeze(evidence);
}

/** Build a deeply frozen GoldenDemoPatch. */
function makePatch(patch: GoldenDemoPatch): GoldenDemoPatch {
  return Object.freeze({
    ...patch,
    evidence: Object.freeze(patch.evidence.map(makeEvidence)),
  });
}

/** Build a deeply frozen GoldenDemoFixture from parts. */
function makeFixture(
  fixture: Omit<GoldenDemoFixture, "id" | "displayTitle" | "topic" | "description"> & {
    id: string;
    displayTitle: string;
    topic: string;
    description: string;
  },
): GoldenDemoFixture {
  return Object.freeze({
    ...fixture,
    provenance: Object.freeze(fixture.provenance),
    snapshot: fixture.snapshot,
    syntheticAuthor: Object.freeze(fixture.syntheticAuthor),
    source: Object.freeze(fixture.source),
    paragraphs: Object.freeze(fixture.paragraphs),
    patches: Object.freeze(fixture.patches.map(makePatch)),
  });
}

// ── Shared evidence URLs ──────────────────────────────────────────────────────

const OPENAI_PRICING_URL = "https://developers.openai.com/api/docs/pricing";
const OPENAI_RATE_LIMITS_URL = "https://developers.openai.com/api/docs/guides/rate-limits";
const REACT_BLOG_URL = "https://react.dev/blog/2025/02/14/sunsetting-create-react-app";
const CRA_REPO_URL = "https://github.com/facebook/create-react-app";
const REACT_LEARN_URL = "https://react.dev/learn/creating-a-react-app";
const NPC_DECISION_URL = "https://www.gov.cn/yaowen/liebiao/202409/content_6974294.htm";

// ── ChatGPT Free / Plus fixture ──────────────────────────────────────────────

const chatgptSnapshotResult = createAnswerSnapshot({
  questionId: "655951342",
  answerId: "3498259423",
  capturedAt: 1_715_679_954_000,
  body: [
    "ChatGPT 的免费用户与付费（Plus）用户之间存在几个关键差异。这些差异会影响模型访问权限、使用频率和功能可用性，了解这些区分有助于根据自身需求选择合适的档位。",
    "在消息数量方面，免费用户在使用 GPT-4 模型时存在每小时限制。在该系统限定下，用户每小时只能发送有限条数的消息，超出后需要等待重置才能继续使用。Plus 用户则享有更高的使用配额，基本不受这一限制的约束。",
    "在模型访问权限方面，最初只有 Plus 用户才能使用 GPT-4 级别的模型。随后 OpenAI 逐步向免费用户开放了部分 GPT-4 模型的体验资格。2024 年中期推出的 GPT-4o 系列使免费用户也能接触到该类模型，但使用频率仍然受到更严格的管控。",
    "在功能特性上，Plus 用户可以享用多项增强功能，包括在高峰期仍可保障的使用额度、增强的数据分析能力、优先接收新功能的资格以及更快的响应速度。免费用户的图像理解功能则经历过从受限到逐步放开的过程，但仍受制于使用档位。",
  ].join(PARAGRAPH_SEPARATOR),
});

if (chatgptSnapshotResult._tag === "failure") {
  throw new Error(`ChatGPT fixture snapshot creation failed`);
}

const CHATGPT_SNAPSHOT = chatgptSnapshotResult.snapshot;

const chatgptEvidence1: GoldenDemoEvidence = Object.freeze({
  title: "OpenAI API Pricing",
  organization: "OpenAI",
  publishedAt: 1_700_000_000_000,
  supportedFact: "官方 API Pricing 页展示当前模型的按 token 计价，不是消费端订阅价目表。",
  sourceType: "官方定价文档",
  sourceUrl: OPENAI_PRICING_URL,
  quote: "Pricing | OpenAI API",
  capturedAt: 1_700_000_000_000,
});

const chatgptEvidence2: GoldenDemoEvidence = Object.freeze({
  title: "OpenAI API Rate Limits",
  organization: "OpenAI Developers",
  publishedAt: 1_700_000_000_000,
  supportedFact: "官方 Rate Limits 页展示 Free 与更高付费层级，说明限额按使用层级设置。",
  sourceType: "官方速率限制文档",
  sourceUrl: OPENAI_RATE_LIMITS_URL,
  quote: "Rate limits vary by usage tier and are applied at the organization level",
  capturedAt: 1_700_000_000_000,
});

export const goldenDemoFixture: GoldenDemoFixture = makeFixture({
  id: "chatgpt-free-plus",
  displayTitle: "ChatGPT Free 与 Plus 的关键差异",
  topic: "AI 产品",
  description: "ChatGPT 免费与付费档位的差异如何随着 2024 年 GPT-4o 发布而变化。",
  provenance: Object.freeze({
    kind: "curated-demo",
    model: "ChatGPT Free / Plus (Golden Demo, real source: chengxd 达达)",
    capturedAt: 1_715_679_954_000,
    note: "读体是从真实知乎回答的公开搜索摘要人工整理的，不是实时抓取，没有存储全文。",
    openaiPrimarySources: [OPENAI_PRICING_URL, OPENAI_RATE_LIMITS_URL] as const,
  }),
  source: Object.freeze({
    url: "https://www.zhihu.com/question/655951342/answer/3498259423",
    questionId: "655951342",
    answerId: "3498259423",
    authorDisplayName: "chengxd 达达",
    questionTitle: "为什么 OpenAI 突然把 GPT-4o 免费了?",
    sourceKind: "curated-from-search-summary",
    capturedAt: 1_715_679_954_000,
  }),
  snapshot: CHATGPT_SNAPSHOT,
  syntheticAuthor: Object.freeze({
    displayName: "chengxd 达达",
    initials: "cd",
  }),
  capturedAt: 1_715_679_954_000,
  patches: [
    {
      id: "patch-1-msg-limit",
      type: "UPDATE" as GoldenDemoPatchType,
      paragraphId: paragraphId(0),
      originalExcerpt:
        "免费用户在使用 GPT-4 模型时存在每小时限制。在该系统限定下，用户每小时只能发送有限条数的消息，超出后需要等待重置才能继续使用。Plus 用户则享有更高的使用配额，基本不受这一限制的约束。",
      currentChange:
        "官方 API 文档现在按模型和使用层级描述访问：定价页记录当前模型的按 token 计价，速率限制页记录按组织、按使用层级设置的限额。原回答中引用的固定配额数字不再适合解释当前文档中的访问框架。",
      impact:
        "原文引用的具体配额数字不应继续当作当前通用规则使用；判断可用量时，应参考当前官方按层级和模型给出的说明，而不是固定每小时条数。",
      asOf: 1_700_000_000_000,
      evidence: [chatgptEvidence1, chatgptEvidence2],
    },
    {
      id: "patch-2-model-access",
      type: "UPDATE" as GoldenDemoPatchType,
      paragraphId: paragraphId(2),
      originalExcerpt:
        "最初只有 Plus 用户才能使用 GPT-4 级别的模型。随后 OpenAI 逐步向免费用户开放了部分 GPT-4 模型的体验资格",
      currentChange:
        "官方 API 文档把模型和吞吐组织为层级化框架：定价页按当前模型家族记录 API 价格，速率限制页按使用层级记录限额。原回答中的订阅分界不能直接套用到当前开发者文档的层级框架。",
      impact:
        "原文中只有付费用户才能使用的假设在今天不能作为通用结论；实际可用范围和吞吐取决于具体产品或 API 使用层级的当前说明。",
      asOf: 1_700_000_000_000,
      evidence: [chatgptEvidence1, chatgptEvidence2],
    },
  ],
  paragraphs: splitBodyParagraphs(CHATGPT_SNAPSHOT.body),
});

// ── Create React App fixture ──────────────────────────────────────────────────

const craSnapshotResult = createAnswerSnapshot({
  questionId: "265479404",
  answerId: "1932577682752767964",
  capturedAt: 1_753_544_170_000,
  body: [
    "Create React App（CRA）长期以来是 React 官方推荐的创建新项目的首选方式。它将构建工具封装在底层，提供开箱即用的开发服务器和打包配置，让初学者无需单独配置即可开始编写 React 组件。",
    "CRA 的零配置理念是其核心优势。开发者只需运行一个命令即可初始化项目，剩下的事情由 CRA 的内部封装处理。这种设计降低了入门门槛，使前端工程师能够专注于业务逻辑和界面实现，而不用过早陷入构建工具的复杂性中。",
    "此外，CRA 还提供了统一的 Script 命令集合：npm start 用于本地开发，npm build 用于构建生产版本。与手动配置 Webpack 或 Vite 相比，CRA 的抽象让大多数项目能够遵循同一模式，团队间的协作和项目交接也变得更加顺畅。",
    "对于不需要后端路由和复杂部署场景的项目，CRA 仍然是一种务实的启动方式。它在社区中积累了丰富的第三方插件生态和教程资源，新成员通常能够通过搜索快速找到解决方案。",
  ].join(PARAGRAPH_SEPARATOR),
});

if (craSnapshotResult._tag === "failure") {
  throw new Error(`CRA fixture snapshot creation failed`);
}

const CRA_SNAPSHOT = craSnapshotResult.snapshot;

const craEvidence1: GoldenDemoEvidence = Object.freeze({
  title: "Sunsetting Create React App",
  organization: "React",
  publishedAt: 1_740_000_000_000,
  supportedFact:
    "React 官方博客宣布对新应用弃用 Create React App，并鼓励现有应用迁移到框架或现代构建工具。",
  sourceType: "官方博客",
  sourceUrl: REACT_BLOG_URL,
  quote: "Today, we’re deprecating Create React App for new apps.",
  capturedAt: 1_740_000_000_000,
});

const craEvidence2: GoldenDemoEvidence = Object.freeze({
  title: "facebook/create-react-app",
  organization: "Facebook / Meta",
  publishedAt: 1_740_000_000_000,
  supportedFact: "CRA 仓库 README 说明项目处于长期停滞状态，不推荐用 CRA 启动新的生产应用。",
  sourceType: "GitHub 仓库",
  sourceUrl: CRA_REPO_URL,
  quote: "it is now in long-term stasis",
  capturedAt: 1_740_000_000_000,
});

const craEvidence3: GoldenDemoEvidence = Object.freeze({
  title: "Creating a React App",
  organization: "React",
  publishedAt: 1_740_000_000_000,
  supportedFact: "React 官方文档推荐用框架创建新应用，并列出 Next.js、React Router 和 Expo。",
  sourceType: "官方文档",
  sourceUrl: REACT_LEARN_URL,
  quote:
    "If you want to build a new app or website with React, we recommend starting with a framework.",
  capturedAt: 1_740_000_000_000,
});

const createReactAppFixture: GoldenDemoFixture = makeFixture({
  id: "create-react-app",
  displayTitle: "Create React App 已不再是 React 官方推荐路径",
  topic: "React 生态",
  description: "2025 年 React 官方正式停止维护 CRA 并转向推荐 Next.js、React Router 等现代框架。",
  provenance: Object.freeze({
    kind: "curated-demo",
    model: "Create React App sunset — React ecosystem (Golden Demo, real source: 空山新雨后)",
    capturedAt: 1_753_544_170_000,
    note: "读体是从真实知乎回答的公开搜索摘要人工整理的，不是实时抓取，没有存储全文。",
  }),
  source: Object.freeze({
    url: "https://www.zhihu.com/question/265479404/answer/1932577682752767964",
    questionId: "265479404",
    answerId: "1932577682752767964",
    authorDisplayName: "空山新雨后",
    questionTitle: "怎么学习React?",
    sourceKind: "curated-from-search-summary",
    capturedAt: 1_753_544_170_000,
  }),
  snapshot: CRA_SNAPSHOT,
  syntheticAuthor: Object.freeze({
    displayName: "空山新雨后",
    initials: "空",
  }),
  capturedAt: 1_753_544_170_000,
  patches: [
    {
      id: "patch-1-cra-sunset",
      type: "UPDATE" as GoldenDemoPatchType,
      paragraphId: paragraphId(0),
      originalExcerpt:
        "Create React App（CRA）长期以来是 React 官方推荐的创建新项目的首选方式。它将构建工具封装在底层，提供开箱即用的开发服务器和打包配置，让初学者无需单独配置即可开始编写 React 组件。",
      currentChange:
        "React 团队于 2025 年 2 月 14 日宣布对新应用弃用 Create React App，并鼓励现有应用迁移到框架或 Vite、Parcel、RSBuild 等构建工具。官方文档现在推荐用框架创建新应用，并列出 Next.js、React Router 和 Expo。",
      impact:
        "将 CRA 作为 React 新项目的默认起点已不再准确；在规划技术选型时，应参考官方文档推荐的框架集合，而非沿用 CRA 作为默认标准工具。",
      asOf: 1_740_000_000_000,
      evidence: [craEvidence1, craEvidence2, craEvidence3],
    },
    {
      id: "patch-2-cra-scripts",
      type: "UPDATE" as GoldenDemoPatchType,
      paragraphId: paragraphId(2),
      originalExcerpt:
        "此外，CRA 还提供了统一的 Script 命令集合：npm start 用于本地开发，npm build 用于构建生产版本。与手动配置 Webpack 或 Vite 相比，CRA 的抽象让大多数项目能够遵循同一模式，团队间的协作和项目交接也变得更加顺畅。",
      currentChange:
        "React 官方博客指出 CRA 当前没有活跃维护者；CRA README 也说明项目进入长期停滞，不推荐用于新的生产应用。原回答把封装命令集当作长期稳定的协作基础，这一前提需要重新评估。",
      impact:
        "评估 CRA 的命令集和生态时，应把维护状态纳入前提；新项目应优先考虑官方推荐的框架或构建工具，而不是默认沿用 CRA。",
      asOf: 1_740_000_000_000,
      evidence: [craEvidence1, craEvidence3],
    },
  ],
  paragraphs: splitBodyParagraphs(CRA_SNAPSHOT.body),
});

// ── Delayed Retirement fixture ──────────────────────────────────────────────

const retirementSnapshotResult = createAnswerSnapshot({
  questionId: "8433630300",
  answerId: "69130072250",
  capturedAt: 1_735_722_820_000,
  body: [
    "根据现行规定，中国男性的法定退休年龄为六十周岁，女性干部（管理岗位）为五十五周岁，女性工人为五十周岁。这些退休年龄标准已在长期实践中稳定执行，是职工规划职业生涯和养老金领取时间的基本依据。",
    "法定退休年龄的确定与劳动力市场和社会福利制度密切相关。当前标准反映了历史上对劳动强度、岗位性质和社会角色的不同考量，公众在讨论退休政策时常常将此视为不可变动的基本制度框架。",
    "养老金制度通常与法定退休年龄紧密联动。达到法定退休年龄后，参保人员可以按月领取基本养老金，缴费年限不足者可以通过一次性补缴或者延后领取等方式进行处理。这些规定在养老保险法及相关配套政策中有明确规定。",
    "对于希望提前或推迟退休的人群，目前的弹性空间有限。绝大多数情况下，只有在特定岗位（如高温、有毒有害环境）工作的职工才享有提前退休政策。弹性退休制度的设计需要考虑社会承受力、基金可持续性和代际公平等多重因素。",
  ].join(PARAGRAPH_SEPARATOR),
});

if (retirementSnapshotResult._tag === "failure") {
  throw new Error(`Retirement fixture snapshot creation failed`);
}

const RETIREMENT_SNAPSHOT = retirementSnapshotResult.snapshot;

const retirementEvidence1: GoldenDemoEvidence = Object.freeze({
  title: "全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定",
  organization: "中国政府网（转载新华社）",
  publishedAt: 1_726_185_600_000,
  supportedFact:
    "决定用十五年过渡期调整法定退休年龄：男职工从六十周岁延迟至六十三周岁，女职工分别从五十周岁、五十五周岁延迟至五十五周岁、五十八周岁。",
  sourceType: "NPC 决定",
  sourceUrl: NPC_DECISION_URL,
  quote:
    "同步启动延迟男、女职工的法定退休年龄，用十五年时间，逐步将男职工的法定退休年龄从原六十周岁延迟至六十三周岁，将女职工的法定退休年龄从原五十周岁、五十五周岁分别延迟至五十五周岁、五十八周岁。",
  capturedAt: 1_726_185_600_000,
});

const retirementEvidence2: GoldenDemoEvidence = Object.freeze({
  title: "全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定",
  organization: "中国政府网（转载新华社）",
  publishedAt: 1_726_185_600_000,
  supportedFact:
    "决定明确实施原则为小步调整、弹性实施、分类推进、统筹兼顾，并自 2025 年 1 月 1 日起施行。",
  sourceType: "NPC 决定",
  sourceUrl: NPC_DECISION_URL,
  quote: "实施渐进式延迟法定退休年龄坚持小步调整、弹性实施、分类推进、统筹兼顾的原则。",
  capturedAt: 1_726_185_600_000,
});

const delayedRetirementFixture: GoldenDemoFixture = makeFixture({
  id: "delayed-retirement",
  displayTitle: "渐进式延迟法定退休年龄落地",
  topic: "社会政策",
  description: "2025 年起中国实施渐进式延迟退休，原法定退休年龄已随政策同步调整。",
  provenance: Object.freeze({
    kind: "curated-demo",
    model: "Delayed retirement policy — NPC 2024 (Golden Demo, real source: 北海皆非)",
    capturedAt: 1_735_722_820_000,
    note: "读体是从真实知乎回答的公开搜索摘要人工整理的，不是实时抓取，没有存储全文。",
  }),
  source: Object.freeze({
    url: "https://www.zhihu.com/question/8433630300/answer/69130072250",
    questionId: "8433630300",
    answerId: "69130072250",
    authorDisplayName: "北海皆非",
    questionTitle: "《实施弹性退休制度暂行办法》发布,2025年1月1日起实施,哪些内容值得关注?",
    sourceKind: "curated-from-search-summary",
    capturedAt: 1_735_722_820_000,
  }),
  snapshot: RETIREMENT_SNAPSHOT,
  syntheticAuthor: Object.freeze({
    displayName: "北海皆非",
    initials: "北",
  }),
  capturedAt: 1_735_722_820_000,
  patches: [
    {
      id: "patch-1-retirement-ages",
      type: "UPDATE" as GoldenDemoPatchType,
      paragraphId: paragraphId(0),
      originalExcerpt:
        "根据现行规定，中国男性的法定退休年龄为六十周岁，女性干部（管理岗位）为五十五周岁，女性工人为五十周岁。这些退休年龄标准已在长期实践中稳定执行，是职工规划职业生涯和养老金领取时间的基本依据。",
      currentChange:
        "全国人民代表大会常务委员会于 2024 年 9 月 13 日通过《关于实施渐进式延迟法定退休年龄的决定》，自 2025 年 1 月 1 日起实施渐进式延迟退休：男性从 60 岁延迟至 63 岁，原 55 岁退休的女性干部延迟至 58 岁，原 50 岁退休的女性工人延迟至 55 岁。决定同时设定了 15 年过渡期，遵循小步调整、弹性实施、分类推进、统筹兼顾的原则。",
      impact:
        "原文中引用的具体退休年龄数字自 2025 年 1 月 1 日起已发生变化；读者应将原文中的年龄数据视为历史参考值，并核对现行最新法定退休年龄规定进行个人规划。",
      asOf: 1_726_185_600_000,
      evidence: [retirementEvidence1, retirementEvidence2],
    },
    {
      id: "patch-2-pension-adjustment",
      type: "UPDATE" as GoldenDemoPatchType,
      paragraphId: paragraphId(2),
      originalExcerpt:
        "养老金制度通常与法定退休年龄紧密联动。达到法定退休年龄后，参保人员可以按月领取基本养老金，缴费年限不足者可以通过一次性补缴或者延后领取等方式进行处理。这些规定在养老保险法及相关配套政策中有明确规定。",
      currentChange:
        "新的决定明确：从 2030 年 1 月 1 日起，职工按月领取基本养老金的最低缴费年限由十五年逐步提高至二十年，每年提高六个月。达到法定退休年龄但不满最低缴费年限的，可按规定延长缴费或一次性缴费后按月领取。",
      impact:
        "原文中的十五年最低缴费年限不应继续当作长期固定标准；2030 年起规划养老金领取时间时，需要同时考虑退休年龄过渡和最低缴费年限逐年提高的安排。",
      asOf: 1_726_185_600_000,
      evidence: [retirementEvidence1, retirementEvidence2],
    },
  ],
  paragraphs: splitBodyParagraphs(RETIREMENT_SNAPSHOT.body),
});

// ── GOLDEN_DEMOS map ────────────────────────────────────────────────────

export const GOLDEN_DEMOS: Record<string, GoldenDemoFixture> = Object.freeze({
  "chatgpt-free-plus": goldenDemoFixture,
  "create-react-app": createReactAppFixture,
  "delayed-retirement": delayedRetirementFixture,
});
