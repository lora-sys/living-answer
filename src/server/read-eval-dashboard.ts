import { createServerFn } from "@tanstack/react-start";

import { createLocalEvalReportStore } from "../evals/eval-report-store";

const parseInput = (input: unknown): { readonly runId?: string; readonly caseId?: string } => {
  if (typeof input !== "object" || input === null) return {};
  const value = input as Record<string, unknown>;
  return {
    runId: typeof value.runId === "string" ? value.runId : undefined,
    caseId: typeof value.caseId === "string" ? value.caseId : undefined,
  };
};

export const readEvalDashboardFn = createServerFn({ method: "POST" })
  .validator(parseInput)
  .handler(async ({ data }) => {
    const input = data as { runId?: string; caseId?: string } | undefined;
    const dashboard = createLocalEvalReportStore().read({
      runId: input?.runId,
      caseId: input?.caseId,
    });
    return Promise.resolve(dashboard);
  });
