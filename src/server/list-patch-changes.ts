import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  makeSqlitePatchLifecycleStore,
  type PatchLifecycleRecordWithStatus,
} from "../lib/patch-lifecycle-store";

export interface ChangeEntry {
  readonly recordFingerprint: string;
  readonly questionId: string;
  readonly answerId: string;
  readonly status: string;
  readonly reason: string;
  readonly eventAt: number;
  readonly capturedAt: number;
  readonly evidenceCount: number;
}

export type ListPatchChangesResponse =
  | {
      readonly status: "ok";
      readonly changes: readonly ChangeEntry[];
    }
  | {
      readonly status: "error";
      readonly code: "CHANGES_STORE_ERROR";
      readonly message: string;
    };

function toChangeEntry(record: PatchLifecycleRecordWithStatus): ChangeEntry {
  return {
    recordFingerprint: record.recordFingerprint,
    questionId: record.questionId,
    answerId: record.answerId,
    status: record.status,
    reason: record.reason,
    eventAt: record.eventAt,
    capturedAt: record.capturedAt,
    evidenceCount: record.selectedEvidenceFingerprints.length,
  };
}

export const listPatchChanges = createServerFn({
  method: "GET",
}).handler(async (): Promise<ListPatchChangesResponse> => {
  try {
    const store = await Effect.runPromise(
      makeSqlitePatchLifecycleStore(".local/patch-lifecycle.db"),
    );
    const records = await Effect.runPromise(store.findAll());
    const changes = records.map(toChangeEntry);
    return { status: "ok", changes };
  } catch {
    return {
      status: "error",
      code: "CHANGES_STORE_ERROR",
      message: "加载变更记录时出现异常，请稍后再试。",
    };
  }
});
