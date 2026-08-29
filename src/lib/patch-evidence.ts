/**
 * Immutable {@link PatchEvidence} factory.
 *
 * Normalises the source label and quote (Unicode NFC → CRLF/CR ⇒ LF → trim),
 * validates the optional source URL, and produces a deterministic versioned
 * fingerprint via 64-bit FNV-1a.  Business failures are returned as a
 * discriminated union; this function never throws.
 *
 * @module patch-evidence
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** Reason a patch-evidence creation returned `{ _tag: "failure" }`. */
export type PatchEvidenceFailureReason =
  | "INVALID_SOURCE_LABEL"
  | "INVALID_SOURCE_URL"
  | "INVALID_QUOTE"
  | "INVALID_CAPTURED_AT";

/** Input for {@link createPatchEvidence}. */
export interface PatchEvidenceInput {
  readonly sourceLabel: string;
  readonly sourceUrl?: string;
  readonly quote: string;
  readonly capturedAt: number;
}

/** Immutable evidence record. */
export interface PatchEvidence {
  readonly sourceLabel: string;
  readonly sourceUrl?: string;
  readonly quote: string;
  readonly capturedAt: number;
  readonly fingerprint: string;
}

/** Success branch of {@link PatchEvidenceResult}. */
export interface PatchEvidenceSuccess {
  readonly _tag: "success";
  readonly evidence: PatchEvidence;
}

/** Failure branch of {@link PatchEvidenceResult}. */
export interface PatchEvidenceFailure {
  readonly _tag: "failure";
  readonly reason: PatchEvidenceFailureReason;
}

export type PatchEvidenceResult = PatchEvidenceSuccess | PatchEvidenceFailure;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Normalise a text field: NFC → CRLF/CR to LF → trim. */
const normalizeText = (raw: string): string => {
  const nfc = raw.normalize("NFC");
  const lf = nfc.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return lf.trim();
};

/**
 * Normalise and validate a source-url string.
 *
 * Returns the normalised URL on success or `null` when the field is absent.
 * Throws `INVALID_SOURCE_URL` when a value is provided but is malformed.
 */
const normalizeSourceUrl = (raw: string | undefined): string | undefined => {
  if (raw === undefined) return undefined;

  const trimmed = raw.trim();
  if (trimmed === "") return undefined;

  // Reject anything that doesn't have an explicit "http://..." or "https://..."
  // scheme separator with a non-empty hostname following. This catches shorthand
  // forms (e.g. "https:/example.com", "https:example.com") and the
  // "https:///path" edge case where WHATWG URL normalises the empty authority
  // into a non-empty hostname.
  if (!/^https?:\/\/[^/]/i.test(trimmed)) {
    throw { _tag: "failure" as const, reason: "INVALID_SOURCE_URL" as const };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw { _tag: "failure" as const, reason: "INVALID_SOURCE_URL" as const };
  }

  return url.toString();
};

// ── FNV-1a Fingerprint ──────────────────────────────────────────────────────

/**
 * Compute the FNV-1a hash over `data`.
 *
 * Returns a 64-bit result (high + low 32-bit parts) as two unsigned integers.
 *
 * **This hash is non-cryptographic** and intended only for identity/caching;
 * it must never be used for security, signing, or deduplication against
 * adversarial inputs.
 */
const fnv1a64 = (data: string): [high: number, low: number] => {
  // 64-bit FNV-1a
  const FNV_OFFSET_BASIS = 14695981039346656037n;
  const fnvPrime = 1099511628211n;

  let h64 = FNV_OFFSET_BASIS;

  for (let i = 0; i < data.length; i++) {
    h64 ^= BigInt(data.charCodeAt(i));
    h64 *= fnvPrime;
  }

  // Split into two 32-bit unsigned halves
  const mask = 0xffffffffn;
  const high = Number((h64 >> 32n) & mask);
  const low = Number(h64 & mask);

  return [high, low];
};

/**
 * Build a versioned fingerprint for the evidence.
 *
 * The material is composed of the normalised `sourceLabel`, the normalised
 * `sourceUrl` (encoded as an explicit presence marker plus value, or absence
 * marker), and the normalised `quote`.  `capturedAt` is intentionally excluded
 * so that identical content captured at different times shares the same
 * fingerprint.
 *
 * @note This is a non-cryptographic hash suitable for equality checks and
 *       cache keys only.
 */
const buildFingerprint = (
  sourceLabel: string,
  sourceUrl: string | undefined,
  quote: string,
): string => {
  const urlComponent = sourceUrl !== undefined ? `url:${sourceUrl}` : "url:";
  const material = `sourceLabel:${sourceLabel}\n${urlComponent}\nquote:${quote}`;
  const [high, low] = fnv1a64(material);

  const hex = [high.toString(16).padStart(8, "0"), low.toString(16).padStart(8, "0")].join("");

  return `v1:${hex}`;
};

// ── Public API ──────────────────────────────────────────────────────────────

const failure = (reason: PatchEvidenceFailureReason): PatchEvidenceFailure => ({
  _tag: "failure",
  reason,
});

/**
 * Create an immutable {@link PatchEvidence} from raw input.
 *
 * Validation order:
 * 1. Safe-integer, non-negative `capturedAt`
 * 2. Source-label normalisation and non-empty check
 * 3. Source-url normalisation and validation (when provided)
 * 4. Quote normalisation and non-empty check
 *
 * Never throws – returns {@link PatchEvidenceFailure} on any validation error.
 */
export const createPatchEvidence = (input: PatchEvidenceInput): PatchEvidenceResult => {
  // --- capturedAt (first, since it does not depend on normalisation) ---------

  if (!Number.isSafeInteger(input.capturedAt) || input.capturedAt < 0) {
    return failure("INVALID_CAPTURED_AT");
  }

  // --- sourceLabel -----------------------------------------------------------

  const sourceLabel = normalizeText(input.sourceLabel);
  if (sourceLabel === "") {
    return failure("INVALID_SOURCE_LABEL");
  }

  // --- sourceUrl (optional) --------------------------------------------------

  let sourceUrl: string | undefined;
  try {
    sourceUrl = normalizeSourceUrl(input.sourceUrl);
  } catch (e) {
    if (e && typeof e === "object" && "_tag" in e && (e as { _tag: string })._tag === "failure") {
      return e as PatchEvidenceFailure;
    }
    throw e;
  }

  // --- quote -----------------------------------------------------------------

  const quote = normalizeText(input.quote);
  if (quote === "") {
    return failure("INVALID_QUOTE");
  }

  // --- assemble --------------------------------------------------------------

  const evidence: PatchEvidence = Object.freeze({
    sourceLabel,
    sourceUrl,
    quote,
    capturedAt: input.capturedAt,
    fingerprint: buildFingerprint(sourceLabel, sourceUrl, quote),
  });

  return { _tag: "success", evidence };
};
