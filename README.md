# Living Answer

Living Answer helps readers see which important premises in an older Zhihu
answer have materially changed, what that means today, and which evidence
supports the update.

## One-command development

```bash
./dev.sh
```

On its first run, the script installs the pinned global Vite+ CLI if `vp` is
missing, installs the project-pinned Node.js runtime and dependencies, checks
the environment, and starts the TanStack Start development server. Use the URL
printed by Vite; the project does not assume a fixed port. Stop it with
`Ctrl+C`.

The first run changes the user-level Vite+ installation. This is intentional.

## Manual commands

```bash
vp env install
vp env doctor
vp install --frozen-lockfile
vp dev
```

Validation:

```bash
vp check
vp test
vp build
```

## Current boundary

Ticket 0 only establishes the runnable application baseline. It does not call
the Zhihu API, create persistence, or implement answer ingestion. Spike 01
still blocks ingestion Ticket 1 until a legal full-answer content path is
confirmed.
