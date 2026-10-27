# PRD: Node Harness and Adaptable Executors

**Source:** `build_plan.md`  
**Status:** Approved for implementation by the user on 2026-10-27.  
**Project:** Project OS local-first Electron workbench.

## Product goal

Give every graph node a stable harness that can run either Project OS model execution or a compatible complete agent runtime. Let users select an executor, approve intent, observe decisions and evidence, and recover or undo work without changing graph identity or bypassing server publication rules.

## User stories

### US-001 — Reliable executor selection

As a builder, I can search and choose a configured model or compatible runtime from the composer, and that executor handles the next request.

Acceptance:

- Explicit per-request selection beats stale agent-profile and project defaults.
- The effective binding is frozen through refinement, confirmation, and child runs.
- Invalid or unavailable explicit selections fail before model calls or writes.
- Fixture/presentation execution remains visibly separate.
- Search, selected state, keyboard navigation, pending save, error recovery, and Manage action work.

### US-002 — Adapter contract

As the platform, I can run one node task through the built-in model executor or a complete runtime adapter using normalized context, events, results, cancellation, and capability declarations.

Acceptance:

- A deterministic fake runtime can request a decision, stop, report usage, and submit invalid proposals.
- Fake and model executors share scope validation and transaction publication.
- At least one real runtime transport is proven feasible before adapter assumptions spread.

### US-003 — Durable decisions, budgets, and checkpoints

As a builder, I can see why work is waiting or paused, stop it, resume valid unfinished work after restart, and understand usage against a request budget.

Acceptance:

- Decisions are idempotent and revision-checked.
- Root budget reservations cover descendants and concurrency.
- Waiting and budget exhaustion survive restart.
- Applied transactions never replay.

### US-004 — Global discovery and intent

As a builder, I receive an intent card informed by repository discovery, with affected capabilities, assumptions, exclusions, structural effects, and acceptance checks.

Acceptance:

- The master can drill down from immediate graph context.
- Repository-answerable questions are resolved without unnecessary user prompts.
- Material scope expansion pauses and creates a new decision/revision.

### US-005 — Waiting and decision UI

As a builder, I can find pending decisions from the map, chat/run inspector, or notification and see the recorded answer later.

Acceptance:

- Waiting is distinct from running, completed, and failed.
- Map badges, pending list, history, and notifications reference one persisted decision.
- Disabled notifications stay silent and stale links cannot approve superseded work.

### US-006 — Hierarchical integration

As the parent harness, I can define contracts, delegate child tasks, inspect reports, and integrate their proposals with structural, semantic, and command-backed evidence.

Acceptance:

- Matching names/arity alone cannot claim behavioral compatibility.
- Dollars/cents and failure-shape mismatches are detected by the shared fixture.
- Unresolved pre-publication failures produce no publication.
- Source and graph changes undo together.

### US-007 — Graph placement and scale

As a builder, I can use valid large and standalone graphs without artificial regrouping or invisible nodes.

Acceptance:

- Parent/child hierarchy, view membership, and dependency edges stay distinct.
- The four unattached sample nodes are inspected and placed or explicitly represented.
- The sample’s 14-component container remains valid.
- Capacity limits preserve plans and never silently publish partial work.

### US-008 — Real runtime and release evidence

As a builder, I can run the same core scenarios through the built-in executor and at least one real runtime adapter on desktop.

Acceptance:

- Planner/leaf tasks, cancellation, proposal publication, usage, recovery, and undo pass.
- Controlled multi-block and held-out multi-service scenarios pass.
- Desktop acceptance evidence covers request, decision, change, verification, restart, and undo.

## Delivery order

B0 baseline → B1 selection → B2 adapter → B3 durable state → B4 discovery/intent → B5 waiting UI → B6 integration → B7 graph placement → B8 real adapter → B9 release evidence.
