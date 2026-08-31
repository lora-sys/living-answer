import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  makeSqlitePatchLifecycleStore,
  type PatchLifecycleStore,
} from "../lib/patch-lifecycle-store";

export interface ResolvePatchLifecycleInput {
  readonly recordFingerprint: string;
}

export type ResolvePatchLifecycleResponse =
  | {
      readonly status: "ok";
      readonly recordFingerprint: string;
      readonly resolvedAt: number;
    }
  | {
      readonly status: "error";
      readonly code: "INVALID_REQUEST" | "RESOLVE_PATCH_NOT_FOUND" | "RESOLVE_PATCH_STORE_ERROR";
    };

const RECORD_FINGERPRINT_PATTERN = /^v1:[0-9a-f]{16}$/;

const validateInput = (input: unknown): ResolvePatchLifecycleInput => {
  if (typeof input !== "object" || input === null) {
    return { recordFingerprint: "" };
  }
  const raw = input as Record<string, unknown>;
  const recordFingerprint = typeof raw.recordFingerprint === "string" ? raw.recordFingerprint : "";
  return { recordFingerprint };
};

export const createResolvePatchLifecycleHandler =
  (deps: { readonly createLifecycleStore: () => Promise<PatchLifecycleStore> }) =>
  async (input: ResolvePatchLifecycleInput): Promise<ResolvePatchLifecycleResponse> => {
    if (!RECORD_FINGERPRINT_PATTERN.test(input.recordFingerprint)) {
      return { status: "error", code: "INVALID_REQUEST" };
    }

    let lifecycleStore: PatchLifecycleStore;
    try {
      lifecycleStore = await deps.createLifecycleStore();
    } catch {
      return { status: "error", code: "RESOLVE_PATCH_STORE_ERROR" };
    }

    const resolvedAt = Date.now();
    const outcome = await Effect.runPromise(
      Effect.either(lifecycleStore.resolve(input.recordFingerprint, resolvedAt)),
    );

    if (outcome._tag === "Left") {
      return { status: "error", code: "RESOLVE_PATCH_STORE_ERROR" };
    }
    if (!outcome.right) {
      return { status: "error", code: "RESOLVE_PATCH_NOT_FOUND" };
    }

    return {
      status: "ok",
      recordFingerprint: input.recordFingerprint,
      resolvedAt,
    };
  };

export const resolvePatchLifecycle = createServerFn({
  method: "POST",
})
  .validator(validateInput)
  .handler(async ({ data }): Promise<ResolvePatchLifecycleResponse> => {
    return createResolvePatchLifecycleHandler({
      createLifecycleStore: () =>
        Effect.runPromise(makeSqlitePatchLifecycleStore(".local/patch-lifecycle.db")),
    })(data);
  });
