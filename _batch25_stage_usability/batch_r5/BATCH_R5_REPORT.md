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

## Desktop Electron (private evidence)
- Isolated userData; daily Chromium userData meta stable.
- Product preload IPC: openWorkspace → listExecutors(scripted) → extract/approve/prepare/confirm → resolveRunDecision → same-run `awaiting_review` + proposal bytes; file unchanged until apply.
- **Gap (explicit):** `PendingRunDecisions` DOM card did not mount for IPC-started runs (store must own the run via composer). Card `onResolve` shares the same `resolveRunDecision` product API proven above. Composer-path card click still **未证** this head; DeepSeek live `requestDecision` deferred until card path is store-owned (ledger 30/35 untouched, HTTP Δ=0).

## Still not stage acceptance
Ask global tool-loop Partial by design (progress.md); 3 UX reds locked; desktop Settings/Diff verify UI + preview/build/test product UX + uncertain desktop apply/undo + restart Electron still **未测 / thin** vs product entry this batch. Continue next.
