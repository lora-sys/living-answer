# Ticket 26 - Changes page

Issue: #36

Status: complete

## Problem

Patch lifecycle records exist in SQLite but there is no timeline view showing
the history of changes for any answer.

## Goal

Create `/changes` route that shows a chronological timeline of all patch
lifecycle events across all answers.

## Design

### Backend

Add `findAll()` to `PatchLifecycleStore` in `src/lib/patch-lifecycle-store.ts`:

```typescript
readonly findAll: () => Effect.Effect<
  readonly PatchLifecycleRecordWithStatus[],
  PatchLifecycleStoreError
>;
```

SQL: `SELECT d.*, le.status, le.event_at FROM patch_lifecycle_decisions d
JOIN patch_lifecycle_events le ON le.decision_id = d.id
WHERE le.id IN (SELECT MAX(id) FROM patch_lifecycle_events GROUP BY decision_id)
ORDER BY le.event_at DESC`

Create `src/server/list-patch-changes.ts`:

- JSON-safe response: `{ status: "ok", changes: [...] }` or `{ status: "error", ... }`
- Each change: `{ recordFingerprint, questionId, answerId, status, reason, eventAt, capturedAt, evidenceCount }`
- No raw provider bodies, no credentials

### Frontend

Create `src/routes/changes.tsx`:

- Chronological timeline, newest first
- Each entry: status badge, reason (truncated to 200 chars), question/answer IDs, date
- Status badge colors: VISIBLE=default, DISPUTED=amber, SUPERSEDED=muted, RESOLVED=green, WITHDRAWN=muted
- Link to Zhihu source: `https://www.zhihu.com/question/{qid}/answer/{aid}`
- Empty state and error state handled
- Uses existing token palette

### Nav

Add `/changes` link next to the `/sources` link on the home page.

## Safety

- Read-only view, no new persistence
- Evidence URLs and quotes not exposed (only count)
- No credentials
