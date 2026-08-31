import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  makeSqlitePatchLifecycleStore,
  type PatchLifecycleStore,
} from "../lib/patch-lifecycle-store";

export interface WithdrawPatchLifecycleInput {
  readonly recordFingerprint: string;
}

export type WithdrawPatchLifecycleResponse =
  | {
      readonly status: "ok";
      readonly recordFingerprint: string;
      readonly withdrawnAt: number;
    }
  | {
      readonly status: "error";
      readonly code: "INVALID_REQUEST" | "WITHDRAW_PATCH_NOT_FOUND" | "WITHDRAW_PATCH_STORE_ERROR";
    };

const RECORD_FINGERPRINT_PATTERN = /^v1:[0-9a-f]{16}$/;

const validateInput = (input: unknown): WithdrawPatchLifecycleInput => {
  if (typeof input !== "object" || input === null) {
    return { recordFingerprint: "" };
  }
  const raw = input as Record<string, unknown>;
  const recordFingerprint = typeof raw.recordFingerprint === "string" ? raw.recordFingerprint : "";
  return { recordFingerprint };
};

export const createWithdrawPatchLifecycleHandler =
  (deps: { readonly createLifecycleStore: () => Promise<PatchLifecycleStore> }) =>
  async (input: WithdrawPatchLifecycleInput): Promise<WithdrawPatchLifecycleResponse> => {
    if (!RECORD_FINGERPRINT_PATTERN.test(input.recordFingerprint)) {
      return { status: "error", code: "INVALID_REQUEST" };
    }

    let lifecycleStore: PatchLifecycleStore;
    try {
      lifecycleStore = await deps.createLifecycleStore();
    } catch {
      return { status: "error", code: "WITHDRAW_PATCH_STORE_ERROR" };
    }

    const withdrawnAt = Date.now();
    const outcome = await Effect.runPromise(
      Effect.either(lifecycleStore.withdraw(input.recordFingerprint, withdrawnAt)),
    );

    if (outcome._tag === "Left") {
      return { status: "error", code: "WITHDRAW_PATCH_STORE_ERROR" };
    }
    if (!outcome.right) {
      return { status: "error", code: "WITHDRAW_PATCH_NOT_FOUND" };
    }

    return {
      status: "ok",
      recordFingerprint: input.recordFingerprint,
      withdrawnAt,
    };
  };

export const withdrawPatchLifecycle = createServerFn({
  method: "POST",
})
  .validator(validateInput)
  .handler(async ({ data }): Promise<WithdrawPatchLifecycleResponse> => {
    return createWithdrawPatchLifecycleHandler({
      createLifecycleStore: () =>
        Effect.runPromise(makeSqlitePatchLifecycleStore(".local/patch-lifecycle.db")),
    })(data);
  });
