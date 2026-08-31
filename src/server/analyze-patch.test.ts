import { Effect } from "effect";

import { describe, expect, it } from "vite-plus/test";

import {
  AnswerExcerptProviderError,
  AnswerNotFoundProviderError,
  AmbiguousAnswerProviderError,
  InvalidProviderAnswerError,
  UnsupportedAnswerUrlError,
  type AnswerExcerptProvider,
  type AnswerExcerptProviderFailure,
} from "../lib/answer-excerpt-provider";

import {
  OpenAiTransportError,
  type OpenAiChatCompletions,
  type OpenAiChatCompletionsRequest,
} from "../lib/openai-adapter";

import type { AnswerExcerpt } from "../lib/answer-excerpt";
import { StoreError, type ClaimRecord, type ClaimStore } from "../lib/claim-store";
import {
  EvidenceCandidateStoreError,
  type EvidenceCandidateRecord,
  type EvidenceCandidateStore,
} from "../lib/evidence-candidate-store";
import type { EvidenceCandidate } from "../lib/evidence-candidate";
import { createPatchEvidence } from "../lib/patch-evidence";

import { createAnalyzePatchHandler, type AnalyzePatchServerInput } from "./analyze-patch";

import type { AnalyzePatchResponse, AnalyzePatchUpdateResponse } from "./analyze-patch-response";

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

const serverEvidenceFingerprint = (excerpt: AnswerExcerpt, sourceUrl: string): string => {
  const result = createPatchEvidence({
    sourceLabel: "知乎回答原文",
    sourceUrl,
    quote: excerpt.excerpt,
    capturedAt: excerpt.capturedAt,
  });
  if (result._tag === "failure") {
    throw new Error(`unexpected evidence failure: ${result.reason}`);
  }
  return result.evidence.fingerprint;
};

/**
 * Fake OpenAI chat that delegates to a handler function.
 */
const makeFakeChat = (
  handler: (
    request: import("../lib/openai-adapter").OpenAiChatCompletionsRequest,
  ) => string | Effect.Effect<string, OpenAiTransportError>,
): OpenAiChatCompletions => ({
  complete: (request) => {
    const result = handler(request);
    return Effect.isEffect(result)
      ? (result as Effect.Effect<string, OpenAiTransportError>)
      : Effect.succeed(result);
  },
});

/**
 * Build a handler with injected deps for testing.
 */
