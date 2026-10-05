# Desktop Development

Project OS ships as a **macOS Electron app** that embeds the existing Vite/React workbench as the renderer. The main process runs `ProjectOSLocalApi`; the renderer talks to it through `IpcTransport` exposed via `window.projectOS`.

## Architecture

```
projectos/desktop/     Electron shell (main + preload)
projectos/workbench/   Renderer UI (unchanged layout)
projectos/services/    ProjectOSLocalApi (main process only)
projectos/client/      IpcTransport + mock/real clients
```

Browser-only development still works:

```bash
cd projectos/workbench && npm run dev   # mock client, http://localhost:5173
```

## Desktop commands

```bash
cd projectos/desktop
npm install --ignore-scripts   # first time; see Native modules below
npm run dev                    # Electron + workbench HMR
npm run build                  # production bundle → out/
npm run dist:mac               # .app + .dmg in release/
npm run rebuild:native         # rebuild node-pty for Electron ABI
```

## Client mode

| Environment | Client | Data |
|-------------|--------|------|
| Browser `npm run dev` | `MockProjectOSApiClient` | In-memory fixtures |
| Electron app | `RealProjectOSApiClient` + `IpcTransport` | Disk via `ProjectOSLocalApi` |

Detection: [`workbench/src/data/clientMode.ts`](../projectos/workbench/src/data/clientMode.ts) checks `window.projectOS`.

## IPC surface

- **ProjectOSApi** — `projectos:<method>` invoke handlers in main
- **streamAgentRun** — `projectos:streamSubscribe` + `projectos:runEvent` push channel
- **shell** — native folder picker, openExternal
- **terminal** — `node-pty` in main, xterm.js in renderer; multi-tab + split panes in bottom panel (Cursor-style)

Multiple terminals share one bottom panel. Each tab owns a PTY session; hiding the panel does not kill sessions. Use `+` to create tabs, split buttons for side-by-side panes, and `` Ctrl+` `` / `` Ctrl+Shift+` `` to toggle / create.

Preload exposes `window.projectOS` ([`desktop/src/preload/index.ts`](../projectos/desktop/src/preload/index.ts)).

## Sample workspace path

Dev resolves `sample-graph-saas/` at repo root. Packaged builds bundle it under `Resources/sample-graph-saas` via `electron-builder` `extraResources`.

Override: `PROJECTOS_SAMPLE_WORKSPACE=/path/to/workspace`.

## Native modules

`node-pty` must match the Electron ABI. After upgrading Electron:

```bash
cd projectos/desktop && npm run rebuild:native
```

If install fails on `postinstall`, use `npm install --ignore-scripts` then run `rebuild:native` when network is stable.

### Terminal: `posix_spawnp failed`

If the terminal panel is blank or main-process logs show `posix_spawnp failed`, `node-pty`'s `spawn-helper` binary likely lost its executable bit (common after `npm install --ignore-scripts`).

`npm run dev` runs `predev` → `scripts/ensure-native-binaries.js`, which `chmod +x` on prebuild binaries automatically. You can also run it manually:

```bash
cd projectos/desktop && node scripts/ensure-native-binaries.js
```

If binaries are missing entirely, run `npm run rebuild:native`.

## Cursor / CI environment

If `ELECTRON_RUN_AS_NODE=1` is set in the shell (common in some IDE terminals), Electron runs as plain Node and `require('electron')` breaks. The desktop scripts unset it automatically:

```bash
env -u ELECTRON_RUN_AS_NODE electron-vite dev
```

## Secrets

Desktop uses [`FileSecretStore`](../projectos/persistence/file-secret-store.ts) at `{userData}/secrets.json` (API keys survive restarts).

## Smoke test

Run [`docs/presentation-smoke-checklist.md`](presentation-smoke-checklist.md) desktop section after `npm run dev` in `projectos/desktop`.

## Related docs

- [`docs/backend-integration-handoff.md`](backend-integration-handoff.md) — API contract
- [`projectos/void-spike/docs/gate-0-decision.md`](../projectos/void-spike/docs/gate-0-decision.md) — Void → Electron ADR
