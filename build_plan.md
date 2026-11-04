# Project OS — Build Plan

**Date:** 2026-10-27; hackathon priorities revised 2026-10-29; issue/fix-plan review 2026-10-31; shipability focus 2026-11-03
**Status:** **Current priority is shipability: the whole product must work for a real person on the built desktop app.** §0 defines what that means, the contract we ship against, the measured baseline, and gates S0–S6. §15 (H0–H4) is the detailed plan for the cross-component gate S3 and remains valid beneath §0. §14 records earlier progress. Earlier B0–B9/R0–R6 release requirements are longer-term reference, not prerequisites for shipping.
**Audience:** Engineers implementing the desktop product, node harness, execution adapters, and user interface.
**Product type:** Development; local-first, single-user Electron application.

## 0. Shipability — the current priority (2026-11-03)

**Goal:** the whole product works for a real person on the built desktop app. This section outranks §§10–12 and the ordering in §15. §15 (H0–H4) is the detailed plan for gate S3 below; everything else is ordered around it.

**Definition of shippable.** A person launches the built app, opens a project, configures a model, and completes the described user experience — ask, change a file, change across components, debug, stop and undo — with honest results. Each step is proven by an *observed run of the built app*, recorded in `progress.md` with date, commit and model profile. Passing unit tests, a typecheck count, or an "implemented" label does not pass a gate by itself.

### 0.1 The contract we ship against

We do not write a new spec. The product is done when it behaves as already described in these places. The behaviours below are the ship-critical extract; the sources stay authoritative, so do not copy long-form text from them into this plan.

| Contract | Authoritative source |
|---|---|
| User experience | §1.1 success example; §4.1–4.5 (workspace, executor picker, intent card, decisions and waiting, run inspector); README demo Script A (feature change) and Script B (bug fix) |
| Agent logic | `agent-requirements.md` Part 2 (layered agents, one human gate, validation, write authorization) and Part 5 (invariants); `docs/features/Hierarchical-Agent-Protocol-Dev-Plan.md` §1 and §3; §6 of this plan (lifecycle) |
| Agent and model settings | `.projectos/settings.json` (`execution.mode`, `changeExecutionPolicy`, `thinkingDepth`, `modelProfiles`, `agentProfiles`); `projectos/contracts/agent-harness-config.ts` (permissions, sandbox, model-harness); executor selection precedence in §4.2 |
| Acceptance questions | `docs/features/Agent-Harness-Eval-Checklist.md`, the six desktop questions |

**User experience the build must exhibit**

1. The person opens a local repository, sees its graph, and can start Ask, Plan, Change or Debug from global, node or file context (§4.1).
2. The executor picker lists only models that are actually configured. A missing model shows a "configuration required" state with a Manage action; the app never silently substitutes another model or a mock (§4.2).
3. A request produces one intent card — goal, effects, assumptions, acceptance checks, and questions only where the repository cannot answer — and one approval (§4.3; `agent-requirements.md` §2.3).
4. After approval the work continues without more prompts unless its effects expand. Waiting is visible on the map and in chat, and answering resumes the same run (§4.4).
5. The run inspector shows the task tree, executor, phase, usage, proposed versus applied changes, and verification as passed, failed or not run. Success is never inferred from the agent's closing sentence (§4.5).
6. Every applied change is undoable as one task. Stop cancels without a half-applied diff. Killing the app marks the run interrupted and never re-applies files (checklist: 恢复).
7. Replies match the language of the request (`agent-requirements.md` Part 1, item 4). Errors are actionable and keep the user's request.

**Agent logic the build must exhibit**

1. Every node has a stable harness; the executor is interchangeable; a node is not a running process (§1).
2. The master starts from the immediate graph and drills down through inspect, list, read and consult. It checks the repository before asking, and asks only about missing intent (H1).
3. Planners write nothing. Only leaf agents propose changes, one file each. The renderer and the model can never widen their own write scope (`agent-requirements.md` Part 5).
4. Interface contracts exist before dependent tasks run. A consumer receives its producer's actual result. The parent checks the combined result and gets one bounded repair attempt (H2).
5. An independent validation phase precedes apply, and the server rechecks authorization and snapshot freshness. Model output is never authority.
6. Multi-file changes commit as one transaction with task-level undo, and verification is reported honestly.
7. Budgets and usage are visible and Stop works. A step that did not happen is never displayed.

**Settings the shipped build defaults to**

| Setting | Ship default | Note |
|---|---|---|
| Model profiles | At least one callable profile is required | The sample project currently has **zero**. First run must lead the user to configure one; nothing is chosen silently. |
| `execution.mode` / `changeExecutionPolicy` | `auto` / `automatic` | One human gate (the intent); `review_first` stays an optional advanced mode, off by default. |
| `thinkingDepth` | `medium` | Controls appear only where the selected adapter supports them. |
| Tool permissions | Deny > Ask > Allow; unknown shell or network asks | Sandbox is soft only (`softOnly: true`). State this in release notes; OS isolation is out of scope. |
| Verification commands | Unset means `not_run` | Never shown as passed. |
| Credentials | Held by the secret store, not in `settings.json` | Check that the first-run flow uses it. |

### 0.2 Measured baseline (2026-11-02, branch `graph` at `fe3f53f` plus uncommitted work)

| Check | Result |
|---|---|
| Desktop bundle: `cd projectos/desktop && npm run build` | **Pass** (exit 0, about 23 s); main, preload and renderer all build |
| Core typecheck: `cd projectos && npm run typecheck` | **Fail**, 120 errors (114 in source files, 6 in tests) |
| Core package build: `tsc -p tsconfig.build.json` | **Fail**, 113 errors |
| Workbench typecheck | **Fail**, 77 errors, all in source files |
| Desktop typecheck | **Fail**, 162 (main) + 174 (renderer) errors |
| Unit and agent-flow tests | Not re-run. R0 baseline (2026-10-28): 1,568 pass / 131 fail; agent-flow 90 pass / 50 fail |
| App launch with a live model request | **Not observed.** The sample project has no model profile. |

So the app bundles, but the project's own build scripts fail, and no live request has ever completed. Logs are not committed; rerun the commands above to reproduce.

**Type-error triage (core, 120).** About 43 are `exactOptionalPropertyTypes` mismatches (an `undefined` passed to an optional property) and about 12 are Node child-process typings in desktop main. Both groups are mechanical. The remaining ~65 are contract drift between schemas and their callers. Some are probably real defects. Examples to check at runtime before fixing or dismissing:

