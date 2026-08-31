import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { GOLDEN_DEMOS } from "../lib/golden-demo-fixture";
import type { GoldenDemoFixture } from "../lib/golden-demo-fixture";
import type { ResolveAnswerExcerptResponse } from "../server/answer-excerpt-response";
import type { AnalyzePatchResponse } from "../server/analyze-patch-response";
import { failureMessage, formatTimestamp } from "../lib/failure-messages";
import { formatEvidenceLine, truncatePreview } from "../lib/golden-demo-preview";
import { APP_NAME, PRODUCT_TAGLINE } from "../lib/app-info";
import { resolveAnswerExcerpt } from "../server/resolve-answer-excerpt";
import { analyzePatch } from "../server/analyze-patch";
import {
  type ExtractAnswerClaimsResponse,
  extractAnswerClaims,
} from "../server/extract-answer-claims";
import { AnalysisResultPanel } from "../components/analysis/AnalysisResultPanel";
import { RealResultRead } from "../components/analysis/RealResultRead";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Living Answer · 知乎回答摘录",
      },
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
  component: Home,
});

function Home() {
  const boundResolve = useServerFn(resolveAnswerExcerpt);
  const boundAnalyze = useServerFn(analyzePatch);
  const boundExtractClaims = useServerFn(extractAnswerClaims);

  // ── Excerpt state ──────────────────────────────────────────────────────────

  const [url, setUrl] = useState("");
  const [errorState, setErrorState] = useState<{
    code:
      | "INVALID_REQUEST"
      | "MISSING_ACCESS_SECRET"
      | "UNSUPPORTED_ANSWER_URL"
      | "ANSWER_NOT_FOUND"
      | "AMBIGUOUS_ANSWER"
      | "INVALID_PROVIDER_ANSWER"
      | "PROVIDER_ERROR";
    message: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [serverResult, setServerResult] = useState<ResolveAnswerExcerptResponse | null>(null);

  // ── Analysis state ─────────────────────────────────────────────────────────

  const [analysisResult, setAnalysisResult] = useState<AnalyzePatchResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [contextText, setContextText] = useState("");

  // ── Claims state ─────────────────────────────────────────────────────────────
  const [claimsResult, setClaimsResult] = useState<ExtractAnswerClaimsResponse | null>(null);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsRetryKey, setClaimsRetryKey] = useState(0);

  // ── Excerpt handler ────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const trimmed = url.trim();

    if (trimmed === "") {
      setErrorState({ code: "INVALID_REQUEST", message: failureMessage("INVALID_REQUEST") });
      return;
    }

    setErrorState(null);
    setServerResult(null);
    setAnalysisResult(null);
    setAnalysisLoading(false);
    setAnalysisError(null);
    setClaimsResult(null);
    setClaimsLoading(false);
    setClaimsRetryKey(0);
    setLoading(true);

    const response = await boundResolve({ data: { url: trimmed } }).catch(() => null);
    if (response) {
      setServerResult(response as ResolveAnswerExcerptResponse);
    } else {
      setServerResult({ status: "error", code: "PROVIDER_ERROR" });
    }
    setLoading(false);
  };

  // ── Analysis handler ───────────────────────────────────────────────────────

  const runAnalysis = async (): Promise<void> => {
    setAnalysisResult(null);
    setAnalysisError(null);
    setAnalysisLoading(true);

    const trimmedUrl = url.trim();
    const trimmedContext = contextText.trim();

    let response: AnalyzePatchResponse | null = null;
    try {
      response = await boundAnalyze({
        data: { url: trimmedUrl, context: trimmedContext || undefined },
      }).catch(() => null);
    } catch {
      response = { status: "error", code: "PROVIDER_ERROR" };
    }

    if (response) {
      setAnalysisResult(response);
    } else {
      setAnalysisResult({ status: "error", code: "PROVIDER_ERROR" });
    }
    setAnalysisLoading(false);
  };

  const handleAnalyze = async (): Promise<void> => {
    await runAnalysis();
  };

  const handleRetry = async (): Promise<void> => {
    await runAnalysis();
  };

  // ── Claims extraction ────────────────────────────────────────────────────────

  const retryClaims = (): void => {
    setClaimsRetryKey((k) => k + 1);
  };

  useEffect(() => {
    if (serverResult?.status !== "ok") return;

    let cancelled = false;

    setClaimsLoading(true);
    setClaimsResult(null);

    boundExtractClaims({ data: { url: url.trim() } })
      .then((response) => {
        if (!cancelled) {
          setClaimsResult(response);
          setClaimsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClaimsResult({ status: "error", code: "PROVIDER_ERROR" });
          setClaimsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // Re-run when excerpt succeeds or retry key increments
  }, [boundExtractClaims, claimsRetryKey, serverResult, url]);

  // ── Demo fixtures ──────────────────────────────────────────────────────────

  const featuredDemo = GOLDEN_DEMOS["chatgpt-free-plus"];
  const firstPatch = featuredDemo.patches[0];

  const compactDemos: GoldenDemoFixture[] = [
    GOLDEN_DEMOS["create-react-app"],
    GOLDEN_DEMOS["delayed-retirement"],
  ];

  // ── Derive display state ───────────────────────────────────────────────────

  const isPending = loading;
  const resultData = serverResult?.status === "ok" ? serverResult : null;
  const resultError = serverResult;

  const showLoading = isPending;
  const showSuccess = !isPending && !!resultData;
  const showError = !isPending && !showSuccess && resultError !== null;
  const serverErrorCode =
    showError &&
    resultError &&
    typeof resultError === "object" &&
    resultError.status === "error" &&
    "code" in resultError
      ? (resultError.code as
          | "INVALID_REQUEST"
          | "MISSING_ACCESS_SECRET"
          | "UNSUPPORTED_ANSWER_URL"
          | "ANSWER_NOT_FOUND"
          | "AMBIGUOUS_ANSWER"
          | "INVALID_PROVIDER_ANSWER"
          | "PROVIDER_ERROR")
      : null;

  const showExtractSuccess = showSuccess && resultData !== null;

  return (
    <main className="flex min-h-screen items-start bg-paper px-5 py-12 text-ink sm:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-14">
        {/* ═══ Restrained hero ═══════════════════════════════════════════════════ */}
        <section>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl lg:text-5xl">
            {APP_NAME}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink-subtle sm:text-lg sm:leading-8">
            {PRODUCT_TAGLINE}
          </p>
          {/* product invariant fields */}
          <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-rule pt-5 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted tracking-wide">边界</p>
              <p className="text-sm leading-6 text-ink-subtle">不替换原文</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted tracking-wide">弱证据</p>
              <p className="text-sm leading-6 text-ink-subtle">证据不足时不生成补丁</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted tracking-wide">来源</p>
              <p className="text-sm leading-6 text-ink-subtle">每条变化可以回到一手来源</p>
            </div>
          </div>
        </section>

        {/* ═══ 精选案例 — evidence case file ═══════════════════════════════════ */}
        <section aria-labelledby="demo-heading">
          <h2 id="demo-heading" className="text-sm font-medium text-muted">
            精选案例
          </h2>
          <p className="mt-1.5 text-xs text-muted/70">合成数据 · 精选演示</p>

          {/* ── Featured case file ─────────────────────────────────────────── */}
          <Link
            to={
              `/read/golden-demo/${featuredDemo.id}` as unknown as Parameters<typeof Link>[0]["to"]
            }
            className="mt-5 block rounded-2xl border border-rule bg-paper-2 transition-colors hover:border-accent/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent lg:grid lg:grid-cols-2"
          >
            {/* left column: provenance, title, description, CTA */}
            <div className="p-6 sm:p-8">
              {/* provenance tag */}
              <span className="inline-flex items-center rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-subtle">
                {featuredDemo.topic}
              </span>
              <span className="ml-2 text-xs text-muted">合成数据 · 精选演示</span>

              {/* title */}
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                {featuredDemo.displayTitle}
              </h3>
              <p className="mt-2 text-sm leading-6 text-ink-subtle">{featuredDemo.description}</p>

              {/* compact CTA */}
              <span className="mt-6 inline-flex items-center text-sm font-medium text-accent transition-colors group-hover:text-accent-hover">
                阅读原文与旁证
                <span
                  aria-hidden="true"
                  className="ml-1 transition-transform group-hover:translate-x-0.5"
                >
                  &rarr;
                </span>
              </span>
            </div>

            {/* right column: evidence fields */}
            <div className="lg:border-l lg:border-rule">
              <p className="border-t border-rule px-6 pt-3.5 pb-2 text-xs text-muted sm:px-8">
                证据关系
              </p>

              {/* original premise */}
              <div aria-label="原文前提" className="border-t border-rule px-6 py-3.5 sm:px-8">
                <span className="text-xs font-medium text-muted">原文前提</span>
                <p className="mt-1 break-words text-sm leading-6 text-ink-subtle">
                  {truncatePreview(firstPatch.originalExcerpt)}
                </p>
              </div>

              {/* current change — amber only here */}
              <div
                aria-label="现在变化"
                className="border-t border-update-amber/30 bg-update-amber/5 px-6 py-3.5 sm:px-8"
              >
                <span className="text-xs font-medium text-update-amber">现在变化</span>
                <p className="mt-1 break-words text-sm leading-6 text-ink-subtle">
                  {truncatePreview(firstPatch.currentChange)}
                </p>
              </div>

              {/* impact */}
              <div aria-label="影响" className="border-t border-rule px-6 py-3.5 sm:px-8">
                <span className="text-xs font-medium text-muted">影响</span>
                <p className="mt-1 break-words text-sm leading-6 text-ink-subtle">
                  {truncatePreview(firstPatch.impact)}
                </p>
              </div>

              {/* evidence provenance */}
              <div aria-label="证据来源" className="border-t border-rule px-6 py-3.5 sm:px-8">
                <span className="text-xs font-medium text-muted">证据来源</span>
                <ul className="mt-1.5 space-y-1.5">
                  {firstPatch.evidence.map((ev) => {
                    const evDate = new Date(ev.publishedAt);
                    const year = evDate.getUTCFullYear();
                    const month = String(evDate.getUTCMonth() + 1).padStart(2, "0");
                    return (
                      <li
                        key={ev.sourceUrl}
                        className="flex flex-wrap items-baseline gap-x-2 text-sm"
                      >
                        <span className="font-medium text-ink-subtle">{ev.organization}</span>
                        <span className="text-xs text-muted">
                          {ev.sourceType} · {year}-{month}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </Link>

          {/* ── Two compact demos ─────────────────────────────────────────── */}
          <ul className="mt-3 grid gap-3 sm:grid-cols-2" role="list">
            {compactDemos.map((entry) => {
              const patch = entry.patches[0];
              const evidence = patch.evidence[0];
              const evidenceLine = formatEvidenceLine(
                evidence.organization,
                evidence.sourceType,
                evidence.publishedAt,
              );

              return (
                <li key={entry.id}>
                  <Link
                    to={
                      `/read/golden-demo/${entry.id}` as unknown as Parameters<typeof Link>[0]["to"]
                    }
                    className={[
                      "group block min-w-0 rounded-xl border border-rule bg-paper-2 p-4 sm:p-5",
                      "transition-colors hover:border-accent/30",
                      "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
                    ].join(" ")}
                  >
                    {/* topic + title row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-subtle">
                        {entry.topic}
                      </span>
                      <span className="text-xs text-muted">合成数据</span>
                    </div>

                    {/* title + one-line change */}
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
                      <h3 className="text-sm font-semibold tracking-tight text-ink sm:text-base">
                        {entry.displayTitle}
                      </h3>
                      <p className="break-words text-sm leading-5 text-ink-subtle">
                        {truncatePreview(patch.currentChange)}
                      </p>
                    </div>

                    {/* evidence + CTA row */}
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                      <span className="break-words text-xs text-muted">
                        <span className="font-medium text-ink-subtle">证据</span> {evidenceLine}
                      </span>
                      <span className="inline-flex shrink-0 items-center text-sm font-medium text-accent transition-colors group-hover:text-accent-hover">
                        阅读原文与旁证
                        <span
                          aria-hidden="true"
                          className="ml-1 transition-transform group-hover:translate-x-0.5"
                        >
                          &rarr;
                        </span>
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ═══ URL-first workflow ═══════════════════════════════════════════════ */}
        <section className="border-t border-rule pt-10">
          <h2 className="text-sm font-medium text-muted">输入回答链接，检索摘录</h2>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <div>
              <label htmlFor="answer-url" className="block text-sm font-medium text-ink-subtle">
                知乎回答链接
              </label>
              <input
                id="answer-url"
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (errorState) setErrorState(null);
                }}
                placeholder="https://www.zhihu.com/question/42/answer/100"
                disabled={isPending}
                autoComplete="off"
                className={
                  "mt-1.5 block w-full rounded-xl border bg-paper-2 px-4 py-3 text-base text-ink " +
                  "placeholder:text-muted " +
                  "border-rule focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 " +
                  "disabled:cursor-not-allowed disabled:bg-paper disabled:text-muted"
                }
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isPending}
                  className={
                    "inline-flex items-center rounded-full px-6 py-2.5 text-sm font-semibold text-text-on-accent " +
                    "bg-accent hover:bg-accent-hover " +
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent " +
                    "disabled:cursor-not-allowed disabled:bg-accent-deep/40 disabled:text-ink-subtle"
                  }
                >
                  {isPending ? "获取中..." : "获取摘录"}
                </button>
                {isPending && <span className="text-sm text-muted">正在检索回答摘录…</span>}
              </div>
              <p className="text-xs text-muted">粘贴后点击获取摘录，查看该回答的前提是否已变化。</p>
            </div>

            {showLoading && (
              <div className="flex items-center gap-3 rounded-2xl border border-rule bg-paper/60 px-5 py-4">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-accent"
                />
                <p className="text-sm text-ink-subtle">正在获取回答摘录…</p>
              </div>
            )}

            {errorState && !isPending && (
              <div className="rounded-2xl border border-rule bg-paper/60 px-5 py-4">
                <p className="text-sm font-medium text-ink-subtle">{errorState.message}</p>
              </div>
            )}

            {showError && serverErrorCode && (
              <div className="rounded-2xl border border-rule bg-paper/60 px-5 py-4">
                <p className="text-sm font-medium text-ink-subtle">
                  {failureMessage(serverErrorCode)}
                </p>
              </div>
            )}

            {showSuccess && resultData && (
              <div className="rounded-2xl border border-rule bg-paper/60 px-5 py-5 sm:px-6 sm:py-6">
                <p className="whitespace-pre-wrap break-words text-base leading-7 text-ink-subtle sm:text-lg sm:leading-8">
                  {resultData.excerpt.excerpt}
                </p>

                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
                  <span>
                    知乎问题{" "}
                    <span className="font-medium text-ink-subtle">
                      #{resultData.excerpt.questionId}
                    </span>
                  </span>
                  <span>
                    回答{" "}
                    <span className="font-medium text-ink-subtle">
                      #{resultData.excerpt.answerId}
                    </span>
                  </span>
                  <span>摘录时间 {formatTimestamp(resultData.excerpt.capturedAt)}</span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  来源编辑时间 {formatTimestamp(resultData.excerpt.sourceEditTime)}
                </p>
              </div>
            )}

            {/* ── Claims extraction section ───────────────────────────────── */}
            <ClaimsSection loading={claimsLoading} result={claimsResult} onRetry={retryClaims} />
          </form>

          {/* Maintenance context and analysis — available after successful excerpt */}
          {showExtractSuccess && (
            <div className="mt-8 space-y-4 border-t border-rule pt-6">
              <div>
                <label
                  htmlFor="analysis-context"
                  className="block text-sm font-medium text-ink-subtle"
                >
                  维护备注（可选）
                </label>
                <textarea
                  id="analysis-context"
                  value={contextText}
                  onChange={(e) => {
                    setContextText(e.target.value);
                    if (analysisError) setAnalysisError(null);
                  }}
                  placeholder="描述您在维护中了解到的前提变化…"
                  rows={3}
                  disabled={analysisLoading}
                  className={
                    "mt-1.5 block w-full rounded-xl border bg-paper-2 px-4 py-3 text-base text-ink " +
                    "placeholder:text-muted " +
                    "border-rule focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 " +
                    "disabled:cursor-not-allowed disabled:bg-paper disabled:text-muted " +
                    "resize-y"
                  }
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analysisLoading}
                  className={
                    "inline-flex items-center rounded-full px-6 py-2.5 text-sm font-semibold text-text-on-accent " +
                    "bg-accent hover:bg-accent-hover " +
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent " +
                    "disabled:cursor-not-allowed disabled:bg-accent-deep/40 disabled:text-ink-subtle"
                  }
                >
                  {analysisLoading ? "分析中…" : "分析前提变化"}
                </button>
                {analysisLoading && <span className="text-sm text-muted">正在分析…</span>}
              </div>

              {/* Render real-data read view on successful analysis, otherwise show the generic panel */}
              {analysisResult !== null && analysisResult.status === "ok" && resultData !== null ? (
                <RealResultRead
                  excerpt={resultData.excerpt}
                  result={analysisResult}
                  contextText={contextText}
                />
              ) : (
                <AnalysisResultPanel
                  result={analysisResult}
                  isLoading={analysisLoading}
                  analysisError={analysisError}
                  onRetry={handleRetry}
                />
              )}
            </div>
          )}
        </section>

        {/* ═══ Closing statement ═════════════════════════════════════════════════ */}
        <p className="border-t border-rule pt-6 text-center text-xs text-muted">
          Living Answer
          为过去的知乎回答补充已变化的关键前提与证据源，不替换原文，也不生成通用最新答复。
        </p>
      </div>
    </main>
  );
}

// ── Claims section sub-component ───────────────────────────────────────────────

interface ClaimsSectionProps {
  readonly loading: boolean;
  readonly result: ExtractAnswerClaimsResponse | null;
  readonly onRetry: () => void;
}

function ClaimsSection({ loading, result, onRetry }: ClaimsSectionProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-rule bg-paper/60 px-5 py-4">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-accent"
        />
        <p className="text-sm text-ink-subtle">正在分析摘录前提…</p>
      </div>
    );
  }

  if (result?.status === "error") {
    return (
      <div className="rounded-2xl border border-rule bg-paper/60 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-ink-subtle">{failureMessage(result.code)}</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex shrink-0 items-center rounded-full px-4 py-1.5 text-xs font-semibold text-text-on-accent bg-accent hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (result?.status === "ok") {
    if (result.claims.length === 0) {
      return (
        <div>
          <h3 className="text-sm font-medium text-ink-subtle">候选关键前提</h3>
          <span className="text-xs text-muted">摘录级候选 · 尚未核验</span>
          <div className="mt-3 rounded-2xl border border-rule bg-paper/60 px-5 py-4">
            <p className="text-sm text-muted">该摘录中未发现需要关注的关键前提。</p>
          </div>
        </div>
      );
    }

    return (
      <div>
        <div className="flex items-baseline gap-x-3">
          <h3 className="text-sm font-medium text-ink-subtle">候选关键前提</h3>
          <span className="text-xs text-muted">摘录级候选 · 尚未核验</span>
        </div>
        <div className="mt-3 space-y-3">
          {result.claims.map((claim) => (
            <div
              key={claim.claimFingerprint}
              className="rounded-xl border border-rule bg-paper-2 px-5 py-4"
            >
              <p className="break-words text-sm font-medium text-ink">{claim.claimText}</p>
              <div className="mt-2.5 space-y-1.5">
                <p className="text-xs text-muted">
                  锚点文本{" "}
                  <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-xs leading-5 text-ink-subtle">
                    {claim.anchorText.length > 60
                      ? claim.anchorText.slice(0, 57) + "…"
                      : claim.anchorText}
                  </code>
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>
                    波动性{" "}
                    <span className="font-medium text-ink-subtle">
                      {claim.volatility === "high"
                        ? "高"
                        : claim.volatility === "medium"
                          ? "中"
                          : "低"}
                    </span>
                  </span>
                  <span>
                    决策相关度{" "}
                    <span className="font-medium text-ink-subtle">
                      {claim.decisionRelevance === "high"
                        ? "高"
                        : claim.decisionRelevance === "medium"
                          ? "中"
                          : "低"}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Idle — not loading and no result yet (brief moment before effect fires)
  return null;
}
