# Verification：验证证据与质量闭环开发计划

**状态**：Draft（2026-10-20）。V-0、V-1、V-2 已落地。V-3 只记录离线分数，不作为用户任务的验收。  
**范围**：一次任务是否做完，由命令结果和计划范围决定，不由模型的结束语决定。离线 Eval 放在本文件后部，不挡 Phase 1。  
**总计划**：[`Backend-Dev-Plan.md`](Backend-Dev-Plan.md) Phase 1。  
**锚点**：

- `services/verification-runner.ts`：已批准的命令经 `runHarnessShell`，工具名 `run_verification`。
- `services/verification-command-approval.ts`：空命令集是 `not_configured`；哈希对不上是 `approval_required`。
- 批准持久化：`FileVerificationCommandApprovalStore` 已由 `desktop/src/main/projectOsService.ts` 注入。服务本身在未传入 store 时仍回落到内存，那种入口重启后会丢掉批准。
- 编排器在 `review_first` 下可以诚实记录 `not_run`。whole-tree 在验证失败时 `failWholeTreeRuns`，不会自动再改。
- 活动证据：`services/agent-activity-evidence.ts` 截断并脱敏输出，上限 12 000 字符。
- 人工清单：[`Agent-Harness-Eval-Checklist.md`](../Agent-Harness-Eval-Checklist.md)，不是 CI 门禁。

**对标一句话**：线上验证回答「这一次过了没有」。离线评估回答「这一版产品是否更好」。两者都还没有成系统，先做线上证据。

## 0. 现状

| 信号 | 今天 |
|------|------|
| 配置了命令且已批准 | 真的执行，结果进入运行 |
| 没配置 | `not_configured` / 运行侧 `not_run` |
| 模型对照验收标准 | 有。校验器读提案和标准，零写权限。这是审查，不是测试证据 |
| 失败后自动修复 | 无。失败会让整树失败 |
| 相关测试选择 | 无。命令集是项目配置，不是按改动文件算出来的 |
| 计划外文件 | apply 的路径受叶子 ACL 约束。没有一份「计划点名的文件 vs 实际写入」的核对记录 |
| 完成率、首次通过率、成本 | 无 |

`not_run` 必须继续和 `passed` 区分。本计划不把「没跑」显示成成功。

## 1. 证据记录

```text
VerificationEvidence {
  runId: string
  status: "passed" | "failed" | "not_run"
  reason: "commands_passed" | "command_failed" | "not_configured"
        | "approval_required" | "policy_denied" | "timed_out"
        | "output_truncated" | "unexpected_paths"
  commands: ToolResult[]     // Tools T-0
  unexpectedPaths: string[]  // 实际写入减去计划路径
}
```

验收标准文本可以附在记录上，但不得单独把状态打成 `passed`。标准是否满足，在有命令证据之前只显示为「尚未用命令验证」。

## 2. 切片

### V-0 — 每次运行一份证据

**目标**：UI 和 Loop 读同一份状态。

- [x] 叶子运行结束时写入 `VerificationEvidence`。没跑命令时 `status: "not_run"`，`reason` 说明是没配置、待批准还是被 Policy 拒绝。
- [x] 命令结果使用 Tools T-0。全部退出码为 0 才是 `passed`。任一失败、超时或截断到无法判断，都是 `failed`。截断时 `reason` 写明，不能算通过。
- [x] 生产入口继续传入 `FileVerificationCommandApprovalStore`。未传入 store 的调用使用内存存储，新实例看不到上一份批准。
- [x] 事件里不放完整日志，只放状态、原因、退出码和截断标记。正文留在已脱敏的工具结果里。

**验收**：未配置命令的成功 apply，最终状态不是 `passed`。配置了会失败的命令时，状态是 `failed`，文件保持已应用，直到用户 undo。这和今天「失败不自动 undo」一致。

### V-1 — 计划路径与实际写入

**目标**：发现叶子计划之外的写入。

- [x] 比对 `FileEditPlan` 里的路径和 apply 实际路径。
- [x] 多出来的路径写入 `unexpectedPaths`，证据状态为 `failed`，即使命令退出码是 0。
- [x] 不在这里自动回滚。回滚仍走现有 backup。

**验收**：计划只含 `a.ts` 但事务写了 `b.ts` 时，证据失败并列出 `b.ts`。正常的单文件叶子不会误报。

### V-2 — 相关测试只作为建议

**目标**：改动文件旁边的测试能被看见。跑不跑仍由已批准命令集决定。

- [x] 当 Code Intelligence CI-3 可用时，把相关测试路径附在证据的建议名单里。
- [x] 建议名单是只读上下文，不自动变成要执行的 shell，也不扩大写范围。
- [x] CI-3 未做时，本切片不猜测测试路径。符号索引文件不存在时建议名单为空；文件存在时才填入其中的相关测试。

**验收**：没有符号索引时，证据里没有编造的测试文件。有索引时，名单出现，命令仍只跑用户批准过的那一组。

### V-3 — 离线评估

**目标**：比较 Harness 或检索改动是否让任务更差。分数只存在于离线记录。

- [x] 固定一小套仓库任务：期望改哪些文件、哪条命令必须通过。
- [x] 记录完成、第一次验证是否通过、修复轮数、token、人是否介入。
- [x] 不把这个分数显示成用户任务的验收结果。

`scoreOfflineEval` 的 `countsAsUserAcceptance` 固定为 false。用户任务是否通过仍只看 `VerificationEvidence`。

### 明确不做

| 项 | 原因 |
|----|------|
| 用模型阅读 diff 后宣布测试通过 | 那是审查意见，进不了 `passed` |
| 失败后无限重跑命令 | 次数由 Harness H7 |
| 自动安装依赖来让验证变绿 | 网络默认关闭 |
| 把 Eval 清单改成唯一的 CI | 现有清单仍是人工抽检 |

## 3. 和修复的边界

V-0 只生产证据。要不要再生成一次 diff，由 [`Agent-Harness-Dev-Plan.md`](../Agent-Harness-Dev-Plan.md) 的 H5 决定：仅当 `failed` 且原因是命令失败，并且还没用过那一次修复额度。`not_run` 和 `unexpectedPaths` 不自动修复。

## 4. 不变量

- `passed` 当且仅当所有已执行命令退出码为 0，且 `unexpectedPaths` 为空。
- `not_run` 永不显示为通过，也永不触发 H5。
- 验证命令的批准是对命令集哈希的批准，不是对模型任意 shell 的批准。
- 校验器仍然零写权限。它不能因为「标准没满足」自己去改文件。

## 5. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-10-20 | 初稿。对照验证运行器、命令批准和编排器的 `not_run`，把证据、计划外文件和建议测试分开。 |
| 2026-10-20 | 落地 V-0 证据、V-1 计划外路径、V-2 在没有符号索引时不猜测测试。 |
| 2026-10-20 | H5 开始消费这份证据：只有命令失败或超时才会再生成一次。 |
| 2026-10-20 | V-3 记录固定任务的完成、首次验证、修复轮数和 token。该分数不能变成 `passed`。 |
