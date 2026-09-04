export type EvalDifficulty = "easy" | "medium" | "hard";

export type EvalCategory = "rag_qa" | "tool_call" | "multi_turn" | "bug_regression" | "adversarial";

export interface GoldenCase {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly category: EvalCategory;
  readonly tags: readonly string[];
  readonly difficulty: EvalDifficulty;
  readonly input: {
    readonly question: string;
    readonly followUps?: readonly string[];
  };
  readonly expected: {
    readonly flow: "full" | "safe_no_thread";
    readonly requiredTools: readonly string[];
    readonly mustInclude?: readonly string[];
    /**
     * Same idea, multiple accepted wordings.  Satisfying any member counts as
     * coverage, because learners who read "服务端组件" have "服务器组件" even
     * though a substring scorer cannot see it.
     */
    readonly mustIncludeAny?: readonly (readonly string[])[];
    readonly mustNotInclude?: readonly string[];
    readonly minSources?: number;
  };
  readonly bugId?: string;
}

export interface ToolTrace {
  readonly tool: string;
  readonly input: unknown;
  readonly output?: unknown;
  readonly error?: string;
  readonly durationMs: number;
}

export interface EvalJudge {
  readonly score: number;
  readonly verdict: "pass" | "weak" | "fail";
  readonly reason: string;
  readonly hallucination: boolean;
  readonly evidenceGrounded: boolean;
  readonly taskComplete: boolean;
}

export interface EvalCaseResult {
  readonly caseId: string;
  readonly category: EvalCategory;
  readonly difficulty: EvalDifficulty;
  readonly bugId?: string;
  passed: boolean;
  status: "pass" | "weak" | "fail";
  failures: string[];
  metrics: {
    workflowComplete: boolean;
    requiredToolsUsed: boolean;
    evidenceGrounded: boolean;
    noPromptInjection: boolean;
    noSecretLeak: boolean;
    safeBehavior: boolean;
    outputValid: boolean;
    similarity: number;
    judgeScore: number;
    /**
     * Share of follow-ups the thread honestly could not answer.  Honest gaps
     * are not evidence failures, but they are a coverage signal worth
     * tracking across versions.
     */
    agentGapRate: number;
    /**
     * Diagnostic split of the literal must_include misses.  Recorded after
     * scoring, so it cannot influence pass/fail.
     */
    conceptSynonymCovered?: number;
    conceptRealGap?: number;
  };
  counts: {
    hallucination: boolean;
    formatError: boolean;
    injectionSuccess: boolean;
    timeout: boolean;
  };
  readonly threadId?: string;
  readonly durationMs: number;
  tools: ToolTrace[];
  modelOutput: {
    clarify?: unknown;
    rank?: unknown;
    agent?: unknown;
    conceptCoverage?: { missed: string[]; coveredBySynonym: string[] };
  };
  judge?: EvalJudge;
}

export interface EvalRunSummary {
  readonly runId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly commit: string;
  readonly model: string;
  readonly datasetVersion: number;
  readonly datasetHash: string;
  readonly total: number;
  readonly executed: number;
  readonly passed: number;
  readonly weak: number;
  readonly failed: number;
  readonly successRate: number;
  readonly metrics: Record<string, number>;
  readonly byCategory: Record<
    string,
    { total: number; executed: number; passed: number; successRate: number }
  >;
  readonly byDifficulty: Record<
    string,
    { total: number; executed: number; passed: number; successRate: number }
  >;
  readonly errors: Record<string, number>;
}
