import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";

import {
  makeSqliteEvidenceCandidateStore,
  type EvidenceCandidateRecord,
} from "../lib/evidence-candidate-store";

export interface EvidenceSourceSummary {
  readonly candidateFingerprint: string;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly authorityHint: string;
  readonly sourceKind: string;
  readonly provider: string;
  readonly status: string;
  readonly capturedAt: number;
  readonly publishedAt?: number;
  readonly contentPreview: string;
}

export type ListEvidenceSourcesResponse =
  | {
      readonly status: "ok";
      readonly sources: readonly EvidenceSourceSummary[];
    }
  | {
      readonly status: "error";
      readonly code: "SOURCES_STORE_ERROR";
      readonly message: string;
    };

function deduplicateBySourceUrl(
  records: readonly EvidenceCandidateRecord[],
): EvidenceSourceSummary[] {
  const seen = new Set<string>();
  const sources: EvidenceSourceSummary[] = [];

  for (const r of records) {
    if (seen.has(r.sourceUrl)) continue;
    seen.add(r.sourceUrl);

    sources.push({
      candidateFingerprint: r.candidateFingerprint,
      sourceLabel: r.sourceLabel,
      sourceUrl: r.sourceUrl,
      title: r.title,
      authorityHint: r.authorityHint,
      sourceKind: r.sourceKind,
      provider: r.provider,
      status: r.status,
      capturedAt: r.capturedAt,
      ...(r.publishedAt !== undefined ? { publishedAt: r.publishedAt } : {}),
      contentPreview: r.contentPreview.slice(0, 200),
    });
  }

  return sources;
}

export const listEvidenceSources = createServerFn({
  method: "GET",
}).handler(async (): Promise<ListEvidenceSourcesResponse> => {
  const store = await Effect.runPromise(
    makeSqliteEvidenceCandidateStore(".local/evidence-candidates.db"),
  );
  const records = await Effect.runPromise(store.findAll());
  return { status: "ok", sources: deduplicateBySourceUrl(records) };
});
