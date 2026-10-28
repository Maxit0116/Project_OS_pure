# Project OS — Build Plan

**Date:** 2026-10-27
**Status:** Implementation specification for discussion. Writing this document does not authorize resuming code changes.
**Audience:** Engineers implementing the desktop product, node harness, execution adapters, and user interface.
**Product type:** Development; local-first, single-user Electron application.

## 1. Product outcome

Project OS lets a person understand and change software through its functional/architectural graph. The person can select a project, node, or file; describe an intended outcome; choose a model or agent runtime; confirm the intent; and follow the work through changes, decisions, verification, and undo.

The core product we build is a **stable harness around every node**. An agent is an interchangeable executor attached to that harness for a task. Creating a graph node does not start an agent process. Switching executors does not replace the graph, node identity, task history, or project knowledge.

The global/master agent begins with the immediate structure and main components. It can inspect deeper graphs, files, and relevant evidence; consult node harnesses; and delegate work. Its initial context is a useful starting view, not a restriction on how deeply it can investigate.

The release must support both:

1. **Model execution:** Project OS owns the execution loop and calls a configured model provider.
2. **Agent-runtime execution:** A compatible external agent runtime owns its loop and connects to Project OS through an adapter.

A Cursor-style picker makes these choices easy to find. It lists actual configured models and installed compatible runtime adapters. A model provider and an agent runtime are different executor types behind a common user-facing selection contract.

### 1.1 Success example

A user selects Billing and asks, “Send a receipt when payment succeeds.”

1. The master inspects Billing and discovers Notifications and notification preferences are relevant.
2. It asks only about a material product ambiguity the repository cannot answer.
3. The intent card describes the behavior, affected capabilities, structural effects, assumptions, and acceptance checks.
4. After approval, the appropriate parent creates child tasks with a shared receipt contract.
5. The selected executor performs the tasks through their node harnesses.
6. The map shows active nodes and any pending user decision.
7. Project OS validates the combined proposals and publishes the authorized source/graph changes as one recoverable task transaction.
8. The configured commands run. The result clearly distinguishes passed, failed, and not run.
9. The user can inspect the changed behavior and files, see decision history, and undo the task.

## 2. Decisions already made

These are requirements, not questions for the implementing engineer to reopen.

| Topic | Decision |
|---|---|
| Plug-in support | Both models inside our loop and complete agent runtimes through adapters. |
| Master agent | Can drill down, inspect, consult, coordinate, and delegate. |
| Graph size | No arbitrary product maximum of components, children, or agents. Context, concurrency, and transaction capacity are separate resource concerns. |
| User confirmation | Confirm intent before mutation. Continue automatically within that intent. Ask again when the intended effects materially expand. |
| Clarification | Inspect repository facts first. Ask about missing user intent. Show reasonable assumptions for minor choices. No fixed total of three questions. |
| Budget | Configurable per-request budget, visible usage, stop controls, and preserved progress. |
| Waiting | Visible on the map, with configurable desktop notifications. |
| Decisions | Make pending decisions and recorded answers accessible from the run/node. Detailed UI placement below is the proposed implementation. |
| Node placement | Normally attach to the correct parent/children. Otherwise show the node in the appropriate level's graph/view. Never hide a valid standalone node or invent a dependency to connect it. |
| Integration | Define contracts before related tasks run; inspect their combined results; report actual verification evidence. |
| Evaluation | Use a controlled multi-block fixture and a real multi-service repository. |
| Existing safety model | Server-owned authorization, leaf-scoped source proposals, recoverable transactions, and task-level undo remain the publication boundary. |

### 2.1 Initial release boundary

Build on the existing Electron/React workbench, graph, model gateway, context assembly, transaction coordinator, and run records. The first release of this plan delivers the complete request-to-result flow for both execution modes.

Cloud hosting, team accounts, billing, permanent autonomous agents at every node, arbitrary new graph-level vocabularies, and a cross-project agent fleet scheduler are outside this release. Existing Loop functionality remains supported; its statuses must understand waiting/paused runs, but this plan does not redesign the Loop editor.

## 3. Starting point and integration surfaces

Implementation lives under `projectos/`. Use these existing boundaries instead of introducing parallel systems.

