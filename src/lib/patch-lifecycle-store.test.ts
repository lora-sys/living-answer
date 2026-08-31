import { Effect } from "effect";

import { makeSqlitePatchLifecycleStore } from "./patch-lifecycle-store";

import { beforeAll, describe, expect, it } from "vite-plus/test";

const TEST_DB_PATH = ".local/test-patch-lifecycle.db";
let secondRecordFingerprint = "";

const cleanup = (path: string): void => {
  try {
    const { existsSync, unlinkSync } = require("node:fs");
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // best-effort cleanup
  }
};

const makeInput = (eventAt: number, reason = "The current state has changed.") => ({
  questionId: "42",
  answerId: "100",
  excerptFingerprint: "v1:0123456789abcdef",
  reason,
  selectedEvidenceFingerprints: ["v1:1111111111111111"],
  evidence: [
    {
      fingerprint: "v1:1111111111111111",
      sourceLabel: "官方说明",
      sourceUrl: "https://example.com/official",
      quote: "The current threshold is 2026.",
    },
  ],
  capturedAt: 1_700_000_000_000,
  eventAt,
});

beforeAll(() => {
  cleanup(TEST_DB_PATH);
});

describe("patch-lifecycle-store", () => {
  it("persists a visible record and returns its history", async () => {
    const store = await Effect.runPromise(makeSqlitePatchLifecycleStore(TEST_DB_PATH));
    const saved = await Effect.runPromise(store.saveVisible(makeInput(1_000)));

    expect(saved.status).toBe("VISIBLE");
    expect(saved.recordFingerprint).toMatch(/^v1:[0-9a-f]{16}$/);

    const history = await Effect.runPromise(store.findHistoryByAnswer("42", "100"));
    expect(history).toHaveLength(1);
    expect(history[0]?.status).toBe("VISIBLE");
  });

  it("supersedes the previous patch when a new one is saved", async () => {
    const store = await Effect.runPromise(makeSqlitePatchLifecycleStore(TEST_DB_PATH));
    const second = await Effect.runPromise(store.saveVisible(makeInput(2_000, "Second analysis.")));
    secondRecordFingerprint = second.recordFingerprint;
    const history = await Effect.runPromise(store.findHistoryByAnswer("42", "100"));

    expect(history).toHaveLength(2);
    expect(history[0]?.recordFingerprint).toBe(second.recordFingerprint);
    expect(history[0]?.status).toBe("VISIBLE");
    expect(history[1]?.status).toBe("SUPERSEDED");
  });

  it("disputes only the current visible record", async () => {
    const store = await Effect.runPromise(makeSqlitePatchLifecycleStore(TEST_DB_PATH));
    const disputed = await Effect.runPromise(store.dispute(secondRecordFingerprint, 3_000));
    expect(disputed).toBe(true);

    const history = await Effect.runPromise(store.findHistoryByAnswer("42", "100"));
    expect(history[0]?.status).toBe("DISPUTED");
  });

  it("persists state across reopen", async () => {
    const reopened = await Effect.runPromise(makeSqlitePatchLifecycleStore(TEST_DB_PATH));
    const history = await Effect.runPromise(reopened.findHistoryByAnswer("42", "100"));
    expect(history[0]?.status).toBe("DISPUTED");
  });
});
