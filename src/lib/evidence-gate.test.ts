import { Effect } from "effect";

import { createEvidenceCandidate } from "./evidence-candidate";
import type { EvidenceCandidate } from "./evidence-candidate";
import { runEvidenceGate } from "./evidence-gate";
import type { OpenAiChatCompletions } from "./openai-adapter";

import { describe, expect, it } from "vite-plus/test";

// ── Helpers ────────────────────────────────────────────────────────────────────

const makeCandidate = (
  overrides: Partial<Parameters<typeof createEvidenceCandidate>[0]> = {},
): EvidenceCandidate => {
  const result = createEvidenceCandidate({
    claimFingerprint: "v1:aaaa0000bbbb1111",
    retrievalEventFingerprint: "v1:cccc0000dddd1111",
    provider: "zhihu_search",
    searchQuery: "test query",
    sourceContentId: "123456",
    sourceContentType: "Answer",
    sourceKind: "community_lead",
    authorityHint: "community",
    sourceLabel: "Zhihu Community",
    title: "Example answer title",
    sourceUrl: "https://www.zhihu.com/question/1/answer/123456",
    contentPreview: "Example content preview text for testing.",
    publishedAt: 1_690_000_000_000,
    capturedAt: 1_700_000_000_000,
    sourceAccessState: "fetched",
    ...overrides,
  });

  if (result._tag === "failure") {
    throw new Error(`Failed to create test candidate: ${result.reason}`);
  }

  return result.candidate;
};

const makeLlm = (response: string | Error): OpenAiChatCompletions => ({
  complete: () =>
    typeof response === "string" ? Effect.succeed(response) : Effect.fail(response as never),
});

const CLAIM_TEXT = "Technology trends are shifting toward AI and automation.";

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("evidence-gate", () => {
  it("promotes candidates classified as promote", async () => {
    const candidate = makeCandidate();
    const llm = makeLlm(JSON.stringify({ classification: "promote", reason: "Specific enough." }));
    const result = await Effect.runPromise(
      runEvidenceGate({ llm, model: "test" }, CLAIM_TEXT, [candidate]),
    );

    expect(result._tag).toBe("gate_passed");
    if (result._tag === "gate_passed") {
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence[0]!.sourceUrl).toBe(candidate.sourceUrl);
    }
  });

  it("returns gate_no_patch when all candidates are rejected", async () => {
    const candidate = makeCandidate();
    const llm = makeLlm(JSON.stringify({ classification: "reject", reason: "Irrelevant." }));
    const result = await Effect.runPromise(
      runEvidenceGate({ llm, model: "test" }, CLAIM_TEXT, [candidate]),
    );

    expect(result._tag).toBe("gate_no_patch");
  });

  it("returns gate_unknown when all candidates are insufficient", async () => {
    const candidate = makeCandidate();
    const llm = makeLlm(JSON.stringify({ classification: "insufficient", reason: "Vague hint." }));
    const result = await Effect.runPromise(
      runEvidenceGate({ llm, model: "test" }, CLAIM_TEXT, [candidate]),
    );

    expect(result._tag).toBe("gate_unknown");
  });

  it("returns gate_no_patch when no candidates exist", async () => {
    const llm = makeLlm(JSON.stringify({ classification: "promote", reason: "N/A" }));
    const result = await Effect.runPromise(runEvidenceGate({ llm, model: "test" }, CLAIM_TEXT, []));

    expect(result._tag).toBe("gate_no_patch");
  });

  it("fails with MALFORMED_MODEL_OUTPUT for invalid JSON", async () => {
    const candidate = makeCandidate();
    const llm = makeLlm("not valid json");
    const result = await Effect.runPromise(
      Effect.either(runEvidenceGate({ llm, model: "test" }, CLAIM_TEXT, [candidate])),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.reason).toBe("MALFORMED_MODEL_OUTPUT");
    }
  });

  it("fails with TRANSPORT_FAILED when LLM transport fails", async () => {
    const candidate = makeCandidate();
    const llm = makeLlm(new Error("transport down"));
    const result = await Effect.runPromise(
      Effect.either(runEvidenceGate({ llm, model: "test" }, CLAIM_TEXT, [candidate])),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.reason).toBe("TRANSPORT_FAILED");
    }
  });

  it("truncates long contentPreview to 500 chars in promoted evidence", async () => {
    const longPreview = "x".repeat(600);
    const candidate = makeCandidate({ contentPreview: longPreview });
    const llm = makeLlm(JSON.stringify({ classification: "promote", reason: "OK." }));
    const result = await Effect.runPromise(
      runEvidenceGate({ llm, model: "test" }, CLAIM_TEXT, [candidate]),
    );

    expect(result._tag).toBe("gate_passed");
    if (result._tag === "gate_passed") {
      expect(result.evidence[0]!.quote.length).toBe(500);
    }
  });

  it("handles mixed classifications: promotes qualifying, ignores others", async () => {
    const c1 = makeCandidate({ sourceContentId: "111", contentPreview: "Specific fact A." });
    const c2 = makeCandidate({ sourceContentId: "222", contentPreview: "Vague hint B." });

    let callCount = 0;
    const llm: OpenAiChatCompletions = {
      complete: () => {
        callCount++;
        if (callCount === 1) {
          return Effect.succeed(JSON.stringify({ classification: "promote", reason: "OK." }));
        }
        return Effect.succeed(JSON.stringify({ classification: "insufficient", reason: "Vague." }));
      },
    };

    const result = await Effect.runPromise(
      runEvidenceGate({ llm, model: "test" }, CLAIM_TEXT, [c1, c2]),
    );

    expect(result._tag).toBe("gate_passed");
    if (result._tag === "gate_passed") {
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence[0]!.quote).toBe("Specific fact A.");
    }
  });
});
