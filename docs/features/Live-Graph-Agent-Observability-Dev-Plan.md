# Live Graph：AI Chat & Agent × C4 Graph 实时可观测与干预

**状态**：Phase 4 implemented（2026-10-20）。LG-1–LG-6 已落地（多 Agent overlay 合并、委派边、fileIndex 升格、VerificationEvidence 叙事）。  
**范围**：把 Agent 执行过程投影到 Function Map / C4 Graph 上，形成「看得见、看得懂、可追溯、可干预」的 Live Graph。覆盖执行事件规范化、Graph State Adapter、执行层叠加（节点/边/活动）、Node Inspector 扩展、第一版 Graph 控制动作。  
**产品定位一句话**：C4 Graph 解释项目结构；Live Execution 解释 Agent 正在做什么；Interactive Graph 把人接到 Agent 控制面上。三者叠加，而不是把执行过程写进架构图本身。  
**实现锚点**：
- 契约：`projectos/contracts/live-graph.ts`（含 `LiveExecutionEdge`）；API `pauseAgentRun`
- Adapter / Normalizer / Edges：`projectos/services/live-graph/`
- Store：`executionOverlay`、`liveGraphFocusTaskId`、`liveGraphPausedRunId`、Graph 控制 actions
- UI：`LiveNodeBadge`、执行边、Focus chip、`C4NodeDetailDrawer` Tabs（含 Controls）

**权威交叉引用**：
- [`Agent-Flow-Activity-Dev-Plan.md`](./Agent-Flow-Activity-Dev-Plan.md) — Chat 侧栏缩略 + Agent Flow 悬浮窗证据（文字活动流）。本计划是**空间投影**，共用同一条诚实事件源，不另猜 Chat 文案。
- [`Agent-Harness-Dev-Plan.md`](./Agent-Harness-Dev-Plan.md) — ToolPolicy、工具结果、中断/续跑、预算。Pause / Approve 必须打到 harness，不能只改 UI 标签。
- [`backend/Observability-Model-Gateway-Dev-Plan.md`](./backend/Observability-Model-Gateway-Dev-Plan.md) — `runId` / `requestId` 串联、失败落点。Graph 状态必须可核验到同一条 run JSONL。
- [`backend/Code-Intelligence-Dev-Plan.md`](./backend/Code-Intelligence-Dev-Plan.md) — 路径 ↔ 符号 ↔ 影响面。Impact 边走代码事实，不伪造架构因果。
- [`backend/Tools-Integrations-Dev-Plan.md`](./backend/Tools-Integrations-Dev-Plan.md) — `ToolResult` 信封；写仍只走事务。
- [`backend/Backend-Dev-Plan.md`](./backend/Backend-Dev-Plan.md) — 「C4 回答系统由什么组成，不代替符号表 / 执行时间线」。
- C4 画布与节点详情：`workbench/.../FunctionMap/`、`C4NodeDetailDrawer.tsx`、`c4/`、`structure-graph-*`
- 事件与活动：`contracts/events.ts`（`AgentRunEvent`）、`AgentActivity` / `projectAgentActivities`
- 今日仅有的弱联动：`handleRunEvent.ts` 在 `step_started` 时设 `selectedNodeId` / `highlightedFilePaths`（选中闪一下，不是 Live Overlay）

**明确不做 / 不复制**：
- 不根据 Chat 文本或模型自述推断「正在改哪个文件」
- 不把每次 `file.read` / 命令输出永久落成 C4 节点或架构边
- Agent 读写文件时**不重算**整图拓扑布局（保护 ELK / `computeTopologyLayout` / 用户拖拽 overlay）
- 不把计划状态（Planner 说「将要改」）画成已完成执行状态
- 不开放 Route ② 模型自由 tool loop（仍以 Harness 为准）
- 不把本计划做成彩灯秀：动画服务于理解，默认只突出当前活动
- Phase 1–2 不做完整多 Agent 调度器；并行活动以「同节点多活动列表」表达即可

---

## 0. 核心诉求（本计划锁定）

| # | 诉求 | 用户要回答的问题 | 本计划对应模块 |
|---|------|------------------|----------------|
| 1 | Agent 在哪里工作，要看得见 | 它正碰项目的哪一块？ | Live Node |
| 2 | Agent 正在做什么，要看得懂 | 读 / 改 / 测 / 等 / 失败？为什么？ | Live Activity + 状态文案（不只靠颜色） |
| 3 | Agent 做了什么改变，要能追溯 | Diff、原因、测试、属于哪个任务？ | Node Inspector · Diff / Activity |
| 4 | 能从 Graph 直接干预 | 补上下文、发指令、暂停、审批 | Graph Interaction |

