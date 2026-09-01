import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useServerFn } from "@tanstack/react-start";
import { formatDateFromUnixSeconds, formatTimestamp } from "../lib/failure-messages";
import { APP_NAME } from "../lib/app-info";
import { type AnswerExcerpt } from "../lib/answer-excerpt";

import { readAnswer, type ReadAnswerResponse } from "../server/read-answer";
import { failureMessage } from "../server/read-answer-response";
import { disputePatchLifecycle } from "../server/dispute-patch-lifecycle";
import { resolvePatchLifecycle } from "../server/resolve-patch-lifecycle";
import { withdrawPatchLifecycle } from "../server/withdraw-patch-lifecycle";
import {
  submitPatchFeedback,
  type SubmitPatchFeedbackInput,
  type SubmitPatchFeedbackResponse,
} from "../server/submit-patch-feedback";

import { type ClarifyFeedbackResponse, clarifyFeedbackFn } from "../server/clarify-feedback";

import { GeneralizedRealResultRead } from "../components/analysis/GeneralizedRealResultRead";

export const Route = createFileRoute("/read/answer/$questionId/$answerId")({
  head: ({ params }) => ({
    meta: [
      { title: `${APP_NAME} · 回答阅读 · 问题${params.questionId} · 回答${params.answerId}` },
      {
        name: "description",
        content: `Living Answer 为知乎回答 ${params.questionId}/${params.answerId} 补充前提变更证据。`,
      },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
  }),
  component: ReadAnswerPage,
});

type LifecycleActionStatus = "DISPUTED" | "RESOLVED" | "WITHDRAWN";

const updateLifecycleStatus = (
  response: ReadAnswerResponse,
  status: LifecycleActionStatus,
  eventAt: number,
): ReadAnswerResponse => {
  if (response.status !== "ok") return response;

  return {
    ...response,
    lifecycle: {
      ...response.lifecycle,
      status,
      eventAt,
    },
    history: response.history?.map((record) =>
      record.recordFingerprint === response.lifecycle.recordFingerprint
        ? { ...record, status, eventAt }
        : record,
    ),
  };
};

const lifecycleActionMessage = (response: unknown): string => {
  if (
    typeof response !== "object" ||
    response === null ||
    (response as { status?: unknown }).status !== "error"
  ) {
    return "操作出现异常，请稍后再试。";
  }

  const code = (response as { code?: unknown }).code;
  if (code === "INVALID_REQUEST") return "请求参数无效。";
  if (
    code === "DISPUTE_PATCH_NOT_FOUND" ||
    code === "RESOLVE_PATCH_NOT_FOUND" ||
    code === "WITHDRAW_PATCH_NOT_FOUND"
  ) {
    return "该变更记录不存在或已更新，请重新检查。";
  }
  return "变更状态更新时出现异常，请稍后再试。";
};

// ═══════════════════════════════════════════════════════════════════════════════
// Page component
// ═══════════════════════════════════════════════════════════════════════════════

function ReadAnswerPage() {
  const { questionId, answerId } = Route.useParams();
  const boundRead = useServerFn(readAnswer);
  const boundDispute = useServerFn(disputePatchLifecycle);
  const boundResolve = useServerFn(resolvePatchLifecycle);
  const boundWithdraw = useServerFn(withdrawPatchLifecycle);
  const boundSubmitFeedback = useServerFn(submitPatchFeedback);
  const boundClarify = useServerFn(clarifyFeedbackFn);
  const [result, setResult] = useState<ReadAnswerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lifecycleAction, setLifecycleAction] = useState<"dispute" | "resolve" | "withdraw" | null>(
    null,
  );
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResult(null);

    boundRead({ data: { questionId, answerId } })
      .then((response) => {
        if (!cancelled) setResult(response);
      })
      .catch(() => {
        if (!cancelled) {
          setResult({
            status: "error",
            code: "STORE_ERROR",
            message: failureMessage("STORE_ERROR"),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [boundRead, questionId, answerId]);

  const zhihuSourceUrl = `https://www.zhihu.com/question/${questionId}/answer/${answerId}`;

  if (loading) {
    return (
      <main className="min-h-screen bg-paper px-5 py-10 text-ink sm:px-8">
        <div className="mx-auto w-full max-w-[1120px] space-y-6">
          <PageHeader questionId={questionId} answerId={answerId} />
          <div
            role="status"
            aria-live="polite"
            className="flex min-h-14 items-center gap-3 rounded-[2px] border border-rule bg-paper-2 px-5 py-6"
          >
            <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
            <p className="text-sm text-ink-subtle">正在加载阅读页面…</p>
          </div>
        </div>
      </main>
    );
  }

  if (result?.status === "error") {
    return (
      <ErrorPage
        questionId={questionId}
        answerId={answerId}
        message={result.message}
        sourceUrl={zhihuSourceUrl}
      />
    );
  }

  if (result?.status === "no_excerpt") {
    return (
      <NoExcerptPage
        questionId={questionId}
        answerId={answerId}
        message={result.message}
        sourceUrl={zhihuSourceUrl}
      />
    );
  }

  if (result?.status === "excerpt_only") {
    return (
      <ExcerptOnlyPage
        questionId={questionId}
        answerId={answerId}
        excerpt={result.excerpt}
        message={result.message}
        sourceUrl={zhihuSourceUrl}
      />
    );
  }

  // status === "ok" — full read view via generalized component
  if (result?.status === "ok") {
    const okData = result;

    const handleLifecycleTransition = async (
      action: "dispute" | "resolve" | "withdraw",
    ): Promise<void> => {
      if (lifecycleAction !== null || okData.lifecycle.status !== "VISIBLE") return;

      setLifecycleAction(action);
      setLifecycleError(null);

      const boundFn =
        action === "dispute" ? boundDispute : action === "resolve" ? boundResolve : boundWithdraw;
      const actionResponse = await boundFn({
        data: { recordFingerprint: okData.lifecycle.recordFingerprint },
      }).catch(() => null);

      if (actionResponse?.status === "ok") {
        const newStatus =
          action === "dispute" ? "DISPUTED" : action === "resolve" ? "RESOLVED" : "WITHDRAWN";
        const eventAt =
          "disputedAt" in actionResponse
            ? actionResponse.disputedAt
            : "resolvedAt" in actionResponse
              ? actionResponse.resolvedAt
              : actionResponse.withdrawnAt;

        setResult((current) =>
          current === null ? current : updateLifecycleStatus(current, newStatus, eventAt),
        );
      } else {
        setLifecycleError(lifecycleActionMessage(actionResponse));
      }

      setLifecycleAction(null);
    };

    const handleDispute = (): Promise<void> => handleLifecycleTransition("dispute");
    const handleResolve = (): Promise<void> => handleLifecycleTransition("resolve");
    const handleWithdraw = (): Promise<void> => handleLifecycleTransition("withdraw");

    const handleSubmitFeedback = async (
      input: SubmitPatchFeedbackInput,
    ): Promise<SubmitPatchFeedbackResponse> => {
      const response = await boundSubmitFeedback({ data: input }).catch(() => null);
      if (response) return response;
      return {
        status: "error",
        code: "FEEDBACK_STORE_ERROR",
        message: "反馈提交出现异常，请稍后再试。",
      };
    };

    const handleClarify = async (input: {
      questionId: string;
      answerId: string;
      excerptFingerprint: string;
      excerptText: string;
      recordFingerprint?: string;
      currentReason?: string;
      conversation: readonly { role: string; content: string }[];
    }): Promise<ClarifyFeedbackResponse> => {
      const response = await boundClarify({ data: input }).catch(() => null);
      if (response?.success) {
        return response;
      }
      return {
        success: false,
        code: response?.code ?? "CLARIFICATION_UNAVAILABLE",
        message: response?.message ?? "澄清服务暂时不可用，请稍后再试。",
      };
    };

    return (
      <main className="min-h-screen bg-paper px-5 py-10 text-ink sm:px-8">
        <div className="mx-auto w-full max-w-[1120px] space-y-6">
          <PageHeader questionId={questionId} answerId={answerId} />
          <SourceNotice sourceUrl={zhihuSourceUrl} excerpt={okData.excerpt} />
          <GeneralizedRealResultRead
            excerpt={okData.excerpt}
            advisory={okData.advisory}
            lifecycle={okData.lifecycle}
            history={okData.history}
            onDispute={handleDispute}
            onResolve={handleResolve}
            onWithdraw={handleWithdraw}
            isLifecyclePending={lifecycleAction !== null}
            lifecycleError={lifecycleError}
            onSubmitFeedback={handleSubmitFeedback}
            onClarify={handleClarify}
          />
        </div>
      </main>
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// State-specific page shells
// ═══════════════════════════════════════════════════════════════════════════════

function ErrorPage({
  questionId,
  answerId,
  message,
  sourceUrl,
}: {
  readonly questionId: string;
  readonly answerId: string;
  readonly message: string;
  readonly sourceUrl: string;
}) {
  return (
    <main className="min-h-screen bg-paper px-5 py-10 text-ink sm:px-8">
      <div className="mx-auto w-full max-w-[1120px] space-y-6">
        <PageHeader questionId={questionId} answerId={answerId} />
        <div
          role="alert"
          className="rounded-[2px] border border-update/32 bg-update-soft px-5 py-5"
        >
          <p className="text-sm font-semibold text-ink">无法加载阅读页面</p>
          <p className="mt-1 text-sm text-ink-subtle">{message}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/"
              className="inline-flex min-h-11 items-center rounded-[6px] border border-rule bg-paper px-5 text-sm font-medium text-ink transition-colors duration-150 hover:bg-paper-3"
            >
              返回首页
            </Link>
            <ExternalLink href={sourceUrl}>直接访问知乎来源 &rarr;</ExternalLink>
          </div>
        </div>
      </div>
    </main>
  );
}

function NoExcerptPage({
  questionId,
  answerId,
  message,
  sourceUrl,
}: {
  readonly questionId: string;
  readonly answerId: string;
  readonly message: string;
  readonly sourceUrl: string;
}) {
  return (
    <main className="min-h-screen bg-paper px-5 py-10 text-ink sm:px-8">
      <div className="mx-auto w-full max-w-[1120px] space-y-6">
        <PageHeader questionId={questionId} answerId={answerId} />
        <div className="rounded-[2px] border border-info/32 bg-info-soft px-5 py-5">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-text">
            暂无摘录
          </p>
          <p className="mt-3 max-w-[68ch] text-sm leading-6 text-ink-subtle">{message}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/"
              className="inline-flex min-h-11 items-center rounded-[6px] bg-accent px-5 text-sm font-semibold text-on-accent transition-colors duration-150 hover:bg-accent-hover active:bg-accent-active"
            >
              获取摘录
            </Link>
            <ExternalLink href={sourceUrl}>直接访问知乎来源 &rarr;</ExternalLink>
          </div>
        </div>
      </div>
    </main>
  );
}

function ExcerptOnlyPage({
  questionId,
  answerId,
  excerpt,
  message,
  sourceUrl,
}: {
  readonly questionId: string;
  readonly answerId: string;
  readonly excerpt: AnswerExcerpt;
  readonly message: string;
  readonly sourceUrl: string;
}) {
  return (
    <main className="min-h-screen bg-paper px-5 py-10 text-ink sm:px-8">
      <div className="mx-auto w-full max-w-[1120px] space-y-6">
        <PageHeader questionId={questionId} answerId={answerId} />
        <SourceNotice sourceUrl={sourceUrl} />

        <div className="rounded-[2px] border border-info/32 bg-info-soft px-5 py-5">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-text">
            待分析
          </p>
          <p className="mt-3 max-w-[68ch] text-sm leading-6 text-ink-subtle">{message}</p>
        </div>

        <ExcerptView excerpt={excerpt} />

        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-[6px] bg-accent px-5 text-sm font-semibold text-on-accent transition-colors duration-150 hover:bg-accent-hover active:bg-accent-active"
        >
          启动分析流程
        </Link>
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function PageHeader({
  questionId,
  answerId,
}: {
  readonly questionId: string;
  readonly answerId: string;
}) {
  return (
    <section>
      <Link
        to="/"
        className="inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.12em] text-accent-text transition-colors duration-150 hover:text-accent-active"
      >
        <span aria-hidden="true">&larr;</span> 返回首页
      </Link>
      <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="font-display text-[32px] leading-[38px] font-normal text-ink sm:text-[52px] sm:leading-[56px]">
          回答阅读
        </h1>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
          问题 #{questionId} · 回答 #{answerId}
        </span>
      </div>
    </section>
  );
}

function SourceNotice({
  sourceUrl,
  excerpt,
}: {
  readonly sourceUrl: string;
  readonly excerpt?: AnswerExcerpt;
}) {
  return (
    <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <p className="text-sm font-medium text-ink-subtle">内容来源</p>
        <p className="text-xs text-muted">
          以下内容来自知乎公开搜索接口的摘要数据，不是回答的完整正文。
        </p>
      </div>
      <p className="mt-2 text-xs text-muted">
        原文地址：
        <ExternalLink href={sourceUrl}>{sourceUrl} &rarr;</ExternalLink>
      </p>
      {excerpt !== undefined && (
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          来源编辑时间 {formatDateFromUnixSeconds(excerpt.sourceEditTime)} · 摘录时间{" "}
          {formatTimestamp(excerpt.capturedAt)} · 内容 ID {excerpt.sourceContentId}
        </p>
      )}
    </div>
  );
}

function ExcerptView({ excerpt }: { readonly excerpt: AnswerExcerpt }) {
  const paragraphs = excerpt.excerpt
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-5 sm:px-6">
      <div className="space-y-4">
        {paragraphs.map((para, i) => (
          <p key={i} className="text-base leading-7 text-ink sm:text-lg sm:leading-8">
            {para}
          </p>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
        <span>
          问题 <span className="font-medium text-ink-subtle">#{excerpt.questionId}</span>
        </span>
        <span>
          回答 <span className="font-medium text-ink-subtle">#{excerpt.answerId}</span>
        </span>
        <span>摘录时间 {formatTimestamp(excerpt.capturedAt)}</span>
      </div>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
        来源编辑时间 {formatDateFromUnixSeconds(excerpt.sourceEditTime)}
      </p>
    </div>
  );
}

function ExternalLink({
  href,
  children,
}: {
  readonly href: string;
  readonly children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-text underline underline-offset-2 transition-colors hover:text-accent-active"
    >
      {children}
    </a>
  );
}
