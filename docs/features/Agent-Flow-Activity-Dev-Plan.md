# Agent Flow 活动展示：侧栏缩略 + 悬浮窗证据

**状态**：M0–M2 implemented（2026-10-19）。M3 仍明确不做。  
**范围**：AI Chat sidebar 里的过程缩略卡，以及 Agent Flow 悬浮窗里的可核对证据。覆盖 Ask / Agent（`change`）/ Plan / Debug 跑起来之后，开发者能看见思考、探索、读文件、改文件、跑命令。  
**权威交叉引用**：
- `docs/features/Chat-Modes-Cursor-Parity-Dev-Plan.md` — mode 管线、Ask 探索、诚实 Change（M1.A / M1.C）
- `docs/features/Agent-Harness-Dev-Plan.md` — ToolPolicy、shell sandbox、开放 tool loop 仍 DEFERRED
- `agent-requirements.md` — 图作用域、leaf-only write、诚实 pipeline（D1–D3）
- 契约：`projectos/contracts/events.ts`（`AgentFlowStep`、`AgentActionEvent`、`AgentTransientTrace`）
- Ask 探索：`projectos/services/ask-exploration-service.ts`、`AskExplorationTrace`（含 `hits[].preview`，前端今日未渲染）

**明确不复制 / 不做**：
- 不在侧栏展开思维链、代码片段、终端输出
- 不为了「看起来像 Cursor」恢复未发生的 theater 步骤（Understand / Inspect / Verify✓）
- 不因本计划提前开放模型 tool loop（Harness Route ② 仍 DEFERRED）
- 不把完整 diff 搬进悬浮窗；全文审阅仍走中间栏 Diff
- 不把未截断、未脱敏的文件或命令输出写入会话历史

**对标目标一句话**：侧栏像 Cursor 默认收起的一行（Thinking / Explored / Read / Edited / Ran）；点开或切到 Agent Flow 悬浮窗才能看到思维链、命中行、代码片段和终端输出。两处是同一条活动流的两种投影。

---

## 0. 产品分界（本文锁定）

| 表面 | 展示 | 不展示 |
|------|------|--------|
| **AI Chat sidebar** | 按时间排列的缩略行：动词、对象、计数、状态（running / complete / error） | 推理正文、路径列表、行号、preview、hunk、stdout/stderr。侧栏卡片**不可展开**这些内容 |
| **Agent Flow 悬浮窗** | 同一条活动的详情：reasoning、grep 命中、读文件片段、编辑 hunk 摘要、命令输出 | 第二套独立流程；不按 mode 整页换成另一套摘要 |

交互：
- 点击侧栏某一行 → 打开悬浮窗并滚动到同一 `activityId`。
- Ask / Agent / Plan / Debug 共用这套缩略行。
- 计划正文（`PlanReviewCard`）和 Debug 阶段条（`DebugSessionPanel`）留在侧栏：它们是结果和操作，不是过程证据。过程仍是活动缩略行，叠在这些卡片附近，不替换它们。

缩略文案对照：

| kind | 侧栏一行 | 悬浮窗详情 |
|------|----------|------------|
| `thinking` | Thinking | provider reasoning 全文（已截断则标明） |
| `planning` | Planning next move，或一句目标 | 锚点、验收标准、计划步骤 |
| `grep` | Explored，或 `Grep · N hits` | query、路径、行号、preview |
| `read_file` | `Read <filename>` | 路径、行范围、片段 |
| `edit` | `Edited <filename>` | hunk 摘要；完整 diff 仍去中间栏 |
| `shell` | `Ran <command> · passed/failed` | 命令、exit、截断后的 stdout/stderr、耗时 |
| `context` | `Context · N files` | 每文件 disposition、字节数、bundle hash |
| `mcp` | `<tool> · completed/failed` | server、耗时、截断后的结果摘要、错误 |

---

## 1. 证据级现状

