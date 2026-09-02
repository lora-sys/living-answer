/**
 * Thread synthesis workflow for the Question Learning Thread product.
 *
 * Receives validated excerpts, metadata, and the clarified question. It drafts
 * learning nodes, but the workflow owns the final artifact:
 *
 * - Every learning summary must cite at least one selected excerpt
 * - Every quote must be an exact substring of the validated excerpt after
 *   the project's normal whitespace normalization
 * - Unsupported drafts become `unknown` nodes without a factual conclusion
 * - Summaries use "the premise has changed", not "the author was wrong"
 * - Source links must be canonical parsed Zhihu URLs
 * - Model output with malformed citations, unknown answer IDs, or banned
 *   wording is rejected and mapped to a safe `ThreadSynthesisError`
 *
 * A deterministic fallback may mark the selected answers as source timeline
 * stages without invented analysis.
 *
 * @module thread-synthesis
 */

import { Data, Effect } from "effect";

import type {
  TimelineStage,
  LearningNodeKind,
  EvidenceRef,
  LearningGuide,
  LearningGuideStage,
  LearningGuideInput,
  LearningGuideRole,
} from "./thread-artifact";

// ── Banned wording patterns (author-respect) ───────────────────────────────────

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

// ── Errors ─────────────────────────────────────────────────────────────────────

export class ThreadSynthesisError extends Data.TaggedError("ThreadSynthesisError")<{
  readonly reason:
    | "MALFORMED_RESPONSE"
    | "UNCITED_CLAIM"
    | "UNKNOWN_ANSWER_ID"
    | "BANNED_WORDING"
    | "MALFORMED_CITATION"
    | "TRANSPORT_FAILED";
}> {}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SynthesizedNode {
  readonly kind: LearningNodeKind;
  readonly title: string;
  readonly summary: string;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly sourceAnswerId: string;
  readonly sourceUrl: string;
  readonly uncertainty: number;
}

export interface SynthesisInput {
  readonly question: string;
  readonly refinedQuery: string;
  readonly learningIntent: string;
  readonly timelineStages: readonly TimelineStage[];
  readonly maxNodes?: number;
}

export interface ThreadSynthesisDeps {
  readonly model: string;
  readonly chat: {
    readonly complete: (request: {
      readonly model: string;
      readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
    }) => Effect.Effect<string, unknown>;
  };
}

export interface ThreadSynthesisResult {
  readonly _tag: "success";
  readonly nodes: readonly SynthesizedNode[];
  readonly learningGuide: LearningGuide;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_NODES = 7; // one per kind
const MAX_QUESTION_LENGTH = 500;

// ── Answer ID map for validation ───────────────────────────────────────────────

const buildAnswerIdMap = (timelineStages: readonly TimelineStage[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const stage of timelineStages) {
    map.set(stage.answerId, stage.canonicalUrl);
  }
  return map;
};

// ── Excerpt fingerprint map for citation validation ─────────────────────────────

interface ExcerptCitationData {
  readonly fingerprint: string;
  readonly normalizedText: string;
}

const buildExcerptCitationMap = (
  timelineStages: readonly TimelineStage[],
): Map<string, ExcerptCitationData> => {
  const map = new Map<string, ExcerptCitationData>();
  for (const stage of timelineStages) {
    map.set(stage.excerpt.fingerprint, {
      fingerprint: stage.excerpt.fingerprint,
      normalizedText: stage.excerpt.excerpt,
    });
  }
  return map;
};

// ── Validate a single synthesized node ────────────────────────────────────────

const validateNode = (
  raw: Record<string, unknown>,
  answerIdMap: Map<string, string>,
  excerptCitationMap: Map<string, ExcerptCitationData>,
): SynthesizedNode | null => {
  // kind
  const kind = raw.kind;
  if (
    typeof kind !== "string" ||
    (kind !== "relationship" &&
      kind !== "cause" &&
      kind !== "evolution" &&
      kind !== "consensus" &&
      kind !== "divergence" &&
      kind !== "changed_premise" &&
      kind !== "unknown")
  ) {
    return null;
  }

  // title
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title === "") return null;

  // summary
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (summary === "") return null;

