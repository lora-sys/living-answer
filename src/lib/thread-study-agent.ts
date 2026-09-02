import { Data, Effect } from "effect";

import type { QuestionLearningThread } from "./thread-artifact";

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

export class ThreadAgentError extends Data.TaggedError("ThreadAgentError")<{
  readonly reason: "INVALID_INPUT" | "MALFORMED_RESPONSE" | "TRANSPORT_FAILED";
}> {}

// ── Types ───────────────────────────────────────────────────────────────────

export type ThreadAgentStatus = "grounded" | "evidence_gap";

export type ThreadAgentActionType =
  | "focus_source"
  | "copy_search"
  | "next_question"
  | "boundary_check";

export interface ThreadAgentAction {
  readonly type: ThreadAgentActionType;
  readonly label: string;
  readonly detail?: string;
  readonly answerId?: string;
  readonly query?: string;
}

export interface ThreadAgentEvidence {
  readonly answerId: string;
  readonly excerptFingerprint: string;
  readonly quote: string;
  readonly sourceUrl: string;
}

export interface ThreadAgentResult {
  readonly status: ThreadAgentStatus;
  readonly answer: string;
  readonly evidenceRefs: readonly ThreadAgentEvidence[];
  readonly nextActions: readonly ThreadAgentAction[];
  readonly uncertainty: number;
}

export interface ThreadAgentConversationTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface ThreadAgentInput {
  readonly question: string;
  readonly conversation?: readonly ThreadAgentConversationTurn[];
}

export interface ThreadAgentDeps {
  readonly model: string;
  readonly chat: {
    readonly complete: (request: {
      readonly model: string;
      readonly messages: ReadonlyArray<{ readonly role: string; readonly content: string }>;
    }) => Effect.Effect<string, unknown>;
  };
}

// ── Constants ───────────────────────────────────────────────────────────────

const MAX_QUESTION_LENGTH = 500;
const MAX_CONVERSATION_TURNS = 6;
const MAX_ANSWER_LENGTH = 2000;

// ── Context validation ──────────────────────────────────────────────────────

const validateInput = (
  input: ThreadAgentInput,
): { readonly question: string; readonly conversation: readonly ThreadAgentConversationTurn[] } | null => {
  if (typeof input?.question !== "string") return null;
  const question = input.question.trim();
  if (question === "" || question.length > MAX_QUESTION_LENGTH) return null;

  if (input.conversation === undefined) return { question, conversation: [] };
  if (!Array.isArray(input.conversation) || input.conversation.length > MAX_CONVERSATION_TURNS) {
    return null;
  }

  for (const turn of input.conversation) {
    if (
      typeof turn !== "object" ||
      turn === null ||
      (turn.role !== "user" && turn.role !== "assistant") ||
      typeof turn.content !== "string" ||
      turn.content.trim() === "" ||
      turn.content.length > MAX_ANSWER_LENGTH
    ) {
      return null;
    }
  }

  return { question, conversation: input.conversation };
};

// ── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are a study agent for one saved learning thread. Answer only from that thread's selected excerpts, nodes, and guide. " +
  'Return raw JSON: {"status":"grounded|evidence_gap","answer":"...","evidenceRefs":[{"answerId":"...","excerptFingerprint":"...","quote":"..."}],"nextActions":[{"type":"focus_source|copy_search|next_question|boundary_check","label":"...","detail":"...","answerId":"...","query":"..."}],"uncertainty":0.0-1.0}. ' +
  "If the thread does not contain enough evidence, use evidence_gap, leave evidenceRefs empty, and propose a next action. " +
  "Every grounded answer must cite at least one exact quote from the provided excerpts. Never invent Zhihu content. " +
  "Never say the author was wrong; say the premise or context has changed. Next action labels must be short Chinese UI text.";

