# Project OS Frontend

P0/P1 standalone workbench with mock API client, plus macOS Electron desktop shell.

## Run workbench (browser / mock)

```bash
cd projectos/workbench
npm install
npm run dev
```

Open http://localhost:5173 and click **Open Sample Workspace**.

## Run desktop app (macOS / real API)

```bash
cd projectos/desktop
npm install --ignore-scripts
npm run dev
```

Uses `ProjectOSLocalApi` in the main process via `IpcTransport`. See [`docs/desktop-development.md`](../docs/desktop-development.md).

## Architecture Map

The Function Map is an architecture view, not a visualization of folder nesting:

- **System Context** shows people and the software system they use.
- **Container** shows independently deployable/runnable applications and data stores.
- **Component** shows cohesive product and technical responsibilities inside the application.
- Horizontal **SWE layers** keep experience, interface, application, infrastructure, and data concerns ordered.
- Every visible node states a responsibility and technology; every visible line is directional and labelled. Linked files are supporting evidence available through selection or the artifact overlay.

The left Semantic File Tree remains available for IDE navigation and opens by default, but it does not determine graph structure.

## Demo Scripts (Mock or Desktop)

### Script A — Google Login

1. Click **Google Login Scenario** (toolbar) or select User Authentication and send the Google login prompt.
2. Review **Prompt Refinement** card → **Confirm & Run**.
3. Watch **Agent Flow** stream to completion.
4. **Code / Diff** tab opens with proposed changes → **Apply Changes**.
5. Google Login node becomes active on the Function Map.

### Script B — Auth Bugfix

1. Click **Trigger Auth Error** (toolbar or terminal bar), or trigger from real terminal output in desktop.
2. Open **Harness** tab — review evidence, hypotheses, root cause.
3. **Start Harness Fix** → Agent Flow runs debug steps.
4. Graph returns to green after verification.

### Reset

Click **Reset Demo** to restore opening state. Safe to run twice.

## Structure

- `contracts/` — `ProjectOSApi`, graph, tree, context, prompt, run, diff, harness
- `client/` — `MockProjectOSApiClient`, `RealProjectOSApiClient`, `IpcTransport`
- `services/` — `ProjectOSLocalApi` (desktop main process)
- `workbench/` — Vite + React UI (browser + Electron renderer)
- `desktop/` — Electron shell (main, preload, packaging)

## Mock vs Real

| Mode | How |
|------|-----|
| Browser mock (default) | `VITE_PROJECTOS_CLIENT=mock` in `workbench/.env.development` |
| Browser real skeleton | `VITE_PROJECTOS_CLIENT=real` (throws without transport) |
| Desktop | Auto-detects `window.projectOS` → `IpcTransport` |

Factory: `createProjectOSApiClient(mode)` in `projectos/client/ProjectOSApiClient.ts`  
Workbench entry: `createWorkbenchClient()` in `workbench/src/data/createWorkbenchClient.ts`

See `docs/backend-integration-handoff.md` for integration slice order.

## P2 additions

- Monaco editor (Code tab) — mock fixtures or disk via `getFileContent` on desktop  
- `RealProjectOSApiClient` + `IpcTransport` (desktop)  
- Presentation docs: `docs/demo-script-5min.md`, `docs/presentation-smoke-checklist.md`  
- Desktop: `docs/desktop-development.md`, `projectos/desktop/`  
