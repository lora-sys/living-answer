import { Effect } from "effect";
import { parseZhihuAnswerUrl } from "../lib/zhihu-answer-url";

import {
  makeFetchZhihuSearchTransport,
  makeZhihuSearchItemsFetcher,
} from "../lib/zhihu-search-adapter";

import {
  makeAnswerExcerptProvider,
  type AnswerExcerptProvider,
} from "../lib/answer-excerpt-provider";

import {
  makeOpenAiChatCompletions,
  makeFetchOpenAiTransport,
  type OpenAiChatCompletions,
} from "../lib/openai-adapter";

import { extractClaims } from "../lib/claim-extraction-workflow";

import { makeSqliteClaimStore, type ClaimStore } from "../lib/claim-store";

import * as response from "./extract-answer-claims-response";

export type { ExtractAnswerClaimsResponse } from "./extract-answer-claims-response";

import { createServerFn } from "@tanstack/react-start";

import { makeSqliteExcerptStore, type ExcerptStore } from "../lib/excerpt-store";

// ═══════════════════════════════════════════════════════════════════════════════
// Handler factory (testable — receives injected dependencies)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Server handler input.
 */
export interface ExtractAnswerClaimsInput {
  readonly url: string;
}

/**
 * Boundary dependencies injected at construction.  Tests supply fakes; the
 * production wiring supplies the real transport, credential reader, and stores.
 */
export interface ExtractAnswerClaimsDeps {
  /**
   * Read the two secrets.  Returns `[openAiApiKey, zhihuSecret]`, either of
   * which may be `undefined` when the credential is absent.
   */
  readonly getSecret: () => readonly [string | undefined, string | undefined];

  /**
   * Create an AnswerExcerptProvider instance, called with the Zhihu secret.
   */
  readonly createProvider: (secret: string) => Promise<AnswerExcerptProvider>;

  /**
   * Create the OpenAI chat completions service, called with the API key.
   */
  readonly createChat: (apiKey: string) => OpenAiChatCompletions;

