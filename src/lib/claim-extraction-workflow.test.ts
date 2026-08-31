import { Effect } from "effect";
import { OpenAiTransportError, type OpenAiChatCompletions } from "./openai-adapter";
import {
  ClaimExtractionError,
  extractClaims,
  type ClaimExtractionWorkflowDeps,
} from "./claim-extraction-workflow";

import { createAnswerExcerpt } from "./answer-excerpt";

import type { AnswerExcerpt } from "./answer-excerpt";

import { describe, expect, it } from "vite-plus/test";

// ── Helpers ────────────────────────────────────────────────────────────────────

const FIXED_TIMESTAMP = 1_700_000_000_000;

const makeExcerpt = (overrides: { readonly excerpt?: string } = {}): AnswerExcerpt => {
  const result = createAnswerExcerpt({
    questionId: "42",
    answerId: "100",
    capturedAt: FIXED_TIMESTAMP,
    sourceContentId: "123",
    sourceContentType: "Answer",
    sourceEditTime: 1_699_999_999_000,
    excerpt: overrides.excerpt ?? "The Earth orbits the Sun in an elliptical path.",
  });

  if (result._tag === "failure") {
    throw new Error(`Failed to create test excerpt: ${result.reason}`);
  }

  return result.excerpt;
};

const makeChatMock = (responseContent: string): OpenAiChatCompletions => ({
  complete: () => Effect.succeed(responseContent),
});

const makeClock = (fixedTimestamp = FIXED_TIMESTAMP): ClaimExtractionWorkflowDeps["clock"] => ({
  now: () => Effect.succeed(fixedTimestamp),
});

const makeDeps = (
  chat: OpenAiChatCompletions,
  fixedTimestamp = FIXED_TIMESTAMP,
): ClaimExtractionWorkflowDeps => ({
  chat,
  clock: makeClock(fixedTimestamp),
});

const runEffect = <A>(effect: Effect.Effect<A, ClaimExtractionError>): Promise<A> =>
  Effect.runPromise(effect);

