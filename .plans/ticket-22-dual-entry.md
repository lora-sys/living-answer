# Ticket 22 - Dual entry: paste URL or search question

Status: in_progress

## Problem

The P0 spec calls for two core entry paths:

1. Search for a current question
2. Paste a Zhihu answer URL

Only the paste-URL path exists. A user who does not have a specific answer
link in mind cannot use the product at all.

## Goal

Add a search entry alongside the URL entry. Both paths converge on the same
existing excerpt → claims → evidence → analysis pipeline.

## Design

### UX

Segmented control with two modes:

- "粘贴链接" — existing URL input, unchanged.
- "搜索问题" — text input, submit triggers Zhihu community search, top
  answer-bearing results shown as candidate cards. Clicking a candidate
  prefills the URL and switches to the paste-URL flow.

The segmented control uses the existing token palette (paper, rule, accent).
No new colors or fonts. Focus states follow the existing accent ring pattern.

### Server

New `src/server/search-answer-candidates.ts`:

- Input: `{ query: string }`
- Validates non-empty after trim
- Reads `ZHIHU_ACCESS_SECRET` from `process.env` (only process.env boundary)
- Calls `fetchSearchItems` with provider `zhihu_search`
- Filters raw items to those containing parseable answer URLs
- Returns JSON-safe `{ status: "ok", candidates: [...] }` or typed error
- Never exposes credentials, headers, raw provider bodies, or error causes

## Safety

- No full answer-body ingestion
- No autonomous browsing
- Search adapter stays protocol-only; the server function owns filtering
- No persistence added (writable state remains in existing `.local/` stores)
