import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import {
  listEvidenceSources,
  type ListEvidenceSourcesResponse,
} from "../server/list-evidence-sources";
import { APP_NAME } from "../lib/app-info";
import { formatTimestamp } from "../lib/failure-messages";

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: `${APP_NAME} · 证据来源` },
      { name: "description", content: "Living Answer 已检索的全部外部证据来源。" },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
  }),
  component: SourcesPage,
});

function SourcesPage() {
  const boundList = useServerFn(listEvidenceSources);
  const [result, setResult] = useState<ListEvidenceSourcesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    boundList()
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }, [boundList]);

  const sources = result?.status === "ok" ? result.sources : [];

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
            SOURCE LEDGER
          </p>
          <h1 className="mt-3 font-display text-[32px] leading-[38px] font-normal text-ink sm:text-[52px] sm:leading-[56px]">
            证据来源
          </h1>
          <p className="mt-4 max-w-[68ch] text-base leading-7 text-ink-subtle">
            所有已检索的外部来源。每条变更都必须回到一手来源，没有来源的判断不会出现在答案旁边。
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
              <p className="text-sm text-ink-subtle">正在加载来源…</p>
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

        {!loading && !result && (
          <div
            role="alert"
            className="rounded-[2px] border border-update/32 bg-update-soft px-5 py-5"
          >
            <p className="text-sm font-semibold text-ink">无法加载来源</p>
            <p className="mt-1 text-sm text-ink-subtle">数据加载失败，请稍后重试。</p>
            <Link
              to="/"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent-text transition-colors duration-150 hover:text-accent-active"
            >
              返回首页
            </Link>
          </div>
        )}

        {!loading && result?.status === "error" && (
          <div
            role="alert"
            className="rounded-[2px] border border-update/32 bg-update-soft px-5 py-5"
          >
            <p className="text-sm font-semibold text-ink">无法加载来源</p>
            <p className="mt-1 text-sm text-ink-subtle">{result.message}</p>
            <Link
              to="/"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-accent-text transition-colors duration-150 hover:text-accent-active"
            >
              返回首页
            </Link>
          </div>
        )}

        {!loading && result?.status === "ok" && sources.length === 0 && (
          <div className="rounded-[2px] border border-rule bg-paper-2 px-5 py-8">
            <p className="text-sm font-medium text-ink-subtle">来源库为空</p>
            <p className="mt-1 text-sm text-muted">
              检索到的来源将展示在这里。当回答需要引用外部证据时，来源会出现在下方。
            </p>
            <Link
              to="/"
              className="mt-4 inline-flex min-h-11 items-center rounded-[6px] border border-rule bg-paper-3 px-5 text-sm font-medium text-ink transition-colors duration-150 hover:border-accent/42"
            >
              返回首页继续浏览
            </Link>
          </div>
        )}

        {!loading && sources.length > 0 && (
          <ul className="space-y-3" role="list">
            {sources.map((s) => (
              <li key={s.candidateFingerprint}>
                <a
                  href={s.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-[2px] border border-rule bg-paper-2 p-5 transition-colors duration-150 hover:border-accent/42 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                      {s.sourceKind}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                      {s.authorityHint || "SOURCE"}
                    </span>
                  </div>
                  <h2 className="mt-3 max-w-[68ch] break-words text-lg font-semibold leading-7 text-ink">
                    {s.title || s.sourceLabel}
                  </h2>
                  {s.contentPreview && (
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">
                      {s.contentPreview}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                    {s.publishedAt !== undefined && (
                      <span>发布于 {formatTimestamp(s.publishedAt)}</span>
                    )}
                    <span>检索于 {formatTimestamp(s.capturedAt)}</span>
                    <span className="text-accent-text">查看来源 &rarr;</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