const buildUserPrompt = (
  question: string,
  conversation: readonly ThreadAgentConversationTurn[],
  artifact: QuestionLearningThread,
): string => {
  const excerptContext = artifact.timelineStages
    .map(
      (stage) =>
        `[${stage.answerId}] ${stage.authorDisplayName} (${stage.excerpt.fingerprint}): ${stage.excerpt.excerpt}`,
    )
    .join("\n\n");

  const nodeContext = artifact.learningNodes
    .map(
      (node) =>
        `${node.kind}: ${node.title} — ${node.summary} [${node.sourceAnswerId}] ${node.evidenceRefs
          .map((ref) => `"${ref.quote}" (${ref.excerptFingerprint})`)
          .join(" ")}`,
    )
    .join("\n");

  const conversationContext =
    conversation.length === 0
      ? "(This is the first question.)"
      : conversation
          .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`)
          .join("\n");

  return [
    `Thread question: ${artifact.question}`,
    `Learning intent: ${artifact.refinedQuery}`,
    "",
    "Selected excerpts:",
    excerptContext,
    "",
    "AI learning nodes:",
    nodeContext,
    "",
    "Conversation so far:",
    conversationContext,
    "",
    `Current question: ${question}`,
  ].join("\n");
};

// ── Fallback ────────────────────────────────────────────────────────────────

const makeFallbackResult = (question: string): ThreadAgentResult => ({
  status: "evidence_gap",
  answer: "当前线程内的摘录不足以回答这个问题。可以先检查来源摘录，或换一个更贴近线程主题的问法。",
  evidenceRefs: [],
  nextActions: [
    {
      type: "boundary_check",
      label: "检查证据边界",
      detail: "当前线程只能回答摘录覆盖到的问题。",
    },
    {
      type: "copy_search",
      label: "复制新搜索词",
      detail: question,
      query: question,
    },
  ],
  uncertainty: 1,
});

// ── Model output validation ─────────────────────────────────────────────────

const validateAction = (
  raw: unknown,
  answerIdMap: Map<string, string>,
): ThreadAgentAction | null => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const type = value.type;
  const label = typeof value.label === "string" ? value.label.trim() : "";
  if (typeof type !== "string" || label === "" || label.length > 40) return null;
  if (hasBannedWording(label)) return null;

  const detail = typeof value.detail === "string" && value.detail.trim() !== ""
    ? value.detail.trim()
    : undefined;
  if (detail !== undefined && detail.length > 500) return null;

  if (type === "focus_source") {
    const answerId = typeof value.answerId === "string" ? value.answerId.trim() : "";
    if (!answerIdMap.has(answerId)) return null;
    return { type, label, detail, answerId };
  }

  if (type === "copy_search" || type === "next_question") {
    const query = typeof value.query === "string" ? value.query.trim() : "";
    if (query === "" || query.length > 200) return null;
    return {
      type: type as ThreadAgentActionType,
      label,
      detail,
      query,
    };
  }

  if (type === "boundary_check") {
    return { type, label, detail };
  }

  return null;
};

const parseAgentResult = (
  raw: string,
  artifact: QuestionLearningThread,
): ThreadAgentResult | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  const value = parsed as Record<string, unknown>;
  const answer = typeof value.answer === "string" ? value.answer.trim() : "";
  if (
    answer === "" ||
    answer.length > MAX_ANSWER_LENGTH ||
    hasBannedWording(answer) ||
    (value.status !== "grounded" && value.status !== "evidence_gap")
  ) {
    return null;
  }

  const answerIdMap = new Map(
    artifact.timelineStages.map((stage) => [stage.answerId, stage.canonicalUrl]),
  );
  const evidenceMap = new Map(
    artifact.timelineStages.map((stage) => [stage.excerpt.fingerprint, stage.excerpt.excerpt]),
  );

  const evidenceRefs: ThreadAgentEvidence[] = [];
  const evidenceRaw = value.evidenceRefs;
  if (!Array.isArray(evidenceRaw)) return null;

  for (const item of evidenceRaw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
    const ref = item as Record<string, unknown>;
    const excerptFingerprint =
      typeof ref.excerptFingerprint === "string" ? ref.excerptFingerprint.trim() : "";
    const quote = typeof ref.quote === "string" ? ref.quote.trim() : "";
    const excerpt = evidenceMap.get(excerptFingerprint);
    if (!excerpt || quote === "" || !excerpt.includes(quote)) return null;
    const answerId =
      typeof ref.answerId === "string" && answerIdMap.has(ref.answerId)
        ? ref.answerId
        : artifact.timelineStages.find(
            (stage) => stage.excerpt.fingerprint === excerptFingerprint,
          )?.answerId;
    if (!answerId) return null;
    evidenceRefs.push({
      answerId,
      excerptFingerprint,
      quote,
      sourceUrl: answerIdMap.get(answerId) ?? "",
    });
  }

  if (value.status === "grounded" && evidenceRefs.length === 0) return null;

  if (!Array.isArray(value.nextActions)) return null;
  const nextActions: ThreadAgentAction[] = [];
  for (const action of value.nextActions.slice(0, 4)) {
    const parsedAction = validateAction(action, answerIdMap);
    if (parsedAction !== null) {
      nextActions.push(parsedAction);
    }
  }

  const uncertainty = value.uncertainty;
  if (
    typeof uncertainty !== "number" ||
    !Number.isFinite(uncertainty) ||
    uncertainty < 0 ||
    uncertainty > 1
  ) {
    return null;
  }

  return {
    status: value.status,
    answer,
    evidenceRefs,
    nextActions: nextActions.length > 0 ? nextActions : makeFallbackResult("").nextActions,
    uncertainty,
  };
};

// ── Workflow ────────────────────────────────────────────────────────────────

export const askThreadAgent =
  (deps: ThreadAgentDeps) =>
  (
    artifact: QuestionLearningThread,
    input: ThreadAgentInput,
  ): Effect.Effect<ThreadAgentResult, ThreadAgentError> =>
    Effect.gen(function* () {
      const validatedInput = validateInput(input);
      if (!validatedInput) {
        return yield* Effect.fail(new ThreadAgentError({ reason: "INVALID_INPUT" }));
      }

      const raw = yield* deps.chat
        .complete({
          model: deps.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: buildUserPrompt(
                validatedInput.question,
                validatedInput.conversation,
                artifact,
              ),
            },
          ],
        })
        .pipe(Effect.mapError(() => new ThreadAgentError({ reason: "TRANSPORT_FAILED" })));

      const parsed = parseAgentResult(raw, artifact);
      if (parsed) return parsed;

      return makeFallbackResult(validatedInput.question);
    });
