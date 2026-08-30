import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import type { ResolveAnswerExcerptResponse } from "../server/answer-excerpt-response";
import type { AnalyzePatchResponse } from "../server/analyze-patch-response";
import { failureMessage, formatTimestamp } from "../lib/failure-messages";
import { APP_NAME, PRODUCT_TAGLINE } from "../lib/app-info";
import { resolveAnswerExcerpt } from "../server/resolve-answer-excerpt";
import { analyzePatch } from "../server/analyze-patch";
import { AnalysisResultPanel } from "../components/analysis/AnalysisResultPanel";

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

  // Async states managed via useState (no react-query)
  const [loading, setLoading] = useState(false);
  const [serverResult, setServerResult] = useState<ResolveAnswerExcerptResponse | null>(null);

  // ── Analysis state ─────────────────────────────────────────────────────────

  const [analysisResult, setAnalysisResult] = useState<AnalyzePatchResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [contextText, setContextText] = useState("");

  // ── Excerpt handler ────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const trimmed = url.trim();

    if (trimmed === "") {
      setErrorState({ code: "INVALID_REQUEST", message: failureMessage("INVALID_REQUEST") });
      return;
    }

    // Clear prior results and start loading
    setErrorState(null);
    setServerResult(null);
    setAnalysisResult(null);
    setAnalysisLoading(false);
    setAnalysisError(null);
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

  // ── Retry handler ──────────────────────────────────────────────────────────

  const handleRetry = async (): Promise<void> => {
    await runAnalysis();
  };

  // ── Derive display state ────────────────────────────────────────────────────

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
    <main className="relative isolate flex min-h-screen items-center overflow-hidden bg-[#f5f3ee] px-5 py-12 text-stone-950 sm:px-8">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(circle_at_top_left,rgba(217,119,87,0.2),transparent_58%)]"
      />

      <section className="mx-auto w-full max-w-4xl rounded-[2rem] border border-stone-300/80 bg-white/80 p-7 shadow-[0_24px_80px_rgba(71,60,48,0.12)] backdrop-blur sm:p-12 lg:p-16">
        <div className="max-w-3xl">
          <h1 className="text-5xl font-semibold tracking-[-0.045em] text-balance sm:text-7xl">
            {APP_NAME}
          </h1>
          <p className="mt-7 text-lg leading-8 text-stone-700 sm:text-xl sm:leading-9">
            {PRODUCT_TAGLINE}
          </p>
        </div>

        <div className="mt-14 border-t border-stone-200 pt-8">
          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <div>
              <label htmlFor="answer-url" className="block text-sm font-medium text-stone-600">
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
                  "mt-1.5 block w-full rounded-xl border bg-white px-4 py-3 text-base text-stone-900 " +
                  "placeholder:text-stone-400 " +
                  "border-stone-300 focus:border-[#d97757] focus:outline-none focus:ring-2 focus:ring-[#d97757]/20 " +
                  "disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500"
                }
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isPending}
                className={
                  "inline-flex items-center rounded-full px-6 py-2.5 text-sm font-semibold text-white " +
                  "bg-[#d97757] hover:bg-[#c4684a] " +
                  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d97757] " +
                  "disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
                }
              >
                {isPending ? "获取中..." : "获取摘录"}
              </button>
              {isPending && <span className="text-sm text-stone-500">正在检索回答摘录…</span>}
            </div>

            {showLoading && (
              <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-[#d97757]"
                />
                <p className="text-sm text-stone-600">正在获取回答摘录…</p>
              </div>
            )}

            {errorState && !isPending && (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4">
                <p className="text-sm font-medium text-stone-700">{errorState.message}</p>
              </div>
            )}

            {showError && serverErrorCode && (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4">
                <p className="text-sm font-medium text-stone-700">
                  {failureMessage(serverErrorCode)}
                </p>
              </div>
            )}

            {showSuccess && resultData && (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-5 sm:px-6 sm:py-6">
                <p className="whitespace-pre-wrap break-words text-base leading-7 text-stone-800 sm:text-lg sm:leading-8">
                  {resultData.excerpt.excerpt}
                </p>

                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-500">
                  <span>
                    知乎问题{" "}
                    <span className="font-medium text-stone-700">
                      #{resultData.excerpt.questionId}
                    </span>
                  </span>
                  <span>
                    回答{" "}
                    <span className="font-medium text-stone-700">
                      #{resultData.excerpt.answerId}
                    </span>
                  </span>
                  <span>摘录时间 {formatTimestamp(resultData.excerpt.capturedAt)}</span>
                </div>
                <p className="mt-1 text-sm text-stone-500">
                  来源编辑时间 {formatTimestamp(resultData.excerpt.sourceEditTime)}
                </p>
              </div>
            )}
          </form>

          {/* Maintenance context and analysis — available after successful excerpt */}
          {showExtractSuccess && (
            <div className="mt-8 space-y-4 border-t border-stone-200 pt-6">
              <div>
                <label
                  htmlFor="analysis-context"
                  className="block text-sm font-medium text-stone-600"
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
                    "mt-1.5 block w-full rounded-xl border bg-white px-4 py-3 text-base text-stone-900 " +
                    "placeholder:text-stone-400 " +
                    "border-stone-300 focus:border-[#d97757] focus:outline-none focus:ring-2 focus:ring-[#d97757]/20 " +
                    "disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500 " +
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
                    "inline-flex items-center rounded-full px-6 py-2.5 text-sm font-semibold text-white " +
                    "bg-[#d97757] hover:bg-[#c4684a] " +
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d97757] " +
                    "disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
                  }
                >
                  {analysisLoading ? "分析中…" : "分析前提变化"}
                </button>
                {analysisLoading && <span className="text-sm text-stone-500">正在分析…</span>}
              </div>

              <AnalysisResultPanel
                result={analysisResult}
                isLoading={analysisLoading}
                analysisError={analysisError}
                onRetry={handleRetry}
              />
            </div>
          )}

          {/* Golden Demo secondary action */}
          <div className="mt-6">
            <Link
              to="/read/golden-demo"
              className="inline-flex items-center gap-1.5 text-sm text-stone-500 transition-colors hover:text-stone-800"
            >
              <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                <span
                  aria-hidden="true"
                  className="mr-1 inline-block h-1 w-1 rounded-full bg-amber-500"
                />
                更新演示
              </span>
              <span>阅读精选演示（无需链接）</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
