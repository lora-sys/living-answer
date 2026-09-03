import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { makeSqliteThreadArtifactStore } from "./thread-artifact-store";
import {
  createQuestionLearningThread,
  type LearningNodeInput,
  type TimelineStageInput,
} from "./thread-artifact";

const TEST_DIR = mkdtempSync(join(tmpdir(), "living-answer-thread-store-"));
const TEST_DB_PATH = join(TEST_DIR, "thread-artifacts.db");

afterEach(() => {
  rmSync(TEST_DB_PATH, { force: true });
});

const makeStage = (): TimelineStageInput => ({
  questionId: "123",
  answerId: "456",
  title: "Test Answer",
  authorDisplayName: "Tester",
  editTime: 1_700_000_000_000,
  canonicalUrl: "https://www.zhihu.com/question/123/answer/456",
  excerpt: {
    questionId: "123",
    answerId: "456",
    capturedAt: 1_700_000_000_000,
    sourceContentId: "src-1",
    sourceContentType: "Answer",
    sourceEditTime: 1_700_000_000_000,
    excerpt: "This is an excerpt from the answer.",
    fingerprint: "v1:aaaaaaaaaaaaaaaa",
  },
});

const makeNode = (): LearningNodeInput => ({
  kind: "relationship",
  title: "A connection",
  summary: "These things are related.",
  evidenceRefs: [
    { excerptFingerprint: "v1:aaaaaaaaaaaaaaaa", quote: "This is an excerpt from the answer." },
  ],
  sourceAnswerId: "456",
  sourceUrl: "https://www.zhihu.com/question/123/answer/456",
  uncertainty: 0.5,
});

const makeArtifactResult = () =>
  createQuestionLearningThread({
    threadId: "a1b2c3d4e5f6a7b8",
    question: "How do things relate?",
    refinedQuery: "zhihu how things relate",
    createdAt: 1_700_000_000_000,
    timelineStages: [makeStage()],
    learningNodes: [makeNode()],
    uncertainty: 0.3,
  });

describe("sqlite thread artifact store", () => {
  it("saves and revalidates an artifact by id", async () => {
    const artifactResult = makeArtifactResult();
    expect(artifactResult._tag).toBe("success");
    if (artifactResult._tag !== "success") return;

    const store = await Effect.runPromise(makeSqliteThreadArtifactStore(TEST_DB_PATH));
    await Effect.runPromise(store.save(artifactResult.artifact));

    const loaded = await Effect.runPromise(store.findById("a1b2c3d4e5f6a7b8"));
    expect(loaded).toEqual(artifactResult.artifact);
  });
});
