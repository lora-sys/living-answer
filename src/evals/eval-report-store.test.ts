import { describe, expect, it } from "vite-plus/test";

import { createEvalReportStore } from "./eval-report-store";

const summary = {
  runId: "run-001",
  startedAt: "2026-09-03T00:00:00.000Z",
  finishedAt: "2026-09-03T00:01:00.000Z",
  commit: "test",
  model: "test-model",
  datasetVersion: 1,
  datasetHash: "abc",
  total: 264,
  executed: 2,
  passed: 1,
  weak: 1,
  failed: 0,
  successRate: 0.5,
  metrics: { outputValid: 1 },
  byCategory: {},
  byDifficulty: {},
  errors: { tool_error: 1 },
};

const caseResult = {
  caseId: "case-bad",
  category: "rag_qa" as const,
  difficulty: "hard" as const,
  status: "weak" as const,
  passed: false,
  failures: ["tool_error"],
  metrics: { outputValid: false } as never,
  counts: { formatError: true } as never,
  durationMs: 120,
  tools: [{ tool: "search", durationMs: 10, input: { query: "x" }, output: [] }],
  modelOutput: {},
};

const createStore = () =>
  createEvalReportStore({
    rootDir: "/root",
    readFile: (path) => {
      if (path.endsWith("run-001-summary.json")) return JSON.stringify(summary);
      if (path.endsWith("run-001-cases.json")) return JSON.stringify([caseResult]);
      if (path.endsWith("run-001-comparison.json")) {
        return JSON.stringify({
          previousRunId: "run-000",
          currentRunId: "run-001",
          successRateDelta: 0.1,
          judgeScoreDelta: -0.2,
          regressions: ["case-old"],
          improvements: ["case-bad"],
        });
      }
      if (path.endsWith("bad-summary.json")) return "not-json";
      throw new Error("missing");
    },
    listFiles: () => ["run-001-summary.json", "run-001-cases.json", "bad-summary.json"],
    joinPath: (...parts) => parts.join("/"),
  });

describe("eval report store", () => {
  it("returns an empty dashboard without reports", async () => {
    const dashboard = await createEvalReportStore({
      rootDir: "/root",
      readFile: () => "",
      listFiles: () => [],
      joinPath: (...parts) => parts.join("/"),
    }).read();

    expect(dashboard.status).toBe("empty");
    expect(dashboard.runs).toEqual([]);
  });

  it("reads the latest run, selects a failing case, and includes comparison", async () => {
    const dashboard = await createStore().read();

    expect(dashboard.status).toBe("ok");
    expect(dashboard.runs).toHaveLength(1);
    expect(dashboard.selectedRunId).toBe("run-001");
    expect(dashboard.cases).toHaveLength(1);
    expect(dashboard.selectedCaseId).toBe("case-bad");
    expect(dashboard.selectedCase?.tools[0].input).toContain('"query": "x"');
    expect(dashboard.comparison?.improvements).toEqual(["case-bad"]);
  });

  it("rejects unsafe ids and unreadable reports without exposing filesystem errors", async () => {
    const bad = await createStore().read({ runId: "../../secret" });
    expect(bad.status).toBe("error");
    expect(bad.message).toBe("指定的 eval run 不存在。");
    expect(bad.selectedCase).toBeUndefined();

    const unreadableStore = createEvalReportStore({
      rootDir: "/root",
      readFile: () => {
        throw new Error("EACCES /root/secret");
      },
      listFiles: () => ["run-001-summary.json"],
      joinPath: (...parts) => parts.join("/"),
    });
    const unreadable = await unreadableStore.read();
    expect(unreadable.status).toBe("error");
    expect(unreadable.message).toBe("无法读取本地 eval 报告。");
    expect(unreadable.runs).toEqual([]);
  });
});
