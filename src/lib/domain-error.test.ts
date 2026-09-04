import { describe, expect, it } from "vite-plus/test";

import { describeDomainError } from "./domain-error";
import { CandidateRankingError } from "./answer-candidate-ranker";
import { OpenAiTransportError } from "./openai-adapter";
import { ThreadSynthesisError } from "./thread-synthesis";

describe("describeDomainError", () => {
  it("keeps the reason that String() drops from a tagged error", () => {
    const error = new ThreadSynthesisError({ reason: "ALL_NODES_REJECTED" });
    // Regression guard: String(error) yields only the tag, which made every
    // synthesis failure look identical in a trace.
    expect(String(error)).not.toContain("ALL_NODES_REJECTED");
    expect(describeDomainError(error)).toBe("ThreadSynthesisError:ALL_NODES_REJECTED");
  });

  it("carries the underlying transport detail through the domain error", () => {
    const transport = new OpenAiTransportError({ reason: "HTTP_STATUS", status: 429 });
    const error = new CandidateRankingError({
      reason: "TRANSPORT_FAILED",
      cause: `${transport.reason}${transport.status === undefined ? "" : `:${transport.status}`}`,
    });
    expect(describeDomainError(error)).toBe(
      "CandidateRankingError:TRANSPORT_FAILED:HTTP_STATUS:429",
    );
  });

  it("falls back to a readable label for plain values", () => {
    expect(describeDomainError(new Error("boom"))).toBe("Error:boom");
    expect(describeDomainError(null)).toBe("null");
    expect(describeDomainError("nope")).toBe("nope");
  });
});