### 1.1 两套表面，四套画面

Agent Flow 是 `AgentFlowOverlay`，不是聊天气泡里的过程。`agentFlowSubject` 决定整页内容（`AgentFlowPanel.tsx`）：

| Subject | 悬浮窗今日 | 侧栏今日 |
|---------|------------|----------|
| `ask` | `AskTraceView`：范围、文件清单、检索路径、可折叠 reasoning、完整回答。跑时一颗「正在搜索」药丸 | 回答上方可折叠「查阅了 N 个文件」（仅 `readPaths`）+ 检索命中路径 + markdown |
| `run`（Agent） | 粗阶段时间线 / 图：`context_prepared → locate_plan → generate_proposal → validate_proposal`；阶段下挂 `AgentActionRow` 元数据 | 确认卡、Pending changes、Diff。过程不在气泡里 |
| `plan` | `PlanTraceView`：目标、状态、步骤列表。整页替换时间线 | `PlanReviewCard` |
| `debug` | bug 描述、假设条数、复现步骤条数、阶段名 | `DebugSessionPanel` 阶段条 + CTA |

Ask 探索后端 `AskExplorationTrace.hits` 已有 `path` / `line` / `preview`。`ChatPanel` 只渲染 `readPaths` 和轮次。

### 1.2 已有事件，缺「一行 summary + 一份 detail」

Live Agent 阶段卡只有 label、kind、`outputSummary`、文件名 chip（`AgentFlowStepRow` / `AgentFlowStepDetail`）。动作行是统计，不是回放：

| 事件 | 今日 payload 能支撑的详情 | 缺口 |
|------|---------------------------|------|
| `context_assembled` | 路径、disposition、字节 | 侧栏没有对应缩略行 |
| `file_read` | 路径、字节、ok/failed | 无行范围、无片段 |
| `model_request` | provider、模型、耗时、token | 不是 Thinking 状态；reasoning 另走 `provider_reasoning` |
| `AgentTransientTrace` | reasoning markdown | 只在悬浮窗阶段下；侧栏无 Thinking 行 |
| `edit_plan_created` | objective、anchors、acceptance | 无 Planning 缩略行 |
| `diff_proposed` | operation + path | 无 hunk；侧栏无 Edited 行 |
| `verification_result` | 命令字符串 + passed/failed/not_run | **无 stdout/stderr** |
| `mcp_tool_call` | server、工具名、状态、耗时、error | 无结果摘要 |
| `tool_policy_decision` | allow/ask/deny + reason | 可作悬浮窗附注，不必单独占侧栏一行 |

`grep_workspace` 在 `tool-policy.ts` 中仍拒绝作为模型可调用工具。Ask 探索是服务端启发式（符号 → 搜索 → 授权 `read_file`），不是开放 tool loop。Shell 仅验证路径会发出 `verification_result`，且不含输出正文。

### 1.3 和 Cursor 的差距（本计划要补的只有展示层 + 证据字段）

Cursor 默认收起 Thinking / Explore，展开才是思维链和已查看内容。本产品把「展开」固定在悬浮窗，侧栏永远是收起态。今天两边都还没有这层活动模型：侧栏要么把路径列表摊开，要么完全不显示过程；悬浮窗按 mode 换整页，证据停在元数据。

---

## 2. 原则

1. **一条活动，两种投影。** 服务端（或会话状态）存 `summary` + `detail`。侧栏只读 `summary` 与 `status`。悬浮窗按 `activityId` 读 `detail`。禁止侧栏再存一份可展开正文。
2. **诚实。** 活动必须对应真实发生的检索、读、模型 reasoning、提案、校验、验证命令。fixture / 无模型 theater 步骤不映射成 Explored / Read。
3. **先投影已有数据，再补 payload，最后才加检索轮次。** 不把开放 tool loop 当作本计划的完成条件。
4. **证据有预算。** preview、片段、stdout/stderr 在写入活动前截断并脱敏。会话快照可持久化缩略行；超长 detail 可只留在当次 run，重开后显示「详情已截断或未保留」。
5. **写权限不变。** 本计划不新增写工具、不放宽 shell。`shell` 卡只表示已有验证命令或策略允许的命令。
6. **Mode 结果卡片保留。** Plan 审阅与 Debug 阶段条不并进活动 kind。