| Responsibility | Existing surface | Required extension |
|---|---|---|
| Shared types and API | `contracts/`, `contracts/api.ts` | Executor, intent, decision, budget, checkpoint, and node-placement contracts. |
| Model configuration | `contracts/settings.ts`, `services/settings-service.ts` | Runtime profiles, node defaults, capability-aware selection, migration. |
| Model providers | `services/model-gateway/` | Retain provider handling; feed frozen model bindings into it. |
| Current execution | `services/agent-orchestrator/index.ts` | Adapter dispatch, inherited bindings, task coordination, checkpoints. |
| Local API | `services/project-os-local-api.ts` | Resolve choices once; serve context, decisions, task lifecycle, and projection APIs. |
| Harness infrastructure | `services/harness/` | Shared node-session interfaces, executor registry, budgets, decisions, recovery. |
| Context | `services/local-context-assembler.ts`, `services/context-assembly.ts`, `services/retrieval/` | Global drill-down, explicit discovery snapshots, consultation. |
| Code facts | `services/code-intelligence/` | Analyze proposed snapshots as well as current files. |
| Graph mutation | `services/graph-change-set-engine.ts`, `contracts/graph.ts` | Explicit graph/view membership and consistent hierarchy rules. |
| Publication and undo | `services/workspace-transaction-coordinator.ts` | Accept validated adapter proposals through the same transaction path. |
| Live map | `contracts/live-graph.ts`, `services/live-graph/`, `workbench/src/components/FunctionMap/` | Waiting/paused projections, decision references, executor identity. |
| Composer | `workbench/src/components/ChatPanel/composer/` | Searchable model/runtime picker, scope, pending selection behavior. |
| Workbench state | `workbench/src/state/workbenchStore.ts` | Carry explicit per-turn selection and consume canonical run/decision records. |
| Existing refinement UI | `workbench/src/components/ChatPanel/PromptRefinementCard.tsx` | Migrate to the intent card through a temporary compatibility adapter. |
| Client transport | `client/mock-project-os-api-client.ts`, `client/real-project-os-api-client.ts`, `client/transport/IpcTransport.ts` | Keep mock, real client, IPC validation, preload, and API contracts aligned. |
| Desktop notifications | `desktop/src/main/notifications.ts`, `workbench/src/notifications/` | Pending-decision destination, preferences, deduplication. |

### 3.1 Current implementation caveats

The earlier discussion plan is at [Hierarchical-Agent-Protocol-Dev-Plan.md](docs/features/Hierarchical-Agent-Protocol-Dev-Plan.md); user answers are recorded in [problems.md](problems.md).

Some implementation was started before the user requested this specification. The working tree contains **unfinished, uncommitted** selection-contract, model-binding, picker, and regression-test changes, plus temporary `projectos/workbench/executor-preview.html` and `.tsx` preview files. Treat those edits as a candidate implementation to review, not completed milestones. Do not overwrite unrelated existing documentation changes. Remove the temporary preview files when implementation resumes and their verification purpose is complete.

Baseline inspection found existing typecheck/test failures. The initial agent-flow command reported 59 failures and 81 passes, including sample-workspace setup failures. Three new selection-helper tests passed; two initial API regression tests failed due to test assumptions/setup and still need correction. These observations do not establish release readiness.

Full runtime support is currently missing: Pure removed old external-agent configuration. Existing interrupted-run persistence does not restore a complete executable checkpoint. Current graph mutation permits only context-level roots, so standalone nodes at other levels require real contract/view/routing work.

## 4. Product screens and behavior

### 4.1 Workspace and graph

- Open a local repository and display its project graph.
- Preserve node ids across scans when identity remains the same.
- Distinguish hierarchy, architectural dependencies, and runtime activity.
- Selecting a node focuses its description, owned resources, related nodes, and task history.
- Users can start Ask, Plan, Change, or Debug from global, node, or file context.
- Unresolved ownership is visible. A file with ambiguous ownership cannot receive write authorization until the ambiguity is resolved.
- Standalone nodes remain visible in their assigned level/view and remain valid task entry points.
- Scanning or repairing graph membership must not silently regroup nodes to meet a numerical template.

### 4.2 Executor picker

Use the existing composer control as the entry point. Opening it shows:

- Search across executor name, provider/runtime name, and model identifier.
- **Models**: configured profiles using the built-in executor.
- **Agents**: configured, installed runtime profiles supported for the current mode/role.
- Selected item, connection/capability status, and a Manage action.
- Thinking-depth controls only where the selected adapter supports them.

