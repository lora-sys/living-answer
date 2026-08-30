/**
 * RealResultRead — read view for a live extracted Zhihu answer excerpt plus
 * its AI analysis result.
 *
 * Assumes the caller has already verified that `result.status` is `"ok"`.
 * For `"error"` responses, the route should continue rendering
 * `AnalysisResultPanel`.
 *
 * Product rules:
 *   • UPDATE is advisory — never implies the author was wrong.
 *   • Never display model names, confidence scores, or internal workflow state.
 *   • UPDATE never renders proposedBody.
 *   • External evidence links are presented as untrusted references.
 *
 * @module RealResultRead
 */

import type { AnswerExcerpt } from "../../lib/answer-excerpt";
import type {
  AnalyzePatchUpdateResponse,
  AnalyzePatchNoPatchResponse,
  AnalyzePatchUnknownResponse,
  AnalyzePatchResponse,
} from "../../server/analyze-patch-response";
import { UpdateAdvisoryCard } from "./UpdateAdvisoryCard";

// ── Types ────────────────────────────────────────────────────────────────────────

export interface RealResultReadProps {
  /** The resolved answer excerpt (always available from the route). */
  readonly excerpt: AnswerExcerpt;
  /** Successful analysis response from analyzePatch (status: "ok"). */
  readonly result: AnalyzePatchResponse;
  /** Optional maintenance context the user supplied before analysis. */
  readonly contextText?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * Split excerpt text into paragraphs on double-newline boundaries.
 * Falls back to the single trimmed string if no paragraph break is found.
 */
function splitParagraphs(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  const parts = trimmed.split(/\n\n+/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

// ── Excerpt view ────────────────────────────────────────────────────────────────

function ExcerptView({ excerpt }: { readonly excerpt: AnswerExcerpt }) {
  const paragraphs = splitParagraphs(excerpt.excerpt);

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-5 sm:px-6">
      <div className="space-y-4">
        {paragraphs.map((para, i) => (
          <p key={i} className="text-base leading-7 text-stone-800 sm:text-lg sm:leading-8">
            {para}
          </p>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-500">
        <span>
          知乎问题 <span className="font-medium text-stone-700">#{excerpt.questionId}</span>
        </span>
        <span>
          回答 <span className="font-medium text-stone-700">#{excerpt.answerId}</span>
        </span>
        <span>摘录时间 {new Date(excerpt.capturedAt).toLocaleDateString("zh-CN")}</span>
      </div>
      <p className="mt-1 text-sm text-stone-500">
        来源编辑时间 {new Date(excerpt.sourceEditTime).toLocaleDateString("zh-CN")}
      </p>
    </div>
  );
}

// ── Context view ────────────────────────────────────────────────────────────────

function ContextView({ text }: { readonly text: string }) {
  if (text.trim() === "") return null;
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4">
      <p className="text-xs font-medium text-stone-500">维护备注</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-stone-700">{text}</p>
    </div>
  );
}

// ── Update advisory view ────────────────────────────────────────────────────────

interface AdvisoryViewProps {
  readonly decision: AnalyzePatchUpdateResponse;
  readonly excerptText?: string;
}

function AdvisoryView({ decision, excerptText }: AdvisoryViewProps) {
  return <UpdateAdvisoryCard decision={decision} excerptText={excerptText} />;
}

// ── No patch view ───────────────────────────────────────────────────────────────

interface NoPatchViewProps {
  readonly decision: AnalyzePatchNoPatchResponse;
}

function NoPatchView({ decision }: NoPatchViewProps) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">
          前提未变化
        </span>
      </div>
      <p className="mt-4 text-base leading-7 text-stone-700">{decision.reason}</p>
      <p className="mt-3 text-xs text-stone-500">未检测到需要更新回答的关键前提。</p>
    </div>
  );
}

// ── Unknown view ────────────────────────────────────────────────────────────────

interface UnknownViewProps {
  readonly decision: AnalyzePatchUnknownResponse;
}

function UnknownView({ decision }: UnknownViewProps) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-5 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">
          无法确定
        </span>
      </div>
      <p className="mt-4 text-base leading-7 text-stone-700">{decision.reason}</p>
      <p className="mt-3 text-xs text-stone-500">
        当前可获取的信息不足以形成明确结论。建议查阅更多来源或稍后再试。
      </p>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────

export function RealResultRead({ excerpt, result, contextText }: RealResultReadProps) {
  // Defensive: if the caller passes an error response, render nothing.
  // The route is responsible for handling error results with
  // AnalysisResultPanel.
  if (result.status === "error") {
    return null;
  }

  const decision = result.decision;

  return (
    <div className="space-y-4">
      {/* Maintenance context (if supplied) */}
      {contextText && <ContextView text={contextText} />}

      {/* The extracted excerpt */}
      <ExcerptView excerpt={excerpt} />

      {/* Analysis result */}
      {decision.verdict === "UPDATE" && (
        <AdvisoryView decision={decision} excerptText={excerpt.excerpt} />
      )}

      {decision.verdict === "NO_PATCH" && <NoPatchView decision={decision} />}

      {decision.verdict === "UNKNOWN" && <UnknownView decision={decision} />}
    </div>
  );
}
