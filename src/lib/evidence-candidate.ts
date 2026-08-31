/**
 * Immutable {@link EvidenceCandidate} factory.
 *
 * A pre-gate retrieval result from Zhihu or global search.  Carries a
 * `contentPreview` (summary-class text); it is **not** a verified quote and
 * must never be presented as {@link PatchEvidence}.
 *
 * Business failures are returned as a discriminated union; this function never
 * throws.
 *
 * @module evidence-candidate
 */

import { fnv1a64 } from "./answer-excerpt";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Reason an {@link EvidenceCandidate} creation returned `{ _tag: "failure" }`. */
export type EvidenceCandidateFailureReason =
  | "INVALID_CLAIM_FINGERPRINT"
  | "INVALID_RETRIEVAL_EVENT_FINGERPRINT"
  | "INVALID_PROVIDER"
  | "INVALID_SEARCH_QUERY"
  | "INVALID_SOURCE_CONTENT_ID"
  | "INVALID_SOURCE_CONTENT_TYPE"
  | "INVALID_SOURCE_KIND"
  | "INVALID_AUTHORITY_HINT"
  | "INVALID_SOURCE_LABEL"
  | "INVALID_TITLE"
  | "INVALID_SOURCE_URL"
  | "INVALID_CONTENT_PREVIEW"
  | "INVALID_PUBLISHED_AT"
  | "INVALID_CAPTURED_AT"
  | "INVALID_SOURCE_ACCESS_STATE";

/** Search provider that produced this candidate. */
export type Provider = "zhihu_search" | "global_search";

/** Kind of the source content. */
export type SourceKind = "community_lead" | "web_source";

/** Authority hint for the source. */
export type AuthorityHint =
  | "official"
  | "project"
  | "government"
  | "media"
  | "community"
  | "unknown";

/** Access state of the source at retrieval time. */
export type SourceAccessState = "fetched" | "restricted" | "not_found" | "network_error";

/** Status is always "candidate" for pre-gate retrieval results. */
export type EvidenceCandidateStatus = "candidate";

/** Input for {@link createEvidenceCandidate}. */
export interface EvidenceCandidateInput {
  readonly claimFingerprint: string;
  readonly retrievalEventFingerprint: string;
  readonly provider: Provider;
  readonly searchQuery: string;
  readonly sourceContentId: string;
  readonly sourceContentType: string;
  readonly sourceKind: SourceKind;
  readonly authorityHint: AuthorityHint;
  readonly sourceLabel: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly contentPreview: string;
  readonly publishedAt?: number;
  readonly capturedAt: number;
  readonly sourceAccessState: SourceAccessState;
}

/** Immutable evidence-candidate record. */
export interface EvidenceCandidate {
  readonly claimFingerprint: string;
  readonly retrievalEventFingerprint: string;
  readonly provider: Provider;
  readonly searchQuery: string;
  readonly sourceContentId: string;
  readonly sourceContentType: string;
  readonly sourceKind: SourceKind;
  readonly authorityHint: AuthorityHint;
  readonly sourceLabel: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly contentPreview: string;
  readonly publishedAt?: number;
  readonly capturedAt: number;
  readonly sourceAccessState: SourceAccessState;
  readonly candidateFingerprint: string;
  readonly status: EvidenceCandidateStatus;
}

/** Success branch of {@link EvidenceCandidateResult}. */
export interface EvidenceCandidateSuccess {
  readonly _tag: "success";
  readonly candidate: EvidenceCandidate;
}

/** Failure branch of {@link EvidenceCandidateResult}. */
export interface EvidenceCandidateFailure {
  readonly _tag: "failure";
  readonly reason: EvidenceCandidateFailureReason;
}

export type EvidenceCandidateResult = EvidenceCandidateSuccess | EvidenceCandidateFailure;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise a text field: NFC → CRLF/CR to LF → trim. */
const normalizeText = (raw: string): string => {
  const nfc = raw.normalize("NFC");
  const lf = nfc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return lf.trim();
};

/**
 * Validate and normalise a text field.
 *
 * Returns the normalised string on success or `null` on failure.
 * LF (0x0a) is the only control character allowed after normalisation.
 */
