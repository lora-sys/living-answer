import { Clock, Data, Effect } from "effect";

// ── Types ───────────────────────────────────────────────────────────────────────

/**
 * Supported search providers.  `zhihu_search` returns Zhihu community / answer
 * content; `global_search` returns web results.  Each requires different query
 * construction and optional filtering.
 */
export type SearchProvider = "zhihu_search" | "global_search";

/**
 * Categories of failure produced by the transport layer.  These never escape
 * unmodified — callers may map them further, but the reason set is stable.
 */
export type SearchTransportFailureReason = "NETWORK_FAILED" | "HTTP_STATUS" | "NON_JSON_RESPONSE";

/**
 * Transport-level error.  Retains only the reason tag and optional HTTP status
 * — response bodies and credentials are never exposed.
 */
export class SearchTransportError extends Data.TaggedError("SearchTransportError")<{
  readonly reason: SearchTransportFailureReason;
  readonly status?: number;
}> {}

/**
 * Concrete request handed to the transport.  The transport has no knowledge of
 * claims, providers, or environment variables — it receives a URL and headers.
 */
export interface SearchTransportRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

/**
 * Callable transport.  Accepts the request blueprint and returns parsed JSON.
 * An effect so callers can swap in test doubles without touching the real
 * network.
 */
export type SearchTransport = (
  request: SearchTransportRequest,
) => Effect.Effect<unknown, SearchTransportError>;

/**
 * Reasons the domain envelope validator can reject a response.
 */
export type SearchErrorReason =
  | "BLANK_ACCESS_SECRET"
  | "BLANK_QUERY"
  | "ENVELOPE_NOT_OBJECT"
  | "MISSING_CODE"
  | "NON_ZERO_CODE"
  | "DATA_NOT_OBJECT"
  | "ITEMS_NOT_ARRAY";

/**
 * Domain-level error produced when the provider response does not match the
 * documented envelope or when input validation fails.
 */
export class SearchError extends Data.TaggedError("SearchError")<{
  readonly reason: SearchErrorReason;
}> {}

/**
 * Union of all errors the fetcher can produce.
 */
export type FetchItemsError = SearchTransportError | SearchError;

// ── Options ─────────────────────────────────────────────────────────────────────

export interface FetchSearchItemsOptions {
  /** Which endpoint to call. */
  readonly provider: SearchProvider;
  /** Search query string (not empty after trim). */
  readonly query: string;
  /** Bearer token for the `Authorization` header. */
  readonly accessSecret: string;
  /** Injectable transport. */
  readonly transport: SearchTransport;
  /** Optional filter parameter for `global_search` only. */
  readonly filter?: string;
  /** Injectable clock for timestamp header and `capturedAt`. */
  readonly now?: () => Effect.Effect<number, never>;
  /** Base URL for the provider API. */
  readonly baseUrl?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "https://developer.zhihu.com";

/**
 * Build the provider-specific URL.  `zhihu_search` receives `Query=<term>`;
 * `global_search` additionally accepts `filter=<value>`.
 */
function buildUrl(
  provider: SearchProvider,
  query: string,
  baseUrl: string,
  filter?: string,
): string {
  const encodedQuery = encodeURIComponent(query);
  const path = provider === "zhihu_search" ? "zhihu_search" : "global_search";
  let url = `${baseUrl}/api/v1/content/${path}?Query=${encodedQuery}`;
  if (provider === "global_search" && filter !== undefined) {
    url += `&filter=${encodeURIComponent(filter)}`;
  }
  return url;
}

type EnvelopeValidation =
  | { readonly _tag: "success"; readonly items: readonly unknown[] }
  | { readonly _tag: "failure"; readonly error: SearchError };

/**
 * Validate the provider response envelope and extract `Data.Items`.
 *
 * Returns an explicit validation result instead of throwing so structured
 * provider failures stay in the typed error channel.
 */
function validateEnvelope(result: unknown): EnvelopeValidation {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return {
      _tag: "failure" as const,
      error: new SearchError({ reason: "ENVELOPE_NOT_OBJECT" }),
    };
  }

  const envelope = result as Record<string, unknown>;

  if (typeof envelope.Code !== "number") {
    return { _tag: "failure" as const, error: new SearchError({ reason: "MISSING_CODE" }) };
  }

