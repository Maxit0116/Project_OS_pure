# Tools：Agent 可用的操作面开发计划

**状态**：Draft（2026-10-20）。T-0 至 T-3 已落地。范围冲突仍抛 `diff_scope_violation`，错误和成功的 apply 都带 `ToolResult`。  
**范围**：把已经存在的读、写、验证、Git 读取和 MCP，收成 Agent 能消费的结构化结果。不增加一套平行工具运行时。  
**总计划**：[`Backend-Dev-Plan.md`](Backend-Dev-Plan.md) Phase 1。  
**权威邻居**：

- 工具名单与 Policy：[`Agent-Harness-Tool-Registry.md`](../Agent-Harness-Tool-Registry.md)、`services/harness/tool-policy.ts`
- 执行入口：`services/harness/run-shell.ts`、`services/agent-tools/index.ts`
- Git 只读：`services/git-context-service.ts`（工作区 diff 与相对某基线的 diff，截断到 32 000 字符）
- MCP：`ModelGateway.completeWithTools`

**对标一句话**：竞争力不在工具个数，而在结果是否带退出码、差异和范围，并且每次副作用都过 ToolPolicy。

## 0. 现状

| 工具 | 现状 |
|------|------|
| `read_file` / `list_files` / `get_context` | 已实现。读路径必须在 `allowedReadPaths`，或是无单文件路径的节点索引 |
| `generate_diff` / `apply_diff` | 编排器阶段，不是模型随手调用。写路径再经 Policy 和事务内核 |
| `run_verification` / `shell` | `runHarnessShell`。输出有 64KB 上限和超时，返回里有命令结果，但调用方没有统一的「摘要 + 退出码 + 是否截断」契约 |
| `mcp_tool` | 默认 deny。`permissions.json` allow 之后才执行 |
| `fetch` | deferred，默认 deny |
| `grep_workspace` | 不是模型工具。Ask 由服务器检索 |
| Git | 只读 diff。没有 status 结构，没有 commit / branch / revert |
| 浏览器 | 无 Agent 工具。空间钉选是另一条产品路径 |

未知工具名一律 deny。这个门保持不变。

## 1. 结果信封

所有新返回值使用同一形状，旧的编排器内部结构可以包一层，不要两套字段名。

```text
ToolResult {
  tool: HarnessToolName
  ok: boolean
  exitCode: number | null
  summary: string          // 短，给模型和 UI
  output: string           // 已截断、已脱敏
  truncated: boolean
  artifacts: {             // 可缺
    paths?: string[]
    diffStats?: { files, additions, deletions }
  }
}
```

`summary` 由服务器生成，不由模型事后编。测试命令的摘要至少包括退出码；能解析出失败个数时写上个数，解析不了就只写退出码和「输出已截断」。禁止在解析失败时写「测试通过」。

## 2. 切片

### T-0 — 验证与 shell 的结果信封

**目标**：Harness H5 和 Verification V-0 拿到的是同一份结构，而不是各自切片日志。

- [x] `runHarnessShell` 的返回补上 `summary`、`truncated`、`exitCode`。超时记 `exitCode: null` 和明确的超时摘要。
- [x] 脱敏沿用 `redactText(..., "secrets_and_paths")`。摘要里也不留密钥样貌。
- [x] 不改变 allow / ask / deny。ask 未批准时不产生假的 `ok: true`。

**验收**：一个非零退出的 `npm test` 得到 `ok: false`、非零 `exitCode` 和含失败信息的短摘要。被 Policy 拒绝时没有进程，结果 `ok: false`。

### T-1 — Git 只读状态

**目标**：Agent 知道当前分支、是否脏、工作区 diff 是否被截断。仍然不能提交。

- [x] 新查询：`branch`、`dirty`、`ahead` / `behind`（取不到就 omission）、已有 diff 的截断标记。
- [x] 不是 git 仓库时返回明确错误，不抛未捕获异常到编排器外面。
- [x] 此查询是只读，Policy 用 `list_files` 同级的允许，不要求写能力。
- [x] 不提供 `git commit`、`push`、`reset`、`clean`。

**验收**：有未提交修改时 `dirty: true`。diff 超过上限时 `truncated: true`，调用方不能把截断 diff 当成完整补丁去应用。

### T-2 — 检索与符号查询不做成模型工具

**目标**：把边界写进工具清单，避免实现时开一条旁路 grep。

- [x] 更新 [`Agent-Harness-Tool-Registry.md`](../Agent-Harness-Tool-Registry.md)：词法检索和将来的符号查询保持服务器调用，`grep_workspace` 继续不是开放工具。
- [x] `runAgentTool` 对未知名字仍然 deny。

**验收**：模型输出里出现 `grep_workspace` 或任意新名字时，Policy 拒绝，编排器不执行。

### T-3 — 写文件仍然只走事务

**目标**：不新增「模型直接 writeFile」工具。

- [x] 叶子修改继续 `generate_diff` → validate → apply。没有新增模型直接 `writeFile`。
- [x] `applyDiffToToolResult` 用 T-0 信封描述相对路径、backup id、是否写入。叶子 apply 的成功、空变更和恢复失败都会带上这份信封。
- [x] 路径不在 `allowedWritePaths` 时，Policy 拒绝带 `ToolResult`（`ok: false`，无写入路径）。`diff_scope_violation` 仍是抛错，错误详情里有同一份拒绝信封，不是部分写入。

**验收**：与今天的 `diff_scope_violation` 行为一致，只是拒绝也有 `ToolResult`。

### 明确不做

| 项 | 放到哪 |
|----|--------|
| 模型自由工具循环 | Harness 仍 DEFERRED Route ② |
| `git commit` / push / 发布 | 有持久审批记录之前不做，见 Security |
| 用户发起的 workspace branch checkout / create / fetch | Compose GitHub Hub（见 [`../GitHub-Compose-Hub-Dev-Plan.md`](../GitHub-Compose-Hub-Dev-Plan.md)）；IPC 写操作，不是开放 agent 工具 |
| 浏览器自动化 | 不是本阶段差异化 |
| 社区上传 / 审核后台 | 市场见 [`../MCP-Marketplace-Dev-Plan.md`](../MCP-Marketplace-Dev-Plan.md)；仍只消费 Policy 门控的 `mcp_tool`，目录安装 ≠ allow |

## 3. 依赖

T-0 阻塞 Verification V-0 和 Harness H5。T-1 可与 T-0 并行。T-2、T-3 是约束，不是新功能，应在有人加工具时先改清单。

## 4. 不变量

- 副作用工具只有 `runHarnessShell`、apply 事务和已门控的 MCP。编排器里不再新增 `spawn`。
- 工具结果是不可信数据，可以回填给模型，但不能改 Policy 或写范围。
- 截断必须可见。禁止把截断输出拼成「完整日志」。
- 幂等：同一次 apply 使用已有备份 id，不因为重试再写一遍。细节见 Session S-2。

## 5. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-10-20 | 初稿。对照工具清单、`runHarnessShell` 和 `git-context-service`，把合格线收成结果信封和 Git 只读状态。 |
| 2026-10-20 | 落地 T-0 结果信封、T-1 `git_status`、T-2 清单约束，以及 T-3 的 Policy 拒绝信封。 |
| 2026-10-20 | T-3：叶子 apply 成功和 `diff_scope_violation` 都带 `ToolResult`。 |
| 2026-10-29 | MCP 市场从「明确不做」改为指向 Marketplace Dev Plan；工具执行仍只经 Policy。 |
