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
| Sample prisma/next suites | integ worktree lacked `sample-graph-saas/node_modules` | `npm ci --ignore-scripts` + `npx prisma generate` in sample (gitignored; not committed) |

## Candidate pin (reviewable; not merged to graph)

| Field | Value |
|-------|-------|
| Tip | `e51462e97ceebfeddd728b67373dffcaa1fdcd75` |
| Tree | `66679b694ea4e14b68c245e093cc0bea19b8585a` |
| Merge | `1f55050` parents `3b7a875` (graph) + `15138dc` (PR10) |
| PR9/PR10/graph heads | Unmoved vs start pins (`ccf2804` / `15138dc` / `3b7a875`) |

### Fixed gates on tip (`PROJECTOS_REQUIRE_REAL_PREVIEW=1`)

| Gate | Exit | Drift |
|------|------|-------|
| `projectos` build | 0 | no |
| `workbench` build | 0 | no |
| `desktop` build | 0 | no |
| `projectos` `npm test` | 0 (605 files / 3394 tests) | no |
| Focused agentic+Loops (12 files / 195 tests) | 0 | n/a |
| Electron coexist DI screenshots | 0 | n/a |

### Electron coexist (isolated userData; DI loopback; **not live**)

Fresh captures on tip `e51462e` (not re-hosted old PR10 images):

- DutyCard Human Approve + approval mode
- Agent Flow Idle (Timeline / Flowchart / Agent Pool)
- Run materials + **Run preflight** / Start disabled until preflight (`b32cd67` force)
- Same-session Loop overlay + Agent Flow chrome

`startLoopInstance` without assignee/outbound wiring **fail-closed** via LocalApi preflight (expected; proves forced preflight, not a silent pass).

### Safe reproduce (no authorized Mac)

1. Worktree on `cursor/loops-graph-integ-cab8` @ `e51462e`
2. `sample-graph-saas`: `npm ci --ignore-scripts && npx prisma generate`
3. Three builds + `PROJECTOS_REQUIRE_REAL_PREVIEW=1 npm test` under gated HEAD/tree/clean
4. Desktop: `PROJECTOS_REQUIRE_ISOLATED_USER_DATA=1 PROJECTOS_USER_DATA_DIR=/tmp/... PROJECTOS_ALLOW_LOOP_EXECUTION_LOOPBACK=1` + Electron CDP; never daily Mac profile / OAuth / paid model

### Explicitly untested / not claimed

- Live model apply / OAuth / paid providers / outbound network / Mac host
- Merge into `graph`
- DI synthetic timeline as real apply evidence