const validateTextField = (raw: string, minLength: number, maxLength: number): string | null => {
  if (typeof raw !== "string") return null;
  const normalized = normalizeText(raw);
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    if (code < 0x20 && code !== 0x0a) return null;
  }
  if (normalized.length < minLength || normalized.length > maxLength) return null;
  return normalized;
};

/**
 * Validate a fingerprint: must be a non-empty string matching `^v1:[0-9a-f]{16}$`.
 */
const validateFingerprint = (raw: unknown): string | null => {
  if (typeof raw !== "string" || raw === "" || !/^v1:[0-9a-f]{16}$/.test(raw)) return null;
  return raw;
};

/**
 * Validate an enum value against a set of allowed strings.
 */
const validateEnum = <T extends string>(raw: unknown, allowed: readonly T[]): T | null => {
  return typeof raw === "string" && allowed.includes(raw as T) ? (raw as T) : null;
};

/**
 * Normalise and validate a source-url string.
 *
 * Returns the normalised URL on success or `null` when the value is malformed.
 */
const normalizeSourceUrl = (raw: string): string | null => {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();

  // Reject anything that doesn't have an explicit "http://..." or "https://..."
  // scheme separator with a non-empty hostname following.
  if (!/^https?:\/\/[^/]/i.test(trimmed)) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  // Provider URLs are untrusted and must not carry credentials into storage.
  url.username = "";
  url.password = "";

  return url.toString();
};

/**
 * Validate a safe-integer timestamp: must be a safe integer >= 0.
 * Returns the value on success or `null` on failure.
 */
const validateSafeTimestamp = (raw: unknown): number | null => {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
};

// ── FNV-1a Fingerprint ────────────────────────────────────────────────────────

/**
 * Build the `candidateFingerprint` for an evidence candidate.
 *
 * The fingerprint covers: `claimFingerprint`, `provider`, `sourceUrl` (normalised),
 * and `contentPreview` (normalised).  `capturedAt` is intentionally excluded so
 * that identical content captured at different times shares the same fingerprint.
 */
const buildCandidateFingerprint = (
  claimFingerprint: string,
  provider: Provider,
  sourceUrl: string,
  contentPreview: string,
): string => {
  const material = [
    "claimFingerprint:" + claimFingerprint,
    "provider:" + provider,
    "sourceUrl:" + sourceUrl,
    "contentPreview:" + contentPreview,
  ].join("\n");
  const [high, low] = fnv1a64(material);

  const hex = [high.toString(16).padStart(8, "0"), low.toString(16).padStart(8, "0")].join("");

  return `v1:${hex}`;
};

// ── Public API ────────────────────────────────────────────────────────────────

const failure = (reason: EvidenceCandidateFailureReason): EvidenceCandidateFailure => ({
  _tag: "failure",
  reason,
});

/**
 * Create an immutable {@link EvidenceCandidate} from raw input.
 *
 * Validation order:
 * 1. `claimFingerprint` – non-empty v1:16hex string
 * 2. `retrievalEventFingerprint` – non-empty v1:16hex string
 * 3. `provider` – "zhihu_search" | "global_search"
 * 4. `searchQuery` – non-empty, 1-220 chars, NFC+LF+trim, no control chars
 * 5. `sourceContentId` – non-empty, 1-256 chars, NFC+LF+trim, no control chars
 * 6. `sourceContentType` – non-empty, 1-64 chars, NFC+LF+trim, no control chars
 * 7. `sourceKind` – "community_lead" | "web_source"
 * 8. `authorityHint` – "official" | "project" | "government" | "media" | "community" | "unknown"
 * 9. `sourceLabel` – non-empty, 1-160 chars, NFC+LF+trim, no control chars
 * 10. `title` – non-empty, 1-300 chars, NFC+LF+trim, no control chars
 * 11. `sourceUrl` – valid HTTP/HTTPS URL
 * 12. `contentPreview` – non-empty, 1-1000 chars, NFC+LF+trim, no control chars
 * 13. `publishedAt` – safe integer >= 0 (optional)
 * 14. `capturedAt` – safe integer >= 0
 * 15. `sourceAccessState` – "fetched" | "restricted" | "not_found" | "network_error"
 *
 * `status` is always set to `"candidate"`.
 *
 * Never throws.
 */