- `attachment-resolver.ts`: `attachment_unavailable` is not a `ProjectOSErrorCode`, and `omissionReason` is missing from the attachment type, so a parser may drop it.
- `agent-orchestrator/index.ts:7431`: run status `interrupted` is not accepted. `:295`: `skippedStaleCount` is missing.
- `debug-session-service.ts:64` reads `nodeId` on a global scope.
- `explicit-context-assembler.ts:3` imports an export that does not exist (`ContextAttachedPayload`).
- `project-os-local-api.ts:1587` returns the wrong type.

### 0.3 Ship gates

Each gate passes only by an observed run on the built app (see the definition above). Order: S0, then SH (the node harness, pulled forward from H5 on the owner's direction), then S1. SH comes before S1 because no live credential is available yet: with one production dispatch path, the whole flow runs on the deterministic executor now, and the live model drops into the same slot later.

| Gate | What must be true | Pass evidence |
|---|---|---|
| **S0 — It builds** | Core build, and core, workbench and desktop typechecks, are clean from a fresh install. Fix the candidate real defects in §0.2 first, then the mechanical groups. | The commands in §0.2 exit 0; `npm run build` in `projectos/desktop` still passes. |
| **SH — Node harness** | Pulled forward from H5. A task is dispatched through `NodeExecutorAdapter` with a production `createScopedHarnessHost` backed by real inspect, list, read, consult, delegate, decision and proposal-staging operations. The built-in model session and the deterministic fake both run through that exact path, the parent's executor choice is inherited by children, and swapping the registered executor changes which one runs without changing graph, node or task identities. `AgentOrchestrator` stays the only hierarchy scheduler. External CLI/SDK runtimes are still out of scope. | Observed in the running app: a request on the fake executor completes through the harness path from intent card to proposal; the same request on the built-in model path (once S1 has a credential) still behaves as before. |
| **S1 — First run** | Launch → open project → add a model profile and key → a read-only Ask returns an answer that cites a file. An empty profile list shows "configure a model", not a mock run. Demo or fixture mode is visibly separate. | Recorded manual run: app, model, project, answer. |
| **S2 — Single-file change** | Script A at file level: select file → request → intent card → approve → diff → apply → honest verification → undo. | Checklist questions 行动, 验证, 恢复 (partial). |
| **S3 — Cross-component change** | The headline demo: §15 H0–H4 (profile API plus UI example), including one question and answer that resumes the same run, and Stop. | H4 acceptance in §15. |
| **S4 — Debug and interruption** | Script B end to end. Kill the app mid-run: run shows interrupted and is not re-applied. An out-of-scope write or unknown shell command is denied or asked, with an audit event. | Checklist questions 恢复, 治理, 改进. |
| **S5 — Surface audit** | Walk every top-level surface once on the built app and record works / fixed: graph map, chat, Agent Flow, diff review and pending changes, code editor, terminal, browser, debug harness, settings, spatial captures and UI stencils, loop graph, session graph, file tree, command palette, welcome screen. Every surface ships working; none is hidden (owner decision, 2026-11-03). | A table in `progress.md`; no visible control reaches a crash or dead end. |
| **S6 — Package and install** | `npm run dist:mac` produces an app that launches on a machine without dev tooling. Data and secret locations are documented. An unsigned, un-notarized build is acceptable for now (owner decision, 2026-11-03). | Recorded run on a clean machine or user account. |

**S0 result (2026-11-04): the type and build half passes; test triage is open.** `npm run typecheck` and `npm run build` in `projectos`, `tsc -p tsconfig.json` in `workbench`, and both `tsc` configs in `desktop` all exit 0 (were 120 / 113 / 77 / 163 + 175), and `npm run build` in `desktop` still passes. Root cause of the "build is broken" feeling: the core package had no `@types/node` and compiled against a hand-written ambient shim (`validation/node-compat.d.ts`) that only worked while `@types/node` 26 leaked in through the workbench's vite import; core now declares `@types/node` ^22, the shim is excluded from the core and desktop programs, and the desktop tsconfigs list `../shared`, `../workbench/vite` and one voice file they were already importing. Real defects the diagnostics exposed and that are now fixed: `saveFileWithHistory` stored a Promise as `currentWork` (the second save threw); `getMapArtifact` rendered browser and note attachments as "undefined"; `attachment_unavailable` was not a declared error code; the attachment chips on sent messages had a remove button that threw; a constructor symbol would crash the outline; two resize handles had no value; the Agent Flow `blocked` outcome had no label. Also fixed after the owner's answers (2026-11-04): **the sample.** The graph that sample-dependent tests expect (`feat_login`, 24 nodes) existed only in the committed fixture mirror; the sample's git-ignored `.projectos` held a 7-node scan, so a fresh clone could not pass them. Added `fixtures:restore` (reconciler `restore [--force]`, which fills in missing files from the mirror and reports a graph or tree that differs) and a vitest global setup that runs it before every core test run. Restored the sample source file `projectos-blocks/loaders/dashboard.ts` that `app/dashboard/page.tsx` imports and that was never committed, removed a dead `POST` handler in `app/api/notifications/route.ts` (it did not compile: missing import, a column that does not exist; no UI path called it), and curated the fixtures for `lib/hooks/useNotifications.ts`. `fixtures:check` passes (106 managed/indexed files, 24 nodes), and in a scratch install the sample passes `tsc --noEmit` and `next build` (28 routes, `/dashboard` prerendered from a seeded database). **The sanitizer.** `sanitizeLegacyProjectGraph` now takes its allowed keys from the strict Zod schemas instead of hand-kept lists, so `authored`, `views`, owners, notes, open questions, `standalone` and `sourceKind` survive every repair and AI scan; views anchored on a missing node or with a duplicate key are dropped, file relations that lose an endpoint (or break the schema's own cross-checks) are dropped one by one instead of costing the whole graph. New `workspace-bootstrap.sanitize.test.ts` (6 tests; 5 of them fail against the old lists). Not yet observed on a live scan (that needs a model: S1). **Open for the rest of S0:** the full core run is 1709 pass / 103 fail (1812 tests; the first number now includes the validation, desktop and workbench suites, so it is not comparable with the earlier 863 / 130 over 993; none of the tests that passed before fails now). The 103 are older drift, in four groups: the R1 approval requirement (about 45; tests start a model run, or apply a run, without an approved intent), stubs written for the old intent-discovery format (5), real-preview suites that need `npm install` inside `sample-graph-saas` (27; they fail with `Cannot find module .../node_modules/prisma`, an environment gap, not a code defect), and about 25 others (missing demo scenario files, tests that poke private fields, a stale Team-mode IPC assertion, environment-bound Monaco and terminal tests). They are listed in `progress.md`; none was changed to pass. Test edits, each because the test encoded a stale assumption (reasons in `progress.md`): the reconciler's file and node counts (100 / 23 to 106 / 24), the code-diagram node name (basename by design), the work-group test (assumed an empty map), the empty-graph test helper (now also drops node-scoped map seeds), and my own SH-4 subtree test (used node ids from the 7-node scan graph). The reconciler's CSS stub now ignores `@import` and `composes:` inside comments and strings, which its own test required.

