import { Effect, Exit } from "effect";

import { describe, expect, it } from "vite-plus/test";

import type {
  ZhihuDirectAnswerTransport,
  ZhihuDirectAnswerTransportRequest,
  ZhihuDirectAnswerTransportFailureReason,
  ZhihuDirectAnswerCompletions,
} from "./zhihu-direct-answer-adapter";

import {
  makeFetchZhihuDirectAnswerTransport,
  makeZhihuDirectAnswerCompletions,
  DirectAnswerError,
  ZhihuDirectAnswerTransportError,
} from "./zhihu-direct-answer-adapter";

// ── Helpers ──────────────────────────────────────────────────────────────

const VALID_RESPONSE = {
  choices: [
    {
      message: {
        role: "assistant",
        content: "The answer content here.",
      },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 50,
    completion_tokens: 30,
    total_tokens: 80,
  },
};

const successfulTransporter =
  (response: unknown): ZhihuDirectAnswerTransport =>
  () =>
    Effect.succeed(response);

const failingTransporter =
  (reason: ZhihuDirectAnswerTransportFailureReason, status?: number): ZhihuDirectAnswerTransport =>
  () =>
    Effect.fail(new ZhihuDirectAnswerTransportError({ reason, status }));

const makeService = (transport: ZhihuDirectAnswerTransport): ZhihuDirectAnswerCompletions =>
  makeZhihuDirectAnswerCompletions({
    accessSecret: "sk-test-key",
    model: "zhida-thinking-1p5",
    transport,
    baseUrl: "https://developer.zhihu.com",
  });

const runSuccess = async (
  service: ZhihuDirectAnswerCompletions,
  request: { model: string; messages: { role: string; content: string }[] },
): Promise<string> => Effect.runPromise(service.complete(request));

const runFailure = async (
  service: ZhihuDirectAnswerCompletions,
  request: { model: string; messages: { role: string; content: string }[] },
): Promise<ZhihuDirectAnswerTransportError | DirectAnswerError> => {
  const exit = await Effect.runPromiseExit(service.complete(request));
  if (Exit.isFailure(exit)) {
    const error = extractError(exit.cause);
    return error as ZhihuDirectAnswerTransportError | DirectAnswerError;
  }
  throw new Error("Expected the service to fail");
};

const extractError = (cause: unknown): Error => {
  if (typeof cause !== "object" || cause === null) {
    return new Error(String(cause));
  }
  const c = cause as { _tag: string; error?: unknown; defect?: unknown; failures?: unknown[] };
  if (c._tag === "Fail") {
    return c.error as Error;
  }
  if (c._tag === "Die") {
    const defect = c.defect ?? cause;
    return defect instanceof Error ? defect : new Error(String(defect));
  }
  if (c.failures?.[0]) {
    return extractError(c.failures[0]);
  }
  return new Error(`Unexpected cause: ${c._tag}`);
};

const makeMessages = (overrides: { role: string; content: string }[] = []) => [
  { role: "user", content: "What is state management?" },
  ...overrides,
];

// ── makeZhihuDirectAnswerCompletions ──────────────────────────────────────

describe("zhihu-direct-answer-adapter makeZhihuDirectAnswerCompletions", () => {
  it("sends POST to /v1/chat/completions with Bearer auth", async () => {
    let captured: ZhihuDirectAnswerTransportRequest | null = null;
    const transport: ZhihuDirectAnswerTransport = (request) => {
      captured = request;
      return Effect.succeed(VALID_RESPONSE);
    };

    const service = makeService(transport);
    await runSuccess(service, { model: "zhida-thinking-1p5", messages: makeMessages() });

    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("https://developer.zhihu.com/v1/chat/completions");
    expect(captured!.method).toBe("POST");
    expect(captured!.headers.Authorization).toBe("Bearer sk-test-key");
    expect(captured!.headers["Content-Type"]).toBe("application/json");
    expect(typeof captured!.headers["X-Request-Timestamp"]).toBe("string");
  });

  it("strips the trailing slash from baseUrl", async () => {
    let captured: ZhihuDirectAnswerTransportRequest | null = null;
    const transport: ZhihuDirectAnswerTransport = (request) => {
      captured = request;
      return Effect.succeed(VALID_RESPONSE);
    };

    const service = makeZhihuDirectAnswerCompletions({
      accessSecret: "sk-test-key",
      model: "zhida-thinking-1p5",
      transport,
      baseUrl: "https://developer.zhihu.com/",
    });

    await runSuccess(service, { model: "zhida-thinking-1p5", messages: makeMessages() });
    expect(captured!.url).toBe("https://developer.zhihu.com/v1/chat/completions");
  });

  it("uses a custom baseUrl when provided", async () => {
    let captured: ZhihuDirectAnswerTransportRequest | null = null;
    const transport: ZhihuDirectAnswerTransport = (request) => {
      captured = request;
      return Effect.succeed(VALID_RESPONSE);
    };

    const service = makeZhihuDirectAnswerCompletions({
      accessSecret: "sk-test",
      model: "test-model",
      transport,
      baseUrl: "https://custom.zhihu.com",
    });

    await runSuccess(service, { model: "test-model", messages: makeMessages() });
    expect(captured!.url).toBe("https://custom.zhihu.com/v1/chat/completions");
  });

  it("forwards the correct model and messages in the request body", async () => {
    let capturedBody: string | null = null;
    const transport: ZhihuDirectAnswerTransport = (request) => {
      capturedBody = request.body;
      return Effect.succeed(VALID_RESPONSE);
    };

    const service = makeService(transport);
    const messages = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Question?" },
    ];
    await runSuccess(service, { model: "zhida-thinking-1p5", messages });

    const body = JSON.parse(capturedBody!) as {
      model: string;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe("zhida-thinking-1p5");
    expect(body.messages).toEqual(messages);
  });

  it("returns the assistant message content from the response", async () => {
    const service = makeService(successfulTransporter(VALID_RESPONSE));
    const result = await runSuccess(service, {
      model: "zhida-thinking-1p5",
      messages: makeMessages(),
    });
    expect(result).toBe("The answer content here.");
  });

  it("maps a non-object transport result to MALFORMED_RESPONSE", async () => {
    const service = makeService(successfulTransporter("just a string"));
    const error = await runFailure(service, {
      model: "zhida-thinking-1p5",
      messages: makeMessages(),
    });
    expect(error).toBeInstanceOf(DirectAnswerError);
    expect((error as DirectAnswerError).reason).toBe("MALFORMED_RESPONSE");
  });

  it("maps an array transport result to MALFORMED_RESPONSE", async () => {
    const service = makeService(successfulTransporter([1, 2, 3]));
    const error = await runFailure(service, {
      model: "zhida-thinking-1p5",
      messages: makeMessages(),
    });
    expect(error).toBeInstanceOf(DirectAnswerError);
    expect((error as DirectAnswerError).reason).toBe("MALFORMED_RESPONSE");
  });

  it("maps a response with no choices to MALFORMED_RESPONSE", async () => {
    const service = makeService(successfulTransporter({ choices: [], usage: { total_tokens: 0 } }));
    const error = await runFailure(service, {
      model: "zhida-thinking-1p5",
      messages: makeMessages(),
    });
    expect(error).toBeInstanceOf(DirectAnswerError);
    expect((error as DirectAnswerError).reason).toBe("MALFORMED_RESPONSE");
  });

  it("maps a response where choices[0] is not an object to MALFORMED_RESPONSE", async () => {
    const service = makeService(successfulTransporter({ choices: ["bad-choice"] }));
    const error = await runFailure(service, {
      model: "zhida-thinking-1p5",
      messages: makeMessages(),
    });
    expect(error).toBeInstanceOf(DirectAnswerError);
    expect((error as DirectAnswerError).reason).toBe("MALFORMED_RESPONSE");
  });

  it("maps a response with missing message field to MALFORMED_RESPONSE", async () => {
    const service = makeService(
      successfulTransporter({
        choices: [{ finish_reason: "stop" }],
      }),
    );
    const error = await runFailure(service, {
      model: "zhida-thinking-1p5",
      messages: makeMessages(),
    });
    expect(error).toBeInstanceOf(DirectAnswerError);
    expect((error as DirectAnswerError).reason).toBe("MALFORMED_RESPONSE");
  });

  it("maps a response with non-string message content to MALFORMED_RESPONSE", async () => {
    const service = makeService(
      successfulTransporter({
        choices: [{ message: { role: "assistant", content: 123 } }],
      }),
    );
    const error = await runFailure(service, {
      model: "zhida-thinking-1p5",
      messages: makeMessages(),
    });
    expect(error).toBeInstanceOf(DirectAnswerError);
    expect((error as DirectAnswerError).reason).toBe("MALFORMED_RESPONSE");
  });

  it("maps a NETWORK_FAILED transport error through unchanged", async () => {
    const service = makeService(failingTransporter("NETWORK_FAILED"));
    const error = await runFailure(service, {
      model: "zhida-thinking-1p5",
      messages: makeMessages(),
    });
    expect(error).toBeInstanceOf(ZhihuDirectAnswerTransportError);
    expect((error as ZhihuDirectAnswerTransportError).reason).toBe("NETWORK_FAILED");
  });

  it("preserves the HTTP status code in HTTP_STATUS transport errors", async () => {
    const service = makeService(failingTransporter("HTTP_STATUS", 401));
    const error = await runFailure(service, {
      model: "zhida-thinking-1p5",
      messages: makeMessages(),
    });
    expect(error).toBeInstanceOf(ZhihuDirectAnswerTransportError);
    expect((error as ZhihuDirectAnswerTransportError).reason).toBe("HTTP_STATUS");
    expect((error as ZhihuDirectAnswerTransportError).status).toBe(401);
  });

  it("wraps unknown transport errors as NETWORK_FAILED", async () => {
    const transportThatThrowsRawError: ZhihuDirectAnswerTransport = () =>
      Effect.tryPromise({
        try: async () => {
          throw new Error("connection reset");
        },
        catch: () => new ZhihuDirectAnswerTransportError({ reason: "NON_JSON_RESPONSE" }),
      });

    const svcWithErrorTransport = makeService(transportThatThrowsRawError);
    const exit1 = await Effect.runPromiseExit(
      svcWithErrorTransport.complete({ model: "m", messages: [] }),
    );
    expect(exit1._tag).toBe("Failure");

    // This test validates the mapError in makeZhihuDirectAnswerCompletions
    // We simulate by passing a transport function that fails with a raw non-Zhihu error
    const genericFailTransport: ZhihuDirectAnswerTransport = () =>
      Effect.fail(new Error("network down") as unknown as ZhihuDirectAnswerTransportError);

    const svc = makeService(genericFailTransport);
    const exit = await Effect.runPromiseExit(svc.complete({ model: "m", messages: [] }));
    expect(exit._tag).toBe("Failure");

    if (!Exit.isFailure(exit)) {
      throw new Error("Expected the service to fail");
    }

    const cause = exit.cause;
    let err: Error;
    if (cause._tag === "Fail") {
      err = cause.error as Error;
    } else if (cause._tag === "Sequential") {
      err = extractError(cause.left);
    } else {
      err = new Error("unexpected");
    }
    expect(err).toBeInstanceOf(ZhihuDirectAnswerTransportError);
    expect((err as ZhihuDirectAnswerTransportError).reason).toBe("NETWORK_FAILED");
  });

  it("freezes the headers object passed to the transport", async () => {
    let frozenHeaders: Readonly<Record<string, string>> | null = null;
    const transport: ZhihuDirectAnswerTransport = (request) => {
      frozenHeaders = request.headers;
      return Effect.succeed(VALID_RESPONSE);
    };

    const service = makeService(transport);
    await runSuccess(service, { model: "zhida-thinking-1p5", messages: makeMessages() });
    expect(Object.isFrozen(frozenHeaders)).toBe(true);
  });
});

// ── makeFetchZhihuDirectAnswerTransport ────────────────────────────────────

describe("zhihu-direct-answer-adapter makeFetchZhihuDirectAnswerTransport", () => {
  it("forwards URL, method, headers, and body to the injected fetch", async () => {
    let captured:
      | {
          url: string;
          method: string;
          headers: Record<string, string>;
          body: string;
        }
      | undefined;

    const mockFetch = async (
      input: string,
      init?: { method?: string; headers?: Record<string, string>; body?: string },
    ): Promise<{
      ok: boolean;
      status: number;
      text: () => Promise<string>;
      headers: { get: (_: string) => string | null };
    }> => {
      captured = {
        url: String(input),
        method: init?.method ?? "GET",
        headers: (init?.headers as Record<string, string>) ?? {},
        body: init?.body ?? "",
      };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(VALID_RESPONSE),
        headers: {
          get: (_name: string) => "application/json",
        },
      };
    };

    const transport = makeFetchZhihuDirectAnswerTransport({ fetch: mockFetch, timeoutMs: 5_000 });
    await Effect.runPromise(
      transport({
        url: "https://developer.zhihu.com/v1/chat/completions",
        method: "POST",
        headers: Object.freeze({
          "Content-Type": "application/json",
          Authorization: "Bearer key",
        }),
        body: JSON.stringify({ model: "test", messages: [] }),
      }),
    );

    expect(captured).not.toBeUndefined();
    expect(captured!.url).toBe("https://developer.zhihu.com/v1/chat/completions");
    expect(captured!.method).toBe("POST");
    expect(captured!.headers["Content-Type"]).toBe("application/json");
    expect(captured!.headers.Authorization).toBe("Bearer key");
    expect(JSON.parse(captured!.body)).toEqual({ model: "test", messages: [] });
  });

  it("returns a successful parsed JSON response", async () => {
    const mockFetch = async (): Promise<{
      ok: boolean;
      status: number;
      text: () => Promise<string>;
      headers: { get: (_: string) => string | null };
    }> => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ result: "ok" }),
      headers: { get: (_name: string) => "application/json" },
    });

    const transport = makeFetchZhihuDirectAnswerTransport({ fetch: mockFetch, timeoutMs: 5_000 });
    const result = await Effect.runPromise(
      transport({
        url: "https://developer.zhihu.com/v1/chat/completions",
        method: "POST",
        headers: {},
        body: "{}",
      }),
    );
    expect(result).toEqual({ result: "ok" });
  });

  it("maps a network Error to NETWORK_FAILED", async () => {
    const mockFetch = async (): Promise<{
      ok: boolean;
      status: number;
      text: () => Promise<string>;
      headers: { get: (_: string) => string | null };
    }> => {
      throw new Error("ECONNREFUSED");
    };

    const transport = makeFetchZhihuDirectAnswerTransport({ fetch: mockFetch, timeoutMs: 5_000 });

    const err = await Effect.runPromiseExit(
      transport({
        url: "https://developer.zhihu.com/v1/chat/completions",
        method: "POST",
        headers: {},
        body: "{}",
      }),
    );

    expect(err._tag).toBe("Failure");
    if (!Exit.isFailure(err)) {
      throw new Error("Expected the transport to fail");
    }
    const error = extractError(err.cause);
    expect(error).toBeInstanceOf(ZhihuDirectAnswerTransportError);
    expect((error as ZhihuDirectAnswerTransportError).reason).toBe("NETWORK_FAILED");
  });

  it("maps a non-ok response to HTTP_STATUS with the numeric status", async () => {
    const mockFetch = async (): Promise<{
      ok: boolean;
      status: number;
      text: () => Promise<string>;
      headers: { get: (_: string) => string | null };
    }> => ({
      ok: false,
      status: 500,
      text: async () => "Server Error",
      headers: { get: (_name: string) => "text/plain" },
    });

    const transport = makeFetchZhihuDirectAnswerTransport({ fetch: mockFetch, timeoutMs: 5_000 });
    const err = await Effect.runPromiseExit(
      transport({
        url: "https://developer.zhihu.com/v1/chat/completions",
        method: "POST",
        headers: {},
        body: "{}",
      }),
    );

    expect(err._tag).toBe("Failure");
    if (!Exit.isFailure(err)) {
      throw new Error("Expected the transport to fail");
    }
    const error = extractError(err.cause);
    expect(error).toBeInstanceOf(ZhihuDirectAnswerTransportError);
    expect((error as ZhihuDirectAnswerTransportError).reason).toBe("HTTP_STATUS");
    expect((error as ZhihuDirectAnswerTransportError).status).toBe(500);
  });

  it("maps malformed JSON in the response body to NON_JSON_RESPONSE", async () => {
    const mockFetch = async (): Promise<{
      ok: boolean;
      status: number;
      text: () => Promise<string>;
      headers: { get: (_: string) => string | null };
    }> => ({
      ok: true,
      status: 200,
      text: async () => "not valid json{[",
      headers: { get: () => "application/json" },
    });

    const transport = makeFetchZhihuDirectAnswerTransport({ fetch: mockFetch, timeoutMs: 5_000 });
    const err = await Effect.runPromiseExit(
      transport({
        url: "https://developer.zhihu.com/v1/chat/completions",
        method: "POST",
        headers: {},
        body: "{}",
      }),
    );

    expect(err._tag).toBe("Failure");
    if (!Exit.isFailure(err)) {
      throw new Error("Expected the transport to fail");
    }
    const error = extractError(err.cause);
    expect(error).toBeInstanceOf(ZhihuDirectAnswerTransportError);
    expect((error as ZhihuDirectAnswerTransportError).reason).toBe("NON_JSON_RESPONSE");
  });

  it("maps an array JSON response to NON_JSON_RESPONSE", async () => {
    const mockFetch = async (): Promise<{
      ok: boolean;
      status: number;
      text: () => Promise<string>;
      headers: { get: (_: string) => string | null };
    }> => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([1, 2, 3]),
      headers: { get: () => "application/json" },
    });

    const transport = makeFetchZhihuDirectAnswerTransport({ fetch: mockFetch, timeoutMs: 5_000 });
    const err = await Effect.runPromiseExit(
      transport({
        url: "https://developer.zhihu.com/v1/chat/completions",
        method: "POST",
        headers: {},
        body: "{}",
      }),
    );

    expect(err._tag).toBe("Failure");
    if (!Exit.isFailure(err)) {
      throw new Error("Expected the transport to fail");
    }
    const error = extractError(err.cause);
    expect(error).toBeInstanceOf(ZhihuDirectAnswerTransportError);
    expect((error as ZhihuDirectAnswerTransportError).reason).toBe("NON_JSON_RESPONSE");
  });
});
