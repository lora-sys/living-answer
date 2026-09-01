import { describe, expect, it } from "vite-plus/test";

import { groupByAnswer } from "./list-patch-changes";
import type { PatchLifecycleRecordWithStatus } from "../lib/patch-lifecycle-store";

const makeRecord = (
  questionId: string,
  answerId: string,
  eventAt: number,
  opts: Partial<Pick<PatchLifecycleRecordWithStatus, "status" | "recordFingerprint">> = {},
): PatchLifecycleRecordWithStatus =>
  Object.freeze({
    questionId,
    answerId,
    excerptFingerprint: `v1:excerpt-${questionId}-${answerId}-${eventAt}`,
    recordFingerprint: opts.recordFingerprint ?? `v1:rec-${questionId}-${answerId}-${eventAt}`,
    reason: `reason for ${questionId}:${answerId} at ${eventAt}`,
    selectedEvidenceFingerprints: [],
    evidence: [],
    capturedAt: eventAt - 1000,
    eventAt,
    status: opts.status ?? "VISIBLE",
  });

describe("groupByAnswer", () => {
  it("returns an empty array for an empty input", () => {
    expect(groupByAnswer([])).toEqual([]);
  });

  it("groups records by (questionId, answerId)", () => {
    const q42a100 = makeRecord("42", "100", 1_700_000_005_000);
    const q42a101 = makeRecord("42", "101", 1_700_000_006_000);
    const q7a5 = makeRecord("7", "5", 1_700_000_007_000);

    const groups = groupByAnswer([q42a100, q42a101, q7a5]);

    expect(groups).toHaveLength(3);
    expect(new Set(groups.map((g) => `${g.questionId}:${g.answerId}`))).toEqual(
      new Set(["42:100", "42:101", "7:5"]),
    );
  });

  it("orders groups by newest event, newest first", () => {
    const oldRecord = makeRecord("1", "1", 1_700_000_001_000);
    const middleRecord = makeRecord("2", "2", 1_700_000_002_000);
    const newRecord = makeRecord("3", "3", 1_700_000_003_000);

    const groups = groupByAnswer([oldRecord, middleRecord, newRecord]);

    expect(groups).toHaveLength(3);
    expect(groups[0].questionId).toBe("3");
    expect(groups[1].questionId).toBe("2");
    expect(groups[2].questionId).toBe("1");
  });

  it("orders runs within each group from newest to oldest", () => {
    const older = makeRecord("1", "1", 1_700_000_001_000);
    const middle = makeRecord("1", "1", 1_700_000_002_000, { recordFingerprint: "v1:middle" });
    const newer = makeRecord("1", "1", 1_700_000_003_000, { recordFingerprint: "v1:newer" });

    const groups = groupByAnswer([older, newer, middle]);

    expect(groups).toHaveLength(1);
    expect(groups[0].recordCount).toBe(3);
    expect(groups[0].runs[0].eventAt).toBe(1_700_000_003_000);
    expect(groups[0].runs[1].eventAt).toBe(1_700_000_002_000);
    expect(groups[0].runs[2].eventAt).toBe(1_700_000_001_000);
  });

  it("reports accurate recordCount per group", () => {
    const r1 = makeRecord("1", "1", 1_700_000_001_000);
    const r2 = makeRecord("1", "1", 1_700_000_002_000);
    const r3 = makeRecord("2", "2", 1_700_000_003_000);

    const groups = groupByAnswer([r1, r2, r3]);

    const g1 = groups.find((g) => g.questionId === "1" && g.answerId === "1");
    const g2 = groups.find((g) => g.questionId === "2" && g.answerId === "2");
    expect(g1?.recordCount).toBe(2);
    expect(g2?.recordCount).toBe(1);
  });

  it("sets newestEventAt to the most recent run event", () => {
    const r1 = makeRecord("1", "1", 1_700_000_001_000);
    const r2 = makeRecord("1", "1", 1_700_000_003_000);
    const r3 = makeRecord("1", "1", 1_700_000_002_000);

    const groups = groupByAnswer([r1, r2, r3]);

    expect(groups[0].newestEventAt).toBe(1_700_000_003_000);
  });

  it("produces stable ordering when two groups share the same newest eventAt", () => {
    const r1 = makeRecord("1", "1", 1_700_000_003_000);
    const r2 = makeRecord("1", "1", 1_700_000_003_000, { recordFingerprint: "v1:second" });

    const groups = groupByAnswer([r1, r2]);

    expect(groups).toHaveLength(1);
    expect(groups[0].runs).toHaveLength(2);
  });

  it("preserves all ChangeEntry fields from each record", () => {
    const record = makeRecord("42", "100", 1_700_000_005_000, {
      status: "DISPUTED",
      recordFingerprint: "v1:custom-fp",
    });
    const trackedRecord: PatchLifecycleRecordWithStatus = {
      ...record,
      selectedEvidenceFingerprints: ["v1:ev1"],
    };

    const groups = groupByAnswer([trackedRecord]);

    const run = groups[0].runs[0];
    expect(run.recordFingerprint).toBe("v1:custom-fp");
    expect(run.status).toBe("DISPUTED");
    expect(run.reason).toContain("42:100");
    expect(run.eventAt).toBe(1_700_000_005_000);
    expect(run.capturedAt).toBe(1_700_000_004_000);
    expect(run.evidenceCount).toBe(1);
    expect(run.questionId).toBe("42");
    expect(run.answerId).toBe("100");
  });
});
