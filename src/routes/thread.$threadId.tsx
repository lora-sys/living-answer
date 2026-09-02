import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";

import { readThreadArtifactFn } from "../server/read-thread-artifact";

type ThreadResponse = Awaited<ReturnType<typeof readThreadArtifactFn>>;

const UNCERTAINTY_LABELS: Record<number, string> = {
  1: "低不确定性",
  2: "较低不确定性",
  3: "中等不确定性",
  4: "较高不确定性",
  5: "高不确定性",
};

const UNCERTAINTY_COLORS: Record<number, string> = {
  1: "bg-success-soft text-success",
  2: "bg-success-soft text-success",
  3: "bg-info-soft text-info",
  4: "bg-update-soft text-update",
  5: "bg-update-soft text-update",
};

const NODE_BORDER_COLORS: Record<string, string> = {
  relationship: "border-l-node-relationship",
  cause: "border-l-node-cause",
  evolution: "border-l-node-evolution",
  consensus: "border-l-node-consensus",
  divergence: "border-l-node-divergence",
  changed_premise: "border-l-node-premise",
  unknown: "border-l-node-unknown",
};

export const Route = createFileRoute("/thread/$threadId")({
  head: ({ params }) => ({
    title: `学习线程 #${params.threadId.slice(0, 8)} · Living Answer`,
    meta: [{ title: "学习线程", name: "description", content: "问题学习线程" }],
    links: [
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon.png" },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
    ],
  }),
  component: ThreadView,
});

