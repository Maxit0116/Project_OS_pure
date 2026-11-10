# Loops Graph · Six Goals Execution Tracking

**Baseline**: `graph` @ `bec3dd75ef9ab0b50e7b7b564fb91ea5adf0f398`  
**Branch**: `cursor/loops-dispatch-evidence-cab8` (stacked on approval-binding PR9 `ccf2804`; targets `graph`; no third stack layer)  
**Prior tip**: `615fa644` (PR10 review base)  
**Updated**: 2026-11-10 (A–D reliability blockers after `615fa644` review)

Status keys: **已有已测** · **已有待测/需增强** · **需新增** · **未配置/不可用**（禁止标假完成）

| # | Goal | Inventory (source-checked) | Status |
|---|------|----------------------------|--------|
| 1 | GitHub/Slack/Lark + Trigger/Action/Webhook/HTTP | Shared `settleGithubDispatch` (LocalApi production entry) **已有已测**：strict head/base(+owner/sha) lookup、priorResult by dispatch identity、CAS/instance lock、unknown in_flight journal、deny-before-HTTP 不擦 in_flight；Slack/Lark live **未配置** | 可靠性优先于扩 connector |
| 2 | Condition/parallel/loop/timer/retry/pause/resume | GC + parallel drain **已有已测**；cancel/pause mid-dispatch 不复活 **已有已测** | 回归保留 |
| 3 | Reusable Agents + 互调 | roles/wiring **已有待测/需增强**；互调预算 **需新增** | 下一切片（后续可做，非「未决」停） |
| 4 | Human review/approval | binding + choice whitelist **已有已测**；actor 外部鉴权 **未配置** | — |
| 5 | Engineering context | workspace digester + tombstone + symlink 越界拒绝 **已有已测**；Verify 启动真实 test run + evidenceId 绑定 + start/mid/end digest **已有已测**；旧证据+新码拒盖章 **已有已测** | — |
| 6 | Observability | `approval_stale` / `delivery_stale` / dispatchJournal `unknown` **已有已测** | — |

## Reliability slice (this round · A–D)

1. **A lookup / priorResult**: `matchListedPullRequestForPending` uses ListedPullRequest contract (`headRef`/`baseRef`/`state` + optional `headOwner`/`headSha`). Missing head/base, cross-fork same branch, closed/merged, multi-match, incomplete page → `unknown` (no create). `findPriorGithubOpResult` requires idempotencyKey + operationDigest (+ baseline when bound); nodeId+ok alone never reuses.
2. **B settle CAS**: per-instance lock; reload after awaits; cancel/pause mid-HTTP audits result without resurrecting; `denyPendingGithubOpBeforeHttp` refuses to clear `in_flight`/journaled unknown (blocks create#2).
3. **C single scheduler**: `ProjectOsLocalApi.settlePendingGithubOp` → `settleGithubDispatch`; probes call the same function with persisted load/save (preflight 0 create, mid-flight stale 1 create, unknown lookup1/create0, concurrent 1 create, cancel 0).
4. **D Verify**: enter starts verify-owned `fix` AgentRun; binds `verificationEvidenceId`; start/mid/end workspace digest; old implement evidence cannot stamp; code change after start refuses stamp.

## Six-goal follow-ons (keep tracking · not blocked as「未决」)

- Goal1: Slack/Lark connectors + live webhook auth when credentials exist
- Goal3: agent-to-agent call budget / recursion caps
- Goal4: external actor attestation beyond `local_declared`
- Goal5: privileged-path denylist + size caps hardening beyond current digester
- Goal6: exportable dispatch/verify audit stream

## Verification

```text
npx vitest run <24 loop-related files incl. loop-github-dispatch.test.ts>
→ Test Files 24 passed | Tests 144 passed | exit 0
  (prior PR10 gate: 23 files / 128 tests — not withdrawn; expanded)

Typecheck vs 615fa644: 161 → 160 error TS (no new loop regressions; fixed settle exactOptional + role)
```

No merge / paid / live outbound / Mac.
