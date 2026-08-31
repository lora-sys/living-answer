import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  makeSqlitePatchLifecycleStore,
  type PatchLifecycleStore,
} from "../lib/patch-lifecycle-store";
import type { AnalyzePatchServerFailureCode } from "../lib/failure-messages";

export interface DisputePatchLifecycleInput {
  readonly recordFingerprint: string;
}

export type DisputePatchLifecycleResponse =
  | {
      readonly status: "ok";
      readonly recordFingerprint: string;
      readonly disputedAt: number;
    }
  | {
      readonly status: "error";
      readonly code: Extract<
        AnalyzePatchServerFailureCode,
        "INVALID_REQUEST" | "DISPUTE_PATCH_NOT_FOUND" | "DISPUTE_PATCH_STORE_ERROR"
      >;
    };

const RECORD_FINGERPRINT_PATTERN = /^v1:[0-9a-f]{16}$/;

const validateInput = (input: unknown): DisputePatchLifecycleInput => {
  if (typeof input !== "object" || input === null) {
    return { recordFingerprint: "" };
  }

  const raw = input as Record<string, unknown>;
  const recordFingerprint = typeof raw.recordFingerprint === "string" ? raw.recordFingerprint : "";

  return { recordFingerprint };
};

export const createDisputePatchLifecycleHandler =
  (deps: { readonly createLifecycleStore: () => Promise<PatchLifecycleStore> }) =>
  async (input: DisputePatchLifecycleInput): Promise<DisputePatchLifecycleResponse> => {
    if (!RECORD_FINGERPRINT_PATTERN.test(input.recordFingerprint)) {
      return { status: "error", code: "INVALID_REQUEST" };
    }

    let lifecycleStore: PatchLifecycleStore;
    try {
      lifecycleStore = await deps.createLifecycleStore();
    } catch {
      return { status: "error", code: "DISPUTE_PATCH_STORE_ERROR" };
    }

    const disputedAt = Date.now();
    const disputeOutcome = await Effect.runPromise(
      Effect.either(lifecycleStore.dispute(input.recordFingerprint, disputedAt)),
    );

    if (disputeOutcome._tag === "Left") {
      return { status: "error", code: "DISPUTE_PATCH_STORE_ERROR" };
    }
    if (!disputeOutcome.right) {
      return { status: "error", code: "DISPUTE_PATCH_NOT_FOUND" };
    }

    return {
      status: "ok",
      recordFingerprint: input.recordFingerprint,
      disputedAt,
    };
  };

export const disputePatchLifecycle = createServerFn({
  method: "POST",
})
  .validator(validateInput)
  .handler(async ({ data }): Promise<DisputePatchLifecycleResponse> => {
    return createDisputePatchLifecycleHandler({
      createLifecycleStore: () =>
        Effect.runPromise(makeSqlitePatchLifecycleStore(".local/patch-lifecycle.db")),
    })(data);
  });