前三项是可观测性；第四项是产品差异化：Graph 既是观测面，也是控制入口。

---

## 1. 三层分离（最重要的产品决策）

不要把 Agent 执行过程与静态架构混成同一套数据。执行状态**叠加**在架构图上。

```text
┌─────────────────────────────────────────────────────────┐
│  Interaction Layer · 人机协作                             │
│  Inspect / Diff / Focus Task / Add Context /             │
│  Send Instruction / Pause·Resume / Approve·Reject        │
├─────────────────────────────────────────────────────────┤
│  Live Execution Overlay · 执行状态层                      │
│  per-(node, agent/task) 活动 · Execution Edges · 时间线   │
├─────────────────────────────────────────────────────────┤
│  C4 Architecture Graph · 项目结构层（已有，尽量不动）       │
│  System / Container / Component / Code · 架构边 · 布局    │
└─────────────────────────────────────────────────────────┘
```

| 层 | 描述什么 | 何时变布局 |
|----|----------|------------|
| Architecture | 项目有什么、结构关系是什么 | 架构扫描变更、用户切布局、**真正新增且需入图的资源** |
| Execution Overlay | Agent 此刻/近期对资源做了什么 | **永不**单独触发全图重布局 |
| Interaction | 用户如何查看与控制 | 不改架构数据 |

**例子**：Agent 修改了 `LoginPage.tsx`，若依赖关系未变，C4 结构与布局保持不动；变化的是该文件节点的执行活动、修改记录，以及可选的执行连线 / 影响高亮。

前端视图状态概念拆分（实施时可落在独立 store 或 workbench 切片）：

```ts
type GraphViewState = {
  architecture: ArchitectureGraph   // 已有 C4 节点/边/层级/布局
  execution: ExecutionOverlay       // 本计划新增
  selection: GraphSelection         // 节点 / 任务 / 查看模式
}
```

三种语义状态也必须分开展示，禁止混画：

| 状态类型 | 示例 | 权威来源 |
|----------|------|----------|
| 计划状态 | 「准备修改登录页」 | Planner / Task Plan / `edit_plan_created` |
| 执行状态 | 「正在写入文件」 | Harness / Tool 真实事件（`started`） |
| 结果状态 | 「文件已改、测试通过」 | 文件系统 / Diff / `apply_result` / `verification_result` |

UI 可以说「计划修改」，但不能因此把节点标成 `Completed`。

---

## 2. 证据级现状（2026-10-20）

### 2.1 已有、可复用

| 能力 | 现状 | 锚点 |
|------|------|------|
| C4 四层级生成与画布 | 有 | `structure-graph-*`、`FunctionMap` / `c4/` |
| 路径 → 功能图节点 | 有（写授权与 Code 层） | `fileIndex.nodeIds`、`file-owner-resolution` |
| Code 节点详情抽屉 | 有（用途 / 理解 / 关系，**无** Live Activity / Diff Tab） | `C4NodeDetailDrawer.tsx` |
| 诚实 run 事件流 | 有 | `contracts/events.ts`：`file_read`、`diff_proposed`、`apply_result`、`verification_result`、`context_assembled`… |
| Agent 文字活动投影 | 有（M0–M2） | `AgentActivity`、`projectAgentActivities`、侧栏 + Agent Flow |
| 弱空间联动 | 有 | `step_started` → `selectedNodeId` + `highlightedFilePaths` + flash |
| 代码影响面 | 有 | `code-intelligence`、`structure-graph-impact`、`dependency-impact-scanner` |
| Diff / Pending changes | 有（中间栏） | Diff 审阅、apply 事务 |

### 2.2 缺口（本计划要补）

| 缺口 | 说明 |
|------|------|
| 无 Execution Overlay 模型 | 没有 per-node 多活动列表；一节点不能同时表达「A 在改、B 在读」 |
| 无 Graph State Adapter | 前端未把 `file_read` / `apply_result` 等系统映射成节点状态；选中闪一下 ≠ Live |
| 无 Execution Edge | 只有架构依赖边；没有「读 context → 再 edit」的短暂执行边 |
| Inspector 无 Live Tabs | 缺 Overview 实时态、Diff、Activity 时间线、任务聚焦 |
| Graph 无控制动作 | 不能从节点 Add Context / Pause / Approve；控制仍只在 Chat / Agent Flow |
| 未入图资源不可见 | Agent 碰配置/测试/脚本时，找不到 C4 节点就丢可见性 |
| 事件粒度偏「完成态」 | 部分动作缺少清晰的 `started`/`completed` 配对，不利于 Reading/Editing 脉冲态 |

