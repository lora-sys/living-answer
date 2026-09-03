/**
 * Turn a typed domain failure into a short, credential-free label.
 *
 * `String(taggedError)` on an Effect `Data.TaggedError` yields only the tag,
 * which made every synthesis, ranking and clarification failure look
 * identical in an eval trace.  These labels carry the reason and, for
 * transport failures, the underlying provider detail.
 *
 * @module domain-error
 */

export interface TaggedDomainError {
  readonly _tag?: string;
  readonly reason?: string;
  readonly cause?: string;
}

export const describeDomainError = (value: unknown): string => {
  // Effect's Data.TaggedError subclasses Error, so the tagged shape has to be
  // matched first or the reason is lost behind the generic message.  A plain
  // Error then falls through to its own name and message.
  if (typeof value === "object" && value !== null) {
    const error = value as TaggedDomainError & { name?: string };
    if (typeof error._tag === "string") {
      const reason = typeof error.reason === "string" ? error.reason : "unknown";
      const cause = typeof error.cause === "string" && error.cause !== "" ? `:${error.cause}` : "";
      return `${error._tag}:${reason}${cause}`;
    }
    if (error instanceof Error) return `${error.name}:${error.message}`;
  }
  return String(value);
};
