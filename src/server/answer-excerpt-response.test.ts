import { describe, expect, it } from "vite-plus/test";

import {
  AmbiguousAnswerProviderError,
  AnswerExcerptProviderError,
  AnswerNotFoundProviderError,
  InvalidProviderAnswerError,
  UnsupportedAnswerUrlError,
} from "../lib/answer-excerpt-provider";

import type { AnswerExcerptServerFailureCode } from "./answer-excerpt-response";
import { errorResponse, okResponse, toServerFailureCode } from "./answer-excerpt-response";

// ── Helpers ──────────────────────────────────────────────────────────────

const makeUntrustedError = (): Error => new Error("internal: something unexpected happened");

describe("answer-excerpt-response", () => {
  describe("toServerFailureCode", () => {
    const cases: Array<{
      label: string;
      error: unknown;
      expected: AnswerExcerptServerFailureCode;
    }> = [
      {
        label: "UnsupportedAnswerUrlError → UNSUPPORTED_ANSWER_URL",
        error: new UnsupportedAnswerUrlError({ reason: "UNKNOWN_URL" }),
        expected: "UNSUPPORTED_ANSWER_URL",
      },
      {
        label: "AnswerNotFoundProviderError → ANSWER_NOT_FOUND",
        error: new AnswerNotFoundProviderError(),
        expected: "ANSWER_NOT_FOUND",
      },
      {
        label: "AmbiguousAnswerProviderError → AMBIGUOUS_ANSWER",
        error: new AmbiguousAnswerProviderError({ matches: 3 }),
        expected: "AMBIGUOUS_ANSWER",
      },
      {
        label: "InvalidProviderAnswerError with ITEM_NOT_OBJECT → INVALID_PROVIDER_ANSWER",
        error: new InvalidProviderAnswerError({ reason: "ITEM_NOT_OBJECT" }),
        expected: "INVALID_PROVIDER_ANSWER",
      },
      {
        label: "InvalidProviderAnswerError with INVALID_CONTENT_ID → INVALID_PROVIDER_ANSWER",
        error: new InvalidProviderAnswerError({ reason: "INVALID_CONTENT_ID" }),
        expected: "INVALID_PROVIDER_ANSWER",
      },
      {
        label: "AnswerExcerptProviderError generic → PROVIDER_ERROR",
        error: new AnswerExcerptProviderError({ reason: "fetch failed" }),
        expected: "PROVIDER_ERROR",
      },
      {
        label: "unknown Error → PROVIDER_ERROR",
        error: makeUntrustedError(),
        expected: "PROVIDER_ERROR",
      },
      {
        label: "plain string → PROVIDER_ERROR",
        error: "something-went-wrong",
        expected: "PROVIDER_ERROR",
      },
      {
        label: "null → PROVIDER_ERROR",
        error: null,
        expected: "PROVIDER_ERROR",
      },
    ];

    for (const c of cases) {
      it(c.label, () => {
        expect(toServerFailureCode(c.error)).toBe(c.expected);
      });
    }
  });

  describe("okResponse", () => {
    it("wraps an AnswerExcerpt with status ok", () => {
      const excerpt = {
        questionId: "42",
        answerId: "100",
        capturedAt: 1_700_000_000_000n,
        sourceContentId: "123",
        sourceContentType: "Answer" as const,
        sourceEditTime: 1_700_000_000_000,
        excerpt: "hello",
        fingerprint: "v1:abcd1234",
      };

      const response = okResponse(excerpt as any);
      if (response.status === "ok") {
        expect(response.excerpt).toBe(excerpt);
      }
    });
  });

  describe("errorResponse", () => {
    it("wraps a failure code with status error", () => {
      const response = errorResponse("ANSWER_NOT_FOUND");
      if (response.status === "error") {
        expect(response.code).toBe("ANSWER_NOT_FOUND");
      }
    });
  });
});
