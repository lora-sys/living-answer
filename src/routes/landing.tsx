import { createFileRoute, Link } from "@tanstack/react-router";

import { GoldenDemoPreviewCard } from "../components/demo/GoldenDemoPreviewCard";
import { GOLDEN_DEMOS } from "../lib/golden-demo-fixture";
import { PRODUCT_TAGLINE } from "../lib/app-info";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "了解产品 · Living Answer" },
      {
        name: "description",
        content: "Living Answer 为过去的知乎回答补充今天已经发生变化的关键前提与证据。",
      },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
      { rel: "alternate icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
  }),
  component: Landing,
});

const allDemos = [
  GOLDEN_DEMOS["chatgpt-free-plus"],
  GOLDEN_DEMOS["create-react-app"],
  GOLDEN_DEMOS["delayed-retirement"],
];
const featuredDemo = allDemos[0];

function Landing() {
  return (
    <main className="min-h-screen bg-paper pb-20 text-ink">
      {/* ═══ Statement hero ═══════════════════════════════════════════════════════ */}
      <section className="bg-ink text-paper">
        <div className="mx-auto w-full max-w-[1120px] px-5 pb-14 pt-12 sm:px-8 lg:pb-20 lg:pt-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/70">
            LIVING ANSWER
          </p>
          <h1 className="mt-6 font-display text-[32px] leading-[38px] font-normal tracking-[-0.01em] sm:text-[52px] sm:leading-[56px]">
            让旧回答与今天核对
          </h1>
          <p className="mt-6 max-w-[68ch] text-base leading-7 text-paper/78 sm:text-lg sm:leading-8">
            {PRODUCT_TAGLINE}
          </p>

          <dl className="mt-10 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-paper/24 pt-6 sm:grid-cols-3">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-paper/64">
                原文边界
              </dt>
              <dd className="mt-2 text-sm leading-6 text-paper/86">不替换原文</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-paper/64">
                证据门槛
              </dt>
              <dd className="mt-2 text-sm leading-6 text-paper/86">证据不足时不生成补丁</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-paper/64">
                来源可查
              </dt>
              <dd className="mt-2 text-sm leading-6 text-paper/86">每条变化回到一手来源</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1120px] space-y-16 px-5 sm:px-8">
        {/* ═══ Featured proof record ══════════════════════════════════════════════ */}
        <section aria-labelledby="featured-heading">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
              FEATURED PATCH
            </p>
          </div>
          <div className="mt-6">
            <GoldenDemoPreviewCard demo={featuredDemo} variant="hero" />
          </div>
        </section>

        {/* ═══ Three proof records ════════════════════════════════════════════════ */}
        <section aria-labelledby="proof-heading">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
              PROOF LEDGER
            </p>
            <h2
              id="proof-heading"
              className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em]"
            >
              三条可查记录
            </h2>
            <p className="mt-3 max-w-[68ch] text-base leading-7 text-ink-subtle">
              保留作者原答，指出今天需要核对的前提，再把结论放回来源旁边。
            </p>
          </div>

          <div className="mt-8 space-y-5">
            {allDemos.map((demo) => (
              <GoldenDemoPreviewCard key={demo.id} demo={demo} />
            ))}
          </div>
        </section>

        {/* ═══ Workflow ══════════════════════════════════════════════════════════ */}
        <section aria-labelledby="workflow-heading">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
              HOW IT WORKS
            </p>
            <h2
              id="workflow-heading"
              className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em]"
            >
              四步核对
            </h2>
          </div>

          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: "01",
                label: "获取摘录",
                desc: "通过搜索或链接获取知乎回答的公开摘要，不存储全文。",
              },
              {
                step: "02",
                label: "识别前提",
                desc: "从摘录中提取受影响的关键前提，标注波动性和决策相关度。",
              },
              {
                step: "03",
                label: "检索证据",
                desc: "针对每个前提，从一手来源检索当前状态，按来源可信度排序。",
              },
              {
                step: "04",
                label: "审阅记录",
                desc: "AI 给出变化描述与影响分析，人工确认后形成可复核的维护记录。",
              },
            ].map((item) => (
              <li
                key={item.step}
                className="rounded-[2px] border border-rule bg-paper-2 p-5 shadow-[var(--shadow-card)]"
              >
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-text">
                  STEP {item.step}
                </p>
                <p className="mt-3 text-[17px] font-semibold leading-7 text-ink">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-ink-subtle">{item.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ═══ Product boundaries ════════════════════════════════════════════════ */}
        <section aria-labelledby="boundaries-heading">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
              BOUNDARIES
            </p>
            <h2
              id="boundaries-heading"
              className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em]"
            >
              产品边界
            </h2>
          </div>

          <div className="mt-8 max-w-3xl space-y-4">
            {[
              {
                label: "不替代表达",
                desc: "原文作者的观点保持完整。维护记录标注的是世界的变化，不是作者的错误。",
              },
              {
                label: "证据优先",
                desc: "每条变化标注影响和证据。弱证据或冲突证据不会生成补丁。",
              },
              {
                label: "来源可查",
                desc: "所有变化都回到一手来源链接。可核查、可追溯、不可篡改。",
              },
              {
                label: "不生成通用答复",
                desc: "不会用 AI 生成替代性的通用回答。只补充已变化的关键前提。",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex gap-4 rounded-[2px] border border-rule bg-paper-2 px-5 py-4"
              >
                <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                  0x
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{item.label}</p>
                  <p className="mt-1 text-sm leading-6 text-ink-subtle">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ CTA ════════════════════════════════════════════════════════════════ */}
        <section className="border-t border-rule pt-12">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-display text-[32px] leading-[38px] font-normal tracking-[-0.01em] sm:text-[44px] sm:leading-[48px]">
              开始核对
            </h2>
            <p className="mt-4 max-w-[48ch] text-base leading-7 text-ink-subtle mx-auto">
              选择一个已有记录直接阅读，或搜索你想核对的问题。
            </p>
            <Link
              to="/"
              className="mt-8 inline-flex h-12 items-center rounded-[6px] bg-accent px-8 text-sm font-semibold text-on-accent transition-colors duration-150 hover:bg-accent-hover active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              进入答案空间
            </Link>
          </div>
        </section>

        {/* ═══ Footer ═════════════════════════════════════════════════════════════ */}
        <footer className="border-t border-rule pt-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink">
                LIVING ANSWER
              </p>
              <p className="mt-3 max-w-[68ch] text-sm leading-6 text-muted">
                为过去的知乎回答补充已变化的关键前提与证据源，不替换原文，也不生成通用最新答复。
              </p>
            </div>
            <div className="flex gap-6">
              <Link
                to="/changes"
                className="inline-flex min-h-11 items-center text-sm font-medium text-ink-subtle transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              >
                时间线
              </Link>
              <Link
                to="/sources"
                className="inline-flex min-h-11 items-center text-sm font-medium text-ink-subtle transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              >
                来源
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
