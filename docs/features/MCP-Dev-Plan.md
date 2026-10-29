# MCP Capability Completion Dev Plan

**状态**：Implemented（2026-10-29）— MCP-0–MCP-5 已落地；人工冒烟见 Eval Checklist。  
**市场演进**：见 [`MCP-Marketplace-Dev-Plan.md`](MCP-Marketplace-Dev-Plan.md)（A3 目录基座 → B2 策展+社区）。  
**权威邻居**：[`Agent-Harness-Tool-Registry.md`](Agent-Harness-Tool-Registry.md)、[`backend/Tools-Integrations-Dev-Plan.md`](backend/Tools-Integrations-Dev-Plan.md)、[`backend/Security-Governance-Dev-Plan.md`](backend/Security-Governance-Dev-Plan.md)、`projectos/services/model-gateway/gateway.ts`

**合格线**：用户能配置并探测 MCP 服务器；Ask 在 `permissions.json` allow 后可真实调用工具；每次调用过 ToolPolicy；`usedMcp` 诚实；失败与 deny 可见。市场浏览/安装见 Marketplace 计划，不替代本文件的 runtime 合格线。

## 0. 产品约束

- **有界 MCP，不开 Route ②**：服务器决定何时把哪些 MCP 工具塞进模型。
- **v1 只做 Tools**（list + call）。Resources / Prompts / Sampling 不做。
- **传输**：`stdio` + `http`（SDK Streamable HTTP / SSE）。目录安装见 Marketplace 计划。
- **工具名**：`mcp:{serverId}:{toolName}`。
- **默认关闭**：无 allow 规则 / `enabled: false` → 工具表为空。
- **MCP 结果不可信**：进数据边界，不进 system rules；输出脱敏截断。

## 1. 切片

| ID | 主题 | 说明 |
|----|------|------|
| MCP-0 | 文档与契约 | `mcpServers`、secret ref、`AgentAnswerResult.mcpToolCalls` |
| MCP-1 | Runtime | `services/mcp/` session / transport / catalog / execute + guards |
| MCP-2 | API / IPC / store | save / test / refresh / delete |
| MCP-3 | Ask 有界接线 | `GroundedAnswerService` → `completeWithTools`；诚实 `usedMcp` |
| MCP-3b | Run 事件钩子 | `recordMcpToolCall` 供后续 Agent run |
| MCP-4 | Settings UI | MCP 服务器管理 |
| MCP-5 | 安全与验收 | SSRF / redaction / checklist / registry |

## 2. 明确不做

| 项 | 原因 |
|----|------|
| Route ② 自由 tool loop | Harness / Backend 锁定 DEFERRED |
| Resources / Prompts / Sampling | v1 范围外 |
| OS 级沙箱隔离 stdio 子进程 | 与 shell softOnly 一致 |
| 自动 `permissions.json` allow（含目录安装） | 安全不变量；见 Marketplace |

> MCP 服务器市场已从「永久不做」改为独立计划 [`MCP-Marketplace-Dev-Plan.md`](MCP-Marketplace-Dev-Plan.md)。

## 3. 验收

1. Settings 添加 stdio MCP → Test 成功并列出 tools。
2. `permissions.json` allow `mcp:demo:*` 后，Ask 能调用；回答带 `mcpToolCalls`。
3. 无 allow 时仅 policy deny，无真实 `callTool`。
4. HTTP 指向内网/metadata 被拒；secret 不进 settings JSON / 事件。
5. `enabled: false` 或断连 → 工具表空 / test 诚实失败。
6. 用过 MCP 的 Ask 不触发记忆生成（`usedMcp: true`）。

## 4. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-10-29 | 初稿落地；开始按 MCP-0→MCP-5 实现。 |
| 2026-10-29 | MCP-0–MCP-5 实现：契约、Runtime、API/IPC/UI、Ask `completeWithTools`、`recordMcpToolCall` 钩子。 |
| 2026-10-29 | 补齐缺口：HTTP SSE 回退、guarded fetch/DNS 单测、LocalApi MCP CRUD 单测、Ask `mcpToolCalls` 活动行与 grounded-answer 工具循环单测。 |
| 2026-10-29 | 市场从本文件「明确不做」迁出至 Marketplace Dev Plan（A3→B2）。 |
