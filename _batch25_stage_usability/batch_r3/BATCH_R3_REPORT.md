# Batch R3 — requestDecision + remaining evidence

## Done this batch
1. **H3 requestDecision** — production host creates durable clarification, waits, wakes on existing card `resolveRunDecision`, same-run continue; cancel/timeout/budget supersede with no write; restart answer does not auto-write.
2. **Leaf uncertain** — automatic writes nothing → human `applyDiff` → backup → undo.
3. **Greenfield guards** — expired live child binding refuses apply; cancel on `awaiting_review` now revokes apply authorization (was a real hole).
4. **Child-fail UI sanitize** — `handleRunEvent` step_failed → chat/toast sanitized (not helper-only).
5. **Verification settings** — empty command / timeout validate; Diff-approved real runner timeout → `failed`+`timedOut` (not false passed/not_run).

## Explicit remaining (not claimed usable for stage acceptance)
- Whole-tree uncertain Auto pause → human apply → backup → undo (separate surface; delegated/leaf covered).
- Cancel mid-verification product path still thin vs Diff-approved timeout/fail.
- Product preview/build/test trusted gates must be re-run on this head (matrix entry).
- Real-model representative E2E only if budget allows after offline gates; do not reset ledger.

## Acceptance
**Not claimed.** Stage still not ready for Terran交验.
