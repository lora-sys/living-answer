import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { GOLDEN_DEMOS } from "../lib/golden-demo-fixture";
import { PRODUCT_TAGLINE } from "../lib/app-info";

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

const DEMO_ORDER = ["chatgpt-free-plus", "create-react-app", "delayed-retirement"] as const;

function Landing() {
  const [activeDemo, setActiveDemo] = useState<string>(DEMO_ORDER[0]);
  const current = GOLDEN_DEMOS[activeDemo];

  const handleWatchDemo = useCallback(() => {
    const el = document.getElementById("demo-output");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

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
                让旧回答
                <br />
                <span className="relative inline-block">
                  <span className="relative z-10">持续生长</span>
                  <span className="absolute bottom-1 left-0 right-0 h-[0.15em] bg-accent/15 -z-0" aria-hidden="true" />
                </span>
              </h1>
              <p className="mt-6 h-[3px] w-24 bg-rule-strong" aria-hidden="true" />
              <p className="mt-6 max-w-[56ch] text-lg leading-8 text-ink-subtle">{PRODUCT_TAGLINE}</p>
              <p className="mt-3 max-w-[48ch] text-sm leading-6 text-muted">
                真实的回答会随着时间变化。AI 帮你追踪哪些回答已经过时，为什么。
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link
                  to="/"
                  className="inline-flex h-13 items-center border-2 border-accent bg-accent px-9 text-sm font-semibold text-white transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-accent)] hover:bg-accent-hover active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  开始学习线程
                </Link>
                <button
                  type="button"
                  onClick={handleWatchDemo}
                  className="inline-flex min-h-13 items-center border-2 border-rule-strong bg-paper-3 px-6 text-sm font-medium text-ink transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-ink)] hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  查看示例记录
                </button>
              </div>
            </div>

            {/* Right — rotated featured demo card */}
            <div className="hidden lg:block">
              <div className="relative">
                <div
                  className="border-2 border-rule-strong bg-paper-3 p-6 shadow-[var(--shadow-panel)]"
                  style={{ transform: "rotate(-1.5deg)" }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    FEATURED DEMO
                  </p>
                  <h3 className="mt-2 text-[21px] font-semibold leading-8 text-ink">
                    {current.displayTitle}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-ink-subtle">
                    {current.description}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">主题</p>
                      <p className="mt-1 text-sm text-ink">{current.topic}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">更新数</p>
                      <p className="mt-1 text-sm text-ink">{current.patches.length} 条</p>
                    </div>
                  </div>
                  <div className="mt-5">
                    <button
                      onClick={handleWatchDemo}
                      className="inline-flex items-center gap-2 border-2 border-accent bg-accent px-5 text-xs font-semibold text-white transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-accent)] hover:bg-accent-hover active:translate-y-px active:bg-accent-active"
                    >
                      查看完整记录 →
                    </button>
                  </div>
                </div>
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
                title: "持续生长",
                body: "用一个线程串联波动中的世界——前提变了、分歧出现了，都记录在同一个结构里。",
                kana: "LIVING",
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
          PREPARED RECORDS
        </p>
        <h2
          id="demo-section-heading"
          className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em] text-ink"
        >
          示例记录
        </h2>
        <p className="mt-3 max-w-[68ch] text-base leading-7 text-ink-subtle">
          这些记录已有完整维护历史，展示系统如何处理随时间变化的前提和证据。
        </p>

        {/* Tab bar — square tabs with strong selected state */}
        <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="示例记录">
          {DEMO_ORDER.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeDemo === id}
              onClick={() => setActiveDemo(id)}
              className={
                "inline-flex min-h-[36px] items-center border-2 px-3 text-sm font-medium transition-colors duration-120 " +
                (activeDemo === id
                  ? "border-accent bg-accent text-white shadow-[2px_2px_0_rgba(0,0,0,0.15)]"
                  : "border-rule-strong bg-paper-3 text-ink-subtle hover:border-accent hover:text-ink hover:shadow-[3px_3px_0_var(--color-accent)]")
              }
            >
              {GOLDEN_DEMOS[id].displayTitle}
            </button>
          ))}
        </div>

        {current ? (
          <div className="mt-8">
            <GoldenDemoPanel demo={current} />
          </div>
        ) : null}
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
            过去专家的回答会过时——前提、数据和共识都会改变。Living Answer
            帮助你追踪这些变化，而不是一遍一遍重读原文。
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

