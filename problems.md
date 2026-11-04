# Node harness implementation problems

**Priority update — 2026-10-29:** These review findings are retained as a backlog. The current hackathon milestone prioritizes the working agent orchestration demo in [`build_plan.md` §15](build_plan.md#15-active-hackathon-build-plan--make-orchestration-work-first); lock, transaction, recovery and broad hardening work do not gate that milestone.

## Sufficiency review — 2026-10-28

**Verdict: insufficient against `build_plan.md`; request changes.** Reviewed implementation at `fe3f53f`. There are useful model-selection, intent, persistence, and waiting-UI foundations, but several acceptance gates remain unimplemented and the implemented paths contain correctness defects. Passing isolated tests does not establish completion of B0–B9.

Remediation sequence and exit criteria: [`build_plan.md` §15](build_plan.md#15-active-hackathon-build-plan--make-orchestration-work-first).

This was a review and documentation task. Product source was not changed. Existing planning decisions are preserved below. Findings distinguish executable reproductions, source-traced defects, missing implementation, and missing acceptance evidence.

### P1 — HIGH: automatic publication bypasses the approved-intent guard (B4)

**Evidence:** `projectos/services/project-os-local-api.ts:3503` defines `assertApprovedIntentAllowsPublication`, whose sole call is in `applyDiff` at line 3566. Constructor callbacks at lines 765–812 wire automatic leaf/group/tree/scaffold/deletion execution directly to transaction methods. `projectos/services/agent-orchestrator/index.ts:3220`, `:3256`, `:3770`, and `:5800` invoke those callbacks. The structural transaction methods do not call the intent guard. Existing scope/identity/transaction checks still exist, but they do not substitute for approval of the requested product effects.

**Consequence:** the default automatic execution route does not enforce the newly added publication-time intent/hash/effect checks. In particular, a structurally valid scaffold or deletion can reach its transaction path without proving that its structural effect was approved. The manual guard also skips `create` files and checks scaffold parent/name without checking all wiring effects.

**Required:** enforce intent capabilities in shared transaction preparation/commit boundaries used by both automatic and review-first execution. Cover additions, deletion impact, wiring, source changes, graph freshness, and repairs. Add integration tests that request an unapproved structural change and assert no source or graph publication in either execution policy. This finding is established by call-path inspection, not by performing a destructive end-to-end write.

### P2 — HIGH: repeated confirmation starts duplicate roots and overwrites approval history (B3/B4, E12)

**Evidence / reproduction:** with a disposable mock workspace and dispatch suppressed, extract → approve → prepare once, then call `confirmExecution(refinement.id)` twice. Both calls succeed with different run IDs. `confirmExecution` (`project-os-local-api.ts:3028`) generates a fresh UUID each time and does not consume or durably bind the approved revision to its root run. Both calls save `decision_${intent.id}_approval` (`:3134`) under the same storage filename; the second replaces the first root's approval record. Listing decisions for the first root returns zero records and the second returns one. The review probe reproduced all three observations.

**Required:** atomically bind `(projectId, intentId, revision)` to one durable root run and return that run on retries/concurrent confirmation. Prevent historical decision records from being reassigned. Verify concurrent clicks, network retries, and restart between acceptance and dispatch. Do not rely only on disabling a renderer button.

### P3 — HIGH: approved clarification answers do not reach the executable task (B4, E6)

**Evidence / reproduction:** approve a material answer such as “Send exclusively to receipts@review.example,” then prepare execution. `prepareIntentExecution` (`project-os-local-api.ts:2064`) builds its prompt from goal, touches, assumptions, exclusions, and acceptance, omitting `questions[].answer` and `selectedOptionId`. The probe inspected the stored refinement and confirmed the chosen address was absent. The orchestrator stores `approvedIntent` but its current references do not render the approved questions/answers into model task input.

**Consequence:** a user can answer the required intent-card question and the subsequent agent can still act without that decision.

**Required:** carry the approved answers into the immutable execution context and delegated task context, preserving option ID and actual answer. Test the actual downstream gateway request, not just the approval response.

### P4 — HIGH: runtime-neutral execution is still disconnected scaffolding (B2/B8)

**Evidence:** `services/harness/executor-adapter.ts`, `executor-registry.ts`, and `fake-executor.ts` define a contract/registry/fake. Production orchestration continues through `ModelGateway`. There is no built-in adapter dispatching the existing pipeline through the common contract, nor a production complete-runtime adapter. `services/harness/executor-selection.ts:35` rejects every runtime selection as not installed. The picker remains based on model profiles.

**Required:** connect both a built-in model adapter and a real runtime adapter to the same node-task host; add versioned runtime settings, capability-aware selection, frozen binding, cancellation, usage, and controlled proposal publication. Run the shared suite through both modes. The prior CLI login/sandbox probe failures block live transport validation; they do not explain away the missing integration code.

### P5 — HIGH: waiting, shared budgets, and restart recovery are not integrated into execution (B3, E7–E9)

**Evidence:** `RootBudgetLedger` is implemented/tested in `services/harness/durable-run-state.ts` but has no production orchestration caller. The active pipeline still uses per-leaf hardcoded limits in `services/harness/pipeline-budget.ts`. `recordRunDecision`/`recordRunCheckpoint` and `resolveRunDecision` (`project-os-local-api.ts:3304–3349`) persist records but do not checkpoint/suspend/resume the active task or reserve/reconcile descendant execution. `contracts/agent-run.ts` has an optional wait-state object but no integrated awaiting-decision lifecycle. `continueAgentRun` (`:3241`) explicitly refuses execution restoration for disk-only runs.

**Required:** wire durable decisions, caller budgets, shared reservations, executor/task continuation, and transaction receipts into the actual dispatch state machine. Recover a waiting run after process restart, apply an answer once, revalidate source/graph freshness, and resume only unfinished work. A store reload test demonstrates persistence, not resumable execution. Scope widening must produce a revised intent/decision rather than only throwing a scope error.

### P6 — HIGH: standalone nodes are visible but still cannot execute as supported targets (B7, E10)

**Evidence:** the four sample nodes are marked `standalone: true` without a level or parent. `workbench/.../FunctionMap/architectureView.ts:394` displays them in the context view. However `isNodeAgentArchitectureLevel` (`:38`) and `confirmExecution` (`project-os-local-api.ts:3059`) accept only context/container/component planners. `createHierarchyChildRuns` (`:7974–8028`) requires immediate children at a specific next level. `request-intent-service.ts` builds routing chains only from leveled nodes. `graph-change-set-engine.ts:468` still forbids leveled non-context roots.

**Required:** define explicit membership at the appropriate graph level, migrate/validate existing graphs, and make UI selection, intent routing, child delegation, and graph mutation agree. Prove a real change targeting each sample standalone capability through normal public APIs. Visibility alone does not meet the plan's targetability requirement.

### P7 — HIGH: hierarchy capacity still limits whole plans without paging/checkpoint continuation (B7)

**Evidence:** `contracts/hierarchy-delegation.ts:43` limits each plan to 8 tasks and `:66` limits a whole-tree transaction to 32 leaves. The sample container has 14 components. These limits are not a scheduler that pages a complete logical plan; no continuation protocol for all requested targets was found in the reviewed hierarchy execution paths.

**Required:** retain complete requested target membership, page dispatch using a resource budget, and preserve continuation state. Test a request touching all 14 components plus a graph exceeding the current leaf cap. Explicit safe rejection is preferable to partial publication, but it still does not satisfy the planned large-graph workflow. This review does not claim an observed silent omission.

### P8 — MEDIUM: discovery performs one fixed drill-down round and skips component source inspection (B4)

**Evidence:** `services/request-intent-extraction.ts:71–89` inspects only context/container touches with children, silently takes the first six, and performs at most one follow-up model call. Component touches do not trigger source inspection. The system prompt still limits IDs to the immediate graph even in the follow-up request. Its structural-output description lists operation-name strings although the parser requires structured objects.

**Required:** provide budgeted iterative inspection through relevant descendants/files, expose incomplete discovery explicitly, and provide the actual structured output contract. Test a repository-answerable question at component/file depth and a request involving more than six branches; verify relevant files are actually supplied before asking the user.

### P9 — HIGH: decision loading and notification navigation can corrupt active-run state (B5)

**Evidence / reproduction:** `workbench/src/state/workbenchStore.ts:3604` checks only project identity after awaiting `listRunDecisions`; it does not check the requested root or request generation. A deferred-response probe loaded root A, switched to root B, then released A's response: B remained active while its panel displayed A's decisions. With alerts enabled, `notifyPendingDecision` (`:1436`) can also set `activeRunId` back to A. `navigateFromAgentNotification` (`:1641`) replaces `activeRunId` without loading corresponding run traces/diffs or replacing the execution subscription; `isCurrentRunSubscription` (`:3142`) then suppresses events from the previously active run.

**Required:** separate the inspected decision/run from the executing run. Fence responses by project, root, and request generation; load historical run context consistently; keep active execution subscriptions intact when inspecting old alerts. Add race tests and a test that clicks a historical alert while another run continues streaming.

### P10 — MEDIUM: event-throttled decision refresh can miss the final waiting decision (B5)

**Evidence:** `refreshRunDecisionsIfDue` (`workbenchStore.ts:3150`) is only invoked by run events, drops refreshes inside its 1.5-second window, and schedules no trailing refresh. The reviewed execution event contract has no wired canonical decision-created event. A decision persisted after an earlier fetch, followed by an event within the throttle window and then silence while waiting, has no guaranteed refresh. Notification payloads also contain no project identity, so cross-workspace alert routing is not established.

**Required:** use a persisted decision event or reliable trailing/polling refresh with teardown, retain project/root identity on links, and test a quiet waiting run plus workspace switching and desktop restart. Current notification tests exercise direct loading and payload validation, not this delivery lifecycle.

### P11 — MEDIUM: the fake adapter does not satisfy its cancellation capability claim (B2)

**Evidence / reproduction:** `services/harness/fake-executor.ts:65–109` starts its async work before returning the handle and checks cancellation only before host submission. Hold `host.submitProposal` pending, call `handle.cancel("stop")`, then resolve the host submission as accepted: the result is still `completed`. The temporary review probe reproduced this. Cancellation while awaiting a decision likewise has no post-await check. The adapter advertises reported usage without emitting usage events.

**Required:** define cancellation and publication semantics explicitly, make cancellation observable at asynchronous boundaries, close event streams on failure, and report capability/usage precision honestly. Add shared tests for pre-dispatch, in-flight host calls, and post-publication cancellation before using the fake as runtime acceptance evidence.

### P12 — HIGH: integration and release gates are not demonstrated (B0/B6/B9)

**Evidence:** hierarchy task contracts contain objective/acceptance text, but the reviewed changes do not deliver the planned shared producer/consumer contract, consultation/report-up workflow, or controlled and held-out cross-service evaluations. The status table in `build_plan.md:530` itself leaves these gates open. No completed two-executor E1–E12 report or real desktop restart/undo/notification-delivery evidence is present. Fresh root `npm run typecheck` exits 2 with 121 TypeScript diagnostics; this review has not independently classified every diagnostic as pre-existing or newly introduced.

**Required:** complete the integration contract and repair evidence, establish disposable fixtures and an exact baseline comparison, restore required checks, and publish reproducible controlled/held-out and native-desktop results. Detect a producer/consumer units or error-shape mismatch; preserve `not_run`/failed evidence; prove atomic source+graph undo and no double publication. Runtime authentication alone cannot complete these gates.

## Verification performed for this review

- Fresh focused run: **69 existing tests passed** across selection, adapter contract, intent API/service, durable state/API, notification preferences, chat decisions/routing, and architecture projection.
- **Three temporary diagnostic tests** reproduced duplicate starts/history reassignment plus omitted clarification input, stale decision responses, and ineffective in-flight fake cancellation. They assert the observed defective behavior; their passing result is evidence of defects, not acceptance. Run dispatch was suppressed in the duplicate-start probe; no live model calls or application-source publication were performed.
- Fresh `npm run typecheck`: **exit 2, 121 diagnostics**; the committed-tree disposable R0 baseline also records 114 build, 76 workbench typecheck and 162 desktop typecheck diagnostics, 131 unit-test failures and 50 agent-flow failures. See [R0 baseline details](docs/reviews/node-harness-r0-baseline.md). These are failing gates; they are not waived by this review. Temporary probes produced no typecheck diagnostics. Native Electron acceptance was not run.
- Temporary review probes were removed after inspection. No product source fixes are included in this review.
- Specialist reviewer agents previously failed because their configured models were unavailable for this account; this assessment uses direct source tracing and local executable probes, not independent agent sign-off.

## Recommended fix order

Use the revised dependency and acceptance plan in [`build_plan.md` §15](build_plan.md#15-active-hackathon-build-plan--make-orchestration-work-first):

1. R0 captures an isolated, comparable baseline; R1 closes publication, duplicate-confirmation, answer-propagation and active-run race defects (P1–P3/P9).
2. R2a connects the common host/model/fake contracts and fixes cancellation semantics; R3 integrates durable waiting, shared budgets and crash recovery (P4/P5/P11).
3. R4 completes discovery and decision delivery; R5 aligns standalone placement, public routing and paged dispatch (P6–P10). These can proceed while live runtime access is blocked.
4. R2b proves the real runtime through those shared boundaries. R6 closes producer/consumer integration, both-mode scenarios and native-desktop release evidence (P4/P11/P12). Define interface contracts in R2a before dependent tasks, not only during final evaluation.

The original review findings above remain open; revising this plan does not resolve them.

---

## Earlier planning decisions — 2026-10-26

The original discussion below is preserved as historical context. Implementation has since begun; statements about pending design choices describe that earlier planning stage. Current acceptance criteria are in [build_plan.md](build_plan.md).

## Architecture clarification

**User decision:** Plug-in support means both a model used inside Project OS's loop and a complete agent runtime bringing its own loop. Build a stable harness around each node. The global/master starts with the immediate graph and can inspect deeper as needed. Graph size is not limited by agent counts.

**Implementation proposal:** A node execution adapter above the existing model gateway, with capability declarations and common context/task/decision/result interfaces. Prove the first real runtime's integration in NH-1; finish it in NH-7. Current Pure code has removed external-agent configuration, so support must be implemented rather than inferred from old stubs.

## 1. Cost and time per request — direction agreed

**User answer:** Configurable budgets, visible usage, stop controls and preserved progress are good.

**Plan:** NH-2 adds a shared request budget covering child work, consultations, retries and external execution. Budget exhaustion stops new dispatch and preserves a durable checkpoint. Waiting for the user is separate from active time. Report unavailable/estimated cost honestly; exact spending guarantees depend on adapter capabilities. Defaults are tuned from NH-0 evidence, not fixed as universal product limits.

**Still to determine:** Default values and the first runtime's usage/cancellation guarantees. These are measurement/capability work, not unanswered product preferences.

## 2. When to ask questions — direction agreed

**User answer:** Investigate repository-answerable questions first; ask about missing user intent and use visible assumptions for minor choices.

**Plan:** NH-3 supports global drill-down before intent approval. Ask focused questions as needed without a fixed three-question total. A recommendation is not an answer. Changing approved effects requires a new decision.

## 3. Waiting and decisions — direction agreed; placement to discuss

**User answer:** Map waiting state and configurable notifications are good; add decisions or something similar.

**Interpretation for discussion:** A pending-decisions list plus a durable record of answers, linked to the task/node. This is a proposed UI shape, not a locked screen design.

**Plan:** NH-2 implements durable decisions; NH-4 projects them into the map, card and notifications. Include intent, clarification, scope-change and budget decisions. Notifications open the exact pending item and honor preferences.

**Still to discuss:** Where the list lives. Recommendation: existing chat/run inspector plus node badge and pending count.

## 4. Intent card — try a minimal version

**User answer:** Try the contract/mock-first approach and a minimal card.

**Plan:** NH-3 starts with typed contracts and mock responses, then connects goal, effects, assumptions, acceptance checks, questions when needed and approval to the real run path. No forced maximum of three questions. Frontend ownership remains an implementation assignment; the user's answer did not identify an owner.

## 5. Unattached sample nodes — placement rule agreed

**User answer:** Nodes normally attach to a parent or children. Otherwise they live in the appropriate level's graph.

**Plan:** NH-6 inspects About, Contact, Pricing and Search against source/history. Repair real missing parent/child placement; retain legitimate standalone nodes through explicit graph/view membership at the correct level. Do not invent dependency edges, mislabel nodes, or restructure 14 valid components to satisfy a numerical template.

**Implementation fact:** Current graph mutation permits only context nodes as roots. Supporting independent nodes at other levels needs schema, engine, topology, routing and view work together; merely fixing the fixture is insufficient.

## 6. Cross-block evaluation — direction agreed

**User answer:** Use a controlled multi-block fixture and a real multi-service repository.

**Plan:** NH-0 starts the runner; NH-8 runs both executor modes against controlled faults and real cross-block changes. Cover interface semantics, scope widening, restart, budget pause, transactions and undo. Billing and notifications in the current sample are components of one block, so they alone do not establish cross-block coverage.

**Still to determine:** Which real repository to use; no external repo was selected or downloaded during planning.

## Next implementation discussion

Recommended first deliverable: a node task executing through the existing model path and a fake external executor using one harness contract, plus a real-runtime capability spike. Then implement durable decisions/checkpoints/budgets before expanding the intent and hierarchy UX.

Open ordering choices: first real runtime; decision-list placement; frontend assignment; held-out evaluation repository. These do not reopen the agreed support for both plug-in modes.
