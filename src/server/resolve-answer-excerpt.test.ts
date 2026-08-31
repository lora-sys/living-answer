import { Effect } from "effect";

import { describe, expect, it } from "vite-plus/test";

import {
  AmbiguousAnswerProviderError,
  AnswerExcerptProviderError,
  AnswerNotFoundProviderError,
  InvalidProviderAnswerError,
  QuotaExceededProviderError,
  RateLimitedProviderError,
  UnsupportedAnswerUrlError,
  type AnswerExcerptProvider,
  type AnswerExcerptProviderFailure,
} from "../lib/answer-excerpt-provider";

import type { AnswerExcerpt } from "../lib/answer-excerpt";

import { createResolveAnswerExcerptHandler } from "./resolve-answer-excerpt";

// ── Helpers ──────────────────────────────────────────────────────────────

const VALID_URL = "https://www.zhihu.com/question/42/answer/100";

const makeExcerpt = (overrides: Partial<AnswerExcerpt> = {}): AnswerExcerpt =>
  Object.freeze({
    questionId: "42",
    answerId: "100",
    capturedAt: 1_700_000_000_000,
    sourceContentId: "123",
    sourceContentType: "Answer",
    sourceEditTime: 1_700_000_000_000,
    excerpt: "test excerpt",
    fingerprint: "v1:0000000000000000",
    ...overrides,
  });

const effectfulProvider = (
  result: Effect.Effect<AnswerExcerpt, AnswerExcerptProviderFailure>,
): AnswerExcerptProvider =>
  ({
    resolve: () => result,
    stats: () => Effect.succeed({ size: 0, hits: 0, misses: 0 }),
  }) as unknown as AnswerExcerptProvider;

const buildHandler = (secret: string | undefined, provider: AnswerExcerptProvider) =>
  createResolveAnswerExcerptHandler({
    getSecret: () => secret,
    createProvider: async () => provider,
  });

const call = async (
  h: ReturnType<typeof buildHandler>,
  input: { url: string },
): Promise<
  | { readonly status: "ok"; readonly excerpt: AnswerExcerpt }
  | { readonly status: "error"; readonly code: string }
> => h(input);

