import { describe, expect, it, vi, beforeEach } from "vite-plus/test";
import { Effect } from "effect";

import {
  createSearchAnswerCandidatesHandler,
  type SearchAnswerCandidatesDeps,
} from "./search-answer-candidates";

import type { AnswerExcerpt } from "../lib/answer-excerpt";
import type { ExcerptStore } from "../lib/excerpt-store";
import { StoreError } from "../lib/excerpt-store";
import type { DailyQuotaGuard } from "../lib/daily-quota";
import { QuotaExceededError, DailyQuotaStoreError } from "../lib/daily-quota";
import type { PatchLifecycleStore } from "../lib/patch-lifecycle-store";
import { PatchLifecycleStoreError } from "../lib/patch-lifecycle-store";
import type { PatchLifecycleRecordWithStatus } from "../lib/patch-lifecycle-store";

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

vi.mock("../lib/patch-lifecycle-store", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/patch-lifecycle-store")>();
  return {
    ...original,
    makeSqlitePatchLifecycleStore: vi.fn(),
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

// ── Lifecycle store helpers ──────────────────────────────────────────────

type LifecycleLookup = (fingerprint: string) => PatchLifecycleRecordWithStatus | null;

const buildLifecycleLookup = (
  entries: Record<string, PatchLifecycleRecordWithStatus>,
): LifecycleLookup => {
  return (fingerprint: string): PatchLifecycleRecordWithStatus | null => {
    if (fingerprint in entries) return entries[fingerprint];
    return null;
  };
};

const makeFakeLifecycleStore = (
  lookup: LifecycleLookup,
  history: readonly PatchLifecycleRecordWithStatus[] = [],
): PatchLifecycleStore => ({
  saveVisible: vi.fn(() =>
    Effect.succeed({ ...lookup(""), status: "VISIBLE" } as PatchLifecycleRecordWithStatus),
  ),
  supersedeByExcerptFingerprint: vi.fn(() => Effect.succeed(0)),
  dispute: vi.fn(() => Effect.succeed(true)),
  resolve: vi.fn(() => Effect.succeed(true)),
  withdraw: vi.fn(() => Effect.succeed(true)),
  findCurrentByExcerptFingerprint: vi.fn((fp: string) => Effect.succeed(lookup(fp))),
  findHistoryByAnswer: vi.fn(() => Effect.succeed(history)),
  findAll: vi.fn(() => Effect.succeed([])),
});

const makeFailingLifecycleStore = (): PatchLifecycleStore => ({
  saveVisible: vi.fn(() => Effect.succeed({} as PatchLifecycleRecordWithStatus)),
  supersedeByExcerptFingerprint: vi.fn(() => Effect.succeed(0)),
  dispute: vi.fn(() => Effect.succeed(true)),
  resolve: vi.fn(() => Effect.succeed(true)),
  withdraw: vi.fn(() => Effect.succeed(true)),
  findCurrentByExcerptFingerprint: vi.fn(() =>
    Effect.fail(new PatchLifecycleStoreError({ reason: "db locked" })),
  ),
  findHistoryByAnswer: vi.fn(() =>
    Effect.fail(new PatchLifecycleStoreError({ reason: "db locked" })),
  ),
  findAll: vi.fn(() => Effect.succeed([])),
});

const makeDeps = (
  secret?: string,
  storePair?: FakeStorePair,
  lifecycleStore?: PatchLifecycleStore,
): SearchAnswerCandidatesDeps => ({
  getSecret: vi.fn(() => secret),
  createStore: vi.fn(async () => {
    if (storePair) return storePair.store;
    return makeFakeStore().store;
  }),
  createLifecycleStore: vi.fn(async () => {
    if (lifecycleStore) return lifecycleStore;
    return makeFakeLifecycleStore(buildLifecycleLookup({}));
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
        createLifecycleStore: vi.fn(async () => makeFakeLifecycleStore(buildLifecycleLookup({}))),
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
        createLifecycleStore: vi.fn(async () => makeFakeLifecycleStore(buildLifecycleLookup({}))),
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
        createLifecycleStore: vi.fn(async () => makeFakeLifecycleStore(buildLifecycleLookup({}))),
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
        expect(result.candidates[0].maintenance.status).toBe("not_tracked");
        expect(result.candidates[0].maintenance.evidenceCount).toBeUndefined();
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

  describe("lifecycle-derived maintenance state", () => {
    it("shows VISIBLE with evidence count when a lifecycle record exists", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const items = [
        {
          ContentType: "Answer",
          Title: "Maintained answer",
          AuthorName: "Bob",
          Url: "https://www.zhihu.com/question/5/answer/50",
          ContentID: "99",
          EditTime: 1_600_000_000,
          ContentText: "Pre-update content",
        },
      ];

      (fetchSearchItems as ReturnType<typeof vi.fn>).mockReturnValue(Effect.succeed(items));

      const storePair = makeFakeStore();
      const history: PatchLifecycleRecordWithStatus[] = [];
      const lifecycleStore = makeFakeLifecycleStore(() => null, history);

      const h = createSearchAnswerCandidatesHandler(makeDeps("secret", storePair, lifecycleStore));

      const result = await h({ query: "test" });
      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        const excerpt = storePair.saved[0];
        history.push({
          questionId: excerpt.questionId,
          answerId: excerpt.answerId,
          excerptFingerprint: excerpt.fingerprint,
          reason: "price changed",
          selectedEvidenceFingerprints: ["v1:aaaaaaaaaaaaaaaa", "v1:bbbbbbbbbbbbbbbb"],
          evidence: [],
          capturedAt: 1_700_000_000_000,
          eventAt: 1_700_000_000_000,
          recordFingerprint: "v1:cccccccccccccccc",
          status: "VISIBLE",
        });

        const secondResult = await h({ query: "test" });
        expect(secondResult.status).toBe("ok");
        if (secondResult.status === "ok") {
          expect(secondResult.candidates).toHaveLength(1);
          expect(secondResult.candidates[0].maintenance.status).toBe("VISIBLE");
          expect(secondResult.candidates[0].maintenance.evidenceCount).toBe(2);
        }
      }
    });

    it("shows not_tracked when no lifecycle record exists for the excerpt", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const items = [
        {
          ContentType: "Answer",
          Title: "Untracked answer",
          Url: "https://www.zhihu.com/question/7/answer/70",
          ContentID: "1",
          EditTime: 1_500_000_000,
          ContentText: "Old content",
        },
      ];

      (fetchSearchItems as ReturnType<typeof vi.fn>).mockReturnValue(Effect.succeed(items));

      const h = createSearchAnswerCandidatesHandler(
        makeDeps("secret", makeFakeStore(), makeFakeLifecycleStore(buildLifecycleLookup({}))),
      );
      const result = await h({ query: "test" });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].maintenance.status).toBe("not_tracked");
        expect(result.candidates[0].maintenance.evidenceCount).toBeUndefined();
      }
    });

    it("shows unknown when lifecycle lookup fails and still returns the candidate", async () => {
      const { fetchSearchItems } = await import("../lib/zhihu-content-search");
      const items = [
        {
          ContentType: "Answer",
          Title: "Answer with broken lifecycle",
          Url: "https://www.zhihu.com/question/9/answer/90",
          ContentID: "1",
          EditTime: 1_500_000_000,
          ContentText: "Some text",
        },
      ];

      (fetchSearchItems as ReturnType<typeof vi.fn>).mockReturnValue(Effect.succeed(items));

      const h = createSearchAnswerCandidatesHandler(
        makeDeps("secret", makeFakeStore(), makeFailingLifecycleStore()),
      );
      const result = await h({ query: "test" });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0].maintenance.status).toBe("unknown");
        expect(result.candidates[0].maintenance.evidenceCount).toBeUndefined();
        expect(result.candidates[0].title).toBe("Answer with broken lifecycle");
      }
    });
  });
});
