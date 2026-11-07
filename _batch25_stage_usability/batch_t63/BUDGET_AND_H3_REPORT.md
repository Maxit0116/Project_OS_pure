# t63u — budget cap raise + H3 mid-run clarify + uncertain whole-tree DOM

## Budget gate (same ledger PATH, no reset)

- PATH: `_batch20_apply_auth_gate/outbound_budget_ledger_batch20.json`
- Cap: **50 → 100** (meta: `_batch20_apply_auth_gate/BUDGET_CAP_RAISE_t63u.json`)
- Reservations preserved: **47** (ok 40 / failed 7 / usage_missing 8 / inflight 0)
- Fee budget: ~10 CNY; assumed Flash weekend idle **1 / 4 CNY/MTok**
- Known reported tokens: input 114062, output 15470 → **~0.176 CNY**
- Unknown rows: 8 → worst reserve **~0.079 CNY**
- Conservative spent est: **~0.255 CNY**
- New slots 53 × p95×1.5 → **~0.78 CNY**; total if all used **~1.04 CNY** (under 10)
- This turn synthetic probes: **ledger Δ = 0** (deterministic gateway; no DeepSeek)

## H3 product path (closed for synthetic)

Wiring: model `{"action":"clarify",...}` → `ModelClarificationNeededError` → existing `requestRunDecision` → same-root resume with clarification in `stepOutputs`. Stop/decline appended on card.

Evidence:
- Unit: built-in clarify→resume; clarify→Stop declines (`agent-orchestrator/index.test.ts`)
- Electron synthetic (`PROJECTOS_DETERMINISTIC_MIDRUN_CLARIFICATION=1`):
  - `_private_r5_evidence/electron_t63_midrun_clarify_answer_result.json` — material options, no Continue, same-root awaiting_review
  - `_private_r5_evidence/electron_t63_midrun_clarify_stop_result.json` — Stop declines, no disk write
- Not claimed: live DeepSeek mid-run Q (budget reserved; prefer synthetic for UI)

## Uncertain whole-tree DOM

- API: already green (LocalApi whole-tree + greenfield uncertain apply/undo)
- Electron: `PROJECTOS_DETERMINISTIC_FORCE_GLOBAL_PLANNER=1` + uncertain → `whole_tree_validated_uncertain_awaiting_review` → DOM Apply → disk+backup → undo via `restoreApplyBackup` IPC fallback
- Product fixes shipped this turn:
  - Late child `diff_ready` must not re-block Apply after parent `batch_validation_result` valid
  - `applyCurrentDiff` keeps `applyResult` if `activeRunId` races mid-await
  - PendingChanges 「全部撤销」 restores whenever backup exists (not only automatic)
- Known gap: after whole-tree DOM Apply, parent events sometimes lack `apply_result` while disk+backup exist — Undo UI thin; IPC restore works. Greenfield Electron DOM still API-only.

## Timeout / cancel / child-fail

- requestDecision wall-clock timeout + cancel supersede: unit green
- Diff verify fail badge + toast: prior t62 private evidence
- child-fail chat/toast sanitize: `handleRunEvent.childFailSanitize.test.ts`

## Acceptance

**Not 交验.** Remaining: greenfield Electron DOM; whole-tree apply_result/Undo chrome honesty; live DeepSeek H3 if budget allows; tip fullgate + couple hashes after push.