Selection precedence:

```text
explicit choice for this request
    -> node default
    -> project default
    -> configuration-required state
```

A project may offer “use project default” at a node without copying the current default into every node record. Resolve that reference when a new request starts.

Selecting a model must actually control the subsequent request. An old agent-profile binding must not override an explicit user choice. Capture the binding when a request is accepted, retain it through clarification/refinement/confirmation, and inherit it throughout the task tree. Changing the picker or settings affects new work.

While selection is being saved, prevent dispatch with a stale selection. On save failure, keep the prior choice and show a recoverable error. Preserve an available choice when search has no matches; an empty result is not a new selection. Support keyboard navigation, Enter, Escape, focus return, visible selected state, and a bounded scrolling list.

Do not silently choose a different executor when a profile is missing or a runtime is unavailable. Offer configure, retry, or explicit replacement. Demo/fixture execution is visibly separate from a live executor choice.

### 4.3 Intent card

Show the card after enough discovery to state useful effects. Include:

- Goal in plain language.
- Affected capabilities and why they matter.
- Add/delete/connect effects, including server-computed deletion impact where available.
- Assumptions and explicit exclusions.
- Acceptance checks describing observable behavior.
- Material open questions, presented in manageable steps.
- Chosen executor and an understandable budget summary.
- Edit, approve, and cancel actions.

The user approves product intent and effects, not a raw file list. The server retains exact identities and authorization details internally.

Resolve and validate routing before approval. Freeze the approved revision and hash. Do not change an approved card in place. New material effects produce a revised card and a linked pending decision.

### 4.4 Decisions and waiting

Proposed first UI: a **Pending decisions** section in the existing chat/run inspector, with a pending count and badges on affected nodes. The same decision can be opened from the card, run inspector, map, or notification.

Each item shows the question, reason work is waiting, relevant effects/evidence, recommended choice, alternatives, and optional free-text answer. Completed answers stay in run history.

Initial decision kinds:

- Intent approval.
- Material clarification.
- Scope expansion.
- Budget extension or stop.

Keep tool-permission requests distinct from product decisions. An intent answer does not grant shell/file/network authority.

Notifications are configurable and deduplicated by decision id. Clicking opens the exact unresolved decision. If it has already been answered, open its recorded answer rather than presenting another approval.

### 4.5 Run inspector and result

Show task tree, executor identity, active phase, elapsed active time, waiting time, usage, decisions, proposed/applied changes, and verification evidence.

Use separate facts for:

- Planned work.
- Work currently executing.
- Changes published.
- Verification passed, failed, or not run.

Never derive success from an agent's closing sentence. A published change with failing verification is shown as “changes applied; verification failed” with repair/undo actions. Undo does not automatically run merely because a test fails.

## 5. Core data contracts

Names below are proposed contracts, not claims that these APIs already exist. Use strict validated schemas consistent with the repository's Zod conventions.

### 5.1 Executor configuration and binding

```ts
type ExecutorSelection =
  | { kind: 'model'; modelProfileId: string }
  | { kind: 'runtime'; runtimeProfileId: string }

type ExecutorCapabilities = {
  modes: Array<'ask' | 'plan' | 'change' | 'debug'>
  roles: Array<'global' | 'planner' | 'leaf'>
  structuredPlans: boolean
  proposalExport: boolean
  mediatedTools: boolean
  cancellation: boolean
  nativeResume: boolean
  usage: 'reported' | 'estimated' | 'unavailable'
  thinkingDepths: Array<'off' | 'low' | 'medium' | 'high'>
}
```

`RuntimeProfile` contains id, display name, registered adapter id, adapter-version/configuration version, validated transport configuration, credential references, and enabled state. Adapter-specific schemas validate configuration. Do not accept an arbitrary executable string from model output.

`ExecutorBinding` is a server-owned snapshot containing selection, resolved configuration/version, effective capabilities, thinking settings, and the identity needed for cancellation/resume. Public metadata excludes credential material. Store credential references in protected configuration; do not copy raw secrets into run JSONL, graph nodes, or chat records.

Freeze the effective binding for the task tree. Child configuration overrides require an explicit delegation decision included in the plan; never reread mutable defaults mid-tree. Start with inheritance only; add mixed-executor child assignment after its tests exist.

