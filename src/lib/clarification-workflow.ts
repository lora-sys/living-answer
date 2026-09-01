import { Data, Effect } from "effect";

import type { OpenAiChatCompletions } from "./openai-adapter";
import type { PatchFeedbackReason } from "./patch-feedback";

export class ClarificationWorkflowError extends Data.TaggedError("ClarificationWorkflowError")<{
  readonly reason:
    | "INVALID_JSON"
    | "INVALID_REASON"
    | "MISSING_TEXT"
    | "OVERLONG_TEXT"
    | "MISMATCHED_EVIDENCE"
    | "TRANSPORT_FAILED";
}> {}

export interface ClarificationTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface FeedbackDraft {
  readonly reason: PatchFeedbackReason;
  readonly question: string;
  readonly evidenceUrl?: string;
  readonly evidenceQuote?: string;
}

export interface ClarificationSuccess {
  readonly _tag: "success";
  readonly assistantMessage: string;
  readonly draft: FeedbackDraft;
  readonly needsEvidence: boolean;
  readonly isReady: boolean;
}

export interface ClarificationInput {
  readonly questionId: string;
  readonly answerId: string;
  readonly excerptFingerprint: string;
  readonly recordFingerprint?: string;
  readonly excerptText: string;
  readonly currentReason?: PatchFeedbackReason;
  readonly conversation: readonly ClarificationTurn[];
}

export interface ClarificationWorkflowDeps {
  readonly model: string;
  readonly chat: OpenAiChatCompletions;
}

const MAX_CONVERSATION_TURNS = 10;
const MAX_MESSAGE_LENGTH = 300;
const MAX_QUESTION_LENGTH = 800;
const MAX_EVIDENCE_URL_LENGTH = 2048;
const MAX_EVIDENCE_QUOTE_LENGTH = 1000;
const MAX_EXCERPT_LENGTH = 4000;

const ALLOWED_REASONS: readonly PatchFeedbackReason[] = [
  "QUESTION",
  "EVIDENCE_UNSUPPORTED",
  "WRONG_CONDITION",
  "NOT_IMPORTANT",
  "SOURCE_UPDATED",
  "OTHER",
];

const SYSTEM_PROMPT = `You clarify user feedback about a maintenance note. Ask one focused question at a time. Never judge truth, search the web, invent facts, or rewrite conclusions. If a source is mentioned, ask for both its URL and a copied quote. Reply with only a raw JSON object:
{"assistantMessage":"...","draft":{"reason":"QUESTION|EVIDENCE_UNSUPPORTED|WRONG_CONDITION|NOT_IMPORTANT|SOURCE_UPDATED|OTHER","question":"...","evidenceUrl":"optional","evidenceQuote":"optional"},"needsEvidence":true,"isReady":false}
If evidenceUrl exists, evidenceQuote must exist. If neither is known, omit both.`;

const hasControlCharacter = (text: string): boolean => {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) < 0x20) return true;
  }
  return false;
};

const requiredText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized === "" || normalized.length > maxLength || hasControlCharacter(normalized)) {
    return null;
  }
  return normalized;
};

const normalizeUrl = (value: unknown): string | undefined | null => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw === "") return undefined;
  if (raw.length > MAX_EVIDENCE_URL_LENGTH || !/^https?:\/\/[^/\s]/i.test(raw)) return null;
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
};

const validateInput = (input: ClarificationInput): ClarificationWorkflowError | null => {
  if (
    requiredText(input.questionId, 64) === null ||
    requiredText(input.answerId, 64) === null ||
    !/^v1:[0-9a-f]{16}$/.test(input.excerptFingerprint) ||
    requiredText(input.excerptText, MAX_EXCERPT_LENGTH) === null
  ) {
    return new ClarificationWorkflowError({ reason: "INVALID_JSON" });
  }
  if (input.recordFingerprint !== undefined && !/^v1:[0-9a-f]{16}$/.test(input.recordFingerprint)) {
    return new ClarificationWorkflowError({ reason: "INVALID_JSON" });
  }
  if (input.currentReason !== undefined && !ALLOWED_REASONS.includes(input.currentReason)) {
    return new ClarificationWorkflowError({ reason: "INVALID_REASON" });
  }
  if (input.conversation.length > MAX_CONVERSATION_TURNS) {
    return new ClarificationWorkflowError({ reason: "OVERLONG_TEXT" });
  }
  for (const turn of input.conversation) {
    if (turn.role !== "user" && turn.role !== "assistant") {
      return new ClarificationWorkflowError({ reason: "INVALID_JSON" });
    }
    if (requiredText(turn.content, MAX_MESSAGE_LENGTH) === null) {
      return new ClarificationWorkflowError({ reason: "OVERLONG_TEXT" });
    }
  }
  return null;
};

