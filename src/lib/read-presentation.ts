/**
 * Presentation helpers for the Golden Demo Read page.
 *
 * All functions are pure and synchronous — no framework dependencies, no
 * network calls, no runtime locale resolution.  Dates are formatted as
 * `YYYY-MM-DD` using UTC-only `Date` methods.
 *
 * @module read-presentation
 */

import type { GoldenDemoPatch, GoldenDemoFixture } from "./golden-demo-fixture";

// ── Types ──────────────────────────────────────────────────────────────────────

/** Result of grouping patches by paragraph. */
export interface ParagraphPatchGroup {
  readonly paragraphId: string;
  readonly paragraphIndex: number;
  readonly text: string;
  readonly patches: readonly GoldenDemoPatch[];
}

// ── Grouping ───────────────────────────────────────────────────────────────────

export function groupPatchesByParagraph(
  fixture: GoldenDemoFixture,
): readonly ParagraphPatchGroup[] {
  const groups = new Map<string, GoldenDemoPatch[]>();

  for (const patch of fixture.patches) {
    const existing = groups.get(patch.paragraphId);
    if (existing) {
      existing.push(patch);
    } else {
      groups.set(patch.paragraphId, [patch]);
    }
  }

  const result: ParagraphPatchGroup[] = [];
  fixture.paragraphs.forEach((text, index) => {
    const pid = `p-${index}`;
    const patches = groups.get(pid);
    if (patches && patches.length > 0) {
      result.push({ paragraphId: pid, paragraphIndex: index, text, patches });
    }
  });

  return result;
}

// ── Freshness notice ───────────────────────────────────────────────────────────

/**
 * Build the freshness notice displayed at the top of the answer.
 *
 * @example "这篇回答有 2 个关键前提已经变化 · 截至 2024-01-15"
 */
export function buildFreshnessNotice(patchCount: number, asOf: number): string {
  const date = formatDateYYYYMMDD(asOf);
  return `这篇回答有 ${patchCount} 个关键前提已经变化 · 截至 ${date}`;
}

/** Count total patches in a fixture. */
export function totalPatchCount(fixture: GoldenDemoFixture): number {
  return fixture.patches.length;
}

/** Collect the latest `asOf` timestamp across all patches. */
export function latestAsOf(fixture: GoldenDemoFixture): number {
  if (fixture.patches.length === 0) return fixture.provenance.capturedAt;
  return fixture.patches.reduce((max, p) => (p.asOf > max ? p.asOf : max), 0);
}

// ── Date formatting ────────────────────────────────────────────────────────────

/**
 * Format a UTC epoch-ms timestamp as `YYYY-MM-DD`.
 *
 * Uses only `Date` UTC getters — no runtime locale, no `Intl`.
 */
export function formatDateYYYYMMDD(epochMs: number): string {
  const d = new Date(epochMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ── Fingerprint helpers ────────────────────────────────────────────────────────

/** Validate v1:16hex fingerprint format. */
export function isValidFingerprint(value: string): boolean {
  return /^v1:[0-9a-f]{16}$/.test(value);
}

// ── Misc ───────────────────────────────────────────────────────────────────────

/**
 * The patch type labels shown to users (Chinese).
 */
export const PATCH_TYPE_LABELS: Record<GoldenDemoPatch["type"], string> = {
  UPDATE: "已更新",
  CORRECTION: "更正",
  CONDITION: "条件变化",
  BETTER_WAY: "更好的方式",
};
