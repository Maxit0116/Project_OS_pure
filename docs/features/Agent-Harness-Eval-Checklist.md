# Agent Harness Eval Checklist

Manual / smoke checklist for harness slices (H0–H4). Not a CI gate yet; use before shipping harness-adjacent changes.

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
- [ ] Soft sandbox: unknown binary / network → `ask`; protected paths not written; `runHarnessShell` is the only shell entry for verification.

## H4 — Model variants + worktree

- [ ] `.projectos/model-harness.json` `systemDelta` applied for matching model id.
- [ ] Settings → Agent harness: create worktree, preview diff, confirm merge, remove checkout.
- [ ] `createAgentWorktree` lands under `.projectos/agent-worktrees/<id>/`.
- [ ] `mergeAgentWorktree` without `confirm: true` fails; with confirm merges branch.
- [ ] After merge, leaf ACL still applies relative to main workspace (worktree is isolation only, not a write-scope escape).

## DEFERRED (do not regress by “finishing”)

- Route ② open tool loop
- OS Seatbelt / Landlock
- Cloud Devbox

## Related

- `docs/features/Agent-Harness-Dev-Plan.md`
- `docs/features/Agent-Harness-Tool-Registry.md`
- `projectos/services/harness/README.md`
