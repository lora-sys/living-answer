import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import type { AnswerExcerpt } from "../lib/answer-excerpt";
import { StoreError } from "../lib/excerpt-store";
import type { ExcerptStore } from "../lib/excerpt-store";
import { PatchLifecycleStoreError } from "../lib/patch-lifecycle-store";
import type { PatchLifecycleRecordWithStatus } from "../lib/patch-lifecycle-store";
import type { PatchLifecycleStore } from "../lib/patch-lifecycle-store";
import { createReadAnswerHandler } from "./read-answer";

const excerpt: AnswerExcerpt = Object.freeze({
  questionId: "42",
  answerId: "100",
  capturedAt: 1_700_000_000_000,
  sourceContentId: "42",
  sourceContentType: "Answer",
  sourceEditTime: 1_699_000_000,
  excerpt: "旧回答摘要",
  fingerprint: "v1:abcdef1234567890",
});

const lifecycle: PatchLifecycleRecordWithStatus = Object.freeze({
  questionId: "42",
  answerId: "100",
  excerptFingerprint: excerpt.fingerprint,
  recordFingerprint: "v1:1111111111111111",
  reason: "API 的当前版本已经变化。",
  selectedEvidenceFingerprints: ["v1:aaaa111111111111"],
  evidence: [
    {
      fingerprint: "v1:aaaa111111111111",
      sourceLabel: "官方说明",
      sourceUrl: "https://example.com/official",
      quote: "The API is now stable.",
    },
    {
      fingerprint: "v1:bbbb222222222222",
      sourceLabel: "未匹配候选",
      sourceUrl: "https://example.com/rejected",
      quote: "Rejected candidate.",
    },
  ],
  capturedAt: excerpt.capturedAt,
  eventAt: 1_700_000_001_000,
  status: "VISIBLE",
});

const okExcerptStore = (): ExcerptStore =>
  ({
    save: () => Effect.void,
    findLatest: () => Effect.succeed(excerpt),
  }) as unknown as ExcerptStore;

const okLifecycleStore = (): PatchLifecycleStore =>
  ({
    findCurrentByExcerptFingerprint: () => Effect.succeed(lifecycle),
    findHistoryByAnswer: () => Effect.succeed([lifecycle]),
  }) as unknown as PatchLifecycleStore;

const excerptOnlyLifecycleStore = (): PatchLifecycleStore =>
  ({
    findCurrentByExcerptFingerprint: () => Effect.succeed(null),
    findHistoryByAnswer: () => Effect.succeed([]),
  }) as unknown as PatchLifecycleStore;

const failingExcerptStore = (): ExcerptStore =>
  ({
    findLatest: () => Effect.fail(new StoreError({ reason: "read failed" })),
  }) as unknown as ExcerptStore;

const failingLifecycleStore = (): PatchLifecycleStore =>
  ({
    findCurrentByExcerptFingerprint: () =>
      Effect.fail(new PatchLifecycleStoreError({ reason: "read failed" })),
  }) as unknown as PatchLifecycleStore;

describe("read-answer", () => {
  it("returns an excerpt with a persisted visible advisory and only matched evidence", async () => {
    const response = await createReadAnswerHandler({
      createExcerptStore: async () => okExcerptStore(),
      createLifecycleStore: async () => okLifecycleStore(),
    })({ questionId: "42", answerId: "100" });

    expect(response).toEqual({
      status: "ok",
      excerpt,
      advisory: {
        verdict: "UPDATE",
        reason: lifecycle.reason,
        patchBodyStatus: "no-body-available",
        selectedEvidenceFingerprints: ["v1:aaaa111111111111"],
        evidenceSummary: [
          {
            fingerprint: "v1:aaaa111111111111",
            sourceLabel: "官方说明",
            sourceUrl: "https://example.com/official",
          },
        ],
      },
      lifecycle: {
        recordFingerprint: lifecycle.recordFingerprint,
        status: "VISIBLE",
        capturedAt: lifecycle.capturedAt,
        eventAt: lifecycle.eventAt,
        reason: lifecycle.reason,
        selectedEvidenceFingerprints: lifecycle.selectedEvidenceFingerprints,
        evidenceSummary: lifecycle.evidence.map(({ quote: _quote, ...summary }) => summary),
      },
      history: [
        {
          recordFingerprint: lifecycle.recordFingerprint,
          status: "VISIBLE",
          capturedAt: lifecycle.capturedAt,
          eventAt: lifecycle.eventAt,
          reason: lifecycle.reason,
        },
      ],
    });
  });

  it("returns excerpt-only when no lifecycle decision exists", async () => {
    const response = await createReadAnswerHandler({
      createExcerptStore: async () => okExcerptStore(),
      createLifecycleStore: async () => excerptOnlyLifecycleStore(),
    })({ questionId: "42", answerId: "100" });

    expect(response).toMatchObject({
      status: "excerpt_only",
      excerpt,
    });
  });

  it("returns no excerpt for an unknown answer", async () => {
    const excerptStore = {
      findLatest: () => Effect.succeed(null),
    } as unknown as ExcerptStore;

    const response = await createReadAnswerHandler({
      createExcerptStore: async () => excerptStore,
      createLifecycleStore: async () => okLifecycleStore(),
    })({ questionId: "42", answerId: "100" });

    expect(response).toMatchObject({ status: "no_excerpt" });
  });

  it("returns stable errors for invalid requests and store failures", async () => {
    const invalid = await createReadAnswerHandler({
      createExcerptStore: async () => okExcerptStore(),
      createLifecycleStore: async () => okLifecycleStore(),
    })({ questionId: "bad", answerId: "100" });
    expect(invalid).toMatchObject({ status: "error", code: "INVALID_REQUEST" });

    const excerptError = await createReadAnswerHandler({
      createExcerptStore: async () => failingExcerptStore(),
      createLifecycleStore: async () => okLifecycleStore(),
    })({ questionId: "42", answerId: "100" });
    expect(excerptError).toMatchObject({ status: "error", code: "STORE_ERROR" });

    const lifecycleError = await createReadAnswerHandler({
      createExcerptStore: async () => okExcerptStore(),
      createLifecycleStore: async () => failingLifecycleStore(),
    })({ questionId: "42", answerId: "100" });
    expect(lifecycleError).toMatchObject({
      status: "error",
      code: "LIFECYCLE_STORE_ERROR",
    });
  });
});
