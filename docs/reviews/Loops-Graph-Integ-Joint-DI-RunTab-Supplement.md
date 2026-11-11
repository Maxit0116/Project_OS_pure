# Run-tab UI supplement (does **not** replace `8d0f63d4…`)

Immutable original: `integ-joint-a22fa39-evidence.zip` sha256 **`8d0f63d4245723944686624bfa5da3ca19829cbdc8164fe40c4d977cb29d6768`**.

New pack: `integ-joint-runtab-supplement-evidence.zip` (see artifacts).

## Diff vs original joint pack claims

| Topic | Original `8d0f63d4…` (keep history) | This supplement |
|-------|-------------------------------------|-----------------|
| UI Start + assoc nonempty AF | Verified (01/03) | Re-verified + **closed mid-frame** `02` |
| Pause/Resume | IPC only (`pauseBtn=false`); 05/06 Draw, no paused chrome | **UI Pause/Resume** on Run header; `Instance: paused` visible (`03`/`04`) |
| HITL Approve/Reject | IPC resolve; 07/08 Draw DutyCard, no buttons | **UI Approve/Reject visible** (`05`); UI Approve → `approval_stale` (`06`) |
| Cancel | IPC `cancelLoopInstance`; `uiCancelClicked=false` | **UI-untested** — no `cancelLoopInstance` control in Loop Run chrome |
| `pause_clicked` / `hitl_approve_clicked` in old JSON | Must **not** be read as UI clicks | New claims use `ui_pause_button_clicked` / `ui_hitl_approve_clicked` only |

## Verified this supplement (DI; not live)

- Run tab UI Start (materials + TM-8 ack + preflight)
- UI **Pause** → status `paused` + visible `Instance: paused`
- UI **Resume** → left paused
- HITL **Approve / Reject / Take over** visible on Run panel
- UI Approve → events `hitl_resolved` → **`approval_stale`** → still `awaiting_hitl` (binding drift fail-closed)
- Associated-run nonempty Agent Flow + **true closed** intermediate frame

Instance / run (this capture): see pack `integ-runtab-evidence.json`.

## Untested (honest)

| Item | Why |
|------|-----|
| UI Cancel instance | No workbench button wired to `cancelLoopInstance` (only Pause/Resume/Advance + HITL). Prior pack’s cancel was IPC — do not call it UI. |
| Live apply / OAuth / Mac / merge graph | Banned |

## Reproduce

```bash
export DISPLAY=:99
export PROJECTOS_REQUIRE_ISOLATED_USER_DATA=1
export PROJECTOS_USER_DATA_DIR=/tmp/integ-joint-runtab-ud-$$
export PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK=1
cd projectos/desktop
npm exec electron . -- --no-sandbox --remote-debugging-port=9222
# CDP script: stay on Run phase; never Escape (closes overlay); Pause before Draw/AF
```

Product pin remains `e51462e` (no product source change; full not re-run). Restore `sample-graph-saas/src/hello.js` after DI if dirty.
