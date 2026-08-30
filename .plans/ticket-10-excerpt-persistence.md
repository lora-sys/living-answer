# Ticket 10: AnswerExcerpt persistence layer

## Status

In Progress (2026-08-31)

## Goal

Persist `AnswerExcerpt` records to a local SQLite database so that:

1. Previously fetched excerpts survive server restarts.
2. Repeated requests for the same answer do not consume Zhihu API quota.
3. The product moves beyond demo level by maintaining durable state.

## Context

Competition deadline 2026-09-15: must submit a publicly runnable demo.

Zhihu API has daily quota. The existing in-memory `QueryCache` only helps
within a single process lifetime.

The Notion product page says "缓存现在是架构约束" — caching is now an
architectural constraint.

## Design

### Storage engine

Use `better-sqlite3` (zero external service, synchronous API, file-based).
The database file lives under `.local/excerpts.db` (already in .gitignore
via `.local/`).

### Architecture

Create an `ExcerptStore` interface with two operations:

```typescript
interface ExcerptStore {
  save(excerpt: AnswerExcerpt): Effect.Effect<void, StoreError>;
  findLatest(questionId: string, answerId: string): Effect.Effect<AnswerExcerpt | null, StoreError>;
}
```

The store sits beneath the existing in-memory `QueryCache` in the provider
pipeline:

```
resolve(url)
  -> check in-memory cache (existing)
  -> check persistent store (new)
  -> fetch from Zhihu API (existing, only on both misses)
  -> write to both layers on success
```

### Key

The existing cache key `${questionId}:${answerId}` serves as the primary
lookup. The `fingerprint` field ensures content-level deduplication.

### Schema

```sql
CREATE TABLE IF NOT EXISTS excerpts (
  question_id TEXT NOT NULL,
  answer_id TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  source_content_id TEXT NOT NULL,
  source_content_type TEXT NOT NULL,
  source_edit_time INTEGER NOT NULL,
  excerpt TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (question_id, answer_id, fingerprint)
);
```

Using a composite PK means the same answer can have multiple excerpt versions
(different `capturedAt` = different observation), which preserves the
immutable historical record invariant.

## Implementation steps

1. Add `better-sqlite3` and `@types/better-sqlite3` to dependencies.
2. Create `src/lib/excerpt-store.ts` with the Effect-based interface and a
   `makeSqliteExcerptStore` factory.
3. Add tests for save / findLatest / round-trip / re-open persistence.
4. Modify `src/lib/answer-excerpt-provider.ts` to accept an optional
   `store` option in `AnswerExcerptProviderOptions`.
5. Modify the provider's `resolve` to check the store on cache miss, and
   write to the store on successful fetch.
6. Modify `src/server/analyze-patch.ts` (and `resolve-answer-excerpt.ts`) to
   create the store and pass it to the provider.
7. Ensure `.local/` is in `.gitignore` (verify).
8. Run `vp check`, `vp test`, `vp build`.

## Non-goals

No migration tooling or schema versioning (single table, single version).

No server-side read API for browsing stored excerpts (future ticket).

No encrypted storage (the data is summary-class public content).

No changes to golden demo route.
