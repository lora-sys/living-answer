import { describe, expect, it } from "vite-plus/test";

import { createQuestionLearningThread } from "./thread-artifact";
import {
  buildThreadMarkdown,
  readCollectedThreads,
  removeCollectedThread,
  saveCollectedThread,
  type TextStorage,
} from "./thread-collection";

const makeStorage = (): TextStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

const makeArtifact = () => {
  const result = createQuestionLearningThread({
    threadId: "a1b2c3d4e5f6a7b8",
    question: "How does it evolve?",
    refinedQuery: "concept evolution",
    createdAt: 1_700_000_000_000,
    timelineStages: [
      {
        questionId: "42",
        answerId: "100",
        title: "Answer",
        authorDisplayName: "Author",
        editTime: 1_700_000_000,
        canonicalUrl: "https://www.zhihu.com/question/42/answer/100",
        excerpt: {
          questionId: "42",
          answerId: "100",
          capturedAt: 1_700_000_000_000,
          sourceContentId: "content-1",
          sourceContentType: "Answer",
          sourceEditTime: 1_700_000_000,
          excerpt: "This is the exact excerpt.",
          fingerprint: "v1:aaaaaaaaaaaaaaaa",
        },
      },
    ],
    learningNodes: [
      {
        kind: "evolution",
        title: "Concept evolves",
        summary: "The excerpt explains the evolution.",
        evidenceRefs: [
          {
            excerptFingerprint: "v1:aaaaaaaaaaaaaaaa",
            quote: "This is the exact excerpt.",
          },
        ],
        sourceAnswerId: "100",
        sourceUrl: "https://www.zhihu.com/question/42/answer/100",
        uncertainty: 0.4,
      },
    ],
    uncertainty: 0.4,
  });

  if (result._tag !== "success") throw new Error("invalid artifact");
  return result.artifact;
};

describe("thread collection", () => {
  it("saves, reads, and removes a thread id safely", () => {
    const storage = makeStorage();
    expect(saveCollectedThread("bad-id", storage)).toEqual([]);
    expect(saveCollectedThread("a1b2c3d4e5f6a7b8", storage)).toEqual(["a1b2c3d4e5f6a7b8"]);
    expect(saveCollectedThread("a1b2c3d4e5f6a7b8", storage)).toEqual(["a1b2c3d4e5f6a7b8"]);
    expect(readCollectedThreads(storage)).toEqual(["a1b2c3d4e5f6a7b8"]);
    expect(removeCollectedThread("a1b2c3d4e5f6a7b8", storage)).toEqual([]);
  });

  it("returns existing ids when storage writes fail", () => {
    const storage: TextStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };
    expect(saveCollectedThread("a1b2c3d4e5f6a7b8", storage)).toEqual([]);
  });

  it("builds a shareable markdown artifact", () => {
    const markdown = buildThreadMarkdown(makeArtifact());
    expect(markdown).toContain("# How does it evolve?");
    expect(markdown).toContain("## AI 学习桥");
    expect(markdown).toContain("This is the exact excerpt.");
    expect(markdown).toContain("这是摘录，不是完整回答");
    expect(markdown).toContain("[知乎原文](https://www.zhihu.com/question/42/answer/100)");
  });
});
