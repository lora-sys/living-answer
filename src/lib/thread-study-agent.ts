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
  | "boundary_check"
  | "search_supplement";

export interface ThreadAgentAction {
  readonly type: ThreadAgentActionType;
  readonly label: string;
  readonly detail?: string;
  readonly answerId?: string;
  readonly query?: string;
  readonly question?: string;
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
): {
  readonly question: string;
  readonly conversation: readonly ThreadAgentConversationTurn[];
} | null => {
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
  'Return raw JSON: {"status":"grounded|evidence_gap","answer":"...","evidenceRefs":[{"answerId":"...","excerptFingerprint":"...","quote":"..."}],"nextActions":[{"type":"focus_source|search_supplement|next_question|boundary_check","label":"...","detail":"...","answerId":"...","query":"..."}],"uncertainty":0.0-1.0}. ' +
  "If the thread does not contain enough evidence, use evidence_gap, leave evidenceRefs empty, and propose a search_supplement action with a better Chinese search query about the thread's knowledge topic. The query must be suitable for a search box; never return a UI instruction. " +
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

const makeFallbackResult = (artifact: QuestionLearningThread): ThreadAgentResult => ({
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
      type: "search_supplement",
      label: "搜索补充来源",
      detail: artifact.refinedQuery,
      query: artifact.refinedQuery,
    },
  ],
  uncertainty: 1,
});

const hasAnyTerm = (value: string, terms: readonly string[]): boolean =>
  terms.some((term) => value.includes(term));

const offlineEvidenceRefs = (
  artifact: QuestionLearningThread,
  nodes: QuestionLearningThread["learningNodes"],
) =>
  nodes
    .flatMap((node) => node.evidenceRefs.slice(0, 2))
    .slice(0, 4)
    .flatMap((ref) => {
      const stage = artifact.timelineStages.find(
        (item) => item.excerpt.fingerprint === ref.excerptFingerprint,
      );
      if (!stage) return [];
      return [
        {
          answerId: stage.answerId,
          excerptFingerprint: ref.excerptFingerprint,
          quote: ref.quote,
          sourceUrl: stage.canonicalUrl,
        },
      ];
    })
    .slice(0, 4);

export const answerThreadAgentOffline = (
  artifact: QuestionLearningThread,
  question: string,
): ThreadAgentResult => {
  const normalized = question.toLowerCase();
  const asksTimeline = hasAnyTerm(normalized, ["时间线", "脉络", "核心", "总结", "概览"]);
  const asksDivergence = hasAnyTerm(normalized, ["分歧", "冲突", "争议", "不同", "修正"]);
  const asksNext = hasAnyTerm(normalized, ["下一步", "追问", "继续", "练习", "行动"]);
  const asksBoundary = hasAnyTerm(normalized, ["能回答", "不能回答", "边界", "证据"]);

  if (asksTimeline || asksDivergence || asksBoundary || asksNext) {
    const selectedNodes = artifact.learningNodes.filter((node) => {
      if (asksDivergence) return node.kind === "divergence" || node.kind === "changed_premise";
      return true;
    });
    const nodes = (selectedNodes.length > 0 ? selectedNodes : artifact.learningNodes).slice(0, 4);
    const evidenceRefs = offlineEvidenceRefs(artifact, nodes);
    const topic = asksDivergence
      ? "关键分歧和前提变化"
      : asksNext
        ? "下一步学习动作"
        : asksBoundary
          ? "证据边界"
          : "核心学习脉络";
    const bullets = nodes.map((node) => `- ${node.title}：${node.summary}`);
    const extra =
      asksNext || asksBoundary
        ? artifact.learningGuide.openQuestions
            .slice(0, 2)
            .map((item) => `- ${item}`)
            .join("\n")
        : "";
    const uncertainty =
      artifact.learningNodes.reduce((sum, node) => sum + node.uncertainty, 0) /
      Math.max(1, artifact.learningNodes.length);

    return {
      status: evidenceRefs.length > 0 ? "grounded" : "evidence_gap",
      answer: [
        `根据当前线程保存的${topic}证据：`,
        ...bullets,
        extra,
        "这些回答只能覆盖摘录内容，不能替代完整知乎回答。",
      ]
        .filter(Boolean)
        .join("\n"),
      evidenceRefs,
      nextActions:
        asksNext || asksBoundary
          ? [
              {
                type: "boundary_check",
                label: "检查证据边界",
                detail: "当前模型不可用；这是基于已保存节点和开放问题的确定性摘要。",
              },
              ...artifact.learningGuide.openQuestions.slice(0, 2).map((item) => ({
                type: "next_question" as const,
                label: item.length > 22 ? `${item.slice(0, 22)}…` : item,
                query: item,
              })),
            ]
          : nodes.slice(0, 2).map((node) => ({
              type: "focus_source" as const,
              label: `查看来源 ${node.sourceAnswerId.slice(-6)}`,
              answerId: node.sourceAnswerId,
            })),
      uncertainty,
    };
  }

  return makeFallbackResult(artifact);
};

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

  const detail =
    typeof value.detail === "string" && value.detail.trim() !== ""
      ? value.detail.trim()
      : undefined;
  if (detail !== undefined && detail.length > 500) return null;

  if (type === "focus_source") {
    const answerId = typeof value.answerId === "string" ? value.answerId.trim() : "";
    if (!answerIdMap.has(answerId)) return null;
    return { type, label, detail, answerId };
  }

  if (type === "copy_search" || type === "next_question" || type === "search_supplement") {
    const query = typeof value.query === "string" ? value.query.trim() : "";
    if (query === "" || query.length > 200) return null;
    const question =
      typeof value.question === "string" && value.question.trim() !== ""
        ? value.question.trim()
        : undefined;
    return {
      type: type as ThreadAgentActionType,
      label,
      detail,
      query,
      question,
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
        : artifact.timelineStages.find((stage) => stage.excerpt.fingerprint === excerptFingerprint)
            ?.answerId;
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
    nextActions: nextActions.length > 0 ? nextActions : makeFallbackResult(artifact).nextActions,
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
      if (parsed && !(parsed.status === "evidence_gap" && parsed.evidenceRefs.length === 0)) {
        return parsed;
      }

      const offlineResult = answerThreadAgentOffline(artifact, validatedInput.question);
      if (offlineResult.status === "grounded") return offlineResult;
      if (parsed) return parsed;

      return makeFallbackResult(artifact);
    });
