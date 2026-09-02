import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";

import { PRODUCT_TAGLINE } from "../lib/app-info";
import { FEATURED_THREADS } from "../lib/featured-threads";
import {
  searchAnswerCandidates,
  type AnswerCandidate,
  type SearchAnswerCandidatesResponse,
} from "../server/search-answer-candidates";
import { clarifyQuestionFn } from "../server/clarify-question";
import type { ClarifyQuestionResponse } from "../server/clarify-question";
import { generateThreadArtifactFn } from "../server/generate-thread-artifact";

// ── Starter questions ──────────────────────────────────────────────────────────

const STARTER_QUESTIONS = [
  "如何理解算法时间复杂度",
  "Flexbox 和 Grid 怎么选",
  "React Server Components 有什么用",
  "React 19 还值得学吗",
  "前端工程师 2026 要学什么",
  "Vue3 和 React18 如何选型",
] as const;

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "问题学习线程 · Living Answer",
      },
      {
        name: "description",
        content:
          "输入一个模糊问题，澄清学习意图，从真实知乎回答中选取摘录，生成一份持久的学习线程。",
      },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "alternate icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
  }),
  component: QuestionThreadEntry,
});

// ── Component ─────────────────────────────────────────────────────────────────

type GenerationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; threadId: string }
  | { status: "error"; code: string; message: string };