---

## 3. 活动模型（实施时的契约形状）

建议新契约（名称实施时可调整，字段语义不要拆开）：

```ts
type AgentActivityKind =
  | 'thinking'
  | 'planning'
  | 'grep'
  | 'read_file'
  | 'edit'
  | 'shell'
  | 'context'
  | 'mcp'

type AgentActivityStatus = 'running' | 'complete' | 'error'

interface AgentActivity {
  id: string
  runId: string
  sessionId?: string
  mode: 'ask' | 'change' | 'plan' | 'debug'
  kind: AgentActivityKind
  status: AgentActivityStatus
  /** 侧栏唯一可见文案来源，短、已 i18n key 或服务端短句 */
  summary: string
  startedAt: string
  completedAt?: string
  /** 仅悬浮窗。结构随 kind 变化，禁止塞进 summary */
  detail: AgentActivityDetail
}
```

映射（第一波用适配器从现有事件投影，不必立刻改 orchestrator 主循环）：

| 现有来源 | kind |
|----------|------|
| `AgentTransientTrace` / Ask `reasoning` | `thinking` |
| `edit_plan_created`；Plan 生成中的 running pill | `planning` |
| `AskExplorationTrace.hits` + `queriedSymbols` | `grep`（一条活动汇总本轮，或每轮一条） |
| `explorationTrace.readPaths`、`file_read` | `read_file` |
| `diff_proposed` | `edit` |
| `verification_result` | `shell` |
| `context_assembled` / `context_attached` | `context` |
| `mcp_tool_call` | `mcp` |
| live step `generate_proposal` / `validate_proposal` | 可保持为阶段分组标题，其下挂上述活动；**不要**把阶段名再翻译成假的 Explore |

Ask 今天没有 `AgentRunEvent` 时间线。适配器要能从 `latestAskTrace` + 消息上的 `explorationTrace` 合成活动列表，使 Ask 与 Agent 共用侧栏组件。

---

## 4. 分波次

### M0 — 模型与双表面骨架（无新工具）

**目标**：侧栏出现不可展开的缩略行；悬浮窗打开同一 `id` 的详情；Ask 与 Agent 至少各有一条真实活动。

- [x] 契约：`AgentActivity`（§3）+ Zod。detail 按 kind 用 discriminated union。
- [x] 适配器：`projectAgentActivities`，纯函数，吃消息上的探索/检索、`latestAskTrace` / `latestPlanTrace`、`flowActions` / `flowTransientTraces`。
- [x] 侧栏组件 `AgentActivitySummaryRow`：只渲染 `summary` + status。无 `<details>`、无 preview。
- [x] 插入位置：有 `anchorMessageId` 的行在对应消息气泡内；进行中的 Ask/Plan 与本轮 run 活动在 composer 上方。Plan / Debug 的既有卡片保持。
- [x] 悬浮窗：`AgentActivityDetails` 挂在 Ask 回答、Plan 卡、Debug 摘要和 Agent 时间线里。证据（preview、路径、reasoning）只在这里。
- [x] 点击侧栏行：`presentAgentFlow()` + `setSelectedActivityId`。
- [x] 从 `ChatPanel` 移除探索路径列表与检索路径列表的展开。
- [x] i18n：`en` / `zh` 的 `agentFlow.activity.*`。
- [x] 测试：`projectAgentActivities.test.tsx` — preview 只出现在详情；侧栏摘要不含路径和 preview。

**M0 状态**：Implemented（2026-10-19）

