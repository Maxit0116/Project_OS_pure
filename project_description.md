# Project OS

## What it is

Project OS is a graph-centered AI development environment. It connects a product's architecture, code, visual intent, agent work, and verification in one local workspace so people can direct software changes and understand their effects.

## Who it serves

The initial focus is individual builders and small product teams working with AI: founders, product-minded developers, and designers who need a better way to move from an observed product problem to a reviewed implementation. The long-term ambition is to make building software accessible to more people while preserving their ability to understand and shape what AI creates.

## Why it exists

Code is distributed across files, while architecture and intent are often held in people's heads or scattered across conversations. A graph can make the system and its relationships easier to navigate. Visual captures can connect a proposed change to the relevant experience. Recorded agent activity and verification can help the builder follow the work.

## Current product direction

- Status (2026-11-04): gate S0 (type checks and builds) passes; the node-harness gate SH is partly done; the sample project is reproducible from the committed fixture mirror and the graph sanitizer keeps authored content; gate S1 (first run with a live DeepSeek model) passes on the built app; gate S2 (a single-file Agent change with intent approval, validated apply, honest verification and undo, plus a model-built map of the sample) passes on the built app; gate S3 (a change across components) works on the built app (a three-capability change applied, verified and undone) except a question that pauses and resumes a run mid-run, which is not built, and a clean run with the answers visible in code, not yet observed; Stop works. Test triage is open: 1782 pass / 80 fail / 24 skipped of 1886 core-package tests, all older drift (approval-rule tests, old intent-stub tests, sample real-preview suites that need `npm install` in the sample).
- Governing priority (2026-11-03): shipability. The whole product must work on the built desktop app, proven gate by gate on observed runs; [`build_plan.md` §0](build_plan.md#0-shipability--the-current-priority-2026-11-03) defines the gates S0–S6. The hackathon demonstration below is gate S3.

- Current milestone: a working hackathon demonstration of project-wide agent orchestration. Prioritize the master exploring the graph, delegating node tasks, consuming child reports, coordinating changes and showing the working app result. Use the existing model loop first; lock/journal hardening, crash recovery and full external-runtime support follow the demo. [`build_plan.md` §15](build_plan.md#15-active-hackathon-build-plan--make-orchestration-work-first) defines the current execution order.

- Use the Pure repository as the active implementation: `Maxit0116/Project_OS_pure`, branch `graph`.
- Build a local-first Electron workbench around a project structure graph, focused conversation, agent execution, and reviewable code changes.
- Active architecture work: a stable harness around every node for both Project OS model execution and complete agent runtimes. The current branch binds explicit model choices per request, records shared decision/checkpoint/budget data, starts iterative inspect/list/read/consult discovery from the immediate graph, and shows waiting decisions in chat and on the map. The discovery loop still needs deep-graph evidence and Ask/Plan reuse. As of 2026-11-04 a request can choose a registered runtime executor (a dev-only scripted one exists), its proposal is validated by an independent model fixed on the approved intent before it can be applied, and the built-in model's single-file proposal goes through the same adapter, scoped host and staging checks; planning, `inspectNode`, `consultNode`, `requestDecision` and external runtimes are not on the harness yet. Restart-safe orchestration, notification links, standalone-node migration, and desktop acceptance remain open. The [node-harness design](docs/features/Hierarchical-Agent-Protocol-Dev-Plan.md) records the longer-term architecture; `build_plan.md` §15 sets the current demo-first implementation order.
- Treat graph descriptions as navigation and context. Backend policy, current files, and explicit verification remain authoritative for writes and completion.
- Start with individual builders and small teams. Shared collaboration, organizational governance, and hosted services are later product directions, not claims about the current release.
- Keep the older `ProjectOS` checkout as a local historical archive during the transition. Transfer specific decisions or implementation work after comparing them with Pure.

## What exists in the active branch

The `graph` branch includes a React/TypeScript workbench, Electron desktop shell, a C4-style structure map, AI-assisted structure scanning, model-backed agent workflows, context assembly, a local agent harness, code and diff review, spatial capture sessions, annotations, UI stencils, and a live overlay of agent activity on project nodes. It also includes persisted execution records, verification evidence, and local workspace state.

The repository includes a Next.js/Prisma sample workspace. The latest branch has backend plans for a local single-user desktop product and explicitly defers multi-tenancy, team permissions, hosted execution, vector search and operating-system-level sandboxing. The built-in model executor retains its fixed pipeline initially; the revised node-harness plan includes external runtimes with their own loops behind a shared execution contract.

## Technology and entry points

- Workbench: React, TypeScript, Vite, Zustand, CSS Modules, and React Flow in `projectos/workbench/`.
- Desktop: Electron main process, preload, and renderer integration in `projectos/desktop/`.
- Shared contracts and domain services: `projectos/contracts/`, `projectos/services/`, and `projectos/persistence/`.
- Sample application: Next.js, React, and Prisma in `sample-graph-saas/`.
- Product and engineering plans: `docs/`, especially `docs/features/backend/Backend-Dev-Plan.md` and `docs/features/Agent-Harness-Eval-Checklist.md`.

Typical development commands, from a fresh dependency install:

```bash
cd projectos
npm run typecheck
npm run test:unit
npm run fixtures:check      # sample fixtures consistent with the sample source
npm run fixtures:restore    # seed sample-graph-saas/.projectos from the committed mirror (add -- --force to overwrite)
```

```bash
cd projectos/workbench
npm run dev
```

```bash
cd projectos/desktop
npm run dev
```

## Current status and next gate

The Pure `graph` branch is the active starting point, not a production-ready release. Its backend plan marks implementation slices as landed; its agent harness checklist still requires desktop verification. Before broadening the platform, demonstrate one real repository change from workspace open through scoped apply, command-backed verification, interruption or restart, and review or undo. Record what succeeds and where a person still has to intervene.

The local archive, transferred investor overview, and repository transition are documented in [`TRANSFER-HANDOFF.md`](TRANSFER-HANDOFF.md). The investor-facing product vision is in [`docs/Project-OS-Investor-Overview.md`](docs/Project-OS-Investor-Overview.md).
