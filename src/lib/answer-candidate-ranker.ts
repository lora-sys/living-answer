import { Data, Effect } from "effect";
import { describeTransportError } from "./openai-adapter";

// ── Banned wording (author respect) ─────────────────────────────────────────

const BANNED_PATTERNS = [
  /原[答作]者[是为][错了]/,
  /作者[是为][错了]/,
  /回答[是为][错了]/,
  /事实[是为][错了]/,
  /答案[是为][错了]/,
  /wrong\s+(author|authority)/i,
];

const hasBannedWording = (text: string): boolean =>
  BANNED_PATTERNS.some((pattern) => pattern.test(text));

// ── Errors ──────────────────────────────────────────────────────────────────

export class CandidateRankingError extends Data.TaggedError("CandidateRankingError")<{
  readonly reason: "INVALID_INPUT" | "MALFORMED_RESPONSE" | "TRANSPORT_FAILED";
  /** Underlying transport detail, kept for traces only. */
  readonly cause?: string;
}> {}

// ── Types ───────────────────────────────────────────────────────────────────

export type CandidateRole =
  | "baseline"
  | "correction"
  | "extension"
  | "counterpoint"
  | "current_usage"
  | "unclear";

export interface RankableCandidate {
  readonly answerId: string;
  readonly title: string;
  readonly authorDisplayName: string;
  readonly preview: string;
}

export interface CandidateRanking {
  readonly answerId: string;
  readonly role: CandidateRole;
  readonly reason: string;
}

export interface CandidateRankingAnalysis {
  readonly summary: string;
  readonly rankings: readonly CandidateRanking[];
  readonly confidence: number;
}

export interface RankAnswerCandidatesInput {
  readonly question: string;
  readonly refinedQuery: string;
  readonly learningIntent: string;
  readonly candidates: readonly RankableCandidate[];
}

export interface CandidateRankingDeps {
  readonly model: string;
  readonly chat: {
    readonly complete: (request: {
      readonly model: string;
      readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
    }) => Effect.Effect<string, unknown>;
  };
}

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_CANDIDATES = 5;

// ── Validation ──────────────────────────────────────────────────────────────

const isValidRole = (value: unknown): value is CandidateRole =>
  typeof value === "string" &&
  (value === "baseline" ||
    value === "correction" ||
    value === "extension" ||
    value === "counterpoint" ||
    value === "current_usage" ||
    value === "unclear");

const validateInput = (input: RankAnswerCandidatesInput): RankAnswerCandidatesInput | null => {
  const question = typeof input?.question === "string" ? input.question.trim() : "";
  const refinedQuery = typeof input?.refinedQuery === "string" ? input.refinedQuery.trim() : "";
  const learningIntent =
    typeof input?.learningIntent === "string" ? input.learningIntent.trim() : "";

  if (
    question === "" ||
    question.length > 500 ||
    refinedQuery === "" ||
    learningIntent === "" ||
    !Array.isArray(input?.candidates) ||
    input.candidates.length === 0 ||
    input.candidates.length > MAX_CANDIDATES
  ) {
    return null;
  }

  const ids = new Set<string>();
  for (const candidate of input.candidates) {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      typeof candidate.answerId !== "string" ||
      !/^\d+$/.test(candidate.answerId) ||
      typeof candidate.title !== "string" ||
      candidate.title.trim() === "" ||
      typeof candidate.authorDisplayName !== "string" ||
      candidate.authorDisplayName.trim() === "" ||
      typeof candidate.preview !== "string" ||
      candidate.preview.trim() === "" ||
      ids.has(candidate.answerId)
    ) {
      return null;
    }
    ids.add(candidate.answerId);
  }

  return {
    question,
    refinedQuery,
    learningIntent,
    candidates: input.candidates,
  };
};

// ── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You help a learner understand why each Zhihu search candidate may belong in a learning thread. " +
  'Return only raw JSON: {"summary":"...","rankings":[{"answerId":"...","role":"baseline|correction|extension|counterpoint|current_usage|unclear","reason":"..."}],"confidence":0.0-1.0}. ' +
  "Use exactly one ranking per candidate. Reasons must be short Chinese explanations grounded in the supplied candidate excerpts. " +
  "Do not invent facts. Do not say the author was wrong; describe perspective, scope, timing, or usefulness instead.";

const buildUserPrompt = (input: RankAnswerCandidatesInput): string => {
  const candidateContext = input.candidates
    .map(
      (candidate) =>
        `[${candidate.answerId}] ${candidate.title} — ${candidate.authorDisplayName}: ${candidate.preview}`,
    )
    .join("\n\n");

  return [
    `Question: ${input.question}`,
    `Refined query: ${input.refinedQuery}`,
    `Learning intent: ${input.learningIntent}`,
    "",
    "Candidates:",
    candidateContext,
    "",
    "Explain each candidate's likely role in the learning thread.",
  ].join("\n");
};

// ── Model output validation ─────────────────────────────────────────────────

const parseRanking = (
  raw: string,
  input: RankAnswerCandidatesInput,
): CandidateRankingAnalysis | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  const value = parsed as Record<string, unknown>;
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  if (
    summary === "" ||
    summary.length > 500 ||
    hasBannedWording(summary) ||
    !Array.isArray(value.rankings)
  ) {
    return null;
  }

  const expectedIds = new Set(input.candidates.map((candidate) => candidate.answerId));
  const seenIds = new Set<string>();
  const rankings: CandidateRanking[] = [];
  for (const item of value.rankings) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
    const ranking = item as Record<string, unknown>;
    const answerId = typeof ranking.answerId === "string" ? ranking.answerId.trim() : "";
    const reason = typeof ranking.reason === "string" ? ranking.reason.trim() : "";
    if (
      !expectedIds.has(answerId) ||
      seenIds.has(answerId) ||
      !isValidRole(ranking.role) ||
      reason === "" ||
      reason.length > 400 ||
      hasBannedWording(reason)
    ) {
      return null;
    }
    seenIds.add(answerId);
    rankings.push({ answerId, role: ranking.role, reason });
  }

  if (seenIds.size !== expectedIds.size) return null;

  const confidence = value.confidence;
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    return null;
  }

  return { summary, rankings, confidence };
};

// ── Workflow ────────────────────────────────────────────────────────────────

export const rankAnswerCandidates =
  (deps: CandidateRankingDeps) =>
  (
    input: RankAnswerCandidatesInput,
  ): Effect.Effect<CandidateRankingAnalysis, CandidateRankingError> =>
    Effect.gen(function* () {
      const validatedInput = validateInput(input);
      if (!validatedInput) {
        return yield* Effect.fail(new CandidateRankingError({ reason: "INVALID_INPUT" }));
      }

      const raw = yield* deps.chat
        .complete({
          model: deps.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(validatedInput) },
          ],
        })
        .pipe(
          Effect.mapError(
            (error) =>
              new CandidateRankingError({
                reason: "TRANSPORT_FAILED",
                cause: describeTransportError(error),
              }),
          ),
        );

      const parsed = parseRanking(raw, validatedInput);
      if (!parsed) {
        return yield* Effect.fail(new CandidateRankingError({ reason: "MALFORMED_RESPONSE" }));
      }
      return parsed;
    });