describe("resolve-answer-excerpt", () => {
  // ── Request validation ────────────────────────────────────────────────

  describe("request validation", () => {
    it("blank string returns INVALID_REQUEST without calling provider", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler("secret", provider);
      const response = await call(h, { url: "" });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("INVALID_REQUEST");
      }
    });

    it("whitespace-only string returns INVALID_REQUEST without calling provider", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler("secret", provider);
      const response = await call(h, { url: "   " });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("INVALID_REQUEST");
      }
    });

    it("undefined url returns INVALID_REQUEST without calling provider", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler("secret", provider);
      const response = await call(h, { url: undefined as any });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("INVALID_REQUEST");
      }
    });

    it("non-string url returns INVALID_REQUEST without calling provider", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler("secret", provider);
      const response = await call(h, { url: 123 as any });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("INVALID_REQUEST");
      }
    });
  });

  // ── Credential handling ───────────────────────────────────────────────

  describe("credential handling", () => {
    it("undefined secret returns MISSING_ACCESS_SECRET without calling provider", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler(undefined, provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MISSING_ACCESS_SECRET");
      }
    });

    it("blank string secret returns MISSING_ACCESS_SECRET without calling provider", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler("", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MISSING_ACCESS_SECRET");
      }
    });

    it("whitespace-only secret returns MISSING_ACCESS_SECRET without calling provider", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler("   ", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MISSING_ACCESS_SECRET");
      }
    });
  });

  // ── Success path ──────────────────────────────────────────────────────

  describe("success path", () => {
    it("valid URL and secret returns ok with AnswerExcerpt", async () => {
      const excerpt = makeExcerpt();
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const h = buildHandler("secret", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.excerpt).toBe(excerpt);
        expect(response.excerpt.questionId).toBe("42");
        expect(response.excerpt.excerpt).toBe("test excerpt");
      }
    });

    it("AnswerExcerpt object is returned without wrapper mutation", async () => {
      const excerpt = makeExcerpt({
        questionId: "123",
        answerId: "456",
        excerpt: "a custom excerpt",
      });
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const h = buildHandler("secret", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.excerpt).toBe(excerpt);
        // The excerpt's actual fields must be reachable — no stripping.
        expect(response.excerpt.questionId).toBe("123");
      }
    });
  });

  // ── Provider failure mapping ──────────────────────────────────────────

  describe("provider failure mapping", () => {
    it("AnswerNotFoundProviderError maps to ANSWER_NOT_FOUND", async () => {
      const provider = effectfulProvider(Effect.fail(new AnswerNotFoundProviderError()));
      const h = buildHandler("secret", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("ANSWER_NOT_FOUND");
      }
    });

    it("AmbiguousAnswerProviderError maps to AMBIGUOUS_ANSWER", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AmbiguousAnswerProviderError({ matches: 2 })),
      );
      const h = buildHandler("secret", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("AMBIGUOUS_ANSWER");
      }
    });

    it("InvalidProviderAnswerError maps to INVALID_PROVIDER_ANSWER", async () => {
      const provider = effectfulProvider(
        Effect.fail(new InvalidProviderAnswerError({ reason: "ITEM_NOT_OBJECT" })),
      );
      const h = buildHandler("secret", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("INVALID_PROVIDER_ANSWER");
      }
    });

    it("AnswerExcerptProviderError maps to PROVIDER_ERROR", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "fetch failed" })),
      );
      const h = buildHandler("secret", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("PROVIDER_ERROR");
      }
    });

    it("unknown Error maps to PROVIDER_ERROR without leaking internal details", async () => {
      // Provider internally converts unknown errors to AnswerExcerptProviderError;
      // here we simulate that conversion path.
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "internal: secret details" })),
      );
      const h = buildHandler("secret", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("PROVIDER_ERROR");
      }
    });

    it("RateLimitedProviderError maps to PROVIDER_RATE_LIMITED", async () => {
      const provider = effectfulProvider(Effect.fail(new RateLimitedProviderError()));
      const response = await call(buildHandler("secret", provider), { url: VALID_URL });

      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("PROVIDER_RATE_LIMITED");
      }
    });

    it("QuotaExceededProviderError maps to PROVIDER_QUOTA_EXCEEDED", async () => {
      const provider = effectfulProvider(Effect.fail(new QuotaExceededProviderError()));
      const response = await call(buildHandler("secret", provider), { url: VALID_URL });

      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("PROVIDER_QUOTA_EXCEEDED");
      }
    });

    it("no failure branch contains a Data.TaggedError instance in the response", async () => {
      // UnsupportedAnswerUrlError would surface through the provider's
      // `resolve` path only if `parseZhihuAnswerUrl` fails; the handler
      // does not pre-validate the URL, so it reaches the provider.
      const provider = effectfulProvider(
        Effect.fail(new UnsupportedAnswerUrlError({ reason: "UNKNOWN_URL" })),
      );
      const h = buildHandler("secret", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("UNSUPPORTED_ANSWER_URL");
        // Response must be a plain object, not an instance of Effect's TaggedError.
        expect(response).toEqual({
          status: "error",
          code: "UNSUPPORTED_ANSWER_URL",
        });
      }
    });
  });

  // ── Credential leak prevention ────────────────────────────────────────

  describe("credential leak prevention", () => {
    it("error responses contain no credential value", async () => {
      const secret = "my-super-secret-token";
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "fetch failed" })),
      );
      const h = buildHandler(secret, provider);
      const response = await call(h, { url: VALID_URL });
      const json = JSON.stringify(response);
      expect(json).not.toContain("my-super-secret-token");
    });

    it("success responses contain no credential value", async () => {
      const secret = "my-super-secret-token";
      const provider = effectfulProvider(Effect.succeed(makeExcerpt()));
      const h = buildHandler(secret, provider);
      const response = await call(h, { url: VALID_URL });
      const json = JSON.stringify(response);
      expect(json).not.toContain("my-super-secret-token");
    });
  });
});
