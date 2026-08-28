<p align="center">
  <img src="./docs/assets/living-answer-hero.png" alt="Living Answer — an evidence-backed maintenance layer for old Zhihu answers" width="100%" />
</p>

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

## Troubleshooting

When something looks off, run the doctor first. It reports Node version,
package manager, and Vite+ installation status in one place.

```bash
vp env doctor
```

### Port already in use

`vp dev` does not assume a fixed port. If a previous session left a process
bound to the printed port, stop it (the address is shown in the dev output)
or let the next run pick a new one.

```bash
# list processes for the printed port
# macOS / Linux
lsof -i :<port>
# Windows
netstat -ano | findstr :<port>
```

### Dependencies drifted

`vp install` rewrites the lockfile. To restore a clean state from the
pinned lockfile:

```bash
vp install --frozen-lockfile
vp check
```

### Wrong Node version

The project pins Node 24 LTS via `devEngines`. If `vp env doctor` reports
the wrong runtime, install the pinned version and re-run:

```bash
vp env install
```

## Current boundary

Ticket 0 only establishes the runnable application baseline. It does not call
the Zhihu API, create persistence, or implement answer ingestion. Spike 01
still blocks ingestion Ticket 1 until a legal full-answer content path is
confirmed.
