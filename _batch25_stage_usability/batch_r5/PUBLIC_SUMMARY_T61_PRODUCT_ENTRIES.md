# T61 — product entry evidence (short public summary)

Head: `ff70bf2` (model leaf `requestDecision` wire) + private Electron probes after that tip.

## A — Preview / build / test product entry

**Verdict:** Design Preview start control is absent because the Pure cut removed its runtime (see `progress.md`: do not replay old Design Preview wholesale). This is not a wrong-view/workspace-gate miss of a still-mounted panel.

**Current product alternatives (exercised in isolated Electron):**

- Settings → General → verification command add/save (invalid non-empty feedback + valid `npx tsc --noEmit` persisted)
- Top bar **产品实验室 / Product Lab** entry opens Lab start flow; sample-graph-saas detected as web preview with suggested `npm run dev`; Browser + Terminal chrome present
- Desktop/npm gate scripts are **not** treated as product preview

**Not claimed:** full Product Lab start → healthy localhost page → stop/fail-recovery as a completed acceptance loop (Lab entry + terminal start plan observed; long-running page readiness not scored as done).

## B — Real DeepSeek decision path

**Proven (private Electron; real DeepSeek profile + daily secrets RO; budget ledger):**

- Public Agent → General Agent → file scope → DeepSeek selected
- Composer send → intent **批准并开始**
- Built-in model leaf called `host.requestDecision` (“Continue generating the authorized edit?”)
- PendingRunDecisions **Continue** clicked on mid-run card
- Same run reached `awaiting_review` with proposal; target file unchanged (review_first)
- Model HTTP used (ledger reservation delta); secrets/daily userData meta unchanged

## Settings / Diff verification UI

- Settings verification editor: **opened + invalid feedback + save** proven in UI
- Diff panel UI: scripted proposal opens **Diff 审核** with visible `仅供审阅 — 未经验证，无法应用` / 验证结果
- Diff badge schema is only `passed|failed|not_run`; timeout is command `timedOut`→failed; cancel is run-level copy — not separate verification badges
- Scripted proposals are product-blocked from Apply, so post-apply verification badges were not exercised on that path
- DeepSeek proposal path emitted `verification_result.status=not_run` (Settings commands not auto-run here); post-apply badge pass/fail still a remaining UI gap

## Explicitly not claimed

Stage 交验; uncertain desktop apply/undo + child-fail toast; restart-history rewrite; weakening 3 UX reds; merging/force history.