---

## 3. 五个功能模块

### 3.1 Live Node — 节点实时状态

节点仍是架构实体；叠加**活动列表**，而不是单个枚举把整节点锁死。

建议活动 kind（文案 + 图标/形状；颜色不得作为唯一信号）：

| Kind | 含义 | 视觉要点 |
|------|------|----------|
| `reading` | 正在读取 | 低强度描边 + `Reading` 标签 |
| `editing` | 正在修改 | 更醒目描边 + `Editing` + agent/task |
| `creating` | 正在创建（未落盘前勿当已有架构文件） | 临时/幽灵节点或活动列表条目 |
| `running_tests` | 相关验证命令执行中 | 标签 + 关联测试资源 |
| `waiting` | 等待子任务 / 审批 / 调度 | 明确 Waiting，勿伪装成 Running |
| `needs_approval` | 需用户确认 | 可点击 Approve/Reject |
| `completed` | 本活动成功结束 | 短时结果标记；**不永久覆盖**其它活动 |
| `failed` | 本活动失败 | 错误标记 + 可进 Activity |

**文件状态 ≠ 任务状态。** 同一文件可被多 Agent / 多 task 同时访问：

- 节点表面：显示「多活动」摘要（例如 `2 active` 或并列小徽章）。
- 选中后：列出该资源上的活动（`agentId` / `taskId` / `runId` / kind / status）。
- 某一活动结束只移除/收敛该活动，不覆盖其它活动。

### 3.2 Live Edge — 两类连线

| 类型 | 表达 | 生命周期 |
|------|------|----------|
| **Architecture Edge** | 代码/组件固有依赖 | 稳定；不因一次 Agent 操作消失 |
| **Execution Edge** | 一次任务内可证明的操作关系 | 短暂；默认只显当前 + 最近关键；历史在 Focus Task 时重放 |

允许的执行关系（必须有事件证据，禁止「凡读过就连线」）：

1. **Read / Context** — 读过并作为本任务上下文的文件  
2. **Edit / Create** — 实际修改或创建（以 `diff_proposed` / `apply_result` 等结果为准）  
3. **Dependency / Impact** — 与本次修改相关的影响面（来自 Code Intelligence / impact API，并标注「推断影响」≠「已读」）

视觉上 Architecture / Execution / Impact 必须可区分（线型、标签、来源标记）。

### 3.3 Live Activity — 画布摘要 + 详情

| 表面 | 内容 |
|------|------|
| 画布 | 精简：`Reading` / `Editing` / `Running Tests`；任务短标题可选 |
| 浮动/侧栏任务条（可选轻量） | 任务目标、Agent、Running、文件清单一行摘要 |
| Inspector | 目标、操作记录、Diff、工具结果、下一步（可核实事实，不塞整段 COT） |

与 [`Agent-Flow-Activity-Dev-Plan.md`](./Agent-Flow-Activity-Dev-Plan.md) 的关系：

- **同一 `activityId` / 同一底层事件** → Chat 缩略行、Agent Flow 详情、Graph 节点状态是三种投影。
- Graph 不复制第三套不可核对的「表演步骤」。

### 3.4 Node Inspector — 优先交互

扩展现有 `C4NodeDetailDrawer`（不要另起互斥抽屉），按 C4 层级展示：

| C4 层级 | 实时信息 |
|---------|----------|
| System / Container | 影响范围、相关 run/task、进行中的工作流摘要 |
| Component | 进行中任务、涉及文件、上下游、测试状态 |
| Code / File | 路径、活动列表、Agent、Diff、操作历史 |

Code / File 建议四个 Tab：

| Tab | 内容 |
|-----|------|
| **Overview** | 用途/所属组件、当前活动、最近成功操作、未解决错误 |
| **Diff** | 工作区/提案 diff；跳转现有 Diff 审阅；关联 run |
| **Activity** | 按时间的读/写/命令事件 + 结果 + task |
| **Relations** | 架构依赖 + 本任务实际触及文件 + 标注来源的影响面 |

