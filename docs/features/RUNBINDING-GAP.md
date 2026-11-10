# RunBinding — verified product path (not a gap dump)

**Updated**: 2026-11-10 · PR10 tip · **非 shipped / 非 live**  
本文替代 Tracking 里含糊的「remaining gaps if any」：下列每项均有**已跑通**测指针。未列入 = **需用户 live 授权**或明确非本流目标，不写「或许还有」。

## 已核（实现 + contract / LocalApi）

| 条款 | 产品入口 | 验证级别 | 测指针 |
|------|----------|----------|--------|
| 内容身份 `codeDigest` ≠ `identityDigest` | `buildRunBindingSnapshot` / start | contract | `loop-run-binding.test.ts` identity / non-git |
| dirty/untracked / oversized → `codeDigestStatus=incomplete` | captureWorkspaceIdentity | contract | same · incomplete oversized |
| incomplete 阻断生产 start | `assertCodeDigestComplete` ← `startLoopInstance` requirePreflight | contract + runtime | `loop-run-binding.test.ts`；`loop-runtime-service.ts` start gate |
| budget/permissionSet **消费时冻结** | snapshot + runtime freeze check | contract | `loop-run-binding.test.ts` freeze；`assertCredentialAllowedByFreeze` |
| 凭证不在 frozen set → 拒 | runtime connector / settle | contract + LocalApi | runtime Batch1 路径；`settleConnectorOperation` + `loop-batch3-gmail-offline.local-api.test.ts` freeze 负例 |
| 审批上下文 `runApprovalContextDigest` | approval binding | contract | `loop-approval-binding.test.ts` |
| 材料/预算 digest 漂移 → 批准失效 | `isApprovalBindingCurrent` | contract | same · rejects reuse when materials/budget drifts |
| ChangeSet contentDigest 漂移 → approval_stale / 预检阻 HTTP | GitHub dispatch | contract | same · preflight blocks when digests stale |
| takeover 废止 pending 审批 | HITL | contract | same · takeover invalidates |
| LocalApi 产品入口 digests | start / G3–G6 | LocalApi | `loop-product-entry-g346.local-api.test.ts` |

## 明确非本流 / 需用户授权

| 项 | 分类 |
|----|------|
| 真 git remote + 付费 ModelGateway 视觉 digest live | **未live**（需用户账号/密钥） |
| OAuth HITL 真人审批会话 | **未配置** |
| 用 helpers-only 冒充 LocalApi settle | **禁止**；Batch3/Gmail 已补 LocalApi 负例 |

## 结论

RunBinding **原阶段必需项**（内容身份、incomplete 阻断、消费冻结、批准失效）在当前 tip **已有可指向证据**；剩余仅 **live 用户授权** 类，不另造增强。
