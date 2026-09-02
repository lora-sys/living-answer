import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";

import { GOLDEN_DEMOS } from "../lib/golden-demo-fixture";
import type { GoldenDemoFixture } from "../lib/golden-demo-fixture";
import { PRODUCT_TAGLINE } from "../lib/app-info";
import {
  searchAnswerCandidates,
  type AnswerCandidate,
  type SearchAnswerCandidatesResponse,
} from "../server/search-answer-candidates";
import { clarifyQuestionFn } from "../server/clarify-question";
import type { ClarifyQuestionResponse } from "../server/clarify-question";
import { generateThreadArtifactFn } from "../server/generate-thread-artifact";
import { GoldenDemoPreviewCard } from "../components/demo/GoldenDemoPreviewCard";

// ── Starter questions ──────────────────────────────────────────────────────────

const STARTER_QUESTIONS = [
  "ChatGPT Free 与 Plus 有什么关键差异",
  "Create React App 还值得学吗",
  "渐进式延迟法定退休年龄落地了吗",
  "为什么 QWERTY 键盘布局保留至今",
  "人民币汇率近期有什么变化",
  "电动汽车续航虚标问题现状",
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
  const [showAdvancedUrl, setShowAdvancedUrl] = useState(false);

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

  // ══ Handlers ═════════════════════════════════════════════════════════════════

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
        // Clarification failed — fall back to raw search with original question
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

  // ── Derived state ────────────────────────────────────────────────────────

  const goldenDemos: GoldenDemoFixture[] = [
    GOLDEN_DEMOS["chatgpt-free-plus"],
    GOLDEN_DEMOS["create-react-app"],
    GOLDEN_DEMOS["delayed-retirement"],
  ];
  const selectedCount = selectedIds.size;
  const canGenerate =
    selectedCount > 0 && clarification?.success && generation.status !== "loading";

  // ══ Render ══════════════════════════════════════════════════════════════════

  return (
    <main className="min-h-screen bg-paper pb-20 text-ink">
      {/* ═══ Header ───────────────────────────────────────────────────────── */}
      <header className="bg-ink text-paper">
        <div className="mx-auto w-full max-w-[1120px] px-5 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/70">
            LIVING ANSWER · 问题学习线程
          </p>
          <p className="mt-3 max-w-[68ch] text-sm leading-6 text-paper/74 sm:text-base sm:leading-7">
            {PRODUCT_TAGLINE}
          </p>
          <p className="mt-3 max-w-[60ch] text-base leading-7 text-ink-subtle">
            真实的回答会随着时间变化。AI 帮你追踪哪些回答已经过时，为什么。
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1120px] space-y-12 px-5 sm:px-8">
        {/* ═══ Question entry ══════════════════════════════════════════════ */}
        <section className="pt-10">
          <form onSubmit={handleQuestionSubmit} noValidate className="max-w-3xl">
            <p className="text-xs text-muted">试试输入一个模糊的问题，不需要措辞完美</p>
            <label htmlFor="thread-question-input" className="sr-only">
              输入你的问题
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                id="thread-question-input"
                type="text"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder="输入模糊的问题，例如：React 19 还值得学吗"
                disabled={clarificationLoading || searchLoading || generation.status === "loading"}
                autoComplete="off"
                className="h-14 flex-1 rounded-[4px] border border-rule bg-paper-3 px-4 text-base text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-paper disabled:text-faint"
              />
              <button
                type="submit"
                disabled={clarificationLoading || searchLoading || generation.status === "loading"}
                className="inline-flex h-14 shrink-0 items-center justify-center rounded-[6px] bg-accent px-7 text-sm font-semibold text-on-accent transition-colors duration-150 hover:bg-accent-hover active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-rule disabled:text-faint"
              >
                {clarificationLoading ? "正在澄清…" : "开始 →"}
              </button>
            </div>
          </form>

          {/* Starter chips ────────────────────────────────────────────────── */}
          {!searchRan && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">试试：</span>
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleStarterClick(q)}
                  title="AI 会自动帮你澄清意图"
                  disabled={
                    clarificationLoading || searchLoading || generation.status === "loading"
                  }
                  className="inline-flex min-h-[36px] items-center rounded-[4px] border border-rule bg-paper-2 px-3 text-xs font-medium text-ink-subtle transition-colors duration-150 hover:border-accent/42 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-faint font-mono tracking-[0.04em]">
            输入仅用于本轮 AI 澄清，不会持久化你的原始问题
          </p>
        </section>

        {/* ═══ Clarification panel ───────────────────────────────────────── */}
        {clarification != null && (
          <section className="border-t border-rule pt-10">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
                CLARIFICATION
              </p>
              <h2 className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em]">
                澄清学习意图
              </h2>
            </div>

            {clarification.success ? (
              <div className="mt-6 max-w-3xl space-y-4 rounded-[2px] border border-rule bg-paper-2 px-5 py-5 shadow-[var(--shadow-card)]">
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
                          className="inline-flex min-h-11 items-center rounded-[4px] border border-rule bg-paper px-3 text-sm text-ink-subtle transition-colors duration-150 hover:border-accent/42 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.round(clarification.confidence * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-muted">
                    {(clarification.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="mt-6 max-w-3xl rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
                <p className="text-sm font-medium text-ink-subtle">
                  {clarification.message ?? "澄清服务暂时不可用，已使用原始查询搜索。"}
                </p>
              </div>
            )}
          </section>
        )}

        {/* ═══ Search results ────────────────────────────────────────────── */}
        {(searchResult?.status === "error" || searchResult?.status === "ok") && (
          <section className="border-t border-rule pt-10">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
                SEARCH RESULTS
              </p>
              <h2 className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em]">
                选择回答摘录
              </h2>
            </div>

            {searchResult?.status === "error" && (
              <div className="mt-6 max-w-3xl rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
                <p className="text-sm font-medium text-ink-subtle">{searchResult.message}</p>
                <p className="mt-2 text-sm text-muted">尝试换个表述或使用更具体的关键词。</p>
              </div>
            )}

            {searchResult?.status === "ok" && searchResult.candidates.length === 0 && (
              <div className="mt-6 max-w-3xl rounded-[2px] border border-rule bg-paper-2 px-5 py-5">
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
                        "block w-full rounded-[2px] border bg-paper-2 px-5 py-5 text-left shadow-[var(--shadow-card)] transition-colors duration-150 " +
                        (isSelected
                          ? "border-accent shadow-[0_1px_0_var(--color-accent),var(--shadow-card)]"
                          : "border-rule hover:border-accent/42")
                      }
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border " +
                            (isSelected ? "border-accent bg-accent" : "border-rule")
                          }
                        >
                          {isSelected && (
                            <svg
                              viewBox="0 0 12 10"
                              className="h-3 w-3 fill-none stroke-on-accent"
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

        {/* ═══ Generate action ────────────────────────────────────────────── */}
        {selectedCount > 0 && (
          <section className="border-t border-rule pt-10">
            <div className="max-w-3xl">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={
                  "inline-flex h-12 items-center rounded-[6px] px-8 text-sm font-semibold transition-colors duration-150 " +
                  (canGenerate
                    ? "bg-accent text-on-accent hover:bg-accent-hover active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    : "cursor-not-allowed bg-rule text-faint")
                }
              >
                {generation.status === "loading"
                  ? "正在生成学习线程…"
                  : `生成学习线程 (${selectedCount} 个候选)`}
              </button>
              {generation.status === "error" && (
                <p className="mt-3 text-sm text-update">{generation.message}</p>
              )}
            </div>
          </section>
        )}

        {/* ═══ Advanced URL entry ─────────────────────────────────────────── */}
        <section aria-labelledby="advanced-url-heading" className="border-t border-rule pt-10">
          <button
            type="button"
            onClick={() => setShowAdvancedUrl((v) => !v)}
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-subtle transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span
              className={[
                "inline-block h-2 w-2 border border-current transition-transform duration-150",
                showAdvancedUrl ? "rotate-90" : "",
              ].join(" ")}
            >
              <span className="block h-full w-full bg-current" />
            </span>
            {showAdvancedUrl ? "收起" : "展开"}高级入口：阅读已有知乎回答分析
          </button>

          {showAdvancedUrl && (
            <div className="mt-6 max-w-3xl space-y-4">
              <p className="text-sm text-muted">
                此路径使用已有的知乎回答链接分析流程，仅在需要时使用。
              </p>
              <Link
                to="/read/golden-demo/$id"
                params={{ id: "chatgpt-free-plus" }}
                className="inline-flex min-h-11 items-center rounded-[6px] border border-rule bg-paper px-4 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-paper-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                查看已有准备记录
              </Link>
            </div>
          )}
        </section>

        {/* ═══ Golden Demo records ───────────────────────────────────────── */}
        <section aria-labelledby="demo-heading">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
              PREPARED RECORDS
            </p>
            <h2
              id="demo-heading"
              className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em]"
            >
              准备记录
            </h2>
            <p className="mt-3 max-w-[68ch] text-base leading-7 text-ink-subtle">
              这些回答已有完整的维护记录，可直接进入阅读页。
            </p>
          </div>

          <div className="mt-8 space-y-5">
            {goldenDemos.map((demo) => (
              <GoldenDemoPreviewCard key={demo.id} demo={demo} />
            ))}
          </div>
        </section>

        {/* ═══ Footer ────────────────────────────────────────────────────── */}
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
                className="inline-flex min-h-11 items-center text-sm font-medium text-ink-subtle transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              >
                了解产品
              </Link>
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
