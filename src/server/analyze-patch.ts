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

import { analyzePatch as runPatchAnalysis } from "../lib/patch-analysis-workflow";

import { createUserSuppliedContext, type UserSuppliedContext } from "../lib/user-supplied-context";

import { createPatchProposal, type PatchProposal } from "../lib/patch-proposal";

import { createPatchEvidence } from "../lib/patch-evidence";

import type { AnswerExcerpt } from "../lib/answer-excerpt";

import {
  errorResponse,
  okResponse,
  type AnalyzePatchServerFailureCode,
  toPatchAnalysisFailureCode,
  type AnalyzePatchResponse,
} from "./analyze-patch-response";

import { PatchAnalysisError } from "../lib/patch-analysis-workflow";

import { createServerFn } from "@tanstack/react-start";

import { makeSqliteExcerptStore, type ExcerptStore } from "../lib/excerpt-store";

// ═══════════════════════════════════════════════════════════════════════════════
// Handler factory (testable — receives injected dependencies)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Server handler input.
 */
export interface AnalyzePatchServerInput {
  readonly url: string;
  readonly context?: string;
}

/**
 * Boundary dependencies injected at construction.  Tests supply fakes; the
 * production wiring supplies the real transport and credential reader.
 */
export interface AnalyzePatchDeps {
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
}

// ═══════════════════════════════════════════════════════════════════════════════
// Input validation
// ═══════════════════════════════════════════════════════════════════════════════

const validateInput = (input: unknown): AnalyzePatchServerInput => {
  if (typeof input !== "object" || input === null) {
    return { url: "" };
  }

  const raw = input as Record<string, unknown>;
  const url = typeof raw.url === "string" ? raw.url : "";
  const context = typeof raw.context === "string" ? raw.context : undefined;

  return { url, context };
};

/**
 * Parse and validate the Zhihu answer URL.
 * Returns parsed fields on success or a failure code on any parse error.
 */
const validateUrl = (
  url: string,
):
  | {
      readonly _tag: "success";
      readonly questionId: string;
      readonly answerId: string;
      readonly canonicalUrl: string;
    }
  | { readonly _tag: "failure"; readonly code: AnalyzePatchServerFailureCode } => {
  const urlResult = parseZhihuAnswerUrl(url);
  if (urlResult._tag === "failure") {
    return {
      _tag: "failure",
      code: "UNSUPPORTED_ANSWER_URL",
    };
  }

  return {
    _tag: "success",
    questionId: urlResult.questionId,
    answerId: urlResult.answerId,
    canonicalUrl: urlResult.canonicalUrl,
  };
};

// ═══════════════════════════════════════════════════════════════════════════════
// Domain record creation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a client-supplied context record when the user provided maintenance notes.
 */
const createContextRecord = (
  questionId: string,
  answerId: string,
  contextText: string,
  excerpt: AnswerExcerpt,
): UserSuppliedContext | undefined => {
  const result = createUserSuppliedContext({
    questionId,
    answerId,
    contextText,
    capturedAt: excerpt.capturedAt,
  });

  if (result._tag === "failure") {
    // Defensive: should not happen for validated input
    return undefined;
  }

  return result.context;
};

/**
 * Compute a deterministic "virtual snapshot" fingerprint from answer identity
 * fields.  Slice 4 has no AnswerSnapshot domain record, but the workflow
 * requires a valid answerSnapshotFingerprint on the proposal.
 */
const computeAnswerSnapshotFingerprint = (
  questionId: string,
  answerId: string,
  sourceContentId: string,
  sourceEditTime: number,
): string => {
  const material = `snapshot:${questionId}:${answerId}:${sourceContentId}:${sourceEditTime}`;

  // Inline FNV-1a 64-bit — same algorithm used throughout the domain.
  let h64 = 14695981039346656037n;
  const fnvPrime = 1099511628211n;
  for (let i = 0; i < material.length; i++) {
    h64 ^= BigInt(material.charCodeAt(i));
    h64 *= fnvPrime;
  }

  const mask = 0xffffffffn;
  const high = Number((h64 >> 32n) & mask);
  const low = Number(h64 & mask);
  const hex = high.toString(16).padStart(8, "0") + low.toString(16).padStart(8, "0");

  return `v1:${hex}`;
};

/**
 * Build the PatchProposal for the analysis workflow.
 *
 * The proposedBody is the excerpt text (a stub per the plan rationale).
 * The server never surfaces proposedBody in the response.
 */
const createProposalRecord = (
  excerpt: AnswerExcerpt,
  contextFingerprint: string | undefined = ABSENT_CONTEXT_FINGERPRINT,
): PatchProposal => {
  const result = createPatchProposal({
    proposedBody: excerpt.excerpt,
    answerSnapshotFingerprint: computeAnswerSnapshotFingerprint(
      excerpt.questionId,
      excerpt.answerId,
      excerpt.sourceContentId,
      excerpt.sourceEditTime,
    ),
    contextFingerprint: contextFingerprint ?? "",
    capturedAt: excerpt.capturedAt,
  });

  if (result._tag === "failure") {
    // Defensive: proposal creation should not fail under normal conditions.
    throw new Error(`ANALYSIS_INVARIANT_VIOLATION: ${result.reason}`);
  }

  return result.proposal;
};

/**
 * Build the evidence array for the analysis workflow.
 *
 * For Slice 4, evidence is derived from the answer excerpt only.
 * The canonical URL serves as the sourceUrl.
 */
