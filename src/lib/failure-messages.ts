/**
 * Pure failure-code-to-user-message mapping for the answer excerpt and
 * patch-analysis server flows.
 *
 * Server failure codes are serialized error states.  Each maps to a short,
 * calm Chinese sentence that informs the user without exposing headers,
 * provider payloads, stack traces, credentials, or internal details.
 *
 * The function is a pure synchronous mapping -- no framework dependencies,
 * no network calls, no state.  Suitable for offline tests and SSR.
 *
 * @module failure-messages
 */

// ── Types ───────────────────────────────────────────────────────────────────────

/**
 * All server failure codes returned by `resolveAnswerExcerpt`.
 */
export type AnswerExcerptServerFailureCode =
  | "INVALID_REQUEST"
  | "MISSING_ACCESS_SECRET"
  | "UNSUPPORTED_ANSWER_URL"
  | "ANSWER_NOT_FOUND"
  | "AMBIGUOUS_ANSWER"
  | "INVALID_PROVIDER_ANSWER"
  | "PROVIDER_ERROR"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_QUOTA_EXCEEDED";

/**
 * All server failure codes returned by the patch-analysis flow.
 *
 * Extends `AnswerExcerptServerFailureCode` with codes specific to the
 * OpenAI-backed analysis step.  Any string assignable to this type is
 * accepted by `failureMessage`.
 */
export type AnalyzePatchServerFailureCode =
  | AnswerExcerptServerFailureCode
  | "MISSING_OPENAI_KEY"
  | "MODEL_TRANSPORT_ERROR"
  | "MALFORMED_MODEL_OUTPUT"
  | "ANALYSIS_INVARIANT_VIOLATION"
  | "CLAIM_STORE_ERROR"
  | "EVIDENCE_STORE_ERROR"
  | "LIFECYCLE_STORE_ERROR"
  | "DISPUTE_PATCH_NOT_FOUND"
  | "DISPUTE_PATCH_STORE_ERROR"
  | "EXCERPT_LOOKUP_FAILED"
  | "CLARIFICATION_UNAVAILABLE"
  | "SYNTHESIS_UNAVAILABLE"
  | "THREAD_NOT_FOUND"
  | "THREAD_CORRUPTED"
  | "ARTIFACT_STORE_FAILURE";

// ── Mapping ─────────────────────────────────────────────────────────────────────

/**
 * Human-readable Chinese message keyed by every server failure code.
 */
const FAILURE_MESSAGES: Readonly<Record<AnalyzePatchServerFailureCode, string>> = {
  INVALID_REQUEST: "请输入一个有效的知乎回答链接和维护备注。",
  MISSING_ACCESS_SECRET: "服务暂时不可用，请稍后再试。",
  UNSUPPORTED_ANSWER_URL: "该链接格式暂不支持，请检查链接后重试。",
  ANSWER_NOT_FOUND: "未找到匹配的知乎回答。请确认链接是否正确。",
  AMBIGUOUS_ANSWER: "找到多个可能的回答，请提供更精确的链接。",
  INVALID_PROVIDER_ANSWER: "获取到的回答数据不完整，请稍后再试。",
  PROVIDER_ERROR: "获取回答摘录时出现异常，请稍后再试。",
  PROVIDER_RATE_LIMITED: "当前访问过于频繁，请稍后再试。",
  PROVIDER_QUOTA_EXCEEDED: "今日服务额度已用完，请明天再试。",
  MISSING_OPENAI_KEY: "AI 服务暂时不可用，请稍后再试。",
  MODEL_TRANSPORT_ERROR: "模型服务暂时不可用，请稍后再试。",
  MALFORMED_MODEL_OUTPUT: "模型响应异常，请稍后再试。",
  ANALYSIS_INVARIANT_VIOLATION: "分析过程中出现内部错误，请稍后再试。",
  CLAIM_STORE_ERROR: "保存分析结果时出现异常，请稍后再试。",
  EVIDENCE_STORE_ERROR: "检索证据时出现异常，请稍后再试。",
  LIFECYCLE_STORE_ERROR: "记录变更状态时出现异常，请稍后再试。",
  DISPUTE_PATCH_NOT_FOUND: "该变更记录不存在或已更新，请重新检查。",
  DISPUTE_PATCH_STORE_ERROR: "暂停变更时出现异常，请稍后再试。",
  THREAD_NOT_FOUND: "该学习线程不存在或已被移除。",
  THREAD_CORRUPTED: "该学习线程数据损坏，无法加载。",
  ARTIFACT_STORE_FAILURE: "保存学习线程时出现异常，请稍后再试。",
  EXCERPT_LOOKUP_FAILED: "未找到回答摘录，请先搜索并选择候选。",
  CLARIFICATION_UNAVAILABLE: "AI 澄清服务暂时不可用，请稍后再试。",
  SYNTHESIS_UNAVAILABLE: "AI 综合总结暂时不可用，请稍后再试。",
};

// ── Pure functions ─────────────────────────────────────────────────────────────

/**
 * Map a server failure code to a user-facing Chinese message.
 *
 * Returns a non-empty string for every known failure code.  The function
 * does not throw and does not depend on runtime locale settings.
 */
export const failureMessage = (code: AnalyzePatchServerFailureCode): string =>
  FAILURE_MESSAGES[code];

/**
 * Format a millisecond UTC timestamp as a stable, locale-free display string.
 *
 * Returns the format `YYYY/MM/DD HH:MM UTC`.  No date library dependency;
 * the implementation uses only UTC getter methods to remain deterministic
 * across environments.
 */
export const formatTimestamp = (ms: number): string => {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min} UTC`;
};

/**
 * Format a Unix-second source timestamp as a stable UTC date.
 *
 * Zhihu `EditTime` is a second-resolution Unix value, unlike internal
 * event timestamps that use milliseconds.
 */
export const formatDateFromUnixSeconds = (seconds: number): string => {
  const d = new Date(seconds * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} UTC`;
};
