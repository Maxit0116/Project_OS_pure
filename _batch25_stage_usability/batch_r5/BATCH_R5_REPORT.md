# Batch R5 — H3 rejection boundaries + product-entry move

## Publishing boundary
- Did **not** delete/rewrite prior `_batch25` raw gate logs already on PR8 (await Terran explicit cleanup auth).
- Did **not** upload new raw gate logs / screenshots / home paths this batch.
- New desktop probe artifacts stay under untracked `_private_r5_evidence/` (gitignored).

## Code / API (product LocalApi + public Agent approve)
1. **H3 rejection regressions** (`project-os-local-api.request-decision-rejects.test.ts`): wall-clock timeout supersede no write; stale revision refuse; cross-workspace refuse; scopeBindingHash / authorizedIntentId mismatch reject waiter; cancel supersede + apply/continue refuse; foreign root notify refuse silent resume.
2. **`pipelineBudget`** optional on LocalApi for product-path timeout tests.
3. **Scripted executor** `PROJECTOS_SCRIPTED_REQUEST_DECISION=1` calls production `host.requestDecision` before proposal (dev/demo harness, not private orchestrator intent injection).
4. **Public Agent approve → decision → same-run proposal** (`intent.test.ts`): extract → approve → prepare → confirm → `listRunDecisions` pending → `resolveRunDecision` → `awaiting_review` + scripted marker diff; no model call.

## Desktop Electron (private evidence under `_private_r5_evidence/`)
- Isolated userData; daily Chromium userData meta stable (both probes).
- Product preload IPC decision path: openWorkspace → listExecutors(scripted) → extract/approve/prepare/confirm → resolveRunDecision → same-run `awaiting_review` + proposal; file unchanged until apply.
- Product preload IPC Settings/Diff verify: empty command + out-of-range timeout **rejected** on `updateSettings`; valid command saved; Diff-approved `runVerification` success/`passed`, non-zero/`failed`, timeout/`failed+timedOut`, cancelAgentRun abort/`failed` (not false passed/not_run).
- **Gaps (explicit):** `PendingRunDecisions` **DOM card Continue** still Partial (store-owned composer run); Settings **chrome** open thin; product preview/build/test **UX** entry 未测; uncertain desktop apply/undo + Electron restart 未测. DeepSeek live `requestDecision` deferred (ledger 30/35 untouched, HTTP Δ=0).

## Still not stage acceptance
Ask global tool-loop Partial by design; 3 UX reds locked; above desktop gaps remain. **Not 交验.**
