# Agent Harness Eval Checklist

Manual / smoke checklist for harness and backend Phase 1–3. **Not a CI gate.** Use before shipping harness-adjacent changes.

**How to use**

- Leave boxes unchecked until a human verifies them in the desktop app (or an equivalent end-to-end harness).
- Unit / API tests below only prove the server kernel. They do **not** replace UI smoke.
- Do not open Route ②, OS Seatbelt/Landlock, or Cloud Devbox to “finish” this list.

**Automated coverage (2026-10-20)**

From `projectos/`: `npm run test:unit --` on the files below → **15 files / 85 tests passed**.

| Area | Tests |
|------|--------|
| ToolResult (T-0) | `services/harness/tool-result.test.ts` |
| ToolPolicy (H0) | `services/harness/tool-policy.test.ts` |
| Soft sandbox (H3 / SB) | `services/harness/shell-sandbox.test.ts` |
| Interrupted + resume (S-1 / H6) | `services/harness/interrupted-runs.test.ts`, `resume-policy.test.ts`, `persisted-run*.test.ts` |
| Usage / outcome (O / GW) | `services/harness/run-usage.test.ts`, `run-outcome.test.ts` |
| Audit (SEC) | `services/harness/audit.test.ts` |
| Verification evidence (V) | `services/verification-evidence.test.ts` |
| Code intelligence (CI) | `services/code-intelligence/code-intelligence.test.ts` |
| Retrieval + eval (RAG) | `services/retrieval/broker.test.ts`, `retrieval-eval.test.ts` |
| Git status (T-1) | `services/git-context-service.test.ts` |

Also useful: `services/agent-orchestrator/index.test.ts` (includes H5 repair). Run with `npm run test:agent-flow` when changing the orchestrator.

---

## Phase 1 six questions (desktop)

From [`backend/Backend-Dev-Plan.md`](backend/Backend-Dev-Plan.md) §6. Check only after a real workspace run.

- [ ] **理解**：Ask for a symbol defined outside the current node file; answer cites path + line from symbol index; write scope unchanged.
- [ ] **行动**：Leaf Change applies; Git status shows branch and dirty/clean.
- [ ] **验证**：With commands configured → evidence has exit code / summary; without → `not_run`, never shown as passed.
- [ ] **恢复**：Kill the app mid-run → run is `interrupted`; continuing an applied run does not rewrite files.
- [ ] **治理**：Unknown shell / network / out-of-scope write → deny or ask, with an audit / policy event.
- [ ] **改进**：Same run shows model `requestId`, tool result, and verification conclusion.

---

## H0 — ToolPolicy gate

- [ ] Write path (`write_file` / apply) denied when path outside leaf allow-list.
- [ ] `tool_policy_denied` / deny reason surfaces; no silent bypass via orchestrator spawn.

## H1 — Ask + Session

- [ ] Ask mode: exploration reads only allowed paths; no write/shell.
- [ ] Stop / cancel marks run cancelled; no half-applied diff.

## H2 — Instructions

- [ ] `.projectos/rules/*.md` appears in assembled system instructions.
- [ ] Invoked skill body included when composer selects a skill.
- [ ] Mode delta (Ask / Plan / Change) differs as expected.

## H3 — Policy v1 + soft sandbox

- [ ] `.projectos/permissions.json`: Deny > Ask > Allow for `mcp_tool` / `shell`. Settings → Agent harness edits this file.
- [ ] Gateway `completeWithTools` with deny: `executeTool` never runs; `onPolicyDecision` fires (`tool_policy_decision` when wired to a run).
- [ ] Agent Flow shows `tool_policy_decision` / `mcp_tool_call` metadata when those events are emitted.
- [ ] Settings → MCP: add stdio server, Test succeeds and lists tools; `enabled: false` contributes no Ask tools.
- [ ] Settings → MCP Marketplace: catalog loads (remote/cache/bundled); Install writes disabled server with provenance; community stays disabled even if enable requested; Hide/Report remove listing locally; install does **not** write `permissions.json`.
- [ ] Chat tools rail → Marketplace overlay: **six tabs** (MCP / Skills / Rules / Agents / Workflows / Stencils) + Catalog/Installed toggle; MCP install disabled+provenance; Skill → `.projectos/skills`; Rules → `.projectos/rules/<packId>/`; Agent → `agent_mkt_*` **without** auto-select; Workflow → `.projectos/loop-presets/`; Stencil → `.projectos/stencils/` in Capture Library; Replace required to overwrite; no auto permissions / mode switch.
- [ ] Capability Marketplace (see [`Capability-Marketplace-Dev-Plan.md`](./Capability-Marketplace-Dev-Plan.md)):
  - Export Share for Agent / Workflow / Stencil / Rules copies pack JSON; Overlay **Import pack** paste re-imports on the matching tab.
  - Agent Detail **Dependencies** → Go install jumps to Skill/MCP/Rules tab and highlights the listing.
  - Installed view lists cross-kind installs and uninstalls marketplace packs only (builtins untouched).
  - Community risk copy visible; Hide removes listing; Install ≠ permissions allow; Ask without allow still does not `callTool`.
  - **P6**: Git URL bar on all six tabs — Rules (pack JSON or `.md` folder); Agents/Workflows/Stencils require Capability Pack JSON (GitHub or raw `.json` HTTP); MCP/Skill git-url unchanged.
  - **P6**: Builtin Stencil Library shows curated common controls (dialog/tabs/table/…); placement brief includes new templates; arbitrary frontend repo URL is **not** a stencil.
  - **Installed Compose** (see [`Marketplace-Installed-Agent-Compose-Dev-Plan.md`](./Marketplace-Installed-Agent-Compose-Dev-Plan.md)): Installed bottom prompt → scope consent (local vs catalog) → checkable assembly card → confirm creates workforce agent; optional install-missing first; no auto-enable MCP / no permissions write; Chat/Loop Create Agent unchanged.
