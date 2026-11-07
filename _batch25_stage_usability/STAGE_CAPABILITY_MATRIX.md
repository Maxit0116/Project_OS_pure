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
| File ops / verify commands | Usable (API+Electron UI settings; Diff badges partial) | Apply + Diff verification approval + General settings editor | Settings invalid/valid save proven; Diff reviewOnly/not_run copy proven | empty/timeout rejected on save; Diff badge schema passed/failed/not_run only | **R3–R5** LocalApi + **R5** IPC + **T61** Settings UI + Diff panel copy | Post-apply verification_* badges still thin; timeout/cancel not separate Diff badges |
| Preview / build / test | Pure cut: Design Preview deferred; Product Lab/Browser/Terminal alternatives | Product Lab topBar + Browser + Terminal `npm run dev` + Settings verification | Lab entry + web_preview detection + terminal start plan observed | Design Preview start absent by design (progress.md Pure cut) | **T61** Electron product-entry probes; gates remain fixtures/desktop build | Not acceptance; do not treat desktop_build/npm gates as product preview |
| Diff Auto commit | Usable when criteria fully satisfied | `changeExecutionPolicy=automatic` | Write + backup | Cancel@barrier / budget → no write | Batch O/Q + automatic-path suite | OK |
| Diff review_first | Usable | `review_first` | Stops at awaiting_review | User applies | Unit/API | OK |
| Uncertain criteria policy | **Must not hard-fail / must not Auto-commit** | Batch / leaf / whole-tree / greenfield | `verdict=valid` + `awaiting_review` + `reason=uncertain_criteria` | Unsatisfied still hard-fail; expire/cancel refuse write | **R–R4** delegated+leaf+whole-tree+greenfield Auto pause→apply→undo; expire/cancel | OK for stage surfaces; not acceptance alone |
| Backup / Undo honesty | Usable | Diff Undo / restoreApplyBackup | Bytes restored; chat no longer claims applied | Manual recovery message if restore fails | Batch Q real; Batch R message rewrite | OK |
| Cancel / timeout / model fail / bad JSON / budget / run conflict | Usable fail-closed | Stop / cancelAgentRun / budget | No write; recoverable | Cross-run steal refused; **R3** cancel revokes awaiting_review apply | Batch O; **R3** greenfield cancel | OK (reuse + R3 revoke) |
| Restart / history persist | Partial stage | Relaunch Electron / openWorkspace reconcile | Profiles persist; agent-run history kept; pending decisions durable without silent write resume | Corrupt lines isolated; legacy model_request normalized; **R4** awaiting_review+backup no replay | S1; R2/R3; **R4** product reopen | Mid-run resume after process death still not silent auto-write (correct) |
| Mid-run pause → resume same run (H3) | **Usable same-process API + store-owned Electron card + real DeepSeek** | `requestDecision` + waiting-decision card | Create wait → answer → same run continues; cancel/timeout supersede no write | Cross-ws/stale/scope/intent/root refused; restart answer ≠ write | **R3–R5** LocalApi + scripted; **R5b** scripted DOM; **T61** real DeepSeek Agent → requestDecision → Continue → same-run proposal | Real-model DOM Continue proven (private); not stage 交验 |
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

## Batch R5 code deltas
- H3 rejection API suite (timeout/stale/cross-ws/scope/intent/cancel/foreign-root).
- Scripted `PROJECTOS_SCRIPTED_REQUEST_DECISION` + public Agent approve→decision→proposal test.
- Desktop private probe (untracked): product IPC same-run resume; card DOM still Partial.

## Batch T61 code / evidence deltas
- `project-os-model-executor.ts`: default `askBeforeGenerate` calls `host.requestDecision` before generate (skip only `not_implemented`).
- Private Electron: Settings General verification UI; Product Lab/Browser/Terminal entry; real DeepSeek decision Continue→proposal; Diff reviewOnly/not_run copy.

## Readiness (not human acceptance)
**T61**: real DeepSeek Agent→requestDecision→DOM Continue→same-run proposal proven under budget ledger; Design Preview deferred with progress.md basis + Product Lab alternatives found; Settings verification UI save proven. **Still not Terran acceptance**: Product Lab full page start/stop loop thin; Diff post-apply passed/failed badges thin; uncertain desktop apply/undo + childfail toast thin; Ask global tool-loop Partial by design; 3 UX reds locked.