### 3.5 Graph Interaction — 第一版控制面

| 动作 | 行为 | 约束 |
|------|------|------|
| Inspect | 打开 Inspector | 只读 |
| Open Diff | 打开该文件 Diff 审阅 | 复用现有导航 |
| Focus Task | 只高亮该 task 的节点与执行边 | 不改架构 |
| Add Context | 把选中文件/组件作为附件送入当前 Chat/run | 只读上下文；不扩大写权限 |
| Send Instruction | 针对该节点补充用户指令 | 走现有会话/run 修正通道 |
| Pause / Resume | 通知调度器停止/恢复派发 | 必须处理进行中的工具调用；不可撤销的已执行副作用不能假装回滚 |
| Approve / Reject | 在 `needs_approval` 节点上决策 | 写入与 Chat 审批同一审计路径（SEC） |

---

## 4. 后端与数据面

### 4.1 原则

**工具执行层发出真实事件 → 归一化 → Task/Execution State Store → 实时流 → Graph State Adapter → C4 UI。**  
禁止前端解析 Chat 气泡来驱动节点状态。

```text
AI Chat / Planner
       │
Agent Harness / Scheduler
       │
Tool Execution (file / terminal / git / test)
       │
Execution Event Collector ──► Event Normalizer
       │                              │
       │                    Task & Execution State Store
       │                              │
       └──────── Realtime Event Stream (既有 IPC / 订阅)
                                  │
                         Graph State Adapter
                                  │
                    C4 Graph UI + Inspector + Controls
```

本地桌面优先复用现有 run 事件订阅 / IPC，不为本功能单独引入复杂消息总线。

### 4.2 统一执行事件（概念 schema）

第一版可在现有 `AgentRunEvent` 上扩展或增加窄适配层；字段语义必须稳定：

```ts
type AgentExecutionEvent = {
  eventId: string
  schemaVersion: 1
  workspaceId: string
  runId: string
  taskId?: string
  agentId?: string
  parentEventId?: string   // 因果 / 成对 started→completed

  eventType:
    | 'file.read'
    | 'file.write'
    | 'file.create'
    | 'command.start'
    | 'command.finish'
    | 'test.result'
    | 'task.status'
    | 'approval.needed'
    | 'approval.resolved'

  phase: 'planned' | 'started' | 'completed' | 'failed'
  timestamp: string

  resource?: {
    path?: string
    nodeId?: string       // 若已知；否则由 Adapter 解析
    resourceKind?: 'file' | 'component' | 'command' | 'other'
  }

  error?: { code: string; message: string }
  metadata?: Record<string, unknown>  // 截断、脱敏后的摘要；禁止密钥原文
}
```

硬规则：

- 模型计划「将修改 auth.ts」≠ `file.write.completed`
- 工具调用发出 ≠ 成功；以 ToolResult / apply / 测试进程为准
- 显示 `Completed` 必须对应真实完成；请求中显示 `Pending` / `Running`

### 4.3 Graph State Adapter

独立模块（建议 `services/live-graph/` 或 `workbench` 侧纯函数 + 服务端快照），职责：

1. **Resource → Node**：`path` / `nodeId` → 现有 C4 节点（经 `fileIndex`）；一对多时绑定全部 `nodeIds`，UI 选主节点但不丢活动。
2. **Event → Overlay State**：读写测 → 活动 upsert；成对事件收敛；乱序/重复可调和。
3. **State Reconciliation**：丢事件、任务异常退出、刷新后从快照恢复；重连补洞。

映射不到 C4 节点时：

- **不得静默丢弃**
- 进入「未入图资源」活动列表，或创建明确标记为 `ephemeral` / `unmapped` 的临时节点
- 禁止强行捏造错误的架构边

### 4.4 传输与恢复（从一开始就要）

| 能力 | 要求 |
|------|------|
| 去重 | 同 `eventId` 不重复累计 |
| 排序 / 因果 | 迟到的 `started` 不能覆盖已 `completed` |
| 快照恢复 | 刷新后读 Execution State Store，不等下一次事件 |
| 断线补齐 | 重连后按 cursor / 序列号补事件 |
| 多 run 隔离 | 状态按 `runId` / `taskId` 分桶 |
| 可验证 | 工具结果 +（可选）git diff / 测试证据优先于模型自述 |

---

## 5. 与现有 C4 联动方式（不推倒重做）

