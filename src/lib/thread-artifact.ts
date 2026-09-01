/**
 * Immutable {@link QuestionLearningThread} factory.
 *
 * A thread artifact captures one user's fuzzy question, the clarified intent,
 * the selected real Zhihu answer excerpts, and the AI-synthesized learning nodes
 * in a single durable JSON record.
 *
 * Every field is validated before assembly. The factory never throws -- it
 * returns a discriminated union on validation failure.
 *
 * @module thread-artifact
 */

// ── FNV-1a fingerprint ────────────────────────────────────────────────────────

import { fnv1a64 } from "./answer-excerpt";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LearningNodeKind =
  | "relationship"
  | "cause"
  | "evolution"
  | "consensus"
  | "divergence"
  | "changed_premise"
  | "unknown";

export interface TimelineStage {
  readonly questionId: string;
  readonly answerId: string;
  readonly title: string;
  readonly authorDisplayName: string;
  readonly editTime: number;
  readonly canonicalUrl: string;
  readonly excerpt: {
    readonly questionId: string;
    readonly answerId: string;
    readonly capturedAt: number;
    readonly sourceContentId: string;
    readonly sourceContentType: "Answer";
    readonly sourceEditTime: number;
    readonly excerpt: string;
    readonly fingerprint: string;
  };
  readonly excerptBoundaryNote: string;
}

export interface EvidenceRef {
  readonly excerptFingerprint: string;
  readonly quote: string;
}

export interface LearningNode {
  readonly kind: LearningNodeKind;
  readonly title: string;
  readonly summary: string;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly sourceAnswerId: string;
  readonly sourceUrl: string;
  readonly uncertainty: number;
}

export interface QuestionLearningThread {
  readonly threadId: string;
  readonly question: string;
  readonly refinedQuery: string;
  readonly createdAt: number;
  readonly timelineStages: readonly TimelineStage[];
  readonly learningNodes: readonly LearningNode[];
  readonly uncertainty: number;
  readonly fingerprint: string;
}

export interface ThreadArtifactInput {
  readonly threadId: string;
  readonly question: string;
  readonly refinedQuery: string;
  readonly createdAt: number;
  readonly timelineStages: readonly TimelineStageInput[];
  readonly learningNodes: readonly LearningNodeInput[];
  readonly uncertainty: number;
}

export interface TimelineStageInput {
  readonly questionId: string;
  readonly answerId: string;
  readonly title: string;
  readonly authorDisplayName: string;
  readonly editTime: number;
  readonly canonicalUrl: string;
  readonly excerpt: {
    readonly questionId: string;
    readonly answerId: string;
    readonly capturedAt: number;
    readonly sourceContentId: string;
    readonly sourceContentType: string;
    readonly sourceEditTime: number;
    readonly excerpt: string;
    readonly fingerprint: string;
  };
}

export interface LearningNodeInput {
  readonly kind: LearningNodeKind;
  readonly title: string;
  readonly summary: string;
  readonly evidenceRefs: readonly EvidenceRefInput[];
  readonly sourceAnswerId: string;
  readonly sourceUrl: string;
  readonly uncertainty: number;
}

export interface EvidenceRefInput {
  readonly excerptFingerprint: string;
  readonly quote: string;
}

// ── Validation failure reasons ───────────────────────────────────────────────

export type ThreadArtifactFailureReason =
  | "INVALID_THREAD_ID"
  | "EMPTY_QUESTION"
  | "EMPTY_REFINED_QUERY"
  | "INVALID_CREATED_AT"
  | "EMPTY_TIMELINE"
  | "INVALID_TIMELINE_STAGE"
  | "EMPTY_LEARNING_NODES"
  | "INVALID_LEARNING_NODE"
  | "INVALID_UNCERTAINTY"
  | "EMPTY_EXCERPT"
  | "MISMATCHED_FINGERPRINT";

export interface ThreadArtifactSuccess {
  readonly _tag: "success";
  readonly artifact: QuestionLearningThread;
}

export interface ThreadArtifactFailure {
  readonly _tag: "failure";
  readonly reason: ThreadArtifactFailureReason;
}

export type ThreadArtifactResult = ThreadArtifactSuccess | ThreadArtifactFailure;

// ── Ordering constants ────────────────────────────────────────────────────────

