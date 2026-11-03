# Loops Graph · Node Architecture 升级 DevPlan

**状态**：Draft（2026-11-03）。**仅文档**；本计划不授权开始实现，直到 NA-0 决策清单关闭。  
**范围**：在已落地的 Loop 执行底座（Planning P-0–P-3）与 [`Loops-Graph-Workflow-Studio-Dev-Plan.md`](./Loops-Graph-Workflow-Studio-Dev-Plan.md) 可靠性/工作室路线之上，把 Loops Graph 从「角色启发式线性闭环」升级为 **Engineering Workflow Graph**：以工程职责为中心的四类 Node、统一 Node Contract、类型化数据流 Edge、独立 HITL 状态机，以及可复用的 Feature Development 示范 Workflow。  
**产品定位一句话**：Loops Graph 回答的不是「如何连接工具做自动化」，而是「如何组织 Agent、工具、代码与人类决策，可靠完成一个工程目标」。  
**对标参考**：[`n8n-io/n8n`](https://github.com/n8n-io/n8n)（数据流、流程控制、错误输出、Human Review、Execution History）——只借鉴机制，不克隆通用 iPaaS 生态。

| 文档 | 关系 |
|------|------|
| [`Loops-Graph-Workflow-Studio-Dev-Plan.md`](./Loops-Graph-Workflow-Studio-Dev-Plan.md) | **并行权威**：画布 Studio、真 pause/cancel、Fresh·Stale、重规划提案、参数化/事件触发仍归该文档。本计划**接管并取代**其中「MVP 节点语义映射」对 Condition 永久延期、以及 `implement\|verify\|fix\|decide` 作为唯一产品分类的表述。 |
| [`backend/Planning-Orchestration-Dev-Plan.md`](./backend/Planning-Orchestration-Dev-Plan.md) | **已落地底座**：Spec/Instance 分离、implement→AgentRun、verify→证据、decide→HITL。本计划在其上扩展 Node 类型系统，不重做 P-0–P-3 不变量。 |
| [`Agent-Harness-Dev-Plan.md`](./Agent-Harness-Dev-Plan.md) | Action / Agent 权限与预算；Human Approval 不得绕过 ToolPolicy。 |
| [`backend/Verification-Eval-Dev-Plan.md`](./backend/Verification-Eval-Dev-Plan.md) | Test / Validation Action 的通过依据仍是证据，不是 Agent 自述。 |
| [`Agent-Flow-Activity-Dev-Plan.md`](./Agent-Flow-Activity-Dev-Plan.md) | 节点内工具调用轨迹；Loops 只显示任务单元状态。 |
| [`Agent-Pool-Dev-Plan.md`](./Agent-Pool-Dev-Plan.md) | 多 Agent 态势面；不替代 Loop 拓扑。 |

**命名澄清（继承 Workflow Studio）**：产品口述「Sessions Graph」= **Agent Flow +（可选）Session Graph 链接**。三图闭环：

```text
Loops Graph     → 应该做什么、谁来做、何时需要人
Agent Flow      → Agent 实际调用了什么工具、读写了哪些文件
C4 / Function Map → 代码结构与写授权叶子如何变化
```

---

## 1. Executive Summary

现状 Loop 已能跑通「意图图 → 编译 LoopSpec → 批准 → Instance 步进 → AgentRun / Evidence / HITL」，但节点模型仍是工程语义不足的线性角色：

| 现状 | 缺口 |
|------|------|
| `role ∈ implement \| verify \| fix \| decide \| unknown` | 无法表达 Agent / Action / Logic / Human 的职责边界 |
| `inputs` / `outputs` 为字符串标签 | 无结构化契约；下游靠猜上下文 |
| 拓扑 outdegree≤1、至多 1 条 feedback | 无 Condition 真分支；Loop 仅靠 feedback 边弱表达 |
| `decide` 统一 HITL | Approval / Review / Input 交互与产物关联未分开 |
| verify 绑 VerificationEvidence | 缺少可配置的通用 Test Action 外观与结构化测试结果消费 |
| GitHub / Terminal 无 Loop 节点形态 | 副作用操作要么进 Agent 自由工具，要么在画布外 |

本计划的核心不是「加更多 Node 名称」，而是锁定：

> **Workflow Node = 具有明确工程职责、输入输出、执行状态与失败策略的任务单元。**

升级路径：**冻结三层设计决策与 Node Contract → 契约与兼容映射 → Runtime 按 type 调度 → Palette/Inspector/Preset → 示范 Workflow → 与 Studio 计划的可靠性切片汇合。**

---

## 2. 产品目标与非目标

### 2.1 目标

1. 用**职责分类**（Agent / Action / Logic / Human）替代「技术实现分类」作为产品主轴。  
2. 每个 Node 具备四层语义：工程职责 · 执行配置 · 运行状态 · 产物与验证。  
3. Edge 表达**数据依赖 + 控制流**，不只是视觉连线。  
4. Agent 判断与确定性工程操作分离（Agent ≠ Action）。  
5. Human 是正式参与者：Approval / Review / Input 有独立交互与状态机，且 Definition / Run 分离。  
6. MVP 交付一套可运行的 **Feature Development Workflow** 示范（Planner → Human Review → Coder → Test → Condition → Reviewer → Approval → Create PR）。  
7. 继续禁止第二套 Agent Runtime；节点内推理仍走 Orchestrator + Harness。

### 2.2 非目标（本计划明确延期）

| 非目标 | 原因 |
|--------|------|
| 通用 HTTP/DB/SaaS 集成市场与 credentials 商店 | 不是 n8n 竞品 |
| 任意 Code Node / 任意表达式语言引擎 | 先可视化条件 + 有限表达式子集 |
| Parallel Agent 自动调度 + 自动 worktree 隔离 | 数据模型预留多入/多出；调度延后 |
| 多人审批链、超时升级通知 | HITL 先单人 |
| 插件市场 / 社区 Node 包 | 先内置工程 Node |
| 多层子画布 / Sub-workflow 完整产品 | 契约可预留 `subflowRef`；实现延后 |
| 把每个 IDE 能力都做成画布 Node | 仅独立执行边界、可配置、可复用者上画布 |
| 用 Markdown 计划代替结构化 DevPlan Artifact | Planner 输出必须可被下游消费 |

---

## 3. 已锁定的产品决策（本计划基线）

继承 Workflow Studio D1–D9，并追加本计划决策：

| ID | 决策 | 落地含义 |
|----|------|----------|
| NA-D1 | **底层统一 Agent Node + UI 角色预设** | 存储 `type: "agent"` + `role: planner\|coder\|reviewer\|…`；Palette 暴露 Planner/Coder/Reviewer 入口；不做成三套 Runtime |
| NA-D2 | **Action：集成节点 + 常用操作快捷节点** | 底层 `type: "action"` + `integration` + `operation`；UI 同时提供「GitHub」配置面板与 Create Branch / Create PR 等拖拽快捷项（同 schema） |
| NA-D3 | **底层统一 Human Node + UI 分模式入口** | `type: "human"` + `mode: approval\|review\|input\|decision`；面板与状态机按 mode 分支；Takeover 仅占位 |
| NA-D4 | **四类 Node 按职责分类** | Agent / Action / Logic / Human；禁止用「是否调用模型」当唯一分类轴 |
| NA-D5 | **Node = 任务单元，不是工具调用日志** | 文件读写细节进 Agent Flow；结构变化进 C4；Loops 只显示单元状态与产物引用 |
| NA-D6 | **结构化 Artifact 优先于自然语言** | Planner→DevPlan JSON；Coder→ChangeSet；Test→TestReport；Reviewer→ReviewResult；Edge 引用这些类型 |
| NA-D7 | **Agent 与 Action 必须可拆开** | Coder 不得「顺便」在无 Action/审批的情况下 Push/PR；高副作用默认经 Human Approval |
| NA-D8 | **有限 Loop，禁止无限执行** | Logic Loop / Retry 必须有 `maxIterations`；与 `stopPolicy` 取更严者 |
| NA-D9 | **定义与运行分离（强化）** | Workflow Definition / Version / Run / NodeRun / Artifact / HumanDecision 六类记录不得混写 |
| NA-D10 | **兼容演进，不推翻底座** | 旧 `implement/verify/fix/decide` 经 normalize 映射到新 type/role；旧文档可读可跑 |

### 3.1 三个粒度问题的结论（关闭开放题）

1. **Agent 粒度**：统一 Agent Node + Role 预设（NA-D1）。MVP 预设：Planner、Coder、Reviewer；Researcher/Tester/Debugger/Architect/Documenter 仅 Profile，不做独立系统。  
2. **Action 粒度**：集成 + 操作双形态（NA-D2）。MVP 集成：`github`、`test`、`terminal`（权限沙箱）。  
3. **Human 粒度**：统一 Human Node + 模式（NA-D3）。MVP 模式：Approval、Review、Input；Decision 可先作为 Input 的选项型；Takeover = Future。

---

## 4. 目标 Node 体系

### 4.1 四类职责

```text
01 Agent Nodes     智能决策（理解、规划、实现判断、审查）
02 Action Nodes    确定性操作（GitHub / Test / Terminal / …）
03 Logic Nodes     流程控制（Condition / Loop / Merge / Exit / …）
04 Human Nodes     人类决策（Approval / Review / Input / …）
```

它们通过带数据契约的 Edge 协作，而不是共享一个可变全局黑洞上下文。

### 4.2 MVP 实现范围

| 类型 | 第一版 | 备注 |
|------|--------|------|
| Agent | Planner / Coder / Reviewer | 统一 `agent` + role |
| Action | Run Tests；GitHub（branch/commit/push/create_pr 等）；Terminal（受控） | `test` / `github` / `terminal` |
| Logic | Condition；Loop（有限）；Merge（Wait for All）；Exit | Parallel 调度不做，模型预留 |
| Human | Approval；Review；Input | Decision/Takeover 延后或弱化 |

**暂时不做**：复杂 Parallel Agent、多人审批、超时升级、插件市场、任意 Code Node、多层画布、动态自主规划编排。

### 4.3 与现状角色的映射（兼容）

| 旧 `IntentNodeRole` | 新表示 | 说明 |
|---------------------|--------|------|
| `implement` | `agent` + `role: coder` | 默认写权限仍来自 Function Map 叶子 |
| `fix` | `agent` + `role: coder` + `config.repairMode: true` | 或同一 role，标记来自 feedback |
| `verify` | `action` + `integration: test` **或** 保留 verify 桥接期别名 | 证据规则不变 |
| `decide` | `human` + `mode: approval`（默认） | Review/Input 需显式 mode |
| `unknown` | 编译期 assumption / 阻断 | 不可批准 |

旧字段在 `normalizeLoopGraphDocument` 中自动填充 `type`/`role`；UI 只展示新分类。

### 4.4 示范 Workflow（MVP 验收场景）

目标示例：*为 Project OS 增加 GitHub Feature Tree（Feature ↔ 多 Branch / 多 PR）*。

```text
Start
  → Agent·Planner          结构化 DevPlan
  → Human·Review           Accept / Request Changes
  → Agent·Coder            实现（写范围受限）
  → Action·Run Tests       结构化 TestReport
  → Logic·Condition        passed?
        ├─ yes → Agent·Reviewer
        └─ no  → Logic·Loop/Retry → Coder（≤ maxIterations）
  → Human·Approval         批准 Create PR 参数
  → Action·GitHub create_pr
  → Logic·Exit
```

验收不变量：

1. Planner 不改代码。  
2. 开发开始前 Human Review 可拦下范围。  
3. Coder 不能自宣布成功。  
4. Test 结果客观驱动分支。  
5. Create PR 必须经过 Approval，且执行**用户最终批准的参数**。

---

## 5. Node Contract（统一数据结构）

### 5.1 定义期字段（Workflow Definition / Spec Node）

| 字段 | 作用 | 示例 |
|------|------|------|
| `id` | 唯一 ID | `node_coder_001` |
| `type` | 四类之一 | `agent` |
| `role` / `mode` / `operation` | 子类型 | `coder` / `approval` / `create_pr` |
| `title` | 画布标题 | `Implement Feature Tree` |
| `inputs` | **类型化**输入端口 | `{ task: DevPlanTask }` |
| `outputs` | **类型化**输出端口 | `{ changeSet: ChangeSet }` |
| `config` | 执行配置 | model、timeout、command、maxIterations |
| `permissions` | 允许操作 | read/write/git_push… |
| `failure_policy` | 失败策略 | retry / stop / hitl / replan |

### 5.2 运行期字段（Node Run）

与 Definition 分离，挂在 `LoopInstance.nodeRecords[]`（与 Studio LG-2.1 汇合）：

| 状态 | 含义 |
|------|------|
| `pending` | 等待依赖 |
| `ready` | 输入满足，待调度 |
| `running` | 执行中 |
| `completed` | 成功，产物已登记 |
| `failed` | 失败 |
| `cancelled` | 取消 |
| `waiting` | 等待外部事件/时间 |
| `blocked` | 不明副作用或前置缺失 |
| `waiting_human` | Human 专属：等人 |

Human 终态细分为：`approved` / `rejected` / `changes_requested` / `expired`（作为 `waiting_human` 的决议结果写入 `HumanDecision`，不必全部提升为 Instance status）。

**Instance status** 与 **Node status** 不得混用：`awaiting_hitl` 表示 Run 暂停在人，不等于 Failed。

### 5.3 核心 Artifact 类型（MVP）

```text
DevPlan          goal, tasks[], depends_on, risks, expectedArtifacts
DevPlanTask      id, title, type, depends_on, constraints, writeScope?
ChangeSet        files[], summary, unfinished[], problems[], agentRunId
TestReport       status, total, passed, failed, failedTests[], evidenceId?
ReviewResult     verdict: pass|needs_changes|blocked, issues[], allowNext
GitHubOpResult   operation, url?, number?, raw refs
HumanDecision    mode, choice, editedPayload?, comment?, at, actor
```

Planner 输出**必须**是 `DevPlan`（Zod），禁止「仅一段 Markdown」作为唯一输出。Markdown 可作投影，不是契约。

### 5.4 Edge 契约

在现有 `depends` / `feedback` 上扩展（向后兼容）：

| `kind` | 含义 | MVP |
|--------|------|-----|
| `depends` | 控制依赖 + 默认数据传递 | 已有 |
| `feedback` | 有界回环 | 已有 |
| `conditional` | Condition 的 true/false（或命名分支）出口 | **本计划新增** |
| `data` | 显式端口映射（无调度含义） | 可与 depends 合并字段表达 |

Edge 建议字段：`from` / `to` / `kind` / `when?` / `carry[]` / `branchKey?` / `portMapping?`。

原则：**下游不得靠读取全局上下文猜测上游做了什么**；至少能解析到 Artifact ref。

### 5.5 建议 Spec Node 形状（示意）

```json
{
  "id": "node_coder_001",
  "type": "agent",
  "role": "coder",
  "title": "Implement Feature Tree UI",
  "config": {
    "model": "configured-model",
    "maxIterations": 5,
    "timeoutSec": 1800,
    "contextScope": ["src/components/feature-tree/**"],
    "writeScopeSource": "function_map_leaf"
  },
  "inputs": {
    "task": { "from": "node_planner_001", "path": "devPlan.tasks[0]" }
  },
  "outputs": {
    "changeSet": { "artifact": "ChangeSet" }
  },
  "permissions": {
    "read_files": true,
    "write_files": true,
    "git_commit": false,
    "git_push": false
  },
  "failure_policy": { "onFailure": "pause_hitl", "maxAutoRetries": 2 }
}
```

---

## 6. 各类 Node 产品规格（实现约束）

### 6.1 Agent Node

| Role | 输入 | 输出 | 完成条件 |
|------|------|------|----------|
| Planner | Goal、Project Context、可选 C4 摘要 | `DevPlan` | Zod 校验通过；可选 Human Review |
| Coder | `DevPlanTask` + 上下文范围 | `ChangeSet`（含 `agentRunId`） | AgentRun complete ∧ applySucceeded |
| Reviewer | 需求、DevPlan、ChangeSet、TestReport? | `ReviewResult` | 产出合法 verdict；`blocked`→Human |

Reviewer **默认不重写实现**；`needs_changes` 走回 Coder；`blocked` 进人。

执行配置统一：Agent Profile、Model、Context Scope、Write Scope、Tool Permissions、Budget。Write Scope 权威仍是 Function Map 叶子（P-1 不变量）；节点文案不得解析写路径。

### 6.2 Action Node

| Integration | MVP operations | 完成条件 |
|-------------|----------------|----------|
| `test` | `run`（可配置 command/cwd/timeout） | 产生 `TestReport`；机读失败不靠模型总结 |
| `github` | `create_branch` / `commit` / `push` / `create_pr` / `get_pr_status`（可裁） | API 成功 + `GitHubOpResult`；高风险默认 `requiresApproval` |
| `terminal` | `exec` | 退出码 + stdout/stderr 摘要；政策拒绝则 Failed/Blocked |

原则：Agent「想做」与 Action「做了」分开，以便权限、审计与确定性控制。

**不上画布的**：Coder 内部的普通读文件/搜索——除非该步骤需要独立分支决策或人类审批。

### 6.3 Logic Node

| Node | MVP 行为 |
|------|----------|
| Condition | 可视化比较器（字段/数值/字符串/简单 AND·OR）；高级表达式可选子集；双出口 `conditional` 边 |
| Loop | `maxIterations` + exit condition；失败上下文写回 carry；禁止无限 |
| Merge | 仅 `wait_for_all` + `require_success`；为未来 Parallel 预留 |
| Exit | 结束 Instance 并汇总 Artifacts |
| Retry / Wait | 优先作为节点 `failure_policy` / Human·waiting；独立 Node 可后置 |

Parallel：**调度不做**；契约允许多出边/多入边，避免日后破网。

### 6.4 Human Node

| Mode | 目的 | 决议 |
|------|------|------|
| Approval | 是否允许高副作用动作 | Approve / Reject / Edit→Approve（**必须执行编辑后参数**） |
| Review | 产物是否达标 | Accept / Request Changes / Reject |
| Input | 补信息 | Submit 字段；恢复 Ready |
| Decision | 选方案（可后置） | 选择分支 key |
| Takeover | 人接管任务（Future） | 恢复时 Agent 必须能读当前 NodeRun 上下文 |

Human UI 必须能挂载工程产物（DevPlan 视图、Diff、TestReport、待执行 GitHub 参数），不是单按钮弹窗。

---

## 7. 从 n8n 借鉴什么 / 不借鉴什么

| n8n 设计 | Project OS 处理 |
|----------|-----------------|
| 可拖拽 Node + Palette | 直接借鉴 |
| Node 输入输出数据流 | 借鉴并**强化 Zod/Artifact 类型** |
| IF / Switch | 借鉴为 Condition |
| Loop / Merge | 借鉴；Loop 强制上限 |
| Retry / Error Output | 借鉴为 `failure_policy` + 可选错误分支 |
| Sub-workflow | 未来；契约预留 |
| HTTP / DB / Code 生态 | 仅基础 Action；不做市场 |
| 通用 AI Agent Node | **改造为工程角色 Agent** |
| Human Review / Wait | **升级为独立 Human 类型 + 状态机** |
| Execution History | 映射为 Workflow Run + Node Run + Artifacts |
| 凭据商店 / 集成市场 | 不做 MVP |

参考（上游文档概念，实现时再对齐细节）：

- Work with nodes / Error handling / Sub-workflows / Understand executions（n8n-docs）  
- Human review for agent tools（n8n skills）

---

## 8. 现状架构 → 目标架构

### 8.1 现状（代码证据）

- 契约：`projectos/contracts/loop-graph.ts`（IntentGraph / LoopSpec / LoopInstance）  
- 编译：`loop-graph-compiler.ts`（启发式角色推断）  
- 运行：`loop-runtime-service.ts` + `loop-execution.ts`  
- UI：`workbench/.../LoopGraph/*`（无 Palette 分类、无 Inspector 分层）  
- 拓扑：单链 depends + ≤1 feedback；无 Condition 执行器  

### 8.2 目标模块增量

```text
contracts/loop-graph.ts          + NodeType / Artifact / EdgeKind / HumanDecision
contracts/loop-artifacts.ts      新建：DevPlan / ChangeSet / TestReport / …
services/loop-graph-compiler.ts  识别四类 Node；生成类型化 IO
services/loop-runtime-service.ts 按 type 分派 step*；Condition/Loop/Exit
services/loop-action-*.ts        Test / GitHub / Terminal 适配（经 Harness/已有 GitHub 服务）
services/loop-agent-roles.ts     Planner/Coder/Reviewer 提示词与输出校验
LoopGraph Palette/Inspector      按四类浏览；四层配置面板
Presets                          Feature Development Workflow
```

Orchestrator **仍然**只负责 Agent 节点内推理；Logic/Human/Action 不经模型宣布完成。

---

## 9. 与 Workflow Studio 计划的分工

| 主题 | 权威文档 |
|------|----------|
| Palette / Inspector / Preset 交互壳 | Studio Phase 1 **与** 本计划 NA-2（本计划规定 **内容模型**） |
| nodeRecords / pause / cancel / checkpoint | Studio Phase 2–3 |
| Fresh/Stale / ReplanProposal | Studio Phase 4 |
| 参数化 / 事件触发 | Studio Phase 5 |
| Graph 联动 | Studio Phase 6 |
| **Node 类型系统、Artifact、Condition/Loop、Human 模式、示范 Workflow** | **本计划** |

实施建议：先合 NA-0/NA-1（契约），再与 Studio LG-1.x / LG-2.1 同迭代，避免 Inspector 按旧三角色做完再推翻。

---

## 10. 分阶段任务

> 复杂度：S &lt; 1d，M 1–3d，L 3–7d。优先级：P0/P1/P2。

### Phase NA-0 — 决策冻结

#### NA-0.1 关闭粒度决策与兼容策略

| 字段 | 内容 |
|------|------|
| Task ID | NA-0.1 |
| 名称 | 确认 NA-D1–D10，更新 Studio §7 节点映射交叉引用 |
| 类型 | Documentation |
| 优先级 | P0 |
| 验收 | 三粒度问题无歧义；旧角色映射表签字；本文件状态可标 Design freeze |
| 复杂度 | S |

#### NA-0.2 Artifact / Edge ADR

| 字段 | 内容 |
|------|------|
| Task ID | NA-0.2 |
| 名称 | 冻结 MVP Artifact Zod 清单与 EdgeKind 扩展 |
| 类型 | Documentation |
| 优先级 | P0 |
| 验收 | DevPlan/ChangeSet/TestReport/ReviewResult/HumanDecision 字段列表无 TBD |
| 复杂度 | S |

---

### Phase NA-1 — 契约与兼容层

#### NA-1.1 扩展 loop-graph 契约

| 字段 | 内容 |
|------|------|
| Task ID | NA-1.1 |
| 名称 | 新增 `NodeType`、`AgentRole`、`HumanMode`、`ActionIntegration`；SpecNode 支持 type 化 IO 草模 |
| 可能修改 | `contracts/loop-graph.ts`、`loop-graph.test.ts`、normalize |
| 前置 | NA-0.1 |
| 验收 | 旧文档 normalize 后仍通过 schema；新字段可选 |
| 复杂度 | L |

#### NA-1.2 Artifacts 契约模块

| 字段 | 内容 |
|------|------|
| Task ID | NA-1.2 |
| 名称 | 新增 `contracts/loop-artifacts.ts` + 单测 |
| 前置 | NA-0.2 |
| 验收 | 非法 DevPlan / ReviewResult 被拒；Golden JSON 固定 |
| 复杂度 | M |

#### NA-1.3 拓扑校验升级

| 字段 | 内容 |
|------|------|
| Task ID | NA-1.3 |
| 名称 | 允许多出边（Condition）；Loop 边需 maxIterations；仍禁止未门闩无限环 |
| 可能修改 | `validateLoopSpecTopology`、compiler readiness |
| 验收 | 双出口 Condition 可批准；无上限 Loop 不可批准 |
| 复杂度 | M |

---

### Phase NA-2 — 编译、Palette、Inspector

#### NA-2.1 Compiler 认识四类 Node

| 字段 | 内容 |
|------|------|
| Task ID | NA-2.1 |
| 名称 | Intent → Spec 保留 type/role/mode/operation；启发式映射旧图 |
| 可能修改 | `loop-graph-compiler.ts`、compiler 测试 |
| 验收 | 旧三角色图编译结果可映射；新 Palette 节点不丢类型 |
| 复杂度 | M |

#### NA-2.2 Palette 按四类分组 + 角色/操作快捷项

| 字段 | 内容 |
|------|------|
| Task ID | NA-2.2 |
| 名称 | Palette：Agent 预设、Action 快捷、Logic、Human 入口 |
| 可能修改 | `LoopGraph/*`、i18n、可选 `loopPresets.ts` |
| 前置 | NA-1.1；建议与 Studio LG-1.1/1.2 同 PR 序列 |
| 验收 | 可拖出 Planner/Coder/Reviewer/Test/Condition/Approval/Review/Input |
| 复杂度 | M |

#### NA-2.3 Inspector 四层面板

| 字段 | 内容 |
|------|------|
| Task ID | NA-2.3 |
| 名称 | 侧栏分区：职责 / 配置 /（运行态只读）/ 产物与验证 |
| 验收 | 画布仅标题+类型+状态；详情全在侧栏 |
| 复杂度 | M |

#### NA-2.4 Feature Development Preset

| 字段 | 内容 |
|------|------|
| Task ID | NA-2.4 |
| 名称 | 内置示范 Workflow Preset（§4.4） |
| 验收 | 30 秒内得到可 compile 图；permissions 默认 git_push/create_pr 需 Approval |
| 复杂度 | S |

---

### Phase NA-3 — Runtime：Logic + Human 强化

#### NA-3.1 Condition 执行器

| 字段 | 内容 |
|------|------|
| Task ID | NA-3.1 |
| 名称 | `stepConditionNode`：读上游 Artifact 字段，选 `branchKey` 前进 |
| 可能修改 | `loop-runtime-service.ts`、测试 |
| 验收 | TestReport.status 分支到 Reviewer 或 Coder；无匹配边 → Failed/HITL |
| 复杂度 | M |

#### NA-3.2 有限 Loop / Retry 策略落地

| 字段 | 内容 |
|------|------|
| Task ID | NA-3.2 |
| 名称 | feedback/Loop 统一计入 iteration；触顶 → HITL 或 Exit |
| 验收 | maxIterations=3 时第 4 次不调度 Coder |
| 复杂度 | M |

#### NA-3.3 Human 模式状态机

| 字段 | 内容 |
|------|------|
| Task ID | NA-3.3 |
| 名称 | Approval/Review/Input 决议写入 HumanDecision；Edit 覆盖 Action payload |
| 可能修改 | `resolveLoopHitl` 演进或并行 API、UI HITL 面板 |
| 验收 | Edit 后 Create PR 使用新参数；Request Changes 回到 Planner/Coder |
| 复杂度 | L |

#### NA-3.4 Exit + Merge（wait_all）骨架

| 字段 | 内容 |
|------|------|
| Task ID | NA-3.4 |
| 名称 | Exit 汇总；Merge 在单活跃 Run 下可先作多入边汇合点校验 |
| 验收 | Exit 后 Instance complete 且 artifacts 可查询；Merge 缺成功前置不前进 |
| 复杂度 | M |

---

### Phase NA-4 — Runtime：Agent 角色与 Action

#### NA-4.1 Planner → 结构化 DevPlan

| 字段 | 内容 |
|------|------|
| Task ID | NA-4.1 |
| 名称 | Planner 运行产出校验后的 DevPlan Artifact（可先启发式/模板，后接模型） |
| 验收 | 下游 Coder 输入绑定 `tasks[i]`，不解析 Markdown 猜任务 |
| 复杂度 | L |

#### NA-4.2 Coder / Reviewer 角色配置

| 字段 | 内容 |
|------|------|
| Task ID | NA-4.2 |
| 名称 | 统一 agent 步进 + role prompt/输出校验；Coder→ChangeSet；Reviewer→ReviewResult |
| 契约 | 完成条件仍绑 AgentRun / 不允许自述成功 |
| 复杂度 | L |

#### NA-4.3 Test Action

| 字段 | 内容 |
|------|------|
| Task ID | NA-4.3 |
| 名称 | 可配置 command 的 Run Tests；输出 TestReport；挂 Evidence |
| 可能修改 | `loop-execution.ts`、verification 桥接 |
| 验收 | 失败列表可被 Condition 消费 |
| 复杂度 | M |

#### NA-4.4 GitHub Action（经审批）

| 字段 | 内容 |
|------|------|
| Task ID | NA-4.4 |
| 名称 | create_branch / create_pr 等经现有 GitHub auth 服务；默认 requiresApproval |
| 前置 | NA-3.3；GitHub Auth 已可用 |
| 验收 | 未 Approval 不调用 API；Approval 后结果写入 GitHubOpResult |
| 复杂度 | L |

#### NA-4.5 Terminal Action（受控）

| 字段 | 内容 |
|------|------|
| Task ID | NA-4.5 |
| 名称 | 显式 Terminal 节点走 Harness 政策；高风险命令强制 Approval |
| 验收 | policy_denied → Failed；不明超时 → Blocked（对齐 Studio D7） |
| 复杂度 | M |

---

### Phase NA-5 — 端到端示范与汇合

#### NA-5.1 Feature Development E2E

| 字段 | 内容 |
|------|------|
| Task ID | NA-5.1 |
| 名称 | Preset 从批准到（mock/录制）PR 的集成测试 |
| 验收 | §4.4 路径全绿；三图联动至少：Loop 状态、Agent Flow runId、C4 叶子高亮 |
| 复杂度 | L |

#### NA-5.2 文档与 Studio 交叉修订

| 字段 | 内容 |
|------|------|
| Task ID | NA-5.2 |
| 名称 | 更新 Studio §7/§20、Planning 交叉引用；标明 Condition 不再「永久延期」 |
| 复杂度 | S |

---

## 11. Task Dependency Map

```text
NA-0.1 ──┬── NA-1.1 ──┬── NA-2.1 ──┬── NA-2.2 ── NA-2.4
NA-0.2 ──┴── NA-1.2 ──┤           └── NA-2.3
                      └── NA-1.3 ─────────────────────┐
                                                       ├── NA-3.1 ── NA-3.2
                                                       ├── NA-3.3 ── NA-4.4
                                                       └── NA-3.4
NA-2.1 + NA-1.2 ── NA-4.1 ── NA-4.2 ── NA-4.3 ── NA-5.1
Studio LG-2.1 (nodeRecords) ── 与 NA-3.* 汇合
NA-5.1 ── NA-5.2
```

**建议首个可交付切片**：NA-0 → NA-1 → NA-2.2/2.4 → NA-3.1 + NA-3.3 → NA-4.3 → 最小 E2E（可不含真实 GitHub，先 mock Action）。

---

## 12. 测试与验收矩阵（增量）

| ID | 场景 | 期望 |
|----|------|------|
| T-NA1 | 旧 loop JSON 加载 | normalize 成功，角色映射正确 |
| T-NA2 | Planner 输出缺 tasks | 节点 Failed，不前进 |
| T-NA3 | Test failed × N | 有限回环后 HITL |
| T-NA4 | Condition 无 true 边 | Failed 或 HITL，不静默走 false |
| T-NA5 | Approval Edit PR title | Action 使用编辑后 title |
| T-NA6 | Reviewer blocked | 进入 Human，不自动 Merge/PR |
| T-NA7 | Coder 无叶子写范围 | 与今日一致：文件未挂接 |
| T-NA8 | 未 Approval 调 create_pr | 不可能成功（服务层拒绝） |
| T-NA9 | 画布不展示工具级文件列表 | 详情在 Agent Flow |
| T-NA10 | 定义修改不影响旧 Run | specVersion 冻结 |

---

## 13. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 类型系统过大拖垮 Studio 进度 | 契约先可选字段；Runtime 分派按 type 渐进 |
| 与旧 feedback 语义重复 | Loop 统一计数；文档写清 feedback vs Logic·Loop |
| GitHub Action 范围膨胀 | MVP 只做 branch + create_pr；其余 operation 占位 |
| Planner 结构化不稳定 | Zod 校验失败=节点失败；允许 Human 改 DevPlan |
| 表达式引擎挖坑 | Condition MVP 只用可视化比较器 |
| Parallel 预留变半吊子实现 | 多边可存，调度器仍单 Run |

---

## 14. ADR（摘要）

### ADR-NA-1：职责四类而非技术四类

- **决策**：产品主轴为 Agent/Action/Logic/Human。  
- **原因**：对齐 Engineering Workflow；避免「凡是 AI 都叫 Agent Node」。  
- **后果**：UI 文案与 Palette 按职责；实现上 Agent 仍共用 Orchestrator。

### ADR-NA-2：统一底层 + UI 特化入口

- **决策**：NA-D1/D2/D3。  
- **原因**：减少 Runtime 分叉，保留产品清晰度。  
- **后果**：快捷 Node 是糖衣，schema 同一。

### ADR-NA-3：Artifact 契约优于提示词约定

- **决策**：跨节点数据必须是 Zod Artifact 或显式 port ref。  
- **原因**：n8n 数据流可借鉴，但工程产物需要可验证。  
- **后果**：Planner/Reviewer 无合法输出即失败。

### ADR-NA-4：高副作用默认 Human Approval

- **决策**：push / create_pr / deploy / 危险 shell 默认 `requiresApproval`。  
- **原因**：Project OS 差异化在可控工程，而非最大自治。  
- **后果**：示范 Workflow 强制 Final Approval。

---

## 15. MVP 范围冻结清单

**做：**

- 四类 Node 契约 + 兼容映射  
- Planner / Coder / Reviewer 预设  
- Test + GitHub（最小）+ Terminal（受控）  
- Condition / 有限 Loop / Exit / Merge 骨架  
- Approval / Review / Input  
- Feature Development Preset + 核心 E2E  
- 与 Agent Flow / C4 的职责边界保持  

**不做：** Parallel 调度、审批链、插件市场、任意 Code Node、Takeover 完整实现、Sub-workflow UI、集成市场。

---

## 16. Definition of Done（计划级）

1. NA-0 决策关闭，状态可升为 Design freeze。  
2. 旧 loop 文档零破坏可读。  
3. Palette 可搭建 §4.4 示范图并批准。  
4. Condition + 有限重试 + Human Approval 在 Runtime 单测中可证。  
5. TestReport / DevPlan / HumanDecision 至少一类 Artifact 被下游真实消费。  
6. 文档交叉引用 Studio / Planning 已更新。  
7. 未实现 Parallel/Takeover 在 UI 中不假装可用。

---

## 17. 开放问题（仅余实现细节，不阻设计冻结）

| # | 问题 | 默认倾向 |
|---|------|----------|
| Q1 | `verify` 旧节点长期保留别名还是编译期改写为 `action:test`？ | 桥接 1–2 个版本后改写 |
| Q2 | DevPlan 落盘位置：挂 LoopInstance artifacts 还是 `.projectos/artifacts/`？ | 先挂 Instance，大对象再外置 |
| Q3 | Condition 表达式是否引入 mini-language？ | MVP 否；仅可视化比较 |
| Q4 | GitHub operation 集合最终裁剪？ | 先 `create_branch` + `create_pr` |
| Q5 | Reviewer 是否允许只读 AgentRun（无写权限）强制？ | 是 |

---

## 18. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-11-03 | 初稿：基于 n8n 取舍讨论与四层 Node 原则；锁定 NA-D1–D10 与三粒度结论；制定 NA-0–NA-5 任务切片 |
