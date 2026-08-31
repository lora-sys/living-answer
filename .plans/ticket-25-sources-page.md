# Ticket 25 - Sources page

Issue: #35 (to create)

Status: in_progress

## Problem

Evidence candidates are stored in SQLite but there is no aggregated view
where users can see all collected sources. The P0 spec calls for a Sources
page.

## Goal

Create `/sources` route that lists all unique evidence sources, deduplicated
by source URL.

## Current state (partially implemented)

- `src/lib/evidence-candidate-store.ts` has a new `findAll()` method
- `src/server/list-evidence-sources.ts` has a server function (has a type error)
- `src/routes/sources.tsx` has a route (compiles but untested)

## Remaining work

1. Fix the type error in `src/server/list-evidence-sources.ts` line 68
2. Run `vp check --fix` to verify compilation
3. Run `vp test` to verify all existing tests still pass
4. Run `vp build` to verify production build
5. Start `vp dev` and take screenshots at 1280, 375, 320 widths
6. Add a nav link to `/sources` from the home page
7. Commit, create issue, close issue

## Design

- Uses existing token palette (paper, rule, accent)
- Source cards show: label, sourceKind, authorityHint, title, preview, dates
- External links open in new tab with rel="noopener noreferrer"
- Empty state and error state both handled
- Mobile-responsive at all breakpoints