### 5.2 Node harness context

`NodeHarnessContext` contains:

- Project id, node/view id, role, graph revision, and task id.
- Description, immediate parent/children, relevant relations, and file manifest.
- Current context snapshot ids, source hashes, provenance, truncation/omission information.
- Available discovery and delegation operations.
- Server authorization references, not agent-authored path grants.
- Root budget and decision references.

Global context starts with the immediate system/block graph. `inspectNode`, `listChildren`, `readSource`, and `consultNode` can expand it. Context expansion is read access; requesting a new write target creates an authorized task through the coordinator.

### 5.3 Request intent

`RequestIntent` contains id, project id, raw request, goal, touched node ids/reasons, allowed effect categories, structural effects, assumptions, exclusions, acceptance checks, questions/answers, graph revision, revision number, status, approval timestamp, and approval hash.

Structural effects distinguish proposed effects from server-derived facts. Deletion counts and dependency impact must come from current graph/source analysis. Unknown impact remains unknown.

Validate identifiers before approval. Invalid identifiers trigger repair or an actionable error; do not silently drop them and approve a narrower interpretation.

### 5.4 Tasks, contracts, and reports

`TaskRecord` contains id, root/parent ids, owner node/view, executor binding reference, objective, dependencies, acceptance checks, interface-contract ids, status, result references, and authorization reference.

`InterfaceContract` contains producer/consumer task ids, symbol/endpoint/message identity, payload or signature, meaningful units and behavior, relevant failure semantics, and executable acceptance examples when available.

`ChildReport` contains outcome, provided/consumed interfaces, changed-resource references, deterministic evidence, semantic review, deviations, unresolved questions, and escalation requests. Separate model assertions from derived facts.

### 5.5 Decisions, budgets, and checkpoints

`RunDecision` contains id, project/root/run/node references, kind, question, options, recommendation, context/evidence references, revision, status, answer, and timestamps. Resolution is an idempotent server operation using an expected revision.

`RunBudget` contains optional spend/token limits, active-time limit, concurrency setting, used/reserved amounts, accounting precision, and policy for exhaustion. The root owns the ledger; every descendant charges the same ledger.

`RunCheckpoint` contains approved intent revision/hash, task tree, executor bindings, completed proposals/reviews, context/graph hashes, pending decisions, usage reservations, transaction receipts, event cursor, and optional adapter resume tokens.

Checkpoint schema versions must be explicit. Transaction receipts and executor checkpoints are separate records: a resumed agent must never replay an already-published transaction.

## 6. Runtime and state transitions

### 6.1 Request lifecycle

```text
request
  -> resolve executor and capabilities
  -> read-only discovery
  -> draft intent / resolve material questions
  -> await intent approval
  -> plan and authorize tasks
  -> execute / consult / report / integrate
  -> validate complete proposal group
  -> publish transaction
  -> run configured verification
  -> report result with evidence and undo
```

During execution, a run may wait for a decision, pause for budget/user action, be interrupted, fail, or be cancelled. These are distinct from completion.

Keep lifecycle state, publication outcome, and verification outcome separate:

```ts
type Publication = 'not_applied' | 'applied' | 'rolled_back' | 'recovery_required'
type Verification = 'not_run' | 'running' | 'passed' | 'failed'
```

Use existing terminal states where possible; add waiting/paused states with reason and checkpoint references. Update all consumers together: run contracts, persistence, IPC, client store, Live Graph, Loop runtime, and result UI.

### 6.2 Approval and scope expansion

1. Determine scope from discovery and validate it against graph ownership.
2. Freeze the intent after approval.
3. Refine approved capabilities into per-file authorizations as tasks are planned.
4. Compare new effects with the approved intent before dispatch/publication.
5. If effects exceed it, checkpoint and create a scope-change decision.
6. Approval creates a new approved revision; decline ends the unapplied task without publication.

Changing internal routing within approved effects does not require another product decision. Adding a new capability, deletion, or structural effect outside the card does.

### 6.3 Delegation and integration

The parent creates typed child tasks. The server verifies membership and issues their authorization. Children may run concurrently under the root concurrency budget.

Before dependent tasks start, provide the same interface contract to both sides. Analyze the combined proposed snapshot, including new files, rather than comparing only old on-disk exports.

Integration evidence has three layers:

1. Deterministic structural/interface checks where supported.
2. Independent semantic review of proposals against requirements/contracts.
3. Executed commands/tests with actual results.

Name/argument-count matching alone is not behavioral verification. Include a fixture where both functions have matching signatures but disagree about dollars versus cents.

Repair stays within approved effects and remaining budget. Keep the initial bounded repair policy during migration; record attempted repairs. An unresolved pre-publication failure leaves authoritative files unchanged.

### 6.4 Pause, stop, budget exhaustion, and restart

- Reserve shared budget before dispatching concurrent work; reconcile actual usage afterward.
- Track active execution time separately from time waiting for the user.
- On exhaustion, stop new work, cancel or settle in-flight executor work according to demonstrated capabilities, and write a checkpoint.
- A transaction already committing must finish or recover through its journal. Do not terminate it halfway to enforce a timer.
- On resume, revalidate intent, graph revision, file hashes, executor availability, and transaction receipts.
- Reuse valid completed proposals. Regenerate only invalidated or unfinished work, with an explicit event.
- Where native runtime resume is unavailable, restart the unfinished role task using the harness checkpoint. Do not claim that the runtime's internal conversation resumed.
- Cancelled runs stay cancelled. Resuming a cancelled task requires a new task identity.

A monetary ceiling is strict only when the adapter/provider can bound in-flight spending or the harness can conservatively reserve it. Otherwise label cost as estimated/unavailable and expose enforceable time/token controls. Never display unknown cost as zero.

## 7. External runtime integration

Introduce the execution adapter above the model gateway, at the node-task/session boundary.

```ts
interface NodeExecutorAdapter {
  describe(): ExecutorCapabilities
  validateConfiguration(config: unknown): ValidatedExecutorConfig
  start(task: ExecutorTask, host: HarnessHost): Promise<ExecutorHandle>
}

interface ExecutorHandle {
  events: AsyncIterable<ExecutorEvent>
  result: Promise<ExecutorResult>
  cancel(reason: string): Promise<void>
  checkpoint?(): Promise<AdapterCheckpoint>
}
```

Define the referenced types in implementation. `ExecutorResult` is a validated union for answer, plan/delegation, source proposal, or escalation. Events report actual progress, tool activity, decisions, usage, and completion. Do not expose raw hidden chain-of-thought as required product data.

`HarnessHost` exposes only the operations permitted for the task/role: context discovery, consultation, delegation, decision requests, and proposal submission. The server owns authorization and publication.

The built-in adapter wraps current model execution first. Keep its independent proposal review and existing transaction behavior. External adapters may use a different internal sequence while producing compatible task results and truthful events.

For a runtime that requires native filesystem writes, use controlled staging and import its complete change set as proposals. A worktree is not filesystem confinement. Prove that the integration cannot write the authoritative workspace outside the publication path. Do not merge the staging worktree directly as a substitute for authorization/transaction checks.

Before choosing SDK versus CLI transport, inspect the runtime's current official interface and test:

- Structured task/result handling.
- Roles and tool mediation.
- Proposal export.
- Cancellation of descendants.
- Usage availability.
- Native resume behavior.
- Authoritative-workspace isolation.

Ship one complete runtime adapter first, then the next through the same contract. The picker is adaptable and does not depend on a particular vendor. Both execution modes are release requirements; a fake runtime only proves the contract, not external integration completion.

## 8. Graph placement and scaling

Maintain three separate concepts:

1. Parent/child hierarchy.
2. Membership in a level's graph/view.
3. Architectural dependency edges.

Every node must have an unambiguous placement. Normal child nodes inherit placement through a valid hierarchy. Legitimate standalone nodes receive explicit membership in an appropriate level/view. The global coordinator routes tasks across independent roots/views when no common hierarchical ancestor exists.

Extend the existing architecture-view vocabulary where possible. Update graph schemas, mutation validation, topology calculation, scanning, context discovery, C4 view selectors, and tests in one coordinated slice. Existing documents must migrate without losing ids or file ownership.

Inspect the sample's About, Contact, Pricing, and Search nodes using source evidence. Assign a natural parent if justified; otherwise give explicit level/view membership. The current sample has 14 components under `container_next_web`; this is not an error in itself.