  // Check banned wording
  if (hasBannedWording(summary) || hasBannedWording(title)) {
    return null;
  }

  // evidenceRefs
  const evidenceRefsRaw = raw.evidenceRefs;
  if (!Array.isArray(evidenceRefsRaw) || evidenceRefsRaw.length === 0) {
    return null;
  }

  const evidenceRefs: EvidenceRef[] = [];
  for (const ref of evidenceRefsRaw) {
    if (typeof ref !== "object" || ref === null || Array.isArray(ref)) {
      return null;
    }
    const refObj = ref as Record<string, unknown>;
    const excerptFingerprint =
      typeof refObj.excerptFingerprint === "string" ? refObj.excerptFingerprint.trim() : "";
    if (excerptFingerprint === "") return null;

    const quote = typeof refObj.quote === "string" ? refObj.quote.trim() : "";
    if (quote === "") return null;

    // Verify the quote is an exact substring of the validated excerpt
    const excerptData = excerptCitationMap.get(excerptFingerprint);
    if (excerptData === undefined) {
      return null;
    }
    if (!excerptData.normalizedText.includes(quote)) {
      return null;
    }

    evidenceRefs.push({
      excerptFingerprint,
      quote,
    });
  }

  // sourceAnswerId
  const sourceAnswerId = typeof raw.sourceAnswerId === "string" ? raw.sourceAnswerId.trim() : "";
  if (sourceAnswerId === "" || !answerIdMap.has(sourceAnswerId)) {
    return null;
  }

  // sourceUrl
  const sourceUrl = typeof raw.sourceUrl === "string" ? raw.sourceUrl.trim() : "";
  if (sourceUrl === "" || sourceUrl !== answerIdMap.get(sourceAnswerId)) {
    return null;
  }

  // uncertainty
  const uncertainty = raw.uncertainty;
  if (
    typeof uncertainty !== "number" ||
    !Number.isFinite(uncertainty) ||
    uncertainty < 0 ||
    uncertainty > 1
  ) {
    return null;
  }

  return {
    kind: kind as LearningNodeKind,
    title,
    summary,
    evidenceRefs,
    sourceAnswerId,
    sourceUrl,
    uncertainty,
  };
};

// ── System prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You help build a learning bridge from selected Zhihu answer excerpts. Produce learning nodes and a learning guide. " +
  "Each node has: kind (relationship, cause, evolution, consensus, divergence, changed_premise, or unknown), title, summary, evidenceRefs (array of {excerptFingerprint, quote}), sourceAnswerId, sourceUrl (canonical Zhihu URL), uncertainty (0.0-1.0). " +
  "The guide has overview {headline, summary, evidenceRefs}, one stage per selected answer with {answerId, role, explanation, transition, evidenceRefs}, and openQuestions. Roles are baseline, correction, extension, counterpoint, current_usage, or unclear. " +
  "Every evidenceRef.quote MUST be an exact substring of the corresponding excerpt text. " +
  "Never say the author was wrong; say the premise has changed. " +
  "SourceAnswerId must be one of the provided timeline stage answer IDs. " +
  "If you are not certain about a claim, use kind 'unknown' with a factual summary. " +
  "Do not add fields such as id, content, evidenceRef, source, selection_reference, or misconception_reminder. " +
  "Use exactly the requested field names. " +
  'Reply with only raw JSON: {"nodes":[...],"guide":{...}}';

// ── Fallback generation ────────────────────────────────────────────────────────

const makeFallbackNodes = (
  timelineStages: readonly TimelineStage[],
  maxNodes: number,
): SynthesizedNode[] => {
  const kind: LearningNodeKind = "unknown";
  const nodes: SynthesizedNode[] = [];

  for (let i = 0; i < Math.min(timelineStages.length, maxNodes); i++) {
    const stage = timelineStages[i];
    nodes.push({
      kind,
      title: `Selected answer excerpt: ${stage.authorDisplayName}`,
      summary: `Selected answer excerpt only, no synthesized learning nodes available.`,
      evidenceRefs: [
        {
          excerptFingerprint: stage.excerpt.fingerprint,
          quote: stage.excerpt.excerpt.slice(0, 100),
        },
      ],
      sourceAnswerId: stage.answerId,
      sourceUrl: stage.canonicalUrl,
      uncertainty: 1.0,
    });
  }

  return nodes;
};