export const createEvidenceCandidate = (input: EvidenceCandidateInput): EvidenceCandidateResult => {
  // 1. claimFingerprint
  const claimFingerprint = validateFingerprint(input.claimFingerprint);
  if (claimFingerprint === null) {
    return failure("INVALID_CLAIM_FINGERPRINT");
  }

  // 2. retrievalEventFingerprint
  const retrievalEventFingerprint = validateFingerprint(input.retrievalEventFingerprint);
  if (retrievalEventFingerprint === null) {
    return failure("INVALID_RETRIEVAL_EVENT_FINGERPRINT");
  }

  // 3. provider
  const provider = validateEnum(input.provider, ["zhihu_search", "global_search"]);
  if (provider === null) {
    return failure("INVALID_PROVIDER");
  }

  // 4. searchQuery
  const searchQuery = validateTextField(input.searchQuery, 1, 220);
  if (searchQuery === null) {
    return failure("INVALID_SEARCH_QUERY");
  }

  // 5. sourceContentId
  const sourceContentId = validateTextField(input.sourceContentId, 1, 256);
  if (sourceContentId === null) {
    return failure("INVALID_SOURCE_CONTENT_ID");
  }

  // 6. sourceContentType
  const sourceContentType = validateTextField(input.sourceContentType, 1, 64);
  if (sourceContentType === null) {
    return failure("INVALID_SOURCE_CONTENT_TYPE");
  }

  // 7. sourceKind
  const sourceKind = validateEnum(input.sourceKind, ["community_lead", "web_source"]);
  if (sourceKind === null) {
    return failure("INVALID_SOURCE_KIND");
  }

  // 8. authorityHint
  const authorityHint = validateEnum(input.authorityHint, [
    "official",
    "project",
    "government",
    "media",
    "community",
    "unknown",
  ]);
  if (authorityHint === null) {
    return failure("INVALID_AUTHORITY_HINT");
  }

  // 9. sourceLabel
  const sourceLabel = validateTextField(input.sourceLabel, 1, 160);
  if (sourceLabel === null) {
    return failure("INVALID_SOURCE_LABEL");
  }

  // 10. title
  const title = validateTextField(input.title, 1, 300);
  if (title === null) {
    return failure("INVALID_TITLE");
  }

  // 11. sourceUrl
  const sourceUrl = normalizeSourceUrl(input.sourceUrl);
  if (sourceUrl === null) {
    return failure("INVALID_SOURCE_URL");
  }

  // 12. contentPreview
  const contentPreview = validateTextField(input.contentPreview, 1, 1000);
  if (contentPreview === null) {
    return failure("INVALID_CONTENT_PREVIEW");
  }

  // 13. publishedAt (optional)
  const publishedAt =
    input.publishedAt !== undefined ? validateSafeTimestamp(input.publishedAt) : undefined;
  if (input.publishedAt !== undefined && publishedAt === null) {
    return failure("INVALID_PUBLISHED_AT");
  }

  // 14. capturedAt
  const capturedAt = validateSafeTimestamp(input.capturedAt);
  if (capturedAt === null) {
    return failure("INVALID_CAPTURED_AT");
  }

  // 15. sourceAccessState
  const sourceAccessState = validateEnum(input.sourceAccessState, [
    "fetched",
    "restricted",
    "not_found",
    "network_error",
  ]);
  if (sourceAccessState === null) {
    return failure("INVALID_SOURCE_ACCESS_STATE");
  }

  // Assemble immutable record
  const baseCandidate = {
    claimFingerprint,
    retrievalEventFingerprint,
    provider,
    searchQuery,
    sourceContentId,
    sourceContentType,
    sourceKind,
    authorityHint,
    sourceLabel,
    title,
    sourceUrl,
    contentPreview,
    capturedAt,
    sourceAccessState,
    candidateFingerprint: buildCandidateFingerprint(
      claimFingerprint,
      provider,
      sourceUrl,
      contentPreview,
    ),
    status: "candidate" as const,
  } satisfies EvidenceCandidate;

  const candidate: EvidenceCandidate =
    publishedAt === undefined
      ? Object.freeze(baseCandidate)
      : Object.freeze({ ...baseCandidate, publishedAt });

  return { _tag: "success", candidate };
};
