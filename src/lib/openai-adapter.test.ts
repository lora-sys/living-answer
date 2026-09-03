import { Effect } from "effect";

import { describe, expect, it } from "vite-plus/test";

import type { OpenAiChatCompletions, OpenAiTransport } from "./openai-adapter";
import type { OpenAiChatCompletionsRequest, OpenAiTransportRequest } from "./openai-adapter";
import {
  makeFetchOpenAiTransport,
  makeOpenAiChatCompletions,
  OpenAiTransportError,
} from "./openai-adapter";

// ── Helpers ────────────────────────────────────────────────────────────────────

const runSuccess = <A>(effect: Effect.Effect<A, unknown>): Promise<A> => Effect.runPromise(effect);

const runFailure = async (
  effect: Effect.Effect<unknown, OpenAiTransportError>,
): Promise<OpenAiTransportError> => {
  const exit = await Effect.runPromiseExit(effect);
  if (exit._tag !== "Failure") throw new Error("Expected transport failure");
  if (exit.cause._tag !== "Fail") throw new Error("Expected a failed effect");
  return exit.cause.error;
};

const makeFakeTransport = <T>(
  handler: (request: OpenAiTransportRequest) => T | Effect.Effect<T, OpenAiTransportError>,
): OpenAiTransport => {
  return (request) => {
    const result = handler(request);
    return Effect.isEffect(result)
      ? (result as Effect.Effect<T, OpenAiTransportError>)
      : (Effect.succeed(result) as Effect.Effect<T, OpenAiTransportError>);
  };
};

