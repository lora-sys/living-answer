import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";

import { GOLDEN_DEMOS } from "../lib/golden-demo-fixture";
import type { GoldenDemoFixture } from "../lib/golden-demo-fixture";
import { parseZhihuAnswerUrl } from "../lib/zhihu-answer-url";
import type { ResolveAnswerExcerptResponse } from "../server/answer-excerpt-response";
import type { AnalyzePatchResponse } from "../server/analyze-patch-response";
import {
  failureMessage,
  formatDateFromUnixSeconds,
  formatTimestamp,
} from "../lib/failure-messages";
import { PRODUCT_TAGLINE } from "../lib/app-info";
import { resolveAnswerExcerpt } from "../server/resolve-answer-excerpt";
import { readAnswer } from "../server/read-answer";
import { analyzePatch } from "../server/analyze-patch";
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
import { GoldenDemoPreviewCard } from "../components/demo/GoldenDemoPreviewCard";
import { type ListPatchChangesResponse, listPatchChanges } from "../server/list-patch-changes";

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
  const navigate = useNavigate();
  const boundResolve = useServerFn(resolveAnswerExcerpt);
  const boundAnalyze = useServerFn(analyzePatch);
  const boundExtractClaims = useServerFn(extractAnswerClaims);
  const boundRetrieveEvidence = useServerFn(retrieveEvidenceCandidatesFn);
  const boundSearchCandidates = useServerFn(searchAnswerCandidates);
  const boundListChanges = useServerFn(listPatchChanges);
  const boundRead = useServerFn(readAnswer);

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

  // ── Claims state ─────────────────────────────────────────────────────────────
  const [claimsResult, setClaimsResult] = useState<ExtractAnswerClaimsResponse | null>(null);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsRetryKey, setClaimsRetryKey] = useState(0);

  // ── Recent maintained answers ────────────────────────────────────────────
  const [recentChanges, setRecentChanges] = useState<ListPatchChangesResponse | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    boundListChanges()
      .then((response) => {
        if (!cancelled) setRecentChanges(response);
      })
      .catch(() => {
        if (!cancelled) setRecentChanges(null);
      });

    return () => {
      cancelled = true;
    };
  }, [boundListChanges]);

  const handleSelectCandidate = async (candidate: {
    questionId: string;
    answerId: string;
    url: string;
  }): Promise<void> => {
    setUrl(candidate.url);
    setErrorState(null);
    setServerResult(null);
    setAnalysisResult(null);
    setAnalysisError(null);
    setClaimsResult(null);
    setEvidenceResult(null);
    evidenceRequestKeyRef.current = null;

    const readResponse = await boundRead({
      data: { questionId: candidate.questionId, answerId: candidate.answerId },
    }).catch(() => null);

    if (readResponse?.status === "ok" || readResponse?.status === "excerpt_only") {
      await navigate({
        to: "/read/answer/$questionId/$answerId",
        params: { questionId: candidate.questionId, answerId: candidate.answerId },
      });
      setSearchResult(null);
      setSearchQuery("");
      return;
    }

    setEntryMode("url");
    setSearchResult(null);
    setSearchQuery("");
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
      if (
        response.status === "ok" &&
        response.decision.verdict === "UPDATE" &&
        resultData !== null
      ) {
        await navigate({
          to: "/read/answer/$questionId/$answerId",
          params: {
            questionId: resultData.excerpt.questionId,
            answerId: resultData.excerpt.answerId,
          },
        });
      }
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

  const goldenDemos: GoldenDemoFixture[] = [
    GOLDEN_DEMOS["chatgpt-free-plus"],
    GOLDEN_DEMOS["create-react-app"],
    GOLDEN_DEMOS["delayed-retirement"],
  ];
  const supportingDemos = goldenDemos.slice(1);
  const maintainedAnswers = recentChanges?.status === "ok" ? recentChanges.changes.slice(0, 3) : [];
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

  const entryFailureNotice = () => {
    if (serverErrorCode !== "ANSWER_NOT_FOUND") return null;
    const parsed = parseZhihuAnswerUrl(url.trim());
    if (parsed._tag !== "success") return null;

    return (
      <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <p className="text-sm font-semibold text-ink">链接已识别，但摘录服务未返回该回答</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            问题 #{parsed.questionId} · 回答 #{parsed.answerId}
          </p>
        </div>
        <p className="mt-3 max-w-[68ch] text-sm leading-6 text-ink-subtle">
          当前摘录来自搜索接口，不能按回答 URL
          保证精确定位。这条回答可能未被收录、已受限，或暂时不可检索。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setEntryMode("search");
              setSearchQuery("React 19 还值得学吗");
            }}
            className="inline-flex h-10 items-center rounded-[6px] border border-rule bg-paper px-3.5 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-paper-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            改用搜索问题
          </button>
          <p className="text-xs text-muted">搜索时输入问题关键词，而不是完整回答链接。</p>
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-paper pb-20 text-ink">
      {/* ═══ Revision desk hero ═════════════════════════════════════════════ */}
      <section className="bg-ink text-paper">
        <div className="mx-auto grid w-full max-w-[1120px] gap-12 px-5 pb-14 pt-12 sm:px-8 lg:grid-cols-[minmax(0,52fr)_minmax(0,48fr)] lg:gap-16 lg:pb-20 lg:pt-16">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/70">
              ZHIHU REVISION DESK
            </p>
            <h1 className="mt-6 font-display text-[44px] leading-[48px] font-normal tracking-[-0.01em] text-paper lg:text-[78px] lg:leading-[82px]">
              让旧回答与今天核对
            </h1>
            <p className="mt-6 max-w-[62ch] text-base leading-7 text-paper/78 sm:text-lg sm:leading-8">
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

          <div className="min-w-0">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-paper/64">
              FEATURED PATCH
            </p>
            <GoldenDemoPreviewCard demo={goldenDemos[0]} variant="hero" />
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1120px] space-y-16 px-5 sm:px-8">
        {/* ═══ Dual entry: URL or search ═════════════════════════════════════ */}
        <section id="answer-entry" className="scroll-mt-20 pt-12">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
              START
            </p>
            <h2 className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em]">
              粘贴知乎回答，或先搜索一个问题
            </h2>
            <p className="mt-3 max-w-[68ch] text-base leading-7 text-ink-subtle">
              系统先取得摘录，再抽取候选前提、检索来源，最后在证据充分时给出可争议的更新记录。
            </p>
          </div>

          {/* ── Segmented control ─────────────────────────────────────────── */}
          {/* ── Segmented control ─────────────────────────────────────────── */}
          <div
            role="tablist"
            aria-label="选择入口方式"
            className="mt-8 inline-flex rounded-[6px] border border-rule bg-paper p-1"
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
                  "min-h-11 rounded-[4px] px-4 py-2 text-sm font-semibold transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  entryMode === mode
                    ? "border border-rule-strong bg-paper-3 text-ink"
                    : "border border-transparent text-muted hover:text-ink",
                ].join(" ")}
              >
                {mode === "url" ? "粘贴链接" : "搜索问题"}
              </button>
            ))}
          </div>

          {entryMode === "url" && (
            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="answer-url"
                  className="block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
                >
                  ZHIHU ANSWER URL
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
                    "mt-2 block h-14 w-full rounded-[4px] border border-rule bg-paper-3 px-4 text-base text-ink " +
                    "placeholder:text-muted " +
                    "focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/18 " +
                    "disabled:cursor-not-allowed disabled:bg-paper disabled:text-faint"
                  }
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isPending || disputeLoading}
                    className={
                      "inline-flex h-12 items-center rounded-[6px] px-5 text-sm font-semibold text-on-accent " +
                      "bg-accent transition-colors duration-150 hover:bg-accent-hover active:translate-y-px active:bg-accent-active " +
                      "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent " +
                      "disabled:cursor-not-allowed disabled:bg-rule disabled:text-faint"
                    }
                  >
                    {isPending ? "获取中" : "获取摘录"}
                  </button>
                  {isPending && <span className="text-sm text-muted">正在检索回答摘录…</span>}
                </div>
                <p className="text-xs text-muted">
                  粘贴后点击获取摘录，查看该回答的前提是否已变化。
                </p>
              </div>

              {showLoading && (
                <div className="flex min-h-14 items-center gap-3 rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 animate-pulse rounded-[6px] bg-accent"
                  />
                  <p className="text-sm text-ink-subtle">正在获取回答摘录…</p>
                </div>
              )}

              {errorState && !isPending && (
                <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
                  <p className="text-sm font-medium text-ink-subtle">{errorState.message}</p>
                </div>
              )}

              {showError && serverErrorCode && entryFailureNotice() === null && (
                <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
                  <p className="text-sm font-medium text-ink-subtle">
                    {failureMessage(serverErrorCode)}
                  </p>
                </div>
              )}

              {entryFailureNotice()}

              {showSuccess && resultData && (
                <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-5 sm:px-6 sm:py-6">
                  <p className="whitespace-pre-wrap break-words text-base leading-7 text-ink-subtle sm:text-lg sm:leading-8">
                    {resultData.excerpt.excerpt}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs uppercase tracking-[0.06em] text-muted">
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
                    来源编辑时间 {formatDateFromUnixSeconds(resultData.excerpt.sourceEditTime)}
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
                <label
                  htmlFor="search-query"
                  className="block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
                >
                  SEARCH ZHIHU
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
                    "mt-2 block h-14 w-full rounded-[4px] border border-rule bg-paper-3 px-4 text-base text-ink " +
                    "placeholder:text-muted " +
                    "focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/18 " +
                    "disabled:cursor-not-allowed disabled:bg-paper disabled:text-faint"
                  }
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={searchLoading || disputeLoading}
                  className={
                    "inline-flex h-12 items-center rounded-[6px] px-5 text-sm font-semibold text-on-accent " +
                    "bg-accent transition-colors duration-150 hover:bg-accent-hover active:translate-y-px active:bg-accent-active " +
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent " +
                    "disabled:cursor-not-allowed disabled:bg-rule disabled:text-faint"
                  }
                >
                  {searchLoading ? "搜索中" : "搜索"}
                </button>
                {searchLoading && <span className="text-sm text-muted">正在搜索知乎回答…</span>}
              </div>

              {searchResult?.status === "error" && (
                <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
                  <p className="text-sm font-medium text-ink-subtle">{searchResult.message}</p>
                </div>
              )}

              {searchResult?.status === "ok" && searchResult.candidates.length === 0 && (
                <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
                  <p className="text-sm font-medium text-ink-subtle">
                    搜索完成，但没有可用的回答候选。
                  </p>
                  <p className="mt-2 max-w-[68ch] text-sm leading-6 text-ink-subtle">
                    当前接口只返回回答类内容；换一个更具体的问题关键词，通常比粘贴完整链接更容易命中。
                  </p>
                </div>
              )}

              {searchResult?.status === "ok" && searchResult.candidates.length > 0 && (
                <ul className="space-y-2" role="list">
                  {searchResult.candidates.map((c) => (
                    <li key={c.answerId}>
                      <button
                        type="button"
                        onClick={() => handleSelectCandidate(c)}
                        className={
                          "block w-full rounded-[2px] border border-rule bg-paper-2 px-4 py-4 text-left transition-colors duration-150 " +
                          "hover:border-accent/30 " +
                          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                        }
                      >
                        <p className="text-sm font-semibold text-ink">
                          {c.title || `知乎回答 #${c.answerId}`}
                        </p>
                        {c.preview && (
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
                            {c.preview}
                          </p>
                        )}
                        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
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
            <div className="mt-10 space-y-5 border-t border-rule pt-8">
              <div>
                <label
                  htmlFor="analysis-context"
                  className="block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
                >
                  MAINTENANCE CONTEXT
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
                    "mt-2 block w-full rounded-[4px] border border-rule bg-paper-3 px-4 py-3 text-base text-ink " +
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
                    "inline-flex h-12 items-center rounded-[6px] px-5 text-sm font-semibold text-on-accent " +
                    "bg-accent transition-colors duration-150 hover:bg-accent-hover active:translate-y-px active:bg-accent-active " +
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent " +
                    "disabled:cursor-not-allowed disabled:bg-rule disabled:text-faint"
                  }
                >
                  {claimsLoading || evidenceLoading ? "准备分析中" : "分析前提变化"}
                </button>
                {analysisLoading && <span className="text-sm text-muted">正在分析…</span>}
              </div>

              {analysisResult?.status === "ok" &&
              analysisResult.decision.verdict === "UPDATE" &&
              resultData !== null ? (
                <div className="rounded-[2px] border border-success/32 bg-success-soft px-5 py-5">
                  <p className="text-sm font-semibold text-success">分析已完成</p>
                  <p className="mt-2 max-w-[68ch] text-sm leading-6 text-ink-subtle">
                    结果已保存到专属阅读页，可以在阅读页复核证据、反馈或继续维护。
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      void navigate({
                        to: "/read/answer/$questionId/$answerId",
                        params: {
                          questionId: resultData.excerpt.questionId,
                          answerId: resultData.excerpt.answerId,
                        },
                      })
                    }
                    className="mt-4 inline-flex min-h-11 items-center rounded-[6px] bg-accent px-5 text-sm font-semibold text-on-accent transition-colors duration-150 hover:bg-accent-hover active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                  >
                    打开回答阅读页 &rarr;
                  </button>
                </div>
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

        {maintainedAnswers.length > 0 && (
          <section aria-labelledby="recent-maintained-heading">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
                RECENT
              </p>
              <h2
                id="recent-maintained-heading"
                className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em]"
              >
                最近维护的回答
              </h2>
              <p className="mt-3 max-w-[68ch] text-base leading-7 text-ink-subtle">
                这些回答已经有可核对的维护记录，可以直接进入专属阅读页。
              </p>
            </div>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
              {maintainedAnswers.map((entry) => (
                <li key={entry.recordFingerprint}>
                  <Link
                    to="/read/answer/$questionId/$answerId"
                    params={{
                      questionId: entry.questionId,
                      answerId: entry.answerId,
                    }}
                    className="block h-full rounded-[2px] border border-rule bg-paper-2 p-5 transition-colors duration-150 hover:border-accent/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                  >
                    <p className="line-clamp-2 text-sm font-semibold text-ink">{entry.reason}</p>
                    <p className="mt-3 text-xs leading-5 text-muted">
                      问题 #{entry.questionId} · 回答 #{entry.answerId}
                    </p>
                    <p className="mt-4 text-sm font-medium text-accent-text">打开阅读页 &rarr;</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ═══ Patch proof ledger ══════════════════════════════════════════════ */}
        <section aria-labelledby="demo-heading">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
              PROOF LEDGER
            </p>
            <h2
              id="demo-heading"
              className="mt-3 text-[32px] font-semibold leading-10 tracking-[-0.02em] sm:text-[38px] sm:leading-11"
            >
              两份补充记录
            </h2>
            <p className="mt-4 max-w-[68ch] text-base leading-7 text-ink-subtle">
              上方是精选记录；这里继续展示同一套阅读方式：保留作者原答，指出今天需要核对的前提，再把结论放回来源旁边。
            </p>
          </div>

          <div className="mt-8 space-y-5">
            {supportingDemos.map((demo) => (
              <GoldenDemoPreviewCard key={demo.id} demo={demo} />
            ))}
          </div>
        </section>

        {/* ═══ Closing statement ═════════════════════════════════════════════════ */}
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

// ── Claims section sub-component ───────────────────────────────────────────────

interface ClaimsSectionProps {
  readonly loading: boolean;
  readonly result: ExtractAnswerClaimsResponse | null;
  readonly onRetry: () => void;
}

function ClaimsSection({ loading, result, onRetry }: ClaimsSectionProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
        <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-[6px] bg-accent" />
        <p className="text-sm text-ink-subtle">正在分析摘录前提…</p>
      </div>
    );
  }

  if (result?.status === "error") {
    return (
      <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-ink-subtle">{failureMessage(result.code)}</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex shrink-0 items-center rounded-[6px] px-4 py-1.5 text-xs font-semibold text-on-accent bg-accent hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
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
          <div className="mt-3 rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
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
              className="rounded-[2px] border border-rule bg-paper-2 px-5 py-4"
            >
              <p className="break-words text-sm font-medium text-ink">{claim.claimText}</p>
              <div className="mt-2.5 space-y-1.5">
                <p className="text-xs text-muted">
                  锚点文本{" "}
                  <code className="rounded bg-paper px-1.5 py-0.5 font-mono font-mono text-xs leading-5 text-ink-subtle">
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
      <div className="mt-4 flex items-center gap-3 rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
        <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-[6px] bg-accent" />
        <p className="text-sm text-ink-subtle">正在检索候选证据…</p>
      </div>
    );
  }

  if (result?.status === "error") {
    return (
      <div className="mt-4 rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h3 className="text-sm font-medium text-ink-subtle">证据候选 · 第 2 步</h3>
          <button
            type="button"
            onClick={onRetrieve}
            className="inline-flex shrink-0 items-center rounded-[6px] bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
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
            <span className="text-xs text-update">
              {partialRetrievalMessage(result.partialState)}
            </span>
          )}
        </div>

        {allCandidates.length === 0 ? (
          <div className="mt-3 rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
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
                        className="rounded-[2px] border border-rule bg-paper-2 px-5 py-4"
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
        className="rounded-[2px] border border-rule bg-paper-2 px-5 py-3 text-sm font-medium text-ink-subtle transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        重新检索候选证据
      </button>
    </div>
  );
}
