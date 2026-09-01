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
  type AnswerCandidate,
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

type MaintenanceStatus = AnswerCandidate["maintenance"]["status"];

const MAINTENANCE_STATUS_STYLES: Record<MaintenanceStatus, string> = {
  VISIBLE: "bg-success-soft text-success",
  DISPUTED: "bg-update-soft text-update",
  SUPERSEDED: "bg-paper-3 text-muted",
  RESOLVED: "bg-success-soft text-success",
  WITHDRAWN: "bg-paper-3 text-muted",
  unknown: "bg-paper-3 text-muted",
  not_tracked: "bg-paper-3 text-muted",
};

const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  VISIBLE: "已维护",
  DISPUTED: "有争议",
  SUPERSEDED: "已替代",
  RESOLVED: "已解决",
  WITHDRAWN: "已撤回",
  unknown: "状态未知",
  not_tracked: "未跟踪",
};

const MAINTENANCE_STATUS_HINTS: Partial<Record<MaintenanceStatus, string>> = {
  VISIBLE: "已有关键前提更新记录",
  DISPUTED: "有人提出异议，先复核证据",
  SUPERSEDED: "已有更新的维护结论",
  RESOLVED: "争议已按证据处理",
  WITHDRAWN: "记录已撤回",
  not_tracked: "还没有维护记录，可先进入阅读页",
  unknown: "维护状态暂不可用，可直接检查原文摘录",
};

// ── Starter question chips ─────────────────────────────────────────────────────
// Factual questions that exercise the real Zhihu search flow.

const STARTER_QUESTIONS = [
  "ChatGPT Free 与 Plus 有什么关键差异",
  "Create React App 还值得学吗",
  "渐进式延迟法定退休年龄落地了吗",
  "为什么 QWERTY 键盘布局保留至今",
  "人民币汇率近期有什么变化",
  "电动汽车续航虚标问题现状",
] as const;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "答案空间 · Living Answer",
      },
      {
        name: "description",
        content: "搜索知乎问题，筛选可维护的回答，核对已经变化的前提。",
      },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
      { rel: "alternate icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
  }),
  component: AnswerSpace,
});

