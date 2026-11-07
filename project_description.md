# Project OS

## What it is

Project OS is a graph-centered AI development environment. It connects a product's architecture, code, visual intent, agent work, and verification in one local workspace so people can direct software changes and understand their effects.

## Who it serves

The initial focus is individual builders and small product teams working with AI: founders, product-minded developers, and designers who need a better way to move from an observed product problem to a reviewed implementation. The long-term ambition is to make building software accessible to more people while preserving their ability to understand and shape what AI creates.

## Why it exists

Code is distributed across files, while architecture and intent are often held in people's heads or scattered across conversations. A graph can make the system and its relationships easier to navigate. Visual captures can connect a proposed change to the relevant experience. Recorded agent activity and verification can help the builder follow the work.

## Current product direction

- Status (2026-11-05): gate S0 (type checks and builds) passes; the node-harness gate SH is partly done; the sample project is reproducible from the committed fixture mirror and the graph sanitizer keeps authored content; gate S1 (first run with a live DeepSeek model) passes on the built app; gate S2 (a single-file Agent change with intent approval, validated apply, honest verification and undo, plus a model-built map of the sample) passes on the built app; gate S3 (a change across components) works on the built app (a three-capability change held for review, applied, verified and undone) through a structured-step runner that offers each model answer as a tool and repairs it with exact feedback; a bounded repair of a rejected batch is built (observed live once); a question that pauses and resumes a run mid-run is not; Stop works; the final build passed 5 of 5 live repeats; gate S4 (kill the app mid-run, governance audit, the debug flow end to end) works on the built app: a killed run shows "interrupted" and is never re-applied, an unapproved verification is audited and not run, and a debug session goes from hypotheses through probes, root cause, a reviewed fix and a clean-up that keeps the fix. the surface audit (S5) has started with the eight gaps found after S4: a verification-commands settings screen, a way to give an unowned file to a feature, plain messages for a lost connection and a rejected review, a bug reported with no file handed to Agent, and a different cross-component request tested (3 of 4 live runs passed; the failure was an intermittent provider reply, now retried once). Test triage is open: 1927 pass / 80 fail / 24 skipped of 2031 tests, all older drift (approval-rule tests, old intent-stub tests, sample real-preview suites that need `npm install` in the sample). S5 second pass (2026-11-05): an unmet requirement is held for an explicit "apply anyway", a step may ask the person a question mid-run, and a second real repository was mapped, questioned and changed on the built app; six defects found there are fixed (blank map after generation, 3,000-token file limit now 12,000, planner into a childless container, opaque subtree failure, Ask notification, Chinese bold markers). Plan mode and S6 remain.
- Status addendum (2026-11-07, later): `origin/graph` (GitHub and git operations, MCP and skills marketplaces, agent pool, loop authoring, reminder graph, a redesigned settings panel and composer) is merged into `graph` locally; keys are encrypted with a Keychain-held key; a Developer ID and notarized build is configured and waits for the owner's certificate (see "Install, data and secrets").
- Status addendum (2026-11-07): the S7 gaps are fixed or narrowed (see `build_plan.md` §0, S8): Agent edits files of any size up to about 1 MB, verification commands can run in a folder, ten more languages have symbols and impact, and the macOS build also ships for Intel. Nine repositories besides the sample now map, answer questions and take Agent changes, including Rust, C#, a 6,400-file Go service and a monorepo. Their own builds and tests were not run here.
- Status addendum (2026-11-06): beyond the sample, the workflow (open, map, Ask, Agent change, apply) has been observed on five repositories besides the sample: a Node/TypeScript API, a Python library, a Python and React template, a Java service and a 1,300-file TypeScript repo. Large single files, non-TypeScript symbol analysis and verification outside the project root are the known gaps (see `build_plan.md` §0, S7).
- Status addendum (2026-11-05, evening): gate S6 passes in the form this machine allows: the unsigned macOS build installs from its dmg and was run on the packaged app with a minimal environment (see `build_plan.md` §0 for what that does and does not prove); the Plan-mode dead end, the stale question card, the empty outline, a finished run reopening as running and a first quit that left the app alive were found and fixed on the way.
- Governing priority (2026-11-03): shipability. The whole product must work on the built desktop app, proven gate by gate on observed runs; [`build_plan.md` §0](build_plan.md#0-shipability--the-current-priority-2026-11-03) defines the gates S0–S6. The hackathon demonstration below is gate S3.

- Current milestone: a working hackathon demonstration of project-wide agent orchestration. Prioritize the master exploring the graph, delegating node tasks, consuming child reports, coordinating changes and showing the working app result. Use the existing model loop first; lock/journal hardening, crash recovery and full external-runtime support follow the demo. [`build_plan.md` §15](build_plan.md#15-active-hackathon-build-plan--make-orchestration-work-first) defines the current execution order.

- Use the Pure repository as the active implementation: `Maxit0116/Project_OS_pure`, branch `graph`.
- Build a local-first Electron workbench around a project structure graph, focused conversation, agent execution, and reviewable code changes.
- Active architecture work: a stable harness around every node for both Project OS model execution and complete agent runtimes. The current branch binds explicit model choices per request, records shared decision/checkpoint/budget data, starts iterative inspect/list/read/consult discovery from the immediate graph, and shows waiting decisions in chat and on the map. The discovery loop still needs deep-graph evidence and Ask/Plan reuse. As of 2026-11-04 a request can choose a registered runtime executor (a dev-only scripted one exists), its proposal is validated by an independent model fixed on the approved intent before it can be applied, and the built-in model's single-file proposal goes through the same adapter, scoped host and staging checks; planning, `inspectNode`, `consultNode`, `requestDecision` and external runtimes are not on the harness yet. Restart-safe orchestration, notification links, standalone-node migration, and desktop acceptance remain open. The [node-harness design](docs/features/Hierarchical-Agent-Protocol-Dev-Plan.md) records the longer-term architecture; `build_plan.md` §15 sets the current demo-first implementation order.
- Treat graph descriptions as navigation and context. Backend policy, current files, and explicit verification remain authoritative for writes and completion.
- Start with individual builders and small teams. Shared collaboration, organizational governance, and hosted services are later product directions, not claims about the current release.
- Keep the older `ProjectOS` checkout as a local historical archive during the transition. Transfer specific decisions or implementation work after comparing them with Pure.

## What exists in the active branch

The `graph` branch includes a React/TypeScript workbench, Electron desktop shell, a C4-style structure map, AI-assisted structure scanning, model-backed agent workflows, context assembly, a local agent harness, code and diff review, spatial capture sessions, annotations, UI stencils, and a live overlay of agent activity on project nodes. It also includes persisted execution records, verification evidence, and local workspace state.

The repository includes a Next.js/Prisma sample workspace. The latest branch has backend plans for a local single-user desktop product and explicitly defers multi-tenancy, team permissions, hosted execution, vector search and operating-system-level sandboxing. The built-in model executor retains its fixed pipeline initially; the revised node-harness plan includes external runtimes with their own loops behind a shared execution contract.

## Technology and entry points

- Workbench: React, TypeScript, Vite, Zustand, CSS Modules, and React Flow in `projectos/workbench/`.
- Desktop: Electron main process, preload, and renderer integration in `projectos/desktop/`.
- Shared contracts and domain services: `projectos/contracts/`, `projectos/services/`, and `projectos/persistence/`.
- Sample application: Next.js, React, and Prisma in `sample-graph-saas/`.
- Product and engineering plans: `docs/`, especially `docs/features/backend/Backend-Dev-Plan.md` and `docs/features/Agent-Harness-Eval-Checklist.md`.

Typical development commands, from a fresh dependency install:

```bash
cd projectos
npm run typecheck
npm run test:unit
npm run fixtures:check      # sample fixtures consistent with the sample source
npm run fixtures:restore    # seed sample-graph-saas/.projectos from the committed mirror (add -- --force to overwrite)
```

```bash
cd projectos/workbench
npm run dev
```

```bash
cd projectos/desktop
npm run dev
```

## Install, data and secrets (macOS build)

Build: `cd projectos/desktop && npm run dist:mac` writes `release/Project OS-0.1.0-arm64.dmg` (about 176 MB) and `-arm64.zip`, `release/Project OS-0.1.0-x64.dmg` (about 182 MB) and `-x64.zip`, and the unpacked apps (`release/mac-arm64/`, `release/mac/`). `release/` is git-ignored. Apple silicon is tested on this Mac; the Intel build was run here under Rosetta only (start screen and a terminal shell), not on an Intel Mac; without credentials the build is **not signed with a Developer ID and not notarized**, but it is signed ad hoc by `desktop/scripts/adhoc-sign.cjs` so the bundle verifies. On another Mac, Gatekeeper will refuse the first launch of a downloaded copy: right-click the app and choose Open, or allow it in System Settings, Privacy & Security.

Developer ID build (prepared 2026-11-07, not yet run: this Mac has no certificate). The configuration is `desktop/electron-builder.config.cjs`. Set `CSC_NAME` to the signing identity in the login keychain without its prefix (for "Developer ID Application: Jane Doe (TEAMID1234)" use `Jane Doe (TEAMID1234)`; `security find-identity -v -p codesigning` lists them), or `CSC_LINK` and `CSC_KEY_PASSWORD` for a .p12 file; the app is then signed under the hardened runtime with `desktop/signing/entitlements.mac.plist`. Add `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` to notarize. A build that asked for a Developer ID and did not get one fails (`desktop/scripts/verify-signature.cjs`) instead of producing an unsigned bundle.

What the app needs on a person's machine: nothing to launch it (no Node, npm or Electron; the language server, TypeScript and the terminal helper are packaged and unpacked next to the app). `git` on the `PATH` is used for cloning, change history and isolated work (macOS offers to install the Xcode command line tools the first time it is called if it is missing); a project's own verification commands need that project's own tools.

Where things live:

| What | Where |
| --- | --- |
| App data, per Mac account | `~/Library/Application Support/projectos-desktop/` (the folder takes the package name, not "Project OS"; macOS finds it from the account, not from the `HOME` variable) |
| Model and GitHub keys | `secrets.json` in that folder, **encrypted** (since 2026-11-07) with Electron's safeStorage, whose key is in the macOS Keychain under "projectos-desktop Safe Storage"; a plain-text file from an earlier build is encrypted when first read. Mode 0600. An ad hoc build may ask once after a rebuild for Keychain access; deleting the Keychain item makes the stored keys unreadable (enter them again). A project's settings hold only a reference to the key |
| Which model a project uses (name, base URL, model, key reference, no key) | the project's own `.projectos/settings.json` |
| Project state: map, conversations, runs, decisions, undo backups, proposed snapshots | the project's `.projectos/` folder (add it to `.gitignore` if the project is a repository you share) |
| Governance audit trail; verification-command approvals | `governance-audit/` and the rest of the app data folder |
| Browser caches, window state, Spatial Pin bridge | the rest of the app data folder |

Reset: quit the app, then delete `~/Library/Application Support/projectos-desktop/` (forgets keys, recent projects and approvals) and, per project, `.projectos/` (forgets the map, conversations and runs). The bundled sample lives inside the app bundle (`Contents/Resources/sample-graph-saas`), so work on a copy of it.

## Current status and next gate

The Pure `graph` branch is the active starting point, not a production-ready release. Its backend plan marks implementation slices as landed; its agent harness checklist still requires desktop verification. Before broadening the platform, demonstrate one real repository change from workspace open through scoped apply, command-backed verification, interruption or restart, and review or undo. Record what succeeds and where a person still has to intervene.

The local archive, transferred investor overview, and repository transition are documented in [`TRANSFER-HANDOFF.md`](TRANSFER-HANDOFF.md). The investor-facing product vision is in [`docs/Project-OS-Investor-Overview.md`](docs/Project-OS-Investor-Overview.md).
