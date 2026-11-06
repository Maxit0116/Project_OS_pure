# Node Harness and Hierarchical Agent Protocol: Implementation Plan

**Status**: Revised discussion draft, 2026-10-26. Product decisions below reflect the latest user answers. Implementation sequence and adapter details are recommendations for discussion. No implementation slice has started.
**Project type**: development. Complete verified implementation slices will receive separate Lore commits; this planning task does not start them.
**Scope**: A harness around every graph node, supporting both model-backed execution and complete external agent runtimes, with hierarchical context, intent confirmation, decisions, integration evidence, budgets, and recovery.
**Related**: [Backend index](backend/Backend-Dev-Plan.md), [agent requirements](../../agent-requirements.md), [resolved questions](../../problems.md), [desktop acceptance](Agent-Harness-Eval-Checklist.md).

This revision supersedes the earlier same-day draft's global visibility restriction, fixed component-count template, universal hardcoded request budgets, and three-question limit. Existing implementation limits remain facts to migrate and test, not product architecture rules.

## 1. Agreed requirements

| Decision | Requirement |
|---|---|
| What we build | Each node exposes a stable harness. Agents and models plug into it; node identity and project structure survive changes of executor. A node does not require a permanently running process. |
| Both plug-in modes | Support models inside Project OS's execution loop and complete agent runtimes with their own loop. Use a shared execution contract and capability declarations. |
| Global agent | Starts with the immediate graph structure and main components. It may drill down, inspect repository evidence, consult nodes, and delegate as needed. Initial context is not a visibility ceiling. |
| Graph size | No arbitrary product limit on nodes, children, or agents. Execution concurrency, context windows, and transaction capacity are resource constraints managed separately. |
| Cost and time | Caller-configurable run budgets, visible usage, stop controls, and preserved progress. No universal ceiling inferred from a sample's worst case. |
| Questions | Investigate repository-answerable questions first. Ask about material missing intent; expose reasonable assumptions for minor choices. No fixed three-question product limit. |
| Human gate | Confirm intent, then execute automatically within it. Widening intent requires a new decision. Advanced diff review remains optional. |
| Waiting and decisions | Show waiting on the affected map node and offer configurable desktop notifications. Proposed interpretation of “add decisions”: one pending-decisions surface plus a durable record of answers, linked to the run and node. Exact placement remains for discussion. |
| Intent UI | Try a minimal card with goal, effects, assumptions, acceptance checks, questions when needed, and approval. Build the typed contract and mock client first. Frontend ownership is still an assignment to make. |
| Node placement | Normally connect a node through its correct parent/children. Where that is inappropriate, retain it visibly in the graph for its appropriate level. Do not invent a parent or dependency just to eliminate an orphan warning. |
| Evaluation | A small controlled multi-block fixture plus a real multi-service repository. Verify both plug-in modes against the same harness behaviors. |

## 2. Current code evidence

Paths and line numbers describe the inspected checkout, not a successful runtime test. Existing foundations are reused; unchecked behavior is verified in NH-0.

