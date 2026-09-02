import { useEffect, useRef, useState } from "react";

import { FEEDBACK_REASON_LABELS, type PatchFeedbackReason } from "../../lib/patch-feedback";
import type { ClarifyFeedbackResponse } from "../../server/clarify-feedback";
import type { SubmitPatchFeedbackResponse } from "../../server/submit-patch-feedback";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChatTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

interface DraftReview {
  readonly reason: PatchFeedbackReason;
  readonly question: string;
  readonly evidenceUrl?: string;
  readonly evidenceQuote?: string;
}

type PanelMode = "clarify" | "manual";
type PanelStatus = "idle" | "thinking" | "draft_ready" | "submitted" | "error";

// ── Props ──────────────────────────────────────────────────────────────────────

interface PatchFeedbackPanelProps {
  readonly questionId: string;
  readonly answerId: string;
  readonly excerptFingerprint: string;
  readonly excerptText: string;
  readonly recordFingerprint?: string;
  readonly onSubmitFeedback: (input: {
    readonly questionId: string;
    readonly answerId: string;
    readonly excerptFingerprint: string;
    readonly recordFingerprint?: string;
    readonly reason: PatchFeedbackReason;
    readonly question?: string;
    readonly evidenceUrl?: string;
    readonly evidenceQuote?: string;
  }) => Promise<SubmitPatchFeedbackResponse>;
  readonly onClarify?: (input: {
    readonly questionId: string;
    readonly answerId: string;
    readonly excerptFingerprint: string;
    readonly excerptText: string;
    readonly recordFingerprint?: string;
    readonly currentReason?: string;
    readonly conversation: readonly { readonly role: string; readonly content: string }[];
  }) => Promise<ClarifyFeedbackResponse>;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_INPUT_LENGTH = 400;

const reviewStateCopy: Readonly<Record<string, string>> = {
  PENDING_REVIEW: "已进入复核队列。",
  EVIDENCE_GATE_PASSED: "已提交复核，证据通过了证据门槛，等待后续处理。",
  EVIDENCE_GATE_INSUFFICIENT: "已提交复核，当前证据还不足以支持或否定这条反馈。",
  EVIDENCE_GATE_REJECTED: "已提交复核，提供的摘录未通过证据门槛。",
};

// ── Component ──────────────────────────────────────────────────────────────────

export function PatchFeedbackPanel({
  questionId,
  answerId,
  excerptFingerprint,
  excerptText,
  recordFingerprint,
  onSubmitFeedback,
  onClarify,
}: PatchFeedbackPanelProps) {
  // ── Clarify mode state ──────────────────────────────────────────────────────

  const [mode, setMode] = useState<PanelMode>(onClarify === undefined ? "manual" : "clarify");
  const [conversation, setConversation] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState<DraftReview | null>(null);
  const [needsEvidence, setNeedsEvidence] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState<PanelStatus>("thinking");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [userInput, setUserInput] = useState("");
  const [clarifyToken, setClarifyToken] = useState(0);

  // ── Manual mode state ───────────────────────────────────────────────────────

  const [reason, setReason] = useState<PatchFeedbackReason>("QUESTION");
  const [question, setQuestion] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceQuote, setEvidenceQuote] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<SubmitPatchFeedbackResponse | null>(null);

  const conversationEndRef = useRef<HTMLDivElement>(null);

  // ── Clarify: start conversation on mount ────────────────────────────────────

