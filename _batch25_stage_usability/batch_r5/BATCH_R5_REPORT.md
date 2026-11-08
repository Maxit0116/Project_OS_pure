# Batch R5 — H3 rejection boundaries + product-entry move

## Publishing boundary
- **Cleanup (2026-11-08 03:07 auth)**: ordinary commit removed tracked `gates_run.out` / `trusted_gates.log` from HEAD tree; summaries path-redacted; `.gitignore` blocks re-add. Older commits still contain those blobs (history not rewritten).
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
- **R5b store-owned composer (private):** Agent → General Agent → Code/Diff directory tree `app/login/page.tsx` → Scripted runtime → composer send → intent **批准并开始** → `PendingRunDecisions` Continue (DOM) → same-run `awaiting_review` + proposal; disk unchanged; restart history visible / no auto-write; daily userData meta stable.
- **Gaps (explicit):** Settings **chrome** open thin; product preview/build/test **UX** entry 未测; uncertain desktop apply/undo + childfail toast thin. DeepSeek live `requestDecision` deferred (ledger 30/35 untouched, HTTP Δ=0).

## Still not stage acceptance
Ask global tool-loop Partial by design; 3 UX reds locked; preview UX + uncertain desktop apply remain. **Not 交验.**
