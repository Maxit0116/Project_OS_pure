# Gate 0 Decision — Void Adoption

**Date:** 2026-07-08  
**Status:** Continue with Void (conditional — compile + S2.0.4 code complete; GUI launch blocked on darwin 25.5)  
**Reviewer:** Frontend lead  

## Decision

**Continue with Void** as the Stage 1 IDE shell, subject to completing a successful local build on the operator machine and validating the webview placeholder (S2.0.4).

Fallback remains available if build or contribution cost exceeds the thresholds below.

## Evaluation

| Criterion | Assessment |
|-----------|------------|
| License | Apache-2.0 — acceptable with NOTICE |
| Product fit | Activity bar, editor, terminal, command palette match MVP PRD |
| Build time | **~6 min install + ~1.3 min first compile** (under 45 min budget); GUI launch blocked on test machine |
| Fork maintenance | Medium — VS Code lineage, active Void project |
| Embed cost (P2) | Low — URL webview to standalone workbench |
| Native integration (post-Gate 0) | Medium — IPC for `ProjectOSApi` transport |

## Rationale for Continue

1. Rebuilding Electron + Monaco from scratch duplicates Void’s existing shell.  
2. P2 workbench is already standalone; URL embed proves UX without fork risk to main repo.  
3. Contract-first `ProjectOSApi` maps cleanly to a future main-process service in Void.  

## Fallback triggers

Switch to **Electron + Monaco** standalone shell if any of:

- Cold build fails twice on a clean macOS machine  
- Compile/watch exceeds 2 developer-days to stabilize  
- Required workbench contributions require deep forks of `src/vs/workbench` core  
- License or distribution blocker discovered  

## Fallback estimate (not implemented in P2)

| Item | Estimate |
|------|----------|
| electron-vite scaffold | 1–2 days |
| Monaco + three-zone layout port | 2–3 days |
| `ProjectOSApi` IPC bridge | 3–5 days (depends on transport spec) |
| Parity with current workbench | 1 week total |

Reference legacy structure: `archive/legacy-20260705/code/app/` (do not copy old IPC).

## Next steps (post Gate 0)

1. Operator runs S2.0.1 build and fills metrics in `void-adoption-notes.md`  
2. Implement S2.0.4 placeholder command in Void fork branch  
3. Stage 1 Phase 1 — replace URL embed with packaged workbench assets  
4. Wire `RealProjectOSApiClient` transport through Void main process (P2.5+)  

## Sign-off

| Role | Name | Date |
|------|------|------|
| Frontend | _Terran_ | 2026-07-07 |
| Backend | _pending_ | |

---

## ADR — Void → Standalone Electron (2026-07-11)

**Status:** Accepted — Void fork discontinued for Stage 1 shell.

**Context:** Void integration carried excess IDE surface area (activity bar, extensions, VS Code workbench chrome) that did not match Project OS product shape. The standalone workbench already delivers the intended UX.

**Decision:** Build a thin **electron-vite** shell at `projectos/desktop/`:

- Renderer: existing `projectos/workbench/`
- Main: `ProjectOSLocalApi` + `node-pty` terminal
- Bridge: `IpcTransport` via `window.projectOS` preload

**Consequences:**

- Faster iteration on Project OS–specific layout (no Void fork maintenance)
- Real terminal, disk-backed workspace, and persistent secrets on desktop
- Browser mock path preserved for UI-only development
- macOS first; Windows/Linux packaging deferred

**Implementation:** See `docs/desktop-development.md`.