Use pagination and bounded context expansion for large graphs. Queue executable tasks under a concurrency limit. Increase or replace current schema caps only with measured transaction and validation tests. If a request exceeds current transaction capacity, preserve the plan and report the limit before publication. Do not silently publish part of a task or alter graph structure to fit the runtime.

## 9. API, persistence, and frontend state

Add shared API methods along these lines, with exact names finalized consistently across all clients:

| Operation | Required behavior |
|---|---|
| List/probe executors | Return configured profiles and demonstrated capabilities; no implied availability from a name. |
| Save executor profile/default | Validate references and adapter configuration; preserve existing model settings through migration. |
| Discover node context | Return current, provenance-labelled snapshots with read policy applied. |
| Extract/update/approve intent | Versioned intent; idempotent approval; no mutation authority from the client. |
| Start task | Require approved intent and resolved binding; return run identity without blocking IPC for the full run. |
| Subscribe/get run | Ordered events, snapshots, and reconnect cursor. |
| List/resolve decisions | Canonical pending state; reject stale or duplicate conflicting answers. |
| Pause/stop/resume task | Use durable checkpoint and capability-aware cancellation. |
| Inspect/undo result | Reference the real transaction receipt and verification evidence. |

Extend existing run storage under `.projectos/`; do not create a parallel authority in React state. Persist critical state before acknowledging transitions. A failed checkpoint or approval write must surface as an error and must not dispatch work as if it succeeded.

Frontend stores hold projections and request status. After restart/reconnect, rebuild from server snapshots and events. Event ids/order prevent duplicate rendering or repeated notifications. Bound event/history memory without discarding the authoritative persisted record.

Existing settings and run documents must load through backward-compatible migrations. Missing executor metadata on an older run means unknown/legacy, not the model currently selected in settings.

## 10. Build sequence and completion gates

Each phase is a coherent deliverable. Review unfinished current edits against these gates before retaining them. Commit verified development slices with the project's Lore commit format.

| Phase | Deliverable | Acceptance gate |
|---|---|---|
| **B0 — Baseline** | Reproducible fixture setup, typecheck/test inventory, disposable evaluation workspace. | Baseline failures have exact reproduction and classification; shared sample state is not mutated by tests. |
| **B1 — Reliable selection** | Searchable picker; explicit per-request executor choice; immutable model binding through refinement, confirmation, and children. | Selected model wins old agent defaults; settings edits/removal cannot redirect running work; invalid/unavailable selections fail explicitly; keyboard and failure states work. |
| **B2 — Adapter contract** | Node-task interface, capability registry, built-in adapter, deterministic fake external adapter, real-runtime feasibility probe. | The same task/result contract works for both adapter kinds; fake faults cannot bypass publication checks; at least one real transport is proven feasible. |
| **B3 — Durable execution state** | Decisions, checkpoints, lifecycle migration, root budget ledger, restart reconciliation. | Waiting survives restart; shared reservations hold under concurrency; duplicate answers do not double-dispatch; applied transactions never replay. |
| **B4 — Discovery and intent** | Global drill-down, intent card, routing, scope comparison and widening decision. | Master discovers relevant deeper files; repository facts do not become unnecessary user questions; unapproved effects cannot publish. |
| **B5 — Waiting UI** | Map badges, pending-decision list/history, notification preferences and deep links. | Every surface resolves the same decision; stale links open recorded state; disabled notifications remain silent. |
| **B6 — Hierarchical integration** | Typed delegation, consultation, shared contracts, child reports, integration/repair evidence. | Producer/consumer tests pass; semantic mismatch is detected; unknown checks remain unverified; unresolved pre-commit failures publish nothing. |
| **B7 — Graph placement** | Explicit standalone membership, sample corrections, migration, view/routing support, paged high-fan-out planning. | Standalone nodes are visible/targetable; cycles and ownership errors still fail; 14 components remain valid; no silent target omission. |
| **B8 — Real agent adapter** | Complete supported runtime through common harness, settings and picker. | Real planner/leaf tasks, cancellation, proposal publication, usage and supported recovery pass the shared suite. |
| **B9 — Release evidence** | Controlled and held-out cross-block runs, desktop acceptance, documentation and operational errors. | Both modes pass the end-to-end scenarios; failed/not-run verification stays honest; task undo and restart are demonstrated. |

Recommended order:

