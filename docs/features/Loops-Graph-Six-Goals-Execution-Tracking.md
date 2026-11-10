# Loops Graph · Six Goals Execution Tracking

**Baseline**: `graph` @ `bec3dd75ef9ab0b50e7b7b564fb91ea5adf0f398`  
**Branch**: `cursor/loops-approval-binding-cab8` (targets `graph`)  
**Updated**: 2026-11-10 (review fix round after PR#9 `0045313`)

Status keys: **已有已测** · **已有待测/需增强** · **需新增** · **未配置/不可用**（禁止标假完成）

| # | Goal | Inventory (source-checked) | Batch-1 action |
|---|------|----------------------------|----------------|
| 1 | GitHub/Slack/Lark + unified Trigger/Action/Webhook/HTTP | GitHub Action + `pendingGithubOp`/settle **已有已测**；settle 前 TOCTOU 复核 **已有已测**；内部 event + idempotency **已有已测**；Slack/Lark/外网 Webhook **未配置/不可用** | 不装真实 webhook；不扩 connector |
| 2 | Condition/parallel/loop/timer/retry/pause/resume | GC 主体 **已有已测**；无 Merge fan-out / nested parallel drain **已有已测**；真正并行写隔离仍受限 | 回归不削断言；不把 terminal 当整 run 完成 |
| 3 | Reusable Agents + Agent↔Workflow 互调 | Agent roles/wiring/pool **已有待测/需增强**；互调深度/预算共享 **需新增** | 本批不扩 Runtime |
| 4 | Human review/edit/assign/intervene + external approval | Human→Action 拓扑绑定 nodeId/integration/operation **已有已测**；choice 精确白名单（拒 `not approved`）**已有已测**；`actorKind=local_declared\|unspecified`（**未宣称外部鉴权**）；外部 IM 审批 **未配置** | 本批垂直切片 + 审查修复 |
| 5 | Engineering context (C4/GitHub Graph/Agent Pool/Issue/PR/tests) | 真实 workspace path digest + ChangeSet/Test/Review `validatedCodeDigest` **已有已测**；不可读/无 digester **fail-closed** | 不可称 JSON-only hash 已完成代码绑定 |
| 6 | Observability of exec/tools/code/tests/fail/recover | `approval_stale` / evidence stale / settle TOCTOU 负例 **已有已测**；AI Edit 结构化 diff UI **已有已测** | 作者 UI + mock/service parity |

## Batch-1 vertical slice (review-hardened)

1. Approvals bind actor (local declared only) + instance + action node/integration/operation + engineering baseline (workspace digests) + operationDigest.
2. Dirty workspace / missing digester / mismatched Test·Review stamps → fail-closed; deferred GitHub settle re-checks binding (TOCTOU).
3. Bare historical approve / `not approved` / unknown non-whitelist on Action gates cannot authorize side effects.
4. AI Edit offers structural `diff` + Accept/Dismiss; revision/goal drift clears or rejects stale offer; empty-graph confirm path documented in UI.
5. `pickNextCursor` prefers ready children, then other ready peers (no-merge parallel / nested) — does not complete whole run on `children.length===0` alone.

## Batch-1 verification (this round)

```text
# Broad Loops suites (services + contracts + mock)
npx vitest run \
  services/loop-approval-binding.test.ts \
  services/loop-goal-authoring-service.test.ts \
  services/loop-runtime-architecture.test.ts \
  services/loop-runtime-actions.test.ts \
  services/loop-runtime-roles.test.ts \
  services/loop-runtime-service.test.ts \
  services/loop-graph-service.test.ts \
  services/loop-agent-roles.test.ts \
  services/loop-agent-wiring.test.ts \
  services/loop-graph-compiler.architecture.test.ts \
  contracts/loop-artifacts.test.ts \
  contracts/loop-graph.test.ts \
  client/mock-loop-graph-store.test.ts
→ Test Files 13 passed | Tests 86 passed | exit 0

# Author UI / store
npx vitest run \
  workbench/src/components/LoopGraph/LoopGoalComposer.test.tsx \
  workbench/src/state/loopGraphStore.authoring.test.ts
→ Test Files 2 passed | Tests 12 passed | exit 0

# Typecheck pristine compare (bec3dd7 vs HEAD)
projectos npm run typecheck → exit 2, error TS count 159 == pristine 159
loop-/approval-binding/intent-graph related errors: none
client mock imports diff via loop-intent-graph-diff (no node:crypto/fs);
mock-loop-graph-store still uses pre-existing node:crypto randomUUID only.
```

Honest gaps (not claimed done): external actor auth; live Slack/Lark/GitHub HTTP; true multi-writer parallel isolation; Mac/desktop gates; paid model calls.

## Deferred (not blocked / not deleted from six goals)

- User choice of first Slack vs Lark connector / cloud deploy / always-on webhook.
- Live external messaging or paid model calls (fixtures only).
- GC-6.5 minimap polish.
- Agent↔Workflow mutual-call depth/budget.
- External identity verification for approval actors.