type ParsedClarification =
  | { readonly _tag: "success"; readonly value: ClarificationSuccess }
  | { readonly _tag: "failure"; readonly error: ClarificationWorkflowError };

const parseFailure = (reason: ClarificationWorkflowError["reason"]): ParsedClarification => ({
  _tag: "failure",
  error: new ClarificationWorkflowError({ reason }),
});

const parseResponse = (content: string): ParsedClarification => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.trim());
  } catch {
    return parseFailure("INVALID_JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return parseFailure("INVALID_JSON");
  }
  const response = parsed as Record<string, unknown>;
  const message = requiredText(response.assistantMessage, MAX_MESSAGE_LENGTH);
  if (message === null) return parseFailure("MISSING_TEXT");
  if (typeof response.needsEvidence !== "boolean" || typeof response.isReady !== "boolean") {
    return parseFailure("INVALID_JSON");
  }

  const rawDraft = response.draft;
  if (typeof rawDraft !== "object" || rawDraft === null || Array.isArray(rawDraft)) {
    return parseFailure("INVALID_JSON");
  }
  const draft = rawDraft as Record<string, unknown>;
  const reason = draft.reason;
  if (typeof reason !== "string" || !ALLOWED_REASONS.includes(reason as PatchFeedbackReason)) {
    return parseFailure("INVALID_REASON");
  }
  const question = requiredText(draft.question, MAX_QUESTION_LENGTH);
  if (question === null) return parseFailure("MISSING_TEXT");

  const evidenceUrl = normalizeUrl(draft.evidenceUrl);
  if (evidenceUrl === null) return parseFailure("INVALID_JSON");
  const evidenceQuote = requiredText(draft.evidenceQuote, MAX_EVIDENCE_QUOTE_LENGTH) ?? undefined;
  if ((evidenceUrl === undefined) !== (evidenceQuote === undefined)) {
    return parseFailure("MISMATCHED_EVIDENCE");
  }

  return {
    _tag: "success",
    value: {
      _tag: "success",
      assistantMessage: message,
      draft: Object.freeze({
        reason: reason as PatchFeedbackReason,
        question,
        ...(evidenceUrl === undefined ? {} : { evidenceUrl }),
        ...(evidenceQuote === undefined ? {} : { evidenceQuote }),
      }),
      needsEvidence: response.needsEvidence,
      isReady: response.isReady,
    },
  };
};

export const clarifyFeedback =
  (deps: ClarificationWorkflowDeps) =>
  (input: ClarificationInput): Effect.Effect<ClarificationSuccess, ClarificationWorkflowError> =>
    Effect.gen(function* () {
      const validationError = validateInput(input);
      if (validationError !== null) return yield* Effect.fail(validationError);

      const prompt = {
        task: "clarify-feedback",
        version: "1",
        excerptText: input.excerptText,
        ...(input.currentReason === undefined ? {} : { currentReason: input.currentReason }),
        conversation: input.conversation.map((turn) => ({
          role: turn.role,
          content: turn.content.trim(),
        })),
      };

      const raw = yield* deps.chat
        .complete({
          model: deps.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(prompt) },
          ],
        })
        .pipe(
          Effect.mapError(() => new ClarificationWorkflowError({ reason: "TRANSPORT_FAILED" })),
        );

      const parsed = parseResponse(raw);
      if (parsed._tag === "failure") return yield* Effect.fail(parsed.error);
      return parsed.value;
    });
