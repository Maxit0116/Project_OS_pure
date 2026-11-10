# Loops Graph · Six Goals Execution Tracking

**Baseline**: `graph` @ `bec3dd75ef9ab0b50e7b7b564fb91ea5adf0f398`  
**Branch**: `cursor/loops-dispatch-evidence-cab8` (stacked on approval-binding; targets `graph`)  
**Updated**: 2026-11-10 (dispatch/evidence reliability slice after `ccf2804` review)

Status keys: **已有已测** · **已有待测/需增强** · **需新增** · **未配置/不可用**（禁止标假完成）

| # | Goal | Inventory (source-checked) | Status |
|---|------|----------------------------|--------|
| 1 | GitHub/Slack/Lark + Trigger/Action/Webhook/HTTP | GitHub settle **preflight before HTTP** + post-HTTP `delivery_stale` retain **已有已测**；in_flight query-before-resend **已有已测**；Slack/Lark live **未配置** | 可靠性切片优先于扩 connector |
| 2 | Condition/parallel/loop/timer/retry/pause/resume | GC + parallel drain **已有已测** | 回归保留 |
| 3 | Reusable Agents + 互调 | roles/wiring **已有待测/需增强**；互调预算 **需新增** | 下一切片 |
| 4 | Human review/approval | binding + choice whitelist **已有已测**；actor 外部鉴权 **未配置** | — |
| 5 | Engineering context | 累积交付 scope + tombstone + symlink 越界拒绝 **已有已测**；Verify start/end snapshot 盖章 **已有已测**；artifact 内容进 baseline **已有已测** | — |
| 6 | Observability | `approval_stale` / `delivery_stale` **已有已测** | — |

## Reliability slice (this round)

1. **HTTP dispatch boundary** (`settlePendingGithubOp` / `settlePendingGithubOpWithProbe`): preflight → zero HTTP on stale; mark `in_flight`; post-success always keep `github_op_result`; drift → `delivery_stale` (no erase/redo); unknown in_flight → lookup then deny blind resend.
2. **Delivery scope baseline**: accumulate all ChangeSets (files + deletedFiles); corrupt/empty illegal → fail-closed; digester uses `lstat`+`realpath` containment (symlink escape → unreadable); tombstones ≠ missing.
3. **Verify stamp**: capture live digest at enter; re-digest at end; stamp only if equal — never copy ChangeSet self-stamp onto cached evidence.
4. **Baseline material** includes artifact bodies (status/verdict) so same-id tamper invalidates.

## Verification

```text
npx vitest run <23 loop-related files: services/contracts/client/workbench Loop*>
→ Test Files 23 passed | Tests 128 passed | exit 0

# Includes HTTP probe 0/1 cases in loop-approval-binding.test.ts
# + checkpoint/freshness/idempotency via loop-runtime-service.test.ts
# + authoring/UI via workbench Loop* tests
```

Typecheck pristine compare (`bec3dd7`): previously exit 2 / 159 errors — re-check after push if CI requires. No merge / paid / live outbound / Mac.
