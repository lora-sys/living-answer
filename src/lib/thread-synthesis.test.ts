import { Effect } from "effect";

import { describe, expect, it } from "vite-plus/test";

import type { TimelineStage } from "./thread-artifact";

import {
  synthesizeThread,
  ThreadSynthesisError,
  type ThreadSynthesisDeps,
  type SynthesisInput,
  type ThreadSynthesisResult,
  type SynthesizedNode,
} from "./thread-synthesis";

// ── Helpers ──────────────────────────────────────────────────────────────

const makeStage = (overrides: Partial<TimelineStage> = {}): TimelineStage => ({
  questionId: "42",
  answerId: "100",
  title: "Stage title",
  authorDisplayName: "Author",
  editTime: 1_700_000_000_000,
  canonicalUrl: "https://www.zhihu.com/question/42/answer/100",
  excerpt: {
    questionId: "42",
    answerId: "100",
    capturedAt: 1_700_000_000_000,
    sourceContentId: "src-1",
    sourceContentType: "Answer",
    sourceEditTime: 1_700_000_000_000,
    excerpt: "This is the exact excerpt text that must appear in the quote.",
    fingerprint: "v1:5555555555555555",
  },
  excerptBoundaryNote: "这是摘录，不是完整回答",
  ...overrides,
});

const BASE_STAGES = [makeStage()];

const makeInput = (overrides: Partial<SynthesisInput> = {}): SynthesisInput => ({
  question: "How do modern web frameworks handle state?",
  refinedQuery: "zhihu web framework state management",
  learningIntent: "Understand the evolution of state management patterns",
  timelineStages: BASE_STAGES,
  maxNodes: 7,
  ...overrides,
});

const validNodePayload: SynthesizedNode = {
  kind: "relationship",
  title: "A valid learning node title",
  summary: "This is a valid summary of a learning relationship.",
  evidenceRefs: [
    {
      excerptFingerprint: "v1:5555555555555555",
      quote: "This is the exact excerpt text that must appear in the quote.",
    },
  ],
  sourceAnswerId: "100",
  sourceUrl: "https://www.zhihu.com/question/42/answer/100",
  uncertainty: 0.5,
};

const buildValidResponse = (nodes?: SynthesizedNode[]): string =>
  JSON.stringify({
    nodes: nodes ?? [validNodePayload],
  });

const baseDeps = (chat: ThreadSynthesisDeps["chat"]): ThreadSynthesisDeps => ({
  model: "zhida-thinking-1p5",
  chat,
});

const makeSucceedChat = (response: string): ThreadSynthesisDeps["chat"] => ({
  complete: () => Effect.succeed(response),
});

const makeFailingChat = (_err: ThreadSynthesisError): ThreadSynthesisDeps["chat"] => ({
  complete: () => Effect.fail(_err) as unknown as Effect.Effect<string, never>,
});

const runWorkflow = async (
  deps: ThreadSynthesisDeps,
  input: SynthesisInput,
): Promise<
  | { _tag: "success"; result: ThreadSynthesisResult }
  | { _tag: "error"; error: ThreadSynthesisError }
> => {
  const exit = await Effect.runPromiseExit(synthesizeThread(deps)(input));
  if (exit._tag === "Success") {
    return { _tag: "success", result: exit.value };
  }
  const error =
    exit.cause._tag === "Fail"
      ? exit.cause.error
      : new ThreadSynthesisError({ reason: "MALFORMED_RESPONSE" });
  return { _tag: "error", error };
};

// ── synthesizeThread workflow ────────────────────────────────────────────

