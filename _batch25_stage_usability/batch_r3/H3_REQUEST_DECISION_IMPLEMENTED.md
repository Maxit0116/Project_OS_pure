# H3 requestDecision — implemented (Batch R3)

## Status
Production host `requestDecision` is no longer `unsupported`. Mid-run clarification uses the existing waiting-decision card (`PendingRunDecisions`) without new visual design.

## Flow
1. Leaf harness host creates a durable `RunDecision` (`kind=clarification`) bound to `projectId` / `runId` / `rootRunId` / `scopeBindingHash` / optional `authorizedIntentId`.
2. Emits `decision_summary` so the workbench refreshes `listRunDecisions`.
3. Parks an in-process waiter until `resolveRunDecision` answers the same decision.
4. On `continue` → same run continues (FakeExecutor can submit a follow-on proposal).
5. On decline / cancel / wall-clock budget → decision `superseded` or `declined`, wait cleared, **no write**.
6. Checkpoint `checkpoint_decision_wait_<rootRunId>` tracks `pendingDecisionIds`; cleared when wait ends.
7. Restart / no live waiter: `resolveRunDecision` may still persist an answer for history, but `notifyDecisionAnswer` returns false — **never auto-resumes writes**.

## Security refusals
- Cross-workspace project id mismatch
- Live waiter with missing/foreign run or root mismatch
- Stale revision / non-pending / duplicate answer
- Scope / intent binding mismatch on wake

## Tests
- `services/agent-orchestrator/index.test.ts` — resume after answer; cancel supersede no proposal; restart no write resume
- `services/project-os-local-api.request-decision.test.ts` — product `resolveRunDecision` wakes waiter; duplicate/restart
- `services/harness/durable-run-state.test.ts` — `supersedeDecision`

## Not claimed
Stage acceptance. H3 is usable for same-process mid-run pause/resume; remaining matrix gaps are tracked separately.