| Area | Evidence | Consequence |
|---|---|---|
| Run scopes and roles | `projectos/contracts/agent-run.ts:20`, `:57`, `:97` | Global, planners and single-file create/modify/delete leaves already have typed roles. Preserve server-owned file authorization while adding executor identity. |
| Current statuses | `projectos/contracts/agent-run.ts:10` | There is no durable waiting-for-decision or budget-paused status yet. All status consumers need migration together. |
| Global context | `projectos/services/project-os-local-api.ts:6382` | Currently filters to context-level roots and emits empty read/write path lists. Drill-down requires a real context API, not just prompt changes. |
| Model calls | `projectos/services/model-gateway/gateway.ts:64`, `:71`, `:140` | Keep the provider gateway. Complete runtime integration belongs at the execution/session boundary above it. |
| External runtime removal | `projectos/contracts/settings.ts:286`; `projectos/workbench/src/state/workbenchStore.ts:4297`, `:4321` | Migration drops old external-agent settings and UI methods are stubs. Old names do not prove a usable adapter exists. |
| Hierarchy execution | `projectos/services/agent-orchestrator/index.ts:1886`; `projectos/contracts/hierarchy-delegation.ts:32` | Extend the existing hierarchy pipeline, rather than build a second task scheduler. Current schema caps are 8 tasks, 32 leaves and 64 source plans. |
| Transactions and undo | `projectos/services/workspace-transaction-coordinator.ts:50`, `:56`, `:172`, `:233` | File and graph publication stays behind the coordinator. Imported runtime proposals need the same checks. |
| Existing budgets | `projectos/services/harness/pipeline-budget.ts:6`; `projectos/services/harness/run-usage.ts:15` | Leaf limits are currently 16 calls, 2 verification runs and 10 minutes. These do not account for a whole request tree. |
| Recovery | `projectos/services/harness/resume-policy.ts:10`; `projectos/services/project-os-local-api.ts:3008`; `projectos/services/harness/persisted-run.ts:160` | Unapplied in-memory continuation can regenerate; disk-only continuation refuses replay. Persisted logs are not sufficient resumable execution state. |
| Waiting overlay | `projectos/contracts/live-graph.ts:8`, `:19`; `projectos/services/live-graph/overlay.ts` | Waiting is an activity kind, but statuses only include running/complete/error. Add status and projection semantics together. |
| Notifications | `projectos/desktop/src/main/notifications.ts:10` | Existing notification opens ask/diff. A decision destination and preference need implementation. |
| Node placement | `projectos/contracts/graph.ts:124`, `:135`, `:231`; `projectos/services/graph-change-set-engine.ts:450`; `projectos/services/structure-graph-lint.ts:39` | Mutation currently permits only context-level roots. Explicit placement at other levels needs coordinated schema, engine, topology, view and routing changes. |
| Integration evidence | `projectos/services/code-intelligence/extract-exports.ts:31`; `projectos/services/code-intelligence/impact.ts:27` | Export extraction and impact data are useful evidence. They do not prove behavior or arbitrary cross-service payload compatibility. |

## 3. Proposed architecture

```text
Graph node + stable node harness
  context/discovery | tasks/contracts | decisions | usage | events/checkpoints
                              |
                    Execution adapter contract
                       /                  \
       Project OS model executor      External runtime adapter
                |                     (runtime owns its loop)
           ModelGateway
                       \                  /
                     typed plans/proposals/evidence
                                  |
                server validation + transaction coordinator
                                  |
                  apply, command verification, task undo
```

### 3.1 Harness and adapter boundaries

**Node harness** identifies project/node/role, exposes relevant context and discovery operations, receives tasks, routes child work, records decisions and results, and binds everything to a root request. Global/system uses the same protocol with a broader discovery role.

**Execution adapter** is a narrow service interface: inspect capabilities, start a role task, stream normalized events, stop, return typed results, and optionally checkpoint/resume. Proposed contract files are `contracts/node-harness.ts` and `contracts/agent-executor.ts`; proposed implementation directory is `services/harness/executors/`. These are future files, not existing APIs.

Capabilities include supported roles, structured planning/results, tool mediation, proposal export, cancellation, checkpoint/resume, and usage reporting. Bind an executor at run start; project defaults and per-node overrides resolve to a frozen binding. Switching mid-run is an explicit handoff with a checkpoint, not a silent settings change. A missing capability produces a clear unsupported operation; it must not masquerade as success.

The built-in model executor wraps today's execution path and retains its behavior first. An external runtime owns its reasoning/tool loop, but connects to the same node/task/result interfaces. Do not require an external runtime to imitate every internal model-call phase. Persist observed events; do not synthesize hidden reasoning or unobserved tool calls.

**Publication boundary**: preserve only-leaf source proposals and server-owned publication. The master can inspect and coordinate deeply without inheriting arbitrary direct-write authority. Prefer a runtime whose tools can be routed through the harness. If a runtime requires filesystem edits, use a private staging workspace and validate the complete resulting change set before publication. A worktree alone is not a security sandbox: the adapter spike must prove how access to the authoritative workspace is controlled. An adapter unable to satisfy the required capability remains unsupported for automatic writes. Do not restore a generic unrestricted CLI launcher and call it integrated.