  useEffect(() => {
    if (mode !== "clarify" || onClarify === undefined) return;

    let cancelled = false;
    setStatus("thinking");

    void (async () => {
      try {
        const response = await onClarify({
          questionId,
          answerId,
          excerptFingerprint,
          excerptText,
          ...(recordFingerprint !== undefined ? { recordFingerprint } : {}),
          currentReason: undefined,
          conversation: [],
        });

        if (cancelled) return;

        if (response.success) {
          setConversation([{ role: "assistant", content: response.assistantMessage }]);
          setDraft({
            reason: response.draft.reason,
            question: response.draft.question,
            evidenceUrl: response.draft.evidenceUrl,
            evidenceQuote: response.draft.evidenceQuote,
          });
          setNeedsEvidence(response.needsEvidence);
          setIsReady(response.isReady);
          setStatus(response.isReady ? "draft_ready" : "thinking");
        } else {
          setStatus("error");
          setErrorCode(response.code ?? "CLARIFICATION_UNAVAILABLE");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setErrorCode("CLARIFICATION_UNAVAILABLE");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, clarifyToken, onClarify]);

  // ── Scroll conversation to bottom ───────────────────────────────────────────

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  // ── Clarify actions ─────────────────────────────────────────────────────────

  const handleSendUserMessage = async () => {
    const trimmed = userInput.trim();
    if (!trimmed || status === "thinking" || onClarify === undefined) return;

    const newTurn: ChatTurn = { role: "user", content: trimmed };
    const updatedConversation = [...conversation, newTurn];

    setConversation(updatedConversation);
    setUserInput("");
    setIsReady(false);
    setDraft(null);
    setStatus("thinking");

    try {
      const response = await onClarify!({
        questionId,
        answerId,
        excerptFingerprint,
        excerptText,
        ...(recordFingerprint !== undefined ? { recordFingerprint } : {}),
        currentReason: undefined,
        conversation: updatedConversation.map((t) => ({ role: t.role, content: t.content })),
      });

      if (response.success) {
        setConversation((prev) => [
          ...prev,
          { role: "assistant", content: response.assistantMessage },
        ]);
        setDraft({
          reason: response.draft.reason,
          question: response.draft.question,
          evidenceUrl: response.draft.evidenceUrl,
          evidenceQuote: response.draft.evidenceQuote,
        });
        setNeedsEvidence(response.needsEvidence);
        setIsReady(response.isReady);
        setStatus(response.isReady ? "draft_ready" : "thinking");
      } else {
        setStatus("error");
        setErrorCode(response.code);
      }
    } catch {
      setStatus("error");
      setErrorCode("CLARIFICATION_UNAVAILABLE");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendUserMessage();
    }
  };

  // ── Submit draft ────────────────────────────────────────────────────────────

  const handleSubmitDraft = async () => {
    if (!draft || isPending) return;

    setIsPending(true);
    const response = await onSubmitFeedback({
      questionId,
      answerId,
      excerptFingerprint,
      ...(recordFingerprint === undefined ? {} : { recordFingerprint }),
      reason: draft.reason,
      question: draft.question,
      ...(draft.evidenceUrl === undefined ? {} : { evidenceUrl: draft.evidenceUrl }),
      ...(draft.evidenceQuote === undefined ? {} : { evidenceQuote: draft.evidenceQuote }),
    });
    setResult(response);
    setStatus("submitted");
    setIsPending(false);
  };

  // ── Manual form submit ──────────────────────────────────────────────────────

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;

    setIsPending(true);
    const response = await onSubmitFeedback({
      questionId,
      answerId,
      excerptFingerprint,
      ...(recordFingerprint === undefined ? {} : { recordFingerprint }),
      reason,
      ...(question.trim() === "" ? {} : { question: question.trim() }),
      ...(evidenceUrl.trim() === "" ? {} : { evidenceUrl: evidenceUrl.trim() }),
      ...(evidenceQuote.trim() === "" ? {} : { evidenceQuote: evidenceQuote.trim() }),
    });
    setResult(response);
    setIsPending(false);
  };

  // ── Mode switches ───────────────────────────────────────────────────────────

  const switchToManual = () => {
    setMode("manual");
    setConversation([]);
    setDraft(null);
    setIsReady(false);
    setNeedsEvidence(false);
    setStatus("idle");
    setErrorCode(null);
    setResult(null);
    setReason("QUESTION");
    setQuestion("");
    setEvidenceUrl("");
    setEvidenceQuote("");
  };

  const switchToClarify = () => {
    setMode("clarify");
    setConversation([]);
    setDraft(null);
    setIsReady(false);
    setNeedsEvidence(false);
    setStatus("idle");
    setErrorCode(null);
    setResult(null);
    setReason("QUESTION");
    setQuestion("");
    setEvidenceUrl("");
    setEvidenceQuote("");
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <section
      aria-labelledby="patch-feedback-heading"
      className="border border-rule bg-paper-3 px-5 py-5 sm:px-6 shadow-[var(--shadow-card)]"
    >
      {/* Header with mode toggle */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <h2
            id="patch-feedback-heading"
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
          >
            反馈与复核
          </h2>
          <p className="text-xs text-muted">先进入复核队列，不会直接改写结论</p>
        </div>
        <div className="flex gap-2">
          {mode === "clarify" ? (
            <button
              type="button"
              onClick={switchToManual}
              className="inline-flex h-8 items-center justify-center border-2 border-rule-strong bg-paper-3 px-3 text-[11px] font-medium text-ink transition-all duration-120 hover:shadow-[2px_2px_0_var(--color-ink)]"
            >
              手动填写
            </button>
          ) : (
            <button
              type="button"
              onClick={switchToClarify}
              className="inline-flex h-8 items-center justify-center border border-accent bg-accent-soft px-3 text-[11px] font-medium text-accent transition-colors hover:bg-accent/15"
            >
              AI 澄清
            </button>
          )}
        </div>
      </div>

      {/* ── Clarify mode ───────────────────────────────────────────────────── */}
      {mode === "clarify" && (
        <div className="mt-4">
          {/* Thinking spinner */}
          {status === "thinking" && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-3 border border-rule bg-paper-3 px-4 py-4"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent"
              />
              <p className="text-sm text-ink-subtle">正在理解您的问题…</p>
            </div>
          )}

          {/* Error state */}
          {status === "error" && (
            <div className="border border-danger bg-danger-soft px-4 py-4">
              <p className="text-sm font-medium text-danger">
                {errorCode === "CLARIFICATION_UNAVAILABLE"
                  ? "澄清服务暂时不可用，请稍后再试或切换到手动填写。"
                  : "沟通出现异常，请稍后再试。"}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStatus("idle");
                    setErrorCode(null);
                    setConversation([]);
                    setDraft(null);
                    setStatus("thinking");
                    setClarifyToken((token) => token + 1);
                  }}
                  className="inline-flex h-8 items-center justify-center border border-accent bg-accent-soft px-3 text-[11px] font-medium text-accent transition-colors hover:bg-accent/15"
                >
                  重试
                </button>
                <button
                  type="button"
                  onClick={switchToManual}
                  className="inline-flex h-8 items-center justify-center border-2 border-rule-strong bg-paper-3 px-3 text-[11px] font-medium text-ink transition-all duration-120 hover:shadow-[2px_2px_0_var(--color-ink)]"
                >
                  切换手动填写
                </button>
              </div>
            </div>
          )}

          {/* Conversation */}
          {status !== "idle" && (
            <div className="mt-3 max-h-[280px] space-y-3 overflow-y-auto border border-rule bg-paper-3 px-4 py-3">
              {conversation.map((turn, i) => (
                <div
                  key={i}
                  className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] border px-4 py-2.5 text-sm leading-6 ${
                      turn.role === "user"
                        ? "bg-accent border-accent text-white"
                        : "bg-paper-3 border-rule text-ink"
                    }`}
                  >
                    {turn.content}
                  </div>
                </div>
              ))}
              <div ref={conversationEndRef} />
            </div>
          )}

          {/* Draft review */}
          {status === "draft_ready" && draft && (
            <div className="mt-3 border border-success bg-success-soft px-4 py-4">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-success">
                拟提交草稿
              </p>
              <div className="mt-2 space-y-2">
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                    反馈类型：
                  </span>{" "}
                  <span className="text-sm font-medium text-ink">
                    {FEEDBACK_REASON_LABELS[draft.reason]}
                  </span>
                </div>
                <div>
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                    问题描述：
                  </span>
                  <p className="mt-1 text-sm leading-6 text-ink">{draft.question}</p>
                </div>
                {draft.evidenceUrl && (
                  <div>
                    <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                      证据链接：
                    </span>
                    <p className="mt-1 text-sm text-accent underline underline-offset-2">
                      {draft.evidenceUrl}
                    </p>
                  </div>
                )}
                {draft.evidenceQuote && (
                  <div>
                    <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                      来源摘录：
                    </span>
                    <p className="mt-1 text-sm leading-6 text-ink-subtle">
                      "{draft.evidenceQuote}"
                    </p>
                  </div>
                )}
                {needsEvidence && (
                  <p className="text-xs text-muted">建议补充证据链接和来源摘录。</p>
                )}
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleSubmitDraft}
                  disabled={isPending}
                  className="inline-flex h-11 items-center justify-center border-2 border-accent bg-accent px-5 text-sm font-semibold text-white transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-accent)] hover:bg-accent-hover active:translate-y-px active:bg-accent-active disabled:cursor-not-allowed disabled:text-faint"
                >
                  {isPending ? "提交中" : "确认提交反馈"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setIsReady(false);
                    setStatus("thinking");
                  }}
                  disabled={isPending}
                  className="ml-2 inline-flex h-11 items-center justify-center border-2 border-rule-strong bg-paper-3 px-4 text-sm font-medium text-ink transition-all duration-120 hover:shadow-[2px_2px_0_var(--color-ink)] disabled:cursor-not-allowed disabled:text-faint shadow-[var(--shadow-card)]"
                >
                  继续沟通
                </button>
              </div>
            </div>
          )}

          {/* Submitted result */}
          {status === "submitted" && result && (
            <div
              aria-live="polite"
              className={`mt-3 border px-4 py-3 ${
                result.status === "ok"
                  ? "border-success bg-success-soft"
                  : "border-danger bg-danger-soft"
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  result.status === "ok" ? "text-success" : "text-danger"
                }`}
              >
                {result.status === "ok"
                  ? (reviewStateCopy[result.reviewState] ?? "反馈已提交。")
                  : result.message}
              </p>
            </div>
          )}

          {/* Input area */}
          {status === "thinking" && !isReady && (
            <div className="mt-3">
              <label
                htmlFor="clarify-input"
                className="block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"
              >
                您的回复
              </label>
              <div className="mt-2 flex gap-2">
                <textarea
                  id="clarify-input"
                  rows={2}
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value.slice(0, MAX_INPUT_LENGTH))}
                  onKeyDown={handleKeyDown}
                  disabled={status === "thinking"}
                  placeholder="描述您认为需要复核的问题…"
                  className="flex-1 resize-y border border-rule bg-paper-3 px-4 py-3 text-sm leading-6 text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-paper"
                />
                <button
                  type="button"
                  onClick={handleSendUserMessage}
                  disabled={!userInput.trim() || status === "thinking"}
                  className="inline-flex h-12 self-end items-center justify-center border-2 border-accent bg-accent px-4 text-sm font-semibold text-white transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-accent)] hover:bg-accent-hover active:translate-y-px active:bg-accent-active disabled:cursor-not-allowed disabled:text-faint"
                >
                  发送
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={switchToManual}
            className="mt-3 inline-flex h-8 items-center justify-center border-2 border-rule-strong bg-paper-3 px-3 text-[11px] font-medium text-ink transition-all duration-120 hover:shadow-[2px_2px_0_var(--color-ink)]"
          >
            或切换到手动填写
          </button>
        </div>
      )}

      {/* ── Manual mode ────────────────────────────────────────────────────── */}
      {mode === "manual" && (
        <form onSubmit={handleManualSubmit} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <label
                htmlFor="feedback-reason"
                className="block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"
              >
                反馈类型
              </label>
              <select
                id="feedback-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value as PatchFeedbackReason)}
                disabled={isPending}
                className="mt-2 h-12 w-full border border-rule-strong bg-paper-3 px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-paper"
              >
                {Object.entries(FEEDBACK_REASON_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="feedback-question"
                className="block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"
              >
                问题或补充说明
              </label>
              <textarea
                id="feedback-question"
                rows={3}
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, 800))}
                disabled={isPending}
                placeholder="这条提示为什么需要复核？"
                className="mt-2 block w-full resize-y border border-rule bg-paper-3 px-4 py-3 text-sm leading-6 text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-paper"
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label
                htmlFor="feedback-evidence-url"
                className="block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"
              >
                证据链接（可选）
              </label>
              <input
                id="feedback-evidence-url"
                type="url"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value.slice(0, 2048))}
                disabled={isPending}
                placeholder="https://..."
                className="mt-2 block h-12 w-full border border-rule bg-paper-3 px-4 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-paper"
              />
            </div>

            <div>
              <label
                htmlFor="feedback-evidence-quote"
                className="block font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"
              >
                来源摘录（可选）
              </label>
              <textarea
                id="feedback-evidence-quote"
                rows={3}
                value={evidenceQuote}
                onChange={(e) => setEvidenceQuote(e.target.value.slice(0, 1000))}
                disabled={isPending}
                placeholder="从来源中复制能说明问题的关键句"
                className="mt-2 block w-full resize-y border border-rule bg-paper-3 px-4 py-3 text-sm leading-6 text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-paper"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-11 items-center justify-center border-2 border-rule-strong bg-paper-3 px-4 text-sm font-semibold text-ink transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-faint shadow-[var(--shadow-card)]"
            >
              {isPending ? "提交中" : "提交反馈"}
            </button>
            <button
              type="button"
              onClick={switchToClarify}
              disabled={isPending}
              className="inline-flex h-11 items-center justify-center border-2 border-rule-strong bg-paper-3 px-4 text-sm font-medium text-ink transition-all duration-120 hover:shadow-[3px_3px_0_var(--color-ink)] disabled:cursor-not-allowed disabled:text-faint shadow-[var(--shadow-card)]"
            >
              切换到 AI 澄清
            </button>
          </div>
        </form>
      )}

      {mode === "manual" && result !== null && (
        <div
          aria-live="polite"
          className={
            result.status === "ok"
              ? "mt-4 border border-success bg-success-soft px-4 py-3"
              : "mt-4 border border-danger bg-danger-soft px-4 py-3"
          }
        >
          <p
            className={
              result.status === "ok"
                ? "text-sm font-medium text-success"
                : "text-sm font-medium text-danger"
            }
          >
            {result.status === "ok"
              ? (reviewStateCopy[result.reviewState] ?? "反馈已提交。")
              : result.message}
          </p>
        </div>
      )}
    </section>
  );
}