```text
B0 -> B1 -> B2 -> B3 -> B4 -> B5
                       |      |
                       +------+--> B6
B0 -> B7 (align graph/context contracts with B4)
B2 runtime probe -> B8 (complete against B3/B4/B6)
B5 + B6 + B7 + B8 -> B9
```

The first visible milestone is B1: pick a model, send a request, verify the chosen model actually handles it, and retain that choice through child work. B1 alone does not claim external-runtime support or completion of the node-harness product.

### 10.1 Suggested engineering ownership

- **Harness/backend owner:** contracts, API, executor dispatch, authorization boundary, state machine, checkpoints, budgets.
- **Workbench owner:** picker, intent, decisions, map projections, notifications, keyboard/responsive states.
- **Graph/evaluation owner:** placement migration, fixtures, scenario runner, held-out repository evidence.

A single engineer may do these sequentially. With parallel implementation, freeze shared contracts first and keep one owner for the orchestrator. Frontend can work against a mock client; fake success must never be counted as backend acceptance.

## 11. Test plan

### 11.1 Contract and unit tests

- Reject malformed executor selections and unknown runtime/profile references.
- Load legacy settings/runs without fabricated executor identity.
- Resolve explicit > node > project precedence.
- Clone/freeze model configuration and thinking settings.
- Preserve parent binding after defaults or profiles change.
- Validate membership, reciprocal hierarchy, cycles, dangling references, and ownership.
- Validate immutable intent revisions and idempotent decision resolution.
- Reserve/reconcile budget atomically across concurrent children.
- Distinguish structural evidence, semantic review, and executed verification.

### 11.2 Service integration tests

- Start Ask/Plan/Change/Debug with an explicit choice and inspect actual gateway/adapter calls.
- Change settings between refinement and confirmation: the original binding remains.
- Change settings during parent execution: children inherit the original binding.
- Continue plan clarification and debug phases without silently switching executor.
- Pause for scope or budget, restart the process, answer, and resume only valid unfinished work.
- Edit source while paused: stale proposals cannot publish.
- Cancel during generation and near publication: no unauthorized or duplicate writes.
- Import a runtime proposal outside scope: reject it before publication.
- Apply source plus graph changes, then undo both through one task receipt.

### 11.3 Browser and desktop tests

- Picker search by label/provider/model; empty results; current selection; loading/error; keyboard navigation; focus return; long names; small window.
- Choosing a model while a run is active affects the next request only.
- Intent editing, material questions, approval, cancellation, and revised scope.
- Waiting badge, pending count, decision list, answer history, and notification navigation.
- Correct result labels for applied/failed-verification/not-run states.
- Desktop restart restores pending work and decisions from canonical storage.

Use the real desktop for IPC/filesystem acceptance. An isolated browser component preview is useful for UI validation but cannot prove desktop execution.

### 11.4 End-to-end scenario matrix

Run against the model executor and at least one real runtime adapter. Record versions, configuration, usage precision, active/wait time, repair count, human decisions, publication outcome, and verification evidence.

| ID | Scenario | Required result |
|---|---|---|
| E1 | One-file heading change | One authorized proposal, one publication, actual verification result, working undo. |
| E2 | Multi-file change in one block | Correct entry, complete group validation, atomic task publication/undo. |
| E3 | Billing-to-notifications interface | Shared contract; correct payload semantics; no success inferred from signatures alone. |
| E4 | Real cross-service change | Producer/consumer integration on controlled fixture and held-out repository. |
| E5 | Add/delete component | Intent describes effects; fresh dependency impact; source/graph consistency and undo. |
| E6 | Ambiguous request | Useful discovery first; material user questions; explicit assumptions. |
| E7 | Scope grows mid-run | Checkpoint and revised intent; no outside effects before approval. |
| E8 | Budget exhaustion with parallel children | Shared accounting; no new dispatch; preserved progress; explicit continuation. |
| E9 | App/runtime interruption | No double publication; honest resume/restart behavior. |
| E10 | Large or standalone-node graph | All targets remain visible/routable; no artificial regrouping or silent omission. |
| E11 | Missing runtime capability | Clear unsupported operation; no fallback to another executor. |
| E12 | Stale/duplicate decision | No double execution and no approval of a superseded intent. |

## 12. Verification commands and release criteria

From `projectos/`, use the existing scripts:

```sh
npm run typecheck
npm run test:unit
npm run test:agent-flow
npm run build
```

