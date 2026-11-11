# Joint DI demo (legal flow) — docs tip `a22fa39`

Product gate pin remains **`e51462e`** (three-layer build + full 605/3394 already green).  
This tip only adds evidence/docs for the **legal joint DI running demo**. No product source change → no full re-gate.

## Identity

| Item | Value |
|------|-------|
| Docs tip | `a22fa39710182b6dcf051f764f9b5576150837f8` |
| Product gate pin | `e51462e` / tree `66679b6` |
| Merge parents | `3b7a875` (graph) + `15138dc` (PR10) |
| Desktop main chunk | `10f2f8766aa8ab757f0d529c0e7770dde91d2febc12a0189dbf3216cff751579` |
| Instance | `inst_3030330b-399e-4a7d-b83e-5bafd2e3285f` |
| Durable DI run | `run_loopback_e718fce8-378f-4e9c-82f4-2165a25c4203` |
| Live provider | **false** (local_tools DI only) |

Original PR9/PR10/graph heads unmoved (`ccf2804` / `15138dc` / `3b7a875`).

## What was demonstrated (real interaction, not empty chrome)

1. **Legal graph**: agent → human(approval + assignee) → exit (outbound wired)
2. **UI materials**: Add project ref `src/hello.js` → TM-8 re-review ack → preflight clear → **Start enabled** → UI Start
3. Durable `run_loopback_*` + runBinding; DutyCard **associated-run bound**
4. **Non-empty Agent Flow** (Complete / Applying the change) via associated-run — co-founder agentic + Loops jointly
5. Close Agent Flow → reopen associated-run → same-run non-empty recover
6. Same-instance **Pause → Resume** (`pauseLoopInstance` / `resumeLoopInstance` production IPC; Run-phase Pause button not matched in this layout)
7. HITL approve → events `hitl_resolved` → **`approval_stale`** → re-`awaiting_hitl` (binding-drift fail-closed after DI apply to `hello.js`)
8. **Cancel** → status cancelled; advance produces no further work

## Packs (isolated)

| Pack | Role |
|------|------|
| `integ-joint-a22fa39-evidence.zip` | **This** joint DI demo (do not mix) |
| `integ-e51462e-historical-shell/` | Prior shell-only coexist shots (retained, not formal) |

## Focused production tests (new identity header)

`loop-approval-binding` (16) + `loop-approval-runtime-gate` (4) + durable DI (1) + run-binding (11) + interrupted (6) + agent activities (8) + GC66 jump (3) = **49 passed**.

## Gaps (honest)

| Gap | Why | Evidence instead |
|-----|-----|------------------|
| Pause/Resume chrome button not clicked | Run-phase buttons not matched while overlay pressed | LocalApi `pauseLoopInstance`/`resumeLoopInstance` (same store path) |
| No UI to forge digest mid-run | Product has no surface | Session `approval_stale` after HITL + unit suites above |
| Live model apply | Banned / unauthorized | Explicitly **not** claimed; DI only |

## Reproduce (offline, isolated)

1. Branch `cursor/loops-graph-integ-cab8` @ docs tip (product pin `e51462e`)
2. `PROJECTOS_REQUIRE_ISOLATED_USER_DATA=1` + `PROJECTOS_USER_DATA_DIR=/tmp/...` + `PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK=1`
3. Electron CDP; legal graph + materials UI + TM-8 ack + Start
4. Associated-run → Agent Flow; pause/resume IPC; HITL; cancel
5. Restore `sample-graph-saas/src/hello.js` after DI apply if dirty
