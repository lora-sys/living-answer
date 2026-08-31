import { Effect } from "effect";

import { describe, expect, it } from "vite-plus/test";

import type { AnswerExcerptProvider } from "../lib/answer-excerpt-provider";
import type { AnswerExcerpt } from "../lib/answer-excerpt";
import type { ClaimStore } from "../lib/claim-store";
import type { EvidenceCandidateStore } from "../lib/evidence-candidate-store";
import { createPatchEvidence } from "../lib/patch-evidence";
import { createPatchLifecycleRecord, type PatchLifecycleInput } from "../lib/patch-lifecycle";
import type {
  PatchLifecycleRecordWithStatus,
  PatchLifecycleStore,
} from "../lib/patch-lifecycle-store";
import type { OpenAiChatCompletions } from "../lib/openai-adapter";
import { createAnalyzePatchHandler } from "./analyze-patch";
import type { AnalyzePatchResponse } from "./analyze-patch-response";

const EXCERPT: AnswerExcerpt = Object.freeze({
  questionId: "42",
  answerId: "100",
  capturedAt: 1_700_000_000_000,
  sourceContentId: "123",
  sourceContentType: "Answer",
  sourceEditTime: 1_700_000_000_000,
  excerpt: "A relevant excerpt.",
  fingerprint: "v1:abcd1234abcd1234",
});

const provider = (): AnswerExcerptProvider =>
  ({
    resolve: () => Effect.succeed(EXCERPT),
    stats: () => Effect.succeed({ size: 0, hits: 0, misses: 0 }),
  }) as unknown as AnswerExcerptProvider;

const chat = (content: string): OpenAiChatCompletions => ({
  complete: () => Effect.succeed(content),
});

const evidenceFingerprint = (): string => {
  const result = createPatchEvidence({
    sourceLabel: "知乎回答原文",
    sourceUrl: "https://www.zhihu.com/question/42/answer/100",
    quote: EXCERPT.excerpt,
    capturedAt: EXCERPT.capturedAt,
  });
  if (result._tag !== "success") throw new Error("unexpected evidence failure");
  return result.evidence.fingerprint;
};

type SavedRecord = PatchLifecycleRecordWithStatus & { input: PatchLifecycleInput };

const makeLifecycleStore = (): {
  store: PatchLifecycleStore;
  saved: SavedRecord[];
  superseded: number;
} => {
  const saved: SavedRecord[] = [];
  let superseded = 0;
  const store: PatchLifecycleStore = {
    saveVisible: (input) =>
      Effect.sync(() => {
        const created = createPatchLifecycleRecord(input);
        if (created._tag === "failure") throw new Error(created.reason);
        const record = { ...created.record, status: "VISIBLE" as const };
        saved.push({ ...record, input });
        return record;
      }),
    supersedeByExcerptFingerprint: () =>
      Effect.sync(() => {
        superseded += 1;
        return saved.length;
      }),
    dispute: () => Effect.succeed(false),
    resolve: () => Effect.succeed(false),
    withdraw: () => Effect.succeed(false),
    findCurrentByExcerptFingerprint: () => Effect.succeed(null),
    findHistoryByAnswer: () =>
      Effect.sync(() => saved.map(({ input: _input, ...record }) => record)),
  };
  return {
    store,
    saved,
    get superseded(): number {
      return superseded;
    },
  };
};

const claimStore = (): ClaimStore =>
  ({
    findLatestByExcerptFingerprint: () => Effect.succeed([]),
  }) as unknown as ClaimStore;

const evidenceStore = (): EvidenceCandidateStore =>
  ({
    findCandidatesByClaimFingerprint: () => Effect.succeed([]),
  }) as unknown as EvidenceCandidateStore;

const call = async (lifecycle: PatchLifecycleStore): Promise<AnalyzePatchResponse> =>
  createAnalyzePatchHandler({
    getSecret: () => ["openai", "zhihu"],
    createProvider: async () => provider(),
    createChat: () =>
      chat(
        JSON.stringify({
          verdict: "UPDATE",
          reason: "The cited threshold has changed.",
          selectedEvidenceFingerprints: [evidenceFingerprint()],
        }),
      ),
    createClaimStore: async () => claimStore(),
    createEvidenceStore: async () => evidenceStore(),
    createLifecycleStore: async () => lifecycle,
  })({ url: "https://www.zhihu.com/question/42/answer/100" });

describe("analyze-patch lifecycle", () => {
  it("persists an UPDATE decision and returns compact lifecycle state", async () => {
    const lifecycle = makeLifecycleStore();
    const response = await call(lifecycle.store);

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;
    expect(response.decision.verdict).toBe("UPDATE");
    expect(response.lifecycle?.status).toBe("VISIBLE");
    expect(response.history).toHaveLength(1);
    expect(lifecycle.saved).toHaveLength(1);
    expect(lifecycle.saved[0]?.input.excerptFingerprint).toBe(EXCERPT.fingerprint);
  });

  it("supersedes prior patches for a NO_PATCH decision", async () => {
    const lifecycle = makeLifecycleStore();
    const response = await createAnalyzePatchHandler({
      getSecret: () => ["openai", "zhihu"],
      createProvider: async () => provider(),
      createChat: () =>
        chat(JSON.stringify({ verdict: "NO_PATCH", reason: "No confirmed change." })),
      createClaimStore: async () => claimStore(),
      createEvidenceStore: async () => evidenceStore(),
      createLifecycleStore: async () => lifecycle.store,
    })({ url: "https://www.zhihu.com/question/42/answer/100" });

    expect(response.status).toBe("ok");
    if (response.status !== "ok") return;
    expect(response.decision.verdict).toBe("NO_PATCH");
    expect(response.lifecycle).toBeUndefined();
    expect(lifecycle.superseded).toBe(1);
  });
});