Full-runtime support is part of delivery. Selecting the first real runtime and transport is a capability-spike decision in NH-1. Consult its current official documentation then; this plan makes no claim that a particular SDK already supplies interception, checkpointing, or billing guarantees. No new dependency is approved by this document.

### 3.2 Context discovery and routing

The default global bundle contains the immediate graph, main capabilities and relations. A discovery interface can expand any relevant node, inspect its children/files, retrieve current source facts, and consult a node through the harness. Responses carry node/path identities, hashes, provenance and omissions. Reads obey project boundaries and protected-path policy; they never silently create file-write authority.

Do read-only discovery before the intent card when it helps identify effects. The model proposes touched nodes; the server validates membership and calculates an execution entry. A common-ancestor calculation only resolves routing for the discovered set; it does not prove that discovery is complete. The master remains able to inspect deeper after delegating. Cross-parent work is assigned through an appropriate common coordinator.

Resolve the entry and structural impact before freezing the approved intent. Routing detail can be attached to the run without mutating an approved card. Changing approved effects creates a new intent revision. Graph/file drift on resume requires revalidation and, where meaning changes, a new decision.

### 3.3 Intent and decisions

Proposed `RequestIntent`: request/goal, touched capabilities, allowed kinds of change, structural effects, assumptions, out-of-scope items, acceptance checks, questions/answers, graph revision and immutable approval hash. Present capability names at the level useful to the user; preserve exact node ids internally. Global discovery may resolve component-level facts without forcing the user to review a file list.

Use an adapter alongside `PromptRefinement` during migration, then move both API clients, transport, store and card together. Do not reinterpret legacy refinement confirmation as an already-approved new intent.

Proposed `RunDecision`: id, root/run/node references, kind (`intent`, `scope_change`, `clarification`, `budget`), question, options, recommendation, context/evidence references, status, answer and timestamps. The initial intent and later decisions share a protocol. Existing tool-policy prompts remain separate authority checks; answering a product question cannot grant a tool permission.

The first UI has a pending-decisions list, a node waiting badge, and completed answers in run history. A notification opens the exact decision. Choosing an answer is idempotent; stale/superseded decisions cannot resume a run. An unanswered recommendation is never treated as approval. Show one focused question at a time where possible, without a fixed total of three.

### 3.4 Request budgets and progress

A root request owns configurable active-execution time, optional spend/token budgets, and local execution concurrency. Child work, consultations, retries and external-runtime use debit the same ledger. Reserve capacity before parallel dispatch and reconcile reported use afterward; do not independently give every child the entire root budget.

Time waiting for a user is separate from active execution. When a budget is reached, stop dispatch, stop or settle in-flight work according to adapter capability, persist a checkpoint, and present a budget decision. A durable transaction already committing finishes or recovers through the transaction journal; never kill it halfway to obey a wall-clock limit. Preserve existing partial verification evidence if exhaustion occurs after publication.

Checkpoint approved intent, task tree/contracts, completed proposals and validation, context hashes, pending decisions, usage reservations, transaction state, and available runtime resume tokens. Resume rechecks freshness. Reuse only still-valid results; explicitly regenerate stale or unsupported portions. Never replay an already-applied transaction. If a runtime lacks native resume, preserve harness-level progress and restart only the unfinished role task with an honest label.

Cost has precision metadata: reported, estimated, or unavailable. A hard monetary ceiling requires adapter/provider support for bounded in-flight spend or a conservative reservation. When that cannot be established, show the limitation and enforce available time/token controls; never show unknown cost as zero or promise an exact dollar ceiling.

No resource setting changes graph structure. Existing finite task/transaction caps are migrated deliberately: page planning/context, queue execution, and measure larger transaction assembly. Until a cap is lifted, report capacity before publication and retain the plan. Never silently drop nodes, split an atomic task into partial commits, or force users to reshape their architecture.