const createEvidenceRecords = (
  excerpt: AnswerExcerpt,
  canonicalUrl: string,
): readonly import("../lib/patch-evidence").PatchEvidence[] => {
  const result = createPatchEvidence({
    sourceLabel: excerpt.sourceContentType === "Answer" ? "知乎回答原文" : "来源",
    sourceUrl: canonicalUrl,
    quote: excerpt.excerpt,
    capturedAt: excerpt.capturedAt,
  });

  if (result._tag === "failure") {
    throw new Error(`ANALYSIS_INVARIANT_VIOLATION: ${result.reason}`);
  }

  return [result.evidence];
};

// ═══════════════════════════════════════════════════════════════════════════════
// Handler factory
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Async handler that analyzes whether a Zhihu answer needs a patch update.
 *
 * Runs entirely through injected dependencies; no env reads, no network calls
 * in the handler body itself.
 */
export const createAnalyzePatchHandler =
  (deps: AnalyzePatchDeps) =>
  async (input: AnalyzePatchServerInput): Promise<AnalyzePatchResponse> => {
    // ── Step 1: validate request shape ─────────────────────────────────────
    if (typeof input?.url !== "string" || input.url.trim() === "") {
      return errorResponse("INVALID_REQUEST");
    }

    const trimmedUrl = input.url.trim();
    const trimmedContext = typeof input.context === "string" ? input.context.trim() : undefined;

    // ── Step 2: parse and validate URL ───────────────────────────────────────
    const urlValidation = validateUrl(trimmedUrl);
    if (urlValidation._tag === "failure") {
      return errorResponse(urlValidation.code);
    }

    // ── Step 3: read credentials ─────────────────────────────────────────────
    const [openAiKey, zhihuSecret] = deps.getSecret();
    if (typeof openAiKey !== "string" || openAiKey.trim() === "") {
      return errorResponse("MISSING_OPENAI_KEY");
    }
    if (typeof zhihuSecret !== "string" || zhihuSecret.trim() === "") {
      return errorResponse("MISSING_OPENAI_KEY");
    }

    // ── Step 4: resolve excerpt through provider ─────────────────────────────
    let provider: AnswerExcerptProvider;
    try {
      provider = await deps.createProvider(zhihuSecret);
    } catch {
      return errorResponse("PROVIDER_ERROR");
    }

    const providerExit = await Effect.runPromiseExit(provider.resolve(trimmedUrl));
    if (providerExit._tag !== "Success") {
      if (providerExit.cause._tag === "Fail") {
        const error = providerExit.cause.error as Error & { _tag?: string };
        switch (error._tag) {
          case "AnswerNotFoundProviderError":
            return errorResponse("ANSWER_NOT_FOUND");
          case "AmbiguousAnswerProviderError":
            return errorResponse("AMBIGUOUS_ANSWER");
          case "InvalidProviderAnswerError":
            return errorResponse("INVALID_PROVIDER_ANSWER");
          case "UnsupportedAnswerUrlError":
            return errorResponse("UNSUPPORTED_ANSWER_URL");
          case "AnswerExcerptProviderError":
          default:
            return errorResponse("PROVIDER_ERROR");
        }
      }
      return errorResponse("PROVIDER_ERROR");
    }

    const excerpt = providerExit.value;

    // ── Step 5: build domain records ─────────────────────────────────────────
    const context = trimmedContext
      ? createContextRecord(
          urlValidation.questionId,
          urlValidation.answerId,
          trimmedContext,
          excerpt,
        )
      : undefined;

    const contextFingerprint = context?.fingerprint;
    const evidence = createEvidenceRecords(excerpt, urlValidation.canonicalUrl);
    const proposal = createProposalRecord(excerpt, contextFingerprint);

    // ── Step 6: run the analysis workflow ────────────────────────────────────
    const chat = deps.createChat(openAiKey);

    const workflowExit = await Effect.runPromiseExit(
      runPatchAnalysis({ chat })({
        proposal,
        evidence,
        context,
        excerpt,
      }),
    );

    if (workflowExit._tag !== "Success") {
      if (workflowExit.cause._tag === "Fail") {
        const err = workflowExit.cause.error as PatchAnalysisError;
        // Defensive: never expose a Data.TaggedError instance in the response.
        return errorResponse(toPatchAnalysisFailureCode(err));
      }
      return errorResponse("ANALYSIS_INVARIANT_VIOLATION");
    }

    // ── Step 7: map decision to JSON-safe response ───────────────────────────
    return okResponse(workflowExit.value, evidence);
  };

// ═══════════════════════════════════════════════════════════════════════════════
// Production wiring (reads process.env only here)
// ═══════════════════════════════════════════════════════════════════════════════

const FIVE_SECONDS_MS = 5_000 as const;

/**
 * Stable domain-record marker for requests without user-supplied context.
 * The workflow currently requires a proposal context fingerprint, while the
 * public input treats context as optional.
 */
const ABSENT_CONTEXT_FINGERPRINT = "v1:0000000000000000" as const;

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
 * TanStack Start server function that analyzes whether a Zhihu answer
 * needs a patch update.
 *
 * Reads `OPENAI_API_KEY` and `ZHIHU_ACCESS_SECRET` from env.
 * The response is a plain JSON-safe discriminated union.
 */
export const analyzePatch = createServerFn({
  method: "POST",
})
  .validator(validateInput)
  .handler(async ({ data }) => {
    return createAnalyzePatchHandler({
      getSecret: () => [process.env.OPENAI_API_KEY, process.env.ZHIHU_ACCESS_SECRET] as const,
      createChat: (apiKey) =>
        makeOpenAiChatCompletions({
          apiKey,
          model: "patch-analysis",
          baseUrl: "https://api.openai.com/v1",
          timeoutMs: FIVE_SECONDS_MS,
          transport: makeFetchOpenAiTransport({
            fetch: fetch,
            timeoutMs: FIVE_SECONDS_MS,
          }),
        }),
      createProvider: getOrCreateProvider,
    })(data);
  });
