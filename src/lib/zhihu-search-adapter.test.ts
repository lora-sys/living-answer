import { Effect } from "effect";

import { describe, expect, it } from "vite-plus/test";

import type { AnswerExcerptItemsFetcher } from "./answer-excerpt-provider";
import {
  AnswerExcerptProviderError,
  AnswerNotFoundProviderError,
  makeAnswerExcerptProvider,
  QuotaExceededProviderError,
  RateLimitedProviderError,
  type AnswerExcerptProviderFailure,
} from "./answer-excerpt-provider";

import type {
  ZhihuSearchTransport,
  ZhihuSearchTransportFailureReason,
  ZhihuSearchTransportRequest,
} from "./zhihu-search-adapter";
import {
  makeFetchZhihuSearchTransport,
  makeZhihuSearchItemsFetcher,
  ZhihuSearchTransportError,
} from "./zhihu-search-adapter";

// ── Helpers ────────────────────────────────────────────────────────────────────

const VALID_URL = "https://www.zhihu.com/question/42/answer/100";

const runSuccess = <A>(effect: Effect.Effect<A, unknown>): Promise<A> => Effect.runPromise(effect);

const runFailure = async (
  effect: Effect.Effect<readonly unknown[], AnswerExcerptProviderFailure>,
): Promise<AnswerExcerptProviderFailure> => {
  const exit = await Effect.runPromiseExit(effect);
  if (exit._tag !== "Failure") throw new Error("Expected provider failure");
  if (exit.cause._tag !== "Fail") throw new Error("Expected a failed effect");
  return exit.cause.error;
};

const runFetchFailure = async (
  effect: Effect.Effect<unknown, ZhihuSearchTransportError>,
): Promise<ZhihuSearchTransportError> => {
  const exit = await Effect.runPromiseExit(effect);
  if (exit._tag !== "Failure") throw new Error("Expected transport failure");
  if (exit.cause._tag !== "Fail") throw new Error("Expected a failed effect");
  return exit.cause.error;
};

const makeFakeTransport = <T>(
  handler: (
    request: ZhihuSearchTransportRequest,
  ) => T | Effect.Effect<T, ZhihuSearchTransportError>,
): ZhihuSearchTransport => {
  return (request) => {
    const result = handler(request);
    return Effect.isEffect(result)
      ? (result as Effect.Effect<T, ZhihuSearchTransportError>)
      : (Effect.succeed(result) as Effect.Effect<T, ZhihuSearchTransportError>);
  };
};

const expectHeaders = (
  captured: ZhihuSearchTransportRequest | null,
  url: string,
  secret: string,
): void => {
  expect(captured).not.toBeNull();
  expect(captured!.url).toBe(
    `${url}/api/v1/content/zhihu_search?Query=${encodeURIComponent(VALID_URL)}`,
  );
  expect(captured!.headers["X-Request-Timestamp"]).toMatch(/^\d+$/);
  expect(captured!.headers["Authorization"]).toBe(`Bearer ${secret}`);
};

const VALID_ITEMS: readonly unknown[] = [
  {
    ContentType: "Answer",
    ContentID: "123",
    EditTime: 1_700_000_000_000,
    ContentText: "excerpt text",
    Url: VALID_URL,
  },
];

const VALID_RESPONSE = { Code: 0, Data: { Items: VALID_ITEMS } };

