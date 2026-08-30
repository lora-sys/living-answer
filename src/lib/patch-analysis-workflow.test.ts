import { describe, expect, it } from "vite-plus/test";

import type {
  AnalyzePatchInput,
  PatchAnalysisDecision,
  PatchAnalysisUpdateDecision,
  PatchAnalysisNoPatchDecision,
  PatchAnalysisUnknownDecision,
  PatchAnalysisWorkflowDeps,
} from "./patch-analysis-workflow";
import type { OpenAiTransportError } from "./openai-adapter";
import type { PatchProposal } from "./patch-proposal";
import type { PatchEvidence } from "./patch-evidence";
import type { UserSuppliedContext } from "./user-supplied-context";
import type { AnswerExcerpt } from "./answer-excerpt";
import { analyzePatch, PatchAnalysisError } from "./patch-analysis-workflow";
import { OpenAiTransportError as OpenAiTransportErrorClass } from "./openai-adapter";
import { createPatchProposal } from "./patch-proposal";
import { createPatchEvidence } from "./patch-evidence";
import { createUserSuppliedContext } from "./user-supplied-context";
import { createAnswerExcerpt } from "./answer-excerpt";
import { Effect } from "effect";

// ── Test helpers ───────────────────────────────────────────────────────────────

const runDecision = async (
  effect: Effect.Effect<PatchAnalysisDecision, PatchAnalysisError>,
): Promise<PatchAnalysisDecision> => {
  const exit = await Effect.runPromiseExit(effect);
  if (exit._tag === "Failure") {
    const cause = exit.cause as { _tag: string; error?: { reason: string } };
    throw new Error(`Expected success, got: ${cause._tag} ${cause.error?.reason}`);
  }
  return exit.value;
};

const runFailure = async (
  effect: Effect.Effect<PatchAnalysisDecision, PatchAnalysisError>,
): Promise<PatchAnalysisError> => {
  const exit = await Effect.runPromiseExit(effect);
  if (exit._tag !== "Failure") {
    throw new Error("Expected failure but got success");
  }
  const failCause = exit.cause as { _tag: string; error: PatchAnalysisError };
  if (failCause._tag !== "Fail") {
    throw new Error("Expected a failed effect (not die/t interruption)");
  }
  return failCause.error;
};

const makeFakeChat = (
  handler: (
    request: import("./openai-adapter").OpenAiChatCompletionsRequest,
  ) => string | Effect.Effect<string, OpenAiTransportError>,
): import("./openai-adapter").OpenAiChatCompletions => {
  return {
    complete: (request) => {
      const result = handler(request);
      return Effect.isEffect(result)
        ? (result as Effect.Effect<string, OpenAiTransportError>)
        : Effect.succeed(result);
    },
  };
};

const makeDeps = (
  chat: import("./openai-adapter").OpenAiChatCompletions,
): PatchAnalysisWorkflowDeps => ({ chat });

// ── Fixture factories ────────────────────────────────────────────────────────

const PROPOSAL = (): PatchProposal => {
  const r = createPatchProposal({
    proposedBody: "the world population reached 8 billion on 2022-11-15",
    answerSnapshotFingerprint: "v1:aaaa1111aaaa1111",
    contextFingerprint: "v1:bbbb2222bbbb2222",
    capturedAt: 1_700_000_000,
  });
  if (r._tag === "failure") throw new Error(`Proposal failed: ${r.reason}`);
  return r.proposal;
};

const EVIDENCE_WITH_URL = (
  label: string,
  url: string,
  quote: string,
  capturedAt: number,
): PatchEvidence => {
  const r = createPatchEvidence({
    sourceLabel: label,
    sourceUrl: url,
    quote,
    capturedAt,
  });
  if (r._tag === "failure") throw new Error(`Evidence failed: ${r.reason}`);
  return r.evidence;
};

const EVIDENCE_NO_URL = (label: string, quote: string, capturedAt: number): PatchEvidence => {
  const r = createPatchEvidence({
    sourceLabel: label,
    quote,
    capturedAt,
  });
  if (r._tag === "failure") throw new Error(`Evidence failed: ${r.reason}`);
  return r.evidence;
};

const CONTEXT = (): UserSuppliedContext => {
  const r = createUserSuppliedContext({
    questionId: "42",
    answerId: "100",
    contextText: "The UN confirmed the milestone.",
    capturedAt: 1_700_000_000,
  });
  if (r._tag === "failure") throw new Error(`Context failed: ${r.reason}`);
  return r.context;
};

