# Observability 与 Model Gateway 开发计划

**状态**：Draft（2026-10-20）。O-0、O-1、GW-0、GW-1 已落地。  
**范围**：同一次任务能对上模型请求、工具结果和验证结论；能看见这次花了多少 token。不在这里做自动换模型或计费。  
**总计划**：[`Backend-Dev-Plan.md`](Backend-Dev-Plan.md) Phase 1 只做 O-0 与 GW-0。  
**锚点**：

- 网关：`services/model-gateway/gateway.ts`、`providers.ts`。统一完成、工具循环、脱敏。
- 用量：`ModelGatewayResponse.usage` 含输入和输出 token。编排器事件里有 `tokenUsage`。
- 请求种类：`contracts/model-gateway.ts` 的 `requestKind`（分解、结构图扫描、改动生成、计划、问答等）。
- MCP 循环上限：默认 8 轮、32 次工具调用，另有总时长。
- 失败分类：`services/agent-orchestrator/child-failure-category.ts`，目前覆盖委托子运行。
- 按模型改提示：`.projectos/model-harness.json` 的 `systemDelta`。这是文案差异，不是路由器。
- 执行开关：`services/execution-router.ts`。没配置模型时可以落到 fixture。`agentRunUsesExternal` 固定返回 false。

**对标一句话**：观测回答「这次失败卡在模型、检索、工具还是验证」。网关回答「这次调用了谁、用了多少 token」。选更贵的模型不是默认策略。

## 0. 现状

| 已有 | 缺口 |
|------|------|
| 多供应商适配、连接测试、列模型 | 没有按任务难度切换模型 |
| 每次响应的 token 和延迟 | 没有按 run 汇总，也没有单价 |
| `requestId` | 没有要求写进 run 事件，失败时对不齐 |
| 工具循环的次数和时长上限 | 只包住 MCP。叶子流水线的模型次数没有同一份预算对象 |
| 脱敏 | 有。观测记录必须走同一条，不能另存一份原文 |
| 子运行失败分类 | 没有扩展到「检索为空、验证失败、政策拒绝」 |

## 1. 观测切片

### O-0 — 把一次运行的调用串起来

**目标**：打开一个失败的 run，能看见每次模型调用的种类和 id。

- [x] 编排器发出模型请求时，把 `requestId`、`requestKind`、`model`、延迟和 usage 写进该 run 的事件。
- [x] 工具结果引用 Tools T-0 的摘要和 `ok`，不复制完整输出。
- [x] 验证证据 id 写进同一条运行。证据本身的形状以 Verification 计划为准。
- [x] fixture 运行标记 `backend: "fixture"`，不把演示结果统计成模型质量。

**验收**：一次叶子 Change 的 JSONL 里能按时间看到 context、generate、validate、verify。中途失败时，最后一条模型事件仍然有 `requestId`。

### O-1 — 失败落点

**目标**：人能看出该先看哪一层。不做自动修复。

- [x] 在现有子运行分类之外，为单次运行增加互斥原因：`model_error`、`policy_denied`、`apply_failed`、`verification_failed`、`verification_not_run`、`interrupted`、`cancelled`。
- [x] 原因来自事件和证据，不来自模型的自我评价。
- [x] UI 可以后做。本切片先保证事件里有这个字段。

**验收**：命令失败的运行原因是 `verification_failed`，不是 `model_error`。用户取消是 `cancelled`。

### 明确不做（观测）

| 项 | 原因 |
|----|------|
| 托管追踪后端、指标大盘 | 本地 JSONL 够用到 Phase 4 |
| 保存完整提示词原文以便「回放调试」 | 与脱敏和密钥约束冲突。回放用上下文哈希和各槽快照 |
| 用成功率自动改提示词 | 没有离线任务集之前会过拟合演示 |

## 2. 网关切片

### GW-0 — 单次运行的用量合计

**目标**：Phase 1 能回答「这次大概用了多少 token」。

- [x] 汇总该 run 事件里的 input 与 output token，包含校验器等后续调用。
- [x] 子 run 单独汇总，父 run 记录子 run id，避免父子重复相加后说不清。
- [x] 供应商没返回用量时记 0，并标记 `usage: "missing"`。不要估算成一个看起来精确的数。
- [x] 不乘单价，不做配额，不阻断运行。

**验收**：两次模型调用的 token 相加等于运行合计。fixture 运行合计为 0 且标记不是模型。

### GW-1 — 预算对象与 Harness 对齐

**目标**：流水线和 MCP 循环用同一组上限字段。实现放在 Harness H7，本文件只定网关要报告什么。

- [x] 网关在达到调用方给出的 `maxTotalDurationMs` 时返回明确错误，而不是空输出。
- [x] 错误进入 O-1 的 `model_error`，除非外层已经因为取消改成 `cancelled`。
- [x] 不在网关里做「失败了就换一个更贵的模型再试」。

**验收**：超时错误能在运行事件里看到。不会出现第二次静默换模型的请求。

### 明确不做（网关）

| 项 | 何时再看 |
|----|----------|
| 按任务难度路由、文件摘要用小模型 | Phase 4。要有 V-3 的任务集才知道省下的质量 |
| Prompt cache、结果缓存 | 上下文哈希已经能判断材料变了没。缓存容易把旧文件描述送回去 |
| 用户配额、计费、限流产品 | 没有账号系统 |
| 把 fixture 模式当成影子生产流量 | 只用于演示和测试 |

## 3. 依赖

O-0 可以和 Verification V-0 并行，但验证字段要等证据 id。GW-0 只依赖已经存在的 usage。GW-1 和 Harness H7 一起做。

## 4. 不变量

- 观测记录遵守与模型出口相同的脱敏。
- 缺失用量保持缺失。
- 网关不选择写哪些文件，不放宽 Policy，不因超时自动重试副作用工具。
- fixture 与模型的数字分开。

## 5. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-10-20 | 初稿。把运行事件和网关用量收成可对齐的日志，并把路由、缓存、计费留在 Phase 4。 |
| 2026-10-20 | 落地 O-0 与 GW-0。模型事件带 requestId；缺用量记 missing 且 token 为 0。子 run 只记 id，不并进父运行合计。 |
| 2026-10-20 | O-1 用事件给出互斥失败原因。GW-1 超时返回错误并记为 model_error，取消仍是 cancelled。 |
