/**
 * Zhihu direct-answer adapter — a domain-neutral interface to the Zhihu
 * chat-completions endpoint.
 *
 * The adapter owns request construction, header setup (Bearer + timestamp),
 * and response extraction.  It never exposes credentials, provider bodies,
 * or error causes.
 *
 * @module zhihu-direct-answer-adapter
 */

import { Data, Effect } from "effect";

// ── Transport types ─────────────────────────────────────────────────────────────

/**
 * Categories of failure inside the transport layer.  These never escape the
 * adapter — every transport failure is mapped to the public domain error type.
 */
export type ZhihuDirectAnswerTransportFailureReason =
  | "NETWORK_FAILED"
  | "HTTP_STATUS"
  | "NON_JSON_RESPONSE";

/**
 * Transport-level error.  Retains only the reason tag and optional HTTP status.
 */
export class ZhihuDirectAnswerTransportError extends Data.TaggedError(
  "ZhihuDirectAnswerTransportError",
)<{
  readonly reason: ZhihuDirectAnswerTransportFailureReason;
  readonly status?: number;
}> {}

/**
 * Concrete request handed to the transport.
 */
export interface ZhihuDirectAnswerTransportRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/**
 * Callable transport contract.
 */
export type ZhihuDirectAnswerTransport = (
  request: ZhihuDirectAnswerTransportRequest,
) => Effect.Effect<unknown, ZhihuDirectAnswerTransportError>;

// ── Domain error ───────────────────────────────────────────────────────────────

export class DirectAnswerError extends Data.TaggedError("DirectAnswerError")<{
  readonly reason: "TRANSPORT_FAILED" | "MALFORMED_RESPONSE";
}> {}

// ── Service interface ───────────────────────────────────────────────────────────

export interface ZhihuDirectAnswerCompletions {
  /**
   * Send a chat completion request and return the `content` from
   * `choices[0].message.content`.
   *
   * The request body contains ONLY `model` and `messages` (plus `stream`
   * if requested) — no provider-specific params, no credentials.
   */
  readonly complete: (request: {
    readonly model: string;
    readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
  }) => Effect.Effect<string, DirectAnswerError | ZhihuDirectAnswerTransportError>;
}

// ── Adapter options ────────────────────────────────────────────────────────────

export interface ZhihuDirectAnswerOptions {
  readonly accessSecret: string;
  readonly transport: ZhihuDirectAnswerTransport;
  readonly model: string;
  readonly baseUrl?: string;
  readonly now?: () => Effect.Effect<number, never>;
}

// ── Implementation ─────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "https://developer.zhihu.com";

export const makeZhihuDirectAnswerCompletions = (
  options: ZhihuDirectAnswerOptions,
): ZhihuDirectAnswerCompletions => {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const clockNow = options.now ?? (() => Effect.sync(() => Date.now()));

  return {
    complete: (request) =>
      Effect.flatMap(clockNow(), (millis) => {
        const timestampSeconds = Math.floor(millis / 1000);

        const url = `${baseUrl}/v1/chat/completions`;

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Request-Timestamp": String(timestampSeconds),
          Authorization: `Bearer ${options.accessSecret}`,
        };

        const body = JSON.stringify({
          model: options.model,
          messages: request.messages,
        });

        return options
          .transport({
            url,
            method: "POST",
            headers: Object.freeze(headers),
            body,
          })
          .pipe(
            Effect.mapError((t: unknown): ZhihuDirectAnswerTransportError =>
              t instanceof ZhihuDirectAnswerTransportError
                ? t
                : new ZhihuDirectAnswerTransportError({ reason: "NETWORK_FAILED" }),
            ),
            Effect.flatMap((result) => {
              // Validate the response envelope.
              if (typeof result !== "object" || result === null || Array.isArray(result)) {
                return Effect.fail(new DirectAnswerError({ reason: "MALFORMED_RESPONSE" }));
              }

              const envelope = result as Record<string, unknown>;
              const choices = envelope.choices;
              if (!Array.isArray(choices) || choices.length === 0) {
                return Effect.fail(new DirectAnswerError({ reason: "MALFORMED_RESPONSE" }));
              }

              const firstChoice = choices[0];
              if (
                typeof firstChoice !== "object" ||
                firstChoice === null ||
                Array.isArray(firstChoice)
              ) {
                return Effect.fail(new DirectAnswerError({ reason: "MALFORMED_RESPONSE" }));
              }

              const message = (firstChoice as Record<string, unknown>).message;
              if (typeof message !== "object" || message === null || Array.isArray(message)) {
                return Effect.fail(new DirectAnswerError({ reason: "MALFORMED_RESPONSE" }));
              }

              const content = (message as Record<string, unknown>).content;
              if (typeof content !== "string") {
                return Effect.fail(new DirectAnswerError({ reason: "MALFORMED_RESPONSE" }));
              }

              return Effect.succeed(content);
            }),
          );
      }),
  };
};

// ── Fetch transport helper ──────────────────────────────────────────────────────

interface FetchLikeResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  readonly headers: { get(name: string): string | null };
}

export interface FetchZhihuDirectAnswerTransportOptions {
  readonly fetch?: (
    input: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => Promise<FetchLikeResponse>;
  readonly timeoutMs: number;
}

/**
 * Wrap the global (or injected) `fetch` in the transport contract.
 * Simple pass-through — no retries, no logging.
 */
export const makeFetchZhihuDirectAnswerTransport = (
  options: FetchZhihuDirectAnswerTransportOptions,
): ZhihuDirectAnswerTransport => {
  const fetcher = options.fetch ?? fetch;

  return (request) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetcher(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: AbortSignal.timeout(options.timeoutMs),
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
          const { reason, status } = thrown as {
            reason: "HTTP_STATUS";
            status: number;
          };
          return new ZhihuDirectAnswerTransportError({ reason, status });
        }

        if (
          typeof thrown === "object" &&
          thrown !== null &&
          "reason" in thrown &&
          (thrown as { reason: unknown }).reason === "NON_JSON_RESPONSE"
        ) {
          return new ZhihuDirectAnswerTransportError({ reason: "NON_JSON_RESPONSE" });
        }

        if (thrown instanceof Error) {
          return new ZhihuDirectAnswerTransportError({ reason: "NETWORK_FAILED" });
        }

        return new ZhihuDirectAnswerTransportError({ reason: "NETWORK_FAILED" });
      },
    }).pipe(
      Effect.flatMap((result) =>
        typeof result === "object" && result !== null && !Array.isArray(result)
          ? Effect.succeed(result)
          : Effect.fail(new ZhihuDirectAnswerTransportError({ reason: "NON_JSON_RESPONSE" })),
      ),
    );
};
