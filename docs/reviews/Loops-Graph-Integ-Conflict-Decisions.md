# Loops × graph integration conflict decisions

**Integration branch:** `cursor/loops-graph-integ-cab8`  
**Parents:** `origin/graph` @ `3b7a875` + `origin/cursor/loops-dispatch-evidence-cab8` @ `15138dc` (true merge, no rebase/force/ours-theirs wholesale)  
**Original PR9/PR10 branches:** untouched

## Overlap / conflict map

| Area | graph (co-founder agentic) | Loops PR10 | Decision |
|------|---------------------------|------------|----------|
| Marketplace/MCP URL guard `resolveDns` | Optional DNS inject for SSRF tests | Same | Keep graph comment; same API |
| `agent-orchestrator` delegated failure sentence | Plain-language firstReason for `userFacingError` | Same logic, different wrap | Keep graph wording (production UI parser) |
| `loop-runtime-roles` Condition/Test fixture | Mark Test `succeeded` so cursor does not resurrect | Mark Test `skipped` | **Keep graph `succeeded`** (completion tracking) |
| WelcomeScreen | Locale switch | Open sample workspace | **Both** |
| AgentFlow activity detail tests | `renderOpened` inspector collapse | `preferExpandSelected` markup | **Keep graph `renderOpened`** |
| Cancelled run status tests | `cancelled` semantics | Same | Keep graph |
| workbenchStore agentConversation test | `architectureFileNodeId` import | notification center import | **Both** |
| progress.md | S10–S14 shipability/agentic records | Loops authority docs entry | **Both** (Loops section then graph) |

## Preserved Loops review fixes (b32cd67+)

- `agent-runs/index.jsonl` skipped by reconcile
- credential without freeze fail-closed
- LocalApi always `requirePreflight: true`
- DI synthetic timeline omits real `backupId`

## Not claimed

- Live OAuth / paid model / Mac / outbound / merge to `graph`

## Post-merge minimal adaptations

| Item | Cause | Fix |
|------|-------|-----|
| Marketplace `client.test.ts` ×6 | Auto-merge duplicated `testDns` / `McpDnsLookup` import | Dedupe to single testDns (graph SSRF inject) |
| Sample prisma/next suites | integ worktree lacked `sample-graph-saas/node_modules` | `npm ci --ignore-scripts` in sample (gitignored; not committed) |