// ── Golden demo panel ─────────────────────────────────────────────────────────

function GoldenDemoPanel({ demo }: { readonly demo: (typeof GOLDEN_DEMOS)[string] }) {
  const patchTypeLabel: Record<string, string> = {
    UPDATE: "更新",
    CORRECTION: "修正",
    CONDITION: "条件变化",
    BETTER_WAY: "更好的方式",
  };

  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
      <div className="border-2 border-rule-strong bg-paper-3 p-5 shadow-[var(--shadow-card)] sm:p-6">
        <h3 className="text-[17px] font-semibold leading-7 text-ink">{demo.displayTitle}</h3>
        <p className="mt-2 text-sm leading-6 text-ink-subtle">{demo.description}</p>

        <dl className="mt-5 space-y-3">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">主题</dt>
            <dd className="mt-1 text-sm leading-6 text-ink">{demo.topic}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              问题 ID
            </dt>
            <dd className="mt-1 font-mono text-[11px] leading-5 text-ink">{demo.snapshot.questionId}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">指纹</dt>
            <dd className="mt-1 font-mono text-[11px] leading-5 text-muted">
              {demo.snapshot.fingerprint}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              模型来源
            </dt>
            <dd className="mt-1 font-mono text-[11px] leading-5 text-muted">
              {demo.provenance.kind} · {demo.provenance.model}
            </dd>
          </div>
          {demo.provenance.openaiPrimarySources &&
            demo.provenance.openaiPrimarySources.length > 0 && (
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                  来源链接
                </dt>
                <dd className="mt-1 space-y-1">
                  {demo.provenance.openaiPrimarySources.map((src) => (
                    <a
                      key={src}
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-xs text-accent underline-offset-2 hover:underline"
                    >
                      {src}
                    </a>
                  ))}
                </dd>
              </div>
            )}
        </dl>
      </div>

      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
          PATCHES ({String(demo.patches.length)})
        </p>
        <div className="mt-4 space-y-4">
          {demo.patches.length === 0 ? (
            <p className="border border-rule bg-paper-3 px-4 py-3 text-sm text-ink-subtle">
              此回答暂无更新记录。
            </p>
          ) : (
            demo.patches.map((patch) => (
              <div
                key={patch.id}
                className="border-2 border-rule-strong bg-paper-3 p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center border border-update bg-update-soft px-2 py-1 font-mono text-[10px] font-semibold text-update">
                    {patchTypeLabel[patch.type] ?? patch.type}
                  </span>
                  <span className="font-mono text-[10px] text-muted">
                    {new Date(patch.asOf * 1000).toLocaleDateString("zh-CN")}
                  </span>
                </div>
                <h4 className="mt-2 text-[15px] font-semibold leading-7 text-ink">
                  {patch.paragraphId}
                </h4>
                <p className="mt-1 text-xs leading-5 text-ink-subtle">
                  {patch.currentChange.slice(0, 180)}
                  {patch.currentChange.length > 180 ? "…" : ""}
                </p>
                {patch.evidence.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {patch.evidence.map((ev, idx) => (
                      <div key={idx} className="border border-rule bg-paper-2 px-3 py-2">
                        <p className="text-[11px] leading-5 text-ink">{ev.supportedFact}</p>
                        <p className="mt-1 truncate font-mono text-[10px] text-muted">
                          {ev.sourceUrl || ev.title}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          {demo.patches.length > 0 && (
            <p className="text-xs text-muted">
              共 {String(demo.patches.length)} 个更新记录
              {demo.topic ? ` · ${demo.topic}` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
