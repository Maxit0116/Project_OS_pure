# Joint DI demo — claims hygiene (docs tip follows this file)

Product gate pin remains **`e51462e`** (no product source change; full gate not re-run).  
Original joint pack **`integ-joint-a22fa39-evidence.zip`** sha256 **`8d0f63d4…6768`** is **immutable** — not overwritten.

## What the original pack (`8d0f63d4…`) actually proves

### UI-verified (keep)

| Claim | Evidence |
|-------|----------|
| Legal graph + assignee + outbound | preflight clear / Start enabled |
| UI materials + TM-8 ack + **UI Start** | rawlog `start_ui_enabled` / `startedVia=ui` |
| Durable DI run + runBinding | `run_loopback_e718fce8…` / `inst_3030330b…` |
| DutyCard associated-run bound | shot `02` |
| Same-run **non-empty** Agent Flow (DI Apply timeline) | shot `03` |
| Reopen associated-run non-empty (API + UI bound) | shot `04` + `reopen_getAgentRun` — **closed intermediate frame was not shot** |

### Must **not** be read as UI button clicks (original pack)

| Misleading claim in old evidence JSON | Reality in same pack |
|----------------------------------------|----------------------|
| `pause_clicked=true` | rawlog `pauseBtn=false`; `pause_via=ipc_pauseLoopInstance` |
| `resume_*` as UI | `resume_via=ipc_resumeLoopInstance` |
| `hitl_approve_clicked=true` as UI | `hitl_via=ipc_resolveLoopHitl`; shots `07/08` are Draw DutyCard, **no Approve/Reject chrome** |
| `uiCancelClicked` | `false`; cancel via `cancelLoopInstance` IPC |
| shots `05/06/09` as paused/cancelled UI | still Draw config card — **no visible paused/cancelled chrome difference** |

Production events after IPC HITL (honest negative): `hitl_resolved` → **`approval_stale`** → still `awaiting_hitl`. That is a **binding-drift fail-closed event**, not “UI Approve succeeded”.

### Workbench fact (no design change)

Loop Run header exposes **Pause / Resume / Advance** when `phase==='run'`. HITL Approve/Reject render in the Run panel when `status==='awaiting_hitl'`. **There is no `cancelLoopInstance` button in workbench UI** — Cancel cannot be claimed as UI without new product work (out of scope).

## Supplemental pack (new; does not replace `8d0f63d4…`)

See `docs/reviews/Loops-Graph-Integ-Joint-DI-RunTab-Supplement.md` and artifact  
`integ-joint-runtab-supplement-evidence.zip`.

Delivered: **Run-tab UI** Pause→`Instance: paused`→Resume; HITL Approve/Reject visible; UI Approve→`approval_stale`; Agent Flow closed mid-frame. **Cancel remains UI-untested** (no product cancel button).

## Reproduce (offline, isolated)

```bash
# product pin e51462e or docs tip on integ branch; clean tree
export DISPLAY=:99
export PROJECTOS_REQUIRE_ISOLATED_USER_DATA=1
export PROJECTOS_USER_DATA_DIR=/tmp/integ-joint-runtab-ud-$$
export PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK=1
# desktop already built from e51462e tip tree
cd projectos/desktop && npm exec electron . -- --no-sandbox --remote-debugging-port=9222
# then Run-tab supplemental capture script (CDP) — see supplement doc
```

Restore `sample-graph-saas/src/hello.js` after DI if dirty. No OAuth / paid model / Mac daily / merge to `graph`.
