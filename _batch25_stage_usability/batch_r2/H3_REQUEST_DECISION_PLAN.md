# H3 mid-run pause/resume — minimal backend hookup plan

## Status
**Implemented in Batch R3** — see `../batch_r3/H3_REQUEST_DECISION_IMPLEMENTED.md`.

`requestDecision` on the production orchestrator host is wired through `DurableRunStateStore` + live waiters + `resolveRunDecision` wake. Existing waiting-decision card reused (no new visual).

## Reusable pieces (do not invent a second UI)
- `HarnessHostOperations.requestDecision` contract + fake executor wait/continue path
- Durable run checkpoint `pendingDecisionIds` (`durable-run-state`)
- Chat / map waiting-decision presentation already used for intent/approval cards

## Minimal safe hookup (done)
1. Orchestrator host: create durable decision id bound to `runId` + `projectId` + scope hash; emit waiting event; park until answer.
2. Persist pending decision on checkpoint; restart rehydrates durable pending — never auto-continue writes.
3. Answer API: matching project+run only; wrong workspace / foreign run fail-closed.
4. Resume: only after answer recorded; continue same run id when live waiter exists.

## Security / scope constraints
- Decision cannot widen read/write paths beyond the approved intent / leaf binding already in force
- Cancel / timeout / budget exhaust must clear wait without applying
- Cross-project and cross-run resolution refused

## Product decision still required?
**No new visual design needed** under current stage auth — backend hookup + state linkage reuses the current waiting-decision card.
