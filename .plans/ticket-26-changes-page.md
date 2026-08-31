# Ticket 26 - Changes page

Issue: #36 (to create)

Status: pending

## Problem

Patch lifecycle records exist in SQLite but there is no timeline view showing
the history of changes for any answer.

## Goal

Create `/changes` route that shows a chronological timeline of all patch
lifecycle events.

## Design

- Uses existing `PatchLifecycleStore.findHistoryByAnswer()` or a new `findAll()` method
- Timeline shows: status, reason, dates, evidence count
- Status badges use existing token colors
- Mobile-responsive
- Nav link from home page

## Safety

- No new persistence
- Read-only aggregated view
