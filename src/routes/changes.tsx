import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { type ListPatchChangesResponse, listPatchChanges } from "../server/list-patch-changes";
import { APP_NAME } from "../lib/app-info";
import { formatTimestamp } from "../lib/failure-messages";

const STATUS_STYLES: Record<string, string> = {
  VISIBLE: "border-rule bg-paper text-ink-subtle",
  DISPUTED: "border-update/32 bg-update-soft text-update",
  SUPERSEDED: "border-rule bg-paper text-muted",
  RESOLVED: "border-success/32 bg-success-soft text-success",
  WITHDRAWN: "border-rule bg-paper text-muted",
};

const STATUS_LABELS: Record<string, string> = {
  VISIBLE: "有效",
  DISPUTED: "存疑",
  SUPERSEDED: "已覆盖",
  RESOLVED: "已解决",
  WITHDRAWN: "已撤回",
};

function truncateReason(reason: string, max = 200): string {
  if (reason.length <= max) return reason;
  return reason.slice(0, max).trimEnd() + "…";
}

export const Route = createFileRoute("/changes")({
  head: () => ({
    meta: [
      { title: `${APP_NAME} · 变更时间线` },
      { name: "description", content: "Living Answer 所有回答前提变更的完整时间线。" },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
  }),
  component: ChangesPage,
});

function ChangesPage() {
  const boundList = useServerFn(listPatchChanges);
  const [result, setResult] = useState<ListPatchChangesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    boundList()
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }, [boundList]);

  const changes = result?.status === "ok" ? result.changes : [];

  return (
    <main className="min-h-screen bg-paper px-5 py-10 text-ink sm:px-8">
      <div className="mx-auto w-full max-w-[1120px] space-y-12">
        <section>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.12em] text-accent-text transition-colors duration-150 hover:text-accent-active"
          >
            <span aria-hidden="true">&larr;</span> 返回首页
          </Link>
          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
            CHANGE LEDGER
          </p>
          <h1 className="mt-3 font-display text-[32px] leading-[38px] font-normal text-ink sm:text-[52px] sm:leading-[56px]">
            变更时间线
          </h1>
          <p className="mt-4 max-w-[68ch] text-base leading-7 text-ink-subtle">
            所有回答前提的生命周期事件，按最新事件时间倒序排列。
          </p>
        </section>

        {loading && (
          <div
            role="status"
            aria-live="polite"
            className="flex min-h-14 items-center gap-3 rounded-[2px] border border-rule bg-paper-2 px-5 py-6"
          >
            <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
            <div className="space-y-2">
              <p className="text-sm text-ink-subtle">正在加载变更记录…</p>
              <div className="flex gap-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    aria-hidden="true"
                    className="h-3 w-24 animate-pulse rounded bg-rule"
                    style={{ animationDelay: `${i * 100}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {!loading && result?.status === "error" && (
          <div
            role="alert"
            className="rounded-[2px] border border-update/32 bg-update-soft px-5 py-5"
          >
            <p className="text-sm font-semibold text-ink">无法加载变更记录</p>
            <p className="mt-1 text-sm text-ink-subtle">{result.message}</p>
            <Link
              to="/"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent-text transition-colors duration-150 hover:text-accent-active"
            >
              返回首页
            </Link>
          </div>
        )}

        {!loading && result?.status === "ok" && changes.length === 0 && (
          <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-8">
            <p className="text-sm font-medium text-ink-subtle">变更时间线为空</p>
            <p className="mt-1 text-sm text-muted">
              目前还没有记录任何变更。当回答的前提或判断发生变化时，事件会出现在这里。
            </p>
            <Link
              to="/"
              className="mt-4 inline-flex min-h-11 items-center rounded-[6px] border border-rule bg-paper-3 px-5 text-sm font-medium text-ink transition-colors duration-150 hover:border-accent/42"
            >
              返回首页继续浏览
            </Link>
          </div>
        )}

        {!loading && changes.length > 0 && (
          <ul className="space-y-0" role="list">
            {changes.map((c) => {
              const zhihuUrl = `https://www.zhihu.com/question/${c.questionId}/answer/${c.answerId}`;
              const badgeClass = STATUS_STYLES[c.status] ?? "bg-paper text-ink-subtle border-rule";

              return (
                <li key={c.recordFingerprint} className="border-t border-rule pt-4 pb-4 last:pb-0">
                  <div className="rounded-[2px] border border-rule bg-paper-2 p-5 sm:p-6">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <span
                        className={[
                          "inline-flex min-h-8 items-center rounded-[2px] border px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em]",
                          badgeClass,
                        ].join(" ")}
                      >
                        {STATUS_LABELS[c.status] ?? c.status}
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                        问题 #{c.questionId} · 回答 #{c.answerId}
                      </span>
                    </div>

                    <p className="mt-4 max-w-[68ch] break-words text-sm leading-6 text-ink-subtle">
                      {truncateReason(c.reason)}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                      <span>证据 {c.evidenceCount} 条</span>
                      <span>摘录时间 {formatTimestamp(c.capturedAt)}</span>
                      <a
                        href={zhihuUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-text transition-colors duration-150 hover:text-accent-active"
                      >
                        查看知乎来源 &rarr;
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
