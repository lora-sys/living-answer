import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import { createQuestionLearningThread } from "./thread-artifact";
import { askThreadAgent, type ThreadAgentDeps } from "./thread-study-agent";

const makeArtifact = () => {
  const result = createQuestionLearningThread({
    threadId: "a1b2c3d4e5f6a7b8",
    question: "How does the concept evolve?",
    refinedQuery: "zhihu concept evolution",
    createdAt: 1_700_000_000_000,
    timelineStages: [
      {
        questionId: "42",
        answerId: "100",
        title: "Concept answer",
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
          excerpt: "This is the exact excerpt that supports the answer.",
          fingerprint: "v1:aaaaaaaaaaaaaaaa",
        },
      },
    ],
    learningNodes: [
      {
        kind: "evolution",
        title: "The concept evolves",
        summary: "The excerpt explains how the concept changed.",
        evidenceRefs: [
          {
            excerptFingerprint: "v1:aaaaaaaaaaaaaaaa",
            quote: "This is the exact excerpt that supports the answer.",
          },
        ],
        sourceAnswerId: "100",
        sourceUrl: "https://www.zhihu.com/question/42/answer/100",
        uncertainty: 0.5,
      },
    ],
    uncertainty: 0.5,
  });

  if (result._tag !== "success") throw new Error("invalid test artifact");
  return result.artifact;
};

const makeDeps = (response: string, complete = vi.fn(() => Effect.succeed(response))) =>
  ({ model: "test-model", chat: { complete } }) satisfies ThreadAgentDeps;

describe("thread study agent", () => {
  it("returns a grounded response with validated evidence", async () => {
    const response = JSON.stringify({
      status: "grounded",
      answer: "The thread says the concept changed.",
      evidenceRefs: [
        {
          answerId: "100",
          excerptFingerprint: "v1:aaaaaaaaaaaaaaaa",
          quote: "This is the exact excerpt that supports the answer.",
        },
      ],
      nextActions: [
        {
          type: "focus_source",
          label: "查看来源",
          answerId: "100",
        },
      ],
      uncertainty: 0.35,
    });
    const chat = vi.fn(() => Effect.succeed(response));
    const result = await Effect.runPromise(
      askThreadAgent(makeDeps(response, chat))(makeArtifact(), {
        question: "这个知识点怎么变化？",
      }),
    );

    expect(result.status).toBe("grounded");
    expect(result.evidenceRefs[0].answerId).toBe("100");
    expect(result.nextActions[0].type).toBe("focus_source");
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("falls back to evidence gap when model output is malformed", async () => {
    const result = await Effect.runPromise(
      askThreadAgent(makeDeps("not json"))(makeArtifact(), { question: "为什么会这样？" }),
    );

    expect(result.status).toBe("evidence_gap");
    expect(result.evidenceRefs).toHaveLength(0);
    expect(result.nextActions[0].type).toBe("boundary_check");
  });

  it("falls back to evidence gap when a grounded citation is invalid", async () => {
    const response = JSON.stringify({
      status: "grounded",
      answer: "This answer is unsupported.",
      evidenceRefs: [
        {
          answerId: "100",
          excerptFingerprint: "v1:aaaaaaaaaaaaaaaa",
          quote: "This quote is not in the excerpt.",
        },
      ],
      nextActions: [],
      uncertainty: 0.2,
    });
    const result = await Effect.runPromise(
      askThreadAgent(makeDeps(response))(makeArtifact(), { question: "为什么会这样？" }),
    );

    expect(result.status).toBe("evidence_gap");
  });

  it("rejects invalid input without calling the model", async () => {
    const chat = vi.fn(() => Effect.succeed("{}"));
    const exit = await Effect.runPromiseExit(
      askThreadAgent({ model: "test-model", chat: { complete: chat } })(makeArtifact(), {
        question: "",
      }),
    );

    expect(exit._tag).toBe("Failure");
    expect(chat).not.toHaveBeenCalled();
  });
});
