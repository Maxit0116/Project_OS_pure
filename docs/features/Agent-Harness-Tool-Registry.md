# Agent Harness — Tool Registry Inventory (H0.3)

**状态**：对齐 H0–H4（2026-10-19）  
**权威开发计划**：[`Agent-Harness-Dev-Plan.md`](./Agent-Harness-Dev-Plan.md)  
**Policy 契约**：`projectos/contracts/tool-policy.ts`  
**求值器**：`projectos/services/harness/tool-policy.ts`

凡带副作用的工具必须经 ToolPolicy。状态：`implemented` | `planned` | `deferred`。

| Tool id | 来源 | 状态 | H0 Policy | 说明 |
|---------|------|------|-----------|------|
| `read_file` | `agent-tools` (`readFile`) | implemented | allow if path ∈ `allowedReadPaths` | 工作区相对路径读 |
| `list_files` | `agent-tools` (`listFiles`) | implemented | allow（只读索引元数据） | 语义 fileIndex 列表 |
| `get_context` | `agent-tools` (`getContext`) | implemented | allow if path ∈ `allowedReadPaths`（filePath） | nodeId 变体仍走服务，无路径时 H0 要求 path |
| `grep_workspace` | Ask 探索（服务内启发式） | planned as named tool | deny as open tool | H1.B 用服务端符号 grep + `read_file` Policy，不开放模型调 grep |
| `generate_diff` | orchestrator 阶段 | implemented（阶段，非模型随意调） | writeCapability + paths ⊆ `allowedWritePaths` | 生成后仍有 identity 再校验 |
| `apply_diff` | apply 事务 | implemented（基础设施） | 同上 | 与 generate 共用写 ACL |
| `run_verification` | verification runner | implemented | 需 writeCapability | 命令白名单 + 另有 approval 流 |
| `shell` | `runHarnessShell` + VerificationRunner | implemented (soft v0) | Policy allow/ask + soft classify | 未知二进制/网络 → ask；保护路径 → deny；无 OS Seatbelt |
| `mcp_tool` | `model-gateway` MCP loop | implemented | deny by default；`.projectos/permissions.json` allow 后放行 | `completeWithTools({ toolPolicy })` 门控 |
| `fetch` | — | deferred | deny unless permissions allow | 网络闸；可与 sandbox.networkAccess 对齐 |

## Orchestrator 内建阶段（非开放工具，但是 harness 可见操作）

| 阶段 | 状态 | 说明 |
|------|------|------|
| context_prepared | implemented | 声明式；不得伪装成「此刻新读」 |
| locate / file edit plan | implemented | live pipeline `FileEditPlan`（H2.A） |
| generate proposal | implemented | 须过 `generate_diff` Policy |
| validate proposal | implemented | 零写权限 validator（H2.B） |
| apply | implemented | 事务内核 |
| verify | implemented | 真命令或诚实 `not_run` |

## 未知工具

`evaluateToolCall` 对未注册名称一律 **deny**。
