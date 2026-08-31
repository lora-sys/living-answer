import { describe, expect, it, vi, beforeEach } from "vite-plus/test";
import { Effect } from "effect";

import {
  createSearchAnswerCandidatesHandler,
  type SearchAnswerCandidatesDeps,
} from "./search-answer-candidates";

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

const makeDeps = (secret?: string): SearchAnswerCandidatesDeps => ({
  getSecret: vi.fn(() => secret),
});

const handler = createSearchAnswerCandidatesHandler(makeDeps("test-secret"));

describe("search-answer-candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns INVALID_REQUEST for blank query", async () => {
    const result = await handler({ query: "   " });
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.code).toBe("INVALID_REQUEST");
  });

  it("returns MISSING_ACCESS_SECRET without secret", async () => {
    const h = createSearchAnswerCandidatesHandler(makeDeps(undefined));
    const result = await h({ query: "test" });
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.code).toBe("MISSING_ACCESS_SECRET");
  });

  it("extracts candidates from valid items", async () => {
    const { fetchSearchItems } = await import("../lib/zhihu-content-search");
    const items = [
      {
        Title: "React 19 changes",
        Url: "https://www.zhihu.com/question/42/answer/100",
        ContentText: "Some text about React",
      },
      { Title: "No URL item", ContentText: "no url" },
      { Title: "Bad URL", Url: "https://example.com/foo" },
      {
        Title: "Duplicate",
        Url: "https://www.zhihu.com/question/42/answer/100",
        ContentText: "dup",
      },
      {
        Title: "Second answer",
        Url: "https://www.zhihu.com/question/43/answer/200",
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
