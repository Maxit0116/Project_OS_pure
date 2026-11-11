# Project OS

Project OS is a graph-centered AI development environment. It connects product structure, visual intent, code changes, agent activity, and verification in a local workspace.

## Project memory

- [Project description](project_description.md)
- [Feature status](feature-list.md)
- [Progress log](progress.md)
- [Investor and partner overview](docs/Project-OS-Investor-Overview.md)
- [Repository transition handoff](TRANSFER-HANDOFF.md)
- [Loops Graph · six goals tracking](docs/features/Loops-Graph-Six-Goals-Execution-Tracking.md) — execution status (planned/implemented/contract/live); documenting ≠ done
- [Loops Graph · project workflow + task materials](docs/features/Loops-Graph-Project-Workflow-and-Materials-Dev-Plan.md) — project-bound runs and multi-type task inputs (authority plan)
- [Loops Graph · Gmail connector](docs/features/Loops-Graph-Gmail-Connector-Dev-Plan.md) — read-only phase-1 + send/push boundaries (added 2026-11-10; not part of 5814430)
- [Loops Graph · gaps closure](docs/features/Loops-Graph-Gaps-Closure-Dev-Plan.md) — control-flow / reliability master plan
- [Bug register](bugs.md) — includes SSRF lessons for URL/material fetch policy

## Current branch

This checkout starts from Pure's `graph` branch at `54288f4`. See the [backend development plan](docs/features/backend/Backend-Dev-Plan.md) for current scope and deferrals, and the [agent harness checklist](docs/features/Agent-Harness-Eval-Checklist.md) for the desktop acceptance gate. The backend plan identifies manual desktop workflow verification as unfinished.

## Run the workbench

```bash
cd projectos/workbench
npm install
npm run dev
```

## Run the desktop app

```bash
cd projectos/desktop
npm install --ignore-scripts
npm run dev
```

See [desktop development](docs/desktop-development.md) for platform details.

## Backend checks

Run from `projectos/`:

```bash
npm run typecheck
npm run test:unit
```

The default `npm test` enables the serialized real-preview gate and may start real Electron/Next processes. Use the [harness checklist](docs/features/Agent-Harness-Eval-Checklist.md) for manual desktop acceptance; unit tests do not replace it.

## Main areas

- `projectos/workbench/` — React and TypeScript user interface.
- `projectos/desktop/` — Electron application and native integrations.
- `projectos/contracts/` — shared API and data contracts.
- `projectos/services/` — workspace, model, agent, graph, and harness services.
- `projectos/persistence/` — local workspace state.
- `sample-graph-saas/` — sample Next.js/Prisma workspace.
- `docs/features/backend/` — backend execution plans and current boundaries.