const VALID_CHAT_RESPONSE = {
  choices: [
    {
      message: {
        role: "assistant",
        content: "Hello! How can I help you today?",
      },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
};

const makeMessages = (
  overrides: ReadonlyArray<{ readonly role: string; readonly content: string }> = [],
): OpenAiChatCompletionsRequest["messages"] => [
  { role: "user", content: "What is the capital of France?" },
  ...overrides,
];

describe("openai-adapter", () => {
  // ── Request construction ────────────────────────────────────────────────────

  describe("request construction", () => {
    it("sends POST to /chat/completions with Bearer auth and JSON body", async () => {
      let captured: OpenAiTransportRequest | null = null;
      const transport = makeFakeTransport((request) => {
        captured = request;
        return VALID_CHAT_RESPONSE;
      });

      const service = makeOpenAiChatCompletions({
        apiKey: "sk-test-key",
        model: "gpt-4o",
        baseUrl: "https://api.openai.com",
        transport,
        timeoutMs: 10_000,
      });

      await runSuccess(
        service.complete({
          model: "gpt-4o",
          messages: makeMessages(),
        }),
      );

      expect(captured).not.toBeNull();
      expect(captured!.url).toBe("https://api.openai.com/chat/completions");
      expect(captured!.method).toBe("POST");
      expect(captured!.headers["Authorization"]).toBe("Bearer sk-test-key");
      expect(captured!.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(captured!.body) as Record<string, unknown>;
      expect(body.model).toBe("gpt-4o");
      expect(body.messages).toEqual([{ role: "user", content: "What is the capital of France?" }]);
    });

    it("strips trailing slash from baseUrl", async () => {
      let captured: OpenAiTransportRequest | null = null;
      const transport = makeFakeTransport((request) => {
        captured = request;
        return VALID_CHAT_RESPONSE;
      });

      const service = makeOpenAiChatCompletions({
        apiKey: "sk-test",
        model: "gpt-4o",
        baseUrl: "https://api.openai.com/",
        transport,
        timeoutMs: 5_000,
      });

      await runSuccess(
        service.complete({
          model: "gpt-4o",
          messages: makeMessages(),
        }),
      );

      expect(captured!.url).toBe("https://api.openai.com/chat/completions");
    });

    it("uses custom baseUrl when supplied", async () => {
      let captured: OpenAiTransportRequest | null = null;
      const transport = makeFakeTransport((request) => {
        captured = request;
        return VALID_CHAT_RESPONSE;
      });

      const service = makeOpenAiChatCompletions({
        apiKey: "sk-test",
        model: "gpt-4o",
        baseUrl: "https://custom.example.com",
        transport,
        timeoutMs: 5_000,
      });

      await runSuccess(
        service.complete({
          model: "gpt-4o",
          messages: makeMessages(),
        }),
      );

      expect(captured!.url).toBe("https://custom.example.com/chat/completions");
    });

    it("forwards messages array correctly including multi-turn", async () => {
      let captured: OpenAiTransportRequest | null = null;
      const transport = makeFakeTransport((request) => {
        captured = request;
        return VALID_CHAT_RESPONSE;
      });

      const service = makeOpenAiChatCompletions({
        apiKey: "sk-test",
        model: "gpt-4o",
        baseUrl: "https://api.openai.com",
        transport,
        timeoutMs: 5_000,
      });

      const messages = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
        { role: "user", content: "Tell me more." },
      ];

      await runSuccess(
        service.complete({
          model: "gpt-4o",
          messages,
        }),
      );

      const body = JSON.parse(captured!.body) as Record<string, unknown>;
      expect(body.messages).toEqual(messages);
    });
  });

  // ── Adapter contract ────────────────────────────────────────────────────────

  describe("service contract", () => {
    const makeService = (transport: OpenAiTransport): OpenAiChatCompletions =>
      makeOpenAiChatCompletions({
        apiKey: "sk-test",
        model: "gpt-4o",
        baseUrl: "https://api.openai.com",
        transport,
        timeoutMs: 10_000,
      });

    it("returns assistant message content on valid response", async () => {
      const service = makeService(makeFakeTransport(() => VALID_CHAT_RESPONSE));

      const result = await runSuccess(
        service.complete({
          model: "gpt-4o",
          messages: makeMessages(),
        }),
      );

      expect(result).toBe("Hello! How can I help you today?");
    });

    it("closes over the configured model even when request has a different model field", async () => {
      let captured: OpenAiTransportRequest | null = null;
      const transport = makeFakeTransport((request) => {
        captured = request;
        return VALID_CHAT_RESPONSE;
      });

      const service = makeOpenAiChatCompletions({
        apiKey: "sk-test",
        model: "gpt-4o-mini",
        baseUrl: "https://api.openai.com",
        transport,
        timeoutMs: 5_000,
      });

      await runSuccess(
        service.complete({
          model: "gpt-4o",
          messages: makeMessages(),
        }),
      );

      const body = JSON.parse(captured!.body) as Record<string, unknown>;
      expect(body.model).toBe("gpt-4o-mini");
    });

    it("maps NETWORK_FAILED transport error through", async () => {
      const service = makeService(
        makeFakeTransport(() =>
          Effect.fail(new OpenAiTransportError({ reason: "NETWORK_FAILED" })),
        ),
      );

      const err = await runFailure(
        service.complete({
          model: "gpt-4o",
          messages: makeMessages(),
        }),
      );

      expect(err).toBeInstanceOf(OpenAiTransportError);
      expect(err.reason).toBe("NETWORK_FAILED");
    });

    it("maps HTTP_STATUS transport error with numeric status through", async () => {
      const service = makeService(
        makeFakeTransport(() =>
          Effect.fail(new OpenAiTransportError({ reason: "HTTP_STATUS", status: 401 })),
        ),
      );

      const err = await runFailure(
        service.complete({
          model: "gpt-4o",
          messages: makeMessages(),
        }),
      );

      expect(err).toBeInstanceOf(OpenAiTransportError);
      expect(err.reason).toBe("HTTP_STATUS");
      expect(err.status).toBe(401);
    });

    it("maps NON_JSON_RESPONSE for a non-object transport result", async () => {
      const service = makeService(makeFakeTransport(() => "not-an-object"));

      const err = await runFailure(
        service.complete({
          model: "gpt-4o",
          messages: makeMessages(),
        }),
      );

      expect(err).toBeInstanceOf(OpenAiTransportError);
      expect(err.reason).toBe("NON_JSON_RESPONSE");
    });

    it("maps NON_JSON_RESPONSE for an array transport result", async () => {
      const service = makeService(makeFakeTransport(() => [1, 2, 3]));

      const err = await runFailure(
        service.complete({
          model: "gpt-4o",
          messages: makeMessages(),
        }),
      );

      expect(err).toBeInstanceOf(OpenAiTransportError);
      expect(err.reason).toBe("NON_JSON_RESPONSE");
    });

    it("maps NON_JSON_RESPONSE for a response with empty choices array", async () => {
      const service = makeService(
        makeFakeTransport(() => ({
          choices: [],
          usage: { total_tokens: 0 },
        })),
      );

      const err = await runFailure(
        service.complete({
          model: "gpt-4o",
          messages: makeMessages(),
        }),
      );

      expect(err).toBeInstanceOf(OpenAiTransportError);
      expect(err.reason).toBe("NON_JSON_RESPONSE");
    });

    it("maps NON_JSON_RESPONSE for a response with non-object first choice", async () => {
      const service = makeService(
        makeFakeTransport(() => ({
          choices: ["not-an-object"],
        })),
      );

      const err = await runFailure(
        service.complete({
          model: "gpt-4o",
          messages: makeMessages(),
        }),
      );

      expect(err).toBeInstanceOf(OpenAiTransportError);
      expect(err.reason).toBe("NON_JSON_RESPONSE");
    });

    it("maps NON_JSON_RESPONSE for a response with missing message field", async () => {
      const service = makeService(
        makeFakeTransport(() => ({
          choices: [{ finish_reason: "stop" }],
        })),
      );

      const err = await runFailure(
        service.complete({
          model: "gpt-4o",
          messages: makeMessages(),
        }),
      );

      expect(err).toBeInstanceOf(OpenAiTransportError);
      expect(err.reason).toBe("NON_JSON_RESPONSE");
    });

    it("maps NON_JSON_RESPONSE for a response with non-string content", async () => {
      const service = makeService(
        makeFakeTransport(() => ({
          choices: [{ message: { role: "assistant", content: 123 } }],
        })),
      );

      const err = await runFailure(
        service.complete({
          model: "gpt-4o",
          messages: makeMessages(),
        }),
      );

      expect(err).toBeInstanceOf(OpenAiTransportError);
      expect(err.reason).toBe("NON_JSON_RESPONSE");
    });
  });

  // ── Transient failure handling ──────────────────────────────────────────────

  describe("transient retry", () => {
    const makeCountingService = (
      responses: readonly unknown[],
      transientRetries?: number,
    ): { service: OpenAiChatCompletions; calls: () => number } => {
      let index = 0;
      const service = makeOpenAiChatCompletions({
        apiKey: "sk-test",
        model: "gpt-4o",
        baseUrl: "https://api.openai.com",
        transport: makeFakeTransport(() => responses[Math.min(index++, responses.length - 1)]),
        timeoutMs: 10_000,
        ...(transientRetries === undefined ? {} : { transientRetries }),
      });
      return { service, calls: () => index };
    };

    const request: OpenAiChatCompletionsRequest = {
      model: "gpt-4o",
      messages: makeMessages(),
    };

    it("treats an empty assistant message as a transport failure", async () => {
      const { service } = makeCountingService([
        { choices: [{ message: { role: "assistant", content: "   " } }] },
      ]);

      const err = await runFailure(service.complete(request));
      expect(err.reason).toBe("EMPTY_CONTENT");
    });

    it("retries an empty payload and returns the content that follows", async () => {
      const { service, calls } = makeCountingService([
        { choices: [{ message: { role: "assistant", content: "" } }] },
        VALID_CHAT_RESPONSE,
      ]);

      const result = await runSuccess(service.complete(request));
      expect(result).toBe(VALID_CHAT_RESPONSE.choices[0].message.content);
      expect(calls()).toBe(2);
    });

    it("retries a 429 but not a 400", async () => {
      const rateLimited = makeCountingService([
        Effect.fail(new OpenAiTransportError({ reason: "HTTP_STATUS", status: 429 })),
        VALID_CHAT_RESPONSE,
      ]);
      await runSuccess(rateLimited.service.complete(request));
      expect(rateLimited.calls()).toBe(2);

      const badRequest = makeCountingService([
        Effect.fail(new OpenAiTransportError({ reason: "HTTP_STATUS", status: 400 })),
        VALID_CHAT_RESPONSE,
      ]);
      const err = await runFailure(badRequest.service.complete(request));
      expect(err.status).toBe(400);
      expect(badRequest.calls()).toBe(1);
    });

    it("stops after the retry budget instead of looping on a dead provider", async () => {
      const { service, calls } = makeCountingService(
        [Effect.fail(new OpenAiTransportError({ reason: "NETWORK_FAILED" }))],
        2,
      );

      const err = await runFailure(service.complete(request));
      expect(err.reason).toBe("NETWORK_FAILED");
      expect(calls()).toBe(3);
    });
  });

  // ── Fetch transport helper ──────────────────────────────────────────────────

  describe("makeFetchOpenAiTransport", () => {
    it("forwards URL, method, headers, and JSON body to the injected fetch", async () => {
      let captured: { url: string; method: string; headers: HeadersInit; body: string } | undefined;

      const mockFetch = async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ): Promise<Response> => {
        const url = input instanceof Request ? input.url : String(input);
        captured = {
          url,
          method: (init as Record<string, unknown> | undefined)?.method as string,
          headers: init?.headers ?? {},
          body: (init as Record<string, unknown> | undefined)?.body as string,
        };
        return new Response(JSON.stringify(VALID_CHAT_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const transport = makeFetchOpenAiTransport({
        fetch: mockFetch,
        timeoutMs: 5_000,
      });

      await runSuccess(
        transport({
          url: "https://api.openai.com/chat/completions",
          method: "POST",
          headers: Object.freeze({
            "Content-Type": "application/json",
            Authorization: "Bearer sk-test",
          }),
          body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] }),
        }),
      );

      expect(captured!.url).toBe("https://api.openai.com/chat/completions");
      expect(captured!.method).toBe("POST");
      expect(captured!.headers).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer sk-test",
      });
      expect(JSON.parse(captured!.body)).toEqual({
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
      });
    });

    it("maps a network throw to NETWORK_FAILED", async () => {
      const mockFetch = async (): Promise<Response> => {
        throw new Error("network down");
      };

      const transport = makeFetchOpenAiTransport({
        fetch: mockFetch,
        timeoutMs: 5_000,
      });

      const err = await runFailure(
        transport({
          url: "https://api.openai.com/chat/completions",
          method: "POST",
          headers: {},
          body: "{}",
        }),
      );

      expect(err).toBeInstanceOf(OpenAiTransportError);
      expect(err.reason).toBe("NETWORK_FAILED");
    });

    it("maps non-2xx to HTTP_STATUS with the numeric status", async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response("unauthorized", { status: 401 });
      };

      const transport = makeFetchOpenAiTransport({
        fetch: mockFetch,
        timeoutMs: 5_000,
      });

      const err = await runFailure(
        transport({
          url: "https://api.openai.com/chat/completions",
          method: "POST",
          headers: {},
          body: "{}",
        }),
      );

      expect(err).toBeInstanceOf(OpenAiTransportError);
      expect(err.reason).toBe("HTTP_STATUS");
      expect(err.status).toBe(401);
    });

    it("maps malformed JSON to NON_JSON_RESPONSE", async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response("not valid json{[", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const transport = makeFetchOpenAiTransport({
        fetch: mockFetch,
        timeoutMs: 5_000,
      });

      const err = await runFailure(
        transport({
          url: "https://api.openai.com/chat/completions",
          method: "POST",
          headers: {},
          body: "{}",
        }),
      );

      expect(err).toBeInstanceOf(OpenAiTransportError);
      expect(err.reason).toBe("NON_JSON_RESPONSE");
    });

    it("maps an array JSON response to NON_JSON_RESPONSE", async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response(JSON.stringify([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const transport = makeFetchOpenAiTransport({
        fetch: mockFetch,
        timeoutMs: 5_000,
      });

      const err = await runFailure(
        transport({
          url: "https://api.openai.com/chat/completions",
          method: "POST",
          headers: {},
          body: "{}",
        }),
      );

      expect(err).toBeInstanceOf(OpenAiTransportError);
      expect(err.reason).toBe("NON_JSON_RESPONSE");
    });
  });
});
