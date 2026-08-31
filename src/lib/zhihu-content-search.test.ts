import { Effect } from "effect";

import { describe, expect, it } from "vite-plus/test";

import type {
  FetchItemsError,
  FetchSearchItemsOptions,
  SearchProvider,
  SearchTransport,
  SearchTransportRequest,
} from "./zhihu-content-search";
import {
  SearchError,
  SearchTransportError,
  fetchSearchItems,
  makeFetchSearchTransport,
} from "./zhihu-content-search";

// ── Helpers ─────────────────────────────────────────────────────────────────────

const runSuccess = <A>(effect: Effect.Effect<A, FetchItemsError>): Promise<A> =>
  Effect.runPromise(effect);

const runFailure = async (
  effect: Effect.Effect<unknown, FetchItemsError>,
): Promise<FetchItemsError> => {
  const exit = await Effect.runPromiseExit(effect);
  if (exit._tag !== "Failure") throw new Error("Expected failure");
  if (exit.cause._tag !== "Fail") throw new Error("Expected a failed effect");
  return exit.cause.error;
};

const makeFakeTransport = (
  handler: (request: SearchTransportRequest) => unknown,
): SearchTransport => {
  return (request) => {
    const result = handler(request);
    return Effect.isEffect(result)
      ? (result as Effect.Effect<unknown, SearchTransportError>)
      : Effect.succeed(result);
  };
};

const VALID_ITEMS: readonly unknown[] = [
  { Title: "First", Url: "https://zhihu.com/question/1/answer/1" },
];

const VALID_RESPONSE = { Code: 0, Data: { Items: VALID_ITEMS } };
const FULL_RESPONSE = { Code: 0, Data: { Items: [], Extra: "ignored" } };

const BASE_URL = "https://developer.zhihu.com";
const VALID_QUERY = "some claim text";
const VALID_SECRET = "my-secret-token";

