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
          <div className="flex items-center gap-3 rounded-2xl border border-rule bg-paper/60 px-5 py-4">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-accent"
            />
            <p className="text-sm text-ink-subtle">正在加载来源…</p>
          </div>
        )}

        {!loading && result?.status === "error" && (
          <div className="rounded-2xl border border-rule bg-paper/60 px-5 py-4">
            <p className="text-sm font-medium text-ink-subtle">{result.message}</p>
          </div>
        )}

        {!loading && result?.status === "ok" && sources.length === 0 && (
          <div className="rounded-2xl border border-rule bg-paper/60 px-5 py-4">
            <p className="text-sm text-ink-subtle">还没有检索到任何来源。</p>
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
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold text-ink">{s.sourceLabel}</span>
                    <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-subtle">
                      {s.sourceKind}
                    </span>
                    {s.authorityHint && (
                      <span className="text-xs text-muted">{s.authorityHint}</span>
                    )}
                  </div>
                  {s.title && <p className="mt-2 text-sm font-medium text-ink-subtle">{s.title}</p>}
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
