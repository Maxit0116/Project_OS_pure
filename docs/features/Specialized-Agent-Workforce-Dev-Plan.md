# Specialized Agent Workforce — DevPlan

**状态**：M0–M5 MVP implemented。  
**范围**：把 Project OS 从「单一通用 Agent Mode」演进为可配置的专职 Agent 编制：选用、创建、绑定到 Chat / Loops Graph，并以轻量运行时注入 instructions + Skills；Agent Pool 观察面复用现有 Definition / PoolRun。  
**产品定位一句话**：用户可以组建自己的 AI Agent 编制（通用 + 专职），在单次对话或 Loops 流水线中选用它们，而不是每次在 prompt 里手工点名工具与角色。

**权威交叉引用**：

| 文档 | 关系 |
|------|------|
| [`Agent-Pool-Dev-Plan.md`](./Agent-Pool-Dev-Plan.md) / [`Agent-Pool-Trace-Waterfall-Dev-Plan.md`](./Agent-Pool-Trace-Waterfall-Dev-Plan.md) | Pool 观察与 Definition 车道；本计划扩展 **workforce** 种 Definition，不重做 Waterfall |
| [`Loops-Graph-Node-Architecture-Dev-Plan.md`](./Loops-Graph-Node-Architecture-Dev-Plan.md) | Loop `agentRole` = 职责 taxonomy；本计划增加 **执行主体** `agentDefinitionId` |
| [`Agent-Harness-Dev-Plan.md`](./Agent-Harness-Dev-Plan.md) / Skills Marketplace | Skills / MCP / permissions 仍为项目资产；本计划做 Agent 级**绑定展示与 skill 注入**，MCP/权限子集强制执行延期 |
| [`Capability-Marketplace-Dev-Plan.md`](./Capability-Marketplace-Dev-Plan.md) | Agent **Export / 目录安装**（P2）+ 依赖引导跳转（P5）；本计划负责本地 CRUD 与 runtime light 注入 |
| [`Marketplace-Installed-Agent-Compose-Dev-Plan.md`](./Marketplace-Installed-Agent-Compose-Dev-Plan.md) | **Implemented**：Marketplace Installed 第三创建入口（库可见装配 + 可选 Catalog 扩搜）；draft/create API 与本计划合流 |
| [`Loops-Graph-Agent-Wiring-Dev-Plan.md`](./Loops-Graph-Agent-Wiring-Dev-Plan.md) | Loop 画布上把 Definition 的 model/skills/mcp **展开为虚线卫星**；Apply / Save as Agent 写回本计划 CRUD |
| [`Specialist-Agent-Talent-Library-Dev-Plan.md`](./Specialist-Agent-Talent-Library-Dev-Plan.md) | **Planned**：按部门扩展内置 Agent Catalog（Template）；安装/创建后的 Instance 仍走本计划 CRUD |
| [`Loops-Graph-Agent-Work-Group-Dev-Plan.md`](./Loops-Graph-Agent-Work-Group-Dev-Plan.md) | Loops 画布 **专职小队工作组**；成员必须绑定本计划 workforce Definition |
| Settings `AgentProfile` | 继续解析 **General Agent**（`feature_change` / `debug_fix`） |

---

## 1. 锁定产品决策

1. **General Agent** = 今日 Agent Mode（`change`），经现有 `AgentProfile` 解析；`activeAgentDefinitionId = null`。  
2. **Specialized Agent** = 项目持久化的 workforce `AgentDefinition`（`agent_<uuid>`），含 instructions、role、model、skillIds、mcpServerIds、permissionNotes。  
3. **Select ≠ Create**：Picker 只选用；创建必须经确认 Card 后入库。  
4. **共享 `AgentPicker`**：Chat Mode 二级菜单、Loop Palette Agent flyout、节点 Switch Agent。  
5. **Custom Mode skill** 与专职 Agent **互斥**（选专职清除 `activeCustomModeSkillId`）。  
6. **Create-from-prompt v1**：启发式 NL → 可编辑 Draft Card（无独立 LLM agent-spec compiler）。  
7. **Runtime v1（light）**：合并 instructions + 注入 skill bodies；Pool 绑定同一 `definitionId`。MCP catalog 子集与 permissions 文件覆盖 **延期**（配置可存可展示）。  
8. **本轮不做**：多 Agent 并行调度、模型驱动 Planner/Reviewer、Settings 全量 Agent CRUD 重做、会话级临时 Agent。

---

## 2. 概念对照（现状 → 愿景）

