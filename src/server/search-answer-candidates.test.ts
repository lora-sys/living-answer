import { describe, expect, it, vi, beforeEach } from "vite-plus/test";
import { Effect } from "effect";

import {
  createSearchAnswerCandidatesHandler,
  type SearchAnswerCandidatesDeps,
} from "./search-answer-candidates";

import type { AnswerExcerpt } from "../lib/answer-excerpt";
import type { ExcerptStore } from "../lib/excerpt-store";
import { StoreError } from "../lib/excerpt-store";
import { SearchError } from "../lib/zhihu-content-search";
import type { DailyQuotaGuard } from "../lib/daily-quota";
import { QuotaExceededError, DailyQuotaStoreError } from "../lib/daily-quota";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@tanstack/react-start", () => ({
  createServerFn: vi.fn(() => ({
    validator: vi.fn().mockReturnThis(),
    handler: vi.fn().mockReturnThis(),
  })),
}));

vi.mock("../lib/zhihu-content-search", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/zhihu-content-search")>();
  return {
    ...original,
    fetchSearchItems: vi.fn(),
    makeFetchSearchTransport: vi.fn(),
  };
});

vi.mock("../lib/excerpt-store", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/excerpt-store")>();
  return {
    ...original,
    makeSqliteExcerptStore: vi.fn(),
  };
});

vi.mock("../lib/daily-quota", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/daily-quota")>();
  return {
    ...original,
    makeDailyQuotaGuard: vi.fn(),
  };
});

