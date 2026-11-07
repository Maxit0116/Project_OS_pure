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
| Structure-graph quality | Active; a live model scan of the sample is observed (24 nodes, 16 components, all named) | Check generated maps against unfamiliar repositories and correct misleading or incomplete relationships. A cut-off model reply now retries once and then fails instead of degrading the graph. |
| Node harness and hierarchical agent protocol | In progress; SH-1 to SH-4 (leaf path) built, S0, S1 and S2 pass (the built-in-model Agent path is observed), S3 observed across components except in-run waiting, S4 observed (kill mid-run, governance audit, debug flow with the fix kept after clean-up), S5 observed on the sample and on a second real repository (verification settings, unowned-file assignment, offline and rejected-review messages, debug hand-off to Agent, a held review with "apply anyway" and in-run questions built and proven by tests only), S6 passes on one Mac (see the next row), sample reproducible | Model dependency/contract scheduling and direct component routing exist. Plan/Debug starts now carry the accepted intent, queued same-process retries reschedule, and Plan UI distinguishes proposal-ready from applied. The master intent path now has iterative inspect/list/read/consult actions, bounded at 24 actions, but has not yet been verified on deep or >6-branch graphs or reused for Ask/Plan. Electron dev launches. A request can choose a registered runtime executor; its proposal is validated by an independent model fixed on the approved intent before apply (observed in the dev app only up to review; the validator call is exercised against stubs). The harness gate SH is not passed: planning, inspect, consult and decision operations are not on the host. Remaining: configure a model and complete a real two-component UI request; finish discovery evidence and Ask/Plan reuse; then complete child-result integration and live waiting before common adapter dispatch. See [NH-0–NH-8 plan](docs/features/Hierarchical-Agent-Protocol-Dev-Plan.md) and [`build_plan.md` §15](build_plan.md#15-active-hackathon-build-plan--make-orchestration-work-first). S5 second pass: unmet-requirement hold with an explicit apply-anyway (tests only live), in-run questions (tests only live), and a second repository mapped, questioned and changed on the built app with six fixes; Plan mode unresolved. |
| Packaged macOS app (S6, x64 in S8, S9) | Passes on one Mac: `npm run dist:mac` makes a dmg and a zip for arm64 and for x64 (the x64 build run under Rosetta: start screen and a terminal shell); keys encrypted with a Keychain-held key (S9, observed in the packaged app); a Developer ID and notarized build is configured but needs the owner's certificate; ad-hoc signed (not notarized); the app installed from the dmg launches with no dev tooling on its `PATH` and runs Ask, an Agent change with apply, the terminal, the outline, restore after a restart and a one-step quit | Not a clean machine or second account; a quarantined download, a real Intel Mac and a machine without `git` untried. Keys are encrypted in `~/Library/Application Support/projectos-desktop/secrets.json` with a Keychain-held key; locations are in `project_description.md`. A real Developer ID signature and notarization are untested (no certificate here) |
| Repositories other than the sample (S7, S8) | Observed on nine besides the sample: a Node API, a Python library, a Python and React template, a Java service, a 1,300-file TypeScript repo (S7), and a Rust workspace, a C# solution, a 6,400-file Go service and a TypeScript monorepo (S8): map, Ask, Agent change and apply work on all of them | Not covered: their own builds and tests (not run; changes are read, not compiled); repositories above 8,000 files; providers other than DeepSeek |
| Large files, folders, other languages (S8) | Agent edits files above 12,000 tokens through an outline and regions (live on a 93,000-token file); verification commands can run in a folder of the project; symbols, referrers and tests for ten more languages; Ask states its coverage; validators see the definitions of called functions; intent cards persist with their conversation; `.tsx` outlines | A verification command in a folder was approved live but not run (permission check on external code; the sandbox test runs one); a change spread over distant parts of one large file; the batch review does not get the called definitions |

## Future directions

- Shared team workspaces and collaboration.
- Organization accounts, administration, and billing.
- Hosted development environments and operating-system-level command isolation.
- General fleet/cross-run scheduling. Full external-runtime integration is now planned in NH-1/NH-7; the built-in model loop initially keeps its current behavior.
- Vector search and broader repository coverage.

These are product possibilities, not current release claims. The backend plan explicitly defers several of them; revisit only when user evidence justifies expanding scope.