describe("zhihu-search-adapter", () => {
  // ── Request construction ────────────────────────────────────────────────────

  describe("request construction", () => {
    it("builds the documented path and sends the canonical URL as Query", async () => {
      let captured: ZhihuSearchTransportRequest | null = null;
      const transport = makeFakeTransport((request) => {
        captured = request;
        return VALID_RESPONSE;
      });
      const fetcher = makeZhihuSearchItemsFetcher({
        accessSecret: "secret",
        transport,
        now: () => Effect.succeed(1_700_000_000_000),
      });

      await runSuccess(fetcher({ questionId: "42", answerId: "100", canonicalUrl: VALID_URL }));

      expect(captured).not.toBeNull();
      expect(captured!.url).toBe(
        "https://developer.zhihu.com/api/v1/content/zhihu_search?Query=" +
          encodeURIComponent(VALID_URL),
      );
    });

    it("sends integer-second timestamp and Bearer auth without exposing the secret", async () => {
      let captured: ZhihuSearchTransportRequest | null = null;
      const transport: ZhihuSearchTransport = (req) => {
        captured = req;
        return Effect.succeed(VALID_RESPONSE);
      };

      const fetcher = makeZhihuSearchItemsFetcher({
        accessSecret: "my-secret",
        transport,
        now: () => Effect.succeed(1_700_000_000_000),
      });

      await runSuccess(
        fetcher({
          questionId: "42",
          answerId: "100",
          canonicalUrl: VALID_URL,
        }),
      );

      expectHeaders(captured, "https://developer.zhihu.com", "my-secret");
      expect(Number(captured!.headers["X-Request-Timestamp"])).toBe(1_700_000_000);
    });

    it("uses a custom baseUrl when supplied", async () => {
      let captured: ZhihuSearchTransportRequest | null = null;
      const transport: ZhihuSearchTransport = (req) => {
        captured = req;
        return Effect.succeed(VALID_RESPONSE);
      };

      const fetcher = makeZhihuSearchItemsFetcher({
        accessSecret: "secret",
        baseUrl: "https://custom.example.com",
        transport,
        now: () => Effect.succeed(1_700_000_000_000),
      });

      await runSuccess(fetcher({ questionId: "42", answerId: "100", canonicalUrl: VALID_URL }));

      expect(captured!.url).toBe(
        "https://custom.example.com/api/v1/content/zhihu_search?Query=" +
          encodeURIComponent(VALID_URL),
      );
    });
  });

  // ── Adapter contract ────────────────────────────────────────────────────────

  describe("items fetcher contract", () => {
    const makeFetcher = (
      transport: ZhihuSearchTransport,
      secret = "secret",
      clockReturn = 1_700_000_000_000,
    ): AnswerExcerptItemsFetcher =>
      makeZhihuSearchItemsFetcher({
        accessSecret: secret,
        transport,
        now: () => Effect.succeed(clockReturn),
      });

    it("returns valid Data.Items unchanged", async () => {
      const fetcher = makeFetcher(makeFakeTransport(() => VALID_RESPONSE));
      const result = await runSuccess(
        fetcher({
          questionId: "42",
          answerId: "100",
          canonicalUrl: VALID_URL,
        }),
      );

      expect(result).toBe(VALID_ITEMS);
    });

    it("returns an empty array for an empty valid Items array", async () => {
      const fetcher = makeFetcher(makeFakeTransport(() => ({ Code: 0, Data: { Items: [] } })));
      const result = await runSuccess(
        fetcher({
          questionId: "42",
          answerId: "100",
          canonicalUrl: VALID_URL,
        }),
      );

      expect(result).toEqual([]);
    });

    it("maps a non-zero API code to AnswerExcerptProviderError", async () => {
      const fetcher = makeFetcher(makeFakeTransport(() => ({ Code: 1 })));
      const err = await runFailure(
        fetcher({
          questionId: "42",
          answerId: "100",
          canonicalUrl: VALID_URL,
        }),
      );

      expect(err).toBeInstanceOf(AnswerExcerptProviderError);
      expect((err as AnswerExcerptProviderError).reason).toMatch(/non-zero code/);
    });

    it("maps API rate limit code 30001 to a typed rate-limit failure", async () => {
      const fetcher = makeFetcher(makeFakeTransport(() => ({ Code: 30001, Data: null })));
      const error = await runFailure(
        fetcher({ questionId: "42", answerId: "100", canonicalUrl: VALID_URL }),
      );

      expect(error).toBeInstanceOf(RateLimitedProviderError);
    });

    it("maps HTTP 429 to a typed rate-limit failure", async () => {
      const transport = makeFakeTransport(() =>
        Effect.fail(new ZhihuSearchTransportError({ reason: "HTTP_STATUS", status: 429 })),
      );
      const fetcher = makeFetcher(transport);
      const error = await runFailure(
        fetcher({ questionId: "42", answerId: "100", canonicalUrl: VALID_URL }),
      );

      expect(error).toBeInstanceOf(RateLimitedProviderError);
    });

    it("maps API quota code 30002 to a typed quota failure", async () => {
      const fetcher = makeFetcher(makeFakeTransport(() => ({ Code: 30002, Data: null })));
      const error = await runFailure(
        fetcher({ questionId: "42", answerId: "100", canonicalUrl: VALID_URL }),
      );

      expect(error).toBeInstanceOf(QuotaExceededProviderError);
    });

    it("maps a non-object JSON envelope to AnswerExcerptProviderError", async () => {
      const fetcher = makeFetcher(makeFakeTransport(() => ["not", "an", "object"]));
      const err = await runFailure(
        fetcher({
          questionId: "42",
          answerId: "100",
          canonicalUrl: VALID_URL,
        }),
      );

      expect(err).toBeInstanceOf(AnswerExcerptProviderError);
    });

    it("maps missing numeric Code to AnswerExcerptProviderError", async () => {
      const fetcher = makeFetcher(makeFakeTransport(() => ({ Data: { Items: [] } })));
      const err = await runFailure(
        fetcher({
          questionId: "42",
          answerId: "100",
          canonicalUrl: VALID_URL,
        }),
      );

      expect(err).toBeInstanceOf(AnswerExcerptProviderError);
      expect((err as AnswerExcerptProviderError).reason).toMatch(/Code/);
    });

    it("maps invalid Data to AnswerExcerptProviderError", async () => {
      const fetcher = makeFetcher(makeFakeTransport(() => ({ Code: 0, Data: [] })));
      const err = await runFailure(
        fetcher({
          questionId: "42",
          answerId: "100",
          canonicalUrl: VALID_URL,
        }),
      );

      expect(err).toBeInstanceOf(AnswerExcerptProviderError);
      expect((err as AnswerExcerptProviderError).reason).toMatch(/Data/);
    });

    it("maps invalid Items to AnswerExcerptProviderError", async () => {
      const fetcher = makeFetcher(
        makeFakeTransport(() => ({ Code: 0, Data: { Items: "not-an-array" } })),
      );
      const err = await runFailure(
        fetcher({
          questionId: "42",
          answerId: "100",
          canonicalUrl: VALID_URL,
        }),
      );

      expect(err).toBeInstanceOf(AnswerExcerptProviderError);
      expect((err as AnswerExcerptProviderError).reason).toMatch(/Items/);
    });

    it("maps all transport failures to AnswerExcerptProviderError", async () => {
      const reasons: ZhihuSearchTransportFailureReason[] = [
        "NETWORK_FAILED",
        "HTTP_STATUS",
        "NON_JSON_RESPONSE",
      ];

      for (const reason of reasons) {
        const transportError = new ZhihuSearchTransportError({ reason });
        const transport: ZhihuSearchTransport = () => Effect.fail(transportError);
        const fetcher = makeFetcher(transport);
        const err = await runFailure(
          fetcher({
            questionId: "42",
            answerId: "100",
            canonicalUrl: VALID_URL,
          }),
        );

        expect(err).toBeInstanceOf(AnswerExcerptProviderError);
        expect((err as AnswerExcerptProviderError).reason).toMatch(
          new RegExp(`transport ${reason}`),
        );
      }
    });

    it("maps HTTP_STATUS failure with numeric status code", async () => {
      const transportError = new ZhihuSearchTransportError({
        reason: "HTTP_STATUS",
        status: 403,
      });
      const transport: ZhihuSearchTransport = () => Effect.fail(transportError);
      const fetcher = makeFetcher(transport);
      const err = await runFailure(
        fetcher({
          questionId: "42",
          answerId: "100",
          canonicalUrl: VALID_URL,
        }),
      );

      expect((err as AnswerExcerptProviderError).reason).toMatch(/status.*403/);
    });

    it("fails before calling transport when accessSecret is blank", async () => {
      let called = false;
      const transport: ZhihuSearchTransport = () => {
        called = true;
        return Effect.succeed(VALID_ITEMS);
      };

      const fetcher = makeZhihuSearchItemsFetcher({
        accessSecret: "",
        transport,
        now: () => Effect.succeed(1_700_000_000_000),
      });

      const err = await runFailure(
        fetcher({
          questionId: "42",
          answerId: "100",
          canonicalUrl: VALID_URL,
        }),
      );

      expect(err).toBeInstanceOf(AnswerExcerptProviderError);
      expect(called).toBe(false);
    });
  });

  // ── End-to-end wiring ───────────────────────────────────────────────────────

  describe("end-to-end wiring", () => {
    it("produces a valid AnswerExcerpt via makeAnswerExcerptProvider", async () => {
      const adapterTransport: ZhihuSearchTransport = () => Effect.succeed(VALID_RESPONSE);

      const fetcher: AnswerExcerptItemsFetcher = makeZhihuSearchItemsFetcher({
        accessSecret: "secret",
        transport: adapterTransport,
        now: () => Effect.succeed(1_700_000_000_000),
      });

      let capturedNow = 0;
      const provider = await Effect.runPromise(
        makeAnswerExcerptProvider({
          fetchItems: fetcher,
          ttl: 60_000,
          now: () => {
            capturedNow += 100;
            return Effect.succeed(capturedNow);
          },
        }),
      );

      const result = await runSuccess(provider.resolve(VALID_URL));

      expect(result).toBeDefined();
      expect(result.questionId).toBe("42");
      expect(result.answerId).toBe("100");
      expect(result.excerpt).toBe("excerpt text");
      expect(result.sourceContentType).toBe("Answer");
      expect(result.fingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
    });

    it("caches the resolved excerpt", async () => {
      let transportCalls = 0;
      const adapterTransport: ZhihuSearchTransport = () => {
        transportCalls++;
        return Effect.succeed(VALID_RESPONSE);
      };

      const fetcher: AnswerExcerptItemsFetcher = makeZhihuSearchItemsFetcher({
        accessSecret: "secret",
        transport: adapterTransport,
        now: () => Effect.succeed(1_700_000_000),
      });

      const ttl = 10_000_000;
      const provider = await Effect.runPromise(
        makeAnswerExcerptProvider({
          fetchItems: fetcher,
          ttl,
          now: () => Effect.succeed(100),
        }),
      );

      await runSuccess(provider.resolve(VALID_URL));
      await runSuccess(provider.resolve(VALID_URL));

      expect(transportCalls).toBe(1);
    });

    it("returns AnswerNotFoundProviderError when transport returns empty Items", async () => {
      const adapterTransport: ZhihuSearchTransport = () =>
        Effect.succeed({ Code: 0, Data: { Items: [] } });
      const fetcher: AnswerExcerptItemsFetcher = makeZhihuSearchItemsFetcher({
        accessSecret: "secret",
        transport: adapterTransport,
        now: () => Effect.succeed(1_700_000_000),
      });

      const provider = await Effect.runPromise(
        makeAnswerExcerptProvider({
          fetchItems: fetcher,
          ttl: 60_000,
          now: () => Effect.succeed(100),
        }),
      );

      const exit = await Effect.runPromiseExit(provider.resolve(VALID_URL));
      if (exit._tag !== "Failure") throw new Error("Expected failure");
      if (exit.cause._tag !== "Fail") throw new Error("Expected Fail cause");
      const result = exit.cause.error;
      expect(result).toBeInstanceOf(AnswerNotFoundProviderError);
    });
  });

  // ── Fetch transport helper ──────────────────────────────────────────────────

  describe("makeFetchZhihuSearchTransport", () => {
    it("forwards URL and headers to the injected fetch", async () => {
      let captured: { url: string; headers: HeadersInit } | undefined;

      const mockFetch = async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ): Promise<Response> => {
        const url = input instanceof Request ? input.url : String(input);
        captured = { url, headers: init?.headers ?? {} };
        return new Response(JSON.stringify(VALID_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const transport = makeFetchZhihuSearchTransport({
        fetch: mockFetch,
        timeoutMs: 5_000,
      });

      await runSuccess(
        transport({
          url: "https://api.example.com/test",
          headers: Object.freeze({ "X-Custom": "value" }),
        }),
      );

      expect(captured!.url).toBe("https://api.example.com/test");
      expect(captured!.headers).toEqual({
        "X-Custom": "value",
      });
    });

    it("maps a network throw to NETWORK_FAILED", async () => {
      const mockFetch = async (): Promise<Response> => {
        throw new Error("network down");
      };

      const transport = makeFetchZhihuSearchTransport({
        fetch: mockFetch,
        timeoutMs: 5_000,
      });

      const err = await runFetchFailure(
        transport({ url: "https://api.example.com/test", headers: {} }),
      );

      expect(err).toBeInstanceOf(ZhihuSearchTransportError);
      expect(err.reason).toBe("NETWORK_FAILED");
    });

    it("maps non-2xx to HTTP_STATUS with the numeric status", async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response("not found", { status: 404 });
      };

      const transport = makeFetchZhihuSearchTransport({
        fetch: mockFetch,
        timeoutMs: 5_000,
      });

      const err = await runFetchFailure(
        transport({ url: "https://api.example.com/test", headers: {} }),
      );

      expect(err).toBeInstanceOf(ZhihuSearchTransportError);
      expect(err.reason).toBe("HTTP_STATUS");
      expect(err.status).toBe(404);
    });

    it("maps malformed JSON to NON_JSON_RESPONSE", async () => {
      const mockFetch = async (): Promise<Response> => {
        // Return a Response that will throw on .json() due to malformed JSON.
        return new Response("not valid json{[", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const transport = makeFetchZhihuSearchTransport({
        fetch: mockFetch,
        timeoutMs: 5_000,
      });

      const err = await runFetchFailure(
        transport({ url: "https://api.example.com/test", headers: {} }),
      );

      expect(err).toBeInstanceOf(ZhihuSearchTransportError);
      expect(err.reason).toBe("NON_JSON_RESPONSE");
    });

    it("maps an array JSON response to NON_JSON_RESPONSE", async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response(JSON.stringify([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const transport = makeFetchZhihuSearchTransport({
        fetch: mockFetch,
        timeoutMs: 5_000,
      });

      const err = await runFetchFailure(
        transport({ url: "https://api.example.com/test", headers: {} }),
      );

      expect(err).toBeInstanceOf(ZhihuSearchTransportError);
      expect(err.reason).toBe("NON_JSON_RESPONSE");
    });
  });
});