function ThreadView() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const boundRead = useServerFn(readThreadArtifactFn);

  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState<ThreadResponse | null>(null);
  const [selectedSource, setSelectedSource] = useState<{
    url: string;
    title: string;
    excerpt: string;
    boundary: string;
    author: string;
  } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResponse(null);

    boundRead({ data: { threadId } })
      .then((result) => {
        if (!cancelled) {
          setResponse(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResponse({
            success: false,
            code: "ARTIFACT_CORRUPTED",
            message: "加载学习线程时出现异常。",
          });
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [boundRead, threadId]);

  // Modal keyboard handling
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedSource !== null) {
        setSelectedSource(null);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selectedSource]);

  const shareLink = useCallback(() => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.clipboard && url) {
      void navigator.clipboard.writeText(url).then(() => {
        // brief indication — could add a toast state
      });
    }
  }, []);

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-paper pb-20 text-ink">
        <div className="mx-auto w-full max-w-[1120px] px-5 pt-10 sm:px-8">
          <div className="space-y-4">
            <div className="h-7 w-2/3 bg-paper-2 rounded animate-pulse" />
            <div className="h-28 w-full bg-paper-2 rounded-[2px] border border-rule animate-pulse" />
            <div className="h-28 w-full bg-paper-2 rounded-[2px] border border-rule animate-pulse" />
            <div className="h-28 w-full bg-paper-2 rounded-[2px] border border-rule animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  // ── Error states ────────────────────────────────────────────────────────────

  if (!response || response.success === false) {
    const isNotFound = response?.code === "ARTIFACT_NOT_FOUND";
    return (
      <main className="min-h-screen bg-paper pb-20 text-ink">
        <div className="mx-auto w-full max-w-xl px-5 pt-20 sm:px-8">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            THREAD VIEWER
          </p>
          <h1 className="mt-5 font-display text-[32px] leading-[38px] font-normal tracking-[-0.01em] sm:text-[44px] sm:leading-[48px]">
            {isNotFound ? "该线程不存在" : "线程数据损坏"}
          </h1>
          <p className="mt-4 max-w-[68ch] leading-7 text-ink-subtle">
            {isNotFound
              ? "这个学习线程不存在或已被移除。请返回首页重新生成。"
              : "该学习线程数据损坏，无法显示。请返回首页重新生成。"}
          </p>
          <button
            type="button"
            onClick={() => void navigate({ to: "/" })}
            className="mt-8 inline-flex h-12 items-center rounded-[6px] bg-accent px-8 text-sm font-semibold text-on-accent transition-colors duration-150 hover:bg-accent-hover active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            返回首页
          </button>
        </div>
      </main>
    );
  }

  // ── Normal render ────────────────────────────────────────────────────────────

  const artifact = response.artifact;

  // Map excerpt fingerprints to full excerpt data for the modal
  const excerptMap = new Map<string, { readonly excerpt: string; readonly fingerprint: string }>();
  for (const stage of artifact.timelineStages) {
    excerptMap.set(stage.excerpt.fingerprint, {
      excerpt: stage.excerpt.excerpt,
      fingerprint: stage.excerpt.fingerprint,
    });
  }

  // Sort learning nodes by kind order
  const sortedNodes = [...artifact.learningNodes].sort((a, b) => {
    const order = [
      "relationship",
      "cause",
      "evolution",
      "consensus",
      "divergence",
      "changed_premise",
      "unknown",
    ];
    const aIdx = order.indexOf(a.kind);
    const bIdx = order.indexOf(b.kind);
    return aIdx - bIdx;
  });

  // Sort timeline stages by editTime ascending
  const sortedStages = [...artifact.timelineStages].sort((a, b) => a.editTime - b.editTime);

  // Uncertainty level on a 5-point scale
  const uncertaintyLevel =
    artifact.uncertainty < 0.2
      ? 1
      : artifact.uncertainty < 0.4
        ? 2
        : artifact.uncertainty < 0.6
          ? 3
          : artifact.uncertainty < 0.8
            ? 4
            : 5;

  const uncertaintyColorClass = UNCERTAINTY_COLORS[uncertaintyLevel];
  const uncertaintyLabel = UNCERTAINTY_LABELS[uncertaintyLevel];

  const LEARNING_NODE_LABELS: Record<string, string> = {
    relationship: "关系",
    cause: "因果",
    evolution: "演变",
    consensus: "共识",
    divergence: "分歧",
    changed_premise: "前提变化",
    unknown: "待确认",
  };

  // Build: source answerId -> node kind labels that cite it
  const sourceNodeKinds = new Map<string, string[]>();
  for (const node of sortedNodes) {
    const kinds = sourceNodeKinds.get(node.sourceAnswerId) ?? [];
    kinds.push(LEARNING_NODE_LABELS[node.kind] ?? node.kind);
    sourceNodeKinds.set(node.sourceAnswerId, kinds);
  }

  return (
    <main className="min-h-screen bg-paper pb-20 text-ink">
      {/* ═══ Sticky header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-paper/92 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-[1120px] px-5 py-4 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                QUESTION THREAD
              </p>
              <h1 className="mt-1 line-clamp-2 text-[17px] font-semibold leading-7 sm:text-[19px]">
                {artifact.question}
              </h1>
              <p className="mt-1 text-xs text-muted">精炼查询: {artifact.refinedQuery}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`inline-flex items-center rounded-[4px] px-2 py-1 font-mono text-[10px] font-semibold ${uncertaintyColorClass}`}
              >
                {uncertaintyLabel}
              </span>
              <button
                type="button"
                onClick={shareLink}
                className="inline-flex min-h-11 items-center rounded-[4px] border border-rule bg-paper px-3 text-xs font-medium text-ink-subtle transition-colors duration-150 hover:bg-paper-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                复制分享链接
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[10px] tracking-[0.06em] text-muted">
            <span>指纹 {artifact.fingerprint}</span>
            <span>线程 #{artifact.threadId.slice(0, 8)}</span>
            <span>{new Date(artifact.createdAt).toLocaleDateString("zh-CN")}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1120px] space-y-12 px-5 sm:px-8">
        {/* ═══ Timeline ──────────────────────────────────────────────────── */}
        <section className="pt-10">
          <div className="max-w-3xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
              TIMELINE
            </p>
            <h2 className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em]">
              来源时间线
            </h2>
            <p className="mt-3 max-w-[68ch] text-base leading-7 text-ink-subtle">
              按编辑时间排列的真实知乎回答，每条均为公开摘录。
            </p>
          </div>

          <div className="mt-8 space-y-5">
            {sortedStages.map((stage) => {
              const citedKinds = sourceNodeKinds.get(stage.answerId);
              return (
                <button
                  key={stage.answerId}
                  type="button"
                  onClick={() =>
                    setSelectedSource({
                      url: stage.canonicalUrl,
                      title: stage.title,
                      excerpt: stage.excerpt.excerpt,
                      boundary: stage.excerptBoundaryNote,
                      author: stage.authorDisplayName,
                    })
                  }
                  className={
                    "block w-full rounded-[2px] border border-rule bg-paper-2 px-5 py-5 text-left shadow-[var(--shadow-card)] transition-colors duration-150 " +
                    "hover:border-accent/42 hover:shadow-[0_1px_0_var(--color-accent),var(--shadow-card)] " +
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
                  }
                >
                  <div className="flex min-w-0 items-start justify-between gap-x-4 gap-y-2">
                    <p className="min-w-0 text-[17px] font-semibold leading-7 text-ink">
                      {stage.title}
                    </p>
                    <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-muted">
                      #{stage.answerId}
                    </span>
                  </div>

                  <p className="mt-2.5 line-clamp-2 text-sm leading-6 text-ink-subtle">
                    {stage.excerpt.excerpt.slice(0, 200)}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tracking-[0.04em] text-muted">
                    <span>
                      作者{" "}
                      <span className="font-medium text-ink-subtle">{stage.authorDisplayName}</span>
                    </span>
                    <span>
                      编辑于 {new Date(stage.editTime * 1000).toLocaleDateString("zh-CN")}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-muted">{stage.excerptBoundaryNote}</p>
                  {citedKinds && (
                    <p className="mt-2 text-[10px] font-mono text-muted">
                      被引用于: {citedKinds.join("、")}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ═══ Learning nodes ─────────────────────────────────────────────── */}
        {sortedNodes.length > 0 && (
          <div className="flex items-center justify-center py-2">
            <p className="font-mono text-[10px] tracking-[0.08em] text-muted">
              以上 {sortedStages.length} 条来源被整合为 {sortedNodes.length} 个学习节点
            </p>
          </div>
        )}
        {sortedNodes.length > 0 && (
          <section className="border-t border-rule pt-12">
            <div className="max-w-3xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent-text">
                LEARNING NODES
              </p>
              <h2 className="mt-3 text-[26px] font-semibold leading-8 tracking-[-0.02em]">
                学习总结
              </h2>
              <p className="mt-3 max-w-[68ch] text-base leading-7 text-ink-subtle">
                基于所选摘录的学习节点，每条引用均标注来源。
              </p>
            </div>

            <div className="mt-8 space-y-5">
              {sortedNodes.map((node) => {
                const nodeSourceStage = artifact.timelineStages.find(
                  (s) => s.answerId === node.sourceAnswerId,
                );

                return (
                  <div
                    key={`${node.kind}-${node.sourceAnswerId}`}
                    className={
                      "rounded-[2px] border border-rule bg-paper-2 px-5 py-5 shadow-[var(--shadow-card)] " +
                      `border-l-[3px] ${NODE_BORDER_COLORS[node.kind] ?? "border-l-node-unknown"}`
                    }
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="inline-flex items-center rounded-[4px] px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.06em] bg-info-soft text-info">
                        {LEARNING_NODE_LABELS[node.kind] ?? node.kind}
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        置信度 {(node.uncertainty * 100).toFixed(0)}%
                      </span>
                    </div>

                    <h3 className="mt-3 text-[17px] font-semibold leading-7 text-ink">
                      {node.title}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-ink-subtle">{node.summary}</p>

                    <div className="mt-4 space-y-2">
                      {node.evidenceRefs.map((ref, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="font-mono text-[10px] text-muted">&gt;</span>
                          <p className="text-xs leading-5 text-muted">
                            {ref.quote.slice(0, 120)}
                            {ref.quote.length > 120 ? "…" : ""}
                            {nodeSourceStage && (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedSource({
                                    url: nodeSourceStage.canonicalUrl,
                                    title: nodeSourceStage.title,
                                    excerpt: nodeSourceStage.excerpt.excerpt,
                                    boundary: nodeSourceStage.excerptBoundaryNote,
                                    author: nodeSourceStage.authorDisplayName,
                                  })
                                }
                                className="inline-flex ml-2 items-center rounded-[2px] bg-accent-soft px-1.5 py-0.5 font-mono text-[9px] font-medium text-accent-text cursor-pointer hover:bg-accent/hover:text-accent"
                              >
                                [来源 #{node.sourceAnswerId.slice(-6)}]
                              </button>
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ═══ Actions ─────────────────────────────────────────────────── */}
        <section className="border-t border-rule pt-10">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/"
              className="inline-flex h-12 items-center rounded-[6px] bg-accent px-8 text-sm font-semibold text-on-accent transition-colors duration-150 hover:bg-accent-hover active:translate-y-px active:bg-accent-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              创建新线程
            </Link>
            <button
              type="button"
              onClick={shareLink}
              className="inline-flex min-h-11 items-center rounded-[6px] border border-rule bg-paper px-4 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-paper-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              复制分享链接
            </button>
          </div>
        </section>
      </div>

      {/* ═══ Source modal ─────────────────────────────────────────────────── */}
      {selectedSource && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-5 py-10 sm:py-16"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedSource(null);
          }}
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl rounded-[4px] bg-paper-3 shadow-[var(--shadow-panel)]"
          >
            <div className="flex items-start justify-between px-6 pt-5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  SOURCE EXCERPT
                </p>
                <h3 className="mt-1 text-[17px] font-semibold leading-7 text-ink">
                  {selectedSource.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSource(null)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] text-muted transition-colors duration-150 hover:bg-paper-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-label="关闭"
              >
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4 fill-none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>

            <div className="mt-6 px-6">
              <p className="whitespace-pre-wrap break-words text-base leading-7 text-ink sm:text-lg sm:leading-8">
                {selectedSource.excerpt}
              </p>
            </div>

            <div className="mt-6 space-y-3 px-6">
              <div className="flex flex-wrap items-center gap-3 font-mono text-xs tracking-[0.04em] text-muted">
                <span>
                  作者: <span className="font-medium text-ink-subtle">{selectedSource.author}</span>
                </span>
              </div>
              <p className="text-sm font-semibold text-update">{selectedSource.boundary}</p>
              <a
                href={selectedSource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-[6px] border border-rule bg-paper px-4 text-xs font-semibold text-accent-text transition-colors duration-150 hover:border-accent/42 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                在知乎查看原文 &rarr;
              </a>
            </div>

            <div className="mt-6 border-t border-rule px-6 pb-5 pt-4">
              <button
                type="button"
                onClick={() => setSelectedSource(null)}
                className="inline-flex min-h-11 items-center rounded-[6px] border border-rule bg-paper px-4 text-xs font-semibold text-ink transition-colors duration-150 hover:bg-paper-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