export const LEARNING_NODE_ORDER: readonly LearningNodeKind[] = [
  "relationship",
  "cause",
  "consensus",
  "evolution",
  "divergence",
  "changed_premise",
  "unknown",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const isValidThreadId = (value: string): boolean => value !== "" && /^[0-9a-f]{16}$/.test(value);

const normalizeText = (raw: string): string => {
  const nfc = raw.normalize("NFC");
  const lf = nfc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return lf.trim();
};

const isValidLearningNodeKind = (value: unknown): value is LearningNodeKind =>
  typeof value === "string" &&
  (value === "relationship" ||
    value === "cause" ||
    value === "evolution" ||
    value === "consensus" ||
    value === "divergence" ||
    value === "changed_premise" ||
    value === "unknown");

const isValidUncertainty = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

const isValidZhihuUrl = (value: string): boolean =>
  value !== "" && /^https?:\/\/(www\.)?zhihu\.com\/question\/\d+\/answer\/\d+$/.test(value);

// ── Sorting ──────────────────────────────────────────────────────────────────

export const sortLearningNodes = (nodes: readonly LearningNode[]): readonly LearningNode[] => {
  const orderMap = new Map<LearningNodeKind, number>();
  LEARNING_NODE_ORDER.forEach((kind, index) => orderMap.set(kind, index));

  return [...nodes].sort((a, b) => {
    const aOrder = orderMap.get(a.kind) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = orderMap.get(b.kind) ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
};

// ── URL helpers ──────────────────────────────────────────────────────────────

export const extractZhihuQuestionId = (canonicalUrl: string): string | null => {
  const match = canonicalUrl.match(/\/question\/(\d+)\//);
  return match ? match[1] : null;
};

export const extractZhihuAnswerId = (canonicalUrl: string): string | null => {
  const match = canonicalUrl.match(/\/answer\/(\d+)$/);
  return match ? match[1] : null;
};

// ── Fingerprint ──────────────────────────────────────────────────────────────

export const buildThreadFingerprint = (
  question: string,
  refinedQuery: string,
  timelineStageCount: number,
  learningNodeCount: number,
  createdAt: number,
): string => {
  const material = [
    "question:" + question,
    "refinedQuery:" + refinedQuery,
    "timelineStages:" + String(timelineStageCount),
    "learningNodes:" + String(learningNodeCount),
    "createdAt:" + String(createdAt),
  ].join("\n");
  const [high, low] = fnv1a64(material);
  const hex = [high.toString(16).padStart(8, "0"), low.toString(16).padStart(8, "0")].join("");
  return `v1:${hex}`;
};

// ── Factory ──────────────────────────────────────────────────────────────────

const EXCERPT_BOUNDARY_NOTE = "这是摘录，不是完整回答";

const failure = (reason: ThreadArtifactFailureReason): ThreadArtifactFailure => ({
  _tag: "failure",
  reason,
});

export const createQuestionLearningThread = (input: ThreadArtifactInput): ThreadArtifactResult => {
  // 1. threadId

  if (!isValidThreadId(input.threadId)) {
    return failure("INVALID_THREAD_ID");
  }

  // 2. question

  if (typeof input.question !== "string") {
    return failure("EMPTY_QUESTION");
  }
  const question = normalizeText(input.question);
  if (question === "") {
    return failure("EMPTY_QUESTION");
  }

  // 3. refinedQuery

  if (typeof input.refinedQuery !== "string") {
    return failure("EMPTY_REFINED_QUERY");
  }
  const refinedQuery = normalizeText(input.refinedQuery);
  if (refinedQuery === "") {
    return failure("EMPTY_REFINED_QUERY");
  }

  // 4. createdAt

  if (
    typeof input.createdAt !== "number" ||
    !Number.isSafeInteger(input.createdAt) ||
    input.createdAt < 0
  ) {
    return failure("INVALID_CREATED_AT");
  }
  const createdAt = input.createdAt;

  // 5. timelineStages

  if (!Array.isArray(input.timelineStages) || input.timelineStages.length === 0) {
    return failure("EMPTY_TIMELINE");
  }

  const excerptFingerprints = new Map<string, string>();
  const timelineStages: TimelineStage[] = [];

  for (const raw of input.timelineStages) {
    // questionId and answerId are non-empty numeric strings
    if (typeof raw.questionId !== "string" || !/^\d+$/.test(raw.questionId)) {
      return failure("INVALID_TIMELINE_STAGE");
    }
    if (typeof raw.answerId !== "string" || !/^\d+$/.test(raw.answerId)) {
      return failure("INVALID_TIMELINE_STAGE");
    }

    // title and author non-empty
    if (typeof raw.title !== "string" || normalizeText(raw.title) === "") {
      return failure("INVALID_TIMELINE_STAGE");
    }
    if (typeof raw.authorDisplayName !== "string" || normalizeText(raw.authorDisplayName) === "") {
      return failure("INVALID_TIMELINE_STAGE");
    }

    // editTime
    if (
      typeof raw.editTime !== "number" ||
      !Number.isSafeInteger(raw.editTime) ||
      raw.editTime < 0
    ) {
      return failure("INVALID_TIMELINE_STAGE");
    }

    // canonicalUrl
    if (typeof raw.canonicalUrl !== "string" || !isValidZhihuUrl(raw.canonicalUrl)) {
      return failure("INVALID_TIMELINE_STAGE");
    }

    // excerpt
    if (typeof raw.excerpt !== "object" || raw.excerpt === null || Array.isArray(raw.excerpt)) {
      return failure("INVALID_TIMELINE_STAGE");
    }
    if (typeof raw.excerpt.fingerprint !== "string" || raw.excerpt.fingerprint === "") {
      return failure("EMPTY_EXCERPT");
    }
    if (typeof raw.excerpt.excerpt !== "string" || normalizeText(raw.excerpt.excerpt) === "") {
      return failure("EMPTY_EXCERPT");
    }

    // Validate excerpt sourceContentType is "Answer"
    if (raw.excerpt.sourceContentType !== "Answer") {
      return failure("INVALID_TIMELINE_STAGE");
    }

    excerptFingerprints.set(raw.excerpt.fingerprint, raw.excerpt.fingerprint);

    timelineStages.push({
      questionId: raw.questionId,
      answerId: raw.answerId,
      title: normalizeText(raw.title),
      authorDisplayName: normalizeText(raw.authorDisplayName),
      editTime: raw.editTime,
      canonicalUrl: raw.canonicalUrl,
      excerpt: Object.freeze({
        questionId: raw.excerpt.questionId,
        answerId: raw.excerpt.answerId,
        capturedAt: raw.excerpt.capturedAt,
        sourceContentId: raw.excerpt.sourceContentId,
        sourceContentType: "Answer",
        sourceEditTime: raw.excerpt.sourceEditTime,
        excerpt: normalizeText(raw.excerpt.excerpt),
        fingerprint: raw.excerpt.fingerprint,
      }),
      excerptBoundaryNote: EXCERPT_BOUNDARY_NOTE,
    });
  }

  // 6. learningNodes

  if (!Array.isArray(input.learningNodes) || input.learningNodes.length === 0) {
    return failure("EMPTY_LEARNING_NODES");
  }

  const learningNodes: LearningNode[] = [];

  for (const raw of input.learningNodes) {
    // kind
    if (!isValidLearningNodeKind(raw.kind)) {
      return failure("INVALID_LEARNING_NODE");
    }

    // title
    if (typeof raw.title !== "string" || normalizeText(raw.title) === "") {
      return failure("INVALID_LEARNING_NODE");
    }

    // summary
    if (typeof raw.summary !== "string" || normalizeText(raw.summary) === "") {
      return failure("INVALID_LEARNING_NODE");
    }

    // evidenceRefs
    if (!Array.isArray(raw.evidenceRefs) || raw.evidenceRefs.length === 0) {
      return failure("INVALID_LEARNING_NODE");
    }

    const evidenceRefs: EvidenceRef[] = [];
    for (const ref of raw.evidenceRefs) {
      if (
        typeof ref.excerptFingerprint !== "string" ||
        ref.excerptFingerprint === "" ||
        typeof ref.quote !== "string" ||
        normalizeText(ref.quote) === ""
      ) {
        return failure("INVALID_LEARNING_NODE");
      }
      evidenceRefs.push({
        excerptFingerprint: ref.excerptFingerprint,
        quote: normalizeText(ref.quote),
      });
    }

    // sourceUrl
    if (typeof raw.sourceUrl !== "string" || !isValidZhihuUrl(raw.sourceUrl)) {
      return failure("INVALID_LEARNING_NODE");
    }

    // uncertainty
    if (!isValidUncertainty(raw.uncertainty)) {
      return failure("INVALID_LEARNING_NODE");
    }

    learningNodes.push({
      kind: raw.kind,
      title: normalizeText(raw.title),
      summary: normalizeText(raw.summary),
      evidenceRefs,
      sourceAnswerId: raw.sourceAnswerId,
      sourceUrl: raw.sourceUrl,
      uncertainty: raw.uncertainty,
    });
  }

  // 7. overall uncertainty

  if (!isValidUncertainty(input.uncertainty)) {
    return failure("INVALID_UNCERTAINTY");
  }

  // 8. fingerprint

  const fingerprint = buildThreadFingerprint(
    question,
    refinedQuery,
    timelineStages.length,
    learningNodes.length,
    createdAt,
  );

  // ── assemble ────────────────────────────────────────────────────────────────

  const artifact: QuestionLearningThread = Object.freeze({
    threadId: input.threadId,
    question,
    refinedQuery,
    createdAt,
    timelineStages,
    learningNodes,
    uncertainty: input.uncertainty,
    fingerprint,
  });

  return { _tag: "success", artifact };
};
