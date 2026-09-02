import { createFileRoute, Link } from "@tanstack/react-router";

import { PRODUCT_TAGLINE } from "../lib/app-info";
import { FEATURED_THREADS } from "../lib/featured-threads";

export const Route = createFileRoute("/landing")({
  head: () => ({
    meta: [
      { title: "了解产品 · Living Answer" },
      {
        name: "description",
        content: PRODUCT_TAGLINE,
      },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const featuredThread = FEATURED_THREADS[0];

  return (
    <main className="min-h-screen bg-paper pb-20 text-ink">
      {/* ═══ Asymmetric collage hero ════════════════════════════════════ */}
      <header className="relative overflow-hidden bg-paper bg-halftone pb-14 pt-12 sm:pb-20 sm:pt-16">
        {/* Collage geometry: blue block, halftone, black circle, contour */}
        <div aria-hidden="true" className="pointer-events-none absolute bottom-[8%] right-[3%] hidden h-24 w-36 lg:block block-blue" />
        <div aria-hidden="true" className="pointer-events-none absolute right-[6%] top-[14%] hidden lg:block h-44 w-44 rounded-full halftone-patch" />
        <div aria-hidden="true" className="pointer-events-none absolute right-[20%] bottom-[10%] hidden lg:block block-black h-20 w-20 rounded-full" />
        <div aria-hidden="true" className="pointer-events-none absolute left-[40%] top-[8%] hidden lg:block h-2 w-36 bar-black" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block contour-lines" />

        <div className="relative z-10 mx-auto w-full max-w-[1120px] px-5 sm:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-14 lg:items-center">
            {/* Left — oversized headline */}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                LIVING ANSWER
              </p>
              <h1
                className="mt-6 font-display font-bold leading-[1.05] tracking-tight"
                style={{ fontSize: "clamp(2.5rem, 7vw, 5.5rem)" }}
              >
                把回答
                <br />
                <span className="relative inline-block">
                  <span className="relative z-10">串成学习线</span>
                  <span className="absolute bottom-1 left-0 right-0 h-[0.15em] bg-accent/15 -z-0" aria-hidden="true" />
                </span>
              </h1>
              <p className="mt-6 h-[3px] w-24 bg-rule-strong" aria-hidden="true" />
              <p className="mt-6 max-w-[56ch] text-lg leading-8 text-ink-subtle">{PRODUCT_TAGLINE}</p>
              <p className="mt-3 max-w-[48ch] text-sm leading-6 text-muted">
                真实回答分散在知乎的不同年份。AI 帮你澄清意图，并把它们串成能理解的知识路径。
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link
                  to="/"
                  className="inline-flex h-13 items-center border-2 border-accent bg-accent px-9 text-sm font-semibold text-white transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-accent)] hover:bg-accent-hover active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  开始学习线程
                </Link>
                <Link
                  to="/"
                  className="inline-flex min-h-13 items-center border-2 border-rule-strong bg-paper-3 px-6 text-sm font-medium text-ink transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-ink)] hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  直接提问
                </Link>
              </div>
            </div>

            {/* Right — rotated featured thread card */}
            <div className="hidden lg:block">
              <div className="relative">
                <Link
                  to="/thread/$threadId"
                  params={{ threadId: featuredThread.threadId }}
                  className="group block border-2 border-rule-strong bg-paper-3 p-6 shadow-[var(--shadow-panel)] transition-all duration-150 hover:shadow-[7px_7px_0_var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  style={{ transform: "rotate(-1.5deg)" }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    FEATURED THREAD
                  </p>
                  <h3 className="mt-2 text-[21px] font-semibold leading-8 text-ink">
                    {featuredThread.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-ink-subtle">
                    {featuredThread.description}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">时间线</p>
                      <p className="mt-1 text-sm text-ink">{featuredThread.yearRange}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">节点</p>
                      <p className="mt-1 text-sm text-ink">
                        {featuredThread.nodeCount} 个
                      </p>
                    </div>
                  </div>
                  <div className="mt-5">
                    <span className="inline-flex items-center gap-2 border-2 border-accent bg-accent px-5 text-xs font-semibold text-white transition-all duration-120 group-hover:shadow-[3px_3px_0_var(--color-accent)] group-hover:bg-accent-hover">
                      查看完整线程 →
                    </span>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ═══ Three pillars ──────────────────────────────────────────────── */}
      <section className="border-b border-rule">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
            CORE PILLARS
          </p>
          <h2 className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em] text-ink">
            三个不变的原则
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-8">
            {[
              {
                title: "精确摘录",
                body: "每段引用都来自真实知乎回答，带作者、时间与可追溯的边界说明。",
                kana: "PRECISE",
              },
              {
                title: "意图驱动",
                body: "先澄清学习意图再匹配回答，避免模糊匹配，让搜索更贴合真实需求。",
                kana: "INTENT",
              },
              {
                title: "学习节点",
                body: "把跨年份回答整理成共识、分歧、演变和因果，让知识变成能继续追问的路径。",
                kana: "THREAD",
              },
            ].map((pillar, idx) => (
              <div
                key={pillar.kana}
                className="relative overflow-hidden border-2 border-rule-strong bg-paper-3 p-6 shadow-[var(--shadow-card)] transition-all duration-120 hover:shadow-[5px_5px_0_var(--color-accent)] hover:-translate-y-0.5"
              >
                {/* Numeric watermark */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-2 -top-4 font-display text-[80px] font-bold leading-none text-ink/[0.04] select-none"
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                {/* Corner index block */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-3 right-3 flex h-7 w-7 items-center justify-center border border-rule bg-paper-2 font-mono text-[10px] font-bold text-muted"
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                  {pillar.kana}
                </p>
                <h2 className="mt-3 text-[22px] font-semibold leading-8 tracking-[-0.02em] text-ink">
                  {pillar.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-ink-subtle">{pillar.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ How it works ───────────────────────────────────────────────── */}
      <section className="border-b border-rule bg-paper-2">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
            HOW IT WORKS
          </p>
          <h2 className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em] text-ink">
            四步生成学习线程
          </h2>
          <ol
            className="relative mt-10 grid list-none grid-cols-1 gap-8 sm:grid-cols-4"
            role="list"
          >
            {[
              {
                step: "01",
                title: "输入模糊问题",
                body: "不必措辞完美。系统会理解意图并将问题精炼为高质量查询。",
              },
              {
                step: "02",
                title: "澄清学习意图",
                body: "确认自己要找什么：定义、因果、演变、分歧，或者只是开阔视野。",
              },
              {
                step: "03",
                title: "选取回答摘录",
                body: "从真实知乎回答中手动选择引用范围，每条引用均有来源标注。",
              },
              {
                step: "04",
                title: "生长学习线程",
                body: "系统生成结构化学习节点：关系、因果、演变、共识、分歧，加上可追溯的引用。",
              },
            ].map((item) => (
              <li key={item.step} className="relative">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center border-2 border-accent bg-accent font-mono text-xs font-bold text-white">
                    {item.step}
                  </span>
                  <span aria-hidden="true" className="hidden h-px flex-1 bg-rule sm:block" />
                </div>
                <h3 className="mt-4 text-[17px] font-semibold leading-7 text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-subtle">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ═══ Demo records ────────────────────────────────────────────────── */}
      <section
        id="demo-output"
        aria-labelledby="demo-section-heading"
        className="mx-auto max-w-[1120px] border-b border-rule px-5 py-16 sm:px-8"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
          FEATURED THREADS
        </p>
        <h2
          id="demo-section-heading"
          className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em] text-ink"
        >
          三条真实学习线程
        </h2>
        <p className="mt-3 max-w-[68ch] text-base leading-7 text-ink-subtle">
          不是包装过的静态文档。每条线程都从真实知乎回答开始，再由 AI 拆成可检查的学习节点。
        </p>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {FEATURED_THREADS.map((thread) => (
            <Link
              key={thread.threadId}
              to="/thread/$threadId"
              params={{ threadId: thread.threadId }}
              className="group flex h-full flex-col border-2 border-rule-strong bg-paper-3 p-5 shadow-[var(--shadow-card)] transition-all duration-150 hover:-translate-y-1 hover:shadow-[5px_5px_0_var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                  {thread.label}
                </span>
                <span className="font-mono text-[10px] text-muted">{thread.yearRange}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold leading-7 text-ink">{thread.title}</h3>
              <p className="mt-3 flex-1 text-sm leading-6 text-ink-subtle">{thread.description}</p>
              <div className="mt-5 flex items-center justify-between border-t border-rule pt-4 font-mono text-[11px] text-muted">
                <span>
                  {thread.stageCount} 段 · {thread.nodeCount} 个学习点
                </span>
                <span className="text-ink transition-transform duration-150 group-hover:translate-x-1">
                  进入 →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ═══ CTA — poster card ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-24">
        <div className="relative border-2 border-rule-strong bg-paper-3 px-8 py-10 shadow-[var(--shadow-panel)] sm:px-12 sm:py-14">
          {/* One geometric accent: top blue rule */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-accent" aria-hidden="true" />

          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
            GET STARTED
          </p>
          <h2 className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em] text-ink">
            输入你的第一个问题
          </h2>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-ink-subtle">
            你的问题值得一条学习路径，而不是一个孤立答案。先看真实线程，再生成属于你的那条。
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex h-12 items-center justify-center border-2 border-accent bg-accent px-8 text-sm font-semibold text-white transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-accent)] hover:bg-accent-hover active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            开始使用
          </Link>
        </div>
      </section>
    </main>
  );
}