### 3.5 Delegation, consultation and integration

Each node harness can receive a task, inspect relevant context, delegate authorized child tasks, consult sibling facts, report results, and escalate discoveries. Consultation is routed, logged and read-only; a request for sibling work becomes a real delegated task. Retrieval answers are a useful first implementation. Agent-backed answers can use the same protocol when supported; neither requires permanent per-node processes.

For interacting tasks, the coordinator defines a shared contract before execution: producer/consumer ids, symbol or endpoint/payload shape, units, errors and behavior relevant to the task, and acceptance examples. The parent checks the combined proposed result and can authorize repair work inside the approved intent.

Report three distinct forms of evidence:

1. Structural/interface checks: imports, symbol identities, signatures or payload shape where the analyzer supports them. Unknown means unverified.
2. Semantic review: an independent agent checks proposals against the task and shared contract.
3. Executed verification: configured typechecks/tests/commands, with exit status and output. A dollars-versus-cents fixture must expose a mismatch even when names/arity match.

Use existing whole-tree validation and the transaction coordinator. A real new architectural dependency may add an edge in the same transaction; a consultation alone does not create an architecture edge. Failed verification remains visible and undoable, following the existing no-auto-undo policy. Retry controls are bounded by the run policy and root budget, with initial one-repair behavior retained during rollout; they do not impose a graph-size limit.

### 3.6 Graph membership and structure quality

Normally every node participates in the correct parent/child hierarchy, with reciprocal links. A legitimate standalone/root node is explicitly a member of an appropriate level's graph/view. Membership, hierarchy and dependency edges are separate concepts. Having a dependency edge alone does not establish hierarchical placement.

Proposed schema work: make graph/view membership explicit for standalone nodes using the existing architecture-view vocabulary where possible. Specify routing for nodes without a parent through their containing view and global coordinator. Update schema validation, graph mutations, topology, scan normalization, context discovery and C4 selectors together. Preserve existing supported level names initially; additional depth is a separately scoped extension if needed, not a way to satisfy numeric node quotas.

Structure checks cover missing/invalid membership, inconsistent parent/child links, cycles, missing ownership and invalid path evidence. Node count and high fan-out are descriptive metrics, not invalid architecture. Fourteen components are acceptable. Do not require an invented edge for a genuinely standalone node.

Inspect About, Contact, Pricing and Search against their source files and fixture history. Propose natural parent placement where evidence supports it; otherwise retain them in the correct level view with an explanation. Keep the authoritative fixture and explicit client mirror aligned. Structure advice proposes changes with provenance and a visible diff; it does not silently reorganize an existing project.

## 4. Implementation sequence

NH ids replace the earlier HA sequencing because support for complete runtimes adds a foundational execution boundary. Each slice below is a coherent deliverable. The steps are proposed for discussion; none is an instruction to begin coding in this planning turn.

### NH-0 — Establish the current baseline

- Inspect dependency state; run core/workbench/desktop typechecks and core unit/agent-flow tests. Record failures before new work.
- Exercise the existing leaf change, multi-file transaction, deletion undo, and interruption paths on a disposable workspace and a real model.
- Add a scenario runner that records calls, usage, active/wait time, repairs, human decisions, publication and verification separately.
- Anchor files: `projectos/package.json`, `services/agent-orchestrator/index.test.ts`, `services/project-os-local-api.test.ts`, `services/workspace-transaction-coordinator.test.ts`, and the desktop acceptance checklist.
- **Acceptance**: existing behavior is measured; failures have reproduction steps. Any baseline defect that blocks the next slice is repaired and verified before building on it. Historical test counts are not reused as fresh evidence.

### NH-1 — Prove the execution adapter boundary

