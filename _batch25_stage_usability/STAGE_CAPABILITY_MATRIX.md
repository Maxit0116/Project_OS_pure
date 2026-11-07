# Batch R–R3 — stage capability matrix (backend / AI / local-devtool)

Scope source: `project_description.md` (S0–S3 + current milestone), `progress.md` (S1–S3 observed), `feature-list.md` (implemented foundations), `bugs.md` (register resolved), Batch P closeout. **Not** the infinite future roadmap (marketplace, hosted, OS sandbox, team collab).

Evidence layers (do not mix):
1. **Real model (DeepSeek)** — prior S1/S2/S3 + Batch Q Auto→Undo closed loop.
2. **SYNTHETIC gateway + real Electron / LocalApi** — Batch N–O cancel/cross-run/Auto undo.
3. **Unit / contract / product API** — Batch R–R3 uncertain-criteria / H3 requestDecision / verify honesty.

| Capability | Stage expectation | Entry | Success | Failure / recovery | Evidence | Defect status |
|---|---|---|---|---|---|---|
| Open / import real workspace | Usable | Desktop open / sample / LocalApi open | Map + tree load | Bad path → localized error | Historical S1/S2; fixtures:check | OK (reuse) |
| Graph / tree / code browse | Usable | Map, semantic tree, file tree | Nodes + files navigable | Missing owner → Agent blocked (honest) | S1/S2 observed | OK; unownable files remain product limit |
| Scan / sync structure | Usable | AI scan / regenerate | Named nodes or fail closed | Truncation → retry then fail | progress S2 | OK (reuse) |
| Provider config save + connect | Usable | Settings Models | Persist + 测试连接 OK | 401/402/429 localized | S1 live | OK (reuse); plaintext secrets residual S6 |
| Real model call | Usable | Ask / Agent / Plan | Gateway complete | Budget/cancel stop clean | Batch Q ledger; gateway tests | OK under budget policy |
| Ask grounding + context | Usable | Ask scoped to node/file | Cites in-bundle files; secrets withheld | Global Ask: 0 files by design | S1 live | **Partial**: global Ask has no tool-loop (documented, not a silent hole) |
| Plan clarify → execute handoff | Usable | Plan mode → approve → Agent | Intent card → run | Clarification pause | Unit + prior desktop | OK foundation; live same-session re-prove = budget |
| Agent tools / delegate / scope auth | Usable | Agent hierarchical plan | Scoped child writes only | OOS / cross-run steal fail-closed | Batch O LocalApi | OK (reuse) |
| File ops / verify commands | Usable | Apply + Diff verification approval + General settings editor | Commands run after approve; fail/timeout/cancel honest | empty/timeout rejected on save; not false passed/not_run | S2/S3; **R3** settings+timeout; **R4** non-zero exit + cancelAgentRun abort | Diff-approved success/fail/timeout/cancel proven via product runner |
| Preview / build / test | Stage S0/fixtures | fixtures + desktop build + sample tsc | Gates green except known UX reds | — | **R4** trusted gates on this head | Expected 3 UX reds; not acceptance |
| Diff Auto commit | Usable when criteria fully satisfied | `changeExecutionPolicy=automatic` | Write + backup | Cancel@barrier / budget → no write | Batch O/Q + automatic-path suite | OK |
| Diff review_first | Usable | `review_first` | Stops at awaiting_review | User applies | Unit/API | OK |
| Uncertain criteria policy | **Must not hard-fail / must not Auto-commit** | Batch / leaf / whole-tree / greenfield | `verdict=valid` + `awaiting_review` + `reason=uncertain_criteria` | Unsatisfied still hard-fail; expire/cancel refuse write | **R–R4** delegated+leaf+whole-tree+greenfield Auto pause→apply→undo; expire/cancel | OK for stage surfaces; not acceptance alone |
| Backup / Undo honesty | Usable | Diff Undo / restoreApplyBackup | Bytes restored; chat no longer claims applied | Manual recovery message if restore fails | Batch Q real; Batch R message rewrite | OK |
| Cancel / timeout / model fail / bad JSON / budget / run conflict | Usable fail-closed | Stop / cancelAgentRun / budget | No write; recoverable | Cross-run steal refused; **R3** cancel revokes awaiting_review apply | Batch O; **R3** greenfield cancel | OK (reuse + R3 revoke) |
| Restart / history persist | Partial stage | Relaunch Electron / openWorkspace reconcile | Profiles persist; agent-run history kept; pending decisions durable without silent write resume | Corrupt lines isolated; legacy model_request normalized; **R4** awaiting_review+backup no replay | S1; R2/R3; **R4** product reopen | Mid-run resume after process death still not silent auto-write (correct) |
| Mid-run pause → resume same run (H3) | **Usable same-process** | `requestDecision` + existing waiting-decision card | Create wait → card answer → same run continues; cancel/timeout supersede no write | Cross-ws/run/stale refused; restart answer ≠ write resume | **R3** orchestrator + LocalApi product path | **Implemented**; not stage acceptance alone |
| S4 kill mid-run | Later gate | — | — | — | Not S3 deliverable | Out of this stage claim |
| 3 UX contract reds | Locked expectations | fullgate | 3 reds expected | Prefer technical fix keeping visuals | Prior gates | **Unchanged**; do not weaken |

## Batch R code deltas
- `batch-validation-evidence.ts` (+ tests): uncertain allowed → reviewable valid; unsatisfied still invalid.
- Orchestrator: automatic + uncertain → `awaiting_review` (batch / whole-tree / greenfield / leaf proposal); richer child-fail `ProjectOSError` details.
- LocalApi apply auth: modify / create / delete / whole-tree allow `uncertain` after human review (still reject unsatisfied).
- Workbench undo: rewrite `automatic_apply_*` via `chat.automaticApplyUndone` (en/zh) + postApplyTrust assertion.
- LocalApi regression: `automatic path: uncertain batch criteria pause for review and write nothing`.

## Batch R2 code deltas
- Legacy `model_request` coerce on read; corrupt vs legacyNormalized diagnostics; cross-ws reconcile isolation.
- Uncertain Auto pause → human `applyDiff` → backup → undo (LocalApi); greenfield prepare allows automatic+awaiting_review with live child binding.
- Chat rewrites stale 尚未验证 when verification later passes; sanitize absolute paths in failure text.
- Minimal verification-command editor under General settings (no new nav chrome).

## Batch R3 code deltas
- H3 `requestDecision` durable create/wait/resume + `resolveRunDecision` wake; cancel/timeout supersede; restart no silent write.
- Leaf uncertain Auto pause → human apply/backup/undo; greenfield expired live binding refuse; cancel awaiting_review revokes apply.
- Child-fail `handleRunEvent` sanitize path test; verification command draft validate; Diff-approved real-runner timeout honest failed.

## Batch R4 code deltas
- Whole-tree + greenfield Auto uncertain pause → human apply/backup/undo.
- `applyDiff` returns durable disk `applyResult` without requiring terminalStatus (no fixture replay after awaiting_review crash).
- VerificationRunner/LocalApi AbortSignal; Diff-approved cancel + non-zero exit honesty.

## Readiness (not human acceptance)
H3 same-process mid-run usable; uncertain surfaces (delegated/leaf/whole-tree/greenfield) pause→apply→undo proven; Diff verify success/fail/timeout/cancel honest; restart awaiting_review no replay. **Still not Terran acceptance**: Ask global tool-loop by design; 3 UX reds locked; real-model mid-run decision E2E only if budget remains after offline gates.