**验收**：Ask 跑完，侧栏只有「Explored · N files」之类一行；悬浮窗能看到路径、行号、preview。Agent run 至少把 context / proposal 阶段收成缩略行，详情仍在悬浮窗。

**不在本波**：补 stdout、补文件片段、改探索循环。

---

### M1 — 把已有 payload 的详情补全到「可核对」

**目标**：悬浮窗里的 Read / Shell / Edit 不再只有路径和成败。

- [x] `verification_result` 增加可选 `exitCode`、`stdout`、`stderr`、`truncated`、`durationMs`。采集经 `boundTraceText` 截断（12KB）并走 `secrets_and_paths` 脱敏。Shell 捕获拆出 stdout/stderr。
- [x] `file_read` 增加 `startLine` / `endLine` / `excerpt` / `truncated`。Ask 探索从已读缓冲按命中行开窗，写入 `AskExplorationTrace.reads`，投影成 `Read` 活动。
- [x] `diff_proposed` 带 `additions` / `deletions` / `hunkHeader`。悬浮窗「在 Diff 中打开」调用 `navigateToDiffReviewFile`。
- [x] Thinking：running 时侧栏行保持 `Thinking`；complete 后仍是一行。正文只在悬浮窗。
- [x] 失败：侧栏 summary 只带到 `failed` / 短状态；stdout、stderr 和堆栈只在 detail。

**M1 状态**：Implemented（2026-10-19）

**验收**：验证失败时，侧栏是 `Ran <cmd> · failed`，悬浮窗能看到截断输出。读文件活动能看到行范围片段。

---

### M2 — 过程粒度对齐真实检索轮次

**目标**：多轮探索在侧栏变成多行，每一行在悬浮窗有自己的证据。仍不开放模型自由调工具。

- [x] Ask `exploreForAskQuestion` 每一轮写入 `rounds[]`（symbols、hits、reads）。投影时一轮一条 `Grep · N hits`，该轮读取各一条 `Read`。没有轮次、命中和读取时不出现 Explored 行。
- [x] Plan 创建把同一条 `explorationTrace` 挂在 `ImplementationPlan` 上，活动 `mode: 'plan'`，缩略行在 Plan 审阅卡上方。
- [x] Agent `file_read` 带上调用方的 `phaseId`（locate / generate 传入）。悬浮窗把这些 Read 挂在对应步骤下；没有读事件就不出现 Read 行。Live locate 本身不额外发起探索。
- [x] Debug 假设生成使用同一只读探索，`explorationTrace` 留在会话上，活动 `mode: 'debug'`，缩略行在阶段条上方。
- [x] Thinking / Planning 用稳定 id（`ask:thinking`、`plan:planning`），从 running 到 complete 原地更新，不追加第二行。

**M2 状态**：Implemented（2026-10-19）

**验收**：两轮 Ask 探索 → 侧栏两行 Grep（或一行 Grep + 多行 Read），悬浮窗按轮展开不同 hits。无探索的问答不出现 Explored 行。

---

### M3 — 明确不做（本计划完成定义之外）

- 模型可调用 `grep_workspace` / 任意 `shell` 的开放 tool loop
- 侧栏内联展开思维链或代码块
- 用活动流取代中间栏 Diff、Plan 编辑、Debug 阶段操作
- 子 agent 并行卡片（委派树 `DelegatedRunTree` 保持现状，除非另开计划）

若 Harness 日后把工具循环打开，新工具必须发 `AgentActivity`，并遵守本文的 summary/detail 分界。不要另做第三套聊天工具 UI。

---

## 5. 切片依赖

```text
M0 活动契约 + 适配器 + 侧栏缩略行 + 悬浮窗详情 + 去掉侧栏展开
 │
 ▼
M1 验证输出 / 读文件片段 / edit hunk 摘要（detail 变可核对）
 │
 ▼
M2 按探索轮次发活动（Ask、Plan、Agent locate、Debug）
```

