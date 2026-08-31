import { describe, expect, it } from "vite-plus/test";

import { createEvidenceCandidate } from "./evidence-candidate";

import type {
  AuthorityHint,
  EvidenceCandidate,
  EvidenceCandidateInput,
  Provider,
  SourceAccessState,
  SourceKind,
} from "./evidence-candidate";

// ── Helpers ────────────────────────────────────────────────────────────────────

type CandidateOverrides = Partial<
  Omit<
    EvidenceCandidateInput,
    "authorityHint" | "provider" | "publishedAt" | "sourceAccessState" | "sourceKind"
  >
> & {
  readonly authorityHint?: AuthorityHint;
  readonly provider?: Provider;
  readonly publishedAt?: number;
  readonly sourceAccessState?: SourceAccessState;
  readonly sourceKind?: SourceKind;
};

const VALID_INPUT = {
  claimFingerprint: "v1:0123456789abcdef",
  retrievalEventFingerprint: "v1:fedcba9876543210",
  provider: "zhihu_search" as const,
  searchQuery: "test query",
  sourceContentId: "content-123",
  sourceContentType: "Answer",
  sourceKind: "community_lead" as const,
  authorityHint: "community" as const,
  sourceLabel: "Test Label",
  title: "Test Title",
  sourceUrl: "https://example.com/page",
  contentPreview: "This is a preview of the content.",
  capturedAt: 1_700_000_000_000,
  sourceAccessState: "fetched" as const,
};

/**
 * Build a valid candidate with optional overrides.
 */
