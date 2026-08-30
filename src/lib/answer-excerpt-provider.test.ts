import { Effect } from "effect";

import { beforeAll, describe, expect, it } from "vite-plus/test";

import type {
  AnswerExcerptItemsFetcher,
  AnswerExcerptProvider,
  AnswerExcerptProviderRequest,
  AnswerExcerptProviderFailure,
} from "./answer-excerpt-provider";
import {
  AmbiguousAnswerProviderError,
  AnswerExcerptProviderError,
  AnswerNotFoundProviderError,
  InvalidProviderAnswerError,
  UnsupportedAnswerUrlError,
  makeAnswerExcerptProvider,
} from "./answer-excerpt-provider";

// ── Helpers ──────────────────────────────────────────────────────────────

let _now = 0;
export const advance = (ms: number): void => {
  _now += ms;
};

const makeItem = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  ContentType: "Answer",
  ContentID: "123",
  EditTime: 1_700_000_000_000,
  ContentText: "excerpt text",
  Url: "https://www.zhihu.com/question/42/answer/100",
  ...overrides,
});

const VALID_URL = "https://www.zhihu.com/question/42/answer/100";
const VALID_URL_QS = "https://www.zhihu.com/question/42/answer/100?foo=bar";
const VALID_ALT_HOST = "https://zhihu.com/question/42/answer/100";
const runSuccess = <A>(effect: Effect.Effect<A, unknown>): Promise<A> => Effect.runPromise(effect);
const runFailure = async (
  effect: Effect.Effect<unknown, AnswerExcerptProviderFailure>,
): Promise<AnswerExcerptProviderFailure> => {
  const exit = await Effect.runPromiseExit(effect);
  if (exit._tag !== "Failure") throw new Error("Expected provider failure");
  if (exit.cause._tag !== "Fail") throw new Error("Expected a failed effect");
  return exit.cause.error;
};

// ── Tests ────────────────────────────────────────────────────────────────