- [ ] Ask with `mcp:server:*` allow: answer may include `mcpToolCalls`; activity row visible; memory proposal skipped when `usedMcp`.
- [ ] Ask without allow: no real `callTool`; HTTP MCP to metadata / private LAN rejected.
- [ ] Soft sandbox: unknown binary / network → `ask`; protected paths not written; `runHarnessShell` is the only shell entry for verification. `softOnly: true` remains a known limitation until OS isolation (no Seatbelt, Landlock, container, CPU, or memory quota). SB-1 adds process-group cleanup and a per-workspace concurrency cap; it does not turn this into OS isolation, and it is not an ignored vulnerability.

## GitHub Auth (desktop)

From [`GitHub-Auth-Dev-Plan.md`](GitHub-Auth-Dev-Plan.md). Local Device Flow identity + API token; not cloud `/v1/me`.

- [ ] Settings → Team / GitHub: with `PROJECTOS_GITHUB_CLIENT_ID` set (or baked-in), Sign in opens browser Device Flow; after approve, avatar / `@{login}` appear.
- [ ] Top-bar GitHub account control opens Settings → Team / GitHub; signed-in shows avatar.
- [ ] Token lives only in SecretStore (`github_auth:default`); `github-account.json` has profile fields only (no token).
- [ ] With app token and a GitHub remote, PR list/create works without `gh` CLI; without token, falls back to `gh` or honest failure.
- [ ] Sign out clears status, secret, and profile; presentation mode can mock sign-in without network.
- [ ] Opening a workspace does **not** require GitHub login (local-first).

## GitHub Card Quick Ops (composer Stage Dock)

From [`GitHub-Card-Quick-Ops-Dev-Plan.md`](GitHub-Card-Quick-Ops-Dev-Plan.md). Mid-vibe GitHub console above the prompt.

- [ ] Hover Stage Dock → GitHub card shows current project repo, branch, dirty/ahead/behind, auth chip.
- [ ] Fetch / Pull / Push / New branch / Checkout / Create or View PR work without opening Graph; each success/failure shows a toast.
- [ ] Dirty tree: Push hidden; Ask Agent starts recovery; no auto-stash. After clean, pending op can retry.
- [ ] Locator selects a target branch; Checkout CTA appears until workspace matches; Checkout mutates then updates hub.
- [ ] Unauthenticated: Fetch/Checkout OK; Push / Create PR prompts Connect GitHub.
- [ ] Open Graph from card focuses current branch/PR; if Graph already open, card mutations soft-reload it.
- [ ] Spatial Capture Compose Hub repo satellite shows the same L1 actions.
- [ ] Desktop Overlay GitHub satellite: Fetch/Pull/Push/Checkout/PR work; toast appears in main Workbench; Ask Agent lands in Chat; Open Graph opens in main and hides Overlay.
- [ ] References → Repo entries remain non-mutating (agent context only).

## H4 — Model variants + worktree

- [ ] `.projectos/model-harness.json` `systemDelta` applied for matching model id.
- [ ] Settings → Agent harness: create worktree, preview diff, confirm merge, remove checkout.
- [ ] `createAgentWorktree` lands under `.projectos/agent-worktrees/<id>/`.
- [ ] `mergeAgentWorktree` without `confirm: true` fails; with confirm merges branch.
- [ ] After merge, leaf ACL still applies relative to main workspace (worktree is isolation only, not a write-scope escape).

## H5–H7 — Repair, resume, budget (desktop)

- [ ] Failed verification command triggers at most one repair generation; third attempt does not run.
- [ ] `not_run` / policy deny / unexpected paths do not trigger repair.
- [ ] Interrupted run with backup: continue refuses re-apply; undo still works.
- [ ] Pipeline budget stop is visible in events; no silent model upgrade.

## Loops Graph · Agent Visual Wiring（W4）

From [`Loops-Graph-Agent-Wiring-Dev-Plan.md`](./Loops-Graph-Agent-Wiring-Dev-Plan.md).

- [ ] Agent card bottom ports: Model\* / Memory / Capability; dashed `provides` edges to satellites.
- [ ] Config Palette / port `+` opens asset picker (model profiles, installed skills/MCP); Memory can mount directly.
- [ ] Switch / Create & place Workforce Agent expands satellites; **Apply wiring to Agent** / **Save as new Agent** (Duty + context menu) write Definition only on confirm.
- [ ] Action / Human / Logic stay on solid control-flow edges — cannot attach as Agent Capability satellites.
- [ ] Community / Disabled MCP badges on satellites + Inspector wiring summary; wiring never auto-enables MCP or writes `permissions.json`.
- [ ] Deleting an Agent / provides edge cascades orphan config satellites.
- [ ] Compile/Run still uses existing Orchestrator + Workforce light inject (no second runtime).

## DEFERRED (do not regress by “finishing”)

- Route ② open tool loop
- OS Seatbelt / Landlock
- Cloud Devbox
- RAG-5 vector search
- Multi-tenant / billing / Phase 4 routing

## Related

- `docs/features/backend/Backend-Dev-Plan.md`
- `docs/features/Agent-Harness-Dev-Plan.md`
- `docs/features/Agent-Harness-Tool-Registry.md`
- `docs/features/GitHub-Auth-Dev-Plan.md`
- `docs/features/Loops-Graph-Agent-Wiring-Dev-Plan.md`
- `projectos/services/harness/README.md`