1. **保留**架构生成、节点 id、布局、用户拖拽 overlay、正交路由。  
2. **新增** `ExecutionOverlay` 渲染层（节点装饰、执行边、未入图列表、Focus 遮罩）。  
3. Agent 活动**默认不**调用全图 ELK / topology；仅当架构图本身变更或用户显式要求时重布局。  
4. `creating` 且文件尚未进入 `fileIndex`：用临时节点或列表，待扫描/索引更新后再升格为架构节点（升格可触发一次局部布局，而不是每次按键重排）。  
5. 与 Agent Flow：Focus Task / 点击活动应能双向跳转（Graph ↔ `activityId` / Agent Flow）。

---

## 6. MVP 分期

### Phase 1 — Live Activity on Nodes（优先打通闭环）

**目标**：真实工具事件 → 文件/节点状态更新 → 任务结束准确收敛。

- [x] 定义 `ExecutionOverlay` / per-resource `NodeActivity` 契约（Zod）与快照形状（`contracts/live-graph.ts`）
- [x] Event Normalizer：从现有 `file_read`、`context_*`、`diff_proposed`、`apply_result`、`verification_result`、`edit_plan_created`、`tool_policy_decision(ask)`、`run_*` 投影。今日多数动作仍是完成态事件；`diff_proposed` / `edit_plan_created` / 审批用 `running`，待 harness 补真实 `started` 配对
- [x] Graph State Adapter：`path` → `nodeIds`；未映射资源进 `unmappedActivityIds` + 画布右下角列表
- [x] C4 节点装饰：Reading / Editing / Creating / Completed / Failed 等（文案字母 + 描边，不只靠颜色）；多活动计数
- [x] 订阅既有 run 事件流（`handleRunEvent`）；会话恢复经 `applyRunEventsToState` 重放事件重建 overlay（等同快照恢复）
- [x] **不**重布局；**不**画执行边；**不做** Graph 控制动作

**验收**：

1. Agent 真实读/改某已入图文件时，对应节点在秒级内出现正确活动态。  
2. 同一文件被连续读再写时，状态按事件收敛，无卡死在 Editing。  
3. run 成功/失败/取消/中断后，活动收敛到 Completed/Failed/清除 running，与 run JSONL 一致。  
4. 操作未入图文件时，活动仍可见（列表或 ephemeral），不丢事件。  
5. 关开 Workbench 或重连后，进行中的 run overlay 可恢复。

### Phase 2 — Execution Path & Diff Inspector

**目标**：任务路径可追踪，改动可核对。

- [x] Execution Edge（Read/Context、Edit/Create）；默认只显当前 task；历史按 Focus 重放（`deriveExecutionEdges`）
- [x] Focus Task：遮罩无关节点/边（`liveGraphFocusTaskId` + `LiveGraphFocusChip`）
- [x] Inspector Tabs：Overview / Diff / Activity / Relations（Relations = 架构边 + 本任务触及文件）
- [x] Open Diff 跳转现有 Diff 审阅；Activity 经 `agentFlowActivityIdsForLive` 对齐 Agent Flow
- [x] Impact 边可选：`impactStructureGraph` depth 1，标签含 `inferred`，虚线区分

**验收**：

1. 用户能从某一 task 看到「读过哪些、改过哪些」，且每条边有事件依据。  
2. 从节点 Diff Tab 打开的内容与 Pending/工作区 diff 一致。  
3. Focus Task 不会删掉架构边，只改变强调与执行边可见性。

### Phase 3 — Interactive Graph

**目标**：Graph 成为真实控制入口。

- [x] Add Context / Send Instruction（`addGraphContextFromNode` → composer 附件；指令走 composer 或进行中的 `injectFlowCorrection`）
- [x] Pause / Resume：`pauseAgentRun`（interrupted，可 `continueAgentRun`）与 Chat `cancelAgentRun` 分离；UI 用 `liveGraphPausedRunId`
- [x] Approve / Reject：Approve → `approveAndRunCurrentVerification`；Reject → 清除待审批状态（与 Diff 同审批对象）
- [x] Needs Approval：Inspector Controls 在 `needs_approval` 活动或 `verificationCommandApproval` 时展示决策按钮

**验收**：

1. 从 Graph 触发的 Pause 后，不再派发新的工具动作（abort + interrupted，可观察）。  
2. Approve/Reject 走同一 `verificationCommandApproval` 状态，不另开审批通道。  
3. Add Context 后附件进入 `composerDraft.attachments`（只读 ref）；写权限不扩大。

