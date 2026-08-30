import { Data, Duration, Effect } from "effect";

// ── Transport types ─────────────────────────────────────────────────────────────

export type OpenAiTransportFailureReason = "NETWORK_FAILED" | "HTTP_STATUS" | "NON_JSON_RESPONSE";

export class OpenAiTransportError extends Data.TaggedError("OpenAiTransportError")<{
  readonly reason: OpenAiTransportFailureReason;
  readonly status?: number;
}> {}

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
}

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

  return { _tag: "success", content };
};

// ── Service ────────────────────────────────────────────────────────────────────

export interface OpenAiChatCompletions {
  readonly complete: (
    request: OpenAiChatCompletionsRequest,
  ) => Effect.Effect<string, OpenAiTransportError>;
}

// ── Adapter ────────────────────────────────────────────────────────────────────

export const makeOpenAiChatCompletions = (
  options: OpenAiChatCompletionsOptions,
): OpenAiChatCompletions => {
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  return {
    complete: (request) =>
      Effect.flatMap(Effect.succeed(request), (req) =>
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
      ),
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