| 概念 | 现状 | Workforce 语义 |
|------|------|----------------|
| `AgentProfile` | Settings 模板（prompt/model/kind） | **General Agent** 解析源 |
| `AgentDefinition`（pool_lane） | `def_root_*` / `def_loop_*` 观察车道 | 继续只做观察 |
| `AgentDefinition`（workforce） | （新增） | 可配置编制成员，可驱动执行 |
| `AgentRun` / `AgentPoolRun` | 执行 + 观察会话 | 不变；选用 workforce 时 Definition 指向 `agent_*` |
| Loop `agentRole` | planner/coder/… 职责标签 | 职责；与 `agentDefinitionId`（执行主体）分离 |
| Skills / MCP | 项目库 + Hub 提示 | Agent 配置绑定；v1 仅 skill 注入进 run |

---

## 3. UX 表面

### 3.1 Chat — Mode 二级选择

- 一级：Ask / Plan / Agent / Debug（+ Anchored）。  
- 仅 **Agent** 打开二级：General → My Agents → Create Agent…  
- Chip：`Agent` 或 `Agent · {name}`。  
- 绑定范围：当前 Chat session（`activeAgentDefinitionId`）。

### 3.2 Chat / Loop — 创建 Agent

- Composer 进入 `create_agent` 子状态；提交 → Draft Card（name、role、skills、MCP、instructions、model）。  
- Create → 写入 `.projectos/agent-definitions/`；Chat 可自动选用；Loop 可 Create & place。

### 3.2b Marketplace Installed — Compose Agent（Implemented）

- 见 [`Marketplace-Installed-Agent-Compose-Dev-Plan.md`](./Marketplace-Installed-Agent-Compose-Dev-Plan.md)。  
- Installed 底栏 prompt → Scope Consent → 可勾选 Assembly Card（本地 ± Catalog）→ 确认安装缺项后 `createWorkforceAgent`。  
- 与 Chat/Loop Create **并存**；不替换本计划 M2 路径。

### 3.3 Loops Graph

- Palette Agent：二级 Picker 后再放置（绑定 `agentDefinitionId`）。  
- 拖 Generic Agent 后右键 **Switch Agent**（仅 draft、仅 agent 节点）；默认 General。  
- 空白右键 **Create Agent…** → 下方 composer → `create_agent`。

---

## 4. 契约与持久化

- 扩展 `AgentDefinition.config`：`kind: "workforce" | "pool_lane"`（默认 `pool_lane`）、`instructions`、`roleLabel`、`skillIds`、`mcpServerIds`、`permissionNotes`。  
- 辅助契约：`projectos/contracts/agent-workforce.ts`（draft / create / update 请求）。  
- API：`listWorkforceAgents`、`createWorkforceAgent`、`updateWorkforceAgent`、`draftWorkforceAgent`。  
- Loop：`IntentGraphNode.agentDefinitionId`；`LoopComposerMode` += `create_agent`。  
- Chat session：`activeAgentDefinitionId`。

---

## 5. 里程碑

| Milestone | 内容 | 状态 |
|-----------|------|------|
| **M0** | 契约 + 持久化 CRUD + IPC | Done |
| **M1** | `AgentPicker` + Chat 二级选用 + session 绑定 | Done |
| **M2** | create_agent + heuristic draft + Draft Card（Chat + Loop） | Done |
| **M3** | Loop `agentDefinitionId`、Palette flyout、Switch Agent、空白 Create | Done |
| **M4** | Runtime 注入 instructions/skills；Pool / Loop 元数据绑定 | Done |
| **M5** | 空态、视觉抛光、本文档里程碑勾选 | Done |

---

## 6. 明确延期

- 按 Agent 裁剪 MCP tool catalog / Ask `completeWithTools` 子集。  
- 按 Agent 覆盖 `.projectos/permissions.json`。  
- `AgentProfile.enabledTools` 接到 Harness（与本计划正交，可另开）。  
- Loop Planner/Reviewer 改为真实 AgentRun。  
- 项目内多 AgentRun 真并行。

---

## 7. 验收（MVP）

1. Chat 可选 General / 专职；chip 显示名称。  
2. NL 创建经 Card 确认后出现在 Picker。  
3. Loop 可放置/切换绑定；空白可切入创建模式。  
4. 选用专职后 Change run 带上 definition instructions + skill bodies；Pool 车道 id 为 `agent_*`。  
5. Ask/Plan/Debug 与未绑定 Agent Mode 行为回归不变。
