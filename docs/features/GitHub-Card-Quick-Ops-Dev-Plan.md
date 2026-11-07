# GitHub Card Quick Ops

**Status**: Implemented (M0–M5). Manual smoke: Eval Checklist「GitHub Card Quick Ops」。  
**Primary surface**: AI Chat composer Stage Dock → GitHub/`repo` slot (`ComposerStageDock`).  
**Neighbors**: [`GitHub-Compose-Hub-Dev-Plan.md`](./GitHub-Compose-Hub-Dev-Plan.md), [`GitHub-Auth-Dev-Plan.md`](./GitHub-Auth-Dev-Plan.md), GitHub Graph overlay / agent recovery.

## Core product intent

Mid-flow vibe coding needs a **one-panel console** for the **current project’s GitHub repo**: identity + live status + high-frequency git/PR actions, with Agent handoff when blocked. Each finished op **toasts** and **refreshes GitHub Graph facts** (and focuses the touched branch/PR when Graph is open). Full topology / L3 destructive ops stay on Graph.

## Locked decisions

1. **This-repo only** — card operates workspace remote (`origin` default); References `kind: github` never mutate.
2. **MVP action set (L0+L1)** — Fetch; contextual Sync (Pull if behind-only, Push if ahead-only; if both, Pull primary + Push secondary); real Checkout; New branch (+ checkout); Open/Create PR; Open on GitHub; Open Graph; Ask Agent. **No** rename/delete/hard reset/force-push/worktree on the card.
3. **No `commitWorkspace` API this milestone** — “Commit…” is **Ask Agent** only.
4. **Locator ≠ silent bind** — Locator picks a **target branch**; primary CTA **Checkout** runs `checkoutWorkspaceBranch`, then writes `hub.repo`. Dirty → refuse + Ask Agent (no auto-stash).
5. **Feedback** — card-initiated ops use `workbenchStore.pushToast`. Graph soft-reloads when open; does not double-toast card ops.
6. **Auth** — Push / Create PR require connected GitHub (or honest API/`gh` failure). Local Fetch/Checkout/New branch work unauthenticated.
7. **Shared pipeline** — mutations via `ComposeHubDataSource` + factory; shared `ComposerRepoQuickOps` UI for Stage Dock and SpatialComposeHub.
8. **Agent recovery** — reuse Graph blocker classification / recovery prompts; shared runner retries pending push/pull/checkout after clean tree.

## Supersedes

[`GitHub-Compose-Hub-Dev-Plan.md`](./GitHub-Compose-Hub-Dev-Plan.md) previously stated Push / Pull / Commit are not Compose Hub’s main path (Graph / terminal). **Quick Ops makes Fetch / Pull / Push / Checkout / New branch / Create PR first-class on the GitHub card**; Commit remains Ask Agent only; L3 destructive ops remain Graph-only.

## Architecture

```
ComposerStageDock / SpatialComposeHub
        → ComposerRepoQuickOps
        → useComposerRepoOps (+ ComposeHubDataSource)
        → ProjectOSApi workspace git / PR
        → pushToast + requestGithubGraphRefresh
        → GithubGraphOverlay soft reload / focus
        → Ask Agent recovery (dirty / conflict) → retry pending
```

## Milestones

| ID | Content |
|----|---------|
| **M0** | This doc; Compose Hub supersession note; `pushBranch` / `pullBranch` on datasource |
| **M1** | Wire factory + Overlay; mutation helper; Graph refresh signal |
| **M2** | Shared repo quick-ops panel + i18n + contextual Sync |
| **M3** | Locator target + real Checkout; shared agent recovery |
| **M4** | View vs Create PR; hub.repo.prNumber; Graph focus |
| **M5** | Unit/component tests + Eval checklist |

## Out of scope

- `commitWorkspace` / staged-file UI
- Card-side force-push, hard reset, delete/rename branch, merge/close PR
- Auto-stash on dirty
- Operating References repos
- Embedding full Graph inside the stage panel
- System desktop notifications for git ops

## Acceptance

1. From Chat composer GitHub card: Fetch, Pull, Push, Checkout, create branch, create/open PR without opening Graph.
2. Every completed op toasts with operation + branch/PR + success/failure.
3. After success, status updates; open Graph soft-reloads and focuses touched branch/PR.
4. Dirty/conflict never silent-stash; Ask Agent recovery can retry pending op.
5. Unauthenticated: Fetch/Checkout OK; Push/Create PR prompt Connect GitHub.
6. References repos stay read-only for agent context.
7. Spatial Capture Compose Hub repo satellite shares the same L1 actions.
8. Desktop screenshot Overlay uses the same `ComposerRepoQuickOps` UI + git IPC; toast / Ask Agent / Open Graph bridge to the main Workbench via `spatial-pin:githubCardHost` (host adapter), not Overlay-local Zustand.