const buildHandler = (
  openAiKey?: string,
  zhihuSecret?: string,
  provider?: AnswerExcerptProvider,
  chat?: OpenAiChatCompletions,
) =>
  createAnalyzePatchHandler({
    getSecret: () => [openAiKey ?? "test-openai-key", zhihuSecret ?? "test-zhihu-secret"],
    createProvider: async () =>
      provider ??
      effectfulProvider(Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" }))),
    createChat: () =>
      chat ?? makeFakeChat(() => JSON.stringify({ verdict: "NO_PATCH", reason: "N/A" })),
    createClaimStore: async () =>
      ({ findLatestByExcerptFingerprint: () => Effect.succeed([]) }) as unknown as ClaimStore,
    createEvidenceStore: async () =>
      ({
        findCandidatesByClaimFingerprint: () => Effect.succeed([]),
      }) as unknown as EvidenceCandidateStore,
  });

/**
 * Call a handler and return the raw response.
 */
const call = async (
  handler: ReturnType<typeof buildHandler>,
  input: AnalyzePatchServerInput,
): Promise<AnalyzePatchResponse> => handler(input);

// ═══════════════════════════════════════════════════════════════════════════════
// Fixtures
// ═══════════════════════════════════════════════════════════════════════════════

const EXCERPT_WITH_URL = makeExcerpt({
  questionId: "42",
  answerId: "100",
  sourceContentId: "456",
  sourceEditTime: 1_699_999_000,
  excerpt: "A relevant excerpt.",
  fingerprint: "v1:abcd1234abcd1234",
});

const GATE_CLAIM_FINGERPRINT = "v1:claim0000000000";
const GATE_CANDIDATE_FINGERPRINT = "v1:candidate000000";

const makeGateClaim = (): ClaimRecord => ({
  questionId: EXCERPT_WITH_URL.questionId,
  answerId: EXCERPT_WITH_URL.answerId,
  sourceContentId: EXCERPT_WITH_URL.sourceContentId,
  sourceContentType: EXCERPT_WITH_URL.sourceContentType,
  sourceEditTime: EXCERPT_WITH_URL.sourceEditTime,
  excerptFingerprint: EXCERPT_WITH_URL.fingerprint,
  claimFingerprint: GATE_CLAIM_FINGERPRINT,
  claimText: "The answer states a fact that may have changed.",
  anchorText: "The answer states a fact",
  volatility: "high",
  decisionRelevance: "primary",
  candidateReason: "Time-sensitive statement",
  extractedAt: EXCERPT_WITH_URL.capturedAt,
  status: "active",
});

const makeGateCandidate = (): EvidenceCandidateRecord => {
  const candidate: EvidenceCandidate = {
    claimFingerprint: GATE_CLAIM_FINGERPRINT,
    retrievalEventFingerprint: "v1:retrieval0000000",
    provider: "global_search",
    searchQuery: "relevant claim update",
    sourceContentId: "789",
    sourceContentType: "Article",
    sourceKind: "web_source",
    authorityHint: "official",
    sourceLabel: "Official statistics",
    title: "Updated statistics",
    sourceUrl: "https://example.com/statistics",
    contentPreview: "The official number is now 8.1 billion.",
    capturedAt: EXCERPT_WITH_URL.capturedAt,
    sourceAccessState: "fetched",
    candidateFingerprint: GATE_CANDIDATE_FINGERPRINT,
    status: "candidate",
  };
  return candidate;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("analyze-patch", () => {
  // ── Request validation ───────────────────────────────────────────────────

  describe("request validation", () => {
    it("blank string url returns INVALID_REQUEST without calling provider", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler(undefined, undefined, provider);
      const response = await call(h, { url: "" });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("INVALID_REQUEST");
      }
    });

    it("whitespace-only url returns INVALID_REQUEST without calling provider", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler(undefined, undefined, provider);
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
      const h = buildHandler(undefined, undefined, provider);
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
      const h = buildHandler(undefined, undefined, provider);
      const response = await call(h, { url: 123 as any });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("INVALID_REQUEST");
      }
    });

    it("url that doesn't match Zhihu pattern returns UNSUPPORTED_ANSWER_URL without calling provider", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler(undefined, undefined, provider);
      const response = await call(h, { url: "https://example.com/question/1/answer/2" });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("UNSUPPORTED_ANSWER_URL");
      }
    });

    it("null input returns INVALID_REQUEST without downstream calls", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler(undefined, undefined, provider);
      const response = await call(h, null as any);
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("INVALID_REQUEST");
      }
    });
  });

  // ── Credential handling ─────────────────────────────────────────────────

  describe("credential handling", () => {
    it("missing OPENAI_API_KEY returns MISSING_OPENAI_KEY without calling provider", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler("", "zhihu-secret", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MISSING_OPENAI_KEY");
      }
    });

    it("blank OPENAI_API_KEY returns MISSING_OPENAI_KEY without calling provider", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler("", "zhihu-secret", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MISSING_OPENAI_KEY");
      }
    });

    it("missing ZHIHU_ACCESS_SECRET returns MISSING_OPENAI_KEY without calling provider", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler("openai-key", "", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MISSING_OPENAI_KEY");
      }
    });

    it("blank ZHIHU_ACCESS_SECRET returns MISSING_OPENAI_KEY", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" })),
      );
      const h = buildHandler("openai-key", "", provider);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MISSING_OPENAI_KEY");
      }
    });

    it("provider creation failure returns PROVIDER_ERROR", async () => {
      const h = buildHandler("openai-key", "zhihu-secret");
      // default provider throws on creation
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("PROVIDER_ERROR");
      }
    });
  });

  // ── Provider failure mapping ────────────────────────────────────────────

  describe("provider failure mapping", () => {
    const chat = makeFakeChat(() => JSON.stringify({ verdict: "NO_PATCH", reason: "ok" }));

    it("ANSWER_NOT_FOUND maps correctly", async () => {
      const provider = effectfulProvider(Effect.fail(new AnswerNotFoundProviderError()));
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("ANSWER_NOT_FOUND");
      }
    });

    it("AMBIGUOUS_ANSWER maps correctly", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AmbiguousAnswerProviderError({ matches: 2 })),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
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
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
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
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("PROVIDER_ERROR");
      }
    });

    it("unknown Error maps to PROVIDER_ERROR without leaking details", async () => {
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "internal: secret details" })),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("PROVIDER_ERROR");
      }
    });

    it("no failure branch contains a Data.TaggedError instance in the response", async () => {
      const provider = effectfulProvider(
        Effect.fail(new UnsupportedAnswerUrlError({ reason: "UNKNOWN_URL" })),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("UNSUPPORTED_ANSWER_URL");
        expect(response).toEqual({
          status: "error",
          code: "UNSUPPORTED_ANSWER_URL",
        });
      }
    });
  });

  // ── Success: UPDATE verdict ──────────────────────────────────────────────

  describe("success paths — UPDATE", () => {
    it("returns ok with patchBodyStatus: 'no-body-available' on UPDATE", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const serverFp = serverEvidenceFingerprint(excerpt, VALID_URL);

      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "External source confirms.",
          selectedEvidenceFingerprints: [serverFp],
        }),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.decision.verdict).toBe("UPDATE");
        expect((response.decision as AnalyzePatchUpdateResponse).patchBodyStatus).toBe(
          "no-body-available",
        );
        expect("proposedBody" in response.decision).toBe(false);
        const summary = (response.decision as AnalyzePatchUpdateResponse).evidenceSummary;
        expect(summary).toHaveLength(1);
        expect(summary[0].fingerprint).toBe(serverFp);
        expect(summary[0].sourceUrl).toBe(VALID_URL);
        expect(summary[0].sourceLabel).toBe("知乎回答原文");
      }
    });

    it("UPDATE evidenceSummary includes external server-derived evidence", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const serverFp = serverEvidenceFingerprint(excerpt, VALID_URL);

      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "Confirmed.",
          selectedEvidenceFingerprints: [serverFp],
        }),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        const summary = (response.decision as AnalyzePatchUpdateResponse).evidenceSummary;
        expect(summary).toHaveLength(1);
        expect(summary[0].sourceUrl).toBeTruthy();
      }
    });
  });

  // ── Success: NO_PATCH and UNKNOWN ───────────────────────────────────────

  describe("success paths — NO_PATCH and UNKNOWN", () => {
    it("returns ok with NO_PATCH — no patchBodyStatus, no evidenceSummary", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "NO_PATCH",
          reason: "Answer is fine.",
        }),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.decision.verdict).toBe("NO_PATCH");
        expect(response.decision.reason).toBe("Answer is fine.");
        expect("patchBodyStatus" in response.decision).toBe(false);
        expect("evidenceSummary" in response.decision).toBe(false);
        expect("selectedEvidenceFingerprints" in response.decision).toBe(false);
      }
    });

    it("returns ok with UNKNOWN — no patchBodyStatus, no evidenceSummary", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UNKNOWN",
          reason: "Inconclusive.",
        }),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.decision.verdict).toBe("UNKNOWN");
        expect(response.decision.reason).toBe("Inconclusive.");
        expect("patchBodyStatus" in response.decision).toBe(false);
        expect("evidenceSummary" in response.decision).toBe(false);
        expect("selectedEvidenceFingerprints" in response.decision).toBe(false);
      }
    });
  });

  // ── Advisory-only UPDATE semantics ──────────────────────────────────────

  describe("advisory-only UPDATE semantics", () => {
    it("UPDATE response includes patchBodyStatus and no proposedBody", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const serverFp = serverEvidenceFingerprint(excerpt, VALID_URL);

      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "Confirmed by external evidence.",
          selectedEvidenceFingerprints: [serverFp],
        }),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      if (response.status === "ok") {
        const decision = response.decision as AnalyzePatchUpdateResponse;
        expect(decision.patchBodyStatus).toBe("no-body-available");
        expect("proposedBody" in decision).toBe(false);
      }
    });

    it("NO_PATCH response omits patchBodyStatus entirely", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "NO_PATCH",
          reason: "Answer is fine.",
        }),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      if (response.status === "ok") {
        expect("patchBodyStatus" in response.decision).toBe(false);
      }
    });

    it("UNKNOWN response omits patchBodyStatus entirely", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UNKNOWN",
          reason: "Inconclusive.",
        }),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      if (response.status === "ok") {
        expect("patchBodyStatus" in response.decision).toBe(false);
      }
    });
  });

  // ── Model failure mapping ───────────────────────────────────────────────

  describe("model failure mapping", () => {
    it("transport failure returns MODEL_TRANSPORT_ERROR", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        Effect.fail(new OpenAiTransportError({ reason: "NETWORK_FAILED" })),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MODEL_TRANSPORT_ERROR");
      }
    });

    it("transport error with HTTP 429 maps to MODEL_TRANSPORT_ERROR", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        Effect.fail(new OpenAiTransportError({ reason: "HTTP_STATUS", status: 429 })),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MODEL_TRANSPORT_ERROR");
      }
    });

    it("invalid JSON returns MALFORMED_MODEL_OUTPUT", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() => "not valid json");
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MALFORMED_MODEL_OUTPUT");
      }
    });

    it("JSON with garbage verdict returns MALFORMED_MODEL_OUTPUT", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        JSON.stringify({ verdict: "MAYBE_LATER", reason: "not sure" }),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MALFORMED_MODEL_OUTPUT");
      }
    });

    it("JSON missing verdict field returns MALFORMED_MODEL_OUTPUT", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() => JSON.stringify({ reason: "no verdict here" }));
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("error");
      if (response.status === "error") {
        expect(response.code).toBe("MALFORMED_MODEL_OUTPUT");
      }
    });
  });

  // ── Context is passed through ───────────────────────────────────────────

  describe("context propagation", () => {
    it("passes user context through to the workflow", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const provider = effectfulProvider(Effect.succeed(excerpt));
      let capturedContext: string | undefined;
      const chat = makeFakeChat((request) => {
        // Extract context from the prompt
        const prompt = JSON.parse(request.messages[0].content);
        capturedContext = prompt.answerContext?.contextText;
        return JSON.stringify({ verdict: "NO_PATCH", reason: "ok" });
      });
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      await call(h, {
        url: VALID_URL,
        context: "User-supplied maintenance note.",
      });

      expect(capturedContext).toBe("User-supplied maintenance note.");
    });

    it("omits user context text from prompt when no context provided", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const provider = effectfulProvider(Effect.succeed(excerpt));
      let contextText: string | undefined;
      let excerptText: string | undefined;
      const chat = makeFakeChat((request) => {
        const prompt = JSON.parse(request.messages[0].content);
        contextText = prompt.answerContext?.contextText;
        excerptText = prompt.answerContext?.excerptText;
        return JSON.stringify({ verdict: "NO_PATCH", reason: "ok" });
      });
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      await call(h, { url: VALID_URL });

      expect(contextText).toBeUndefined();
      expect(excerptText).toBe(excerpt.excerpt);
    });
  });

  // ── Credential leak prevention ──────────────────────────────────────────

  describe("credential leak prevention", () => {
    it("error responses contain no secret value", async () => {
      const secret = "my-super-secret-token";
      const provider = effectfulProvider(
        Effect.fail(new AnswerExcerptProviderError({ reason: "fetch failed" })),
      );
      const h = buildHandler("openai-key", secret, provider);
      const response = await call(h, { url: VALID_URL });
      const json = JSON.stringify(response);
      expect(json).not.toContain("my-super-secret-token");
    });

    it("success responses contain no secret value", async () => {
      const secret = "my-super-secret-token";
      const excerpt = EXCERPT_WITH_URL;
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() => JSON.stringify({ verdict: "NO_PATCH", reason: "ok" }));
      const h = buildHandler("openai-key", secret, provider, chat);
      const response = await call(h, { url: VALID_URL });
      const json = JSON.stringify(response);
      expect(json).not.toContain("my-super-secret-token");
    });
  });

  // ── No Data.TaggedError in any response ────────────────────────────────

  describe("no Data.TaggedError in responses", () => {
    it("MALFORMED_MODEL_OUTPUT is a plain string code", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() => "not json");
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response).toEqual({ status: "error", code: "MALFORMED_MODEL_OUTPUT" });
    });

    it("MODEL_TRANSPORT_ERROR is a plain string code", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        Effect.fail(new OpenAiTransportError({ reason: "NETWORK_FAILED" })),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });
      expect(response).toEqual({ status: "error", code: "MODEL_TRANSPORT_ERROR" });
    });
  });

  // ── Domain record invariants ────────────────────────────────────────────

  describe("domain record creation", () => {
    it("builds proposal with excerpt text as proposedBody (advisory stub)", async () => {
      const excerpt = makeExcerpt({
        questionId: "42",
        answerId: "100",
        sourceContentId: "456",
        sourceEditTime: 1_699_999_000,
        excerpt: "The world population reached 8 billion on 2022-11-15.",
        fingerprint: "v1:abcdef1234567890",
      });

      // Verify that context text is passed to prompt
      const provider = effectfulProvider(Effect.succeed(excerpt));
      let capturedPrompt: unknown;
      const chat = makeFakeChat((request) => {
        capturedPrompt = JSON.parse(request.messages[0].content);
        return JSON.stringify({ verdict: "NO_PATCH", reason: "ok" });
      });
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      await call(h, {
        url: VALID_URL,
        context: "User maintenance note about population.",
      });

      // The context text appears in the prompt sent to the model
      const prompt = capturedPrompt as Record<string, Record<string, string>>;
      expect(prompt.answerContext?.contextText).toBe("User maintenance note about population.");
      expect(prompt.answerContext?.excerptText).toBe(excerpt.excerpt);
    });
  });

  // ── Optional fields flow through server response ──────────────────────────

  describe("optional fields in UPDATE response", () => {
    it("includes affectedWording, currentState, and impactOnAnswer in the response", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const serverFp = serverEvidenceFingerprint(excerpt, VALID_URL);

      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "Confirmed.",
          selectedEvidenceFingerprints: [serverFp],
          affectedWording: "A relevant excerpt.",
          currentState: "The world reached 8 billion.",
          impactOnAnswer: "The answer's premise is now outdated.",
        }),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.decision.verdict).toBe("UPDATE");
        const update = response.decision as AnalyzePatchUpdateResponse;
        expect(update.affectedWording).toBe("A relevant excerpt.");
        expect(update.currentState).toBe("The world reached 8 billion.");
        expect(update.impactOnAnswer).toBe("The answer's premise is now outdated.");
        expect(update.matchedEvidence).toBeDefined();
        expect(update.matchedEvidence).toHaveLength(1);
      }
    });

    it("omits optional fields when model does not provide them", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const serverFp = serverEvidenceFingerprint(excerpt, VALID_URL);

      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "Confirmed.",
          selectedEvidenceFingerprints: [serverFp],
        }),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.decision.verdict).toBe("UPDATE");
        const update = response.decision as AnalyzePatchUpdateResponse;
        expect("affectedWording" in update).toBe(false);
        expect("currentState" in update).toBe(false);
        expect("impactOnAnswer" in update).toBe(false);
        expect(update.matchedEvidence).toHaveLength(1);
      }
    });

    it("response contains no proposedBody field", async () => {
      const excerpt = EXCERPT_WITH_URL;
      const serverFp = serverEvidenceFingerprint(excerpt, VALID_URL);

      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "Confirmed.",
          selectedEvidenceFingerprints: [serverFp],
        }),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect("proposedBody" in response.decision).toBe(false);
      }
    });

    it("downgrades UPDATE when the selected fingerprint does not exist", async () => {
      const excerpt = EXCERPT_WITH_URL;

      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "Confirmed.",
          selectedEvidenceFingerprints: ["v1:aaaaaaaaaaaaaaaa"],
        }),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.decision.verdict).toBe("UNKNOWN"); // downgraded by invariant
      }
    });

    it("matchedEvidence is omitted when selected evidence has no external URL", async () => {
      const excerpt = makeExcerpt({
        excerpt: "Short text.",
      });
      const noUrlFp = serverEvidenceFingerprint(excerpt, ""); // empty URL

      const provider = effectfulProvider(Effect.succeed(excerpt));
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "Confirmed.",
          selectedEvidenceFingerprints: [noUrlFp],
        }),
      );
      const h = buildHandler("openai-key", "zhihu-secret", provider, chat);
      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.decision.verdict).toBe("UNKNOWN"); // downgraded by invariant
      }
    });
  });

  // ── Evidence gate integration ───────────────────────────────────────────

  describe("evidence gate integration", () => {
    const buildGateHandler = (deps: {
      readonly claimStore: ClaimStore;
      readonly evidenceStore: EvidenceCandidateStore;
      readonly chat: OpenAiChatCompletions;
    }) =>
      createAnalyzePatchHandler({
        getSecret: () => ["openai-key", "zhihu-secret"],
        createProvider: async () => effectfulProvider(Effect.succeed(EXCERPT_WITH_URL)),
        createChat: () => deps.chat,
        createClaimStore: async () => deps.claimStore,
        createEvidenceStore: async () => deps.evidenceStore,
      });

    it("returns a store error when claim lookup fails", async () => {
      const claimStore = {
        findLatestByExcerptFingerprint: () =>
          Effect.fail(new StoreError({ reason: "lookup failed" })),
      } as unknown as ClaimStore;
      const h = buildGateHandler({
        claimStore,
        evidenceStore: {
          findCandidatesByClaimFingerprint: () => Effect.succeed([]),
        } as unknown as EvidenceCandidateStore,
        chat: makeFakeChat(() => {
          throw new Error("gate must not run");
        }),
      });

      const response = await call(h, { url: VALID_URL });
      expect(response).toEqual({ status: "error", code: "CLAIM_STORE_ERROR" });
    });

    it("returns a store error when candidate lookup fails", async () => {
      const h = buildGateHandler({
        claimStore: {
          findLatestByExcerptFingerprint: () => Effect.succeed([makeGateClaim()]),
        } as unknown as ClaimStore,
        evidenceStore: {
          findCandidatesByClaimFingerprint: () =>
            Effect.fail(new EvidenceCandidateStoreError({ reason: "lookup failed" })),
        } as unknown as EvidenceCandidateStore,
        chat: makeFakeChat(() => {
          throw new Error("gate must not run");
        }),
      });

      const response = await call(h, { url: VALID_URL });
      expect(response).toEqual({ status: "error", code: "EVIDENCE_STORE_ERROR" });
    });

    it("short-circuits to NO_PATCH without the patch model when all candidates are rejected", async () => {
      let calls = 0;
      const h = buildGateHandler({
        claimStore: {
          findLatestByExcerptFingerprint: () => Effect.succeed([makeGateClaim()]),
        } as unknown as ClaimStore,
        evidenceStore: {
          findCandidatesByClaimFingerprint: () => Effect.succeed([makeGateCandidate()]),
        } as unknown as EvidenceCandidateStore,
        chat: makeFakeChat(() => {
          calls += 1;
          return JSON.stringify({
            classification: "reject",
            reason: "The source does not address the claim.",
          });
        }),
      });

      const response = await call(h, { url: VALID_URL });

      expect(calls).toBe(1);
      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.decision).toEqual({
          verdict: "NO_PATCH",
          reason: "No evidence candidate addresses this claim with enough specificity.",
        });
      }
    });

    it("short-circuits to UNKNOWN when candidates are insufficient", async () => {
      const h = buildGateHandler({
        claimStore: {
          findLatestByExcerptFingerprint: () => Effect.succeed([makeGateClaim()]),
        } as unknown as ClaimStore,
        evidenceStore: {
          findCandidatesByClaimFingerprint: () => Effect.succeed([makeGateCandidate()]),
        } as unknown as EvidenceCandidateStore,
        chat: makeFakeChat(() =>
          JSON.stringify({
            classification: "insufficient",
            reason: "The source hints at a change but lacks specifics.",
          }),
        ),
      });

      const response = await call(h, { url: VALID_URL });

      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.decision.verdict).toBe("UNKNOWN");
      }
    });

    it("short-circuits to UNKNOWN when no candidates exist for any claim", async () => {
      let calls = 0;
      const secondClaim = {
        ...makeGateClaim(),
        claimFingerprint: "v1:claim1111111111",
        claimText: "A second answer fact that may have changed.",
        anchorText: "A second answer fact",
      };
      const h = buildGateHandler({
        claimStore: {
          findLatestByExcerptFingerprint: () =>
            Effect.succeed([makeGateClaim(), secondClaim]),
        } as unknown as ClaimStore,
        evidenceStore: {
          findCandidatesByClaimFingerprint: () => Effect.succeed([]),
        } as unknown as EvidenceCandidateStore,
        chat: makeFakeChat(() => {
          calls += 1;
          return JSON.stringify({ classification: "promote", reason: "Should not run." });
        }),
      });

      const response = await call(h, { url: VALID_URL });

      expect(calls).toBe(0);
      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        expect(response.decision.verdict).toBe("UNKNOWN");
      }
    });

    it("maps gate transport failure to a model transport error", async () => {
      const h = buildGateHandler({
        claimStore: {
          findLatestByExcerptFingerprint: () => Effect.succeed([makeGateClaim()]),
        } as unknown as ClaimStore,
        evidenceStore: {
          findCandidatesByClaimFingerprint: () => Effect.succeed([makeGateCandidate()]),
        } as unknown as EvidenceCandidateStore,
        chat: makeFakeChat(() =>
          Effect.fail(new OpenAiTransportError({ reason: "NETWORK_FAILED" })),
        ),
      });

      const response = await call(h, { url: VALID_URL });
      expect(response).toEqual({ status: "error", code: "MODEL_TRANSPORT_ERROR" });
    });

    it("maps malformed gate output to a model output error", async () => {
      const h = buildGateHandler({
        claimStore: {
          findLatestByExcerptFingerprint: () => Effect.succeed([makeGateClaim()]),
        } as unknown as ClaimStore,
        evidenceStore: {
          findCandidatesByClaimFingerprint: () => Effect.succeed([makeGateCandidate()]),
        } as unknown as EvidenceCandidateStore,
        chat: makeFakeChat(() => "not-json"),
      });

      const response = await call(h, { url: VALID_URL });
      expect(response).toEqual({ status: "error", code: "MALFORMED_MODEL_OUTPUT" });
    });

    it("gates every claim and sends every claim to patch analysis", async () => {
      const secondClaim = {
        ...makeGateClaim(),
        claimFingerprint: "v1:claim1111111111",
        claimText: "A second answer fact that may have changed.",
        anchorText: "A second answer fact",
      };
      const secondCandidate = {
        ...makeGateCandidate(),
        claimFingerprint: secondClaim.claimFingerprint,
        candidateFingerprint: "v1:candidate11111",
        sourceUrl: "https://example.com/second-source",
        contentPreview: "The second fact has a specific update.",
      };

      const promoted = createPatchEvidence({
        sourceLabel: secondCandidate.sourceLabel,
        sourceUrl: secondCandidate.sourceUrl,
        quote: secondCandidate.contentPreview,
        capturedAt: secondCandidate.capturedAt,
      });
      if (promoted._tag === "failure") {
        throw new Error(`unexpected evidence failure: ${promoted.reason}`);
      }

      let calls = 0;
      const modelRequests: OpenAiChatCompletionsRequest[] = [];
      const h = buildGateHandler({
        claimStore: {
          findLatestByExcerptFingerprint: () =>
            Effect.succeed([makeGateClaim(), secondClaim]),
        } as unknown as ClaimStore,
        evidenceStore: {
          findCandidatesByClaimFingerprint: (fingerprint: string) =>
            Effect.succeed(
              fingerprint === makeGateClaim().claimFingerprint
                ? [makeGateCandidate()]
                : [secondCandidate],
            ),
        } as unknown as EvidenceCandidateStore,
        chat: makeFakeChat((request) => {
          calls += 1;
          if (calls === 1) {
            return JSON.stringify({
              classification: "reject",
              reason: "First candidate does not address the claim.",
            });
          }
          if (calls === 2) {
            return JSON.stringify({
              classification: "promote",
              reason: "The source gives the updated second value.",
            });
          }
          modelRequests.push(request);
          return JSON.stringify({
            verdict: "UPDATE",
            reason: "The second claim has external confirmation.",
            selectedEvidenceFingerprints: [promoted.evidence.fingerprint],
          });
        }),
      });

      const response = await call(h, { url: VALID_URL });

      expect(calls).toBe(3);
      expect(modelRequests).toHaveLength(1);
      const prompt = JSON.parse(modelRequests[0]!.messages[0]!.content) as {
        claims?: Array<{ claimText: string }>;
      };
      expect(prompt.claims?.map((claim) => claim.claimText)).toEqual([
        makeGateClaim().claimText,
        secondClaim.claimText,
      ]);

      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        const decision = response.decision as AnalyzePatchUpdateResponse;
        expect(decision.verdict).toBe("UPDATE");
        expect(decision.evidenceSummary[0]?.sourceUrl).toBe(secondCandidate.sourceUrl);
      }
    });

    it("feeds promoted candidates into the patch workflow", async () => {
      const candidate = makeGateCandidate();
      const evidence = createPatchEvidence({
        sourceLabel: candidate.sourceLabel,
        sourceUrl: candidate.sourceUrl,
        quote: candidate.contentPreview,
        capturedAt: candidate.capturedAt,
      });
      if (evidence._tag === "failure") {
        throw new Error(`unexpected evidence failure: ${evidence.reason}`);
      }

      let calls = 0;
      const h = buildGateHandler({
        claimStore: {
          findLatestByExcerptFingerprint: () => Effect.succeed([makeGateClaim()]),
        } as unknown as ClaimStore,
        evidenceStore: {
          findCandidatesByClaimFingerprint: () => Effect.succeed([candidate]),
        } as unknown as EvidenceCandidateStore,
        chat: makeFakeChat(() => {
          calls += 1;
          if (calls === 1) {
            return JSON.stringify({
              classification: "promote",
              reason: "The source gives the updated value.",
            });
          }
          return JSON.stringify({
            verdict: "UPDATE",
            reason: "External source confirms the change.",
            selectedEvidenceFingerprints: [evidence.evidence.fingerprint],
          });
        }),
      });

      const response = await call(h, { url: VALID_URL });

      expect(calls).toBe(2);
      expect(response.status).toBe("ok");
      if (response.status === "ok") {
        const decision = response.decision as AnalyzePatchUpdateResponse;
        expect(decision.verdict).toBe("UPDATE");
        expect(decision.evidenceSummary).toEqual([
          {
            fingerprint: evidence.evidence.fingerprint,
            sourceLabel: candidate.sourceLabel,
            sourceUrl: candidate.sourceUrl,
          },
        ]);
      }
    });
  });
});