function QuestionThreadEntry() {
  const navigate = useNavigate();
  const boundSearch = useServerFn(searchAnswerCandidates);
  const boundClarify = useServerFn(clarifyQuestionFn);
  const boundGenerate = useServerFn(generateThreadArtifactFn);

  // Input state
  const [questionText, setQuestionText] = useState("");

  // Clarification state
  const [clarification, setClarification] = useState<ClarifyQuestionResponse | null>(null);
  const [clarificationLoading, setClarificationLoading] = useState(false);

  // Search state
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchRan, setSearchRan] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchAnswerCandidatesResponse | null>(null);

  // Selection state (Set of answerIds)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Generation state
  const [generation, setGeneration] = useState<GenerationState>({ status: "idle" });

  // Handlers

  const performSearch = useCallback(
    async (query: string) => {
      setSearchLoading(true);
      setSearchRan(true);
      setSearchResult(null);
      setSelectedIds(new Set());

      const result = await boundSearch({ data: { query } }).catch(() => null);
      if (result) {
        setSearchResult(result as SearchAnswerCandidatesResponse);
      } else {
        setSearchResult({
          status: "error",
          message: "搜索失败，请稍后再试。",
        } as SearchAnswerCandidatesResponse);
      }
      setSearchLoading(false);
    },
    [boundSearch],
  );

  const handleClarify = useCallback(
    async (question: string) => {
      setClarificationLoading(true);
      setClarification(null);
      setGeneration({ status: "idle" });

      const raw = await boundClarify({ data: { question } }).catch(() => null);
      if (raw && raw.success) {
        setClarification(raw);
        await performSearch(raw.refinedQuery);
      } else {
        await performSearch(question);
        if (raw) {
          setClarification(raw);
        }
      }
      setClarificationLoading(false);
    },
    [boundClarify, performSearch],
  );

  const handleQuestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = questionText.trim();
    if (!trimmed || clarificationLoading || searchLoading) return;
    setSearchResult(null);
    setSelectedIds(new Set());
    void handleClarify(trimmed);
  };

  const handleStarterClick = async (question: string) => {
    setQuestionText(question);
    setSearchResult(null);
    setSelectedIds(new Set());
    setGeneration({ status: "idle" });
    void handleClarify(question);
  };

  const handleAlternativeClick = useCallback(
    async (altQuery: string) => {
      setSelectedIds(new Set());
      setSearchResult(null);
      setGeneration({ status: "idle" });
      if (clarification?.success) {
        setClarification({
          ...clarification,
          refinedQuery: altQuery,
        });
      }
      await performSearch(altQuery);
    },
    [clarification, performSearch],
  );

  const toggleCandidate = (candidate: AnswerCandidate) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidate.answerId)) {
        next.delete(candidate.answerId);
      } else {
        next.add(candidate.answerId);
      }
      return next;
    });
  };

  const handleGenerate = useCallback(async () => {
    if (selectedIds.size === 0 || !clarification?.success) return;
    setGeneration({ status: "loading" });

    const selectedCandidates =
      searchResult?.status === "ok"
        ? searchResult.candidates.filter((c) => selectedIds.has(c.answerId))
        : [];

    const raw = await boundGenerate({
      data: {
        question: questionText.trim(),
        refinedQuery: clarification.refinedQuery,
        learningIntent: clarification.learningIntent,
        confidence: clarification.confidence,
        selectedCandidates: selectedCandidates.map((c) => ({
          questionId: c.questionId,
          answerId: c.answerId,
          title: c.title,
          authorDisplayName: c.authorDisplayName ?? "",
          editTime: c.editAt ?? 0,
          canonicalUrl: c.url,
          excerptFingerprint: c.excerptFingerprint,
        })),
      },
    }).catch(() => null);

    if (raw && raw.success) {
      const threadId = raw.threadId;
      setGeneration({ status: "success", threadId });
      void navigate({ to: "/thread/$threadId", params: { threadId } });
    } else {
      setGeneration({
        status: "error",
        code: raw?.code ?? "SYNTHESIS_UNAVAILABLE",
        message: raw?.message ?? "生成学习线程时出现异常，请稍后再试。",
      });
    }
  }, [boundGenerate, clarification, questionText, searchResult, selectedIds, navigate]);

  // Derived state

  const selectedCount = selectedIds.size;
  const canGenerate =
    selectedCount > 0 && clarification?.success && generation.status !== "loading";

  // Render

  return (
    <main className="min-h-screen bg-paper pb-20 text-ink">
      {/* Hero */}
      <header className="relative overflow-hidden bg-paper bg-halftone pb-14 pt-10 sm:pb-20 sm:pt-14">
        <div aria-hidden="true" className="pointer-events-none absolute -right-6 top-10 hidden h-40 w-40 rounded-full halftone-patch sm:block" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-3 bottom-10 block-black h-14 w-14 sm:block" />
        <div aria-hidden="true" className="pointer-events-none absolute right-[8%] top-[18%] hidden h-2 w-28 bar-black sm:block" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-2 bottom-0 hidden h-16 w-16 contour-lines sm:block" />

        <div className="relative z-10 mx-auto w-full max-w-[1120px] px-5 sm:px-8">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12 lg:items-center">
            {/* Left column */}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                LIVING ANSWER · 问题学习线程
              </p>
              <h1 className="mt-6 font-display text-[36px] font-bold leading-[1.08] tracking-tight sm:text-[52px] lg:text-[56px]">
                把回答
                <br />
                <span className="relative inline-block">
                  <span className="relative z-10">串成学习线</span>
                  <span className="absolute bottom-1 left-0 right-0 h-3 bg-accent/15 -z-0" aria-hidden="true" />
                </span>
              </h1>
              <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                输入模糊问题 → 澄清意图 → 选取摘录 → 生成线程
              </p>
              <p className="mt-2 h-[3px] w-24 bg-rule-strong" aria-hidden="true" />
              <p className="mt-5 max-w-[56ch] text-lg leading-8 text-ink-subtle">{PRODUCT_TAGLINE}</p>
            </div>

            {/* Right column — framed input card */}
            <div className="lg:max-w-md">
              <div className="border-2 border-rule-strong bg-paper-3 p-5 shadow-[var(--shadow-panel)] sm:p-7">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                  THREAD ENTRY
                </p>
                <h2 className="mt-2 font-display text-lg font-semibold leading-7 text-ink">
                  输入你的问题
                </h2>
                <p className="mt-1 text-sm leading-6 text-ink-subtle">
                  不需要措辞完美。AI 会帮你澄清意图并搜索匹配的知乎回答。
                </p>
                <form onSubmit={handleQuestionSubmit} noValidate className="mt-5">
                  <label htmlFor="thread-question-input" className="sr-only">
                    输入你的问题
                  </label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                      id="thread-question-input"
                      type="text"
                      value={questionText}
                      onChange={(e) => setQuestionText(e.target.value)}
                      placeholder="例如：React 19 还值得学吗"
                      disabled={clarificationLoading || searchLoading || generation.status === "loading"}
                      autoComplete="off"
                      className="h-14 flex-1 border-2 border-rule-strong bg-white px-4 text-base text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15"
                    />
                    <button
                      type="submit"
                      disabled={clarificationLoading || searchLoading || generation.status === "loading"}
                      className="inline-flex h-14 shrink-0 items-center justify-center border-2 border-accent bg-accent px-7 text-sm font-semibold text-white transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-accent)] hover:bg-accent-hover active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {clarificationLoading ? "正在澄清…" : "开始 →"}
                    </button>
                  </div>
                </form>
              </div>

              {!searchRan && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {STARTER_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => handleStarterClick(q)}
                      title="AI 会自动帮你澄清意图"
                      disabled={
                        clarificationLoading || searchLoading || generation.status === "loading"
                      }
                      className="inline-flex min-h-[36px] items-center border-2 border-rule-strong bg-paper-2 px-2.5 text-xs font-medium text-ink-subtle transition-all duration-120 hover:border-accent hover:-translate-y-px hover:shadow-[3px_3px_0_var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <span aria-hidden="true" className="mr-1.5 h-1.5 w-1.5 bg-ink-subtle" />
                      {q}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2.5 text-[11px] text-muted font-mono tracking-[0.04em]">
                输入仅用于本轮 AI 澄清，不会持久化你的原始问题
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1120px] space-y-12 px-5 sm:px-8">
        {/* Clarification panel */}
        {clarification != null && (
          <section className="border-t border-rule pt-10">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
                CLARIFICATION
              </p>
              <h2 className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em] text-ink">
                澄清学习意图
              </h2>
            </div>

            {clarification.success ? (
              <div className="mt-6 max-w-3xl space-y-4 border border-rule bg-paper-2 px-5 py-5 shadow-[var(--shadow-card)]">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    精炼查询
                  </p>
                  <p className="mt-1 text-base font-semibold text-ink">
                    {clarification.refinedQuery}
                  </p>
                </div>

                {clarification.alternatives.length > 0 && (
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                      备选查询
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {clarification.alternatives.map((alt) => (
                        <button
                          key={alt}
                          type="button"
                          onClick={() => void handleAlternativeClick(alt)}
                          className="inline-flex min-h-11 items-center border border-rule-strong bg-paper px-3 text-sm text-ink-subtle transition-colors duration-150 hover:border-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          {alt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    学习意图
                  </p>
                  <p className="mt-1 text-sm leading-6 text-ink-subtle">
                    {clarification.learningIntent}
                  </p>
                  <p className="mt-2 text-sm text-muted">{clarification.guidance}</p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden bg-paper">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${Math.round(clarification.confidence * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-muted">
                    {(clarification.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-6 max-w-3xl border border-rule bg-paper-2 px-5 py-4">
                <p className="text-sm font-medium text-ink-subtle">
                  {clarification.message ?? "澄清服务暂时不可用，已使用原始查询搜索。"}
                </p>
              </div>
            )}
          </section>
        )}

        {/* Search results */}
        {(searchResult?.status === "error" || searchResult?.status === "ok") && (
          <section className="border-t border-rule pt-10">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
                SEARCH RESULTS
              </p>
              <h2 className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em] text-ink">
                选择回答摘录
              </h2>
            </div>

            {searchLoading && searchResult === null && (
              <div className="mt-6 max-w-3xl space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="border border-rule bg-paper-3 shadow-[var(--shadow-card)]"
                    style={{ height: 120 }}
                  >
                    <div className="space-y-3 p-5">
                      <div
                        className="bg-rule"
                        style={{ width: i % 2 === 0 ? "75%" : "60%", height: 14 }}
                      />
                      <div
                        className="bg-rule/60"
                        style={{ width: "90%", height: 12 }}
                      />
                      <div
                        className="bg-rule/40"
                        style={{ width: "55%", height: 12 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {searchResult?.status === "error" && (
              <div className="mt-6 max-w-3xl border border-rule bg-paper-2 px-5 py-4">
                <p className="text-sm font-medium text-ink-subtle">{searchResult.message}</p>
                <p className="mt-2 text-sm text-muted">尝试换个表述或使用更具体的关键词。</p>
              </div>
            )}

            {searchResult?.status === "ok" && searchResult.candidates.length === 0 && (
              <div className="mt-6 max-w-3xl border border-rule bg-paper-2 px-5 py-5">
                <p className="text-sm font-semibold text-ink">没有找到匹配的回答候选</p>
                <p className="mt-2 max-w-[68ch] text-sm leading-6 text-ink-subtle">
                  换一个更具体的问题关键词，通常比完整链接更容易命中。
                </p>
              </div>
            )}

            {searchResult?.status === "ok" && searchResult.candidates.length > 0 && (
              <div className="mt-6 max-w-3xl space-y-3">
                {searchResult.candidates.map((c) => {
                  const isSelected = selectedIds.has(c.answerId);
                  return (
                    <button
                      key={c.answerId}
                      type="button"
                      onClick={() => toggleCandidate(c)}
                      className={
                        "block w-full border bg-paper-3 px-5 py-5 text-left shadow-[var(--shadow-card)] transition-colors duration-150 " +
                        (isSelected
                          ? "border-accent border-2"
                          : "border-rule-strong hover:border-accent hover:shadow-[3px_3px_0_var(--color-accent)]")
                      }
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 " +
                            (isSelected ? "border-accent bg-accent" : "border-rule")
                          }
                        >
                          {isSelected && (
                            <svg
                              viewBox="0 0 12 10"
                              className="h-3 w-3 fill-none stroke-white"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M1 5l3 3 5-6" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[17px] font-semibold leading-7 text-ink">
                            {c.title || `知乎回答 #${c.answerId}`}
                          </p>
                          {c.preview && (
                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-subtle">
                              {c.preview}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tracking-[0.04em] text-muted">
                            {c.authorDisplayName && (
                              <span>
                                作者{" "}
                                <span className="font-medium text-ink-subtle">
                                  {c.authorDisplayName}
                                </span>
                              </span>
                            )}
                            {c.editAt != null && (
                              <span>
                                编辑于 {new Date(c.editAt * 1000).toLocaleDateString("zh-CN")}
                              </span>
                            )}
                            <span>
                              问题 #{c.questionId} · 回答 #{c.answerId}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Generate action */}
        {selectedCount > 0 && (
          <section className="border-t border-rule pt-10">
            <div className="max-w-3xl">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={
                  "inline-flex h-12 items-center justify-center border-2 border-accent bg-accent px-8 text-sm font-semibold text-white transition-all duration-120 " +
                  (canGenerate
                    ? "hover:shadow-[3px_3px_0_var(--color-accent)] hover:bg-accent-hover active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    : "opacity-45")
                }
              >
                {generation.status === "loading"
                  ? "正在生成…"
                  : `生成学习线程 (${selectedCount} 个候选)`}
              </button>
              {generation.status === "loading" && (
                <p className="mt-3 text-[11px] text-muted font-mono tracking-[0.04em]">
                  正在综合学习意图，生成学习节点…
                </p>
              )}
              {generation.status === "error" && (
                <p className="mt-3 text-sm text-update">{generation.message}</p>
              )}
            </div>
          </section>
        )}

        {/* Featured learning threads */}
        <section aria-labelledby="demo-heading">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
              FEATURED LEARNING THREADS
            </p>
            <h2
              id="demo-heading"
              className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em] text-ink"
            >
              先看三条真实学习线程
            </h2>
            <p className="mt-3 max-w-[68ch] text-base leading-7 text-ink-subtle">
              每条线程都由真实知乎回答、跨年份摘录和 AI 学习节点组成。看完再去生成属于你的问题线。
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {FEATURED_THREADS.map((thread) => (
              <Link
                key={thread.threadId}
                to="/thread/$threadId"
                params={{ threadId: thread.threadId }}
                className="group relative flex h-full flex-col border-2 border-rule-strong bg-paper-3 p-5 shadow-[var(--shadow-card)] transition-all duration-150 hover:-translate-y-1 hover:shadow-[5px_5px_0_var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
                  <span>{thread.stageCount} 段 · {thread.nodeCount} 个学习点</span>
                  <span className="text-ink transition-transform duration-150 group-hover:translate-x-1">
                    进入 →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-rule pt-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink">
                LIVING ANSWER
              </p>
              <p className="mt-3 max-w-[68ch] text-sm leading-6 text-muted">
                输入一个模糊问题，澄清学习意图，从真实知乎回答中选取摘录，生成一份持久的学习线程。
              </p>
            </div>
            <div className="flex gap-6">
              <Link
                to="/landing"
                className="inline-flex min-h-11 items-center text-sm font-medium text-ink-subtle transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                了解产品
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
