import { describe, expect, it } from "vite-plus/test";
import { Effect } from "effect";

import {
  createDisputePatchLifecycleHandler,
  type DisputePatchLifecycleInput,
} from "./dispute-patch-lifecycle";
import { PatchLifecycleStoreError, type PatchLifecycleStore } from "../lib/patch-lifecycle-store";

const FAILED_STORE = {
  saveVisible: () => Effect.fail(new PatchLifecycleStoreError({ reason: "unused" })),
  supersedeByExcerptFingerprint: () =>
    Effect.fail(new PatchLifecycleStoreError({ reason: "unused" })),
  dispute: () => Effect.fail(new PatchLifecycleStoreError({ reason: "unused" })),
  resolve: () => Effect.succeed(false),
  withdraw: () => Effect.succeed(false),
  findCurrentByExcerptFingerprint: () =>
    Effect.fail(new PatchLifecycleStoreError({ reason: "unused" })),
  findHistoryByAnswer: () => Effect.fail(new PatchLifecycleStoreError({ reason: "unused" })),
} satisfies PatchLifecycleStore;

const makeStore = (disputeResult: boolean): PatchLifecycleStore => ({
  ...FAILED_STORE,
  dispute: () => Effect.succeed(disputeResult),
  resolve: () => Effect.succeed(false),
  withdraw: () => Effect.succeed(false),
});

const call = (
  store: PatchLifecycleStore,
  input: DisputePatchLifecycleInput = { recordFingerprint: "v1:1111111111111111" },
) =>
  createDisputePatchLifecycleHandler({
    createLifecycleStore: async () => store,
  })(input);

describe("dispute-patch-lifecycle", () => {
  it("disputes a visible record and returns a JSON-safe result", async () => {
    const before = Date.now();
    const response = await call(makeStore(true));
    const after = Date.now();

    expect(response).toEqual({
      status: "ok",
      recordFingerprint: "v1:1111111111111111",
      disputedAt: expect.any(Number),
    });
    if (response.status === "ok") {
      expect(response.disputedAt).toBeGreaterThanOrEqual(before);
      expect(response.disputedAt).toBeLessThanOrEqual(after);
    }
  });

  it("fails closed when the record is missing or not visible", async () => {
    const response = await call(makeStore(false));

    expect(response).toEqual({ status: "error", code: "DISPUTE_PATCH_NOT_FOUND" });
  });

  it("maps store creation and store failures to a stable error", async () => {
    const creationFailure = await createDisputePatchLifecycleHandler({
      createLifecycleStore: async () => {
        throw new Error("database unavailable");
      },
    })({ recordFingerprint: "v1:1111111111111111" });
    const storeFailure = await call(FAILED_STORE);

    expect(creationFailure).toEqual({ status: "error", code: "DISPUTE_PATCH_STORE_ERROR" });
    expect(storeFailure).toEqual({ status: "error", code: "DISPUTE_PATCH_STORE_ERROR" });
  });

  it("rejects malformed fingerprints without opening the store", async () => {
    let storeOpened = false;
    const response = await createDisputePatchLifecycleHandler({
      createLifecycleStore: async () => {
        storeOpened = true;
        return FAILED_STORE;
      },
    })({ recordFingerprint: "not-a-fingerprint" });

    expect(response).toEqual({ status: "error", code: "INVALID_REQUEST" });
    expect(storeOpened).toBe(false);
  });
});
