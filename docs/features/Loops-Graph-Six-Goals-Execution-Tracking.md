# Loops Graph · Six Goals Execution Tracking

**Baseline**: `graph` @ `bec3dd75ef9ab0b50e7b7b564fb91ea5adf0f398`  
**Branch**: `cursor/loops-approval-binding-cab8` (targets `graph`)  
**Updated**: 2026-11-10  

Status keys: **已有已测** · **已有待测/需增强** · **需新增** · **未配置/不可用**（禁止标假完成）

| # | Goal | Inventory (source-checked) | Batch-1 action |
|---|------|----------------------------|----------------|
| 1 | GitHub/Slack/Lark + unified Trigger/Action/Webhook/HTTP | GitHub Action + `pendingGithubOp`/settle **已有已测**；内部 event + idempotency **已有已测**；Slack/Lark/外网 Webhook **未配置/不可用**（仅保留目标+协议位，无真实账号） | 不装真实 webhook；保持注册式边界 |
| 2 | Condition/parallel/loop/timer/retry/pause/resume | GC 主体（condition/parallel P0–P1/loop/retry/wait/timeout/pause/cancel/resume）**已有已测**；真正并行写隔离仍受限（P0 串行排空须明示） | 回归不削断言 |
| 3 | Reusable Agents + Agent↔Workflow 互调 | Agent roles/wiring/pool **已有待测/需增强**；互调深度/预算共享 **需新增**（部分预算字段已有） | 本批不扩 Runtime |
| 4 | Human review/edit/assign/intervene + external approval | Human modes + HITL **已有已测**；**审批未绑定产物/工程基线 → 变更后仍可假有效（已证实缺口）**；外部 IM 审批 **未配置** | **本批垂直切片** |
| 5 | Engineering context (C4/GitHub Graph/Agent Pool/Issue/PR/tests) | Spec/instance 分离、artifacts、freshness path fingerprint **已有已测**；产物↔代码版本绑定不足 | 本批补 engineeringBaseline |
| 6 | Observability of exec/tools/code/tests/fail/recover | nodeRecords、Run panel、history **已有已测**；approval_stale / evidence stale 负例弱 | 本批加 stale 审批事件与测试 |

## Batch-1 vertical slice

Make delivery-gate approvals trustworthy:

1. Human approval binds `actor` + `instance` + artifact ids + `engineeringBaseline` + `operationDigest`.
2. After ChangeSet / TestReport / ReviewResult changes, pending approval clears and side-effect Actions re-require HITL (`approval_stale`).
3. Bare historical `human_decision` with choice≈approve no longer authorizes GitHub/Terminal alone.
4. AI Edit mode proposes a draft offer (diff/apply) instead of silently overwriting; accept/dismiss/undo preserved.
5. `pickNextCursor` prefers direct depends successors and completes path terminals (unblocks Feature Dev E2E that previously resurrected skipped `n_test`).

## Batch-1 verification (this branch)

```text
npx vitest run services/loop-approval-binding.test.ts \
  services/loop-goal-authoring-service.test.ts \
  services/loop-runtime-architecture.test.ts \
  services/loop-runtime-actions.test.ts \
  services/loop-runtime-roles.test.ts \
  services/loop-runtime-service.test.ts \
  contracts/loop-artifacts.test.ts \
  client/mock-loop-graph-store.test.ts
→ Test Files 8 passed | Tests 46 passed | exit 0
```

Baseline note: Feature Dev roles assertion `n_test` vs `n_approval` already failed on pristine `bec3dd7` before this branch; fixed here via cursor selection. No live Slack/Lark/PR/email. Typecheck still reports pre-existing desktop/session-affinity errors unrelated to this slice.

## Deferred (not blocked)

- User choice of first Slack vs Lark connector / cloud deploy / always-on webhook.
- Live external messaging or paid model calls (fixtures only).
- GC-6.5 minimap polish.
- Next slice candidates: connector protocol fixtures (Slack/Lark) without live accounts; Agent↔Workflow mutual-call depth/budget; evidence content hash from workspace files beyond artifact JSON.
