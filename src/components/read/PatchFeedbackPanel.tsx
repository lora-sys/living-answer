import { useState } from "react";

import { FEEDBACK_REASON_LABELS, type PatchFeedbackReason } from "../../lib/patch-feedback";
import type { SubmitPatchFeedbackResponse } from "../../server/submit-patch-feedback";

interface PatchFeedbackPanelProps {
  readonly questionId: string;
  readonly answerId: string;
  readonly excerptFingerprint: string;
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
}

const initialState = {
  reason: "QUESTION" as PatchFeedbackReason,
  question: "",
  evidenceUrl: "",
  evidenceQuote: "",
};

const reviewStateCopy: Record<string, string> = {
  PENDING_REVIEW: "已进入复核队列。",
  EVIDENCE_GATE_PASSED: "已提交复核，证据通过了证据门槛，等待后续处理。",
  EVIDENCE_GATE_INSUFFICIENT: "已提交复核，当前证据还不足以支持或否定这条反馈。",
  EVIDENCE_GATE_REJECTED: "已提交复核，提供的摘录未通过证据门槛。",
};

export function PatchFeedbackPanel({
  questionId,
  answerId,
  excerptFingerprint,
  recordFingerprint,
  onSubmitFeedback,
}: PatchFeedbackPanelProps) {
  const [form, setForm] = useState(initialState);
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<SubmitPatchFeedbackResponse | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isPending) return;

    setIsPending(true);
    const response = await onSubmitFeedback({
      questionId,
      answerId,
      excerptFingerprint,
      ...(recordFingerprint === undefined ? {} : { recordFingerprint }),
      reason: form.reason,
      ...(form.question.trim() === "" ? {} : { question: form.question.trim() }),
      ...(form.evidenceUrl.trim() === "" ? {} : { evidenceUrl: form.evidenceUrl.trim() }),
      ...(form.evidenceQuote.trim() === "" ? {} : { evidenceQuote: form.evidenceQuote.trim() }),
    });
    setResult(response);
    setIsPending(false);
  };

  return (
    <section
      aria-labelledby="patch-feedback-heading"
      className="rounded-[2px] border border-rule bg-paper-2 px-5 py-5 sm:px-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2
          id="patch-feedback-heading"
          className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
        >
          反馈与复核
        </h2>
        <p className="text-xs text-muted">先进入复核队列，不会直接改写结论</p>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-4">
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
              value={form.reason}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  reason: event.target.value as PatchFeedbackReason,
                }))
              }
              disabled={isPending}
              className="mt-2 h-12 w-full rounded-[4px] border border-rule bg-paper-3 px-3 text-sm text-ink focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-paper"
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
              value={form.question}
              onChange={(event) =>
                setForm((current) => ({ ...current, question: event.target.value }))
              }
              disabled={isPending}
              placeholder="这条提示为什么需要复核？"
              className="mt-2 block w-full resize-y rounded-[4px] border border-rule bg-paper-3 px-4 py-3 text-sm leading-6 text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-paper"
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
              value={form.evidenceUrl}
              onChange={(event) =>
                setForm((current) => ({ ...current, evidenceUrl: event.target.value }))
              }
              disabled={isPending}
              placeholder="https://..."
              className="mt-2 block h-12 w-full rounded-[4px] border border-rule bg-paper-3 px-4 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-paper"
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
              value={form.evidenceQuote}
              onChange={(event) =>
                setForm((current) => ({ ...current, evidenceQuote: event.target.value }))
              }
              disabled={isPending}
              placeholder="从来源中复制能说明问题的关键句"
              className="mt-2 block w-full resize-y rounded-[4px] border border-rule bg-paper-3 px-4 py-3 text-sm leading-6 text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/18 disabled:cursor-not-allowed disabled:bg-paper"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-11 items-center rounded-[6px] border border-rule bg-paper px-4 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-paper-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-faint"
          >
            {isPending ? "提交中" : "提交反馈"}
          </button>
        </div>
      </form>

      {result !== null && (
        <div
          aria-live="polite"
          className={
            result.status === "ok"
              ? "mt-4 rounded-[2px] border border-success/32 bg-success-soft px-4 py-3"
              : "mt-4 rounded-[2px] border border-danger/30 bg-danger-soft px-4 py-3"
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
