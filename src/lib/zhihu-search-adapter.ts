import { Clock, Data, Duration, Effect } from "effect";

import type { AnswerExcerptItemsFetcher } from "./answer-excerpt-provider";
import { AnswerExcerptProviderError } from "./answer-excerpt-provider";

// ── Transport types ─────────────────────────────────────────────────────────────

/**
 * Categories of failure inside the transport layer.  These never escape the
 * adapter — every transport failure is mapped to the public provider error
 * type before returning.
 */
export type ZhihuSearchTransportFailureReason =
  | "NETWORK_FAILED"
  | "HTTP_STATUS"
  | "NON_JSON_RESPONSE";

/**
 * Transport-level error.  Only the tag, reason code, and optional HTTP status
 * are retained — response bodies and credentials are never exposed.
 */
export class ZhihuSearchTransportError extends Data.TaggedError("ZhihuSearchTransportError")<{
  readonly reason: ZhihuSearchTransportFailureReason;
  readonly status?: number;
}> {}

/**
 * Concrete request handed to the transport.  The transport has no knowledge
 * of `AnswerExcerpt` or any provider concept — it receives a URL + headers.
 */
export interface ZhihuSearchTransportRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Callable transport.  Accepts the request blueprint and returns parsed JSON.
 * An effect so callers can swap in test doubles without touching the real
 * network.
 */
export type ZhihuSearchTransport = (
  request: ZhihuSearchTransportRequest,
) => Effect.Effect<unknown, ZhihuSearchTransportError>;

// ── Adapter types ──────────────────────────────────────────────────────────────

export interface ZhihuSearchAdapterOptions {
  readonly accessSecret: string;
  readonly transport: ZhihuSearchTransport;
  readonly now?: () => Effect.Effect<number, never>;
  readonly baseUrl?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const hasItems = (
  result: unknown,
):
  | { readonly _tag: "success"; readonly items: readonly unknown[] }
  | { readonly _tag: "failure"; readonly error: AnswerExcerptProviderError } => {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return {
      _tag: "failure" as const,
      error: new AnswerExcerptProviderError({
        reason: "zhihu_search response is not a JSON object",
      }),
    };
  }

  const envelope = result as Record<string, unknown>;

  if (typeof envelope.Code !== "number") {
    return {
      _tag: "failure" as const,
      error: new AnswerExcerptProviderError({
        reason: "response envelope missing numeric Code",
      }),
    };
  }

  if (envelope.Code !== 0) {
    return {
      _tag: "failure" as const,
      error: new AnswerExcerptProviderError({
        reason: `zhihu_search returned non-zero code: ${String(envelope.Code)}`,
      }),
    };
  }

  const data = envelope.Data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {
      _tag: "failure" as const,
      error: new AnswerExcerptProviderError({
        reason: "response envelope Data is missing or not an object",
      }),
    };
  }

  const items = (data as Record<string, unknown>).Items;
  if (!Array.isArray(items)) {
    return {
      _tag: "failure" as const,
      error: new AnswerExcerptProviderError({
        reason: "response Data.Items is missing or not an array",
      }),
    };
  }

  return { _tag: "success" as const, items: items as readonly unknown[] };
};

// ── Items fetcher ──────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "https://developer.zhihu.com";

/**
 * Factory that creates an {@link AnswerExcerptItemsFetcher} backed by a
 * Zhihu `zhihu_search` request.
 *
 * The adapter owns request construction and envelope validation.  All
 * transport-level and API-level failures are mapped to
 * {@link AnswerExcerptProviderError} — the public provider failure
 * taxonomy does not widen.
 */
export const makeZhihuSearchItemsFetcher = (
  options: ZhihuSearchAdapterOptions,
): AnswerExcerptItemsFetcher => {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const clockNow = options.now ?? (() => Clock.currentTimeMillis);
  const blankCredentialFailure = options.accessSecret
    ? undefined
    : (Effect.fail(
        new AnswerExcerptProviderError({ reason: "accessSecret must not be blank" }),
      ) as Effect.Effect<never, AnswerExcerptProviderError>);

  return (request) =>
    blankCredentialFailure ??
    Effect.flatMap(clockNow(), (millis) => {
      const timestampSeconds = Math.floor(millis / 1000);

      const url = `${baseUrl}/api/v1/content/zhihu_search?Query=${encodeURIComponent(request.canonicalUrl)}`;

      const headers: Record<string, string> = {
        "X-Request-Timestamp": String(timestampSeconds),
        Authorization: `Bearer ${options.accessSecret}`,
      };
      return options
        .transport({ url, headers: Object.freeze(headers) })
        .pipe(
          // Map transport-level errors to the public provider error type.
          Effect.mapError(
            (transportError: ZhihuSearchTransportError) =>
              new AnswerExcerptProviderError({
                reason: `transport ${transportError.reason}${transportError.status !== undefined ? ` (status: ${transportError.status})` : ""}`,
              }),
          ),
        )
        .pipe(
          Effect.flatMap((result) => {
            const validated = hasItems(result);
            if (validated._tag === "failure") {
              return Effect.fail(validated.error);
            }
            return Effect.succeed(validated.items);
          }),
        );
    });
};

// ── Fetch transport helper ─────────────────────────────────────────────────────

export interface FetchZhihuSearchTransportOptions {
  readonly fetch?: typeof fetch;
  readonly timeoutMs: Duration.DurationInput;
}

/**
 * Wrap the global (or injected) `fetch` in the {@link ZhihuSearchTransport}
 * contract.  This is a simple pass-through — no retries, no logging.
 */
export const makeFetchZhihuSearchTransport = (
  options: FetchZhihuSearchTransportOptions,
): ZhihuSearchTransport => {
  const fetcher = options.fetch ?? fetch;

  return (request) =>
    Effect.tryPromise({
      try: async () => {
        const timeoutMs = Duration.toMillis(Duration.decode(options.timeoutMs));
        const response = await fetcher(request.url, {
          method: "GET",
          headers: request.headers,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          throw {
            reason: "HTTP_STATUS" as const,
            status: response.status,
          };
        }

        const text = await response.text();
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw { reason: "NON_JSON_RESPONSE" as const };
        }
      },
      catch: (thrown) => {
        if (
          typeof thrown === "object" &&
          thrown !== null &&
          "reason" in thrown &&
          (thrown as { reason: unknown }).reason === "HTTP_STATUS"
        ) {
          const { reason, status } = thrown as { reason: "HTTP_STATUS"; status: number };
          return new ZhihuSearchTransportError({ reason, status });
        }

        if (
          typeof thrown === "object" &&
          thrown !== null &&
          "reason" in thrown &&
          (thrown as { reason: unknown }).reason === "NON_JSON_RESPONSE"
        ) {
          return new ZhihuSearchTransportError({ reason: "NON_JSON_RESPONSE" });
        }

        if (thrown instanceof Error) {
          // AbortSignal.timeout throws a DOMException (AbortError).
          return new ZhihuSearchTransportError({ reason: "NETWORK_FAILED" });
        }

        return new ZhihuSearchTransportError({ reason: "NETWORK_FAILED" });
      },
    }).pipe(
      Effect.flatMap((result) =>
        typeof result === "object" && result !== null && !Array.isArray(result)
          ? Effect.succeed(result)
          : Effect.fail(new ZhihuSearchTransportError({ reason: "NON_JSON_RESPONSE" })),
      ),
    );
};