For touched frontend/desktop surfaces, run their `typecheck` and `build` scripts. Run `npm run fixtures:check` for fixture changes, and `git diff --check` for each slice. There is no general lint script in the inspected manifests; use the existing static checks rather than introducing a dependency just to create a nominal lint step.

Run tests against disposable workspaces with explicit fixtures. Establish setup before interpreting fixture-related failures. Keep baseline and current results separately. Do not weaken unrelated tests to obtain a green report, and do not describe a dirty baseline as fully verified.

Release requires:

- Both execution modes working through the shared harness.
- All specified acceptance scenarios passed or a clearly scoped feature withheld with an explicit reason.
- No known authorization, duplicate-publication, or recovery failure.
- Real desktop evidence for request, decision, change, verification, restart, and undo.
- Updated `project_description.md`, `feature-list.md`, and `progress.md` reflecting shipped behavior and remaining limitations.
- Feature commits containing implementation, behavioral tests/evidence, and relevant documentation.

## 13. Implementation choices and risks

| Choice or risk | Required engineering response |
|---|---|
| First runtime vendor/transport | Prove capabilities against its current official interface in B2; select the adapter that can satisfy publication/cancellation requirements. Keep the registry vendor-independent. |
| External runtime can bypass controlled publication | Require demonstrated tool mediation or controlled staging. Do not enable automatic editing for an adapter that cannot uphold the boundary. |
| Weak or unavailable usage reporting | Label precision and enforce only demonstrable limits. |
| Checkpoint contains sensitive content | Apply existing project storage/access rules and redaction; never retain raw credentials or hidden reasoning. |
| Broad changes to a large orchestrator | Introduce a small execution boundary, preserve behavior with tests, and extract only the necessary responsibility per slice. |
| Graph membership migration | Version schema changes and test schema/engine/topology/views together. |
| Selection races and mutable settings | Bind at request acceptance, serialize selection saves, inherit the binding, and reject unavailable explicit choices. |
| UI appears complete while runtime is incomplete | Show only usable executors; keep capability/status evidence separate from marketing labels. |

## 14. Implementation status (2026-10-28)

This status records the current code evidence; it does not relax the phase acceptance gates above.

| Phase | Current status | Remaining acceptance evidence |
|---|---|---|
| **B0 — Baseline** | Partial | Failure inventory exists, but disposable evaluation setup and full baseline classification are not complete. |
| **B1 — Reliable selection** | Implemented foundation | Explicit model binding is frozen through refinement and child execution; full keyboard, persistence-failure and desktop acceptance still need a fresh run. |
| **B2 — Adapter contract** | Contract and deterministic fake implemented | Built-in model adapter does not yet use the common adapter contract; no real-runtime transport has passed the shared suite. |
| **B3 — Durable execution state** | Storage primitives implemented | Waiting is not integrated into the run lifecycle; restart reconciliation and idempotent dispatch/publication recovery are not demonstrated. |
| **B4 — Discovery and intent** | Partial | Global intent extraction drills into selected branches, presents an approval card, gates delegated file scope, and rechecks intent/graph hashes plus scaffold/deletion effects before apply. Scope-widening revisions and the complete publication-path test matrix remain open. |
| **B5 — Waiting UI** | Partial | Chat list/history and map waiting badges use persisted decisions. Decision notifications, preferences/deep links and stale-link acceptance remain open. |
| **B6 — Hierarchical integration** | Existing foundations | Contract-first producer/consumer fixture and controlled plus held-out cross-block semantic evidence remain open. |
| **B7 — Graph placement** | Partial | Four sample capabilities are explicitly standalone and appear in the root context projection; schema migration, view/routing coverage and high-fan-out paging remain open. |
| **B8 — Real agent adapter** | Not started | No selectable production runtime adapter is connected to node tasks and common publication/recovery behavior. |
| **B9 — Release evidence** | Not started | No complete desktop run/restart/undo matrix or held-out repository report exists. |

The current checkout also has unrelated pre-existing TypeScript diagnostics and user-authored working-tree changes. Verification must distinguish those from errors in the node-harness files and must not stage unrelated workspace edits.

Default UI placement, schema names, and phase order above are concrete recommendations that an engineer can implement. The remaining practical assignments are the first runtime adapter, frontend ownership, and held-out repository. They do not block B0/B1, and they do not change the agreed requirement to support both plug-in modes.