- Define the minimal node task, executor capability/binding, normalized result/event and checkpoint contracts.
- Wrap the existing model execution path at a narrow seam. Avoid an unrelated rewrite of the large orchestrator.
- Build a deterministic fake external executor that completes a task, requests a decision, stops, emits usage and produces an invalid proposal.
- Run a bounded feasibility spike for one real complete runtime, verifying its current official interface and whether mediation or enforced staging is viable. Record supported roles and gaps.
- Anchor files: `contracts/agent-run.ts`, `contracts/settings.ts`, `contracts/model-gateway.ts`, `services/agent-orchestrator/index.ts`, `services/model-gateway/gateway.ts`, `services/harness/`.
- **Acceptance**: the same harness scenario runs through the model wrapper and fake runtime; unauthorized publication is rejected. The real-runtime spike proves a usable transport/control boundary before adapter assumptions spread into later slices.

### NH-2 — Durable decisions, checkpoints and root budgets

- Add decision/checkpoint contracts, persistence and request-wide usage reservations. Implement waiting/budget pause, stop, decision resolution and restart reconciliation.
- Extend every status consumer, including Loop execution, IPC clients and persisted readers, so waiting does not become completion or trigger blind regeneration.
- Update settings with budget defaults and per-run overrides; unknown cost remains visible. Keep transaction recovery independent of cancellation.
- Anchor files: `contracts/agent-run.ts`, `contracts/api.ts`, `services/harness/persisted-run.ts`, `resume-policy.ts`, `pipeline-budget.ts`, `run-usage.ts`, `services/project-os-local-api.ts`, `services/loop-runtime-service.ts`.
- **Acceptance**: parallel children cannot over-reserve a shared budget; budget exhaustion preserves proposals; a waiting run survives app restart; repeated decision answers cannot double-dispatch or double-apply; changed files invalidate only affected checkpoints; post-apply continuation never republishes.

### NH-3 — Global discovery and intent flow

- Add graph expansion/source inspection/consult operations available to the master through the harness. Expand default global context to immediate structure.
- Implement intent extraction after useful discovery, validated routing, immutable approval, and scope-change decisions using NH-2. Preserve user selections as context hints.
- Ship contracts and mock API first, then a minimal intent card integrated with the real model path. Remove old refinement consumers only after migration tests pass.
- Anchor files: `services/project-os-local-api.ts:6382`, `contracts/local-context.ts`, `services/local-context-assembler.ts`, `services/retrieval/broker.ts`, `contracts/api.ts`, `client/MockProjectOSApiClient.ts`, `client/transport/IpcTransport.ts`, `workbench/src/components/ChatPanel/PromptRefinementCard.tsx`, `workbench/src/state/workbenchStore.ts`.
- **Acceptance**: the master discovers a relevant component/file absent from its initial bundle; repository-answerable questions do not reach the user; material missing intent does; changing approved effects pauses before writes; entry resolution does not mutate the approved hash.

### NH-4 — Waiting and decisions on the map

- Add waiting status with reason and pending decision count; distinguish waiting from running, failure and completion.
- Implement a pending-decisions list and answered-decision history linked to the relevant run/node. Extend desktop notifications to open that decision, honor preferences and deduplicate delivery.
- Anchor files: `contracts/live-graph.ts`, `services/live-graph/overlay.ts`, `workbench/src/state/workbenchStore.ts`, `workbench/src/components/ChatPanel/`, `desktop/src/main/notifications.ts`, `workbench/src/notifications/`.
- **Acceptance**: a user can answer from either card/map surface; both update from the same persisted decision; restart restores pending decisions; notification opens the right decision; disabled notifications stay silent; the execution overlay never changes architecture layout.

### NH-5 — Contracts, reports and integration

- Add shared contracts, structured child reports, consultation, parent integration and repair using the adapter-neutral protocol.
- Extract facts from the combined proposed file snapshot, including newly created files, rather than only the old on-disk index. Distinguish unknown analysis from a passing match.
- Use the existing graph-change engine for actual new architectural relations; commit source/graph effects together.
- Anchor files: `contracts/hierarchy-delegation.ts`, `services/agent-orchestrator/index.ts`, `services/code-intelligence/`, `services/graph-change-set-engine.ts`, `services/workspace-transaction-coordinator.ts`.
- **Acceptance**: provider/consumer tasks receive the same contract; dollars/cents and error-shape mismatches are caught by appropriate checks; an unsupported pattern remains unverified; widening pauses; unresolved pre-commit failure writes nothing; undo restores source and graph together.

