# Project Description

## What It Is

Project OS is a graph-driven AI IDE concept. It turns a codebase into a visual Project Space with a Function Map, Semantic File Tree, Agent Flow, context-aware chat, Prompt Refinement, and Debug Harness.

## Who It Serves

The first target user is a builder with little or no software-engineering experience who needs to understand or change an unfamiliar TypeScript/Next.js product. The product explains the system in product language first, then reveals technical detail gradually so users can reason at the feature level without getting lost in files, engineering jargon, chat history, or raw stack traces.

## Why It Exists

Linear chat and traditional file trees make it hard to see where a change belongs, what the AI is doing, and whether a bug fix addresses the root cause. Project OS makes codebase structure, AI execution, and debug reasoning visible and controllable.

## Current Strategy

- Rebuild from the product docs rather than extending the archived implementation.
- Use a Void fork as the preferred Electron IDE foundation, pending an adoption spike.
- Treat the MVP as a presentation-grade showcase, not a fully generalized production product.
- Keep the full-product architecture in a separate plan that extends the MVP interfaces into production local services, cloud services, database schemas, and API contracts.
- Use the Stage 1 plan to build the first complete product loop on `sample-graph-saas/` before expanding to real arbitrary projects.
- Use `sample-graph-saas/` as the controlled workspace for demonstrating development through graphs.
- Grow `sample-graph-saas/` as a small, coherent team project workspace with real Prisma-backed relations and interactions, while keeping its server-owned demo identity explicitly distinct from production authentication.
- Keep the sample's checked-in graph and semantic-tree JSON authoritative; deterministic fixture tooling may check, scaffold candidates, and byte-sync explicit mirrors but must not infer or overwrite curated product meaning.
- Keep demo behavior deterministic where needed, but preserve production-shaped schemas and service boundaries.
- Store local project state in inspectable `.projectos/` files: graph, semantic tree, current work, agent runs, and harness records.
- Model the Function Map as a beginner-guided architecture zoom (`产品全景`, `系统组成`, `功能模块`, then `内部文件`) crossed with visible software-engineering layers; at the file level, make the Chinese purpose the primary card content, keep paths secondary, and reveal specific import content/reasons progressively when a graph is dense. Keep C4 identifiers in the contract, not in the primary UI language.
- Keep files as evidence behind higher-level architectural responsibilities, then project the selected module's real files and file relationships at the internal-file level; never use the folder tree itself as graph topology.
- Keep graph/file mutations server-authoritative and atomic: node deletion derives subtree and ownership closure on the server, requires impact-aware dependency repair, and binds authorization to the graph structural revision.

## Constraints

- The MVP must showcase the full product loop reliably in a live presentation.
- The demo must not depend on network/model availability for its core path.
- The sample project must produce clear graph nodes, edges, demo diffs, and Debug Harness evidence.
- The active repo should stay focused on docs, architecture, and the sample workspace until the Void adoption spike is complete.

## Non-Goals

- The MVP does not need to support arbitrary repositories end to end.
- The MVP does not require production cloud auth, billing, sync, or team workspace features.
- The MVP does not require a universal Debug Harness.
- The archived Electron implementation is not the active build target.

## Key Decisions

- Active MVP plan: `docs/MVP-Showcase-Architecture-and-Dev-Plan.md`.
- Active full-product plan: `docs/Full-Product-Architecture-and-Dev-Plan.md`.
- Active Stage 1 execution plan: `docs/Stage-1-Whole-Product-Execution-Plan.md`.
- Active two-person MVP workload plan: `docs/MVP-Two-Person-Frontend-Backend-Workload-Plan.md`.
- Active sample project: `sample-graph-saas/`.
- Architecture-map notation requires meaningful elements (type, responsibility, technology, level, and layer) plus directed, labelled relationships with evidence.
- Every feature module owns a scoped internal graph whose nodes are real files with Chinese purpose descriptions and whose directed lines explain imports, calls, redirects, or data flow in human-readable Chinese.
- Legacy implementation and stale contracts are preserved under `archive/legacy-20260705/`.
- Presentation mode is acceptable when backed by durable local schemas and replaceable service interfaces.
- Product graph deletion uses provenance tombstones and one recoverable mixed transaction so files, repairs, edges, ownership, and semantic-tree state share one undo boundary.
