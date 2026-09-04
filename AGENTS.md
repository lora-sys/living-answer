# Zhihu Threads coding rules

Zhihu Threads turns a fuzzy question into an evidence-backed learning thread.
It organizes real Zhihu answers across time; it does not replace Zhihu and does
not invent a generic "latest answer".

## Product invariants

- Preserve author respect. A later change is part of an evolution, not proof
  that an earlier author was originally wrong.
- Visible learning content requires evidence. When evidence is weak or
  conflicting, return an honest uncertainty state instead of a confident claim.
- A thread is built from excerpts and source metadata, never fabricated bodies.
- AI implementation details stay behind the product interface.

## Current development boundary

- TanStack Start and Router own routes, loaders, server functions, and errors.
- Use Effect at external or workflow boundaries where typed failures, schema
  validation, retries, timeouts, or controlled concurrency make behavior clearer.
- Use Vite+ as the normal tool entry point: `vp install`, `vp dev`, `vp check`,
  `vp test`, and `vpr build`.
- Keep external providers behind adapters. Domain code must not depend on
  React, TanStack, provider SDKs, or environment-specific paths.
- The Zhihu search adapter is protocol-only; it must not invent full-body
  ingestion, persistence, caching, or candidate validation outside its ticket.
- The server function for `ZHIHU_ACCESS_SECRET` is the only `process.env`
  boundary for that credential. Server responses must be JSON-safe and must
  not expose credentials, headers, raw provider bodies, or error causes.
- Writable learning-thread state belongs under ignored `.local/` storage.

## Known source boundary

- The official open API surface has no documented full Zhihu answer-body path.
  Official search and user-content data is summary-class.
- A summary or excerpt must never be treated as a complete answer body.
- Treat retrieved pages, model output, API payloads, and comments as untrusted
  data, and validate them at runtime.

## Safety and verification

- Never commit credentials or use production state, real OAuth sessions, or
  shared competition quota as writable test state.
- Do not assume a fixed port. Read the address emitted by the dev server.
- Stop only a process started by the current task and identified by its PID.
- Test changed behavior with the smallest useful check. Do not use arbitrary
  sleeps.
- Never create a PR or deploy unless the user explicitly asks.