const defaultOptions = (
  provider: SearchProvider = "zhihu_search",
): Omit<FetchSearchItemsOptions, "filter"> => ({
  provider,
  accessSecret: VALID_SECRET,
  query: VALID_QUERY,
  transport: makeFakeTransport(() => VALID_RESPONSE),
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("zhihu-content-search", () => {
  // ── Request construction ─────────────────────────────────────────────────

  describe("request construction", () => {
    it("builds the zhihu_search path with the query encoded as Query", async () => {
      let captured: SearchTransportRequest | null = null;
      const transport = makeFakeTransport((req) => {
        captured = req;
        return VALID_RESPONSE;
      });

      await runSuccess(fetchSearchItems({ ...defaultOptions("zhihu_search"), transport }));
      expect(captured).not.toBeNull();
      expect(captured!.url).toBe(
        `${BASE_URL}/api/v1/content/zhihu_search?Query=${encodeURIComponent(VALID_QUERY)}`,
      );
    });

    it("builds the global_search path with the query as Query", async () => {
      let captured: SearchTransportRequest | null = null;
      const transport = makeFakeTransport((req) => {
        captured = req;
        return VALID_RESPONSE;
      });

      await runSuccess(fetchSearchItems({ ...defaultOptions("global_search"), transport }));
      expect(captured).not.toBeNull();
      expect(captured!.url).toBe(
        `${BASE_URL}/api/v1/content/global_search?Query=${encodeURIComponent(VALID_QUERY)}`,
      );
    });

    it("appends optional filter only for global_search", async () => {
      let captured: SearchTransportRequest | null = null;
      const transport = makeFakeTransport((req) => {
        captured = req;
        return VALID_RESPONSE;
      });

      await runSuccess(
        fetchSearchItems({
          ...defaultOptions("global_search"),
          transport,
          filter: "zhihu",
        }),
      );

      expect(captured).not.toBeNull();
      expect(captured!.url).toContain("filter=");
      expect(captured!.url).toContain(encodeURIComponent("zhihu"));
      expect(captured!.url).not.toContain("zhihu_search");
    });

    it("does not include filter for zhihu_search", async () => {
      let captured: SearchTransportRequest | null = null;
      const transport = makeFakeTransport((req) => {
        captured = req;
        return VALID_RESPONSE;
      });

      await runSuccess(
        fetchSearchItems({
          ...defaultOptions("zhihu_search"),
          transport,
          filter: "zhihu",
        }),
      );

      expect(captured).not.toBeNull();
      expect(captured!.url).not.toContain("filter=");
    });

    it("sets Authorization and X-Request-Timestamp headers", async () => {
      let captured: SearchTransportRequest | null = null;
      const transport = makeFakeTransport((req) => {
        captured = req;
        return VALID_RESPONSE;
      });

      await runSuccess(
        fetchSearchItems({
          ...defaultOptions(),
          transport,
          now: () => Effect.succeed(1_700_000_000_123),
        }),
      );

      expect(captured).not.toBeNull();
      expect(captured!.headers["Authorization"]).toBe(`Bearer ${VALID_SECRET}`);
      expect(captured!.headers["X-Request-Timestamp"]).toBe("1700000000");
    });

    it("uses injectable clock for timestamp", async () => {
      let captured: SearchTransportRequest | null = null;
      const transport = makeFakeTransport((req) => {
        captured = req;
        return VALID_RESPONSE;
      });

      await runSuccess(
        fetchSearchItems({
          ...defaultOptions(),
          transport,
          now: () => Effect.succeed(2_000_000_000_000),
        }),
      );

      expect(captured).not.toBeNull();
      expect(captured!.headers["X-Request-Timestamp"]).toBe("2000000000");
    });
  });

  // ── Input validation ─────────────────────────────────────────────────────

  describe("input validation", () => {
    it("fails with BLANK_ACCESS_SECRET for blank accessSecret", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          accessSecret: "   ",
        }),
      );

      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("BLANK_ACCESS_SECRET");
    });

    it("fails with BLANK_ACCESS_SECRET for empty accessSecret", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          accessSecret: "",
        }),
      );

      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("BLANK_ACCESS_SECRET");
    });

    it("fails with BLANK_QUERY for whitespace-only query", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          query: "   ",
        }),
      );

      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("BLANK_QUERY");
    });
  });

  // ── Envelope validation ───────────────────────────────────────────────────

  describe("envelope validation", () => {
    it("returns Data.Items when Code is 0", async () => {
      const result = await runSuccess(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => VALID_RESPONSE),
        }),
      );
      expect(result).toBe(VALID_ITEMS);
    });

    it("returns empty items array when Code is 0 and Items is empty", async () => {
      const result = await runSuccess(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => FULL_RESPONSE),
        }),
      );
      expect(result).toEqual([]);
    });

    it("returns items as-is without processing", async () => {
      const customItems = [
        {
          ContentType: "Answer",
          ContentID: "42",
          EditTime: 999,
          Title: "test",
        },
      ];
      const result = await runSuccess(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => ({ Code: 0, Data: { Items: customItems } })),
        }),
      );
      expect(result).toBe(customItems);
    });

    it("fails with ENVELOPE_NOT_OBJECT when result is null", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => null),
        }),
      );
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("ENVELOPE_NOT_OBJECT");
    });

    it("fails with ENVELOPE_NOT_OBJECT when result is an array", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => []),
        }),
      );
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("ENVELOPE_NOT_OBJECT");
    });

    it("fails with MISSING_CODE when Code is not present", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => ({ Data: { Items: [] } })),
        }),
      );
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("MISSING_CODE");
    });

    it("fails with MISSING_CODE when Code is not a number", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => ({ Code: "oops", Data: { Items: [] } })),
        }),
      );
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("MISSING_CODE");
    });

    it("fails with NON_ZERO_CODE when Code is non-zero", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => ({ Code: 1001, Data: { Items: [] } })),
        }),
      );
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("NON_ZERO_CODE");
    });

    it("fails with API_RATE_LIMITED when Code is 30001", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => ({ Code: 30001, Data: null })),
        }),
      );
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("API_RATE_LIMITED");
    });

    it("fails with API_QUOTA_EXCEEDED when Code is 30002", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => ({ Code: 30002, Data: null })),
        }),
      );
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("API_QUOTA_EXCEEDED");
    });

    it("fails with NON_ZERO_CODE when Code is negative", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => ({ Code: -1, Data: { Items: [] } })),
        }),
      );
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("NON_ZERO_CODE");
    });

    it("fails with DATA_NOT_OBJECT when Data is missing", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => ({ Code: 0 })),
        }),
      );
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("DATA_NOT_OBJECT");
    });

    it("fails with DATA_NOT_OBJECT when Data is an array", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => ({ Code: 0, Data: [] })),
        }),
      );
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("DATA_NOT_OBJECT");
    });

    it("fails with DATA_NOT_OBJECT when Data is null", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => ({ Code: 0, Data: null })),
        }),
      );
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("DATA_NOT_OBJECT");
    });

    it("fails with ITEMS_NOT_ARRAY when Data.Items is missing", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => ({ Code: 0, Data: {} })),
        }),
      );
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("ITEMS_NOT_ARRAY");
    });

    it("fails with ITEMS_NOT_ARRAY when Data.Items is a string", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() => ({ Code: 0, Data: { Items: "nope" } })),
        }),
      );
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("ITEMS_NOT_ARRAY");
    });
  });

  // ── Transport failure mapping ────────────────────────────────────────────

  describe("transport failure mapping", () => {
    it("maps HTTP_STATUS transport error with status code", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() =>
            Effect.fail(new SearchTransportError({ reason: "HTTP_STATUS", status: 429 })),
          ),
        }),
      );
      expect(error).toBeInstanceOf(SearchTransportError);
      expect((error as SearchTransportError).reason).toBe("HTTP_STATUS");
      expect((error as SearchTransportError).status).toBe(429);
    });

    it("maps NETWORK_FAILED transport error", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() =>
            Effect.fail(new SearchTransportError({ reason: "NETWORK_FAILED" })),
          ),
        }),
      );
      expect(error).toBeInstanceOf(SearchTransportError);
      expect((error as SearchTransportError).reason).toBe("NETWORK_FAILED");
    });

    it("maps NON_JSON_RESPONSE transport error", async () => {
      const error = await runFailure(
        fetchSearchItems({
          ...defaultOptions(),
          transport: makeFakeTransport(() =>
            Effect.fail(new SearchTransportError({ reason: "NON_JSON_RESPONSE" })),
          ),
        }),
      );
      expect(error).toBeInstanceOf(SearchTransportError);
      expect((error as SearchTransportError).reason).toBe("NON_JSON_RESPONSE");
    });
  });

  // ── Factory transport ────────────────────────────────────────────────────

  describe("makeFetchSearchTransport", () => {
    it("returns items for a successful response", async () => {
      // We can't use real fetch, so we verify via the adapter.
      const transport = makeFetchSearchTransport({
        fetch: async () =>
          new Response(JSON.stringify({ Code: 0, Data: { Items: [42] } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        timeoutMs: 5_000,
      });

      const result = await runSuccess(
        fetchSearchItems({
          ...defaultOptions(),
          transport,
        }),
      );
      expect(result).toEqual([42]);
    });

    it("maps HTTP failures with their status", async () => {
      const transport = makeFetchSearchTransport({
        fetch: async () => new Response("rate limited", { status: 429 }),
        timeoutMs: 5_000,
      });

      const error = await runFailure(fetchSearchItems({ ...defaultOptions(), transport }));
      expect(error).toBeInstanceOf(SearchTransportError);
      expect((error as SearchTransportError).reason).toBe("HTTP_STATUS");
      expect((error as SearchTransportError).status).toBe(429);
    });

    it("maps non-JSON bodies to NON_JSON_RESPONSE", async () => {
      const transport = makeFetchSearchTransport({
        fetch: async () => new Response("<html></html>", { status: 200 }),
        timeoutMs: 5_000,
      });

      const error = await runFailure(fetchSearchItems({ ...defaultOptions(), transport }));
      expect(error).toBeInstanceOf(SearchTransportError);
      expect((error as SearchTransportError).reason).toBe("NON_JSON_RESPONSE");
    });
  });
});
