import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";

import { GOLDEN_DEMOS } from "../lib/golden-demo-fixture";
import type { GoldenDemoFixture } from "../lib/golden-demo-fixture";
import type { ResolveAnswerExcerptResponse } from "../server/answer-excerpt-response";
import type {
  AnalyzePatchResponse,
  AnalyzePatchServerFailureCode,
} from "../server/analyze-patch-response";
import { failureMessage, formatTimestamp } from "../lib/failure-messages";
import { formatEvidenceLine, truncatePreview } from "../lib/golden-demo-preview";
import { APP_NAME, PRODUCT_TAGLINE } from "../lib/app-info";
import { resolveAnswerExcerpt } from "../server/resolve-answer-excerpt";
import { analyzePatch } from "../server/analyze-patch";
import { disputePatchLifecycle } from "../server/dispute-patch-lifecycle";
import { resolvePatchLifecycle } from "../server/resolve-patch-lifecycle";
import { withdrawPatchLifecycle } from "../server/withdraw-patch-lifecycle";
import {
  type SearchAnswerCandidatesResponse,
  searchAnswerCandidates,
} from "../server/search-answer-candidates";
import {
  type ExtractAnswerClaimsResponse,
  extractAnswerClaims,
} from "../server/extract-answer-claims";
import {
  type RetrieveEvidenceResponse,
  retrieveEvidenceCandidatesFn,
} from "../server/retrieve-evidence-candidates";
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
  const boundDisputePatch = useServerFn(disputePatchLifecycle);
  const boundExtractClaims = useServerFn(extractAnswerClaims);
  const boundRetrieveEvidence = useServerFn(retrieveEvidenceCandidatesFn);
  const boundSearchCandidates = useServerFn(searchAnswerCandidates);
  const boundResolvePatch = useServerFn(resolvePatchLifecycle);
  const boundWithdrawPatch = useServerFn(withdrawPatchLifecycle);

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

  // ── Dual entry state ──────────────────────────────────────────────────────
  const [entryMode, setEntryMode] = useState<"url" | "search">("url");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchAnswerCandidatesResponse | null>(null);

  // ── Analysis state ─────────────────────────────────────────────────────────

  const [analysisResult, setAnalysisResult] = useState<AnalyzePatchResponse | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [contextText, setContextText] = useState("");
  const [disputeLoading, setDisputeLoading] = useState(false);
  const [disputeError, setDisputeError] = useState<AnalyzePatchServerFailureCode | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<"dispute" | "resolve" | "withdraw" | null>(
    null,
  );

  // ── Claims state ─────────────────────────────────────────────────────────────
  const [claimsResult, setClaimsResult] = useState<ExtractAnswerClaimsResponse | null>(null);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsRetryKey, setClaimsRetryKey] = useState(0);

  // ── Evidence candidates state ───────────────────────────────────────────────
  const [evidenceResult, setEvidenceResult] = useState<RetrieveEvidenceResponse | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const evidenceRequestKeyRef = useRef<string | null>(null);

  // ── Excerpt handler ────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || disputeLoading) return;
    const trimmed = url.trim();

    if (trimmed === "") {
      setErrorState({ code: "INVALID_REQUEST", message: failureMessage("INVALID_REQUEST") });
      return;
    }

    setErrorState(null);
    setServerResult(null);
    evidenceRequestKeyRef.current = null;
    setAnalysisResult(null);
    setAnalysisLoading(false);
    setAnalysisError(null);
    setDisputeLoading(false);
    setDisputeError(null);
    setClaimsResult(null);
    setClaimsLoading(false);
    setClaimsRetryKey(0);
    setEvidenceResult(null);
    setEvidenceLoading(false);
    setLoading(true);

    const response = await boundResolve({ data: { url: trimmed } }).catch(() => null);
    if (response) {
      setServerResult(response as ResolveAnswerExcerptResponse);
    } else {
      setServerResult({ status: "error", code: "PROVIDER_ERROR" });
    }
    setLoading(false);
  };

  // ── Search handler ─────────────────────────────────────────────────────────

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchLoading || disputeLoading) return;
    const trimmed = searchQuery.trim();
    if (trimmed === "") {
      setSearchResult({ status: "error", code: "INVALID_REQUEST", message: "请输入搜索关键词。" });
      return;
    }

    setSearchLoading(true);
    setSearchResult(null);

    const response = await boundSearchCandidates({ data: { query: trimmed } }).catch(() => null);
    if (response) {
      setSearchResult(response as SearchAnswerCandidatesResponse);
    } else {
      setSearchResult({ status: "error", code: "SEARCH_ERROR", message: "搜索失败，请稍后再试。" });
    }
    setSearchLoading(false);
  };

  const handleSelectCandidate = (candidateUrl: string) => {
    setUrl(candidateUrl);
    setEntryMode("url");
    setSearchResult(null);
    setSearchQuery("");
  };

  // ── Analysis handler ───────────────────────────────────────────────────────

  const runAnalysis = async (): Promise<void> => {
    setAnalysisResult(null);
    setAnalysisError(null);
    setAnalysisLoading(true);
    setDisputeError(null);

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

  const handleDispute = async (): Promise<void> => {
    if (
      disputeLoading ||
      analysisResult?.status !== "ok" ||
      analysisResult.lifecycle?.status !== "VISIBLE"
    ) {
      return;
    }

    const recordFingerprint = analysisResult.lifecycle.recordFingerprint;
    setLifecycleAction("dispute");
    setDisputeError(null);

    const response = await boundDisputePatch({ data: { recordFingerprint } }).catch(() => null);

    if (response?.status === "ok") {
      setAnalysisResult((current) => {
        if (
          current?.status !== "ok" ||
          current.lifecycle?.recordFingerprint !== response.recordFingerprint
        ) {
          return current;
        }

        return {
          ...current,
          lifecycle: {
            ...current.lifecycle,
            status: "DISPUTED",
            eventAt: response.disputedAt,
          },
          history: current.history?.map((record) =>
            record.recordFingerprint === response.recordFingerprint
              ? { ...record, status: "DISPUTED", eventAt: response.disputedAt }
              : record,
          ),
        };
      });
    } else if (response?.status === "error") {
      setDisputeError(response.code);
    } else {
      setDisputeError("DISPUTE_PATCH_STORE_ERROR");
    }

    setDisputeLoading(false);
    setLifecycleAction(null);
  };

  const handleLifecycleTransition = async (action: "resolve" | "withdraw"): Promise<void> => {
    if (
      disputeLoading ||
      analysisResult?.status !== "ok" ||
      analysisResult.lifecycle?.status !== "VISIBLE"
    ) {
      return;
    }

    const recordFingerprint = analysisResult.lifecycle.recordFingerprint;
    setLifecycleAction(action);
    setDisputeError(null);

    const boundFn = action === "resolve" ? boundResolvePatch : boundWithdrawPatch;
    const response = await boundFn({ data: { recordFingerprint } }).catch(() => null);

    if (response?.status === "ok") {
      const newStatus = action === "resolve" ? "RESOLVED" : "WITHDRAWN";
      const eventAt = Date.now();
      setAnalysisResult((current) => {
        if (
          current?.status !== "ok" ||
          current.lifecycle?.recordFingerprint !== response.recordFingerprint
        ) {
          return current;
        }
        return {
          ...current,
          lifecycle: {
            ...current.lifecycle,
            status: newStatus,
            eventAt,
          },
          history: current.history?.map((record) =>
            record.recordFingerprint === response.recordFingerprint
              ? { ...record, status: newStatus, eventAt }
              : record,
          ),
        };
      });
    } else {
      setDisputeError("DISPUTE_PATCH_STORE_ERROR");
    }

    setLifecycleAction(null);
  };

  const handleResolve = (): Promise<void> => handleLifecycleTransition("resolve");
  const handleWithdraw = (): Promise<void> => handleLifecycleTransition("withdraw");

  // ── Claims extraction ────────────────────────────────────────────────────────

  const retryClaims = (): void => {
    evidenceRequestKeyRef.current = null;
    setClaimsRetryKey((k) => k + 1);
  };

  useEffect(() => {
    if (serverResult?.status !== "ok") return;

    let cancelled = false;

    setClaimsLoading(true);
    setClaimsResult(null);
    setEvidenceResult(null);

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

  // ── Evidence candidate retrieval ────────────────────────────────────────────

  const retrieveEvidence = useCallback((): void => {
    if (claimsResult?.status !== "ok" || evidenceLoading) return;

    const claims = claimsResult.claims.slice(0, 3).map((c) => ({
      claimFingerprint: c.claimFingerprint,
      claimText: c.claimText,
      excerptFingerprint: c.excerptFingerprint,
    }));

    setEvidenceLoading(true);
    setEvidenceResult(null);

    boundRetrieveEvidence({ data: { claims } })
      .then((response) => {
        setEvidenceResult(response);
        setEvidenceLoading(false);
      })
      .catch(() => {
        setEvidenceResult({
          status: "error",
          code: "RETRIEVAL_ERROR",
          message: "检索候选证据时出现异常，请稍后再试。",
        });
        setEvidenceLoading(false);
      });
  }, [boundRetrieveEvidence, claimsResult, evidenceLoading]);

  const retryEvidence = (): void => {
    evidenceRequestKeyRef.current = null;
    retrieveEvidence();
  };

  useEffect(() => {
    if (claimsResult?.status !== "ok" || claimsResult.claims.length === 0) {
      evidenceRequestKeyRef.current = null;
      return;
    }

    if (evidenceLoading || evidenceResult !== null) return;

    const requestKey = claimsResult.claims.map((claim) => claim.claimFingerprint).join(":");
    if (evidenceRequestKeyRef.current === requestKey) return;

    evidenceRequestKeyRef.current = requestKey;
    retrieveEvidence();
  }, [claimsResult, evidenceLoading, evidenceResult, retrieveEvidence]);

  const claimsReady = claimsResult?.status === "ok";
  const evidenceReady =
    !claimsReady ||
    (claimsResult?.status === "ok" &&
      (claimsResult.claims.length === 0 || evidenceResult?.status === "ok"));
  const analysisDisabled = analysisLoading || disputeLoading || !claimsReady || !evidenceReady;

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
          {/* product invariant commitments */}
          <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-rule pt-5 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted tracking-wide">承诺</p>
              <p className="text-sm leading-6 text-ink-subtle">不替换原文</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted tracking-wide">承诺</p>
              <p className="text-sm leading-6 text-ink-subtle">证据不足时不生成补丁</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted tracking-wide">承诺</p>
              <p className="text-sm leading-6 text-ink-subtle">每条变化可以回到一手来源</p>
            </div>
          </div>
        </section>

        {/* ═══ sources nav ═══════════════════════════════════════════════════════ */}
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <Link
            to="/sources"
            className="text-sm font-medium text-accent transition-colors hover:text-accent-hover"
          >
            查看所有证据来源 &rarr;
          </Link>
          <Link
            to="/changes"
            className="text-sm font-medium text-accent transition-colors hover:text-accent-hover"
          >
            查看变更时间线 &rarr;
          </Link>
        </nav>

        {/* ═══ Dual entry: URL or search ═════════════════════════════════════════ */}
        <section className="border-t border-rule pt-10">
          <h2 className="text-sm font-medium text-muted">找到要检索的回答</h2>

          {/* ── Segmented control ─────────────────────────────────────────── */}
          <div
            role="tablist"
            aria-label="选择入口方式"
            className="mt-4 inline-flex rounded-xl border border-rule bg-paper p-0.5"
          >
            {(["url", "search"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={entryMode === mode}
                onClick={() => setEntryMode(mode)}
                disabled={isPending || disputeLoading}
                className={[
                  "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  entryMode === mode
                    ? "bg-paper-2 text-ink shadow-sm"
                    : "text-muted hover:text-ink-subtle",
                ].join(" ")}
              >
                {mode === "url" ? "粘贴链接" : "搜索问题"}
              </button>
            ))}
          </div>

          {entryMode === "url" && (
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
                  disabled={isPending || disputeLoading}
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
                    disabled={isPending || disputeLoading}
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
                <p className="text-xs text-muted">
                  粘贴后点击获取摘录，查看该回答的前提是否已变化。
                </p>
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

              {/* ── Evidence candidates section ──────────────────────────────── */}
              {claimsResult?.status === "ok" && claimsResult.claims.length > 0 && (
                <EvidenceCandidatesSection
                  loading={evidenceLoading}
                  result={evidenceResult}
                  onRetrieve={retryEvidence}
                />
              )}
            </form>
          )}

          {entryMode === "search" && (
            <form onSubmit={handleSearch} noValidate className="mt-6 space-y-4">
              <div>
                <label htmlFor="search-query" className="block text-sm font-medium text-ink-subtle">
                  搜索知乎问题
                </label>
                <input
                  id="search-query"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                  }}
                  placeholder="例如：React 19 还值得学吗"
                  disabled={searchLoading || disputeLoading}
                  autoComplete="off"
                  className={
                    "mt-1.5 block w-full rounded-xl border bg-paper-2 px-4 py-3 text-base text-ink " +
                    "placeholder:text-muted " +
                    "border-rule focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 " +
                    "disabled:cursor-not-allowed disabled:bg-paper disabled:text-muted"
                  }
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={searchLoading || disputeLoading}
                  className={
                    "inline-flex items-center rounded-full px-6 py-2.5 text-sm font-semibold text-text-on-accent " +
                    "bg-accent hover:bg-accent-hover " +
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent " +
                    "disabled:cursor-not-allowed disabled:bg-accent-deep/40 disabled:text-ink-subtle"
                  }
                >
                  {searchLoading ? "搜索中..." : "搜索"}
                </button>
                {searchLoading && <span className="text-sm text-muted">正在搜索知乎回答…</span>}
              </div>

              {searchResult?.status === "error" && (
                <div className="rounded-2xl border border-rule bg-paper/60 px-5 py-4">
                  <p className="text-sm font-medium text-ink-subtle">{searchResult.message}</p>
                </div>
              )}

              {searchResult?.status === "ok" && searchResult.candidates.length === 0 && (
                <div className="rounded-2xl border border-rule bg-paper/60 px-5 py-4">
                  <p className="text-sm text-ink-subtle">没有找到包含回答的搜索结果。</p>
                </div>
              )}

              {searchResult?.status === "ok" && searchResult.candidates.length > 0 && (
                <ul className="space-y-2" role="list">
                  {searchResult.candidates.map((c) => (
                    <li key={c.answerId}>
                      <button
                        type="button"
                        onClick={() => handleSelectCandidate(c.url)}
                        className={
                          "block w-full rounded-xl border border-rule bg-paper-2 px-4 py-3 text-left transition-colors " +
                          "hover:border-accent/30 " +
                          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                        }
                      >
                        <p className="text-sm font-medium text-ink">
                          {c.title || `知乎回答 #${c.answerId}`}
                        </p>
                        {c.preview && (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                            {c.preview}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted">
                          问题 #{c.questionId} · 回答 #{c.answerId}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </form>
          )}

          {/* Maintenance context and analysis — available after successful excerpt */}
          {showExtractSuccess && (
            <div className="mt-8 space-y-4 border-t border-rule pt-6">
              <div>
                <label
                  htmlFor="analysis-context"
                  className="block text-sm font-medium text-ink-subtle"
                >
                  维护备注 · 第 3 步（可选）
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
                  disabled={analysisLoading || disputeLoading}
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
                  disabled={analysisDisabled}
                  className={
                    "inline-flex items-center rounded-full px-6 py-2.5 text-sm font-semibold text-text-on-accent " +
                    "bg-accent hover:bg-accent-hover " +
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent " +
                    "disabled:cursor-not-allowed disabled:bg-accent-deep/40 disabled:text-ink-subtle"
                  }
                >
                  {claimsLoading || evidenceLoading ? "准备分析中…" : "分析前提变化"}
                </button>
                {analysisLoading && <span className="text-sm text-muted">正在分析…</span>}
              </div>

              {/* Render real-data read view on successful analysis, otherwise show the generic panel */}
              {analysisResult !== null && analysisResult.status === "ok" && resultData !== null ? (
                <RealResultRead
                  excerpt={resultData.excerpt}
                  result={analysisResult}
                  contextText={contextText}
                  onDispute={handleDispute}
                  onResolve={handleResolve}
                  onWithdraw={handleWithdraw}
                  onRecheck={handleRetry}
                  isDisputePending={disputeLoading || lifecycleAction !== null}
                  disputeError={disputeError}
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

        {/* ═══ 精选案例 — evidence case file ═══════════════════════════════════ */}
        <section aria-labelledby="demo-heading">
          <h2 id="demo-heading" className="text-sm font-medium text-muted">
            先看示例
          </h2>
          <p className="mt-2 text-xs text-muted/70">先看两个真实案例，了解补丁如何呈现</p>
          <hr className="mt-6 border-stone-200" />
          {/* ── Featured case file ─────────────────────────────────────────── */}
          <Link
            to={
              `/read/golden-demo/${featuredDemo.id}` as unknown as Parameters<typeof Link>[0]["to"]
            }
            className="group mt-5 block rounded-2xl border border-rule bg-paper-2 transition-colors hover:border-accent/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent lg:grid lg:grid-cols-2"
          >
            {/* left column: provenance, title, description, CTA */}
            <div className="p-6 sm:p-8">
              {/* provenance tag */}
              <span className="inline-flex items-center rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-subtle">
                {featuredDemo.topic}
              </span>
              <span className="ml-2 inline-flex items-center rounded-full border border-rule bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-subtle">
                精选演示 · 真实知乎来源
              </span>

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
                        <span className="inline-flex items-center rounded-full bg-paper px-2 py-0.5 text-xs text-muted">
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
                      <span className="inline-flex items-center rounded-full border border-rule bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-subtle">
                        真实来源
                      </span>
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
          <h3 className="text-sm font-medium text-ink-subtle">前提候选 · 第 1 步</h3>
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
          <h3 className="text-sm font-medium text-ink-subtle">前提候选 · 第 1 步</h3>
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

// ── Evidence candidates section sub-component ──────────────────────────────────

interface EvidenceCandidatesSectionProps {
  readonly loading: boolean;
  readonly result: RetrieveEvidenceResponse | null;
  readonly onRetrieve: () => void;
}

const evidenceFailureMessage = (code: string): string => {
  switch (code) {
    case "MISSING_CREDENTIAL":
      return "服务暂时不可用，请稍后再试。";
    case "INVALID_CLAIMS":
      return "候选前提无效，请重新分析回答。";
    case "EVIDENCE_STORE_ERROR":
      return "证据记录暂不可用，请稍后再试。";
    default:
      return "检索候选证据时出现异常，请稍后再试。";
  }
};

const partialRetrievalMessage = (state: string): string => {
  if (state === "quota_exceeded") return "今日部分来源额度已用完";
  if (state === "rate_limited") return "部分来源暂时受限";
  return "部分来源未完成";
};

function EvidenceCandidatesSection({
  loading,
  result,
  onRetrieve,
}: EvidenceCandidatesSectionProps) {
  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-rule bg-paper/60 px-5 py-4">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-accent"
        />
        <p className="text-sm text-ink-subtle">正在检索候选证据…</p>
      </div>
    );
  }

  if (result?.status === "error") {
    return (
      <div className="mt-4 rounded-2xl border border-rule bg-paper/60 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h3 className="text-sm font-medium text-ink-subtle">证据候选 · 第 2 步</h3>
          <button
            type="button"
            onClick={onRetrieve}
            className="inline-flex shrink-0 items-center rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            重试
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">{evidenceFailureMessage(result.code)}</p>
      </div>
    );
  }

  if (result?.status === "ok") {
    const allCandidates = result.claims.flatMap((c) => c.candidates);

    return (
      <div className="mt-4">
        <div className="flex items-baseline gap-x-3">
          <h3 className="text-sm font-medium text-ink-subtle">证据候选 · 第 2 步</h3>
          {result.isPartial && (
            <span className="text-xs text-update-amber">
              {partialRetrievalMessage(result.partialState)}
            </span>
          )}
        </div>

        {allCandidates.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-rule bg-paper/60 px-5 py-4">
            <p className="text-sm text-muted">
              {result.isPartial
                ? `${partialRetrievalMessage(result.partialState)}。已有结果不代表前提正确或过时。`
                : "未找到候选证据。这不代表前提正确或过时。"}
            </p>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {result.claims.map((claimResult) => {
              if (claimResult.candidates.length === 0) return null;
              return (
                <div key={claimResult.claimFingerprint}>
                  <div className="space-y-2">
                    {claimResult.candidates.map((candidate) => (
                      <div
                        key={candidate.candidateFingerprint}
                        className="rounded-xl border border-rule bg-paper-2 px-5 py-4"
                      >
                        <a
                          href={candidate.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-accent hover:underline"
                        >
                          {candidate.title}
                        </a>
                        <p className="mt-1.5 break-words text-xs text-muted">
                          {candidate.contentPreview}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                          <span>
                            来源{" "}
                            <span className="font-medium text-ink-subtle">
                              {candidate.sourceLabel}
                            </span>
                          </span>
                          <span>
                            类型{" "}
                            <span className="font-medium text-ink-subtle">
                              {candidate.authorityHint}
                            </span>
                          </span>
                          <span>捕获 {formatTimestamp(candidate.capturedAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Idle — show the retrieve button
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={onRetrieve}
        className="rounded-xl border border-rule bg-paper-2 px-5 py-3 text-sm font-medium text-ink-subtle transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        重新检索候选证据
      </button>
    </div>
  );
}
