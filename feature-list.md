# Feature Status

Snapshot of `Maxit0116/Project_OS_pure` branch `graph` at the current node-harness implementation. Status reflects source and automated tests, not full desktop or external-runtime acceptance.

## Implemented foundations

| Area | Status | Evidence / boundary |
| --- | --- | --- |
| Project structure map | Implemented | C4-style graph, workspace bootstrap, and AI-assisted graph completion. The map is for navigation and context; it does not independently grant file-write permission. |
| Agent execution | Implemented foundation | Model gateway, scoped tool policy, local harness, run events, and persisted records. Manual desktop workflow acceptance is still open. |
| Context and code facts | Implemented foundation | Context assembly, retrieval, code-intelligence plans, and live-activity overlays connect execution to project resources. Verify on a real workspace. |
| Change review and recovery | Implemented foundation | Code and diff surfaces, recoverable apply, and verification evidence. The six desktop harness acceptance questions remain unchecked. |

## Active product work

| Area | Status | Next evidence |
| --- | --- | --- |
| Spatial product direction | Active | Capture sessions, annotations, pins, UI stencils, and visual intent composition need validation as one end-to-end user flow. |
| Backend completion loop | Active validation | Complete a real scoped change, inspect command evidence, restart or interrupt, and review or undo without unintended re-application. |
| Structure-graph quality | Active | Check generated maps against unfamiliar repositories and correct misleading or incomplete relationships. |
| Node harness and hierarchical agent protocol | In progress; SH-1 to SH-4 (leaf path) built, S0 passes, sample reproducible | Model dependency/contract scheduling and direct component routing exist. Plan/Debug starts now carry the accepted intent, queued same-process retries reschedule, and Plan UI distinguishes proposal-ready from applied. The master intent path now has iterative inspect/list/read/consult actions, bounded at 24 actions, but has not yet been verified on deep or >6-branch graphs or reused for Ask/Plan. Electron dev launches. A request can choose a registered runtime executor; its proposal is validated by an independent model fixed on the approved intent before apply (observed in the dev app only up to review; the validator call is exercised against stubs). The harness gate SH is not passed: planning, inspect, consult and decision operations are not on the host. Remaining: configure a model and complete a real two-component UI request; finish discovery evidence and Ask/Plan reuse; then complete child-result integration and live waiting before common adapter dispatch. See [NH-0–NH-8 plan](docs/features/Hierarchical-Agent-Protocol-Dev-Plan.md) and [`build_plan.md` §15](build_plan.md#15-active-hackathon-build-plan--make-orchestration-work-first). |

## Future directions

- Shared team workspaces and collaboration.
- Organization accounts, administration, and billing.
- Hosted development environments and operating-system-level command isolation.
- General fleet/cross-run scheduling. Full external-runtime integration is now planned in NH-1/NH-7; the built-in model loop initially keeps its current behavior.
- Vector search and broader repository coverage.

These are product possibilities, not current release claims. The backend plan explicitly defers several of them; revisit only when user evidence justifies expanding scope.
