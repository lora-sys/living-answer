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

export interface AnswerTimelineGroup {
  readonly questionId: string;
  readonly answerId: string;
  readonly recordCount: number;
  readonly newestEventAt: number;
  readonly runs: readonly ChangeEntry[];
}

export type ListPatchChangesResponse =
  | {
      readonly status: "ok";
      readonly changes: readonly ChangeEntry[];
      readonly groups: readonly AnswerTimelineGroup[];
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

export function groupByAnswer(
  records: readonly PatchLifecycleRecordWithStatus[],
): AnswerTimelineGroup[] {
  // Sort all records newest to oldest to establish a stable ordering
  const sorted = [...records].sort((a, b) => {
    const diff = b.eventAt - a.eventAt;
    if (diff !== 0) return diff;
    return a.recordFingerprint.localeCompare(b.recordFingerprint);
  });

  const groups = new Map<
    string,
    { questionId: string; answerId: string; runs: PatchLifecycleRecordWithStatus[] }
  >();
  for (const record of sorted) {
    const key = `${record.questionId}:${record.answerId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.runs.push(record);
    } else {
      groups.set(key, { questionId: record.questionId, answerId: record.answerId, runs: [record] });
    }
  }

  // Sort groups by their newest event, newest first
  return Array.from(groups.values())
    .sort((a, b) => b.runs[0].eventAt - a.runs[0].eventAt)
    .map((g) => ({
      questionId: g.questionId,
      answerId: g.answerId,
      recordCount: g.runs.length,
      newestEventAt: g.runs[0].eventAt,
      runs: g.runs.map(toChangeEntry),
    }));
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
    const groups = groupByAnswer(records);
    return { status: "ok", changes, groups };
  } catch {
    return {
      status: "error",
      code: "CHANGES_STORE_ERROR",
      message: "加载变更记录时出现异常，请稍后再试。",
    };
  }
});