vi.mock("../lib/sqlite-daily-quota-store", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/sqlite-daily-quota-store")>();
  return {
    ...original,
    makeSqliteDailyQuotaStore: vi.fn(),
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────

type FakeStorePair = { readonly store: ExcerptStore; readonly saved: AnswerExcerpt[] };

const makeFakeStore = (): FakeStorePair => {
  const saved: AnswerExcerpt[] = [];
  return {
    saved,
    store: {
      save: (excerpt: AnswerExcerpt) => {
        saved.push(excerpt);
        return Effect.succeed(void 0);
      },
      findLatest: vi.fn(() => Effect.succeed(null)),
    },
  };
};

const makeFailingStorePair = (): FakeStorePair => ({
  store: {
    save: () => Effect.fail(new StoreError({ reason: "disk full" })),
    findLatest: vi.fn(() => Effect.succeed(null)),
  },
  saved: [],
});

const makeDeps = (secret?: string, storePair?: FakeStorePair): SearchAnswerCandidatesDeps => ({
  getSecret: vi.fn(() => secret),
  createStore: vi.fn(async () => {
    if (storePair) return storePair.store;
    return makeFakeStore().store;
  }),
  createQuotaGuard: vi.fn(async () => ({
    consume: vi.fn(() => Effect.succeed(void 0)),
  })),
});

const handler = createSearchAnswerCandidatesHandler(makeDeps("test-secret", makeFakeStore()));

// ── Tests ────────────────────────────────────────────────────────────────

describe("search-answer-candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("request validation", () => {
    it("returns INVALID_REQUEST for blank query", async () => {
      const result = await handler({ query: "   " });
      expect(result.status).toBe("error");
      if (result.status === "error") expect(result.code).toBe("INVALID_REQUEST");
    });
  });

  describe("credential handling", () => {
    it("returns MISSING_ACCESS_SECRET without secret", async () => {
      const h = createSearchAnswerCandidatesHandler(makeDeps(undefined));
      const result = await h({ query: "test" });
      expect(result.status).toBe("error");
      if (result.status === "error") expect(result.code).toBe("MISSING_ACCESS_SECRET");
    });
  });

  describe("candidate extraction", () => {
    it("extracts candidates from valid items", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const items = [
        {
          ContentType: "Answer",
          Title: "React 19 changes",
          Url: "https://www.zhihu.com/question/42/answer/100",
          ContentID: "1",
          EditTime: 1_700_000_000,
          ContentText: "Some text about React",
        },
        { ContentType: "Article", Title: "No URL item", ContentText: "no url" },
        { ContentType: "Answer", Title: "Bad URL", Url: "https://example.com/foo" },
        {
          ContentType: "Answer",
          Title: "Duplicate",
          Url: "https://www.zhihu.com/question/42/answer/100",
          ContentID: "1",
          EditTime: 1_700_000_000,
          ContentText: "dup",
        },
        {
          ContentType: "Answer",
          Title: "Second answer",
          Url: "https://www.zhihu.com/question/43/answer/200",
          ContentID: "2",
          EditTime: 1_700_000_000,
          ContentText: "Second preview",
        },
      ];

      (fetchSearchItems as ReturnType<typeof vi.fn>).mockReturnValue(Effect.succeed(items));

      const result = await handler({ query: "react" });
      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.candidates).toHaveLength(2);
        expect(result.candidates[0].answerId).toBe("100");
        expect(result.candidates[0].title).toBe("React 19 changes");
        expect(result.candidates[0].preview).toBe("Some text about React");
        expect(result.candidates[1].answerId).toBe("200");
      }
    });
  });

  // ── Excerpt persistence ───────────────────────────────────────────────

  describe("excerpt persistence", () => {
    it("creates and persists excerpts for valid items", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const items = [
        {
          ContentType: "Answer",
          Title: "Valid answer",
          Url: "https://www.zhihu.com/question/42/answer/100",
          ContentID: "123",
          EditTime: 1_700_000_000_000,
          ContentText: "Answer content here",
        },
        {
          ContentType: "Article", // non-Answer, skipped
          Url: "https://www.zhihu.com/question/42/answer/200",
          ContentID: "456",
          EditTime: 1700000000000,
          ContentText: "Article text",
        },
      ];

      (fetchSearchItems as ReturnType<typeof vi.fn>).mockReturnValue(Effect.succeed(items));

      const storePair = makeFakeStore();
      const h = createSearchAnswerCandidatesHandler(makeDeps("test-secret", storePair));
      const result = await h({ query: "react" });

      expect(result.status).toBe("ok");
      expect(storePair.saved).toHaveLength(1);
      expect(storePair.saved[0].questionId).toBe("42");
      expect(storePair.saved[0].answerId).toBe("100");
      expect(storePair.saved[0].sourceContentId).toBe("123");
      expect(storePair.saved[0].sourceContentType).toBe("Answer");
      expect(storePair.saved[0].excerpt).toBe("Answer content here");
    });

    it("strips <em> highlight markup from excerpt text", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const items = [
        {
          ContentType: "Answer",
          Url: "https://www.zhihu.com/question/1/answer/1",
          ContentID: "1",
          EditTime: 1000,
          ContentText: "some <em>highlighted</em> text",
        },
      ];

      (fetchSearchItems as ReturnType<typeof vi.fn>).mockReturnValue(Effect.succeed(items));

      const storePair = makeFakeStore();
      const h = createSearchAnswerCandidatesHandler(makeDeps("secret", storePair));
      const result = await h({ query: "test" });

      expect(result.status).toBe("ok");
      expect(storePair.saved).toHaveLength(1);
      expect(storePair.saved[0].excerpt).toBe("some highlighted text");
    });

    it("skips malformed items without creating invalid excerpts", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const items = [
        {
          ContentType: "Answer",
          Title: "No URL",
          ContentID: "1",
          EditTime: 1000,
          ContentText: "text",
        },
        { ContentType: "Answer", Url: "https://example.com/not-zhihu" },
        {
          ContentType: "Answer",
          Url: "https://www.zhihu.com/question/1/answer/1",
          // missing ContentID, EditTime, ContentText
        },
        {
          ContentType: "Answer",
          Url: "https://www.zhihu.com/question/1/answer/2",
          ContentID: "abc",
          EditTime: 1000,
          ContentText: "bad id",
        },
        {
          ContentType: "Answer",
          Url: "https://www.zhihu.com/question/1/answer/3",
          ContentID: "1",
          EditTime: "not-a-number",
          ContentText: "bad time",
        },
        {
          ContentType: "Answer",
          Url: "https://www.zhihu.com/question/1/answer/4",
          ContentID: "1",
          EditTime: 1000,
          ContentText: "",
        },
      ];

      (fetchSearchItems as ReturnType<typeof vi.fn>).mockReturnValue(Effect.succeed(items));

      const storePair = makeFakeStore();
      const h = createSearchAnswerCandidatesHandler(makeDeps("secret", storePair));
      const result = await h({ query: "test" });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.candidates).toHaveLength(0);
      }
      expect(storePair.saved).toHaveLength(0);
    });

    it("surfaces explicit failure when store fails and no candidates", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const items = [
        {
          ContentType: "Answer",
          Url: "https://www.zhihu.com/question/1/answer/1",
          ContentID: "1",
          EditTime: 1000,
          ContentText: "text",
        },
      ];

      (fetchSearchItems as ReturnType<typeof vi.fn>).mockReturnValue(Effect.succeed(items));

      const failingStorePair = makeFailingStorePair();
      const h = createSearchAnswerCandidatesHandler(makeDeps("secret", failingStorePair));
      const result = await h({ query: "test" });

      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.code).toBe("SEARCH_EXCERPT_STORE_FAILURE");
      }
    });

    it("surfaces store failure even when display candidates exist", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const items = [
        {
          ContentType: "Answer",
          Title: "Good answer",
          Url: "https://www.zhihu.com/question/42/answer/100",
          ContentID: "123",
          EditTime: 1700000000000,
          ContentText: "content",
        },
      ];

      (fetchSearchItems as ReturnType<typeof vi.fn>).mockReturnValue(Effect.succeed(items));

      const failingStorePair = makeFailingStorePair();
      const h = createSearchAnswerCandidatesHandler(makeDeps("secret", failingStorePair));
      const result = await h({ query: "test" });

      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.code).toBe("SEARCH_EXCERPT_STORE_FAILURE");
      }
    });
  });

  // ── Quota guard ───────────────────────────────────────────────────────

  describe("quota guard", () => {
    it("consumes daily quota before search request", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const consumeMock = vi.fn(() => Effect.succeed(void 0));

      (fetchSearchItems as ReturnType<typeof vi.fn>).mockReturnValue(
        Effect.succeed([
          {
            ContentType: "Answer",
            Url: "https://www.zhihu.com/question/1/answer/1",
            ContentID: "1",
            EditTime: 1000,
            ContentText: "text",
          },
        ]),
      );

      const storePair = makeFakeStore();
      const quotaGuard: DailyQuotaGuard = { consume: consumeMock };
      const h = createSearchAnswerCandidatesHandler({
        getSecret: vi.fn(() => "test-secret"),
        createStore: vi.fn(async () => storePair.store),
        createQuotaGuard: vi.fn(async () => quotaGuard),
      });
      const result = await h({ query: "test" });

      expect(consumeMock).toHaveBeenCalledWith("zhihu_search");
      expect(result.status).toBe("ok");
    });

    it("maps quota exceeded to SEARCH_QUOTA_EXCEEDED", async () => {
      const consumeMock = vi.fn(() =>
        Effect.fail(new QuotaExceededError({ provider: "zhihu_search", quotaDay: "2026-09-01" })),
      );

      const quotaGuard: DailyQuotaGuard = { consume: consumeMock };
      const h = createSearchAnswerCandidatesHandler({
        getSecret: vi.fn(() => "secret"),
        createStore: vi.fn(async () => makeFakeStore().store),
        createQuotaGuard: vi.fn(async () => quotaGuard),
      });
      const result = await h({ query: "test" });

      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.code).toBe("SEARCH_QUOTA_EXCEEDED");
      }
    });

    it("maps quota store error to SEARCH_ERROR", async () => {
      const consumeMock = vi.fn(() =>
        Effect.fail(new DailyQuotaStoreError({ reason: "db locked" })),
      );

      const quotaGuard: DailyQuotaGuard = { consume: consumeMock };
      const h = createSearchAnswerCandidatesHandler({
        getSecret: vi.fn(() => "secret"),
        createStore: vi.fn(async () => makeFakeStore().store),
        createQuotaGuard: vi.fn(async () => quotaGuard),
      });
      const result = await h({ query: "test" });

      expect(result.status).toBe("error");
      if (result.status === "error") {
        expect(result.code).toBe("SEARCH_ERROR");
      }
    });
  });

  // ── Author, edit, and lifecycle metadata ────────────────────────────────

  describe("author and edit metadata", () => {
    it("projects AuthorName and EditTime into candidate display fields", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const items = [
        {
          ContentType: "Answer",
          Title: "Test answer",
          AuthorName: "Alice Chen",
          Url: "https://www.zhihu.com/question/1/answer/1",
          ContentID: "1",
          EditTime: 1_700_000_000,
          ContentText: "Some content",
        },
      ];

      (fetchSearchItems as ReturnType<typeof vi.fn>).mockReturnValue(Effect.succeed(items));

      const h = createSearchAnswerCandidatesHandler(makeDeps("secret", makeFakeStore()));
      const result = await h({ query: "test" });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].authorDisplayName).toBe("Alice Chen");
        expect(result.candidates[0].editAt).toBe(1_700_000_000);
      }
    });

    it("falls back to no author when AuthorName is missing", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const items = [
        {
          ContentType: "Answer",
          Title: "No-author answer",
          Url: "https://www.zhihu.com/question/1/answer/1",
          ContentID: "1",
          EditTime: 1_700_000_000,
          ContentText: "Content without author",
        },
      ];

      (fetchSearchItems as ReturnType<typeof vi.fn>).mockReturnValue(Effect.succeed(items));

      const h = createSearchAnswerCandidatesHandler(makeDeps("secret", makeFakeStore()));
      const result = await h({ query: "test" });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].authorDisplayName).toBeUndefined();
        expect(result.candidates[0].editAt).toBe(1_700_000_000);
      }
    });
  });

  // ── Query form broadening ─────────────────────────────────────────────

  describe("query form broadening", () => {
    const answerItem = (answerId: string, text: string) => ({
      ContentType: "Answer",
      Title: `回答 ${answerId}`,
      Url: `https://www.zhihu.com/question/42/answer/${answerId}`,
      ContentID: answerId,
      EditTime: 1_700_000_000,
      ContentText: text,
    });

    it("searches the keyword form before the clarified sentence", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const queries: string[] = [];
      (fetchSearchItems as ReturnType<typeof vi.fn>).mockImplementation((args: any) => {
        queries.push(args.query);
        return Effect.succeed(args.query === "Redis 分布式锁" ? [answerItem("100", "命中")] : []);
      });

      const h = createSearchAnswerCandidatesHandler(makeDeps("secret", makeFakeStore()));
      await h({ query: "Redis分布式锁的原理是什么？", altQueries: [] });

      // The sentence form comes back as column articles, so it must not be
      // the request that spends the first quota unit.
      expect(queries[0]).toBe("Redis 分布式锁");
      expect(queries.at(-1)).toBe("Redis分布式锁的原理是什么？");
    });

    it("stops dispatching forms once the provider rate limits", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const queries: string[] = [];
      (fetchSearchItems as ReturnType<typeof vi.fn>).mockImplementation((args: any) => {
        queries.push(args.query);
        return Effect.fail(new SearchError({ reason: "API_RATE_LIMITED" }));
      });

      const h = createSearchAnswerCandidatesHandler(makeDeps("secret", makeFakeStore()));
      const result = await h({ query: "primary", altQueries: ["alt-a", "alt-b"] });

      expect(result).toMatchObject({ status: "error", code: "SEARCH_RATE_LIMITED" });
      expect(queries).toHaveLength(1);
    });

    it("keeps a usable pool when a later form hits the rate limit", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      (fetchSearchItems as ReturnType<typeof vi.fn>).mockImplementation((args: any) =>
        args.query === "primary"
          ? Effect.succeed([answerItem("100", "主命中")])
          : Effect.fail(new SearchError({ reason: "API_RATE_LIMITED" })),
      );

      const h = createSearchAnswerCandidatesHandler(makeDeps("secret", makeFakeStore()));
      const result = await h({ query: "primary", altQueries: ["alt-a"] });

      // A thin but real result beats an error that throws the work away.
      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.candidates.map((c) => c.answerId)).toEqual(["100"]);
      }
    });

    it("reports which forms were dispatched", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      (fetchSearchItems as ReturnType<typeof vi.fn>).mockImplementation((args: any) =>
        args.query === "primary"
          ? Effect.succeed([answerItem("100", "甲"), answerItem("200", "乙")])
          : Effect.succeed([answerItem("200", "乙"), answerItem("300", "丙")]),
      );
      const attempts: string[] = [];
      const deps = makeDeps("secret", makeFakeStore());
      const h = createSearchAnswerCandidatesHandler({
        ...deps,
        onSearchAttempt: (attempt) => attempts.push(`${attempt.query}:${attempt.candidates}`),
      });

      await h({ query: "primary", altQueries: ["alt-a"] });

      // The running count is what tells a trace "the pool never grew".
      expect(attempts).toEqual(["primary:2", "alt-a:3"]);
    });

    it("broadens with alt queries when the primary query returns a thin set", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const queries: string[] = [];
      (fetchSearchItems as ReturnType<typeof vi.fn>).mockImplementation((args: any) => {
        queries.push(args.query);
        if (args.query === "primary") return Effect.succeed([answerItem("100", "主命中")]);
        return Effect.succeed([answerItem("200", "备选甲"), answerItem("300", "备选乙")]);
      });

      const h = createSearchAnswerCandidatesHandler(makeDeps("secret", makeFakeStore()));
      const result = await h({ query: "primary", altQueries: ["alt-a", "alt-b"] });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.candidates.map((c) => c.answerId).sort()).toEqual(["100", "200", "300"]);
      }
      // Stops as soon as the set is useful instead of burning the whole list.
      expect(queries).toEqual(["primary", "alt-a"]);
    });

    it("dedupes answers that appear under several queries", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      (fetchSearchItems as ReturnType<typeof vi.fn>).mockImplementation((args: any) =>
        args.query === "primary"
          ? Effect.succeed([answerItem("100", "重复")])
          : Effect.succeed([answerItem("100", "重复"), answerItem("200", "新增")]),
      );

      const h = createSearchAnswerCandidatesHandler(makeDeps("secret", makeFakeStore()));
      const result = await h({ query: "primary", altQueries: ["alt-a"] });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.candidates.map((c) => c.answerId)).toEqual(["100", "200"]);
      }
    });

    it("skips alt queries once the primary result is already useful", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const queries: string[] = [];
      (fetchSearchItems as ReturnType<typeof vi.fn>).mockImplementation((args: any) => {
        queries.push(args.query);
        return Effect.succeed([
          answerItem("100", "甲"),
          answerItem("200", "乙"),
          answerItem("300", "丙"),
        ]);
      });

      const h = createSearchAnswerCandidatesHandler(makeDeps("secret", makeFakeStore()));
      const result = await h({ query: "primary", altQueries: ["alt-a"] });

      expect(result.status).toBe("ok");
      if (result.status === "ok") expect(result.candidates).toHaveLength(3);
      expect(queries).toEqual(["primary"]);
    });

    it("keeps the primary result when an alt query fails", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      (fetchSearchItems as ReturnType<typeof vi.fn>).mockImplementation((args: any) =>
        args.query === "primary"
          ? Effect.succeed([answerItem("100", "主命中")])
          : Effect.fail(new SearchError({ reason: "NON_ZERO_CODE" })),
      );

      const h = createSearchAnswerCandidatesHandler(makeDeps("secret", makeFakeStore()));
      const result = await h({ query: "primary", altQueries: ["alt-a"] });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.candidates.map((c) => c.answerId)).toEqual(["100"]);
      }
    });
  });
});
