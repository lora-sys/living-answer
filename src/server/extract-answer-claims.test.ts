import { Effect } from "effect";

import { describe, expect, it } from "vite-plus/test";

import {
  AnswerExcerptProviderError,
  AnswerNotFoundProviderError,
  InvalidProviderAnswerError,
  UnsupportedAnswerUrlError,
  type AnswerExcerptProvider,
  type AnswerExcerptProviderFailure,
} from "../lib/answer-excerpt-provider";

import { OpenAiTransportError, type OpenAiChatCompletions } from "../lib/openai-adapter";

import type { AnswerExcerpt } from "../lib/answer-excerpt";

import type { ClaimRecord, ClaimStore } from "../lib/claim-store";
import { StoreError } from "../lib/claim-store";

import { createExtractAnswerClaimsHandler } from "./extract-answer-claims";

// ── Helpers ──────────────────────────────────────────────────────────────

const VALID_URL = "https://www.zhihu.com/question/42/answer/100";

const makeExcerpt = (overrides: Partial<AnswerExcerpt> = {}): AnswerExcerpt =>
  Object.freeze({
    questionId: "42",
    answerId: "100",
    capturedAt: 1_700_000_000_000,
    sourceContentId: "123",
    sourceContentType: "Answer",
    sourceEditTime: 1_699_999_999_000,
    excerpt: "The Earth orbits the Sun in an elliptical path.",
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

/**
 * Fake OpenAI chat that returns a fixed response or fails.
 */
const makeFakeChat = (
  response: string | Effect.Effect<string, OpenAiTransportError>,
): OpenAiChatCompletions => ({
  complete: () => (Effect.isEffect(response) ? response : Effect.succeed(response)),
});

/**
 * Fake in-memory claim store backed by a mutable array.
 */
const makeFakeClaimStore = (): {
  store: ClaimStore;
  savedSets: Array<{ excerptFp: string; claims: unknown[] }>;
} => {
  const savedSets: Array<{ excerptFp: string; claims: unknown[] }> = [];

  const store: ClaimStore = {
    saveClaimSet: (excerptFingerprint, claims) =>
      Effect.succeed(savedSets.push({ excerptFp: excerptFingerprint, claims: [...claims] })),
    findLatestByExcerptFingerprint: (excerptFingerprint) => {
      for (let i = savedSets.length - 1; i >= 0; i--) {
        if (savedSets[i].excerptFp === excerptFingerprint) {
          return Effect.succeed(savedSets[i].claims as ReadonlyArray<ClaimRecord>);
        }
      }
      return Effect.succeed([]);
    },
    listExcerptFingerprints: () => Effect.succeed([...new Set(savedSets.map((s) => s.excerptFp))]),
  };

  return { store, savedSets };
};

/**
 * Build a handler with injected deps for testing.
 */
const buildHandler = (
  openAiKey?: string,
  zhihuSecret?: string,
  provider?: AnswerExcerptProvider,
  chat?: OpenAiChatCompletions,
  claimStore?: ClaimStore,
) =>
  createExtractAnswerClaimsHandler({
    getSecret: () => [openAiKey, zhihuSecret] as [string | undefined, string | undefined],
    createProvider: async () =>
      provider ??
      effectfulProvider(Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" }))),
    createChat: () => chat ?? makeFakeChat(JSON.stringify({ claims: [] })),
    createClaimStore: async () => {
      if (claimStore) return claimStore;
      const { store } = makeFakeClaimStore();
      return store;
    },
  });

const call = async (
  handler: ReturnType<typeof buildHandler>,
  input: { url: string },
): Promise<
  | { readonly status: "ok"; readonly claims: readonly unknown[] }
  | { readonly status: "error"; readonly code: string }
> => handler(input);

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("extract-answer-claims", () => {
  // ── Request validation ───────────────────────────────────────────────────

  describe("request validation", () => {
    const provider = effectfulProvider(
      Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
    );

    it("blank string returns INVALID_REQUEST without calling provider", async () => {
      const h = buildHandler("key", "secret", provider);
      const response = await call(h, { url: "" });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("INVALID_REQUEST");
      }
    });

    it("whitespace-only string returns INVALID_REQUEST without calling provider", async () => {
      const h = buildHandler("key", "secret", provider);
      const response = await call(h, { url: "   " });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("INVALID_REQUEST");
      }
    });

    it("undefined url returns INVALID_REQUEST without calling provider", async () => {
      const h = buildHandler("key", "secret", provider);
      const response = await call(h, { url: undefined as any });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("INVALID_REQUEST");
      }
    });

    it("non-string url returns INVALID_REQUEST without calling provider", async () => {
      const h = buildHandler("key", "secret", provider);
      const response = await call(h, { url: 123 as any });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("INVALID_REQUEST");
      }
    });

    it("non-Zhihu URL returns UNSUPPORTED_ANSWER_URL", async () => {
      const h = buildHandler("key", "secret", provider);
      const response = await call(h, { url: "https://example.com/question/1/answer/2" });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("UNSUPPORTED_ANSWER_URL");
      }
    });
  });

  // ── Credential handling ─────────────────────────────────────────────────

  describe("credential handling", () => {
    const provider = effectfulProvider(
      Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
    );

    it("missing OPENAI_API_KEY returns MISSING_OPENAI_KEY without calling provider", async () => {
      const h = buildHandler(undefined, "secret", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MISSING_OPENAI_KEY");
      }
    });

    it("blank OPENAI_API_KEY returns MISSING_OPENAI_KEY without calling provider", async () => {
      const h = buildHandler("", "secret", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MISSING_OPENAI_KEY");
      }
    });

    it("missing ZHIHU_ACCESS_SECRET returns MISSING_ACCESS_SECRET without calling provider", async () => {
      const h = buildHandler("openai-key", undefined, provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MISSING_ACCESS_SECRET");
      }
    });

    it("blank ZHIHU_ACCESS_SECRET returns MISSING_ACCESS_SECRET", async () => {
      const h = buildHandler("openai-key", "", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MISSING_ACCESS_SECRET");
      }
    });
  });

  // ── Provider failure mapping ────────────────────────────────────────────

  describe("provider failure mapping", () => {
    const chat = makeFakeChat(JSON.stringify({ claims: [] }));

    it("AnswerNotFoundProviderError maps to ANSWER_NOT_FOUND", async () => {
      const provider = effectfulProvider(Effect.fail(new AnswerNotFoundProviderError()));
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("ANSWER_NOT_FOUND");
      }
    });

    it("InvalidProviderAnswerError maps to INVALID_PROVIDER_ANSWER", async () => {
      const provider = effectfulProvider(
        Effect.fail(new InvalidProviderAnswerError({ reason: "ITEM_NOT_OBJECT" })),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("INVALID_PROVIDER_ANSWER");
      }
    });

    it("UnsupportedAnswerUrlError maps to UNSUPPORTED_ANSWER_URL", async () => {
      const provider = effectfulProvider(
        Effect.fail(new UnsupportedAnswerUrlError({ reason: "UNKNOWN_URL" })),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("UNSUPPORTED_ANSWER_URL");
      }
    });

    it("AnswerExcerptProviderError maps to PROVIDER_ERROR", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "fetch failed" })),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("PROVIDER_ERROR");
      }
    });

    it("unknown provider error maps to PROVIDER_ERROR without leaking details", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "internal stack trace here" })),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("PROVIDER_ERROR");
      }
    });

    it("serializes provider failure as a stable error response", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("PROVIDER_ERROR");
        expect(response).toEqual({
          status: "error",
          code: "PROVIDER_ERROR",
        });
      }
    });

    it("provider creation failure returns PROVIDER_ERROR", async () => {
      const h = buildHandler("openai-key", "zhihu-secret");
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("PROVIDER_ERROR");
      }
    });
  });

  // ── Claim store error ───────────────────────────────────────────────────

  describe("claim store error", () => {
    it("returns CLAIM_STORE_ERROR when claim store creation fails", async () => {
      const excerpt = makeExcerpt();
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(JSON.stringify({ claims: [] }));

      const h = createExtractAnswerClaimsHandler({
        getSecret: () => ["openai-key", "zhihu-secret"] as const,
        createProvider: async () => provider,
        createChat: () => chat,
        createClaimStore: async () => {
          throw new Error("disk full");
        },
      });

      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("CLAIM_STORE_ERROR");
      }
    });

    it("returns CLAIM_STORE_ERROR when saveClaimSet fails", async () => {
      const excerpt = makeExcerpt();
      const provider = effectfulProvider(Effect.succeed(excerpt));

      // Chat returns a valid single claim
      const chat = makeFakeChat(
        JSON.stringify({
          claims: [
            {
              claimText:
                "The Earth orbits the Sun in an elliptical path, which is a known astronomical fact.",
              anchorText: "The Earth orbits the Sun",
              volatility: "low",
              decisionRelevance: "low",
              candidateReason: "New astronomical observations may update orbital parameters.",
            },
          ],
        }),
      );

      const errorStore: ClaimStore = {
        saveClaimSet: () => Effect.fail(new StoreError({ reason: "database is locked" })),
        findLatestByExcerptFingerprint: () => Effect.succeed([]),
        listExcerptFingerprints: () => Effect.succeed([]),
      };

      const h = createExtractAnswerClaimsHandler({
        getSecret: () => ["openai-key", "zhihu-secret"] as const,
        createProvider: async () => provider,
        createChat: () => chat,
        createClaimStore: async () => errorStore,
      });

      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("CLAIM_STORE_ERROR");
      }
    });
  });

  // ── Workflow error mapping ──────────────────────────────────────────────

  describe("workflow error mapping", () => {
    it("TRANSPORT_FAILED maps to PROVIDER_ERROR", async () => {
      const excerpt = makeExcerpt();
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(
        Effect.fail(new OpenAiTransportError({ reason: "NETWORK_FAILED" })),
      );

      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("PROVIDER_ERROR");
      }
    });

    it("model returns invalid JSON maps to PROVIDER_ERROR", async () => {
      const excerpt = makeExcerpt();
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat("not valid json {{");

      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("PROVIDER_ERROR");
      }
    });

    it("hang/abort in transport layer maps to PROVIDER_ERROR instantly", async () => {
      // Simulate AbortSignal.timeout firing by throwing AbortError from fetch.
      // This exercises the real transport path: NETWORK_FAILED → TRANSPORT_FAILED → PROVIDER_ERROR.
      // No real wait or sleep — the fake fetch resolves (rejects) immediately.
      const excerpt = makeExcerpt();
      const provider = effectfulProvider(Effect.succeed(excerpt));

      const { makeOpenAiChatCompletions, makeFetchOpenAiTransport } =
        await import("../lib/openai-adapter");

      const abortError = new DOMException("The user aborted a request.", "AbortError");
      const hangingFetch = () => Promise.reject(abortError) as Promise<Response>;

      const chat = makeOpenAiChatCompletions({
        apiKey: "test-key",
        model: "test-model",
        baseUrl: "http://localhost",
        timeoutMs: 1_000,
        transport: makeFetchOpenAiTransport({
          fetch: hangingFetch as unknown as typeof fetch,
          timeoutMs: 1_000,
        }),
      });

      const h = createExtractAnswerClaimsHandler({
        getSecret: () => ["openai-key", "zhihu-secret"] as [string | undefined, string | undefined],
        createProvider: async () => provider,
        createChat: () => chat,
        createClaimStore: async () => {
          const { store } = makeFakeClaimStore();
          return store;
        },
      });

      const start = Date.now();
      const response = await call(h, { url: VALID_URL });
      const elapsed = Date.now() - start;

      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("PROVIDER_ERROR");
      }
      // Must resolve near-instantly (no real 1s wait since the fake fetch throws immediately)
      expect(elapsed).toBeLessThan(5_000);
    });
  });

  // ── Success path ────────────────────────────────────────────────────────

  describe("success path", () => {
    it("returns ok with claim records on successful extraction", async () => {
      const excerpt = makeExcerpt({
        excerpt:
          "The Earth orbits the Sun in an elliptical path. Water covers 71% of Earth's surface.",
      });
      const provider = effectfulProvider(Effect.succeed(excerpt));

      const chat = makeFakeChat(
        JSON.stringify({
          claims: [
            {
              claimText: "The Earth orbits the Sun in an elliptical path.",
              anchorText: "The Earth orbits the Sun",
              volatility: "high",
              decisionRelevance: "high",
              candidateReason: "Orbital mechanics news may update what learners see.",
            },
          ],
        }),
      );

      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.claims).toHaveLength(1);
        const claim = response.claims[0] as Record<string, unknown>;
        expect(claim.claimText).toBe("The Earth orbits the Sun in an elliptical path.");
        expect(claim.anchorText).toBe("The Earth orbits the Sun");
        expect(claim.volatility).toBe("high");
        expect(claim.decisionRelevance).toBe("high");
        expect(claim.candidateReason).toBe("Orbital mechanics news may update what learners see.");
        expect(claim.status as string).toBe("candidate");
        expect(claim.claimFingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
      }
    });

    it("returns empty claims array when model returns no claims", async () => {
      const excerpt = makeExcerpt();
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(JSON.stringify({ claims: [] }));

      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.claims).toEqual([]);
      }
    });

    it("persists claim set to the claim store", async () => {
      const excerpt = makeExcerpt({
        fingerprint: "v1:1234567890abcdef",
      });
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(
        JSON.stringify({
          claims: [
            {
              claimText:
                "The Earth orbits the Sun in an elliptical path, confirmed by Kepler's laws.",
              anchorText: "The Earth orbits the Sun",
              volatility: "high",
              decisionRelevance: "high",
              candidateReason: "Orbital mechanics updates remain relevant to learners.",
            },
          ],
        }),
      );

      const { store, savedSets } = makeFakeClaimStore();
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat, store);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        // Verify claims were persisted
        expect(savedSets).toHaveLength(1);
        expect(savedSets[0].excerptFp).toBe("v1:1234567890abcdef");
        expect(savedSets[0].claims).toHaveLength(1);
        const claim = savedSets[0].claims[0] as Record<string, string>;
        expect(claim.claimText).toBe(
          "The Earth orbits the Sun in an elliptical path, confirmed by Kepler's laws.",
        );
      }
    });
  });

  // ── Credential leak prevention ──────────────────────────────────────────

  describe("credential leak prevention", () => {
    it("error responses contain no secret values", async () => {
      const apiKey = "sk-secret-api-key-123";
      const zhihuSecret = "zhihu-secret-value-456";
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "fetch failed" })),
      );
      const h = buildHandler(apiKey, zhihuSecret, provider);
      const response = await call(h, { url: VALID_URL });
      const json = JSON.stringify(response);
      expect(json).not.toContain(apiKey);
      expect(json).not.toContain(zhihuSecret);
    });

    it("success responses contain no secret values", async () => {
      const apiKey = "sk-secret-api-key-123";
      const zhihuSecret = "zhihu-secret-value-456";
      const excerpt = makeExcerpt();
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(JSON.stringify({ claims: [] }));

      const h = buildHandler(apiKey, zhihuSecret, provider, chat);
      const response = await call(h, { url: VALID_URL });
      const json = JSON.stringify(response);
      expect(json).not.toContain(apiKey);
      expect(json).not.toContain(zhihuSecret);
    });
  });

  // ── Response structure ──────────────────────────────────────────────────

  describe("response structure", () => {
    it("ok response is a plain object with status and claims array", async () => {
      const excerpt = makeExcerpt();
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(JSON.stringify({ claims: [] }));

      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response).toEqual({ status: "ok", claims: [] });
    });

    it("error response is a plain object with status and code", async () => {
      const provider = effectfulProvider(Effect.fail(new AnswerNotFoundProviderError()));
      const h = buildHandler("openai-key", "zhihu-secret", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response).toEqual({ status: "error", code: "ANSWER_NOT_FOUND" });
    });
  });
});