const makeFallbackLearningGuide = (timelineStages: readonly TimelineStage[]): LearningGuide => ({
  overview: {
    headline: "来源摘录学习线",
    summary: "当前线程保留的是选中回答的公开摘录。AI 桥接暂不可用时，这些摘录仍可作为学习来源。",
    evidenceRefs: timelineStages.map((stage) => ({
      excerptFingerprint: stage.excerpt.fingerprint,
      quote: stage.excerpt.excerpt.slice(0, Math.min(100, stage.excerpt.excerpt.length)),
    })),
  },
  stages: timelineStages.map((stage) => ({
    answerId: stage.answerId,
    role: "unclear" as LearningGuideRole,
    explanation: "这段摘录已作为学习来源保留；当前没有可确认的 AI 解释。",
    evidenceRefs: [
      {
        excerptFingerprint: stage.excerpt.fingerprint,
        quote: stage.excerpt.excerpt.slice(0, Math.min(100, stage.excerpt.excerpt.length)),
      },
    ],
  })),
  openQuestions: ["读完后，这个知识点里还有哪些概念需要继续追问？"],
});

const validateGuideEvidence = (
  refs: readonly {
    readonly excerptFingerprint: string;
    readonly quote: string;
  }[],
  excerptCitationMap: Map<string, ExcerptCitationData>,
): EvidenceRef[] | null => {
  if (!Array.isArray(refs) || refs.length === 0) return null;
  const output: EvidenceRef[] = [];
  for (const ref of refs) {
    if (typeof ref !== "object" || ref === null || Array.isArray(ref)) return null;
    const fingerprint =
      typeof ref.excerptFingerprint === "string" ? ref.excerptFingerprint.trim() : "";
    const quote = typeof ref.quote === "string" ? ref.quote.trim() : "";
    if (fingerprint === "" || quote === "") return null;
    const excerpt = excerptCitationMap.get(fingerprint);
    if (!excerpt || !excerpt.normalizedText.includes(quote)) return null;
    output.push({ excerptFingerprint: fingerprint, quote });
  }
  return output;
};

const isValidGuideRole = (value: unknown): value is LearningGuideRole =>
  typeof value === "string" &&
  (value === "baseline" ||
    value === "correction" ||
    value === "extension" ||
    value === "counterpoint" ||
    value === "current_usage" ||
    value === "unclear");

const validateLearningGuide = (
  raw: unknown,
  timelineStages: readonly TimelineStage[],
  answerIdMap: Map<string, string>,
  excerptCitationMap: Map<string, ExcerptCitationData>,
): LearningGuide | null => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const input = raw as LearningGuideInput;

  if (
    typeof input.overview !== "object" ||
    input.overview === null ||
    typeof input.overview.headline !== "string" ||
    input.overview.headline.trim() === "" ||
    typeof input.overview.summary !== "string" ||
    input.overview.summary.trim() === "" ||
    hasBannedWording(input.overview.headline) ||
    hasBannedWording(input.overview.summary)
  ) {
    return null;
  }

  const overviewEvidence = validateGuideEvidence(input.overview.evidenceRefs, excerptCitationMap);
  if (!overviewEvidence) return null;

  if (!Array.isArray(input.stages) || input.stages.length !== timelineStages.length) return null;
  const stages: LearningGuideStage[] = [];
  for (const stageInput of input.stages) {
    if (typeof stageInput !== "object" || stageInput === null) return null;
    if (!answerIdMap.has(stageInput.answerId) || !isValidGuideRole(stageInput.role)) return null;
    if (
      typeof stageInput.explanation !== "string" ||
      stageInput.explanation.trim() === "" ||
      hasBannedWording(stageInput.explanation)
    ) {
      return null;
    }
    const evidenceRefs = validateGuideEvidence(stageInput.evidenceRefs, excerptCitationMap);
    if (!evidenceRefs) return null;
    stages.push({
      answerId: stageInput.answerId,
      role: stageInput.role,
      explanation: stageInput.explanation.trim(),
      transition:
        typeof stageInput.transition === "string" &&
        stageInput.transition.trim() !== "" &&
        !hasBannedWording(stageInput.transition)
          ? stageInput.transition.trim()
          : undefined,
      evidenceRefs,
    });
  }

  if (!Array.isArray(input.openQuestions)) return null;
  const openQuestions = input.openQuestions
    .filter((question): question is string => typeof question === "string")
    .map((question) => question.trim())
    .filter((question) => question !== "" && !hasBannedWording(question));

  return {
    overview: {
      headline: input.overview.headline.trim(),
      summary: input.overview.summary.trim(),
      evidenceRefs: overviewEvidence,
    },
    stages,
    openQuestions,
  };
};

