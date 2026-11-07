# Batch R4 — remaining evidence closeout (post-28078b0 / R3)

## Done this batch
1. **Whole-tree uncertain Auto** — pause (`awaiting_review` + `uncertain_criteria` + `whole_tree_validated_uncertain_awaiting_review`) → no write → human `applyDiff` → backup → undo.
2. **Greenfield Auto uncertain** — same loop with `greenfield_tranche_uncertain_awaiting_review`; expire/cancel refuse-write already covered in R3 and kept.
3. **`awaiting_review` + backup restart** — product `openWorkspace` reconcile → interrupted; `applyDiff` returns durable disk applyResult (no fixture replay); bytes unchanged.
4. **Diff-approved verification honesty** — real runner: success (prior), non-zero exit → `failed`, timeout → `failed+timedOut`, **cancelAgentRun aborts in-flight** → `failed` (not false `passed`/`not_run`). Wired AbortSignal through `VerificationRunner` + LocalApi.
5. Child-fail UI sanitize + Settings verification draft validate reconfirmed this head.

## Explicit remaining (not claimed usable for stage acceptance)
- Real-model representative mid-run `requestDecision` E2E only if DeepSeek budget allows after offline gates (ledger PATH/30/35 untouched; HTTP Δ=0 this batch so far).
- Ask global tool-loop by design (documented Partial).
- 3 UX contract reds locked (fullgate expected nonzero).
- Mid-run resume after process death still correctly refuses silent auto-write (not a missing feature).

## Acceptance
**Not claimed.** Stage still not ready for Terran交验 — matrix usable items expanded; remaining Partial/out-of-claim items stay explicit.