function AnswerSpace() {
  const navigate = useNavigate();
  const boundResolve = useServerFn(resolveAnswerExcerpt);
  const boundAnalyze = useServerFn(analyzePatch);
  const boundExtractClaims = useServerFn(extractAnswerClaims);
  const boundRetrieveEvidence = useServerFn(retrieveEvidenceCandidatesFn);
  const boundSearchCandidates = useServerFn(searchAnswerCandidates);
  const boundListChanges = useServerFn(listPatchChanges);
  const boundRead = useServerFn(readAnswer);

  // ── Search state ────────────────────────────────────────────────────────────

  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchAnswerCandidatesResponse | null>(null);
  const [searchRan, setSearchRan] = useState(false);

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
  const [disputeLoading, setDisputeLoading] = useState(false);

  // ── Claims state ──────────────────────────────────────────────────────────────

  const [claimsResult, setClaimsResult] = useState<ExtractAnswerClaimsResponse | null>(null);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimsRetryKey, setClaimsRetryKey] = useState(0);

  // ── Advanced URL section visibility ────────────────────────────────────────

  const [showAdvancedUrl, setShowAdvancedUrl] = useState(false);

  // ── Recent maintained answers ────────────────────────────────────────────

  const [recentChanges, setRecentChanges] = useState<ListPatchChangesResponse | null>(null);

  // ── Evidence candidates state ────────────────────────────────────────────────

  const [evidenceResult, setEvidenceResult] = useState<RetrieveEvidenceResponse | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const evidenceRequestKeyRef = useRef<string | null>(null);

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
    setSearchRan(true);
    setSearchResult(null);

    const response = await boundSearchCandidates({ data: { query: trimmed } }).catch(() => null);
    if (response) {
      setSearchResult(response as SearchAnswerCandidatesResponse);
    } else {
      setSearchResult({ status: "error", code: "SEARCH_ERROR", message: "搜索失败，请稍后再试。" });
    }
    setSearchLoading(false);
  };

  const handleStarterSubmit = (question: string) => {
    setSearchQuery(question);
    setSearchResult(null);
    setSearchRan(true);
    // Trigger the search after state update
    void boundSearchCandidates({ data: { query: question } }).then((response) => {
      if (response) {
        setSearchResult(response as SearchAnswerCandidatesResponse);
      } else {
        setSearchResult({
          status: "error",
          code: "SEARCH_ERROR",
          message: "搜索失败，请稍后再试。",
        });
      }
    });
  };

  // ── Candidate selection ────────────────────────────────────────────────────

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

    // Excerpt not available — enter the URL analysis workspace
    setServerResult({
      status: "error",
      code: readResponse?.status === "no_excerpt" ? "ANSWER_NOT_FOUND" : "PROVIDER_ERROR",
    });
  };

  // ── Advanced URL handler ───────────────────────────────────────────────────

  const handleAdvancedSubmit = async (e: React.FormEvent) => {
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

  // ── Golden demo records ─────────────────────────────────────────────────────

  const goldenDemos: GoldenDemoFixture[] = [
    GOLDEN_DEMOS["chatgpt-free-plus"],
    GOLDEN_DEMOS["create-react-app"],
    GOLDEN_DEMOS["delayed-retirement"],
  ];
  const maintainedAnswers = recentChanges?.status === "ok" ? recentChanges.changes.slice(0, 3) : [];

  // ── URL fallback notice ─────────────────────────────────────────────────────

  const entryFailureNotice = () => {
    if (!serverResult || serverResult.status !== "error") return null;

    const trimmed = url.trim();
    const parsed = parseZhihuAnswerUrl(trimmed);
    if (parsed._tag !== "success") return null;

    const isNotFound =
      serverResult.code === "ANSWER_NOT_FOUND" || serverResult.code === "UNSUPPORTED_ANSWER_URL";

    return (
      <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <p className="text-sm font-semibold text-ink">
            {isNotFound ? "链接已识别，但摘录服务未返回该回答" : failureMessage(serverResult.code)}
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            问题 #{parsed.questionId} · 回答 #{parsed.answerId}
          </p>
        </div>

        {isNotFound && (
          <>
            <p className="mt-3 max-w-[68ch] text-sm leading-6 text-ink-subtle">
              当前摘录来自搜索接口，不能按回答 URL
              保证精确定位。这条回答可能未被收录、已受限，或暂时不可检索。
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setUrl("");
                  setErrorState(null);
                  setServerResult(null);
                  setSearchQuery("");
                  setSearchResult(null);
                  setSearchRan(false);
                  document.getElementById("answer-space-search")?.focus();
                }}
                className="inline-flex h-10 items-center rounded-[6px] border border-rule bg-paper px-3.5 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-paper-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                搜索该问题
              </button>
              <a
                href={`https://www.zhihu.com/question/${parsed.questionId}/answer/${parsed.answerId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center rounded-[6px] border border-rule bg-paper px-3.5 text-xs font-semibold text-accent-text transition-colors duration-150 hover:border-accent/42 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                在知乎打开原文 &rarr;
              </a>
            </div>
            <p className="mt-3 text-xs text-muted">
              以下是当前可直接阅读的准备记录，可直接进入阅读页。
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {goldenDemos.map((demo) => (
                <GoldenDemoPreviewCard key={demo.id} demo={demo} variant="compact" />
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  // ── Derive display state ───────────────────────────────────────────────────

  const isPending = loading;
  const resultData = serverResult?.status === "ok" ? serverResult : null;

  const showLoading = isPending;
  const showSuccess = !isPending && !!resultData;
  const showError = !isPending && !showSuccess && serverResult !== null;

  const showExtractSuccess = showSuccess && resultData !== null;

  const serverErrorCode =
    showError &&
    serverResult &&
    typeof serverResult === "object" &&
    serverResult.status === "error" &&
    "code" in serverResult
      ? (serverResult.code as
          | "INVALID_REQUEST"
          | "MISSING_ACCESS_SECRET"
          | "UNSUPPORTED_ANSWER_URL"
          | "ANSWER_NOT_FOUND"
          | "AMBIGUOUS_ANSWER"
          | "INVALID_PROVIDER_ANSWER"
          | "PROVIDER_ERROR")
      : null;

  return (
    <main className="min-h-screen bg-paper pb-20 text-ink">
      {/* ═══ Compact working header ══════════════════════════════════════════════ */}
      <header className="bg-ink text-paper">
        <div className="mx-auto w-full max-w-[1120px] px-5 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/70">
            LIVING ANSWER · 答案空间
          </p>
          <p className="mt-3 max-w-[68ch] text-sm leading-6 text-paper/74 sm:text-base sm:leading-7">
            {PRODUCT_TAGLINE}
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1120px] space-y-12 px-5 sm:px-8">
        {/* ═══ Search section (default entry) ═══════════════════════════════════ */}
        <section className="pt-10">
          <form onSubmit={handleSearch} noValidate className="max-w-3xl">
            <label htmlFor="answer-space-search" className="sr-only">
              搜索知乎问题
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                id="answer-space-search"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                }}
                placeholder="输入问题关键词，例如：React 19 还值得学吗"
                disabled={searchLoading || disputeLoading}
                autoComplete="off"
                className="h-14 flex-1 rounded-[4px] border border-rule bg-paper-3 px-4 text-base text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-paper disabled:text-faint"
              />
              <button
                type="submit"
                disabled={searchLoading || disputeLoading}
                className="inline-flex h-14 shrink-0 items-center justify-center rounded-[6px] bg-accent px-7 text-sm font-semibold text-on-accent transition-colors duration-150 hover:bg-accent-hover active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-rule disabled:text-faint"
              >
                {searchLoading ? "正在搜索…" : "搜索回答"}
              </button>
            </div>
          </form>

          {/* Starter chips ────────────────────────────────────────────────── */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">试试：</span>
            {STARTER_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleStarterSubmit(q)}
                className="inline-flex min-h-[36px] items-center rounded-[4px] border border-rule bg-paper-2 px-3 text-xs font-medium text-ink-subtle transition-colors duration-150 hover:border-accent/42 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Search results ───────────────────────────────────────────────── */}
          {(searchResult?.status === "error" || searchResult?.status === "ok") && (
            <div className="mt-8 max-w-3xl">
              {searchResult?.status === "error" && (
                <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
                  <p className="text-sm font-medium text-ink-subtle">{searchResult.message}</p>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedUrl(true)}
                    className="mt-3 inline-flex min-h-11 items-center rounded-[6px] border border-rule bg-paper px-4 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-paper-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    或直接输入知乎回答链接
                  </button>
                </div>
              )}

              {searchResult?.status === "ok" && searchResult.candidates.length === 0 && (
                <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-5">
                  <p className="text-sm font-semibold text-ink">没有找到匹配的回答候选</p>
                  <p className="mt-2 max-w-[68ch] text-sm leading-6 text-ink-subtle">
                    当前接口只返回回答类内容；换一个更具体的问题关键词，通常比完整链接更容易命中。
                  </p>
                  <ul className="mt-4 space-y-2">
                    <li className="text-sm text-ink-subtle">
                      <span className="text-muted">&#x2713;</span> 尝试缩短关键词，去掉修饰词
                    </li>
                    <li className="text-sm text-ink-subtle">
                      <span className="text-muted">&#x2713;</span>{" "}
                      使用具体的技术名称、产品名或政策名
                    </li>
                    <li className="text-sm text-ink-subtle">
                      <span className="text-muted">&#x2713;</span>{" "}
                      如果你已有知乎回答链接，可以尝试直接粘贴
                    </li>
                  </ul>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedUrl(true)}
                      className="inline-flex min-h-11 items-center rounded-[6px] border border-rule bg-paper px-4 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-paper-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      直接输入回答链接
                    </button>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {goldenDemos.map((demo) => (
                        <GoldenDemoPreviewCard key={demo.id} demo={demo} variant="compact" />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {searchResult?.status === "ok" && searchResult.candidates.length > 0 && (
                <ul className="mt-6 space-y-3" role="list">
                  {searchResult.candidates.map((c) => (
                    <li key={c.answerId}>
                      <button
                        type="button"
                        onClick={() => handleSelectCandidate(c)}
                        className={
                          "block w-full rounded-[2px] border border-rule bg-paper-2 px-5 py-5 text-left shadow-[var(--shadow-card)] transition-colors duration-150 " +
                          "hover:border-accent/42 hover:shadow-[0_1px_0_var(--color-accent),var(--shadow-card)] " +
                          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                        }
                      >
                        <div className="flex min-w-0 items-start justify-between gap-x-4 gap-y-2">
                          <p className="min-w-0 text-[17px] font-semibold leading-7 text-ink">
                            {c.title || `知乎回答 #${c.answerId}`}
                          </p>
                          <span
                            className={[
                              "inline-flex shrink-0 items-center rounded-[4px] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em]",
                              MAINTENANCE_STATUS_STYLES[c.maintenance.status],
                            ].join(" ")}
                          >
                            {MAINTENANCE_STATUS_LABELS[c.maintenance.status]}
                          </span>
                        </div>

                        {c.preview && (
                          <p className="mt-2.5 line-clamp-2 text-sm leading-6 text-ink-subtle">
                            {c.preview}
                          </p>
                        )}

                        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tracking-[0.04em] text-muted">
                          {c.authorDisplayName && (
                            <span>
                              作者{" "}
                              <span className="font-medium text-ink-subtle">
                                {c.authorDisplayName}
                              </span>
                            </span>
                          )}
                          {c.editAt != null && (
                            <span>编辑于 {formatDateFromUnixSeconds(c.editAt)}</span>
                          )}
                          <span>
                            问题 #{c.questionId} · 回答 #{c.answerId}
                          </span>
                        </div>

                        <p className="mt-3 text-sm font-medium text-accent-text">
                          {MAINTENANCE_STATUS_HINTS[c.maintenance.status]}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Empty state before first search ───────────────────────────────── */}
          {!searchRan && (
            <div className="mt-8 max-w-3xl">
              <p className="text-sm text-muted">输入一个问题关键词开始搜索，或选择一个推荐问题。</p>
            </div>
          )}
        </section>

        {/* ═══ Golden Demo records (directly readable) ══════════════════════════ */}
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
              这些回答已有完整的维护记录，可直接进入阅读页。每一页都保留原文、标注变化、列出证据。
            </p>
          </div>

          <div className="mt-8 space-y-5">
            {goldenDemos.map((demo) => (
              <GoldenDemoPreviewCard key={demo.id} demo={demo} />
            ))}
          </div>
        </section>

        {/* ═══ Recently maintained answers ══════════════════════════════════════ */}
        {maintainedAnswers.length > 0 && (
          <section aria-labelledby="recent-maintained-heading">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
                RECENTLY MAINTAINED
              </p>
              <h2
                id="recent-maintained-heading"
                className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em]"
              >
                最近被核对的回答
              </h2>
              <p className="mt-3 max-w-[68ch] text-base leading-7 text-ink-subtle">
                这些回答已经有可核对的维护记录，可以直接进入专属阅读页。
              </p>
            </div>

            <ul
              className={
                maintainedAnswers.length === 3
                  ? "mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                  : "mt-8 grid gap-4 sm:grid-cols-2"
              }
              role="list"
            >
              {maintainedAnswers.map((entry) => (
                <li key={entry.recordFingerprint}>
                  <Link
                    to="/read/answer/$questionId/$answerId"
                    params={{
                      questionId: entry.questionId,
                      answerId: entry.answerId,
                    }}
                    className="block h-full rounded-[2px] border border-rule bg-paper-2 p-5 shadow-[var(--shadow-card)] transition-colors duration-150 hover:border-accent/42 hover:shadow-[0_1px_0_var(--color-accent),var(--shadow-card)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span
                        className={[
                          "inline-flex items-center rounded-[4px] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em]",
                          MAINTENANCE_STATUS_STYLES[entry.status as MaintenanceStatus] ??
                            MAINTENANCE_STATUS_STYLES.unknown,
                        ].join(" ")}
                      >
                        {MAINTENANCE_STATUS_LABELS[entry.status as MaintenanceStatus] ??
                          MAINTENANCE_STATUS_LABELS.unknown}
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-muted">
                        {formatTimestamp(entry.eventAt)}
                      </span>
                    </div>
                    <p className="mt-4 line-clamp-3 text-sm font-semibold leading-6 text-ink">
                      {entry.reason}
                    </p>
                    <p className="mt-3 text-xs leading-5 text-muted">
                      证据 {entry.evidenceCount} 条 · 回答 #{entry.answerId}
                    </p>
                    <p className="mt-4 text-sm font-medium text-accent-text">打开阅读页 &rarr;</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ═══ Advanced URL entry (collapsible) ════════════════════════════════ */}
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
            {showAdvancedUrl ? "收起" : "展开"}高级入口：直接输入知乎回答链接
          </button>

          {showAdvancedUrl && (
            <div className="mt-6 max-w-3xl space-y-5">
              <form onSubmit={handleAdvancedSubmit} noValidate className="flex flex-col gap-3">
                <label
                  htmlFor="advanced-answer-url"
                  className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
                >
                  知乎回答链接
                </label>
                <input
                  id="advanced-answer-url"
                  type="url"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (errorState) setErrorState(null);
                  }}
                  placeholder="https://www.zhihu.com/question/42/answer/100"
                  disabled={loading || disputeLoading}
                  autoComplete="off"
                  className="h-14 w-full rounded-[4px] border border-rule bg-paper-3 px-4 text-base text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-paper disabled:text-faint"
                />
                <button
                  type="submit"
                  disabled={loading || disputeLoading}
                  className="inline-flex h-12 items-center justify-center rounded-[6px] bg-accent px-5 text-sm font-semibold text-on-accent transition-colors duration-150 hover:bg-accent-hover active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-rule disabled:text-faint"
                >
                  {loading ? "正在获取摘录" : "开始核对"}
                </button>
                {errorState && !loading && (
                  <p className="text-sm text-update">{errorState.message}</p>
                )}
              </form>

              {/* URL analysis workspace ─────────────────────────────────────── */}
              {showLoading && (
                <div className="flex min-h-14 items-center gap-3 rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 animate-pulse rounded-[6px] bg-accent"
                  />
                  <p className="text-sm text-ink-subtle">正在获取回答摘录…</p>
                </div>
              )}

              {errorState && !loading && (
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

              <ClaimsSection loading={claimsLoading} result={claimsResult} onRetry={retryClaims} />

              {claimsResult?.status === "ok" && claimsResult.claims.length > 0 && (
                <EvidenceCandidatesSection
                  loading={evidenceLoading}
                  result={evidenceResult}
                  onRetrieve={retryEvidence}
                />
              )}

              {/* Maintenance analysis workspace ────────────────────────────── */}
              {showExtractSuccess && (
                <div className="mt-6 space-y-5 border-t border-rule pt-8">
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
                        "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 " +
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
                      onRetry={() => void runAnalysis()}
                    />
                  )}
                </div>
              )}
            </div>
          )}
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
              <Link
                to="/landing"
                className="inline-flex min-h-11 items-center text-sm font-medium text-ink-subtle transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
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
