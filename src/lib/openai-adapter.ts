import { Data, Duration, Effect, Schedule } from "effect";

// ── Transport types ─────────────────────────────────────────────────────────────

/**
 * `EMPTY_CONTENT` is its own reason because the envelope is perfectly valid:
 * the provider answered with no message text.  Reasoning models do this
 * intermittently, and callers that then parse JSON see a syntax error, which
 * hides a transient transport problem as a model-quality problem.
 */
export type OpenAiTransportFailureReason =
  | "NETWORK_FAILED"
  | "HTTP_STATUS"
  | "NON_JSON_RESPONSE"
  | "EMPTY_CONTENT";

export class OpenAiTransportError extends Data.TaggedError("OpenAiTransportError")<{
  readonly reason: OpenAiTransportFailureReason;
  readonly status?: number;
}> {}

/**
 * A compact, credential-free description for logs and eval traces.  Callers
 * that map a transport failure into their own domain error need to keep the
 * underlying reason and status, otherwise a 429, a timeout and a 500 all
 * arrive as the same opaque "TRANSPORT_FAILED".
 */
export const describeTransportError = (error: unknown): string => {
  if (error instanceof OpenAiTransportError) {
    return `${error.reason}${error.status === undefined ? "" : `:${error.status}`}`;
  }
  if (error instanceof Error) return `${error.name}:${error.message}`;
  return String(error);
};

export type OpenAiChatCompletionsRequest = {
  readonly model: string;
  readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
};

export interface OpenAiTransportRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export type OpenAiTransport = (
  request: OpenAiTransportRequest,
) => Effect.Effect<unknown, OpenAiTransportError>;

// ── Adapter types ──────────────────────────────────────────────────────────────

export interface OpenAiChatCompletionsOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly transport: OpenAiTransport;
  readonly timeoutMs: Duration.DurationInput;
  readonly now?: () => Effect.Effect<number, never>;
  /** Retry budget for transient provider failures. Defaults to one retry. */
  readonly transientRetries?: number;
}

const DEFAULT_TRANSIENT_RETRIES = 2;

// ── Response validation ────────────────────────────────────────────────────────

const isChatMessageRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validateChatCompletionResponse = (
  result: unknown,
):
  | { readonly _tag: "success"; readonly content: string }
  | { readonly _tag: "failure"; readonly error: OpenAiTransportError } => {
  if (!isChatMessageRecord(result)) {
    return {
      _tag: "failure",
      error: new OpenAiTransportError({ reason: "NON_JSON_RESPONSE" }),
    };
  }

  const choices = result.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return {
      _tag: "failure",
      error: new OpenAiTransportError({ reason: "NON_JSON_RESPONSE" }),
    };
  }

  const firstChoice = choices[0];
  if (!isChatMessageRecord(firstChoice)) {
    return {
      _tag: "failure",
      error: new OpenAiTransportError({ reason: "NON_JSON_RESPONSE" }),
    };
  }

  const message = firstChoice.message;
  if (!isChatMessageRecord(message)) {
    return {
      _tag: "failure",
      error: new OpenAiTransportError({ reason: "NON_JSON_RESPONSE" }),
    };
  }

  const content = message.content;
  if (typeof content !== "string") {
    return {
      _tag: "failure",
      error: new OpenAiTransportError({ reason: "NON_JSON_RESPONSE" }),
    };
  }

  if (content.trim() === "") {
    return {
      _tag: "failure",
      error: new OpenAiTransportError({ reason: "EMPTY_CONTENT" }),
    };
  }

  return { _tag: "success", content };
};

// ── Service ────────────────────────────────────────────────────────────────────

export interface OpenAiChatCompletions {
  readonly complete: (
    request: OpenAiChatCompletionsRequest,
  ) => Effect.Effect<string, OpenAiTransportError>;
}

// ── Adapter ────────────────────────────────────────────────────────────────────

