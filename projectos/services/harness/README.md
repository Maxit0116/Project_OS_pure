# Agent Harness

Runtime scaffolding around the model: **Instructions + Tools + Model + Policy + Session**.

## Two meanings of “harness”

| Name | What it is | Where |
|------|------------|--------|
| **Agent Harness** (this folder) | Tool policy, future session/instructions assembly | `services/harness/` |
| **Debug Harness Record** | Error → hypotheses → fix → verification archive | `contracts/harness.ts`, `.projectos/harness/*.json` |

Do not implement a general tool loop inside Debug UI. Debug Mode *consumes* harness tools; records are evidence.

## Rules

1. Every side-effect tool (write, shell, network, MCP) must pass `evaluateToolCall` / `assertToolAllowed`.
2. Path allow is not enough for commit — inode/device identity and the recoverable transaction kernel remain server authority after Policy allows.
3. Prefer Route ① (orchestrated honest pipeline) over open model tool loops until Route ② is explicitly un-deferred.
4. Instructions assemble only via `buildHarnessInstructions` (base + mode + `.projectos/rules` + memory index + skills). Memory files live under the user-data `agent-memory/` directory, not in the workspace.
5. MCP/shell/fetch need an **allow** rule in `.projectos/permissions.json` (Deny > Ask > Allow).

### Project files

| Path | Purpose |
|------|---------|
| `.projectos/rules/*.md` (recursive) | Always-on Rules (H2.C) |
| `.projectos/skills/**/SKILL.md` | On-demand Skills |
| `.projectos/permissions.json` | ToolPolicy v1 rules (H3.A) |
| `.projectos/sandbox.json` | Soft shell sandbox (H3.B) |
| `.projectos/model-harness.json` | Per-model systemDelta (H4.B) |
| `.projectos/agent-worktrees.json` | Worktree manifest (H4.C) |
| `.projectos/agent-worktrees/<id>/` | Isolated git worktree checkouts |

Worktree API: `createAgentWorktree` / `listAgentWorktrees` / `mergeAgentWorktree({ confirm: true })` / `removeAgentWorktree` / `getAgentWorktreeDiff`. Merge never runs without explicit confirm. Leaf ACL still applies when the checkout is used as a workspace root.

Example `permissions.json`:

```json
{
  "version": "0.1.0",
  "rules": [
    { "effect": "allow", "tool": "mcp_tool", "match": "mcp:docs:*" },
    { "effect": "allow", "tool": "shell", "match": "npm *" }
  ]
}
```

Example `sandbox.json`:

```json
{
  "version": "0.1.0",
  "networkAccess": false
}
```

Shell entry: `runHarnessShell` (Policy → classify → soft spawn). Omit `permissionRules` to load `.projectos/permissions.json`. Verification uses the same entry with tool `run_verification`. Unknown binaries and network tools return `ask` — never silent full access. OS Seatbelt/Landlock not in v0 (`softOnly: true`).

Workbench: Settings → Agent harness edits these files and manages worktrees (diff preview, confirm merge, remove).

See `docs/features/Agent-Harness-Dev-Plan.md`, `docs/features/Agent-Harness-Tool-Registry.md`, and `docs/features/Agent-Harness-Eval-Checklist.md`.
