# t64u — privacy redact + whole-tree DOM Undo + tip gates + outbound bounds

## Privacy (ordinary commit, history kept)

- `1d35ce2` redacted absolute home roots in three t63 **code-source file hash** JSONs under `batch_t63/` (`root` → `<ISOLATE>` / `<SOURCE>`, `path_redacted: true`, hashes unchanged).
- Those files are **not** Couple settings/graph/semantic/CV four-hashes — do not conflate.
- Tracked PR text re-scanned for home absolute-path prefixes and secret-style; only the three JSONs were this-round leaks. Historical archive paths elsewhere left as-is.

## Budget gate (same ledger PATH, no reset)

- PATH: `_batch20_apply_auth_gate/outbound_budget_ledger_batch20.json`
- Cap: **100** (raised t63u); reservations preserved: **47** (Δ synthetic = 0 until live batch)
- Fee budget: ~10 CNY (t63 allowance unchanged)
- Official DeepSeek Flash (weekend/idle, docs 2026-11): input miss **¥1/MTok**, output **¥4/MTok** (cache hit input ¥0.02/MTok). Peak would double — not used today (Sunday).
- Known reported tokens → **~0.176 CNY** (prior). Missing×8 **~0.079 CNY** is a **p95-style estimate only** — **never treat missing as 0**, and do **not** treat ×8 as a hard runtime reserve.
- **Corrected**: the earlier “≈0.064 CNY/attempt” figure was **only arithmetic** assuming 32k in + 8k out at idle Flash rates. It was **not** an implemented runtime token max, retry aggregator, or fee reserve gate. Do not cite it as hard reserve when calling the model.

### Implemented executable bounds (code/config evidence)

Opt-in env (unset ⇒ daily desktop unchanged), wired in `ModelGateway` + `projectOsService`:

| Bound | Env | Live-batch value used | Fail-closed behavior | Code |
| --- | --- | --- | --- | --- |
| Max output tokens | `PROJECTOS_MODEL_OUTBOUND_MAX_OUTPUT_TOKENS` | **2048** | clamps `max_tokens` / `maxOutputTokens` before HTTP | `outbound-request-bounds.ts` → `applyOutboundRequestBounds`; applied in `gateway.ts` `buildProviderInput` and each tool-loop round |
| Max input chars | `PROJECTOS_MODEL_OUTBOUND_MAX_INPUT_CHARS` | **48000** | refuses oversized system+user/messages; no HTTP | same |
| Session cap | `PROJECTOS_MODEL_OUTBOUND_SESSION_CAP` | **8** | wraps ledger gate; each HTTP/retry/tool-loop round already `reserve()`s one slot; blocks after N new reserves this process | `withOutboundSessionCap` |
| Count ledger | `PROJECTOS_MODEL_OUTBOUND_BUDGET_PATH` + `_LIMIT` | same PATH, limit **100** | atomic permanent reserve (no refund) | `outbound-budget.ts` |

Constants: `LIVE_BATCH_DEFAULT_MAX_OUTPUT_TOKENS=2048`, `LIVE_BATCH_DEFAULT_MAX_INPUT_CHARS=48000`, `LIVE_BATCH_DEFAULT_SESSION_CAP=8`.

Fee accounting for live batch: report **provider-reported usage** from settled ledger annotations; keep missing usage as **unknown** (not 0). After a bounded small live batch, reconcile real CNY from reported tokens; adjust clamps only if fail-closed or context loss.

## H3 clarify tier honesty

- **Production wiring**: model schema/prompt `action:"clarify"` → `requestRunDecision` → same-root resume; Stop declines. Scope/cancel/restart constraints retained; no fixed Continue card on the normal approve path.
- **Synthetic gateway tier (proven)**: `PROJECTOS_DETERMINISTIC_MIDRUN_CLARIFICATION=1` Electron answer + Stop. This is **not** DeepSeek and must not be billed as product-usable live clarification.
- **Live DeepSeek mid-run Q→card→same-root+Stop**: still required under the **implemented** bounds above (not the 0.064 arithmetic).

## Whole-tree Apply / Undo

- Product tip `855761e`: record parent `apply_result` before post-apply verification can throw; recover `applyResult` from events on Apply IPC error; leaf `validatingProposal` still blocks Apply (delegated sticky heal only).
- Electron (private): uncertain whole-tree → DOM Apply → parent `apply_result`+backup → **DOM Undo** bytes restored (`undoVia: dom_undo`). IPC `restoreApplyBackup` is **not** acceptance.

## Tip fullgates

- Clean tip at docs `f3b3e39` (= product `855761e` + docs): TSC/build/fixtures 0; fullgate exit 1; **2 files / 3 tests** = locked UX reds only; `syntheticDiffApplyUndo` green. Couple/secrets at `9606fcf` (docs/hash only).

## Probe diagnosis (this turn)

- **greenfield `agent_mode_failed`**: probe failed before composer send; empty-graph also lacked a greenfield synthetic gateway (login fixture would not produce greenfield plan). Fix: opt-in `PROJECTOS_DETERMINISTIC_GREENFIELD=1` → `DeterministicGreenfieldGateway`; probe retries mode-chip + sets GREENFIELD env.
- **cancel `Uncaught`**: probe bug — `text.split('\n')` inside an outer template literal became a real newline in the CDP expression (SyntaxError → CDP `Uncaught`). Product path not implicated by that error string. Fixed to `split('\\n')` + richer exceptionDetails.

## Probe results (this turn, private Electron; ledger still 47/100 Δ0 on synthetic)

| Probe | Verdict | Notes |
| --- | --- | --- |
| Greenfield DOM Apply/backup/Undo | **OK** | Root cause was probe: partial empty-graph wipe → `invalid_workspace_fixtures` → welcome screen (`agent_mode_failed`). Full `copyEmptyGraphWorkspace` cleanup + `PROJECTOS_DETERMINISTIC_GREENFIELD=1` → awaiting_review greenfield_tranche_uncertain → DOM Apply → backup → DOM Undo bytes restored. |
| Cancel Uncaught | **probe bug** | `text.split('\\n')` inside outer template became real newline → CDP SyntaxError/`Uncaught`. Not product. |
| In-progress Stop copy | **OK** | Composer Stop only while `flowStatus==='running'`; SLOW_MS hold + click 停止 → chat `已停止 Agent`; Apply disabled. |
| Child-fail sanitize DOM | **OK** | `FORCE_CHILD_FAIL=1` dirty throw → real event chain; chat shows sanitize tokens; no `/Users/terran/secret` / `sk-…` / `tok_live_…`. |

## Still open (not 交验)

- Live DeepSeek H3 clarify→card→same-root+Stop under **implemented** bounds + ledger; report real usage (not 0.064 arithmetic)
- Post-final-test Couple SOURCE/ISOLATE four-hashes + secrets RO meta + ledger Δ