describe("answer-excerpt-provider", () => {
  beforeAll(() => {
    _now = 0;
  });

  const fakeClock = (): Effect.Effect<number, never> => Effect.succeed(_now);

  const buildProvider = async (
    fetcher: AnswerExcerptItemsFetcher,
    ttl = 60_000,
  ): Promise<AnswerExcerptProvider> =>
    Effect.runPromise(
      makeAnswerExcerptProvider({
        fetchItems: fetcher,
        ttl,
        now: fakeClock,
      }),
    );

  // ── Success and cache behaviour ────────────────────────────────────────

  describe("success and cache behaviour", () => {
    it("valid URL and matching item resolve to AnswerExcerpt", async () => {
      const provider = await buildProvider(() => Effect.succeed([makeItem()]));
      const result = await runSuccess(provider.resolve(VALID_URL));

      expect(result.questionId).toBe("42");
      expect(result.answerId).toBe("100");
      expect(result.excerpt).toBe("excerpt text");
      expect(result.sourceContentId).toBe("123");
      expect(result.sourceContentType).toBe("Answer");
      expect(result.sourceEditTime).toBe(1_700_000_000_000);
      expect(result.fingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
    });

    it("injected fetcher receives parsed questionId, answerId, and canonicalUrl", async () => {
      let received: AnswerExcerptProviderRequest | null = null;
      const fetcher: AnswerExcerptItemsFetcher = (req) => {
        received = req;
        return Effect.succeed([makeItem()]);
      };

      const provider = await buildProvider(fetcher);
      await runSuccess(provider.resolve(VALID_URL));

      expect(received!.questionId).toBe("42");
      expect(received!.answerId).toBe("100");
      expect(received!.canonicalUrl).toBe("https://www.zhihu.com/question/42/answer/100");
    });

    it("query parameters and alternate supported host forms match after canonicalisation", async () => {
      const provider = await buildProvider(() => Effect.succeed([makeItem()]));

      const r1 = await runSuccess(provider.resolve(VALID_URL_QS));
      expect(r1.questionId).toBe("42");

      const r2 = await runSuccess(provider.resolve(VALID_ALT_HOST));
      expect(r2.questionId).toBe("42");
    });

    it("second resolve for the same identity hits the cache", async () => {
      let calls = 0;
      const fetcher: AnswerExcerptItemsFetcher = () => {
        calls++;
        return Effect.succeed([makeItem()]);
      };

      const provider = await buildProvider(fetcher);
      await runSuccess(provider.resolve(VALID_URL));
      await runSuccess(provider.resolve("https://zhihu.com/question/42/answer/100"));

      expect(calls).toBe(1);
    });

    it("different URL forms of the same identity share a single cache entry", async () => {
      let calls = 0;
      const fetcher: AnswerExcerptItemsFetcher = () => {
        calls++;
        return Effect.succeed([makeItem()]);
      };

      const provider = await buildProvider(fetcher);
      await runSuccess(provider.resolve("https://www.zhihu.com/question/42/answer/100?foo=bar"));
      await runSuccess(provider.resolve("https://zhihu.com/question/42/answer/100"));

      expect(calls).toBe(1);
    });

    it("capturedAt comes from the injected clock and stays stable on cache hits", async () => {
      const ttl = 600_000;
      const provider = await buildProvider(() => Effect.succeed([makeItem()]), ttl);

      const first = await runSuccess(provider.resolve(VALID_URL));
      advance(1000);

      const second = await runSuccess(provider.resolve(VALID_URL));
      expect(second.capturedAt).toBe(first.capturedAt);
    });

    it("non-Answer candidates are ignored", async () => {
      const provider = await buildProvider(() =>
        Effect.succeed([{ ContentType: "Article", ContentID: "1", Url: VALID_URL }, makeItem()]),
      );

      const result = await runSuccess(provider.resolve(VALID_URL));
      expect(result.questionId).toBe("42");
    });

    it("one matching candidate is selected from unrelated valid candidates", async () => {
      const provider = await buildProvider(() =>
        Effect.succeed([
          makeItem({ Url: "https://www.zhihu.com/question/99/answer/200" }),
          makeItem(), // matching candidate
        ]),
      );

      const result = await runSuccess(provider.resolve(VALID_URL));
      expect(result.questionId).toBe("42");
    });
  });

  // ── Failure behaviour ──────────────────────────────────────────────────

  describe("failure behaviour", () => {
    it("unsupported URL fails before the provider is called", async () => {
      let called = false;
      const fetcher: AnswerExcerptItemsFetcher = () => {
        called = true;
        return Effect.fail(new AnswerExcerptProviderError({ reason: "should not run" }));
      };

      const provider = await buildProvider(fetcher);
      const err = await runFailure(provider.resolve("not-a-zhihu-url"));
      expect(err).toBeInstanceOf(UnsupportedAnswerUrlError);
      expect(called).toBe(false);
    });

    it("provider failure is propagated and not cached", async () => {
      let calls = 0;
      const fetcher: AnswerExcerptItemsFetcher = () => {
        calls++;
        return Effect.fail(new AnswerExcerptProviderError({ reason: "fetch failed" }));
      };

      const provider = await buildProvider(fetcher);

      const err1 = await runFailure(provider.resolve(VALID_URL));
      expect(err1).toBeInstanceOf(AnswerExcerptProviderError);

      // Failure is not cached — second call re-computes
      const err2 = await runFailure(provider.resolve(VALID_URL));
      expect(err2).toBeInstanceOf(AnswerExcerptProviderError);
      expect(calls).toBe(2);
    });

    it("zero matching candidates returns not-found and is not cached", async () => {
      let calls = 0;
      const fetcher: AnswerExcerptItemsFetcher = () => {
        calls++;
        return Effect.succeed([makeItem({ Url: "https://www.zhihu.com/question/99/answer/200" })]);
      };

      const provider = await buildProvider(fetcher);

      const err1 = await runFailure(provider.resolve(VALID_URL));
      expect(err1).toBeInstanceOf(AnswerNotFoundProviderError);

      const err2 = await runFailure(provider.resolve(VALID_URL));
      expect(err2).toBeInstanceOf(AnswerNotFoundProviderError);
      expect(calls).toBe(2);
    });

    it("multiple matching candidates returns ambiguous and is not cached", async () => {
      let calls = 0;
      const fetcher: AnswerExcerptItemsFetcher = () => {
        calls++;
        return Effect.succeed([makeItem(), makeItem()]);
      };

      const provider = await buildProvider(fetcher);

      const err1 = await runFailure(provider.resolve(VALID_URL));
      expect(err1).toBeInstanceOf(AmbiguousAnswerProviderError);
      if (err1 instanceof AmbiguousAnswerProviderError) {
        expect(err1.matches).toBe(2);
      }

      const err2 = await runFailure(provider.resolve(VALID_URL));
      expect(err2).toBeInstanceOf(AmbiguousAnswerProviderError);
      expect(calls).toBe(2);
    });

    it("an Answer candidate with an invalid URL is invalid", async () => {
      const provider = await buildProvider(() => Effect.succeed([makeItem({ Url: "not-a-url" })]));

      const err = await runFailure(provider.resolve(VALID_URL));
      expect(err).toBeInstanceOf(InvalidProviderAnswerError);
    });

    it("a non-object candidate is invalid", async () => {
      const provider = await buildProvider(() => Effect.succeed(["not an object" as unknown]));

      const err = await runFailure(provider.resolve(VALID_URL));
      expect(err).toBeInstanceOf(InvalidProviderAnswerError);
      if (err instanceof InvalidProviderAnswerError) expect(err.reason).toBe("ITEM_NOT_OBJECT");
    });

    it("invalid ContentID is invalid", async () => {
      const provider = await buildProvider(() => Effect.succeed([makeItem({ ContentID: "abc" })]));

      const err = await runFailure(provider.resolve(VALID_URL));
      expect(err).toBeInstanceOf(InvalidProviderAnswerError);
    });

    it("invalid EditTime is invalid", async () => {
      const provider = await buildProvider(() => Effect.succeed([makeItem({ EditTime: -1 })]));

      const err = await runFailure(provider.resolve(VALID_URL));
      expect(err).toBeInstanceOf(InvalidProviderAnswerError);
    });

    it("invalid ContentText is invalid", async () => {
      const provider = await buildProvider(() =>
        Effect.succeed([makeItem({ ContentText: 123 as unknown as string })]),
      );

      const err = await runFailure(provider.resolve(VALID_URL));
      expect(err).toBeInstanceOf(InvalidProviderAnswerError);
    });

    it("canonical decimal ContentID beyond Number.MAX_SAFE_INTEGER is accepted", async () => {
      const bigId = "-8765571236311781284";
      const provider = await buildProvider(() => Effect.succeed([makeItem({ ContentID: bigId })]));

      const result = await runSuccess(provider.resolve(VALID_URL));
      expect(result.sourceContentId).toBe(bigId);
    });
  });
});
