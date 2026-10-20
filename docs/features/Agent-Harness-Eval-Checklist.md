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
- [ ] Soft sandbox: unknown binary / network → `ask`; protected paths not written; `runHarnessShell` is the only shell entry for verification. `softOnly: true` remains a known limitation until OS isolation (no Seatbelt, Landlock, container, CPU, or memory quota). SB-1 adds process-group cleanup and a per-workspace concurrency cap; it does not turn this into OS isolation, and it is not an ignored vulnerability.

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
- `projectos/services/harness/README.md`
