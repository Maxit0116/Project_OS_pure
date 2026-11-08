# t64u — privacy redact + whole-tree DOM Undo + tip gates

## Privacy (ordinary commit, history kept)

- `1d35ce2` redacted absolute home roots in three t63 **code-source file hash** JSONs under `batch_t63/` (`root` → `<ISOLATE>` / `<SOURCE>`, `path_redacted: true`, hashes unchanged).
- Those files are **not** Couple settings/graph/semantic/CV four-hashes — do not conflate.
- Tracked PR text re-scanned for home absolute-path prefixes and secret-style; only the three JSONs were this-round leaks. Historical archive paths elsewhere left as-is.

## Budget gate (same ledger PATH, no reset)

- PATH: `_batch20_apply_auth_gate/outbound_budget_ledger_batch20.json`
- Cap: **100** (raised t63u); reservations preserved: **47** (Δ this turn synthetic = 0)
- Fee budget: ~10 CNY
- Official DeepSeek Flash (weekend/idle, docs 2026-11): input miss **¥1/MTok**, output **¥4/MTok** (cache hit input ¥0.02/MTok). Peak would double — not used today (Sunday).
- Known reported tokens → **~0.176 CNY** (prior). Missing×8 **~0.079 CNY** is a **statistical estimate only**, not a hard worst bound; keep a separate unknown margin.
- Executable reserve before live calls (Flash idle, conservative per-attempt ceiling assuming product caps ≈32k in + 8k out, cache-miss): **~0.064 CNY/attempt**. Plan ≤15 attempts → **~0.96 CNY** reserved from remaining ~9.7 CNY headroom; do not treat p95×1.5 / 1.04 as absolute guarantee.

## H3 clarify tier honesty

- **Production wiring**: model schema/prompt `action:"clarify"` → `requestRunDecision` → same-root resume; Stop declines. Scope/cancel/restart constraints retained; no fixed Continue card on the normal approve path.
- **Synthetic gateway tier (proven)**: `PROJECTOS_DETERMINISTIC_MIDRUN_CLARIFICATION=1` Electron answer + Stop. This is **not** DeepSeek and must not be billed as product-usable live clarification.
- **Live DeepSeek mid-run Q→card→same-root+Stop**: still required for H3/H4 business cross-component proof under the reserve above; not closed this note.

## Whole-tree Apply / Undo

- Product tip `855761e`: record parent `apply_result` before post-apply verification can throw; recover `applyResult` from events on Apply IPC error; leaf `validatingProposal` still blocks Apply (delegated sticky heal only).
- Electron (private): uncertain whole-tree → DOM Apply → parent `apply_result`+backup → **DOM Undo** bytes restored (`undoVia: dom_undo`). IPC `restoreApplyBackup` is **not** acceptance.

## Tip fullgates

- `c96e1b4` collected: TSC/build/fixtures 0; fullgate exit 1; 3 files / 4 tests failed (2 layout UX reds + ChatContextHeader UX red + syntheticDiffApplyUndo from over-broad review-only heal). Summary path-redacted; raw private.
- `855761e` tip fullgate started after product push (sole concurrent gate).

## Still open (not 交验)

- Greenfield Electron DOM Apply/backup/Undo
- timeout/cancel user-visible copy real DOM
- child-fail chat/toast desensitize real DOM
- Live DeepSeek H3 clarify under ledger reserves
- Post-final-test Couple SOURCE/ISOLATE settings/graph/semantic/CV four-hashes + secrets RO meta (no substitute with code-file hashes or prior dump)
