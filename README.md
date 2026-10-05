# Project OS

Project OS is being rebuilt from the product docs into a graph-driven AI IDE. The current repo is organized around the MVP showcase, the full-product architecture plan, and the small sample workspace that will demonstrate development through graphs.

Canonical project memory:

- [project_description.md](project_description.md)
- [feature-list.md](feature-list.md)
- [progress.md](progress.md)

## Active Structure

```
ProjectOS/
├── docs/                 # Active product docs, MVP plan, and full-product architecture
├── projectos/            # P0 workbench, contracts, and mock API client
├── sample-graph-saas/    # Small sample app used to demonstrate graph-driven development
└── archive/              # Legacy code and stale implementation contracts, kept for reference
```

## Active Docs

- [Product PRD](docs/Product-PRD.md) — long-term product direction.
- [MVP PRD](docs/MVP-PRD.md) — product requirements for the MVP concept.
- [MVP Showcase Architecture and Dev Plan](docs/MVP-Showcase-Architecture-and-Dev-Plan.md) — current execution plan for the presentation-grade MVP.
- [Full Product Architecture and Dev Plan](docs/Full-Product-Architecture-and-Dev-Plan.md) — production architecture, schemas, interfaces, milestones, and migration path after the showcase.
- [Stage 1 Whole Product Execution Plan](docs/Stage-1-Whole-Product-Execution-Plan.md) — detailed plan for building the first complete product loop on the sample workspace.
- [MVP Frontend/Backend Two-Person Workload Plan](docs/MVP-Two-Person-Frontend-Backend-Workload-Plan.md) — 两人执行分工、接口对齐、mock/real integration 和沟通协议。
- [Sample Fixture Reconciler](docs/Sample-Fixture-Reconciler.md) — authoritative fixture workflow, deterministic checks/scaffolding, and exact mirror sync.
- [Team Cooperation Mode PRD](docs/Team-Cooperation-Mode-PRD.md) — async-first team collaboration around the function map (handoff, acceptance, team memory).
- [Team Cooperation Mode Architecture](docs/Team-Cooperation-Mode-Architecture.md) — collab object model, `.projectos` persistence, and API boundaries.
- [Team Cooperation Mode Dev Plan](docs/Team-Cooperation-Mode-Dev-Plan.md) — slices 0–4; Slice 1 (two-person handoff loop) is the implementation gate.

## MVP Direction

The MVP is a presentation-grade showcase, not a fully generalized production build. It should show the full Project OS promise in one controlled path:

- open a sample codebase;
- render a Function Map and Semantic File Tree;
- select graph nodes to switch AI context;
- show Prompt Refinement before execution;
- stream an Agent Flow;
- preview a code diff;
- trigger a seeded bug;
- show Debug Harness root-cause reasoning and recovery.

The preferred shell is a fork of Void, used as the Electron IDE foundation. Project OS will add first-party graph, context, agent-flow, and harness surfaces on top.

## P0 Workbench (Frontend)

Standalone React workbench with mock API — Function Map, Semantic File Tree, and Chat context header.

```bash
cd projectos/workbench
npm install
npm run dev
```

Open http://localhost:5173 and click **Open Sample Workspace**.

See [projectos/README.md](projectos/README.md) for structure and mock/real client notes.

## Sample Project

`sample-graph-saas/` is the active demo workspace. It is intentionally small and should be shaped to produce clear graph nodes, edges, demo diffs, and Debug Harness evidence.

Its graph and semantic-tree JSON remain hand-reviewed source of truth. Before
adding sample source files, follow the
[fixture reconciler workflow](docs/Sample-Fixture-Reconciler.md) so the
authoritative fixtures, client mirrors, and editor source universe advance in
one slice.

From the sample project:

```bash
cd sample-graph-saas
npm install
npm run dev
```

## Archive

`archive/legacy-20260705/` contains the previous Electron implementation, standalone MVP implementation, and older implementation-contract docs. These are no longer active surfaces for the rebuild, but they are preserved for reference.
