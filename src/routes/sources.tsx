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
    <main className="flex min-h-screen items-start bg-paper px-5 py-12 text-ink sm:px-8">
      <div className="mx-auto w-full max-w-4xl space-y-10">
        <section>
          <Link
            to="/"
            className="text-sm font-medium text-accent transition-colors hover:text-accent-hover"
          >
            &larr; 返回首页
          </Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-ink">证据来源</h1>
          <p className="mt-2 text-base leading-7 text-ink-subtle">
            所有已检索的外部来源。每条变更都必须回到一手来源，没有来源的判断不会出现在答案旁边。
          </p>
        </section>

        {loading && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 rounded-2xl border border-rule bg-paper/60 px-5 py-6"
          >
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-accent"
            />
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

        {!loading && result?.status === "error" && (
          <div
            role="alert"
            className="rounded-2xl border border-update-amber/30 bg-update-amber/5 px-5 py-5"
          >
            <p className="text-sm font-semibold text-ink">无法加载来源</p>
            <p className="mt-1 text-sm text-ink-subtle">{result.message}</p>
            <Link
              to="/"
              className="mt-3 inline-block text-sm font-medium text-accent transition-colors hover:text-accent-hover"
            >
              返回首页
            </Link>
          </div>
        )}

        {!loading && result?.status === "ok" && sources.length === 0 && (
          <div className="rounded-2xl border border-rule bg-paper/60 px-5 py-8 text-center">
            <p className="text-sm font-medium text-ink-subtle">来源库为空</p>
            <p className="mt-1 text-sm text-muted">
              检索到的来源将展示在这里。当回答需要引用外部证据时，来源会出现在下方。
            </p>
            <Link
              to="/"
              className="mt-4 inline-block rounded-xl border border-rule bg-paper-2 px-5 py-2.5 text-sm font-medium text-accent transition-colors hover:border-accent/30 hover:text-accent-hover"
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
                  className="block rounded-2xl border border-rule bg-paper-2 p-5 transition-colors hover:border-accent/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span
                      aria-hidden="true"
                      className="inline-flex rounded-full border border-rule bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-subtle"
                    >
                      {s.sourceKind}
                    </span>
                    <span className="text-sm font-semibold text-ink">{s.sourceLabel}</span>
                    {s.authorityHint && (
                      <span className="text-xs text-muted">{s.authorityHint}</span>
                    )}
                  </div>
                  {s.title && (
                    <p className="mt-2 break-words text-sm font-medium text-ink-subtle">
                      {s.title}
                    </p>
                  )}
                  {s.contentPreview && (
                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">
                      {s.contentPreview}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    {s.publishedAt !== undefined && (
                      <span>发布于 {formatTimestamp(s.publishedAt)}</span>
                    )}
                    <span>检索于 {formatTimestamp(s.capturedAt)}</span>
                    <span className="text-accent">查看来源 &rarr;</span>
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
