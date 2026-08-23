# Living Answer current context

## Product

Living Answer points out materially changed premises when a reader uses an old
Zhihu answer today. The original answer remains primary. A patch explains the
change, its present impact, and the supporting evidence.

## Current technical baseline

- TanStack Start with React and TanStack Router
- Vite+ as the toolchain and pnpm as the pinned package manager
- Tailwind CSS 4 through `@tailwindcss/vite`
- Effect for later application and infrastructure reliability boundaries
- Node.js 24 LTS

## Current status

Foundation Ticket 0 establishes the runnable environment. M1 remains Answer
ingestion and immutable snapshots. Spike 01 is still active, so ingestion
Ticket 1 is not Ready.

Confirmed external fact: the official Zhihu Hackathon Search Skill and user
content listing expose summaries. They do not document a way to fetch the full
body of an arbitrary Zhihu answer. A search summary must never be stored or
presented as a complete `AnswerSnapshot`.

## Next decision

Close Spike 01 by confirming a legal full-answer source or reshaping the
competition ingestion boundary. Do not add database or importer code before
that decision.