  /**
   * Create a ClaimStore instance.  Tests supply an in-memory/fake store;
   * production uses SQLite under `.local/`.
   */
  readonly createClaimStore: () => Promise<ClaimStore>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Input validation
// ═══════════════════════════════════════════════════════════════════════════════

const validateInput = (input: unknown): ExtractAnswerClaimsInput => {
  if (typeof input !== "object" || input === null || !("url" in input)) {
    return { url: "" };
  }

  const raw = input as Record<string, unknown>;
  const url = typeof raw.url === "string" ? raw.url : "";
  return { url };
};

// ═══════════════════════════════════════════════════════════════════════════════
// Async handler
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Async handler that extracts candidate claims from a persisted AnswerExcerpt.
 *
 * Runs entirely through injected dependencies; no env reads, no network calls
 * in the handler body itself.
 */
export const createExtractAnswerClaimsHandler =
  (deps: ExtractAnswerClaimsDeps) =>
  async (input: ExtractAnswerClaimsInput): Promise<response.ExtractAnswerClaimsResponse> => {
    // ── Step 1: validate request shape ─────────────────────────────────────
    if (typeof input?.url !== "string" || input.url.trim() === "") {
      return response.errorResponse("INVALID_REQUEST");
    }

    const trimmedUrl = input.url.trim();

    // ── Step 2: parse and validate URL ─────────────────────────────────────
    const urlResult = parseZhihuAnswerUrl(trimmedUrl);
    if (urlResult._tag === "failure") {
      return response.errorResponse("UNSUPPORTED_ANSWER_URL");
    }

    // ── Step 3: read credentials ─────────────────────────────────────────────
    const [openAiKey, zhihuSecret] = deps.getSecret();
    if (typeof openAiKey !== "string" || openAiKey.trim() === "") {
      return response.errorResponse("MISSING_OPENAI_KEY");
    }
    if (typeof zhihuSecret !== "string" || zhihuSecret.trim() === "") {
      return response.errorResponse("MISSING_ACCESS_SECRET");
    }

    // ── Step 4: resolve excerpt through provider ─────────────────────────────
    let provider: AnswerExcerptProvider;
    try {
      provider = await deps.createProvider(zhihuSecret);
    } catch {
      return response.errorResponse("PROVIDER_ERROR");
    }

    const providerExit = await Effect.runPromiseExit(provider.resolve(trimmedUrl));
    if (providerExit._tag !== "Success") {
      if (providerExit.cause._tag === "Fail") {
        const error = providerExit.cause.error as Error & { _tag?: string };
        switch (error._tag) {
          case "AnswerNotFoundProviderError":
            return response.errorResponse("ANSWER_NOT_FOUND");
          case "InvalidProviderAnswerError":
            return response.errorResponse("INVALID_PROVIDER_ANSWER");
          case "UnsupportedAnswerUrlError":
            return response.errorResponse("UNSUPPORTED_ANSWER_URL");
          case "AnswerExcerptProviderError":
          default:
            return response.errorResponse("PROVIDER_ERROR");
        }
      }
      return response.errorResponse("PROVIDER_ERROR");
    }

    const excerpt = providerExit.value;

    // ── Step 5: create OpenAI chat service ──────────────────────────────────
    const chat: OpenAiChatCompletions = deps.createChat(openAiKey);

    // ── Step 6: run claim extraction workflow ────────────────────────────────
    const clock = { now: (): Effect.Effect<number, never> => Effect.succeed(Date.now()) };

    const workflowExit = await Effect.runPromiseExit(extractClaims({ chat, clock })({ excerpt }));

    if (workflowExit._tag !== "Success") {
      if (workflowExit.cause._tag === "Fail") {
        const err = workflowExit.cause.error as { reason: string };
        // Map domain workflow errors to stable server codes without
        // exposing internal details.
        switch (err.reason) {
          case "TRANSPORT_FAILED":
            return response.errorResponse("PROVIDER_ERROR");
          default:
            return response.errorResponse("PROVIDER_ERROR");
        }
      }
      return response.errorResponse("PROVIDER_ERROR");
    }

    const claims = workflowExit.value;

    // ── Step 7: persist claim set ───────────────────────────────────────────
    let claimStore: ClaimStore;
    try {
      claimStore = await deps.createClaimStore();
    } catch {
      return response.errorResponse("CLAIM_STORE_ERROR");
    }

    const saveExit = await Effect.runPromiseExit(
      claimStore.saveClaimSet(excerpt.fingerprint, claims),
    );
    if (saveExit._tag === "Failure") {
      return response.errorResponse("CLAIM_STORE_ERROR");
    }

    // ── Step 8: return JSON-safe response ───────────────────────────────────
    return response.okResponse(claims);
  };

// ═══════════════════════════════════════════════════════════════════════════════
// Production wiring (reads process.env only here)
// ═══════════════════════════════════════════════════════════════════════════════

const FIVE_SECONDS_MS = 5_000 as const;
const CLAIM_EXTRACTION_TIMEOUT_MS = 40_000 as const;

/**
 * Lazy singleton store + provider for the server process.
 */
let storeInstance: Promise<ExcerptStore> | null = null;
let cachedProvider: Promise<AnswerExcerptProvider> | null = null;

const getOrCreateProvider = async (secret: string): Promise<AnswerExcerptProvider> => {
  if (!storeInstance) {
    storeInstance = Effect.runPromise(makeSqliteExcerptStore());
  }
  if (!cachedProvider) {
    const store = await storeInstance;
    cachedProvider = Effect.runPromise(
      makeAnswerExcerptProvider({
        fetchItems: makeZhihuSearchItemsFetcher({
          accessSecret: secret,
          transport: makeFetchZhihuSearchTransport({
            fetch: fetch,
            timeoutMs: FIVE_SECONDS_MS,
          }),
        }),
        ttl: 60_000,
        store,
      }),
    );
  }
  return cachedProvider;
};

/**
 * TanStack Start server function that extracts candidate claims from a
 * persisted AnswerExcerpt.
 *
 * Reads `OPENAI_API_KEY` and `ZHIHU_ACCESS_SECRET` from env.
 * The response is a plain JSON-safe discriminated union.
 */
export const extractAnswerClaims = createServerFn({
  method: "POST",
})
  .validator(validateInput)
  .handler(async ({ data }) => {
    const openAiModel = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const openAiBaseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

    return createExtractAnswerClaimsHandler({
      getSecret: () => [process.env.OPENAI_API_KEY, process.env.ZHIHU_ACCESS_SECRET] as const,
      createChat: (apiKey) =>
        makeOpenAiChatCompletions({
          apiKey,
          model: openAiModel,
          baseUrl: openAiBaseUrl,
          timeoutMs: CLAIM_EXTRACTION_TIMEOUT_MS,
          transport: makeFetchOpenAiTransport({
            fetch: fetch,
            timeoutMs: CLAIM_EXTRACTION_TIMEOUT_MS,
          }),
        }),
      createProvider: getOrCreateProvider,
      createClaimStore: () => Effect.runPromise(makeSqliteClaimStore(".local/claims.db")),
    })(data);
  });
