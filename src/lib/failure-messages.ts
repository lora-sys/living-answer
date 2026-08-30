/**
 * Pure failure-code-to-user-message mapping for the answer excerpt flow.
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
  | "PROVIDER_ERROR";

// ── Mapping ─────────────────────────────────────────────────────────────────────

/**
 * Human-readable Chinese message keyed by every server failure code.
 */
const FAILURE_MESSAGES: Readonly<Record<AnswerExcerptServerFailureCode, string>> = {
  INVALID_REQUEST: "请输入一个有效的知乎回答链接。",
  MISSING_ACCESS_SECRET: "服务暂时不可用，请稍后再试。",
  UNSUPPORTED_ANSWER_URL: "该链接格式暂不支持，请检查链接后重试。",
  ANSWER_NOT_FOUND: "未找到匹配的知乎回答。请确认链接是否正确。",
  AMBIGUOUS_ANSWER: "找到多个可能的回答，请提供更精确的链接。",
  INVALID_PROVIDER_ANSWER: "获取到的回答数据不完整，请稍后再试。",
  PROVIDER_ERROR: "获取回答摘录时出现异常，请稍后再试。",
};

// ── Pure functions ─────────────────────────────────────────────────────────────

/**
 * Map a server failure code to a user-facing Chinese message.
 *
 * Returns a non-empty string for every known failure code.  The function
 * does not throw and does not depend on runtime locale settings.
 */
export const failureMessage = (code: AnswerExcerptServerFailureCode): string =>
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
