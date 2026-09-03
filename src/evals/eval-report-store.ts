import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { EvalCaseResult, EvalRunSummary } from "./harness-types";

export type EvalDashboardStatus = "empty" | "error" | "ok";

export interface EvalCaseBrief {
  readonly caseId: string;
  readonly category: EvalCaseResult["category"];
  readonly difficulty: EvalCaseResult["difficulty"];
  readonly status: EvalCaseResult["status"];
  readonly passed: boolean;
  readonly failures: readonly string[];
  readonly durationMs: number;
  readonly threadId?: string;
}

export interface EvalToolBrief {
  readonly tool: string;
  readonly durationMs: number;
  readonly error?: string;
  readonly input?: string;
  readonly output?: string;
}

export interface EvalCaseDetail {
  readonly caseId: string;
  readonly category: EvalCaseResult["category"];
  readonly difficulty: EvalCaseResult["difficulty"];
  readonly bugId?: string;
  readonly status: EvalCaseResult["status"];
  readonly passed: boolean;
  readonly failures: readonly string[];
  readonly metrics: EvalCaseResult["metrics"];
  readonly counts: EvalCaseResult["counts"];
  readonly threadId?: string;
  readonly durationMs: number;
  readonly tools: readonly EvalToolBrief[];
  readonly modelOutput: string;
  readonly judge?: EvalCaseResult["judge"];
}

export interface EvalRunBrief {
  readonly runId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly model: string;
  readonly commit: string;
  readonly datasetVersion: number;
  readonly datasetHash: string;
  readonly total: number;
  readonly executed: number;
  readonly passed: number;
  readonly weak: number;
  readonly failed: number;
  readonly successRate: number;
}

export interface EvalDashboard {
  readonly status: EvalDashboardStatus;
  readonly message?: string;
  readonly runs: readonly EvalRunBrief[];
  readonly selectedRunId?: string;
  readonly summary?: EvalRunSummary;
  readonly comparison?: {
    readonly previousRunId: string;
    readonly currentRunId: string;
    readonly successRateDelta: number;
    readonly judgeScoreDelta: number;
    readonly regressions: readonly string[];
    readonly improvements: readonly string[];
  };
  readonly cases: readonly EvalCaseBrief[];
  readonly selectedCaseId?: string;
  readonly selectedCase?: EvalCaseDetail;
}

export interface EvalReportStoreDeps {
  readonly rootDir: string;
  readonly readFile: (path: string) => string;
  readonly listFiles: (path: string) => readonly string[];
  readonly joinPath: (...parts: readonly string[]) => string;
}

const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const CASE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

const toBrief = (summary: EvalRunSummary): EvalRunBrief => ({
  runId: summary.runId,
  startedAt: summary.startedAt,
  finishedAt: summary.finishedAt,
  model: summary.model,
  commit: summary.commit,
  datasetVersion: summary.datasetVersion,
  datasetHash: summary.datasetHash,
  total: summary.total,
  executed: summary.executed,
  passed: summary.passed,
  weak: summary.weak,
  failed: summary.failed,
  successRate: summary.successRate,
});

const toCaseBrief = (item: EvalCaseResult): EvalCaseBrief => ({
  caseId: item.caseId,
  category: item.category,
  difficulty: item.difficulty,
  status: item.status,
  passed: item.passed,
  failures: item.failures,
  durationMs: item.durationMs,
  threadId: item.threadId,
});

const toCaseDetail = (item: EvalCaseResult): EvalCaseDetail => ({
  caseId: item.caseId,
  category: item.category,
  difficulty: item.difficulty,
  bugId: item.bugId,
  status: item.status,
  passed: item.passed,
  failures: item.failures,
  metrics: item.metrics,
  counts: item.counts,
  threadId: item.threadId,
  durationMs: item.durationMs,
  tools: item.tools.map((tool) => ({
    tool: tool.tool,
    durationMs: tool.durationMs,
    error: tool.error,
    input: JSON.stringify(tool.input ?? null, null, 2),
    output: JSON.stringify(tool.output ?? null, null, 2),
  })),
  modelOutput: JSON.stringify(item.modelOutput ?? null, null, 2),
  judge: item.judge,
});

const parseJson = <T>(content: string): T | null => {
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
};

export const createEvalReportStore = (deps: EvalReportStoreDeps) => {
  const reportsDir = deps.joinPath(deps.rootDir, ".local", "evals", "reports");

  const readSummaries = (): readonly { summary: EvalRunSummary; fileName: string }[] => {
    const files = deps
      .listFiles(reportsDir)
      .filter((fileName) => fileName.endsWith("-summary.json"))
      .sort()
      .reverse();

    const summaries: { summary: EvalRunSummary; fileName: string }[] = [];
    for (const fileName of files) {
      const parsed = parseJson<EvalRunSummary>(deps.readFile(deps.joinPath(reportsDir, fileName)));
      if (parsed && typeof parsed.runId === "string" && RUN_ID_PATTERN.test(parsed.runId)) {
        summaries.push({ summary: parsed, fileName });
      }
    }
    return summaries.sort((left, right) => {
      const leftTime = Date.parse(left.summary.finishedAt);
      const rightTime = Date.parse(right.summary.finishedAt);
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return rightTime - leftTime;
      return right.fileName.localeCompare(left.fileName);
    });
  };

  const readCases = (runId: string): readonly EvalCaseResult[] => {
    const path = deps.joinPath(reportsDir, `${runId}-cases.json`);
    return parseJson<readonly EvalCaseResult[]>(deps.readFile(path)) ?? [];
  };

  const read = (input: { runId?: string; caseId?: string } = {}): Promise<EvalDashboard> =>
    Promise.resolve(
      ((): EvalDashboard => {
        try {
          const summaries = readSummaries();
          if (summaries.length === 0) {
            return { status: "empty", runs: [], cases: [] };
          }

          const selected = input.runId
            ? summaries.find((item) => item.summary.runId === input.runId)
            : summaries[0];
          if (!selected) {
            return {
              status: "error",
              message: "指定的 eval run 不存在。",
              runs: summaries.map((item) => toBrief(item.summary)),
              cases: [],
            };
          }

          const runId = selected.summary.runId;
          const rawCases = readCases(runId);
          const caseId =
            input.caseId && CASE_ID_PATTERN.test(input.caseId) ? input.caseId : undefined;
          const selectedCase = caseId
            ? rawCases.find((item) => item.caseId === caseId)
            : (rawCases.find((item) => !item.passed) ?? rawCases[0]);

          const comparisonPath = deps.joinPath(reportsDir, `${runId}-comparison.json`);
          let comparison: EvalDashboard["comparison"];
          try {
            const parsed = parseJson<NonNullable<EvalDashboard["comparison"]>>(
              deps.readFile(comparisonPath),
            );
            if (parsed) comparison = parsed;
          } catch {
            comparison = undefined;
          }

          return {
            status: "ok",
            runs: summaries.map((item) => toBrief(item.summary)),
            selectedRunId: runId,
            summary: selected.summary,
            comparison,
            cases: rawCases.map(toCaseBrief),
            selectedCaseId: selectedCase?.caseId,
            selectedCase: selectedCase ? toCaseDetail(selectedCase) : undefined,
          };
        } catch {
          return {
            status: "error",
            message: "无法读取本地 eval 报告。",
            runs: [],
            cases: [],
          };
        }
      })(),
    );

  return { read };
};

export const createLocalEvalReportStore = () =>
  createEvalReportStore({
    rootDir: process.cwd(),
    readFile: (path) => readFileSync(path, "utf8"),
    listFiles: (path) => readdirSync(path),
    joinPath: join,
  });