### NH-6 — Correct graph placement without numeric quotas

- Specify and implement explicit view membership for standalone nodes, reciprocal hierarchy validation and discovery/routing across such nodes.
- Inspect and repair the four sample nodes based on evidence; remove template cardinality as a reason to restructure. Cover the sample's 14-component container as a valid high-fan-out case.
- Inventory existing task/transaction limits. Replace fixed fan-out restrictions with paged planning and bounded execution where safe; test the complete proposal group before raising transaction limits. Preserve one publication transaction per task.
- Anchor files: `contracts/graph.ts`, `contracts/hierarchy-delegation.ts`, `services/structure-graph-lint.ts`, `services/graph-change-set-engine.ts`, `services/structure-graph-ai-scan.ts`, `structure-graph/prompts/structure-scan.md`, `shared/c4-architecture-views/`, `workbench/src/components/FunctionMap/c4/`, `scripts/sample-fixture-reconciler.ts`.
- **Acceptance**: correctly placed standalone nodes are visible and targetable; missing placement is flagged; invalid cycles/ownership still fail; 14 components do not trigger restructuring; more than 8 child tasks can be planned without silently omitting work; capacity exhaustion preserves the task and produces no partial publication.

### NH-7 — Ship a real full-runtime adapter

- Finish the adapter proven in NH-1; map context, delegated role tasks, proposals, usage, decisions, cancellation and supported checkpoints to the shared harness.
- Expose executor selection and capability gaps in settings. Audit legacy migration so valid new executor configuration is preserved.
- Run the same end-to-end suite with the built-in executor and the real runtime. Exercise planner and leaf roles, and a mixed-executor tree where supported.
- Anchor files: new `services/harness/executors/` adapters, `contracts/settings.ts`, `services/settings-service.ts`, `services/agent-orchestrator/index.ts`, `workbench/src/state/workbenchStore.ts` and settings UI.
- **Acceptance**: switching executor does not change node identity or publication checks; real planner/leaf tasks complete through the harness; external runtime cancellation ends child processes/work; unsupported native resume uses the explicit unfinished-task restart path; no synthetic usage/events fill capability gaps.

### NH-8 — Cross-block and desktop release evidence

- Add a small multi-block fixture with independent producer/consumer boundaries, then select a real multi-service repository for held-out evaluation.
- Run the shared scenarios below for both execution modes; record exact model/runtime versions, usage availability, duration, repairs, human decisions and outcomes.
- Complete the desktop acceptance checklist, including new waiting/decision/recovery paths.
- **Acceptance**: controlled faults reliably reproduce; real cross-block behavior has command-backed evidence; missing checks are reported; task undo and restart work through the actual desktop. A fake adapter passing is not sufficient to claim full-runtime support.

Dependency order:

```text
NH-0 -> NH-1 -> NH-2 -> NH-3 -> NH-4
                       |        |
                       +--------+--> NH-5
NH-0 -> NH-6 (coordinate graph/context contracts with NH-3)
NH-1 spike -> NH-7 (finish against NH-2/3/5 contracts)
NH-4 + NH-5 + NH-6 + NH-7 -> NH-8
```

Recommended staffing once execution is agreed: one owner for harness contracts/orchestrator/recovery; one frontend owner for intent/decisions/overlay against mocks; a separate bounded fixture/evaluation lane. Runtime spike and graph inspection can proceed in parallel with independent ownership. Do not let multiple implementers concurrently redesign the orchestrator or shared contracts.

## 5. Verification scenarios

