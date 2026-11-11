# RunBinding — verified product path (not a gap dump)

**Updated**: 2026-11-10 · PR10 tip `eaf6b39` · **非 shipped / 非 live**  
本文替代 Tracking 里含糊的「remaining gaps if any」：下列每项均有**已跑通**测指针。未列入 = **需用户 live 授权**或明确非本流目标，不写「或许还有」。

> **漂移纠正**：历史产物 `/opt/cursor/artifacts/pr-final/RUNBINDING-GAP.md` 第 29 行曾写  
> `Tip-final desktop/workbench rebuild + viewport reshoot still outstanding`。  
> 该句已过时：tip-final 三层 build + 全量 npm test 已在 `a255f33` / 当前 tip `eaf6b39` 实跑 EXIT 0。  
> **以本文件 + `gate-full/EXITS-eaf6b39.txt` 为准**；勿把 archived `pr-final/` 草稿当现行结论。

## 已核（实现 + contract / LocalApi）

| 条款 | 产品入口 | 验证级别 | 测指针 |
|------|----------|----------|--------|
| 内容身份 `codeDigest` ≠ `identityDigest` | `buildRunBindingSnapshot` / start | contract | `loop-run-binding.test.ts` identity / non-git |
| dirty/untracked / oversized → `codeDigestStatus=incomplete` | captureWorkspaceIdentity | contract | same · incomplete oversized |
| incomplete 阻断生产 start | `assertCodeDigestComplete` ← `startLoopInstance` requirePreflight | contract + runtime | `loop-run-binding.test.ts`；`loop-runtime-service.ts` start gate |
| budget/permissionSet **消费时冻结** | snapshot + runtime freeze check | contract | `loop-run-binding.test.ts` freeze；`assertCredentialAllowedByFreeze` |
| 凭证不在 frozen set → 拒 | runtime connector / settle | contract + LocalApi | runtime Batch1 路径；`settleConnectorOperation` + `loop-batch3-gmail-offline.local-api.test.ts` freeze 负例 |
| 有 credential 但无 binding / 无 permissionSet / 空 set → 拒 | `assertCredentialAllowedByFreeze` | contract | `loop-run-binding.test.ts` fail-closed cases（optional ≠ allow-all） |
| 审批上下文 `runApprovalContextDigest` | approval binding | contract | `loop-approval-binding.test.ts` |
| 材料/预算 digest 漂移 → 批准失效 | `isApprovalBindingCurrent` | contract | same · rejects reuse when materials/budget drifts |
| ChangeSet contentDigest 漂移 → approval_stale / 预检阻 HTTP | GitHub dispatch | contract | same · preflight blocks when digests stale |
| takeover 废止 pending 审批 | HITL | contract | same · takeover invalidates |
| LocalApi 产品入口 digests | start / G3–G6 | LocalApi | `loop-product-entry-g346.local-api.test.ts` |
| Electron UI Start→runBinding | Run materials Start enabled click | localE2E | `loops-start-pause-resume-evidence.json`（`start_has_run_binding`） |

## 明确非本流 / 需用户授权 / 原文后续增强

| 项 | 分类 |
|----|------|
| 真 git remote + 付费 ModelGateway 视觉 digest live | **未live**（需用户账号/密钥） |
| OAuth HITL 真人审批会话 | **未配置** |
| 用 helpers-only 冒充 LocalApi settle | **禁止**；Batch3/Gmail 已补 LocalApi 负例 |
| **完整 ACL 矩阵**（超出 freeze + credentialRefIds + HITL high-risk） | **原文后续增强**：Project-Workflow §3.1 写明 `budget`/`permissionSet` 为**部分**（stopPolicy/retryPolicy）；**不是**本阶段以 live 借口跳过的必需项 |
| 桌面自动 settle UI / 离线队列自动 recover | **本阶段边界 = LocalApi + IPC 队列 API**（`enqueueOfflineLoopEvent` / `drainOfflineLoopEventQueue`）；非 DI `executeConnectorOperation` 拒绝且不排队；**不以** mock/`contracts/api` 存在冒充桌面完整自动链路 |

## 结论

RunBinding **原阶段必需项**（内容身份、incomplete 阻断、消费冻结、批准失效）在当前 tip **已有可指向证据**；tip-final rebuild **已完成**（非 outstanding）。剩余仅 **live 用户授权** 类与 ACL 矩阵后续增强，不另造增强。