/** Failures that can plausibly succeed on an immediate second attempt. */
const isTransient = (error: OpenAiTransportError): boolean => {
  if (error.reason === "EMPTY_CONTENT" || error.reason === "NETWORK_FAILED") return true;
  if (error.reason !== "HTTP_STATUS") return false;
  return error.status === 429 || (error.status !== undefined && error.status >= 500);
};

/**
 * A 429 means the provider is already saturated, so an immediate retry adds
 * pressure to the condition it is asking for relief from.  The eval sweep hit
 * this as a wall of 429s that one instant retry could not clear.  Everything
 * else keeps the cheap single retry.
 */
const isRateLimited = (error: OpenAiTransportError): boolean =>
  error.reason === "HTTP_STATUS" && error.status === 429;


const RATE_LIMIT_BACKOFF = "2 seconds";
const RATE_LIMIT_RETRIES = 3;

export const makeOpenAiChatCompletions = (
  options: OpenAiChatCompletionsOptions,
): OpenAiChatCompletions => {
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  return {
    complete: (request) => {
      const once = Effect.flatMap(Effect.succeed(request), (req) =>
        options.transport({
          url: `${baseUrl}/chat/completions`,
          method: "POST",
          headers: Object.freeze({
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.apiKey}`,
          }),
          body: JSON.stringify({
            model: options.model,
            messages: req.messages,
          }),
        }),
      ).pipe(
        Effect.flatMap((result) => {
          const validated = validateChatCompletionResponse(result);
          if (validated._tag === "failure") {
            return Effect.fail(validated.error);
          }
          return Effect.succeed(validated.content);
        }),
      );

      // Bounded retries at the transport boundary cover every caller —
      // clarify, rank, synthesis, judge and the follow-up agent — instead of
      // each of them inventing its own idea of a hiccup.
      return once.pipe(
        Effect.retry({
          schedule: Schedule.exponential(RATE_LIMIT_BACKOFF, 2).pipe(
            Schedule.intersect(Schedule.recurs(RATE_LIMIT_RETRIES)),
          ),
          while: isRateLimited,
        }),
        Effect.retry({
          times: options.transientRetries ?? DEFAULT_TRANSIENT_RETRIES,
          while: (error) => isTransient(error) && !isRateLimited(error),
        }),
      );
    },
  };
};

// ── Fetch transport helper ─────────────────────────────────────────────────────

export interface FetchOpenAiTransportOptions {
  readonly fetch?: typeof fetch;
  readonly timeoutMs: Duration.DurationInput;
}

/**
 * Wrap the global (or injected) `fetch` in the {@link OpenAiTransport}
 * contract.  This is a simple pass-through — no retries, no logging.
 */
export const makeFetchOpenAiTransport = (options: FetchOpenAiTransportOptions): OpenAiTransport => {
  const fetcher = options.fetch ?? fetch;

  return (request) =>
    Effect.tryPromise({
      try: async () => {
        const timeoutMs = Duration.toMillis(Duration.decode(options.timeoutMs));
        const response = await fetcher(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
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
          return new OpenAiTransportError({ reason, status });
        }

        if (
          typeof thrown === "object" &&
          thrown !== null &&
          "reason" in thrown &&
          (thrown as { reason: unknown }).reason === "NON_JSON_RESPONSE"
        ) {
          return new OpenAiTransportError({ reason: "NON_JSON_RESPONSE" });
        }

        if (thrown instanceof Error) {
          return new OpenAiTransportError({ reason: "NETWORK_FAILED" });
        }

        return new OpenAiTransportError({ reason: "NETWORK_FAILED" });
      },
    }).pipe(
      Effect.flatMap((result) =>
        typeof result === "object" && result !== null && !Array.isArray(result)
          ? Effect.succeed(result)
          : Effect.fail(new OpenAiTransportError({ reason: "NON_JSON_RESPONSE" })),
      ),
    );
};