| Scenario | Required evidence |
|---|---|
| Single-file edit | Both executor modes produce an authorized proposal, one publication and an honest verification result. |
| Multi-file within a block | Entry resolves appropriately; all proposals publish as one task; undo restores all. |
| Component bridge | Billing/notifications receive one contract; mismatch produces repair or a recorded failure. |
| Cross-block bridge | Controlled service fixture and real repo require an interface across actual blocks, not just two components in one container. |
| Add/delete | Intent shows actual structural effects; fresh dependency impact is used; graph/source undo restores both. |
| Ambiguous request | Discovery resolves code facts; material intent questions remain; assumptions are visible; no arbitrary three-question cap. |
| Scope widening | No effects outside approved intent publish before a new decision; decline leaves unapplied work unpublished. |
| Budget exhausted during parallel work | Shared reservations stop dispatch; checkpoint survives restart; spent budget is not reset by child creation or resume. |
| Stop/restart near commit | No duplicate publication; transaction journal recovery remains authoritative. |
| Large graph | A valid 14-component block stays intact; paged context/planning retains all targets; concurrency differs from graph size. |
| Standalone node | Explicit level/view membership makes it visible and routable; missing membership is diagnosed without inventing an edge. |
| External runtime gaps | Missing usage/resume/tool control is reported; unsupported operations fail before publication. |
| Decisions UI | Map, card, pending list and notifications refer to the same decision; stale answers cannot resume superseded work. |

At implementation time, run core `npm run typecheck`, `npm run test:unit`, relevant `npm run test:agent-flow`, workbench/desktop typechecks and builds for touched surfaces. Use `npm run fixtures:check` for graph fixture work. No general lint script is declared in the inspected manifests; use available TypeScript/static checks and `git diff --check`, adding no dependency solely to fabricate a lint gate. Run real desktop/model/runtime checks on disposable workspaces and record commands/results. New tests should target behavior and failure modes above.

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| External runtimes expose incompatible controls | Capability spike before a broad abstraction; one real runtime plus fake faults; explicit unsupported capabilities. |
| Direct runtime writes bypass transactions | Mediated tools or a proven controlled staging boundary; validate the entire proposed change set before publication. |
| Budget pause loses useful work | Durable checkpoint design precedes the new intent/delegation UX; freshness-aware replay and transaction identity checks. |
| Dollar limits overpromise | Reserve before dispatch; distinguish estimates/unavailable prices; advertise strict ceilings only where enforcement is demonstrable. |
| Graph membership changes break existing C4 assumptions | Versioned migration and simultaneous schema/engine/view/routing tests; maintain fixture parity. |
| Excessive abstraction delays a working product | Small adapter contract around current execution first; first real-runtime feasibility early; build one end-to-end vertical slice before broadening. |
| Longstanding docs describe outdated implementation status | This revision governs the new direction; NH-0 records fresh evidence before converting historical planned/done labels. |

## 7. Implementation discussion still needed

1. Confirm the preferred build order: adapter/capability proof, then durable decisions/budgets, then the first visible intent-to-run flow. Recommendation: this order exposes the two largest technical risks early.
2. Select the first real runtime after the capability spike. Supporting both integration modes is already agreed; this is an ordering choice, not a reduction of scope.
3. Decide where the pending-decisions list lives. Recommendation: reuse the chat/run inspector, with a map badge and a compact pending count, before adding a separate workspace area.
4. Assign frontend ownership and choose the real multi-service evaluation repository. These do not block drafting contracts or the controlled fixture.

## 8. Revision and old slice mapping

- 2026-10-26, initial discussion: hierarchical agents, single intent gate, contracts, bridge, sibling consultation and HA-0–HA-10.
- 2026-10-26, user clarification: global can inspect deeply; node harness supports both models and complete runtimes; graph size is not limited by agent counts; configurable budgets, discovery-first questions, waiting/decisions, explicit graph placement and controlled plus real evaluation.
- HA-0 maps to NH-0/NH-8; HA-1/HA-2/HA-3 to NH-3; HA-4/HA-5/HA-7/HA-9 to NH-5; HA-6 to NH-2/NH-4; HA-8 to NH-6. HA-10's extra level vocabulary remains a separate extension if required. NH-1/NH-7 are the newly explicit executor-adapter work.
- Validation of this document is documentation-only. No dependencies installed, product code changed, tests run, model/runtime invoked, or feature commit made by the planning task.