Order: S0 → SH → S1 → S2 → S3 → S4. Do S5 as each surface is touched and finish it before S6.

**SH slices (2026-11-03).** Each slice is verifiable on its own. The built-in model pipelines are not touched until SH-3.

- **SH-1 — Dispatch seam and scoped host. Done in source, with tests; not yet observed in the app.** `AgentOrchestrator` takes an `ExecutorRegistry`. A run can be bound to a registered adapter (`runtimeExecutor`; run identity `kind: "runtime"`; children inherit it). `executeRun` dispatches a leaf-file task through `NodeExecutorAdapter` with a run-bound `createScopedHarnessHost`: reads are limited to the task's allowed paths, and a proposal is staged only after the server's scope check accepts it, one per task. The run then stops at `awaiting_review`. Runtime proposals have no independent validation yet, and `requireValidatedProposal` still refuses to apply them; that invariant is kept. Planner, global, create and delete scopes, and the host's inspect, list, consult, delegate and decision operations, report "not available yet". Code: `AgentOrchestrator.runRuntimeExecutorTask`, `contracts/executor-selection.ts`.
- **SH-2 — Selection. Done in source; observed once in the Electron dev app (2026-11-04).** A request can choose a registered executor. `listExecutors` (contract → IPC → client → local API) feeds an "Agent runtime" section of the composer picker; the choice applies to Agent-mode changes only (`selectExecutorForRequest`), Ask, Plan and Debug stay on the model. For a runtime choice, `extractRequestIntent` derives a one-file intent locally (no model), the user approves it on the intent card, `prepareIntentExecution` binds the runtime to the refinement, and `confirmExecutionOnce` creates the run with `runtimeExecutor`. The other `resolveModelExecution` call sites (Ask, Plan, Debug, prompt refine) deliberately still reject a runtime with "can only change one selected file … need a model profile". The dev-only `ScriptedExecutorAdapter` (`services/harness/scripted-executor.ts`) appends one comment line saying no model was used; `createExecutorRegistry` registers it only when `!app.isPackaged` or `PROJECTOS_SCRIPTED_EXECUTOR=1`, and its label always says "dev, no model". Observed in the dev app with zero model profiles: picker lists it → intent card names it → approve → Agent Flow shows the harness steps → diff review shows the proposal → Apply is refused (no independent validation), file untouched. Known gap: the refusal reaches the user as a raw IPC error string (fix in SH-3 with the validator).
- **SH-3 — Validation and the built-in model on the harness path. Done in source (2026-11-04); the live-model half is verified only against stubs.** (a) A runtime proposal is applicable only after an independent validator model accepts it. The validator is fixed on the approved intent (`RequestIntent.validatorSnapshot`, covered by the approval hash, shown on the intent card) and judges against `intent.acceptance`, never against text the executor wrote. No validator, or a `devOnly` executor, means review-only (`diff_ready.reviewOnly`, Apply hidden, reason shown inline). An invalid verdict fails the run; a runtime executor is not restarted with feedback. (b) The built-in model's proposal now goes through the same path: `proposeThroughHarness` + `ProjectOSModelExecutor` build an `ExecutorTask`, run it with the scoped host, and stage it through the server's scope and snapshot checks (the executor's `before` must equal the file the task was given). Locate, validate, regenerate, apply, verify and the post-verify repair stay in the orchestrator pipeline. Not done on purpose: moving locate and repair behind the adapter, and reading through the host (the model still reads the file itself); both wait for a live model so they can be checked for real. Verified: full API path with a stub validator (intent → validate → apply → undo) and the existing orchestrator suite unchanged apart from one scope-check count (2 → 3).
- **SH-4 — Planner and delegation. Partly done (2026-11-04); the rest is deferred with reasons.** Done: a hierarchy child's `ExecutorTask` is identified by its qualified plan task id and carries its own interface contracts (before, `taskId` was the run id, so contracts never reached the task); the host's `listChildren` is real, paged, and limited to the task's own node and the nodes beneath it; a child run inherits its parent's runtime binding and validator (tested). Deferred, per the Opus review: `inspectNode` (a node context carries file contents beyond the task's read paths, so it needs a read-scoped projection first), `consultNode`, `requestDecision` (needs a `waiting` state and durable resume, which is H3), and `delegate` through the host for the model planner (the host contract wants authorized child runs, so a stage-only seam would be decorative until a live planner can be exercised; scaffold, deletion and greenfield plans stay off the harness). Runtime planners at the root are not possible because a runtime intent still requires a selected file. Known gap found in review: contracts a leaf inherits from its ancestors name the ancestor planner's task id, so the leaf's task filter drops them (a leaf gets only the contracts it directly produces or consumes), and a child whose parent run is no longer in memory falls back to its run id and gets none; the model path still receives them through its own context. Fix by storing the qualified task id on the child's state and adding an inherited-contracts field to `ExecutorTask`. **Gate SH is therefore not passed**: the leaf path is on the harness for both executors, planning is not.

### 0.4 Rules for this phase

- **Work only on what unblocks a gate.** No new feature slices, graph vocabulary or abstractions that no gate needs.
- **Tests are not the gate.** Keep existing tests as regression protection for ship-path code (intent, orchestrator, apply and undo, run state, workbench store). Add no new suites and set no coverage targets. When fixing a gate bug, add at most one focused regression at the point of the fix. Triage failing tests that are on the ship path; list the rest without fixing them. Do not delete tests without sign-off.
- **Evidence beats claims.** Record each gate in `progress.md` with date, commit, model profile and what was observed. Mocked output never counts. A manual run on the built app does.
- **Keep the deferrals, with one exception.** Everything in the §15.2 "Defer" column stays deferred, plus external CLI/SDK runtime adapters, shared workspaces and hosted execution. The common executor dispatch (H5) is no longer deferred; it is gate SH. The exception is "unrelated repository-wide build cleanup": S0 promotes it, because the project's own build and typecheck scripts fail today and the drift hides real defects.
- **Run full suites on a disposable copy.** The R0 baseline did, and it checked the sample project afterwards; the suites can touch the sample's `.projectos` state.

### 0.5 Decisions (owner, 2026-11-03)

1. **Live-run credentials.** Build the node harness first (gate SH). S1's live model run uses DeepSeek; the owner keeps the key in `deepseek_api.md` at the repo root (git-ignored, never committed, never copied into docs or logs). Read it only at S1. Nothing is fabricated if it is absent, and the fake executor is always labelled as such in the UI. A dev seeder already exists (`workbench/src/dev/seedDeepSeekDevProfile.ts`) and a smoke script (`projectos/scripts/deepseek-smoke-test.mts`); check both at S1 before writing new setup code.
2. **Ship target.** No signed or notarized build for now. S6 is an unsigned `dist:mac` that launches.
3. **Surfaces in scope.** Fix all of them, including spatial captures, UI stencils and the loop graph. Nothing ships hidden.
4. **Canonical sample (owner, 2026-11-04).** The sample is the curated 24-node `sample-graph-saas` graph committed as the fixture mirror in `projectos/client/sample-projectos-fixtures`. The sample's own `.projectos` is git-ignored derived state, so it is seeded from that mirror (`npm run fixtures:restore`, and automatically before every core test run) instead of being trusted to exist. The first scan of a bare folder produces a different, 7-node graph; that is what a fresh clone used to get.
5. **Graph sanitizer (owner, 2026-11-04).** `sanitizeLegacyProjectGraph` must never drop a field the graph schema defines. Fixed (see the S0 result).

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

### 2.2 Current milestone: ship the whole product, led by the hackathon demo

The governing priority is shipability (§0): the whole product works on the built app, proven gate by gate. The cross-component demo below is gate S3, not the whole goal.

Deliver the live model-driven orchestration flow in §15 first. One local process, one configured model and a small multi-component project are enough for this milestone. Complete external-runtime execution and production hardening remain future product work; neither gates the first working demonstration. Existing code changes are foundations until the actual app completes the scenario.

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

The reviewed code at `fe3f53f` contains committed model-binding, intent, decision/checkpoint, notification, and sample-view foundations. The earlier preview-file and initial-test notes described a historical checkpoint and are not the current work inventory. Preserve unrelated working-tree changes; use `git status` and the canonical progress log before edits.

The sufficiency review passed 69 focused existing tests but reproduced defects outside their coverage. Root typecheck reported 121 diagnostics; the review did not classify every diagnostic against a comparable baseline. Current evidence and problem IDs are in `problems.md`. Passing focused tests or labeling failures “baseline” does not satisfy the release gates.

Full external-runtime support and orchestration-level wait/resume remain missing. Approval callbacks and answer propagation have since been improved, but startup recovery and some mutation routes remain incomplete. Standalone visibility is implemented without compatible routing. Use the progress audit and demo-first sequence in §§14–15 to complete the working orchestration flow. Keep the earlier findings in `problems.md` as a later hardening backlog.

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

`RunDecision` contains id, project/root/run/node references, kind, question, options, recommendation, context/evidence references, revision, status, answer, and timestamps. Resolution uses an expected revision and a stable answer-request ID. An identical retry returns the persisted result; a conflicting answer, stale revision, or superseded decision is rejected. Decision records retain their original project/root/run identity.

`RunBudget` contains optional spend/token limits, active-time limit, concurrency setting, used/reserved amounts, accounting precision, and policy for exhaustion. The root owns the ledger; every descendant charges the same ledger.

`RunCheckpoint` contains approved intent revision/hash, task tree, executor bindings, completed proposals/reviews, context/graph hashes, pending decisions, usage reservations, transaction receipts, event cursor, and optional adapter resume tokens.

Persist a root execution record with its accepted request key, immutable initial approval, active approved revision, state version, task/checkpoint cursor, and pending dispatch intents. Scope-expansion revisions remain on this root; an intentional new execution requires a new request key. Answering a decision and scheduling its continuation must be one recoverable state transition, not unrelated writes to decision/checkpoint files.

Checkpoint schema versions must be explicit. Transaction receipts and executor checkpoints are separate records: a resumed agent must never replay an already-published transaction.

## 6. Runtime and state transitions

### 6.1 Request lifecycle

The mutation lifecycle below applies to Change, Debug fixes, and execution of an accepted Plan. Read-only Ask/Plan/discovery still bind an executor and consume a request budget, but require no mutation approval; converting their results into mutations enters this lifecycle.

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
5. If effects exceed it, block affected dispatch/publication, checkpoint, and create a scope-change decision with a proposed new intent revision.
6. Approval advances the same root run to the new immutable revision; it does not create a second root or reassign previous decisions. Decline ends the unapplied work. Preserve any prior receipts and their verification/undo actions.

Check the approved effect set separately from source/graph freshness. Validate current canonical paths, file identities/hashes, graph revision, and the full proposed operation group under the existing transaction lock immediately before writes. If preparation occurs earlier, repeat freshness checks under that lock. Record revisions produced by this root's own receipts as provenance; do not blindly compare every repair/resume to the original graph hash, or silently accept unrelated graph changes. Changed external facts require revalidation and renewed approval only when product effects change.

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
- Cancellation accepted before the commit boundary fences new dispatch and publication. An already committing transaction must settle or recover, and its receipt remains authoritative. Report cancellation/interruption alongside any applied changes; do not imply those changes vanished. Requests after a terminal outcome return that recorded outcome. Restarting a cancelled task requires a new execution identity.
- A crash may leave a runtime attempt's outcome unknown. Reconcile with its recorded adapter session/task identity or report interrupted/recovery-required; do not blindly retry an uncertain side effect. Guarantee one authoritative publication per transaction identity, without claiming exactly-once external computation.

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

The built-in adapter wraps the existing execution loop at the node-session boundary and may retain its internal multi-step generation/review/repair pipeline. The shared harness owns durable task state, budgets, product decisions, authorization, transaction publication, and verification receipts. `submitProposal` means accepted for validation, not written to the authoritative workspace. Evolve the current diff-only result and minimal host contracts to support typed answers, planner/delegation results, proposals, and escalations before routing every mode through them. Keep one owner for each validation and commit step; do not nest two orchestrators that can both publish. External adapters may use a different internal sequence while producing compatible task results and truthful events.

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

## 10. Full-product build sequence and completion gates (after the hackathon milestone)

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

## 12. Full-release verification commands and criteria (after the hackathon milestone)

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
- Both required execution modes pass E1–E12, with recorded evidence. A withheld adapter or failed/not-run required scenario keeps this plan incomplete; an interim model-only milestone must be labeled as such.
- No known authorization, duplicate-publication, or recovery failure.
- Real desktop evidence for request, decision, change, verification, restart, and undo.
- Updated `project_description.md`, `feature-list.md`, and `progress.md` reflecting shipped behavior and remaining limitations.
- Required typecheck/build/test checks pass in the documented supported environment. Baseline classification helps development proceed but is not a waiver for failing release checks.
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

## 14. Progress check — 2026-10-31

**We are building Project OS's project-wide agent orchestration system:** a master that understands the immediate graph, explores deeper when necessary, plans work, delegates through node harnesses, collects results, and delivers a working change. The next milestone is a convincing live demo of that loop.

This update inspected current source and the previous check results. The last H0 fix run passed **41 tests across the intent API and two workbench suites**. The preceding broader check passed 95 tests and failed one editor-buffer test; that same failure appears in the R0 baseline log. Earlier orchestration suites recorded 68 passing tests. Previously recorded core checks failed with 120 typecheck diagnostics and 113 build diagnostics; these are not fresh checks of every current edit. No tests or product-code changes were made for this planning-only review. The sample settings were inspected again and still contain zero model profiles. A complete live UI/model/app-result demonstration remains unverified.

| Capability | What exists now | What is still needed for a working demo |
|---|---|---|
| Model selection | Explicit model snapshots and inheritance through child runs. | Confirm the chosen live model handles the actual UI request and children. |
| Master and hierarchical execution | `AgentOrchestrator` has global, context/container/component and leaf pipelines. | Connect one predictable request-to-result flow across entry points. |
| Dependencies and shared contracts | Hierarchy plans carry dependencies and producer/consumer contracts. The orchestrator orders subtrees and injects contracts into model requests. | Show actual producer results reaching consumers, then review the combined output. |
| Node/file entry points | Direct components now enter the hierarchy planner. New intent records retain a selected file, and edit-only requests within that owner retain leaf-file routing. | Demonstrate both routes live; cover explicit multi-component expansion from a selected file and older stored intents. |
| Discovery | Request-intent extraction now runs an action loop for node inspection, child listing, context-listed source reads, and read-only node consultation, with duplicate-action suppression and a 24-action ceiling. | Add focused evidence for deep traversal, more than six branches, repeated-action termination, and repository-answerable questions; wire/use the same discovery path for Ask and Plan. |
| Node harness / interchangeable executors | Typed task/result schemas, registry, fake adapter and `createScopedHarnessHost` exist. Source search finds the scoped host used in tests, with no production factory or built-in adapter dispatch. | Wire the existing model session into a usable node-task interface, then exercise a second executor through that same call site. |
| Consultation and reporting | Host method signatures and child-report schemas exist. | Real consultation calls and report collection consumed by parent planning and integration. |
| Waiting and continuation | Decisions and UI surfaces exist; records can be listed and resolved. | Suspend the affected work and resume it on the same live root after an answer. |
| Applying changes and showing results | Existing diff, apply, verification, graph activity and undo mechanisms. | Complete one real cross-component request through them and show the resulting app behavior. |
| External runtime / restart recovery | Contract/fake and storage primitives. | Later milestone; neither is required to prove the first working model-driven orchestration demo. |

**Source anchors:** `projectos/services/agent-orchestrator/index.ts` (`executeRun`, `runNodePlanningPipeline`, `runHierarchyPlanningPipeline`, `completeWithTrace`); `projectos/services/project-os-local-api.ts` (`confirmExecution`, `buildPlan`, `confirmDebugFix`, `resolveRunDecision`); `projectos/services/request-intent-extraction.ts`; `projectos/services/harness/executor-adapter.ts`, `executor-registry.ts`, `hierarchy-plan-adapter.ts`; `projectos/contracts/executor-adapter.ts`.

## 15. Active hackathon build plan — make orchestration work first

**Scope note (2026-11-03):** this section is the detailed plan for ship gate S3 in §0. Where it conflicts with §0 on priority or on what counts as done, §0 wins: a gate passes on an observed run of the built app, and the S0 build gate, S1 first run and S5 surface audit are not deferred by anything below. In particular, §15.2 defers "repository-wide build cleanup"; S0 reverses that.

**This section supersedes the previous remediation-first execution order.** Safety/permission redesign, interprocess locks, transaction algorithms, crash-proof dispatch and exhaustive recovery testing are deferred. They are not dependencies for the hackathon milestone. Existing apply/undo and runtime behavior are reused as implementation infrastructure; this plan does not schedule a transaction-engine rewrite or a safety-system removal project.

### 15.1 Target demonstration and algorithm

Use one configured live model and one running Project OS process. A user opens a project, selects global or node scope, requests a change spanning two components, watches the master discover and delegate work, answers one material question if needed, and sees the resulting behavior in the app.

```text
User request + selected model + graph scope
  -> Master reads the immediate graph
  -> Inspect nodes / source / consult another node as needed
  -> Form the task plan and shared interface contracts
  -> Existing brief intent confirmation, where the flow already uses it
  -> Dispatch ready tasks through node harnesses
  -> Collect child reports and proposed changes
  -> Give dependent tasks the producer's result and shared contract
  -> Integrate, check the result, and repair a failed task when needed
  -> Apply through the existing change path
  -> Show changed behavior, task results, and actual check outcomes
```

`AgentOrchestrator` remains the scheduling owner. Reuse its run records and existing planner/leaf pipelines. The host supplies project operations; an attached executor performs a node task. An adapter must not create a second hierarchy scheduler. Node existence does not imply a permanently running agent.

**First demo scope:** existing graph, existing model provider, two cooperating components, one live request, one optional user decision, visible child work, combined changes and a final result. Start with an edit-only producer/consumer feature; node creation/deletion, graph migrations and all-graph scale are follow-up work. Both full model and external-agent execution remain the product direction; demonstrate the working model route first.

### H0 — Connect a working request path and choose the demo project

**Implement next.** This is the next coding task before more generic harness or persistence work.

**Current status (2026-10-31):** H0 remains in progress. Component routing and the Plan/Debug handoff are implemented in the working tree. The latest focused fixes preserve selected-file routing and keep a ready plan visible when run confirmation fails; 41 tests passed after those fixes. Electron startup previously succeeded, but a live model request has not been demonstrated. The sample has no configured model profile. Follow the issue-specific fix order in §15.3; do not restart transaction or lock work.

**Files:** `projectos/services/project-os-local-api.ts`, `projectos/services/agent-orchestrator/index.ts`, `projectos/workbench/src/state/workbenchStore.ts`, existing ChatPanel components; `projectos/contracts/api.ts`, client and IPC methods only where the response shape changes.

1. Launch the actual Electron development app using `cd projectos/desktop && npm run dev`. Fix installation/startup/runtime errors that prevent this demo path from running. Record a reproducible launch command; do not turn this into checkout-wide cleanup.
2. Choose a small demo repository with two clearly mapped components and real runnable behavior. A concrete target is a profile API and profile UI: request a new display-name field from the API and render it in the UI. Use a disposable demo copy; fix only the graph IDs/file mapping necessary to run that example. Select a configured model that is actually callable.
3. Trace the real ChatPanel request into `extractRequestIntent` / `prepareIntentExecution` / `confirmExecution` / `startRun`. Preserve the selected model, user answers, selected file or node, and request text. Make the first change complete through the existing diff/apply path.
4. Retain and verify the component-routing fix: new direct component requests now use `component`, while existing stored `node-plan` runs remain compatible. Demonstrate equivalent dependency/contract behavior when a component is selected directly or reached from the master. Preserve leaf-file routing for a selected-file edit; broader approved effects must use the appropriate parent planner.
5. Connect Plan → Build and Debug → Fix to that same usable execution entry. Reuse the existing intent card if required by the current route. Keep Plan ready and Debug diagnosed until a run actually starts; failures return an actionable error with the request preserved. Spatial-pin invocation can follow once this core path works.

**Done when:** the UI can start and finish a real one-file edit; the same component is executable both directly and through global planning; Plan → Build and Debug → Fix reach execution; actual gateway calls use the chosen model. Demonstrate this through normal app/API entry points, not only private helpers.

### H1 — Give the master an iterative discovery loop

**Files:** `projectos/services/request-intent-extraction.ts`, `agent-orchestrator/index.ts`, `project-os-local-api.ts`, `local-context-assembler.ts`, and existing retrieval/context schemas.

1. Replace the single six-branch follow-up with an explicit action loop. The model can request `inspect_node`, `list_children`, `read_source`, or `consult_node`, then either produce a plan or ask the user a material product question. Parse these actions into a small discriminated union and execute them through existing context services.
2. Start global work with the immediate graph and descriptions. After each action, supply the observations and accumulated facts to the next model call. Allow traversal down to components and files, plus relevant related nodes; initial context must not become a permanent depth restriction.
3. Track inspected nodes/source hashes and avoid identical repeated reads. Use a configurable round/token/time allowance for the request. When it ends, return the partial findings and a clear reason; do not silently omit branches or invent a repository fact.
4. Implement consultation as a short read-only node task using the selected executor. Pass a specific question and node context, return a compact answer with source references, and feed it to the parent. No permanent agent processes are required.
5. Reuse this discovery behavior for global requests, selected-node requests, read-only Ask and Plan. Ask the user only after repository inspection cannot resolve the remaining choice.

**Done when:** the master discovers a required second component and reads relevant source without the user naming its files; a three-level traversal and a request touching more than six branches work; repeated inspection terminates; repository-answerable questions are answered from inspected code.

### H2 — Complete delegation, report-up and integration

**Files:** `projectos/services/agent-orchestrator/index.ts`, `project-os-local-api.ts`, `harness/hierarchy-plan-adapter.ts`, `projectos/contracts/hierarchy-delegation.ts`, `executor-adapter.ts`, and existing proposal/batch-validation services.

1. Keep one root task tree using current run state. For each task retain owner node, parent, objective, dependencies, executor binding, shared contracts, state and result. Reuse existing schemas; add fields only when needed by actual dispatch or UI.
2. Route global, selected-node and file tasks through the same task semantics. Dispatch ready work under a configurable in-process concurrency limit. Preserve the complete task list; concurrency is a resource setting, not a maximum graph size.
3. Materialize the existing `ChildReport` contract in the production path. At minimum report outcome, concise summary, changed files, provided/consumed interfaces, unresolved issues and observed checks. Return reports to the parent; a schema with no production producer/consumer is not done.
4. Before a consumer starts, give it its producer's report and proposed output, as well as the shared interface contract. Use an in-memory overlay or the existing proposed-source view so consumers can see new names/payloads before files are applied. Do not force consumers to reread only the old on-disk code.
5. Have the parent review the combined proposals against the request and shared interfaces. Run an appropriate project check and use the existing repair loop for a bounded retry when it fails. Keep the failing task and explanation visible when repair cannot finish; do not claim success from a closing model sentence.
6. Apply the successful combined result using the existing implementation. Transaction/lock redesign is outside this work package. Report actual modified files and check results back to the root.

**Done when:** the profile API/UI example is planned as cooperating tasks, the consumer receives the producer's new result, the parent detects a deliberately mismatched field or units, and one repair attempt fixes it or reports a clear failure. Verify the visible app behavior after applying the combined change.

### H3 — Make waiting, answers and Stop work during a live session

**Files:** `projectos/services/agent-orchestrator/index.ts`, decision/run contracts, `project-os-local-api.ts`, `projectos/workbench/src/state/workbenchStore.ts`, ChatPanel and graph run-status projections.

1. Add a real waiting state to the active execution loop with an in-memory continuation describing the pending task and question. Show the task waiting on the map and in chat.
2. When an answer arrives, attach it to the same root/task context and continue from the saved point. Do not restart completed children or create a new root just to answer a question.
3. Surface running, waiting, completed, failed and stopped task states, with model identity and concise progress. Keep the active run's events arriving while viewing a child or an earlier decision.
4. Make Stop cancel current model work where supported and prevent scheduling further tasks. Keep the completed proposals and task history visible. If the app process exits, report the run interrupted; process-restart continuation is deferred.

**Done when:** a live cross-component request asks one question, resumes on the same root after the answer, and finishes. A second run can be stopped and schedules no further children. A waiting task cannot look completed just because its model call ended.

### H4 — Rehearse the complete hackathon demo

**Files:** the demo fixture, a short runnable scenario script where useful, and the existing UI/flow tests plus `progress.md`.

1. Start from the documented project/model configuration. Run the profile API/UI request through the actual Electron UI with a real model.
2. Capture the master finding both components, the task tree, producer/consumer ordering, shared contract, child reports, optional question/answer continuation, final change and resulting UI behavior.
3. Run one configured project check that validates the changed behavior. Keep failed and not-run results explicit. Repeat the request on a fresh demo copy to check that the demonstration is reproducible.
4. Exercise one normal failure and one Stop action so the presenter has a clear explanation when a model/tool call fails. Keep user-facing recovery simple: retry the failed task or rerun the request.
5. Record exactly what works, the startup command, model/profile requirement and remaining limitations. Fix build errors that block launching or running this chosen demo. Full core/desktop/workbench cleanup and packaging are follow-up work unless the demo needs them.

**Hackathon milestone passed:** a person can watch a real request become a coordinated cross-component change in the running app, follow the agents' work, answer a question, and inspect the working result. Passing schema/unit tests alone is insufficient; a working demo does not imply full production readiness.

### H5 — Attach executors to the working node harness

**Dependencies:** H0–H4 establish and demonstrate the live model workflow. This is the next extension after the first demo; adapter generalization must not block it.

**Files:** `projectos/services/harness/executor-adapter.ts`, `executor-registry.ts`, `fake-executor.ts`, `agent-orchestrator/index.ts`, and the relevant model/session dispatch code.

1. Wire `createScopedHarnessHost` to actual project operations for inspect/list/read/consult/delegate/decision/proposal staging. Use existing context, orchestration and result services. The host contract must have a production caller and real implementations.
2. Wrap the existing model node session in `NodeExecutorAdapter` at the point a task is dispatched. Preserve the existing generation/review/repair behavior. `AgentOrchestrator` continues to schedule the tree; the adapter returns an answer, delegation result, proposal, waiting result or failure for its task.
3. Run both the built-in model executor and deterministic fake through this exact dispatch/host path. Verify the chosen executor actually handles the task. A wrapper around one gateway call that leaves all task execution on a separate path does not satisfy this step.
4. Preserve the parent's executor choice for children. Show only usable choices in the picker. A complete external CLI/SDK runtime is the next extension after the model demo, not a prerequisite for it.

**Done when:** the same planner and leaf task contracts work through the production host with both model and fake; swapping the registered executor changes which executor runs without replacing graph/node/task identities. Existing live model demo still works after the refactor.

### 15.2 Execution order, verification and deferred work

```text
H0 working UI/API path
  -> H1 master discovery
  -> H2 child execution, reports and integration
  -> H3 live waiting/continue/Stop
  -> H4 live demo acceptance
  -> H5 common executor dispatch (next extension)
```

Use the smallest focused checks that prove each behavior. The prior 68 tests are a regression base; add or run relevant checks when changing the planner, dispatcher, propagation or live continuation. Keep the full failing check inventory visible, but do not spend the next milestone clearing unrelated diagnostics. No global coverage target, crash-injection matrix or held-out benchmark blocks this demo.

| Do now | Defer until the orchestration demo works |
|---|---|
| Working model call from the UI; master inspection; node tasks; shared contracts; producer reports; integration/repair; live waiting and Stop; actual app result | Interprocess locks, crash-safe start/dispatch journals, fsync/receipt-lineage work, exhaustive authorization matrices, transaction-engine redesign, restart recovery, multi-window reconciliation, provider spend guarantees, notification hardening, broad graph migrations/high-fan-out stress tests, full external-runtime acceptance, held-out repository evaluation, and unrelated repository-wide build cleanup |

The deferred findings remain in `problems.md` and the full-product design above. They are no longer the immediate build queue. If existing behavior prevents the ordinary demo request from running, fix that concrete blocker; do not expand it into a general hardening project. Retain the existing apply/undo infrastructure and concentrate engineering time on agent reasoning, coordination and user-visible results.

**Next implementation task:** H0. Launch the desktop development app, choose the two-component demo project, and make the normal selected-model request complete from UI to changed behavior. Then extend the master's discovery loop in H1. Do not begin another lock, journal or transaction workstream.


### 15.3 Current issues and the concrete fix plan — 2026-10-31

**Scope:** identify and plan the functional work needed for the hackathon orchestration demo. This section refines H0–H4; it does not authorize or schedule new lock, transaction or security-hardening work.

#### Already fixed in the working tree — retain, do not rebuild

- **Selected-file context was lost.** The earlier public-flow probe showed a file request becoming a component run. `RequestIntent.requestedFile`, extraction and `prepareIntentExecution` now preserve the original file/owner for edit-only intents confined to that owner. A focused regression reaches `leaf-file` execution. Multi-component expansion and legacy records still need coverage. Sources: `projectos/contracts/request-intent.ts`, `projectos/services/request-intent-extraction.ts`, `projectos/services/project-os-local-api.ts:2086`.
- **Plan Build falsely looked started after confirmation failure.** The earlier UI probe reproduced a cleared ready plan and `planConfirmed=true` despite a rejected start. `confirmRefinement` now calls `onStarted` only after server run acceptance; `confirmPlanBuild` retains the ready plan on a rejected start. A focused success test and failure regression pass. Sources: `projectos/workbench/src/state/workbenchStore.ts:3096`, `:3403`; `workbenchStore.agentConversation.test.ts`.
- **Selected components used a separate legacy pipeline.** New component requests now select the hierarchy-aware `component` scope. Keep the existing `node-plan` route only for compatibility; demonstrate this change in H0 rather than rewriting the orchestrator again.

These are focused-code results, not proof that the complete live demo works. The current changes remain uncommitted in the shared working tree.

#### Open issues

| ID / priority | Issue and evidence | Demo impact |
|---|---|---|
| D1 — First | **No configured live model or completed live scenario.** Current `sample-graph-saas/.projectos/settings.json` has zero model profiles. Electron startup previously succeeded; the browser-control service was unavailable at that time. No live request/app-result evidence exists. | A queued mocked run cannot demonstrate useful agent work. Browser-tool availability is an environment limitation, not proof of an app defect. |
| D2 — Capability gap | **A ready global plan without file targets is refused at Build.** `plan-service.ts:150` marks a plan ready when its questions are answered; `approveExistingActionIntent` requires an owned file or explicit node. The plan stays ready and reports “no graph node or existing file to build”; it does not invent write scope. H1 discovery is needed to fill this gap by identifying files before Build. | A global plan built only from prose cannot execute yet. Preserve the refusal and use H1 to resolve concrete node/file targets. |
| D3 — Implemented in worktree | **A queued in-memory root is rescheduled on retry.** The early return now persists the approval record if needed, requeues the existing root when its status is still queued, and leaves running/terminal runs alone. This has source coverage but no regression test was run in this turn. | Verify with the earlier persistence-failure reproduction; keep process-restart/multi-window handling deferred. |
| D4 — Partly fixed in worktree | **Plan status distinguishes a prepared proposal from an applied build.** `awaiting_review` now maps to `proposal_ready`; `built` is reserved for a completed/applied run. Debug → Fix uses the explicit-action intent handoff. The full normal API and UI route has not been exercised end to end. | Verify the proposal-ready badge, applied result and Debug completion in the live flow. |
| D5 — Test fixture fix in worktree | **The editor-buffer test did not reset `editorSavedBuffers`.** Cleanup now clears both editor buffer maps; the R0 copy confirms the old assertion was already failing. The fix has not been retested in this turn. | Keep the reset and confirm with the relevant workbench test when verification is next requested. |
| D6 — High / H1, implementation started | **Master discovery was shallow.** Replaced the six-branch single follow-up in `request-intent-extraction.ts` with an iterative inspect/list/read/consult/final action loop. Source reads are restricted to files returned by the server's inspected node context; repeated actions are skipped, node ids must be in the discovered neighborhood, and exhaustion is surfaced in assumptions. | Source implementation now supports deeper discovery, but behavior is not yet verified on nested and >6-branch fixtures; Ask/Plan reuse and bounded discovery telemetry remain open. |
| D7 — High / H2 | **Ordering and contracts do not yet provide full report-up integration.** Task dependencies and contract injection exist, but production consumption of structured child reports and a view of producer proposals for consumers remain incomplete. See `agent-orchestrator/index.ts` and the report schemas in `contracts/executor-adapter.ts`. | A consumer can start in the right order while still reading old source and guessing the producer's actual result. |
| D8 — High / H3 | **Resolving a stored decision is not yet a working continuation.** `project-os-local-api.ts:3500` resolves records, but the planned live-task suspension/continuation path is still unfinished. | A run can display a question without reliably continuing the same task after the answer. |
| D9 — Later / H5 | **The common adapter is still mostly a contract.** `createScopedHarnessHost`, the registry and fake exist; the built-in model session is not dispatched through a production host factory. | Important for interchangeable executors, but it must not delay the first working model-driven demo. |

#### Fix order and acceptance

**1. Establish the live demo configuration — D1, H0.**

- Reuse the existing Electron dev command. Choose one disposable demo project with two correct component/file mappings and one configured model.
- Use the current model settings UI and credential-reference mechanism. Verify availability with a small read-only request before attempting changes; do not fabricate a usable profile when credentials are absent.
- Record the exact project, model/profile and launch command. If UI automation remains unavailable, keep that limitation explicit and obtain an observed desktop run rather than substituting mocked output for live evidence.
- **Acceptance:** a prompt entered in the running app reaches the chosen model and the returned answer appears in that same run. No broad code changes are needed merely to satisfy this setup step.

**2. Close remaining ordinary H0 routing and retry gaps — D2–D5.**

- Global plans with no files remain ready and report a missing concrete target until H1 discovery finds one. Never grant a broad graph scope just to make Build pass.
- In `confirmExecutionOnce` and `maybeStartPendingOrchestratorRun`, distinguish a known queued-but-never-started root from an already running or terminal run. Reattach/schedule the queued live-session root once, preserving its ID; return the current state for running/finished work. Add the focused startup-failure/retry case. Defer process-crash and multi-window protocols.
- D3's in-memory retry behavior, D4's proposal status and D5's buffer-test reset are now edited in the working tree; retain them and get fresh focused evidence. Do not treat the old 68-test result as verification of these latest H0 edits.
- Keep the file-scope and Plan-start fixes. Add focused coverage for file-only requests, explicitly expanded requests, older intent records, failed starts, and retry after failure. Finish the real Debug handoff through its normal API; check that the selected model, target and diagnosed fix survive.
- Reuse existing run/apply states in the UI to show “proposal ready,” “changes applied” and check outcomes. Reserve any “working result” claim for the observed changed behavior. Align the Plan `built` label with those facts.
- Clear `editorSavedBuffers` in the test reset. The live select path fetches disk content for a fresh file in desktop mode.
- **Acceptance:** Change, Plan → Build and Debug → Fix each start through normal entry points; a selected-file edit stays on that file unless the user-confirmed effects expand; a failed Plan start remains retryable; a queued retry actually starts; proposed versus applied results are visibly distinct.

**3. Build iterative master reasoning — D6, H1.**

- Add the action loop already specified in H1 to the existing discovery/orchestrator services: inspect node → inspect children/source → consult if needed → update facts → plan or ask.
- Keep inspection history, return observations to the next model call, and terminate on a usable plan, a real question, an exhausted request allowance, or a clear error. Allow further pages/deeper nodes rather than treating six branches as a total limit.
- **Acceptance:** the master finds the relevant second component from a high-level request and reads its code before planning; it also handles a three-level traversal and more than six candidate branches without silent omission.

**4. Connect producer results to consumers and the parent — D7, H2.**

- Instantiate child reports in the existing run state and return them to the parent. Include outcome, summary, changed paths, interfaces, unresolved issues and actual check evidence.
- Give each dependent task the completed producer's report and proposed source view before dispatch. Keep inherited contracts attached down to the implementing leaves.
- Review the combined proposal, run an appropriate project check and use the existing bounded repair loop for one targeted correction when needed.
- **Acceptance:** the profile API/UI example uses the producer's new field consistently; a deliberately mismatched field or unit is detected and repaired or clearly reported. The final applied app behavior is observable.

**5. Connect questions to live continuation — D8, H3.**

- Keep an in-memory continuation for the waiting task on the same root. Feed the answer into its next model call and continue only remaining work.
- Keep status and Stop functional in the existing chat/map surfaces. Completed child tasks should not be rerun just because a user answered a question.
- **Acceptance:** one real question/answer interaction resumes the same root and completes; Stop prevents additional child dispatch. Process-restart continuation stays deferred.

**6. Rehearse H4, then extend H5 — D9.**

- Complete one real two-component request from UI to changed behavior and repeat it on a fresh demo copy. Keep the startup instructions and limitations in `progress.md`.
- After that succeeds, wrap the working node session with the common adapter and wire the host factory. The existing orchestrator remains the single hierarchy scheduler.
- **Acceptance:** a reproducible hackathon demonstration comes first; adapter interchangeability is the next milestone.

**Next implementation pass:** unblock H0's live request by configuring a callable model in the demo project; then add focused evidence for the new H1 action loop and connect the same discovery behavior to Ask and Plan. H1 is not complete until nested/>6-branch traversal and repetition termination are demonstrated. No test suite was run for the current discovery implementation.