### Phase 4 — Multi-Agent & Impact Depth

**目标**：并行可区分；影响与架构变更可解释。

- [x] 多 Agent 活动并列、颜色/徽章按 agent 区分（仍非颜色唯一）— `runIds` / `agentLabelByRunId` / `agentId`；徽章展示 `A1·A2`；子 run 流写入同一 overlay
- [x] 任务间依赖（委派树 / parent-child run）在 overlay 中表达 — `task_delegated` → `delegationLinks` + `delegation` 执行边
- [x] 架构变更升格流程（新文件入 `fileIndex` / 结构扫描后的局部布局）— `remapExecutionOverlay` 在 `analyzeWorkspace` 后重映射；不触发全图重布局
- [x] 更深的「为何改、验证是否充分」叙事（绑定 VerificationEvidence，不绑定 COT）— overlay `verificationNarrative` + Inspector 优先 `verificationResult.evidence`

**验收**：两并行 run 碰同一文件时，Inspector 能列出两条独立活动；用户能指向可能受影响的组件且来源标记正确。

---

## 7. 切片依赖（建议实现顺序）

```text
既有 AgentRunEvent + AgentActivity + fileIndex
        │
        ▼
LG-1  ExecutionOverlay 契约 + Normalizer（只投影，不改 C4）  ✅
        │
        ▼
LG-2  Adapter + 节点装饰 + 快照恢复          ← Phase 1 合格线 ✅
        │
        ├─► LG-3  Execution Edge + Focus Task  ✅
        ├─► LG-4  Inspector Tabs + Diff 深链   ← Phase 2 ✅
        │
        ▼
LG-5  Graph controls → Harness / 审批 / 上下文   ← Phase 3 ✅
        │
        ▼
LG-6  Multi-agent + Impact 深度 + 架构升格       ← Phase 4 ✅
```

Harness / Tools 若缺 `started` 配对或审批挂点，在对应后端计划开小切片，本文件只要求「Graph 不得假装」。

---

## 8. 设计陷阱（实施时对照）

1. **彩灯秀** — 默认只强调当前活动；历史低干扰；任务结束后停脉冲。尊重 `prefers-reduced-motion`。  
2. **事件永久节点化** — 执行事件是时间线；Graph 只显示摘要。  
3. **混同因果** — 架构依赖 ≠ 已读 ≠ 已改 ≠ 推断影响；必须分视觉与来源标记。  
4. **未入图资源丢失** — 配置/测试/脚本必须有可见性通道。  
5. **实时性压过准确性** — `Completed` 必须可核对；计划≠结果。  
6. **布局抖动** — 执行态更新禁止全图重布局。  
7. **第二套事件真理** — 禁止 Chat 解析；与 Agent Flow 共用投影源。  
8. **假暂停** — Pause 必须打到运行时；不可撤销操作不得显示为已回滚。

---

## 9. 测试与验收策略

| 层 | 建议 |
|----|------|
| 纯函数 | Normalizer / Adapter：乱序、重复、多活动同节点、未映射 path、run 终结收敛 |
| 契约 | Zod round-trip；快照 fixture |
| UI | 节点装饰与多活动摘要；Focus Task；Inspector Tab 切换（mock 事件） |
| 集成 | 一次真实叶子 Change：读 → 提案 → apply → verify，Graph 与 JSONL 一致 |
| 人工冒烟 | 对照 Harness Eval Checklist 增补「Live Graph」节（Phase 1 起） |

---

## 10. 长期愿景（不进当前 MVP）

当 Graph 不仅显示「正在改哪个文件」，还能稳定解释「影响了哪些组件、为何需要改、验证是否充分」时，Live Graph 从 Agent 可视化面板演进为理解与控制整次软件变更的工作空间。  
当前合格线仍是：**真实执行事件 → 节点状态 → 收敛正确**。没有可靠事件源，任何更漂亮的 Graph 都只是动画。

---

## 11. 文档维护

- 实现切片勾选时更新日期与状态行（`Draft` → `LG-1… in progress` → `Phase N implemented`）。  
- 若与 Agent Flow Activity、Harness、Code Intelligence 边界冲突，以「诚实事件、写授权不放宽、C4 不并入调用图」三条总约束裁决，并回写本节交叉引用。  
- Backend 总索引若增加「前端 Live Graph」行，链到本文件；本计划不替代 `Backend-Dev-Plan.md` 的后端合格线。