const makeCandidate = (overrides: CandidateOverrides = {}): EvidenceCandidate => {
  const result = createEvidenceCandidate({ ...VALID_INPUT, ...overrides });

  if (result._tag === "failure") {
    throw new Error(`Failed to create test candidate: ${result.reason}`);
  }

  return result.candidate;
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("createEvidenceCandidate", () => {
  // ── success ──────────────────────────────────────────────────────────────

  it("creates a frozen candidate with all fields", () => {
    const candidate = makeCandidate();

    expect(candidate.claimFingerprint).toBe("v1:0123456789abcdef");
    expect(candidate.retrievalEventFingerprint).toBe("v1:fedcba9876543210");
    expect(candidate.provider).toBe("zhihu_search");
    expect(candidate.searchQuery).toBe("test query");
    expect(candidate.sourceContentId).toBe("content-123");
    expect(candidate.sourceContentType).toBe("Answer");
    expect(candidate.sourceKind).toBe("community_lead");
    expect(candidate.authorityHint).toBe("community");
    expect(candidate.sourceLabel).toBe("Test Label");
    expect(candidate.title).toBe("Test Title");
    expect(candidate.sourceUrl).toBe("https://example.com/page");
    expect(candidate.contentPreview).toBe("This is a preview of the content.");
    expect(candidate.capturedAt).toBe(1_700_000_000_000);
    expect(candidate.sourceAccessState).toBe("fetched");
    expect(candidate.status).toBe("candidate");
    expect(Object.isFrozen(candidate)).toBe(true);
  });

  it("produces deterministic candidateFingerprint matching v1:16hex pattern", () => {
    const a = makeCandidate();
    const b = makeCandidate();

    expect(a.candidateFingerprint).toBe(b.candidateFingerprint);
    expect(a.candidateFingerprint).toMatch(/^v1:[0-9a-f]{16}$/);
  });

  it("output is fully frozen", () => {
    const candidate = makeCandidate();
    expect(Object.isFrozen(candidate)).toBe(true);
  });

  it("omits publishedAt from output when not provided", () => {
    const candidate = makeCandidate({ publishedAt: undefined });
    expect(candidate.publishedAt).toBeUndefined();
  });

  it("includes publishedAt when provided", () => {
    const candidate = makeCandidate({ publishedAt: 1_600_000_000_000 });
    expect(candidate.publishedAt).toBe(1_600_000_000_000);
  });

  // ── normalisation ────────────────────────────────────────────────────────

  it("normalises CRLF to LF in contentPreview", () => {
    const candidate = makeCandidate({
      contentPreview: "Line one\r\nLine two\rLine three",
    });

    expect(candidate.contentPreview).not.toContain("\r");
    expect(candidate.contentPreview).toBe("Line one\nLine two\nLine three");
  });

  it("normalises Unicode NFC in title", () => {
    const decomposed = "Ä Title with decomposed form";
    const candidate = makeCandidate({ title: decomposed });

    expect(candidate.title).toBe("Ä Title with decomposed form");
  });

  it("trims leading and trailing whitespace in searchQuery", () => {
    const candidate = makeCandidate({ searchQuery: "  trimmed query  " });

    expect(candidate.searchQuery).toBe("trimmed query");
  });

  it("normalises sourceUrl via URL.toString()", () => {
    const candidate = makeCandidate({ sourceUrl: "https://example.com/path?q=1" });

    expect(candidate.sourceUrl).toBe("https://example.com/path?q=1");
  });

  it("strips credentials from sourceUrl before storage and fingerprinting", () => {
    const candidate = makeCandidate({
      sourceUrl: "https://user:secret@example.com/page",
    });
    const clean = makeCandidate({ sourceUrl: "https://example.com/page" });

    expect(candidate.sourceUrl).toBe("https://example.com/page");
    expect(candidate.candidateFingerprint).toBe(clean.candidateFingerprint);
  });

  // ── fingerprint stability ────────────────────────────────────────────────

  it("candidateFingerprint is stable despite different capturedAt", () => {
    const first = makeCandidate({ capturedAt: 1000 });
    const second = makeCandidate({ capturedAt: 9_999_999_999_999 });

    expect(first.candidateFingerprint).toBe(second.candidateFingerprint);
  });

  it("candidateFingerprint changes when sourceUrl changes", () => {
    const a = makeCandidate({ sourceUrl: "https://example.com/a" });
    const b = makeCandidate({ sourceUrl: "https://example.com/b" });

    expect(a.candidateFingerprint).not.toBe(b.candidateFingerprint);
  });

  it("candidateFingerprint changes when contentPreview changes", () => {
    const a = makeCandidate({ contentPreview: "Preview version A" });
    const b = makeCandidate({ contentPreview: "Preview version B" });

    expect(a.candidateFingerprint).not.toBe(b.candidateFingerprint);
  });

  it("candidateFingerprint is stable for different capturedAt with same content", () => {
    const a = makeCandidate({ capturedAt: 0 });
    const b = makeCandidate({ capturedAt: 2_000_000_000_000 });

    expect(a.candidateFingerprint).toBe(b.candidateFingerprint);
  });

  // ── provider enum values ─────────────────────────────────────────────────

  it("accepts zhihu_search provider", () => {
    const candidate = makeCandidate({ provider: "zhihu_search" });
    expect(candidate.provider).toBe("zhihu_search");
  });

  it("accepts global_search provider", () => {
    const candidate = makeCandidate({ provider: "global_search" });
    expect(candidate.provider).toBe("global_search");
  });

  // ── sourceKind enum values ────────────────────────────────────────────────

  it("accepts community_lead sourceKind", () => {
    const candidate = makeCandidate({ sourceKind: "community_lead" });
    expect(candidate.sourceKind).toBe("community_lead");
  });

  it("accepts web_source sourceKind", () => {
    const candidate = makeCandidate({ sourceKind: "web_source" });
    expect(candidate.sourceKind).toBe("web_source");
  });

  // ── authorityHint enum values ────────────────────────────────────────────

  it.each([
    ["official", "official"],
    ["project", "project"],
    ["government", "government"],
    ["media", "media"],
    ["community", "community"],
    ["unknown", "unknown"],
  ])("accepts authorityHint %s", (_name, value) => {
    const candidate = makeCandidate({ authorityHint: value as typeof VALID_INPUT.authorityHint });
    expect(candidate.authorityHint).toBe(value);
  });

  // ── sourceAccessState enum values ────────────────────────────────────────

  it.each([
    ["fetched", "fetched"],
    ["restricted", "restricted"],
    ["not_found", "not_found"],
    ["network_error", "network_error"],
  ])("accepts sourceAccessState %s", (_name, value) => {
    const candidate = makeCandidate({
      sourceAccessState: value as typeof VALID_INPUT.sourceAccessState,
    });
    expect(candidate.sourceAccessState).toBe(value);
  });

  // ── failures: fingerprints ───────────────────────────────────────────────

  it("rejects empty claimFingerprint", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, claimFingerprint: "" })).toEqual({
      _tag: "failure",
      reason: "INVALID_CLAIM_FINGERPRINT",
    });
  });

  it("rejects malformed claimFingerprint", () => {
    expect(
      createEvidenceCandidate({ ...VALID_INPUT, claimFingerprint: "not-a-fingerprint" }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CLAIM_FINGERPRINT" });
  });

  it("rejects claimFingerprint with wrong length hex", () => {
    expect(
      createEvidenceCandidate({ ...VALID_INPUT, claimFingerprint: "v1:0123456789abcde" }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CLAIM_FINGERPRINT" });
  });

  it("rejects non-string claimFingerprint", () => {
    expect(
      createEvidenceCandidate({ ...VALID_INPUT, claimFingerprint: null as unknown as string }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CLAIM_FINGERPRINT" });
  });

  it("rejects empty retrievalEventFingerprint", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, retrievalEventFingerprint: "" })).toEqual({
      _tag: "failure",
      reason: "INVALID_RETRIEVAL_EVENT_FINGERPRINT",
    });
  });

  it("rejects malformed retrievalEventFingerprint", () => {
    expect(
      createEvidenceCandidate({ ...VALID_INPUT, retrievalEventFingerprint: "v1:GHIJKLMNOP" }),
    ).toEqual({ _tag: "failure", reason: "INVALID_RETRIEVAL_EVENT_FINGERPRINT" });
  });

  // ── failures: provider ───────────────────────────────────────────────────

  it("rejects invalid provider", () => {
    expect(
      createEvidenceCandidate({ ...VALID_INPUT, provider: "unknown_provider" as "zhihu_search" }),
    ).toEqual({ _tag: "failure", reason: "INVALID_PROVIDER" });
  });

  // ── failures: text fields ────────────────────────────────────────────────

  it("rejects empty searchQuery", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, searchQuery: "" })).toEqual({
      _tag: "failure",
      reason: "INVALID_SEARCH_QUERY",
    });
  });

  it("rejects searchQuery above max length", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, searchQuery: "x".repeat(221) })).toEqual({
      _tag: "failure",
      reason: "INVALID_SEARCH_QUERY",
    });
  });

  it("rejects empty sourceContentId", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, sourceContentId: "" })).toEqual({
      _tag: "failure",
      reason: "INVALID_SOURCE_CONTENT_ID",
    });
  });

  it("rejects sourceContentId above max length", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, sourceContentId: "x".repeat(257) })).toEqual({
      _tag: "failure",
      reason: "INVALID_SOURCE_CONTENT_ID",
    });
  });

  it("rejects empty sourceContentType", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, sourceContentType: "" })).toEqual({
      _tag: "failure",
      reason: "INVALID_SOURCE_CONTENT_TYPE",
    });
  });

  it("rejects sourceContentType above max length", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, sourceContentType: "x".repeat(65) })).toEqual({
      _tag: "failure",
      reason: "INVALID_SOURCE_CONTENT_TYPE",
    });
  });

  it("rejects empty sourceLabel", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, sourceLabel: "" })).toEqual({
      _tag: "failure",
      reason: "INVALID_SOURCE_LABEL",
    });
  });

  it("rejects sourceLabel above max length", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, sourceLabel: "x".repeat(161) })).toEqual({
      _tag: "failure",
      reason: "INVALID_SOURCE_LABEL",
    });
  });

  it("rejects empty title", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, title: "" })).toEqual({
      _tag: "failure",
      reason: "INVALID_TITLE",
    });
  });

  it("rejects title above max length", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, title: "x".repeat(301) })).toEqual({
      _tag: "failure",
      reason: "INVALID_TITLE",
    });
  });

  it("rejects empty contentPreview", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, contentPreview: "" })).toEqual({
      _tag: "failure",
      reason: "INVALID_CONTENT_PREVIEW",
    });
  });

  it("rejects contentPreview above max length", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, contentPreview: "x".repeat(1001) })).toEqual({
      _tag: "failure",
      reason: "INVALID_CONTENT_PREVIEW",
    });
  });

  // ── failures: control characters ────────────────────────────────────────

  it("rejects tab in searchQuery", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, searchQuery: "has\ttab" })).toEqual({
      _tag: "failure",
      reason: "INVALID_SEARCH_QUERY",
    });
  });

  it("rejects null byte in contentPreview", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, contentPreview: "has\x00null" })).toEqual({
      _tag: "failure",
      reason: "INVALID_CONTENT_PREVIEW",
    });
  });

  it("rejects bell in title", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, title: "hasbell" })).toEqual({
      _tag: "failure",
      reason: "INVALID_TITLE",
    });
  });

  it("allows LF in contentPreview", () => {
    const candidate = makeCandidate({ contentPreview: "line1\nline2" });
    expect(candidate.contentPreview).toBe("line1\nline2");
  });

  // ── failures: sourceKind ─────────────────────────────────────────────────

  it("rejects invalid sourceKind", () => {
    expect(
      createEvidenceCandidate({ ...VALID_INPUT, sourceKind: "invalid" as "community_lead" }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_KIND" });
  });

  // ── failures: authorityHint ──────────────────────────────────────────────

  it("rejects invalid authorityHint", () => {
    expect(
      createEvidenceCandidate({ ...VALID_INPUT, authorityHint: "spam" as "official" }),
    ).toEqual({ _tag: "failure", reason: "INVALID_AUTHORITY_HINT" });
  });

  // ── failures: sourceUrl ──────────────────────────────────────────────────

  it("rejects non-HTTP URL scheme", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, sourceUrl: "ftp://example.com" })).toEqual({
      _tag: "failure",
      reason: "INVALID_SOURCE_URL",
    });
  });

  it("rejects malformed URL", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, sourceUrl: "https:///invalid" })).toEqual({
      _tag: "failure",
      reason: "INVALID_SOURCE_URL",
    });
  });

  it("rejects empty sourceUrl", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, sourceUrl: "" })).toEqual({
      _tag: "failure",
      reason: "INVALID_SOURCE_URL",
    });
  });

  it("rejects sourceUrl without hostname", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, sourceUrl: "https://" })).toEqual({
      _tag: "failure",
      reason: "INVALID_SOURCE_URL",
    });
  });

  it("accepts sourceUrl with trailing slash via URL normalization", () => {
    const candidate = makeCandidate({ sourceUrl: "https://example.com/page/" });
    expect(candidate.sourceUrl).toBe("https://example.com/page/");
  });

  // ── failures: timestamps ─────────────────────────────────────────────────

  it("rejects negative capturedAt", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, capturedAt: -1 })).toEqual({
      _tag: "failure",
      reason: "INVALID_CAPTURED_AT",
    });
  });

  it("rejects non-safe-integer capturedAt", () => {
    expect(
      createEvidenceCandidate({ ...VALID_INPUT, capturedAt: Number.MAX_SAFE_INTEGER + 1 }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CAPTURED_AT" });
  });

  it("rejects negative publishedAt", () => {
    expect(createEvidenceCandidate({ ...VALID_INPUT, publishedAt: -1 })).toEqual({
      _tag: "failure",
      reason: "INVALID_PUBLISHED_AT",
    });
  });

  it("rejects non-safe-integer publishedAt", () => {
    expect(
      createEvidenceCandidate({ ...VALID_INPUT, publishedAt: Number.MAX_SAFE_INTEGER + 1 }),
    ).toEqual({ _tag: "failure", reason: "INVALID_PUBLISHED_AT" });
  });

  // ── failures: sourceAccessState ──────────────────────────────────────────

  it("rejects invalid sourceAccessState", () => {
    expect(
      createEvidenceCandidate({
        ...VALID_INPUT,
        sourceAccessState: "invalid" as "fetched",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_SOURCE_ACCESS_STATE" });
  });

  // ── validation order ─────────────────────────────────────────────────────

  it("returns INVALID_CLAIM_FINGERPRINT before INVALID_RETRIEVAL_EVENT_FINGERPRINT", () => {
    expect(
      createEvidenceCandidate({
        ...VALID_INPUT,
        claimFingerprint: "bad",
        retrievalEventFingerprint: "bad",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_CLAIM_FINGERPRINT" });
  });

  it("returns INVALID_RETRIEVAL_EVENT_FINGERPRINT before INVALID_PROVIDER", () => {
    expect(
      createEvidenceCandidate({
        ...VALID_INPUT,
        retrievalEventFingerprint: "bad",
        provider: "bad" as "zhihu_search",
      }),
    ).toEqual({ _tag: "failure", reason: "INVALID_RETRIEVAL_EVENT_FINGERPRINT" });
  });

  // ── no-throw behaviour ────────────────────────────────────────────────────

  it("does not throw on any invalid input", () => {
    const badInputs: Array<Record<string, unknown>> = [
      { claimFingerprint: "" },
      { retrievalEventFingerprint: "bad" },
      { provider: "bad" },
      { searchQuery: "" },
      { sourceContentId: "" },
      { sourceContentType: "" },
      { sourceKind: "bad" },
      { authorityHint: "bad" },
      { sourceLabel: "" },
      { title: "" },
      { sourceUrl: "bad" },
      { contentPreview: "" },
      { capturedAt: -1 },
      { sourceAccessState: "bad" },
    ];

    for (const override of badInputs) {
      const result = createEvidenceCandidate({ ...VALID_INPUT, ...override });
      expect(result._tag).toBe("failure");
    }
  });

  // ── edge cases ───────────────────────────────────────────────────────────

  it("bounds-only contentPreview at exactly 1000 chars", () => {
    const longPreview = "x".repeat(1000);
    const result = createEvidenceCandidate({ ...VALID_INPUT, contentPreview: longPreview });

    if (result._tag === "failure") throw new Error(result.reason);
    expect(result.candidate.contentPreview.length).toBe(1000);
  });

  it("rejects contentPreview at 1001 chars", () => {
    const overLong = "x".repeat(1001);
    expect(createEvidenceCandidate({ ...VALID_INPUT, contentPreview: overLong })).toEqual({
      _tag: "failure",
      reason: "INVALID_CONTENT_PREVIEW",
    });
  });

  it("preserves exact field names in output", () => {
    const candidate = makeCandidate();
    const keys = Object.keys(candidate).sort();

    expect(keys).toEqual([
      "authorityHint",
      "candidateFingerprint",
      "capturedAt",
      "claimFingerprint",
      "contentPreview",
      "provider",
      "retrievalEventFingerprint",
      "searchQuery",
      "sourceAccessState",
      "sourceContentId",
      "sourceContentType",
      "sourceKind",
      "sourceLabel",
      "sourceUrl",
      "status",
      "title",
    ]);
  });

  it("publishedAt is undefined when not provided (not 0)", () => {
    const candidate = makeCandidate({ publishedAt: undefined });
    expect(candidate.publishedAt).toBeUndefined();
  });

  it("accepts publishedAt of 0", () => {
    const candidate = makeCandidate({ publishedAt: 0 });
    expect(candidate.publishedAt).toBe(0);
  });
});