describe("thread-synthesis synthesizeThread", () => {
  it("returns valid nodes when the model returns well-formed JSON", async () => {
    const chat = makeSucceedChat(buildValidResponse([{ ...validNodePayload, kind: "evolution" }]));

    const outcome = await runWorkflow(baseDeps(chat), makeInput());
    expect(outcome._tag).toBe("success");
    if (outcome._tag === "success") {
      const { result } = outcome;
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].kind).toBe("evolution");
      expect(result.nodes[0].title).toBe(validNodePayload.title);
      expect(result.nodes[0].sourceAnswerId).toBe("100");
      expect(result.nodes[0].uncertainty).toBe(0.5);
    }
  });

  it("accepts the 'unknown' kind from the model output", async () => {
    const response = JSON.stringify({
      nodes: [
        {
          kind: "unknown",
          title: "Unclear premise",
          summary: "The relationship is not certain.",
          evidenceRefs: [
            {
              excerptFingerprint: "v1:5555555555555555",
              quote: "This is the exact excerpt text that must appear in the quote.",
            },
          ],
          sourceAnswerId: "100",
          sourceUrl: "https://www.zhihu.com/question/42/answer/100",
          uncertainty: 0.9,
        },
      ],
    });
    const chat = makeSucceedChat(response);
    const outcome = await runWorkflow(baseDeps(chat), makeInput());
    expect(outcome._tag).toBe("success");
    if (outcome._tag === "success") {
      expect(outcome.result.nodes[0].kind).toBe("unknown");
    }
  });

  it("returns MALFORMED_RESPONSE error for non-JSON model output", async () => {
    const chat = makeSucceedChat("not valid json at all");
    const outcome = await runWorkflow(baseDeps(chat), makeInput());
    expect(outcome._tag).toBe("error");
    if (outcome._tag === "error") {
      expect(outcome.error.reason).toBe("MALFORMED_RESPONSE");
    }
  });

  it("returns MALFORMED_RESPONSE error for a JSON array response", async () => {
    const chat = makeSucceedChat(JSON.stringify([1, 2, 3]));
    const outcome = await runWorkflow(baseDeps(chat), makeInput());
    expect(outcome._tag).toBe("error");
    if (outcome._tag === "error") {
      expect(outcome.error.reason).toBe("MALFORMED_RESPONSE");
    }
  });

  it("returns MALFORMED_RESPONSE error for JSON root that is not an object", async () => {
    const chat = makeSucceedChat(JSON.stringify({ notNodes: true }));
    const outcome = await runWorkflow(baseDeps(chat), makeInput());
    expect(outcome._tag).toBe("error");
    if (outcome._tag === "error") {
      expect(outcome.error.reason).toBe("MALFORMED_RESPONSE");
    }
  });

  it("returns MALFORMED_RESPONSE error for an empty nodes array", async () => {
    const chat = makeSucceedChat(JSON.stringify({ nodes: [] }));
    const outcome = await runWorkflow(baseDeps(chat), makeInput());
    expect(outcome._tag).toBe("error");
    if (outcome._tag === "error") {
      expect(outcome.error.reason).toBe("MALFORMED_RESPONSE");
    }
  });

  it("returns TRANSPORT_FAILED when the chat service throws", async () => {
    const chat = makeFailingChat(new ThreadSynthesisError({ reason: "TRANSPORT_FAILED" }));
    const outcome = await runWorkflow(baseDeps(chat), makeInput());
    expect(outcome._tag).toBe("error");
    if (outcome._tag === "error") {
      expect(outcome.error.reason).toBe("TRANSPORT_FAILED");
    }
  });

  it("returns fallback nodes when all model nodes have banned wording in summary", async () => {
    const response = JSON.stringify({
      nodes: [
        {
          kind: "relationship",
          title: "Valid Title",
          summary: "The original author was wrong about this premise.",
        },
      ],
    });
    const chat = makeSucceedChat(response);
    const outcome = await runWorkflow(baseDeps(chat), makeInput());
    if (outcome._tag === "success") {
      const { result } = outcome;
      expect(result.nodes.every((n: SynthesizedNode) => n.kind === "unknown")).toBe(true);
    }
  });

  it("returns fallback nodes when all model nodes have banned Chinese wording in title", async () => {
    const response = JSON.stringify({
      nodes: [
        {
          kind: "relationship",
          title: "作者写了错误观点",
          summary: "A valid summary.",
        },
      ],
    });
    const chat = makeSucceedChat(response);
    const outcome = await runWorkflow(baseDeps(chat), makeInput());
    if (outcome._tag === "success") {
      const { result } = outcome;
      expect(result.nodes.every((n: SynthesizedNode) => n.kind === "unknown")).toBe(true);
    }
  });

  it("returns fallback nodes when all model nodes have unknown answer IDs", async () => {
    const response = JSON.stringify({
      nodes: [
        {
          kind: "relationship",
          title: "Valid",
          summary: "A valid summary.",
          evidenceRefs: [
            {
              excerptFingerprint: "v1:5555555555555555",
              quote: "This is the exact excerpt text that must appear in the quote.",
            },
          ],
          sourceAnswerId: "unknown-id",
          sourceUrl: "https://www.zhihu.com/question/42/answer/unknown",
          uncertainty: 0.5,
        },
      ],
    });
    const chat = makeSucceedChat(response);
    const outcome = await runWorkflow(baseDeps(chat), makeInput());
    if (outcome._tag === "success") {
      const { result } = outcome;
      expect(result.nodes.every((n: SynthesizedNode) => n.kind === "unknown")).toBe(true);
    }
  });

  it("filters invalid nodes but keeps valid ones in the same response", async () => {
    const response = JSON.stringify({
      nodes: [
        { kind: "totally_invalid" as string, title: "Bad", summary: "Bad." },
        validNodePayload,
      ],
    });
    const chat = makeSucceedChat(response);
    const outcome = await runWorkflow(baseDeps(chat), makeInput());
    if (outcome._tag === "success") {
      const { result } = outcome;
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].kind).toBe("relationship");
    }
  });

  it("builds the user prompt with question, refined query, and learning intent", async () => {
    let capturedRequest: {
      model: string;
      messages: { role: string; content: string }[];
    } | null = null;

    const chat: ThreadSynthesisDeps["chat"] = {
      complete: (request) => {
        capturedRequest = {
          model: request.model,
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        };
        return Effect.succeed(buildValidResponse());
      },
    };

    await runWorkflow(baseDeps(chat), makeInput());

    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.model).toBe("zhida-thinking-1p5");
    expect(capturedRequest!.messages[0].role).toBe("system");
    const userPrompt = capturedRequest!.messages[1].content;
    expect(userPrompt).toContain("How do modern web frameworks handle state?");
    expect(userPrompt).toContain("zhihu web framework state management");
    expect(userPrompt).toContain("Understand the evolution of state management patterns");
    expect(userPrompt).toContain("[Answer 100]");
    expect(userPrompt).toContain("v1:5555555555555555");
  });

  it("includes maxNodes in the user prompt", async () => {
    let capturedUserPrompt: string | null = null;

    const chat: ThreadSynthesisDeps["chat"] = {
      complete: (request) => {
        capturedUserPrompt = request.messages[1].content;
        return Effect.succeed(buildValidResponse());
      },
    };

    await runWorkflow(baseDeps(chat), makeInput({ maxNodes: 3 }));
    expect(capturedUserPrompt).toContain("up to 3");
  });

  it("returns MALFORMED_RESPONSE for a question exceeding 500 characters", async () => {
    const input = makeInput({ question: "x".repeat(501) });
    const chat = makeSucceedChat(buildValidResponse());
    const outcome = await runWorkflow(baseDeps(chat), input);
    expect(outcome._tag).toBe("error");
    if (outcome._tag === "error") {
      expect(outcome.error.reason).toBe("MALFORMED_RESPONSE");
    }
  });

  it("caps fallback output at maxNodes when all nodes are rejected", async () => {
    const twoStages = [makeStage({ answerId: "1" }), makeStage({ answerId: "2" })];
    const response = JSON.stringify({
      nodes: [
        {
          kind: "relationship",
          title: "Bad",
          summary: "The 原作者 was 错了 about this.",
        },
      ],
    });
    const chat = makeSucceedChat(response);
    const outcome = await runWorkflow(
      baseDeps(chat),
      makeInput({ timelineStages: twoStages, maxNodes: 1 }),
    );
    if (outcome._tag === "success") {
      const { result } = outcome;
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].kind).toBe("unknown");
      expect(result.nodes[0].sourceAnswerId).toBe("1");
    }
  });

  it("falls back to unknown nodes when evidence quotes do not match excerpt text", async () => {
    const response = JSON.stringify({
      nodes: [
        {
          kind: "relationship",
          title: "Valid",
          summary: "A valid summary.",
          evidenceRefs: [
            {
              excerptFingerprint: "v1:5555555555555555",
              quote: "This quote text does not match the excerpt content at all.",
            },
          ],
          sourceAnswerId: "100",
          sourceUrl: "https://www.zhihu.com/question/42/answer/100",
          uncertainty: 0.5,
        },
      ],
    });
    const chat = makeSucceedChat(response);
    const outcome = await runWorkflow(baseDeps(chat), makeInput());
    if (outcome._tag === "success") {
      const { result } = outcome;
      expect(result.nodes.every((n: SynthesizedNode) => n.kind === "unknown")).toBe(true);
    }
  });
});