  if (envelope.Code !== 0) {
    return { _tag: "failure" as const, error: new SearchError({ reason: "NON_ZERO_CODE" }) };
  }

  const data = envelope.Data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { _tag: "failure" as const, error: new SearchError({ reason: "DATA_NOT_OBJECT" }) };
  }

  const items = (data as Record<string, unknown>).Items;
  if (!Array.isArray(items)) {
    return { _tag: "failure" as const, error: new SearchError({ reason: "ITEMS_NOT_ARRAY" }) };
  }

  return { _tag: "success" as const, items: items as readonly unknown[] };
}

// ── Fetcher ─────────────────────────────────────────────────────────────────────

/**
 * Fetch raw `Data.Items` from either the `zhihu_search` or `global_search`
 * endpoint.
 *
 * Obligations:
 *  1. The access secret is validated before any network call is constructed.
 *  2. The timestamp header uses the injectable clock.
 *  3. Transport failures are surfaced as {@link SearchTransportError}.
 *  4. Envelope failures are surfaced as {@link SearchError}.
 *  5. Only `Data.Items` is returned — no query, SQLite, React, TanStack, or
 *     environment-variable knowledge enters this module.
 */
export function fetchSearchItems(
  options: FetchSearchItemsOptions,
): Effect.Effect<readonly unknown[], FetchItemsError> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const clockNow = options.now ?? (() => Clock.currentTimeMillis);

  // Validate credential before constructing the request.
  if (options.accessSecret.trim() === "") {
    return Effect.fail(new SearchError({ reason: "BLANK_ACCESS_SECRET" }));
  }

  if (options.query.trim() === "") {
    return Effect.fail(new SearchError({ reason: "BLANK_QUERY" }));
  }

  return Effect.flatMap(clockNow(), (millis) => {
    const timestampSeconds = Math.floor(millis / 1000);
    const url = buildUrl(options.provider, options.query, baseUrl, options.filter);

    const headers: Record<string, string> = {
      "X-Request-Timestamp": String(timestampSeconds),
      Authorization: `Bearer ${options.accessSecret}`,
    };

    return options.transport({ url, headers: Object.freeze(headers) }).pipe(
      // Transport-level errors pass through with their typed reason.
      Effect.mapError((t: unknown): SearchTransportError =>
        t instanceof SearchTransportError
          ? t
          : new SearchTransportError({ reason: "NETWORK_FAILED" }),
      ),
      Effect.flatMap((result) => {
        const validation = validateEnvelope(result);
        return validation._tag === "success"
          ? Effect.succeed(validation.items)
          : Effect.fail(validation.error);
      }),
    );
  });
}

// ── Fetch transport helper ───────────────────────────────────────────────────────

export interface MakeFetchTransportOptions {
  /** Override the global `fetch` (for testing or custom runtime). */
  readonly fetch?: typeof fetch;
  /** Per-request timeout. */
  readonly timeoutMs: number;
}

/**
 * Wrap the global (or injected) `fetch` in the {@link SearchTransport} contract.
 *
 * This is a thin pass-through: no retries, no logging, no quota tracking.
 * Timeout uses `AbortSignal.timeout`.
 */
export function makeFetchSearchTransport(options: MakeFetchTransportOptions): SearchTransport {
  const fetcher = options.fetch ?? fetch;

  return (request) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetcher(request.url, {
          method: "GET",
          headers: request.headers,
          signal: AbortSignal.timeout(options.timeoutMs),
        });

        if (!response.ok) {
          throw new SearchTransportError({ reason: "HTTP_STATUS", status: response.status });
        }

        const text = await response.text();
        try {
          const result = JSON.parse(text) as unknown;
          if (typeof result !== "object" || result === null || Array.isArray(result)) {
            throw new SearchTransportError({ reason: "NON_JSON_RESPONSE" });
          }
          return result;
        } catch (error) {
          if (error instanceof SearchTransportError) throw error;
          throw new SearchTransportError({ reason: "NON_JSON_RESPONSE" });
        }
      },
      catch: (thrown) => {
        if (thrown instanceof SearchTransportError) {
          return thrown;
        }

        if (thrown instanceof Error) {
          // AbortSignal.timeout throws a DOMException (AbortError).
          return new SearchTransportError({ reason: "NETWORK_FAILED" });
        }

        return new SearchTransportError({ reason: "NETWORK_FAILED" });
      },
    });
}