const runError = (
  effect: Effect.Effect<unknown, ClaimExtractionError>,
): Promise<ClaimExtractionError> =>
  Effect.runPromise(
    effect.pipe(Effect.catchAll((err) => Effect.succeed(err as ClaimExtractionError))),
  ) as Promise<ClaimExtractionError>;

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("extractClaims", () => {
  // ------------------------------------------------------------------
  // 1. Successful extraction
  // ------------------------------------------------------------------
  it("extracts and validates claims from a valid excerpt", async () => {
    const excerpt = makeExcerpt({
      excerpt:
        "The Earth orbits the Sun in an elliptical path. Water covers 71% of Earth's surface.",
    });

    const mockResponse = JSON.stringify({
      claims: [
        {
          claimText: "The Earth orbits the Sun in an elliptical path.",
          anchorText: "The Earth orbits the Sun",
          volatility: "high",
          decisionRelevance: "high",
          candidateReason: "Orbital mechanics news may update what learners see.",
        },
        {
          claimText: "Water covers 71% of Earth's surface area.",
          anchorText: "covers 71% of Earth's surface",
          volatility: "medium",
          decisionRelevance: "medium",
          candidateReason: "New oceanography data may refine this percentage.",
        },
      ],
    });

    const deps = makeDeps(makeChatMock(mockResponse));
    const workflow = extractClaims(deps);

    const claims = await runEffect(workflow({ excerpt }));

    expect(claims).toHaveLength(2);
    expect(claims[0].questionId).toBe("42");
    expect(claims[0].answerId).toBe("100");
    expect(claims[0].excerptFingerprint).toBe(excerpt.fingerprint);
    expect(claims[0].claimText).toBe("The Earth orbits the Sun in an elliptical path.");
    expect(claims[0].anchorText).toBe("The Earth orbits the Sun");
    expect(claims[0].volatility).toBe("high");
    expect(claims[0].decisionRelevance).toBe("high");
    expect(claims[0].status).toBe("candidate");
    expect(claims[0].claimFingerprint).toMatch(/^v1:[0-9a-f]{16}$/);

    expect(claims[1].anchorText).toBe("covers 71% of Earth's surface");
    expect(claims[1].volatility).toBe("medium");
    expect(claims[1].decisionRelevance).toBe("medium");
  });

  // ------------------------------------------------------------------
  // 2. Empty extraction is a valid success
  // ------------------------------------------------------------------
  it("returns an empty array when the model returns no claims", async () => {
    const excerpt = makeExcerpt();
    const mockResponse = JSON.stringify({ claims: [] });

    const deps = makeDeps(makeChatMock(mockResponse));
    const workflow = extractClaims(deps);

    const claims = await runEffect(workflow({ excerpt }));

    expect(claims).toEqual([]);
    expect(Array.isArray(claims)).toBe(true);
  });

  // ------------------------------------------------------------------
  // 3. Invalid JSON (malformed)
  // ------------------------------------------------------------------
  it("returns INVALID_JSON on malformed JSON", async () => {
    const excerpt = makeExcerpt();
    const deps = makeDeps(makeChatMock("not json at all"));
    const workflow = extractClaims(deps);

    const err = await runError(workflow({ excerpt }));
    expect(err.reason).toBe("INVALID_JSON");
  });

  // ------------------------------------------------------------------
  // 4. Valid JSON but not an object
  // ------------------------------------------------------------------
  it("returns INVALID_JSON when the response is a JSON array instead of an object", async () => {
    const excerpt = makeExcerpt();
    const deps = makeDeps(makeChatMock(JSON.stringify(["claim1", "claim2"])));
    const workflow = extractClaims(deps);

    const err = await runError(workflow({ excerpt }));
    expect(err.reason).toBe("INVALID_JSON");
  });

  // ------------------------------------------------------------------
  // 5. Missing claims field
  // ------------------------------------------------------------------
  it("returns INVALID_JSON when the claims field is missing", async () => {
    const excerpt = makeExcerpt();
    const deps = makeDeps(makeChatMock(JSON.stringify({ verdict: "na" })));
    const workflow = extractClaims(deps);

    const err = await runError(workflow({ excerpt }));
    expect(err.reason).toBe("INVALID_JSON");
  });

  // ------------------------------------------------------------------
  // 6. Claims field is not an array
  // ------------------------------------------------------------------
  it("returns INVALID_JSON when claims is not an array", async () => {
    const excerpt = makeExcerpt();
    const deps = makeDeps(makeChatMock(JSON.stringify({ claims: "not an array" })));
    const workflow = extractClaims(deps);

    const err = await runError(workflow({ excerpt }));
    expect(err.reason).toBe("INVALID_JSON");
  });

  // ------------------------------------------------------------------
  // 7. Excessive claims (more than 3)
  // ------------------------------------------------------------------
  it("returns INVALID_CLAIM when the model returns more than 3 claims", async () => {
    const excerpt = makeExcerpt();
    const manyClaims = Array.from({ length: 4 }, () => ({
      claimText:
        "Some claim text with sufficient length for passing the validation check correctly.",
      anchorText: "Some claim text",
      volatility: "low",
      decisionRelevance: "low",
      candidateReason: "This is a reason that is long enough to pass validation.",
    }));

    const deps = makeDeps(makeChatMock(JSON.stringify({ claims: manyClaims })));
    const workflow = extractClaims(deps);

    const err = await runError(workflow({ excerpt }));
    expect(err.reason).toBe("INVALID_CLAIM");
  });

  // ------------------------------------------------------------------
  // 8. Non-substring anchor
  // ------------------------------------------------------------------
  it("returns INVALID_ANCHOR when anchorText is not a substring of the excerpt", async () => {
    const excerpt = makeExcerpt({
      excerpt: "The Earth orbits the Sun in an elliptical path.",
    });

    const mockResponse = JSON.stringify({
      claims: [
        {
          claimText: "This is a claim with enough text to be valid for the test.",
          anchorText: "this text does not appear anywhere in the excerpt.",
          volatility: "high",
          decisionRelevance: "high",
          candidateReason: "This is a reason that is long enough.",
        },
      ],
    });

    const deps = makeDeps(makeChatMock(mockResponse));
    const workflow = extractClaims(deps);

    const err = await runError(workflow({ excerpt }));
    expect(err.reason).toBe("INVALID_ANCHOR");
  });

  // ------------------------------------------------------------------
  // 9. Invalid volatility
  // ------------------------------------------------------------------
  it("returns INVALID_CLAIM when volatility is invalid", async () => {
    const excerpt = makeExcerpt();

    const mockResponse = JSON.stringify({
      claims: [
        {
          claimText: "This is a claim with enough text to pass the length validation check.",
          anchorText: "This is a claim",
          volatility: "extreme",
          decisionRelevance: "high",
          candidateReason: "This is a reason that is long enough.",
        },
      ],
    });

    const deps = makeDeps(makeChatMock(mockResponse));
    const workflow = extractClaims(deps);

    const err = await runError(workflow({ excerpt }));
    expect(err.reason).toBe("INVALID_CLAIM");
  });

  // ------------------------------------------------------------------
  // 10. Invalid decisionRelevance
  // ------------------------------------------------------------------
  it("returns INVALID_CLAIM when decisionRelevance is invalid", async () => {
    const excerpt = makeExcerpt();

    const mockResponse = JSON.stringify({
      claims: [
        {
          claimText: "This is a claim with enough text to pass the length validation check.",
          anchorText: "This is a claim",
          volatility: "high",
          decisionRelevance: "must",
          candidateReason: "This is a reason that is long enough.",
        },
      ],
    });

    const deps = makeDeps(makeChatMock(mockResponse));
    const workflow = extractClaims(deps);

    const err = await runError(workflow({ excerpt }));
    expect(err.reason).toBe("INVALID_CLAIM");
  });

  // ------------------------------------------------------------------
  // 11. Empty string fields in claim
  // ------------------------------------------------------------------
  it("returns INVALID_CLAIM when claimText is empty", async () => {
    const excerpt = makeExcerpt();

    const mockResponse = JSON.stringify({
      claims: [
        {
          claimText: "",
          anchorText: "The Sun is",
          volatility: "high",
          decisionRelevance: "high",
          candidateReason: "This is a reason that is long enough.",
        },
      ],
    });

    const deps = makeDeps(makeChatMock(mockResponse));
    const workflow = extractClaims(deps);

    const err = await runError(workflow({ excerpt }));
    expect(err.reason).toBe("INVALID_CLAIM");
  });

  // ------------------------------------------------------------------
  // 12. Transport failure
  // ------------------------------------------------------------------
  it("returns TRANSPORT_FAILED on transport error", async () => {
    const excerpt = makeExcerpt();

    // Simulate a network error by failing the chat service before the
    // workflow even sends a request — the workflow uses NonEmptyArray for
    // messages so the error type is transport
    const chat = {
      complete: () => Effect.fail(new OpenAiTransportError({ reason: "NETWORK_FAILED" })),
    };

    const deps = makeDeps(chat as OpenAiChatCompletions);
    const workflow = extractClaims(deps);

    const err = await runError(workflow({ excerpt }));
    expect(err.reason).toBe("TRANSPORT_FAILED");
    expect(err.transportError).toBeDefined();
    if (err.transportError) {
      expect(err.transportError._tag).toBe("OpenAiTransportError");
    }
  });

  // ------------------------------------------------------------------
  // 13. Clock injection: extractedAt comes from clock
  // ------------------------------------------------------------------
  it("uses injected clock timestamp for extractedAt", async () => {
    const excerpt = makeExcerpt({
      excerpt: "The Moon orbits the Earth. Water freezes at zero Celsius.",
    });

    const mockResponse = JSON.stringify({
      claims: [
        {
          claimText: "The Moon orbits the Earth.",
          anchorText: "The Moon orbits the Earth",
          volatility: "low",
          decisionRelevance: "medium",
          candidateReason: "Lunar orbital data is continuously refined by observation missions.",
        },
      ],
    });

    const clockTimestamp = 1_234_567_890_000;
    const deps = makeDeps(makeChatMock(mockResponse), clockTimestamp);
    const workflow = extractClaims(deps);

    const claims = await runEffect(workflow({ excerpt }));

    expect(claims).toHaveLength(1);
    expect(claims[0].extractedAt).toBe(clockTimestamp);
  });

  // ------------------------------------------------------------------
  // 14. Attributes are inherited from the excerpt
  // ------------------------------------------------------------------
  it("copies questionId, answerId, and identity fields from the excerpt", async () => {
    const excerpt = makeExcerpt();
    const excerptFp = excerpt.fingerprint;

    const mockResponse = JSON.stringify({
      claims: [
        {
          claimText: "This claims specific technology fact as a known scientific premise.",
          anchorText: "The Earth orbits",
          volatility: "low",
          decisionRelevance: "low",
          candidateReason: "This is a reason that is long enough.",
        },
      ],
    });

    const deps = makeDeps(makeChatMock(mockResponse));
    const workflow = extractClaims(deps);

    const claims = await runEffect(workflow({ excerpt }));

    expect(claims[0].questionId).toBe(excerpt.questionId);
    expect(claims[0].answerId).toBe(excerpt.answerId);
    expect(claims[0].sourceContentId).toBe(excerpt.sourceContentId);
    expect(claims[0].sourceContentType).toBe("Answer");
    expect(claims[0].sourceEditTime).toBe(excerpt.sourceEditTime);
    expect(claims[0].excerptFingerprint).toBe(excerptFp);
  });

  // ------------------------------------------------------------------
  // 15. Cap at 3 claims (accepts 3)
  // ------------------------------------------------------------------
  it("accepts exactly 3 claims without error", async () => {
    const excerpt = makeExcerpt({
      excerpt:
        "Fact one about science and research. Fact two about technology and innovation. Fact three about history and human progress.",
    });

    const mockResponse = JSON.stringify({
      claims: [
        {
          claimText: "Fact one relates to science and ongoing research.",
          anchorText: "Fact one about science",
          volatility: "low",
          decisionRelevance: "low",
          candidateReason: "This is a reason that is long enough.",
        },
        {
          claimText: "Fact two deals with technology and innovation trends.",
          anchorText: "Fact two about technology",
          volatility: "low",
          decisionRelevance: "low",
          candidateReason: "This is a reason that is long enough.",
        },
        {
          claimText: "Fact three is about history and human societal progress.",
          anchorText: "Fact three about history",
          volatility: "low",
          decisionRelevance: "low",
          candidateReason: "This is a reason that is long enough.",
        },
      ],
    });

    const deps = makeDeps(makeChatMock(mockResponse));
    const workflow = extractClaims(deps);

    const claims = await runEffect(workflow({ excerpt }));

    expect(claims).toHaveLength(3);
  });

  // ------------------------------------------------------------------
  // 16. Keyed join: fingerprint table doesn't match
  // ------------------------------------------------------------------
  it("ignores non-string keys in response objects", async () => {
    const excerpt = makeExcerpt();

    const mockResponse = JSON.stringify({
      claims: [
        {
          claimText: null,
          anchorText: "Sun",
          volatility: "low",
          decisionRelevance: "low",
          candidateReason: "This is a reason that is long enough.",
        },
      ],
    });

    const deps = makeDeps(makeChatMock(mockResponse));
    const workflow = extractClaims(deps);

    const err = await runError(workflow({ excerpt }));
    expect(err.reason).toBe("INVALID_CLAIM");
  });

  // ------------------------------------------------------------------
  // 17. Multiple claims, one has non-substring anchor — entire extraction fails
  // ------------------------------------------------------------------
  it("fails the entire extraction if any claim has a non-substring anchor", async () => {
    const excerpt = makeExcerpt({
      excerpt: "The Earth orbits the Sun in an elliptical path.",
    });

    const mockResponse = JSON.stringify({
      claims: [
        {
          claimText: "The Earth orbits the Sun in its elliptical path.",
          anchorText: "The Earth orbits the Sun",
          volatility: "high",
          decisionRelevance: "high",
          candidateReason: "This is a reason that is long enough.",
        },
        {
          claimText: "Something else that fails to anchor correctly.",
          anchorText: "this anchor is fabricated and nowhere in the excerpt",
          volatility: "high",
          decisionRelevance: "high",
          candidateReason: "This is a reason that is long enough.",
        },
      ],
    });

    const deps = makeDeps(makeChatMock(mockResponse));
    const workflow = extractClaims(deps);

    const err = await runError(workflow({ excerpt }));
    expect(err.reason).toBe("INVALID_ANCHOR");
  });
});
