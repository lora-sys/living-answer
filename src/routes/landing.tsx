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
      {/* ═══ Hero ───────────────────────────────────────────────────────── */}
      <header className="bg-ink text-paper">
        <div className="mx-auto w-full max-w-[1120px] px-5 pb-14 pt-12 sm:px-8 sm:pb-20 sm:pt-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/60">
            LIVING ANSWER
          </p>
          <h1 className="mt-6 font-display text-[40px] leading-[46px] font-normal tracking-[-0.02em] sm:text-[56px] sm:leading-[62px]">
            让旧回答
            <br />
            <span className="text-accent-soft">持续生长</span>
          </h1>
          <div className="mt-4 h-[2px] w-16 bg-accent" aria-hidden="true" />
          <p className="mt-6 max-w-[56ch] text-lg leading-8 text-paper/85">{PRODUCT_TAGLINE}</p>
          <p className="mt-3 max-w-[48ch] text-sm leading-6 text-paper/60">
            真实的回答会随着时间变化。AI 帮你追踪哪些回答已经过时，为什么。
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              to="/"
              className="inline-flex h-13 items-center rounded-[6px] bg-accent px-9 text-sm font-semibold text-on-accent transition-all duration-150 hover:bg-accent-hover hover:shadow-[0_4px_16px_rgb(23_70_255/0.35)] active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              开始学习线程
            </Link>
            <button
              type="button"
              onClick={handleWatchDemo}
              className="inline-flex min-h-13 items-center rounded-[6px] border border-paper/25 px-6 text-sm font-medium text-paper/85 transition-colors duration-150 hover:border-paper/50 hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              查看示例记录
            </button>
          </div>
        </div>
      </header>

      {/* ═══ Three pillars ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1120px] border-b border-rule px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8">
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
            <div key={pillar.kana} className="border-l-2 border-accent/25 pl-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
                {pillar.kana}
              </p>
              <h2 className="mt-3 text-[22px] font-semibold leading-8 tracking-[-0.02em]">
                {pillar.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-ink-subtle">{pillar.body}</p>
              <span
                aria-hidden="true"
                className="mt-4 block font-mono text-[28px] font-bold leading-none text-rule"
              >
                {String(idx + 1).padStart(2, "0")}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ How it works ───────────────────────────────────────────────── */}
      <section className="border-b border-rule bg-paper-2">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
            HOW IT WORKS
          </p>
          <h2 className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em]">
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
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent font-mono text-xs font-bold text-on-accent">
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
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
          PREPARED RECORDS
        </p>
        <h2
          id="demo-section-heading"
          className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em]"
        >
          示例记录
        </h2>
        <p className="mt-3 max-w-[68ch] text-base leading-7 text-ink-subtle">
          这些记录已有完整维护历史，展示系统如何处理随时间变化的前提和证据。
        </p>

        {/* Tab bar */}
        <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="示例记录">
          {DEMO_ORDER.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeDemo === id}
              onClick={() => setActiveDemo(id)}
              className={
                "inline-flex min-h-[36px] items-center rounded-[4px] px-3 text-sm font-medium transition-colors duration-150 " +
                (activeDemo === id
                  ? "border border-accent bg-accent text-on-accent"
                  : "border border-rule bg-paper-2 text-ink-subtle hover:border-accent/42 hover:text-ink")
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

      {/* ═══ CTA ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 sm:py-24">
        <div className="rounded-[4px] border border-rule bg-paper-2 px-8 py-10 sm:px-12 sm:py-14">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
            GET STARTED
          </p>
          <h2 className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em]">
            输入你的第一个问题
          </h2>
          <p className="mt-3 max-w-[68ch] text-base leading-7 text-ink-subtle">
            过去专家的回答会过时——前提、数据和共识都会改变。Living Answer
            帮助你追踪这些变化，而不是一遍一遍重读原文。
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex h-12 items-center rounded-[6px] bg-accent px-8 text-sm font-semibold text-on-accent transition-colors duration-150 hover:bg-accent-hover active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
      <div>
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
            <dd className="mt-1 text-sm leading-6 text-ink">{demo.snapshot.questionId}</dd>
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
                      className="block truncate text-xs text-accent-text underline-offset-2 hover:underline"
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
            <p className="text-sm text-ink-subtle">此回答暂无更新记录。</p>
          ) : (
            demo.patches.map((patch) => (
              <div key={patch.id} className="rounded-[2px] border border-rule bg-paper-2 p-4">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-[4px] px-2 py-1 font-mono text-[10px] font-semibold bg-update-soft text-update">
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
                      <div key={idx} className="rounded-[2px] bg-paper px-3 py-2">
                        <p className="text-[11px] leading-5 text-ink">{ev.supportedFact}</p>
                        <p className="mt-1 font-mono text-[10px] text-muted">
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
