const PREVIEW_LENGTH = 52;
const PREVIEW_MIN_CUT = 20;
const PREVIEW_BREAKS = new Set(["。", "！", "？", "；", "，", "："]);

export function truncatePreview(text: string): string {
  if (text.length <= PREVIEW_LENGTH) return text;

  // Avoid clipping English words or structured phrases when a nearby Chinese
  // punctuation mark gives the card a cleaner comprehension boundary.
  const candidate = text.slice(0, PREVIEW_LENGTH + 1);
  let cut = -1;
  for (let index = PREVIEW_MIN_CUT; index < candidate.length; index += 1) {
    if (PREVIEW_BREAKS.has(candidate[index])) cut = index;
  }

  const preview = cut >= 0 ? candidate.slice(0, cut + 1) : text.slice(0, PREVIEW_LENGTH);
  return `${preview}…`;
}

export function formatEvidenceLine(
  organization: string,
  sourceType: string,
  publishedAt: number,
): string {
  const date = new Date(publishedAt);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${organization} · ${sourceType} · ${year}-${month}`;
}