// ── Workflow ───────────────────────────────────────────────────────────────────

export const synthesizeThread =
  (deps: ThreadSynthesisDeps) =>
  (input: SynthesisInput): Effect.Effect<ThreadSynthesisResult, ThreadSynthesisError> =>
    Effect.gen(function* () {
      const question = input.question.trim();
      if (question === "" || question.length > MAX_QUESTION_LENGTH) {
        return yield* Effect.fail(new ThreadSynthesisError({ reason: "MALFORMED_RESPONSE" }));
      }

      const maxNodes = input.maxNodes ?? MAX_NODES;
      const answerIdMap = buildAnswerIdMap(input.timelineStages);
      const excerptCitationMap = buildExcerptCitationMap(input.timelineStages);

      // Build the context payload from timeline stages
      const stagesSummary = input.timelineStages
        .map(
          (s) =>
            `[Answer ${s.answerId}] ${s.authorDisplayName}: ${s.excerpt.excerpt.slice(0, 300)}`,
        )
        .join("\n\n");

      const userPrompt = [
        `Question: ${question}`,
        `Refined query: ${input.refinedQuery}`,
        `Learning intent: ${input.learningIntent}`,
        "",
        "Selected excerpts (each prefixed with [Answer ID]):",
        stagesSummary,
        "",
        `Answer IDs and canonical URLs: ${Array.from(answerIdMap.entries())
          .map(([answerId, canonicalUrl]) => `${answerId} -> ${canonicalUrl}`)
          .join("; ")}`,
        `Excerpt fingerprints: ${Array.from(excerptCitationMap.keys()).join(", ")}`,
        "",
        `Produce up to ${maxNodes} learning nodes and the guide as a JSON object {"nodes":[...],"guide":{...}}.`,
      ].join("\n");

      const raw = yield* deps.chat
        .complete({
          model: deps.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        })
        .pipe(Effect.mapError(() => new ThreadSynthesisError({ reason: "TRANSPORT_FAILED" })));

      // Parse the JSON response
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.trim());
      } catch {
        return yield* Effect.fail(new ThreadSynthesisError({ reason: "MALFORMED_RESPONSE" }));
      }

      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return yield* Effect.fail(new ThreadSynthesisError({ reason: "MALFORMED_RESPONSE" }));
      }

      const obj = parsed as Record<string, unknown>;
      const nodesRaw = obj.nodes;
      if (!Array.isArray(nodesRaw) || nodesRaw.length === 0) {
        return yield* Effect.fail(new ThreadSynthesisError({ reason: "MALFORMED_RESPONSE" }));
      }

      // Validate each node
      const validNodes: SynthesizedNode[] = [];
      for (const nodeRaw of nodesRaw) {
        if (typeof nodeRaw !== "object" || nodeRaw === null || Array.isArray(nodeRaw)) {
          continue;
        }
        const validated = validateNode(
          nodeRaw as Record<string, unknown>,
          answerIdMap,
          excerptCitationMap,
        );
        if (validated !== null) {
          validNodes.push(validated);
        }
      }

      if (validNodes.length === 0) {
        // All nodes failed validation — use fallback
        return {
          _tag: "success",
          nodes: makeFallbackNodes(input.timelineStages, maxNodes),
          learningGuide: makeFallbackLearningGuide(input.timelineStages),
        };
      }

      const learningGuide =
        validateLearningGuide(obj.guide, input.timelineStages, answerIdMap, excerptCitationMap) ??
        makeFallbackLearningGuide(input.timelineStages);

      return { _tag: "success", nodes: validNodes, learningGuide };
    });
