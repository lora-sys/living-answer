import { describe, expect, it } from "vite-plus/test";

import {
  type AnalyzePatchServerFailureCode,
  type AnswerExcerptServerFailureCode,
  failureMessage,
  formatTimestamp,
} from "./failure-messages";

// ── Helpers ──────────────────────────────────────────────────────────────

const EXCERPT_CODES: readonly AnswerExcerptServerFailureCode[] = [
  "INVALID_REQUEST",
  "MISSING_ACCESS_SECRET",
  "UNSUPPORTED_ANSWER_URL",
  "ANSWER_NOT_FOUND",
  "AMBIGUOUS_ANSWER",
  "INVALID_PROVIDER_ANSWER",
  "PROVIDER_ERROR",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_QUOTA_EXCEEDED",
];

const ANALYZE_PATCH_CODES: readonly AnalyzePatchServerFailureCode[] = [
  ...EXCERPT_CODES,
  "MISSING_OPENAI_KEY",
  "MODEL_TRANSPORT_ERROR",
  "MALFORMED_MODEL_OUTPUT",
  "ANALYSIS_INVARIANT_VIOLATION",
];

// ── Tests ─────────────────────────────────────────────────────────────────

describe("failure-messages", () => {
  describe("failureMessage", () => {
    for (const code of EXCERPT_CODES) {
      it(`returns a non-empty Chinese message for ${code}`, () => {
        const msg = failureMessage(code);
        expect(typeof msg).toBe("string");
        expect(msg.length).toBeGreaterThan(0);
      });
    }

    for (const code of ANALYZE_PATCH_CODES) {
      it(`returns a non-empty Chinese message for analyze-patch code ${code}`, () => {
        const msg = failureMessage(code);
        expect(typeof msg).toBe("string");
        expect(msg.length).toBeGreaterThan(0);
      });
    }

    const cases: Array<{
      label: string;
      code: AnswerExcerptServerFailureCode;
      expected: string;
    }> = [
      {
        label: "INVALID_REQUEST → explicit input error",
        code: "INVALID_REQUEST",
        expected: "请输入一个有效的知乎回答链接和维护备注。",
      },
      {
        label: "ANSWER_NOT_FOUND → no matching answer",
        code: "ANSWER_NOT_FOUND",
        expected: "未找到匹配的知乎回答。请确认链接是否正确。",
      },
      {
        label: "PROVIDER_ERROR → generic server failure",
        code: "PROVIDER_ERROR",
        expected: "获取回答摘录时出现异常，请稍后再试。",
      },
      {
        label: "MISSING_ACCESS_SECRET → server config issue",
        code: "MISSING_ACCESS_SECRET",
        expected: "服务暂时不可用，请稍后再试。",
      },
      {
        label: "UNSUPPORTED_ANSWER_URL → URL format not supported",
        code: "UNSUPPORTED_ANSWER_URL",
        expected: "该链接格式暂不支持，请检查链接后重试。",
      },
      {
        label: "AMBIGUOUS_ANSWER → multiple matches",
        code: "AMBIGUOUS_ANSWER",
        expected: "找到多个可能的回答，请提供更精确的链接。",
      },
      {
        label: "INVALID_PROVIDER_ANSWER → corrupted data",
        code: "INVALID_PROVIDER_ANSWER",
        expected: "获取到的回答数据不完整，请稍后再试。",
      },
      {
        label: "PROVIDER_RATE_LIMITED → temporary rate limit",
        code: "PROVIDER_RATE_LIMITED",
        expected: "当前访问过于频繁，请稍后再试。",
      },
      {
        label: "PROVIDER_QUOTA_EXCEEDED → daily quota exhausted",
        code: "PROVIDER_QUOTA_EXCEEDED",
        expected: "今日服务额度已用完，请明天再试。",
      },
    ];

    for (const c of cases) {
      it(c.label, () => {
        expect(failureMessage(c.code)).toBe(c.expected);
      });
    }

    it("messages are distinct across all failure codes", () => {
      const msgs = new Set(ANALYZE_PATCH_CODES.map(failureMessage));
      expect(msgs.size).toBe(ANALYZE_PATCH_CODES.length);
    });

    it("no message contains raw provider error text or credential placeholders", () => {
      const forbidden = /secret|token|password|Error:|TypeError|stack|payload/;
      for (const code of ANALYZE_PATCH_CODES) {
        expect(forbidden.test(failureMessage(code))).toBe(false);
      }
    });
  });

  describe("formatTimestamp", () => {
    it("formats a normal timestamp as YYYY/MM/DD HH:MM UTC", () => {
      // 2024-01-15 14:30:00 UTC
      const ts = new Date(Date.UTC(2024, 0, 15, 14, 30, 0)).getTime();
      expect(formatTimestamp(ts)).toBe("2024/01/15 14:30 UTC");
    });

    it("pads single-digit months, days, hours, and minutes", () => {
      // 2024-03-05 07:09:00 UTC
      const ts = new Date(Date.UTC(2024, 2, 5, 7, 9, 0)).getTime();
      expect(formatTimestamp(ts)).toBe("2024/03/05 07:09 UTC");
    });

    it("handles the Unix epoch (1970) without overflow", () => {
      const ts = new Date(Date.UTC(1970, 0, 1, 0, 0, 0)).getTime();
      expect(formatTimestamp(ts)).toBe("1970/01/01 00:00 UTC");
    });

    it("produces stable output for the same input", () => {
      const ts = 1_700_000_000_000;
      expect(formatTimestamp(ts)).toBe(formatTimestamp(ts));
    });
  });
});
