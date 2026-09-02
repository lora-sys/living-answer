import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";

import { rankAnswerCandidates, type CandidateRankingDeps } from "./answer-candidate-ranker";

const makeInput = () => ({
  question: "Flexbox 和 Grid 怎么选？",
  refinedQuery: "CSS Flexbox Grid selection",
  learningIntent: "Understand when to use each layout system.",
  candidates: [
    {
      answerId: "100",
      title: "Grid and Flex",
      authorDisplayName: "Author A",
      preview: "Grid is good for two dimensional layouts.",
    },
    {
      answerId: "200",
      title: "Flex is still useful",
      authorDisplayName: "Author B",
      preview: "Flexbox remains useful for one dimensional layout.",
    },
  ],
});

const makeDeps = (response: string, complete = vi.fn(() => Effect.succeed(response))) =>
  ({ model: "test-model", chat: { complete } }) satisfies CandidateRankingDeps;

const validResponse = () =>
  JSON.stringify({
    summary: "The candidates cover both layout systems.",
    rankings: [
      {
        answerId: "100",
        role: "baseline",
        reason: "This excerpt introduces Grid's core use case.",
      },
      {
        answerId: "200",
        role: "extension",
        reason: "This excerpt explains Flexbox's continuing use.",
      },
    ],
    confidence: 0.8,
  });

describe("answer candidate ranker", () => {
  it("returns validated rankings for a well-formed model response", async () => {
    const chat = vi.fn(() => Effect.succeed(validResponse()));
    const analysis = await Effect.runPromise(
      rankAnswerCandidates(makeDeps(validResponse(), chat))(makeInput()),
    );

    expect(analysis.rankings).toHaveLength(2);
    expect(analysis.rankings[0].answerId).toBe("100");
    expect(analysis.rankings[1].role).toBe("extension");
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it("fails for a missing candidate ranking", async () => {
    const response = JSON.stringify({
      summary: "Only one candidate explained.",
      rankings: [{ answerId: "100", role: "baseline", reason: "Grid is introduced." }],
      confidence: 0.7,
    });
    const exit = await Effect.runPromiseExit(rankAnswerCandidates(makeDeps(response))(makeInput()));

    expect(exit._tag).toBe("Failure");
  });

  it("rejects invalid input without calling the model", async () => {
    const chat = vi.fn(() => Effect.succeed(validResponse()));
    const exit = await Effect.runPromiseExit(
      rankAnswerCandidates({ model: "test-model", chat: { complete: chat } })({
        ...makeInput(),
        candidates: [],
      }),
    );
    expect(exit._tag).toBe("Failure");
    expect(chat).not.toHaveBeenCalled();
  });
});
