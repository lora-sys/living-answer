import { Effect } from "effect";
import {
  makeFetchZhihuSearchTransport,
  makeZhihuSearchItemsFetcher,
} from "../lib/zhihu-search-adapter";
import {
  makeAnswerExcerptProvider,
  type AnswerExcerptProvider,
} from "../lib/answer-excerpt-provider";
import {
  errorResponse,
  okResponse,
  toServerFailureCode,
  type ResolveAnswerExcerptResponse,
} from "./answer-excerpt-response";
import { createServerFn } from "@tanstack/react-start";

// ═══════════════════════════════════════════════════════════════════════════════
// Handler factory (testable — receives injected dependencies)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Server handler input.
 */
export interface ResolveAnswerExcerptInput {
  readonly url: string;
}

/**
 * Boundary dependencies injected at construction.  Tests supply fakes; the
 * production wiring supplies the real transport and credential reader.
 */
export interface ResolveAnswerExcerptDeps {
  /**
   * Read the access secret.  Returns undefined when the credential is absent.
   */
  readonly getSecret: () => string | undefined;

  /**
   * Create a provider instance.  Called once per handler to enable a lazy
   * singleton cache.
   */
  readonly createProvider: (secret: string) => Promise<AnswerExcerptProvider>;
}

/**
 * Async handler that resolves an answer excerpt from a Zhihu answer URL.
 */
export const createResolveAnswerExcerptHandler =
  (deps: ResolveAnswerExcerptDeps) =>
  async (input: ResolveAnswerExcerptInput): Promise<ResolveAnswerExcerptResponse> => {
    // ── Step 1: validate request shape ───────────────────────────────────
    if (typeof input?.url !== "string" || input.url.trim() === "") {
      return errorResponse("INVALID_REQUEST");
    }

    // ── Step 2: read credential ──────────────────────────────────────────
    const secret = deps.getSecret();
    if (typeof secret !== "string" || secret.trim() === "") {
      return errorResponse("MISSING_ACCESS_SECRET");
    }

    // ── Step 3: create provider (lazy singleton) ─────────────────────────
    //
    // The provider holds a query cache.  In a long-lived server process,
    // keeping a single instance preserves the cache across requests without
    // any cross-request storage outside process memory.
    let provider: AnswerExcerptProvider;
    try {
      provider = await deps.createProvider(secret);
    } catch {
      return errorResponse("PROVIDER_ERROR");
    }

    // ── Step 4: resolve through provider ─────────────────────────────────
    const exit = await Effect.runPromiseExit(provider.resolve(input.url));
    if (exit._tag === "Success") {
      return okResponse(exit.value);
    }

    if (exit.cause._tag !== "Fail") {
      return errorResponse("PROVIDER_ERROR");
    }

    return errorResponse(toServerFailureCode(exit.cause.error));
  };

// ═══════════════════════════════════════════════════════════════════════════════
// Production wiring (reads process.env only here)
// ═══════════════════════════════════════════════════════════════════════════════

const FIVE_SECONDS_MS = 5_000 as const;

/**
 * Lazy singleton provider for the server process.
 */
let cachedProvider: Promise<AnswerExcerptProvider> | null = null;

const getOrCreateProvider = async (secret: string): Promise<AnswerExcerptProvider> => {
  if (!cachedProvider) {
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
      }),
    );
  }
  return cachedProvider;
};

const parseInput = (input: unknown): ResolveAnswerExcerptInput => {
  if (typeof input !== "object" || input === null || !("url" in input)) {
    return { url: "" };
  }

  const value = (input as { url: unknown }).url;
  return { url: typeof value === "string" ? value : "" };
};

/**
 * TanStack Start server function that resolves a Zhihu answer excerpt.
 *
 * Reads the access secret from `process.env.ZHIHU_ACCESS_SECRET`.
 * The response is a plain JSON-safe discriminated union.
 */
export const resolveAnswerExcerpt = createServerFn({
  method: "POST",
})
  .validator(parseInput)
  .handler(async ({ data }) => {
    return createResolveAnswerExcerptHandler({
      getSecret: () => process.env.ZHIHU_ACCESS_SECRET,
      createProvider: getOrCreateProvider,
    })(data);
  });
