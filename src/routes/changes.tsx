import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { type ListPatchChangesResponse, listPatchChanges } from "../server/list-patch-changes";
import { APP_NAME } from "../lib/app-info";
import { formatTimestamp } from "../lib/failure-messages";

const STATUS_STYLES: Record<string, string> = {
  VISIBLE: "bg-paper text-ink-subtle border-rule",
  DISPUTED: "bg-update-amber/10 text-update-amber border-update-amber/30",
  SUPERSEDED: "bg-paper text-muted border-rule",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  WITHDRAWN: "bg-paper text-muted border-rule",
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
    <main className="flex min-h-screen items-start bg-paper px-5 py-12 text-ink sm:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-10">
        <section>
          <Link
            to="/"
            className="text-sm font-medium text-accent transition-colors hover:text-accent-hover"
          >
            &larr; 返回首页
          </Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-ink">变更时间线</h1>
          <p className="mt-2 text-base leading-7 text-ink-subtle">
            所有回答前提的生命周期事件，按最新事件时间倒序排列。
          </p>
        </section>

        {loading && (
          <div className="flex items-center gap-3 rounded-2xl border border-rule bg-paper/60 px-5 py-4">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-accent"
            />
            <p className="text-sm text-ink-subtle">正在加载变更记录…</p>
          </div>
        )}

        {!loading && result?.status === "error" && (
          <div className="rounded-2xl border border-rule bg-paper/60 px-5 py-4">
            <p className="text-sm font-medium text-ink-subtle">{result.message}</p>
          </div>
        )}

        {!loading && result?.status === "ok" && changes.length === 0 && (
          <div className="rounded-2xl border border-rule bg-paper/60 px-5 py-4">
            <p className="text-sm text-ink-subtle">还没有记录任何变更。</p>
          </div>
        )}

        {!loading && changes.length > 0 && (
          <ul className="space-y-4" role="list">
            {changes.map((c) => {
              const zhihuUrl = `https://www.zhihu.com/question/${c.questionId}/answer/${c.answerId}`;
              const badgeClass = STATUS_STYLES[c.status] ?? "bg-paper text-ink-subtle border-rule";

              return (
                <li
                  key={c.recordFingerprint}
                  className="rounded-2xl border border-rule bg-paper-2 p-5 transition-colors hover:border-accent/30 sm:p-6"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span
                      className={[
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        badgeClass,
                      ].join(" ")}
                    >
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                    <span className="text-xs text-muted">
                      问题 #{c.questionId} · 回答 #{c.answerId}
                    </span>
                    <span className="text-xs text-muted">{formatTimestamp(c.eventAt)}</span>
                  </div>

                  <p className="mt-3 break-words text-sm leading-6 text-ink-subtle">
                    {truncateReason(c.reason)}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span>证据 {c.evidenceCount} 条</span>
                    <span>摘录时间 {formatTimestamp(c.capturedAt)}</span>
                    <a
                      href={zhihuUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent transition-colors hover:text-accent-hover"
                    >
                      查看知乎来源 &rarr;
                    </a>
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