const buildInput = (
  opts: {
    proposal?: PatchProposal;
    evidence?: readonly PatchEvidence[];
    context?: UserSuppliedContext;
    excerpt?: AnswerExcerpt;
  } = {},
): AnalyzePatchInput => ({
  proposal: opts.proposal ?? PROPOSAL(),
  evidence: opts.evidence ?? [
    EVIDENCE_WITH_URL(
      "un.org",
      "https://www.un.org/en/dayof8billion",
      "8 billion people",
      1_700_000_000,
    ),
    EVIDENCE_NO_URL("wiki", "population estimate", 1_700_000_000),
  ],
  context: opts.context ?? CONTEXT(),
  excerpt: opts.excerpt,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("patch-analysis-workflow", () => {
  // ── UPDATE success ──────────────────────────────────────────────────────────

  it("returns UPDATE with evidence fingerprints when model verdict is UPDATE", async () => {
    const evidence = [
      EVIDENCE_WITH_URL(
        "un.org",
        "https://www.un.org/en/dayof8billion",
        "8 billion",
        1_700_000_000,
      ),
    ];
    const realFp = evidence[0].fingerprint;
    const chat = makeFakeChat(() =>
      JSON.stringify({
        verdict: "UPDATE",
        reason: "External UN source confirms the milestone date.",
        selectedEvidenceFingerprints: [realFp],
      }),
    );

    const deps = makeDeps(chat);

    const decision = await runDecision(
      analyzePatch(deps)(buildInput({ proposal: PROPOSAL(), evidence })),
    );

    expect(decision._tag).toBe("UPDATE");
    expect((decision as PatchAnalysisUpdateDecision).selectedEvidenceFingerprints).toEqual([
      realFp,
    ]);
    expect(decision.reason).toBe("External UN source confirms the milestone date.");
  });

  // ── NO_PATCH success ────────────────────────────────────────────────────────

  it("returns NO_PATCH when model decides no patch is needed", async () => {
    const chat = makeFakeChat(() =>
      JSON.stringify({
        verdict: "NO_PATCH",
        reason: "The existing answer is already accurate and up-to-date.",
      }),
    );

    const deps = makeDeps(chat);

    const decision = await runDecision(analyzePatch(deps)(buildInput()));

    expect(decision._tag).toBe("NO_PATCH");
    expect((decision as PatchAnalysisNoPatchDecision).reason).toBe(
      "The existing answer is already accurate and up-to-date.",
    );
  });

  // ── UNKNOWN from model ──────────────────────────────────────────────────────

  it("returns UNKNOWN when model verdict is UNKNOWN", async () => {
    const chat = makeFakeChat(() =>
      JSON.stringify({
        verdict: "UNKNOWN",
        reason: "Conflicting evidence; cannot determine whether an update is warranted.",
      }),
    );

    const deps = makeDeps(chat);

    const decision = await runDecision(analyzePatch(deps)(buildInput()));

    expect(decision._tag).toBe("UNKNOWN");
    expect((decision as PatchAnalysisUnknownDecision).reason).toBe(
      "Conflicting evidence; cannot determine whether an update is warranted.",
    );
  });

  // ── UPDATE downgrade: required evidence is absent ────────────────────────────

  it("downgrades UPDATE to UNKNOWN when selected evidence fingerprint is not in the supplied array", async () => {
    const fakeFp = "v1:abcdef1234567890";
    const chat = makeFakeChat(() =>
      JSON.stringify({
        verdict: "UPDATE",
        reason: "External UN source confirms.",
        selectedEvidenceFingerprints: [fakeFp],
      }),
    );

    const evidence = [
      EVIDENCE_WITH_URL(
        "un.org",
        "https://www.un.org/en/dayof8billion",
        "8 billion",
        1_700_000_000,
      ),
    ];
    const deps = makeDeps(chat);

    const decision = await runDecision(
      analyzePatch(deps)(buildInput({ proposal: PROPOSAL(), evidence })),
    );

    expect(decision._tag).toBe("UNKNOWN");
    expect(decision.reason).toContain("does not have a valid external URL");
  });

  it("downgrades UPDATE to UNKNOWN when selected evidence lacks an external URL", async () => {
    const noUrlEvidence = EVIDENCE_NO_URL("wiki", "population estimate", 1_700_000_000);
    const fakeFp = noUrlEvidence.fingerprint;
    const chat = makeFakeChat(() =>
      JSON.stringify({
        verdict: "UPDATE",
        reason: "External source confirms.",
        selectedEvidenceFingerprints: [fakeFp],
      }),
    );

    const deps = makeDeps(chat);

    const decision = await runDecision(
      analyzePatch(deps)(buildInput({ proposal: PROPOSAL(), evidence: [noUrlEvidence] })),
    );

    expect(decision._tag).toBe("UNKNOWN");
    expect(decision.reason).toContain("does not have a valid external URL");
  });

  // ── Malformed JSON and invalid verdict ──────────────────────────────────────

  it("returns MALFORMED_JSON when model output is not valid JSON", async () => {
    const chat = makeFakeChat(() => "this is not json");

    const deps = makeDeps(chat);

    const error = await runFailure(analyzePatch(deps)(buildInput()));

    expect(error).toBeInstanceOf(PatchAnalysisError);
    expect(error.reason).toBe("MALFORMED_JSON");
    expect(error.detail).toContain("not valid JSON");
  });

  it("returns MALFORMED_JSON when model output is a JSON array", async () => {
    const chat = makeFakeChat(() => '["verdict","NO_PATCH"]');

    const deps = makeDeps(chat);

    const error = await runFailure(analyzePatch(deps)(buildInput()));

    expect(error.reason).toBe("MALFORMED_JSON");
  });

  it("returns INVALID_VERDICT for a non-enum verdict string", async () => {
    const chat = makeFakeChat(() =>
      JSON.stringify({
        verdict: "MAYBE",
        reason: "Not sure.",
      }),
    );

    const deps = makeDeps(chat);

    const error = await runFailure(analyzePatch(deps)(buildInput()));

    expect(error.reason).toBe("INVALID_VERDICT");
  });

  it("returns INVALID_VERDICT when verdict field is missing", async () => {
    const chat = makeFakeChat(() =>
      JSON.stringify({
        reason: "No verdict here.",
      }),
    );

    const deps = makeDeps(chat);

    const error = await runFailure(analyzePatch(deps)(buildInput()));

    expect(error.reason).toBe("INVALID_VERDICT");
  });

  it("returns INVALID_REASON when reason is empty or whitespace-only", async () => {
    const chat = makeFakeChat(() =>
      JSON.stringify({
        verdict: "NO_PATCH",
        reason: "   ",
      }),
    );

    const deps = makeDeps(chat);

    const error = await runFailure(analyzePatch(deps)(buildInput()));

    expect(error.reason).toBe("INVALID_REASON");
  });

  it("returns INVALID_REASON when reason exceeds 500 characters", async () => {
    const chat = makeFakeChat(() =>
      JSON.stringify({
        verdict: "NO_PATCH",
        reason: "x".repeat(501),
      }),
    );

    const deps = makeDeps(chat);

    const error = await runFailure(analyzePatch(deps)(buildInput()));

    expect(error.reason).toBe("INVALID_REASON");
  });

  it("returns INVALID_REASON when reason contains control characters", async () => {
    const chat = makeFakeChat(() =>
      JSON.stringify({
        verdict: "NO_PATCH",
        reason: "inject\u0000here",
      }),
    );

    const deps = makeDeps(chat);

    const error = await runFailure(analyzePatch(deps)(buildInput()));

    expect(error.reason).toBe("INVALID_REASON");
  });

  // ── OpenAI adapter transport failure propagation ────────────────────────────

  it("propagates NETWORK_FAILED transport error", async () => {
    const chat = makeFakeChat(() =>
      Effect.fail(new OpenAiTransportErrorClass({ reason: "NETWORK_FAILED" })),
    );

    const deps = makeDeps(chat);

    const error = await runFailure(analyzePatch(deps)(buildInput()));

    expect(error.reason).toBe("TRANSPORT_FAILED");
    expect(error.transportError).toBeDefined();
    expect(error.transportError?.reason).toBe("NETWORK_FAILED");
  });

  it("propagates HTTP_STATUS transport error preserving the status code", async () => {
    const chat = makeFakeChat(() =>
      Effect.fail(new OpenAiTransportErrorClass({ reason: "HTTP_STATUS", status: 429 })),
    );

    const deps = makeDeps(chat);

    const error = await runFailure(analyzePatch(deps)(buildInput()));

    expect(error.reason).toBe("TRANSPORT_FAILED");
    expect(error.transportError?.reason).toBe("HTTP_STATUS");
    expect(error.transportError?.status).toBe(429);
  });

  it("propagates NON_JSON_RESPONSE transport error", async () => {
    const chat = makeFakeChat(() =>
      Effect.fail(new OpenAiTransportErrorClass({ reason: "NON_JSON_RESPONSE" })),
    );

    const deps = makeDeps(chat);

    const error = await runFailure(analyzePatch(deps)(buildInput()));

    expect(error.reason).toBe("TRANSPORT_FAILED");
    expect(error.transportError?.reason).toBe("NON_JSON_RESPONSE");
  });

  // ── Exact request sent to the fake service ───────────────────────────────────

  it("sends exactly one deterministic JSON prompt to the chat service", async () => {
    let captured: import("./openai-adapter").OpenAiChatCompletionsRequest | null = null;
    const chat = makeFakeChat((request) => {
      captured = request;
      return JSON.stringify({ verdict: "NO_PATCH", reason: "Need more info." });
    });

    const deps = makeDeps(chat);
    const proposal = PROPOSAL();
    const evidence = [
      EVIDENCE_WITH_URL("x.com", "https://x.com/user/status/1", "a quote", 1_700_000_000),
    ];

    await runDecision(analyzePatch(deps)(buildInput({ proposal, evidence })));

    expect(captured).not.toBeNull();
    expect(captured!.model).toBe("patch-analysis");
    expect(captured!.messages).toHaveLength(1);
    expect(captured!.messages[0].role).toBe("user");

    const prompt = JSON.parse(captured!.messages[0].content) as Record<string, unknown>;

    // Prompt is deterministic JSON containing only domain data.
    expect(prompt.task).toBe("analyze-patch");
    expect(prompt.version).toBe("2");
    expect(prompt.proposal).toBeDefined();
    const proposalJson = prompt.proposal as Record<string, string>;
    expect(proposalJson.proposedBody).toBe(proposal.proposedBody);
    expect(proposalJson.answerSnapshotFingerprint).toBe(proposal.answerSnapshotFingerprint);
    expect(proposalJson.contextFingerprint).toBe(proposal.contextFingerprint);

    // Evidence array -- no raw HTML, no secrets
    expect(Array.isArray(prompt.evidence)).toBe(true);
    expect(prompt.evidence).toHaveLength(1);
    const evEntry = prompt.evidence as Array<Record<string, string>>;
    expect(evEntry[0].fingerprint).toBe(evidence[0].fingerprint);
    expect(evEntry[0].sourceLabel).toBe(evidence[0].sourceLabel);
    expect(evEntry[0].sourceUrl).toBe(evidence[0].sourceUrl);
    expect(evEntry[0].quote).toBe(evidence[0].quote);

    // Expected response schema is included
    const expected = prompt.expectedResponse as Record<string, unknown>;
    expect(expected.verdict).toBe("UPDATE");
    expect(expected.reason).toBe("string");
    expect(expected.selectedEvidenceFingerprints).toEqual(["v1:hex"]);
    expect(expected.affectedWording).toBe("string");
    expect(expected.currentState).toBe("string");
    expect(expected.impactOnAnswer).toBe("string");
  });

  it("calls the chat service exactly once", async () => {
    let callCount = 0;
    const chat = makeFakeChat(() => {
      callCount += 1;
      return JSON.stringify({ verdict: "NO_PATCH", reason: "N/A" });
    });

    const deps = makeDeps(chat);

    await runDecision(analyzePatch(deps)(buildInput()));

    expect(callCount).toBe(1);
  });

  // ── UPDATE downgrade: evidence edge cases ───────────────────────────────────

  it("downgrades UPDATE to UNKNOWN when evidence array is empty", async () => {
    const fakeFp = "v1:abcdef1234567890";
    const chat = makeFakeChat(() =>
      JSON.stringify({
        verdict: "UPDATE",
        reason: "External source.",
        selectedEvidenceFingerprints: [fakeFp],
      }),
    );

    const deps = makeDeps(chat);

    const decision = await runDecision(analyzePatch(deps)(buildInput({ evidence: [] })));

    expect(decision._tag).toBe("UNKNOWN");
    expect(decision.reason).toContain("valid external URL");
  });

  it("downgrades UPDATE to UNKNOWN when selectedEvidenceFingerprints is undefined", async () => {
    const chat = makeFakeChat(() =>
      JSON.stringify({
        verdict: "UPDATE",
        reason: "External source.",
      }),
    );

    const deps = makeDeps(chat);

    const decision = await runDecision(analyzePatch(deps)(buildInput()));

    expect(decision._tag).toBe("UNKNOWN");
    expect(decision.reason).toContain("without selected evidence");
  });

  // ── NO_PATCH and UNKNOWN must not carry selected evidence ───────────────────

  it("NO_PATCH response never carries selectedEvidenceFingerprints", async () => {
    const chat = makeFakeChat(() =>
      JSON.stringify({
        verdict: "NO_PATCH",
        reason: "Answer is fine.",
      }),
    );

    const deps = makeDeps(chat);

    const decision = await runDecision(analyzePatch(deps)(buildInput()));

    expect(decision._tag).toBe("NO_PATCH");
    const noPatch = decision as PatchAnalysisNoPatchDecision;
    expect("selectedEvidenceFingerprints" in noPatch).toBe(false);
  });

  it("UNKNOWN response never carries selectedEvidenceFingerprints", async () => {
    const chat = makeFakeChat(() =>
      JSON.stringify({
        verdict: "UNKNOWN",
        reason: "Inconclusive.",
      }),
    );

    const deps = makeDeps(chat);

    const decision = await runDecision(analyzePatch(deps)(buildInput()));

    expect(decision._tag).toBe("UNKNOWN");
    const unk = decision as PatchAnalysisUnknownDecision;
    expect("selectedEvidenceFingerprints" in unk).toBe(false);
  });

  // ── Invalid fingerprint format in selectedEvidenceFingerprints ───────────────

  it("returns INVALID_VERDICT when selectedEvidenceFingerprints contains a malformed fingerprint", async () => {
    const chat = makeFakeChat(() =>
      JSON.stringify({
        verdict: "UPDATE",
        reason: "source",
        selectedEvidenceFingerprints: ["not-a-v1-fingerprint"],
      }),
    );

    const deps = makeDeps(chat);

    const error = await runFailure(analyzePatch(deps)(buildInput()));

    expect(error.reason).toBe("INVALID_VERDICT");
    expect(error.detail).toContain("not-a-v1-fingerprint");
  });

  // ── Proposed body passes through prompt intact ──────────────────────────────

  it("passes the proposed body through the prompt unchanged", async () => {
    const specificBody = "The population surpassed 8 billion on 2022-11-15.";
    const proposal = (): PatchProposal => {
      const r = createPatchProposal({
        proposedBody: specificBody,
        answerSnapshotFingerprint: "v1:aaaa1111aaaa1111",
        contextFingerprint: "v1:bbbb2222bbbb2222",
        capturedAt: 1_700_000_000,
      });
      if (r._tag === "failure") throw new Error(`Proposal failed: ${r.reason}`);
      return r.proposal;
    };

    let capturedContent = "";
    const chat = makeFakeChat((request) => {
      capturedContent = request.messages[0].content;
      return JSON.stringify({ verdict: "NO_PATCH", reason: "ok" });
    });

    const deps = makeDeps(chat);

    await runDecision(analyzePatch(deps)(buildInput({ proposal: proposal() })));

    const parsed = JSON.parse(capturedContent) as Record<string, Record<string, string>>;
    expect(parsed.proposal.proposedBody).toBe(specificBody);
  });

  // ── Context and excerpt are included in the prompt when supplied ──────────────

  it("includes context text in the prompt when context is supplied", async () => {
    const ctxText = "Additional context from the user.";
    const contextResult = createUserSuppliedContext({
      questionId: "42",
      answerId: "100",
      contextText: ctxText,
      capturedAt: 1_700_000_000,
    });
    if (contextResult._tag === "failure")
      throw new Error(`Context failed: ${contextResult.reason}`);

    let capturedContent = "";
    const chat = makeFakeChat((request) => {
      capturedContent = request.messages[0].content;
      return JSON.stringify({ verdict: "NO_PATCH", reason: "ok" });
    });

    const deps = makeDeps(chat);
    await runDecision(analyzePatch(deps)(buildInput({ context: contextResult.context })));

    const parsed = JSON.parse(capturedContent) as Record<string, unknown>;
    const answerCtx = parsed.answerContext as Record<string, string> | undefined;
    expect(answerCtx).toBeDefined();
    expect(answerCtx!.contextText).toBe(ctxText);
    expect("excerptText" in answerCtx!).toBe(false);
  });

  it("includes excerpt text in the prompt when excerpt is supplied", async () => {
    const excerptText = "A relevant excerpt from the answer.";
    const excerptResult = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 1_700_000_000,
      sourceContentId: "42",
      sourceContentType: "Answer",
      sourceEditTime: 1_699_999_000,
      excerpt: excerptText,
    });
    if (excerptResult._tag === "failure")
      throw new Error(`Excerpt failed: ${excerptResult.reason}`);

    let capturedContent = "";
    const chat = makeFakeChat((request) => {
      capturedContent = request.messages[0].content;
      return JSON.stringify({ verdict: "NO_PATCH", reason: "ok" });
    });

    const deps = makeDeps(chat);
    await runDecision(
      analyzePatch(deps)({
        proposal: PROPOSAL(),
        evidence: [
          EVIDENCE_WITH_URL("x.com", "https://x.com/user/status/1", "a quote", 1_700_000_000),
        ],
        excerpt: excerptResult.excerpt,
      }),
    );

    const parsed = JSON.parse(capturedContent) as Record<string, unknown>;
    const answerCtx = parsed.answerContext as Record<string, string> | undefined;
    expect(answerCtx).toBeDefined();
    expect(answerCtx!.excerptText).toBe(excerptText);
    expect("contextText" in answerCtx!).toBe(false);
  });

  it("omits context and excerpt fields from the prompt when neither is supplied", async () => {
    let capturedContent = "";
    const chat = makeFakeChat((request) => {
      capturedContent = request.messages[0].content;
      return JSON.stringify({ verdict: "NO_PATCH", reason: "ok" });
    });

    const deps = makeDeps(chat);
    await runDecision(
      analyzePatch(deps)({
        proposal: PROPOSAL(),
        evidence: [
          EVIDENCE_WITH_URL("x.com", "https://x.com/user/status/1", "a quote", 1_700_000_000),
        ],
      }),
    );

    const parsed = JSON.parse(capturedContent) as Record<string, unknown>;
    expect("answerContext" in parsed).toBe(false);
  });

  it("includes both context and excerpt in the prompt when both are supplied", async () => {
    const ctxText = "User context.";
    const excerptText = "Answer excerpt.";

    const contextResult = createUserSuppliedContext({
      questionId: "42",
      answerId: "100",
      contextText: ctxText,
      capturedAt: 1_700_000_000,
    });
    if (contextResult._tag === "failure")
      throw new Error(`Context failed: ${contextResult.reason}`);

    const excerptResult = createAnswerExcerpt({
      questionId: "42",
      answerId: "100",
      capturedAt: 1_700_000_000,
      sourceContentId: "42",
      sourceContentType: "Answer",
      sourceEditTime: 1_699_999_000,
      excerpt: excerptText,
    });
    if (excerptResult._tag === "failure")
      throw new Error(`Excerpt failed: ${excerptResult.reason}`);

    let capturedContent = "";
    const chat = makeFakeChat((request) => {
      capturedContent = request.messages[0].content;
      return JSON.stringify({ verdict: "NO_PATCH", reason: "ok" });
    });

    const deps = makeDeps(chat);
    await runDecision(
      analyzePatch(deps)(
        buildInput({ context: contextResult.context, excerpt: excerptResult.excerpt }),
      ),
    );

    const parsed = JSON.parse(capturedContent) as Record<string, unknown>;
    const answerCtx = parsed.answerContext as Record<string, string>;
    expect(answerCtx.contextText).toBe(ctxText);
    expect(answerCtx.excerptText).toBe(excerptText);
  });

  // ── Proposal evidenceFingerprint in the prompt ──────────────────────────────

  it("includes evidenceFingerprint in proposal when present", async () => {
    const fp = "v1:cccc3333cccc3333";
    const proposalResult = createPatchProposal({
      proposedBody: "the world population reached 8 billion on 2022-11-15",
      answerSnapshotFingerprint: "v1:aaaa1111aaaa1111",
      contextFingerprint: "v1:bbbb2222bbbb2222",
      evidenceFingerprint: fp,
      capturedAt: 1_700_000_000,
    });
    if (proposalResult._tag === "failure")
      throw new Error(`Proposal failed: ${proposalResult.reason}`);

    let capturedContent = "";
    const chat = makeFakeChat((request) => {
      capturedContent = request.messages[0].content;
      return JSON.stringify({ verdict: "NO_PATCH", reason: "ok" });
    });

    const deps = makeDeps(chat);
    await runDecision(analyzePatch(deps)(buildInput({ proposal: proposalResult.proposal })));

    const parsed = JSON.parse(capturedContent) as Record<string, unknown>;
    const proposalJson = parsed.proposal as Record<string, unknown>;
    expect(proposalJson.evidenceFingerprint).toBe(fp);
  });

  // ── Optional fields: affectedWording, currentState, impactOnAnswer ──────────

  describe("optional fields", () => {
    it("UPDATE decision carries affectedWording, currentState, and impactOnAnswer when model provides them", async () => {
      const excerptResult = createAnswerExcerpt({
        questionId: "42",
        answerId: "100",
        capturedAt: 1_700_000_000,
        sourceContentId: "42",
        sourceContentType: "Answer",
        sourceEditTime: 1_699_999_000,
        excerpt: "世界人口在2022年达到80亿。这是回答的第一段。",
      });
      if (excerptResult._tag === "failure")
        throw new Error(`Excerpt failed: ${excerptResult.reason}`);

      const evidence = [
        EVIDENCE_WITH_URL(
          "un.org",
          "https://www.un.org/en/dayof8billion",
          "8 billion people",
          1_700_000_000,
        ),
      ];
      const realFp = evidence[0].fingerprint;
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "Population milestone confirmed.",
          selectedEvidenceFingerprints: [realFp],
          affectedWording: "世界人口在2022年达到80亿。",
          currentState: "The world population reached 8 billion in 2022.",
          impactOnAnswer: "The original answer's premise about the date is outdated.",
        }),
      );

      const deps = makeDeps(chat);
      const decision = await runDecision(
        analyzePatch(deps)(
          buildInput({ proposal: PROPOSAL(), evidence, excerpt: excerptResult.excerpt }),
        ),
      );

      expect(decision._tag).toBe("UPDATE");
      const update = decision as PatchAnalysisUpdateDecision;
      expect(update.affectedWording).toBe("世界人口在2022年达到80亿。");
      expect(update.currentState).toBe("The world population reached 8 billion in 2022.");
      expect(update.impactOnAnswer).toBe(
        "The original answer's premise about the date is outdated.",
      );
    });

    it("legacy UPDATE response carries no optional fields when model does not provide them", async () => {
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "External source confirms.",
          selectedEvidenceFingerprints: [realFp],
        }),
      );
      const evidence = [
        EVIDENCE_WITH_URL(
          "un.org",
          "https://www.un.org/en/dayof8billion",
          "8 billion people",
          1_700_000_000,
        ),
      ];
      const realFp = evidence[0].fingerprint;
      const deps = makeDeps(chat);
      const decision = await runDecision(
        analyzePatch(deps)(buildInput({ proposal: PROPOSAL(), evidence })),
      );

      expect(decision._tag).toBe("UPDATE");
      const update = decision as PatchAnalysisUpdateDecision;
      expect(update.affectedWording).toBeUndefined();
      expect(update.currentState).toBeUndefined();
      expect(update.impactOnAnswer).toBeUndefined();
    });

    it("omits affectedWording when it exceeds 200 characters", async () => {
      const excerptResult = createAnswerExcerpt({
        questionId: "42",
        answerId: "100",
        capturedAt: 1_700_000_000,
        sourceContentId: "42",
        sourceContentType: "Answer",
        sourceEditTime: 1_699_999_000,
        excerpt: "x".repeat(300),
      });
      if (excerptResult._tag === "failure")
        throw new Error(`Excerpt failed: ${excerptResult.reason}`);

      const longWording = "x".repeat(201);
      // This substring IS in the excerpt (which is 300 x's), but it's too long
      const evidence = [EVIDENCE_WITH_URL("un.org", "https://www.un.org", "quote", 1_700_000_000)];
      const realFp = evidence[0].fingerprint;
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "Overlong wording.",
          selectedEvidenceFingerprints: [realFp],
          affectedWording: longWording,
        }),
      );
      const deps = makeDeps(chat);
      const decision = await runDecision(
        analyzePatch(deps)(
          buildInput({ proposal: PROPOSAL(), evidence, excerpt: excerptResult.excerpt }),
        ),
      );

      expect(decision._tag).toBe("UPDATE");
      expect((decision as PatchAnalysisUpdateDecision).affectedWording).toBeUndefined();
    });

    it("omits affectedWording when it contains control characters", async () => {
      const excerptResult = createAnswerExcerpt({
        questionId: "42",
        answerId: "100",
        capturedAt: 1_700_000_000,
        sourceContentId: "42",
        sourceContentType: "Answer",
        sourceEditTime: 1_699_999_000,
        excerpt: "clean excerpt text here.",
      });
      if (excerptResult._tag === "failure")
        throw new Error(`Excerpt failed: ${excerptResult.reason}`);

      const evidence = [EVIDENCE_WITH_URL("un.org", "https://www.un.org", "quote", 1_700_000_000)];
      const realFp = evidence[0].fingerprint;
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "Control char wording.",
          selectedEvidenceFingerprints: [realFp],
          affectedWording: "excerpt text here.",
        }),
      );
      const deps = makeDeps(chat);
      const decision = await runDecision(
        analyzePatch(deps)(
          buildInput({ proposal: PROPOSAL(), evidence, excerpt: excerptResult.excerpt }),
        ),
      );

      expect(decision._tag).toBe("UPDATE");
      expect((decision as PatchAnalysisUpdateDecision).affectedWording).toBeUndefined();
    });

    it("omits currentState when it exceeds 200 characters", async () => {
      const evidence = [EVIDENCE_WITH_URL("un.org", "https://www.un.org", "quote", 1_700_000_000)];
      const realFp = evidence[0].fingerprint;
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "test",
          selectedEvidenceFingerprints: [realFp],
          currentState: "x".repeat(201),
        }),
      );
      const deps = makeDeps(chat);
      const decision = await runDecision(
        analyzePatch(deps)(buildInput({ proposal: PROPOSAL(), evidence })),
      );

      expect(decision._tag).toBe("UPDATE");
      expect((decision as PatchAnalysisUpdateDecision).currentState).toBeUndefined();
    });

    it("omits impactOnAnswer when it contains control characters", async () => {
      const evidence = [EVIDENCE_WITH_URL("un.org", "https://www.un.org", "quote", 1_700_000_000)];
      const realFp = evidence[0].fingerprint;
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "test",
          selectedEvidenceFingerprints: [realFp],
          impactOnAnswer: "hasa null",
        }),
      );
      const deps = makeDeps(chat);
      const decision = await runDecision(
        analyzePatch(deps)(buildInput({ proposal: PROPOSAL(), evidence })),
      );

      expect(decision._tag).toBe("UPDATE");
      expect((decision as PatchAnalysisUpdateDecision).impactOnAnswer).toBeUndefined();
    });
  });

  // ── Claim anchor: exact substring verification ──────────────────────────────

  describe("claim anchor verification", () => {
    it("keeps affectedWording when it is an exact contiguous substring of the excerpt", async () => {
      const excerptText = "世界人口在2022年达到80亿，这是一个重要的里程碑。";
      const excerptResult = createAnswerExcerpt({
        questionId: "42",
        answerId: "100",
        capturedAt: 1_700_000_000,
        sourceContentId: "42",
        sourceContentType: "Answer",
        sourceEditTime: 1_699_999_000,
        excerpt: excerptText,
      });
      if (excerptResult._tag === "failure")
        throw new Error(`Excerpt failed: ${excerptResult.reason}`);

      const evidence = [
        EVIDENCE_WITH_URL(
          "un.org",
          "https://www.un.org/en/dayof8billion",
          "8 billion people",
          1_700_000_000,
        ),
      ];
      const realFp = evidence[0].fingerprint;
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "Confirmed.",
          selectedEvidenceFingerprints: [realFp],
          affectedWording: "2022年达到80亿",
        }),
      );

      const deps = makeDeps(chat);
      const decision = await runDecision(
        analyzePatch(deps)(
          buildInput({ proposal: PROPOSAL(), evidence, excerpt: excerptResult.excerpt }),
        ),
      );

      expect(decision._tag).toBe("UPDATE");
      expect((decision as PatchAnalysisUpdateDecision).affectedWording).toBe("2022年达到80亿");
    });

    it("drops affectedWording when it is a paraphrase not present verbatim in the excerpt", async () => {
      const excerptText = "世界人口在2022年达到80亿。";
      const excerptResult = createAnswerExcerpt({
        questionId: "42",
        answerId: "100",
        capturedAt: 1_700_000_000,
        sourceContentId: "42",
        sourceContentType: "Answer",
        sourceEditTime: 1_699_999_000,
        excerpt: excerptText,
      });
      if (excerptResult._tag === "failure")
        throw new Error(`Excerpt failed: ${excerptResult.reason}`);

      const evidence = [
        EVIDENCE_WITH_URL(
          "un.org",
          "https://www.un.org/en/dayof8billion",
          "8 billion people",
          1_700_000_000,
        ),
      ];
      const realFp = evidence[0].fingerprint;
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "Confirmed.",
          selectedEvidenceFingerprints: [realFp],
          affectedWording: "world population hit 8 billion", // paraphrase, not in excerpt
        }),
      );

      const deps = makeDeps(chat);
      const decision = await runDecision(
        analyzePatch(deps)(
          buildInput({ proposal: PROPOSAL(), evidence, excerpt: excerptResult.excerpt }),
        ),
      );

      expect(decision._tag).toBe("UPDATE");
      expect((decision as PatchAnalysisUpdateDecision).affectedWording).toBeUndefined();
    });

    it("drops affectedWording when the excerpt is absent", async () => {
      const evidence = [
        EVIDENCE_WITH_URL(
          "un.org",
          "https://www.un.org/en/dayof8billion",
          "8 billion people",
          1_700_000_000,
        ),
      ];
      const realFp = evidence[0].fingerprint;
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UPDATE",
          reason: "Confirmed.",
          selectedEvidenceFingerprints: [realFp],
          affectedWording: "some wording",
        }),
      );

      const deps = makeDeps(chat);
      // No excerpt supplied
      const decision = await runDecision(
        analyzePatch(deps)(buildInput({ proposal: PROPOSAL(), evidence })),
      );

      expect(decision._tag).toBe("UPDATE");
      expect((decision as PatchAnalysisUpdateDecision).affectedWording).toBeUndefined();
    });
  });

  // ── Optional fields: NO_PATCH and UNKNOWN ignore new fields ──────────────────

  describe("optional fields on other verdicts", () => {
    it("NO_PATCH decision never carries optional fields", async () => {
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "NO_PATCH",
          reason: "Accurate.",
          affectedWording: "should-not-appear",
          currentState: "should-not-appear",
          impactOnAnswer: "should-not-appear",
        }),
      );
      const deps = makeDeps(chat);
      const decision = await runDecision(analyzePatch(deps)(buildInput()));
      expect(decision._tag).toBe("NO_PATCH");
      const noPatch = decision as PatchAnalysisNoPatchDecision;
      expect("affectedWording" in noPatch).toBe(false);
      expect("currentState" in noPatch).toBe(false);
      expect("impactOnAnswer" in noPatch).toBe(false);
    });

    it("UNKNOWN decision never carries optional fields", async () => {
      const chat = makeFakeChat(() =>
        JSON.stringify({
          verdict: "UNKNOWN",
          reason: "Inconclusive.",
          affectedWording: "should-not-appear",
          currentState: "should-not-appear",
          impactOnAnswer: "should-not-appear",
        }),
      );
      const deps = makeDeps(chat);
      const decision = await runDecision(analyzePatch(deps)(buildInput()));
      expect(decision._tag).toBe("UNKNOWN");
      const unk = decision as PatchAnalysisUnknownDecision;
      expect("affectedWording" in unk).toBe(false);
      expect("currentState" in unk).toBe(false);
      expect("impactOnAnswer" in unk).toBe(false);
    });
  });
});