M0 可独立合入。M1 与 M2 都依赖 M0 的组件，彼此可并行，但 M2 的新行要能吃 M1 的 detail 字段。

---

## 6. 代码触点

| 区域 | 路径 |
|------|------|
| 活动契约 | `projectos/contracts/events.ts`（或同级新文件 `agent-activity.ts` 再从 `contracts/index` 导出） |
| 适配器 | 建议 `projectos/workbench/src/components/AgentFlow/projectAgentActivities.ts` |
| 侧栏 | `ChatPanel.tsx`：移除 `explorationTrace` / `retrievalSummary` 的 `<details>` 列表；挂 `AgentActivitySummaryRow` |
| 悬浮窗 | `AgentFlowPanel.tsx`、`AskTraceView.tsx`、`PlanTraceView.tsx`：改为活动列表 + 详情，保留计划/调试摘要头 |
| 打开并定位 | `chatSessionStore.presentAgentFlow`、`workbenchStore.selectedFlowStepId` 旁新增 `selectedActivityId` |
| Ask 数据 | `ask-exploration-service.ts`、`workbenchStore` 里写入 `explorationTrace` 的路径 |
| 验证输出 | orchestrator `verification_result` 发射处（约 `emit` verification 循环）与 `VerificationResultPayloadSchema` |
| 会话持久化 | `contracts/chat-session.ts`、`chatSessionSync.ts`：快照存活动 summary；detail 超限则省略 |
| i18n | `en.ts` / `zh.ts` 的 `agentFlow.*` / `chat.*` |

---

## 7. 测试与验收

### 行为

- [ ] 侧栏 DOM / 渲染文本不包含 `hits[].preview`、reasoning 正文、stdout。
- [ ] 悬浮窗同一 `activityId` 能看到上述 detail。
- [ ] 未发生的步骤不产生活动（无探索 → 无 Grep/Read 行；无验证 → 无 Ran 行）。
- [ ] Ask 活动不伴随 `GeneratedDiff` 或写盘。
- [x] 验证输出截断标志为 true 时，悬浮窗显示截断说明。
- [ ] 点击侧栏行打开悬浮窗并选中该活动。
- [ ] Stop 后 running 活动变为 error 或取消态，不继续追加 complete。

### 回归

- [ ] `AskTraceView.test.tsx`、`AgentFlowPanel.phaseTrace.test.tsx`、`workbenchStore.agentConversation.test.ts` 改为断言缩略/详情分界。
- [ ] PlanReviewCard、DebugSessionPanel、Diff 审阅路径仍在。

---

## 8. 决策记录

1. **侧栏永远是收起态。** 思维链、已查看文档、代码片段、终端输出只在 Agent Flow 悬浮窗。
2. **一种活动记录，两个投影。** `summary` 给侧栏，`detail` 给悬浮窗。
3. **先适配现有事件与 `AskExplorationTrace.hits`，再补验证输出和片段，再按轮次发活动。**
4. **不提前做开放 tool loop。** `grep_workspace` 作为模型工具、任意 shell，仍属 Harness DEFERRED。
5. **Plan 卡与 Debug 阶段条保留在侧栏**，不折叠进活动 kind。
6. **完整 diff 留在中间栏。** 悬浮窗只放 hunk 摘要和跳转。

---

## 9. 下一步（开发启动时）

1. 评审 §0 分界和 §3 字段（尤其 detail 是否进会话快照）。
2. 开 M0：适配器 + 侧栏缩略行 + 悬浮窗详情，并把 Ask 路径列表从侧栏移走。
3. M0 验收后做 M1 验证输出与读文件片段。
4. M2 再改 `exploreForAskQuestion` 的发射粒度。

文档路径：`docs/features/Agent-Flow-Activity-Dev-Plan.md`  
后续实现以本文勾选清单为准；重大偏离先更新「决策记录」再改代码。
