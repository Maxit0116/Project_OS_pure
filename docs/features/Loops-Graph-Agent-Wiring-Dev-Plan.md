# Loops Graph · Agent Visual Wiring（n8n 式装配连线）— DevPlan

**状态**：Implementing（2026-11-05）。W0–W4 MVP 已落地（契约/fold、底端口虚线、Config 资产选择器、Apply/Save as Agent、Switch/Create 展开、Memory、community/disabled MCP 徽标、孤儿级联）。W5 仍可选。  
**范围**：把 Loops Graph 中 **Agent Node** 从「Picker / Inspector 黑盒配置」升级为 **主卡 + 底部配置端口 + 虚线卫星节点** 的可视化装配；配置层与工作流控制流分层；编译期 fold 进现有 Workforce / Orchestrator，不另起 Runtime。  
**产品定位一句话**：Agent 卡是任务职责外壳；Model / Memory / Capabilities 是可插拔资源，必须能在画布上一眼读出并拖线定制——而不是一个选项框就结束。  
**对标参考**：[`n8n-io/n8n`](https://github.com/n8n-io/n8n) AI Agent 节点（Chat Model\* / Memory / Tool 底端口 + 虚线卫星）——只借鉴**配置可视化机制**；不克隆通用 iPaaS / credentials 商店 / 任意 HTTP Tool 生态。

**权威交叉引用**：

| 文档 | 关系 |
|------|------|
| [`Loops-Graph-Node-Architecture-Dev-Plan.md`](./Loops-Graph-Node-Architecture-Dev-Plan.md) | **并行权威**：四类职责节点（Agent/Action/Logic/Human）、NA-D7 Agent≠Action；本计划**不改**控制流语义，只增加 Agent **配置层**边与卫星 |
| [`Loops-Graph-UI-Visual-Authoring-Dev-Plan.md`](./Loops-Graph-UI-Visual-Authoring-Dev-Plan.md) | 图标节点、Palette、Duty 浮动卡；本计划扩展 Agent 卡底端口、虚线路由、Config Palette 分组 |
| [`Loops-Graph-Workflow-Studio-Dev-Plan.md`](./Loops-Graph-Workflow-Studio-Dev-Plan.md) | Studio 壳 / pause / Fresh·Stale；本计划不碰可靠性切片 |
| [`Specialized-Agent-Workforce-Dev-Plan.md`](./Specialized-Agent-Workforce-Dev-Plan.md) | `agentDefinitionId`、Workforce draft（model/skills/mcp）；本计划把这些字段**可视化到画布** |
| [`Marketplace-Installed-Agent-Compose-Dev-Plan.md`](./Marketplace-Installed-Agent-Compose-Dev-Plan.md) | Assembly bindings（skill/mcp/rules…）；本计划画布装配与 Compose **合流同一真相** |
| [`Capability-Marketplace-Dev-Plan.md`](./Capability-Marketplace-Dev-Plan.md) / Skills / MCP | 已装能力库是卫星节点的主数据源 |
| [`Agent-Memory-Dev-Plan.md`](./Agent-Memory-Dev-Plan.md) | Memory 端口语义；本计划只做挂载 UX + 解析，不重做记忆存储 |
| [`Agent-Harness-Dev-Plan.md`](./Agent-Harness-Dev-Plan.md) | ToolPolicy / 预算；虚线配置**不得**绕过 Harness |

**已有实现锚点（勿重复建设）**：

- Loop 契约：`contracts/loop-graph.ts`（`IntentGraphNode.agentDefinitionId`；边 kind = `depends|feedback|conditional`）
- 画布：`workbench/src/components/LoopGraph/LoopGraphOverlay.tsx`、`loopNodeVisuals.ts`、`LoopGraphPalette.tsx`、`LoopNodeInspector.tsx`
- Workforce：`contracts/agent-workforce.ts`（`modelProfileId` / `skillIds` / `mcpServerIds`）、`AgentPicker`、`create_agent` / Draft·Assembly Card
- 装配：`contracts/agent-assembly.ts`、`services/workforce-agent-assemble.ts`
- Runtime：`loop-runtime-service` → Orchestrator + Workforce light 注入（instructions + skills）

---

## 0. 核心诉求（讨论锁定）

| # | 诉求 | 本计划对应 |
|---|------|------------|
| 1 | Agent 需要接**后端模型**，不能只靠隐藏下拉 | `Model*` 底端口 + Model Profile 卫星 + 虚线 |
| 2 | Agent 可以有对应**行为 / 职责** | 主卡保留 `agentRole` + Duty prompt；行为边界仍用下游 Action/Human **实线** |
| 3 | 按 Project OS 设计挂 **Capabilities** | `Capability` 多连端口 → Skill / MCP（主）；Rules / Pack（次）卫星 |
| 4 | 用**可视化连线**定制，而不是单独选项框结束 | 配置边 `provides`（虚线）；Inspector 降为同一真相的详细编辑器 |
| 5 | 保持 Loops = 工程工作流图，不是 n8n 克隆 | Action/Logic/Human **禁止**变成 Agent 脚下 Tool 小圆点（NA-D7） |
| 6 | 与现有 Workforce / Marketplace 合流 | 默认 **引用模式**改 Definition；可选节点 Override；Save as Agent |

**价值链**：

```text
Palette / 已装库 / Model Profiles
        │
        ▼
  拖卫星到画布 或 从 Agent 底端口「+」挑选
        │
        ▼
  虚线 provides → Agent 配置端口（Model* / Memory / Capability）
        │
        ▼
  一眼识读装配面；Incomplete / 风险徽标
        │
        ▼
  编译 fold → agentDefinitionId 解析 ± node override
        │
        ▼
  现有 Orchestrator + Harness（无第二 Runtime）
```

**交互全流程（作者向）**：

```text
1. 从 Palette 放 Agent（Planner/Coder/Reviewer 预设）→ 主卡出现，底边端口空置
2. 可选：Switch Agent / 选用已有 Workforce → 自动展开其 model/skills/mcp 为卫星（只读或可拆）
3. 从 Config Palette 拖 Model Profile → 落到画布 → 拖到 Agent「Model*」端口（或端口 + 打开 Picker）
4. 同理挂 Memory（可选）、若干 Skill / MCP
5. 主流程仍用实线连上游/下游 Action·Logic·Human
6. Open Duty：表单与虚线双向同步；改其一即改同一数据
7. （可选）「Save wiring as Agent」→ update/create Workforce Definition
8. Compile / Approve / Run：配置边不参与调度拓扑；只影响该 Agent 节点执行注入
```

---

## 1. 产品决策（本计划基线）

| ID | 决策 | 落地含义 |
|----|------|----------|
| **AW-D1** | **双层边** | 实线 = 控制/数据流（`depends` / `feedback` / `conditional`）；虚线 = 配置供给（新 kind `provides`）。视觉线型必须可辨 |
| **AW-D2** | **Agent 主卡 + 底边配置端口** | 对标 n8n：主卡左右（或四向）仍是工作流 ports；**底边**专供 Model\* / Memory / Capability |
| **AW-D3** | **Role 不是连线资源** | `agentRole` 继续是 Palette 预设 / 主卡属性；不做成「Role 卫星」 |
| **AW-D4** | **Capability 统一多连端口（MVP）** | 底边一个 `Capability`（可多连），卫星自带 kind 图标区分 Skill/MCP；后期可拆分端口 |
| **AW-D5** | **引用模式默认 + 可选 Override** | 虚线默认写入/反映 `AgentDefinition`（`agentDefinitionId`）；节点可「Detach override」存节点级补丁，不改 Definition |
| **AW-D6** | **General Agent 也可装配** | `agentDefinitionId = null` 时，装配存在节点 Override；提示「Save as specialized Agent」以免只活在单图 |
| **AW-D7** | **Action ≠ Agent Tool** | GitHub / Test / Terminal / Human 保持工作流节点；不得收进 Capability 卫星 |
| **AW-D8** | **Inspector 双通道** | 连线与 Duty/Config 表单编辑同一真相；禁止只连线可改或只表单可改 |
| **AW-D9** | **不新建第五类职责节点** | 卫星是 `config` 附属节点（`satelliteKind`），**不是** Agent/Action/Logic/Human |
| **AW-D10** | **安全不变量继承 Marketplace** | 挂 community MCP 须风险徽标；不自动 enable；不写 `permissions.json`；虚线不能绕过 ToolPolicy |

### 1.1 与 n8n 映射（刻意不对齐处）

| n8n | Project OS |
|-----|------------|
| Chat Model\* | Model Profile\* |
| Memory | Memory provider（project / buffer / none） |
| Tool（SaaS/HTTP…） | **Capability**：Skill / MCP（工程能力库） |
| 工作流右侧 Action | 独立 **Action / Human** 实线节点（更严） |

---

## 2. 可连选项清单（端口合同）

### 2.1 Agent 底边端口

| 端口 id | 基数 | 必填 | 卫星类型 | 绑定字段（fold 目标） |
|---------|------|------|----------|----------------------|
| `model` | 0..1 | **产品默认必填\*** | `model` | `modelProfileId` |
| `memory` | 0..1 | 否 | `memory` | 节点/Definition 的 memory 挂载声明（见 §3） |
| `capability` | 0..N | 否 | `skill` \| `mcp` \| `rules` \| `pack` | `skillIds` / `mcpServerIds`；（rules/pack v1 弱绑定） |

\*「必填」= 画布 Incomplete 警告 + Compile 可配置为 warn 或 soft-block；General 回退默认 profile 时允许跑，但 UI 须显示「using default model」。

### 2.2 卫星节点（Config Satellites）

| `satelliteKind` | 数据源 | 卡片内容 | 备注 |
|-----------------|--------|----------|------|
| `model` | Settings `modelProfiles` | 名称 / provider 短标 | 一 Agent 最多一条 `provides` 入 `model` |
| `memory` | 枚举：`project` \| `buffer` \| `none`（MVP） | 图标 + 模式名 | 深入读写仍走 Agent-Memory；本计划只挂载 |
| `skill` | 已装 Skills | 名称 + trust | 可多颗挂同一 `capability` 口 |
| `mcp` | 已装 MCP servers | 名称 + enabled/community 徽标 | community 默认警告 |
| `rules` | 已装 Rules（可选） | 名称 | v1：建议注入 instructions 摘要或「建议安装」；不强绑 runtime |
| `pack` | Capability pack 引用（可选） | pack 名 | 展开为多 skill/mcp 的折叠表示；W3+ |

### 2.3 明确不可作卫星 / 不可挂底端口

- Action：`github` / `test` / `terminal`
- Logic：`condition` / `loop` / `merge` / `exit` / …
- Human：`approval` / `review` / `input` / …
- 任意外部 HTTP credentials 节点、未装且未走 Marketplace 流程的「假 Tool」

### 2.4 主卡保留（不连线）

| 字段 | 原因 |
|------|------|
| `title` / `prompt`（Duty） | 任务语义，属职责层 |
| `agentRole` | 工程 taxonomy（NA-D1） |
| `agentDefinitionId` 显示名 | Identity；可用 Picker，亦可由「展开卫星」表达 |
| failure / budget（后期） | Inspector；Policy 卫星延期 |

---

## 3. 契约与编译语义

### 3.1 Intent / Spec 扩展（示意）

```text
IntentEdgeKind += "provides"     // 配置供给；不参与调度拓扑校验的 depends 规则

// 配置卫星节点（可与 IntentGraphNode 共用表，用 type 区分，或独立数组）
IntentGraphNode 扩展可选：
  type: "agent" | "action" | "logic" | "human" | "config"
  satelliteKind?: "model" | "memory" | "skill" | "mcp" | "rules" | "pack"
  configRef?: {                  // 指向项目资产
    modelProfileId?: string
    skillId?: string
    mcpServerId?: string
    memoryMode?: "project" | "buffer" | "none"
    packId?: string
    rulesId?: string
  }

// Agent 节点可选覆盖（Detach override）
agentWiringOverride?: {
  modelProfileId?: string | null
  skillIds?: string[]
  mcpServerIds?: string[]
  memoryMode?: "project" | "buffer" | "none"
}

provides 边：
  source = config 卫星 id
  target = agent 节点 id
  kind = "provides"
  targetPort = "model" | "memory" | "capability"   // 复用/扩展 port 字段
```

**拓扑校验增量**：

- `provides` 边：source 必须是 `type=config`；target 必须是 `type=agent`。  
- `model` 端口入度 ≤ 1；`memory` ≤ 1；`capability` 入度有上限（建议 ≤ 16，与 draft 上限对齐）。  
- `provides` **不计入** depends 的 outdegree≤1 等控制流约束。  
- 删除 Agent 时：可选级联删除仅被该 Agent 引用的孤儿卫星（产品默认：**级联删除未共享卫星**）。  
- 同一卫星可被多个 Agent `provides`（共享 Model Profile 节点）——允许；改卫星 = 改引用的资产或显示层别名（见 AW-D5）。

### 3.2 Fold 规则（编译 / 运行前）

```text
resolveAgentWiring(agentNode):
  1. base = load Workforce Definition(agentDefinitionId) or General defaults
  2. fromEdges = all provides → this agent
  3. edgePatch = { modelProfileId?, skillIds[], mcpServerIds[], memoryMode? }
  4. if agentWiringOverride 存在 → override 覆盖 edgePatch / base（节点优先）
  5. else if 引用模式 → 将 edgePatch 写回 Definition（仅在用户显式「Apply to Agent」或自动同步策略下；见 Q2）
  6. runtimeInject = merge(base, edgePatch, override) → 现有 light 注入路径
```

**MVP 推荐默认同步策略（Q2 默认）**：

- 画布编辑虚线时：**先写节点级 resolved view + `agentWiringOverride` 或草稿边**；  
- 提供明确按钮 **「Apply wiring to Agent definition」** / **「Save as new Agent」**；  
- 避免静默改写被 Chat 与其它 Loop 共享的 Definition（防惊吓）。

### 3.3 与控制流边的隔离

| 校验 / Runtime | `depends` 等 | `provides` |
|----------------|--------------|------------|
| 调度就绪 | 是 | 否 |
| Artifact 传递 | 是 | 否 |
| AgentRun 注入 | 否 | **是**（fold 后） |
| Incomplete UI | 目标/角色缺失等 | Model\* 空、坏引用、community 风险 |

---

## 4. UI / 交互规格

### 4.1 Agent 卡视觉

```text
┌──────────────────────────────────┐
│ [role icon]  Short title      ▾  │
│ Workforce · {name} | General     │
│                                  │
│  (E/W 工作流 ports 保持现网)      │
├──────────────────────────────────┤
│ Model*   Memory   Capability(+)  │  ← 底边端口标签
└───┬────────┬──────────┬──────────┘
    ┊        ┊          ┊┊┊          ← 虚线曲线（tech tokens，非玻璃）
 [Sonnet]  [Mem]   [Skill][MCP]…
```

- 类别色延续 `--loop-cat-agent`；卫星用更小尺寸（建议 ~120×40 或圆形 36 + 标签）。  
- Incomplete：`Model*` 未连且无默认 → 端口警示环；community MCP → 警告点。  
- 选中 Agent 时高亮其所有 `provides` 边与卫星。

### 4.2 连线交互

| 动作 | 行为 |
|------|------|
| 从卫星拖到 Agent 底端口 | 创建 `provides`；端口类型不匹配则拒绝并 toast |
| 从底端口 `+` | 弹出过滤后的 Picker（Model / Memory / Installed Skill|MCP），确认后自动创建卫星（若画布尚无）并连线 |
| 断开虚线 | 删除 `provides`；卫星若无其它引用且为自动创建 → 删除卫星 |
| 实线工具 | 不得误连到配置端口（端口 hit-test 分区） |
| Duty 表单改 skillIds | 画布补/拆对应卫星与边（AW-D8） |

### 4.3 Palette

在现有 Agent/Action/Logic/Human 旁增加 **Config** 分组（折叠态一个插头/芯片图标）：

- Model Profile（列表来自项目 Settings）  
- Memory（三种模式快捷项）  
- Skill / MCP（已装；空态引导 Marketplace）  

拖到空白 = 创建卫星；拖到 Agent 卡/端口 = 创建卫星（若需要）+ `provides`。

### 4.4 右键 / Duty

| 项 | 动作 |
|----|------|
| Open Duty | 现有 Inspector；增加「Wiring」只读摘要 + 与表单同步的 ids |
| Switch Agent | 现有；切换后 **Re-expand wiring**（替换卫星展开） |
| Apply wiring to Agent | 把当前 fold 结果写入 Definition（需确认） |
| Save as new Agent | `createWorkforceAgent` |
| Detach override / Clear override | 开闭节点覆盖 |
| Delete | 现有；级联策略见 §3.1 |

### 4.5 与 Create Agent / Assembly 合流

- Loop `create_agent` / Marketplace Assembly 成功并 place 后：自动展开 wiring 卫星。  
- 画布「Save as Agent」复用 `WorkforceAgentDraft` 字段，不新造 draft schema。  
- 不在画布内重做 Scope Consent；需要装新能力时 CTA → Marketplace。

### 4.6 视觉与 token

- 遵循 tech theme（`--tech-*`）；虚线用 `stroke-dasharray` + muted accent。  
- 禁止玻璃拟态 / 紫色渐变装饰。  
- `prefers-reduced-motion`：连线动画可关。

---

## 5. 信息架构 / 代码落点（实现时）

| 层 | 建议路径 / 职责 |
|----|-----------------|
| 契约 | `loop-graph.ts`：`provides`、`type: config`、`satelliteKind`、`configRef`、`agentWiringOverride`、校验函数 |
| Fold | `services/loop-agent-wiring.ts`（新建）：resolve / validate / expand-from-definition |
| 编译 | `loop-graph-compiler.ts`：fold 进 Spec 节点执行配置；`provides` 不进控制拓扑 |
| Runtime | `loop-runtime-*` / workforce 注入：只消费 fold 结果 |
| 视觉 | `loopNodeVisuals.ts` + 新 `loopWiringVisuals.ts`；Overlay 虚线路由 |
| Palette | `LoopGraphPalette` Config 分组 |
| Inspector | `LoopNodeInspector` Wiring section |
| Store | `loopGraphStore`：连线 API、级联删除、与 override 同步 |
| i18n | `chat.loopGraph.wiring*` |
| 测试 | 契约 Zod + wiring fold 单测 + Overlay 静态 markup / 交互测 |

---

## 6. 里程碑与切片

| Phase | 主题 | 合格线 |
|-------|------|--------|
| **W0** | 本文档 + 邻居互链；§9 默认确认 | ✅ |
| **W1** | 契约：`provides` + `config` 卫星 + 校验；fold 纯函数 | ✅ `loop-graph` / `loop-agent-wiring` + 单测 |
| **W2** | Agent 底端口 UI + 虚线绘制 + Palette Config（Model/Skill/MCP） | ✅ Overlay 底端口 / `edgeProvides` / Config Palette / Inspector Wiring |
| **W3** | 从 Definition 展开卫星；Apply / Save as Agent；Switch Agent 重展开 | ✅ Switch/Create expand；Duty + 右键 Apply/Save；Config 资产 Picker |
| **W4** | Memory 端口 + community 风险徽标 + 级联删除 + Eval 冒烟 | ✅ Memory 端口/卫星；community/disabled 徽标；级联删除；Eval 条目可勾 |
| **W5**（可选） | Rules/Pack 卫星；Capability 分端口；Policy 卫星；共享卫星布局力导 | 按需 |

**建议执行顺序**：W0 → W1 → W2 → W3 → W4；（W5 按需）

**本计划授权实现的条件**：W0 关闭后，才允许开 W1 PR。

---

## 7. 明确延期

| 项 | 原因 |
|----|------|
| 把 Action/Human 收成 Agent Tool 卫星 | NA-D7；工程职责图底线 |
| 通用 HTTP/SaaS credentials 节点市场 | 非 iPaaS；与 Workflow Studio 非目标一致 |
| 画布内静默改写共享 Definition（无确认） | 多入口共用 Agent，防惊吓（见 Q2） |
| 第二套 Agent Runtime / 模型自由 tool loop | Harness / Backend 锁定 |
| Agent → Action「authorized tool」引用边 | 有价值，属 W5+；勿堵 MVP |
| Memory 存储/审批重做 | 已有 Agent-Memory；本计划只挂载 |
| 按 Agent 强制裁剪 MCP catalog / permissions 覆盖 | Workforce 已延期 |
| Subflow / 多层画布里的嵌套 Agent wiring | 契约可预留；实现延后 |
| LLM 自动在画布上布线 | 先手动 + Expand from Definition |

---

## 8. 测试与验收

### 8.1 自动化

- Zod：含 `provides` / config 节点的 IntentGraph round-trip。  
- 校验：model 入度 2 → fail；provides 指向 Action → fail；depends 规则不受 provides 影响。  
- Fold：Definition + 边 + override 优先级单测。  
- 安全：fold / Apply 路径不 enable MCP、不写 permissions。

### 8.2 人工冒烟

1. 放置 Coder → 挂 Model + 2 Skill + 1 MCP → 虚线可见 → Open Duty 字段一致。  
2. 选用已有 Workforce Agent → 卫星自动展开 → 断一条 skill 边 → Duty 同步。  
3. Apply to Agent → 其它入口 Picker 再打开该 Agent 可见更新。  
4. Save as new Agent → 新 Definition 出现；原图可 Switch 过去。  
5. 主流程实线连 Test / Approval 不受影响；Create PR 仍不能当卫星。  
6. community MCP 徽标；Compile/Run 仍走原 Orchestrator。  
7. 删除 Agent → 孤儿自动卫星被清；共享 Model 卫星保留。

### 8.3 Eval

在 [`Agent-Harness-Eval-Checklist.md`](./Agent-Harness-Eval-Checklist.md) 增加「Loops Agent Wiring」条目（W0 占位，W4 勾选）。

---

## 9. 未决问题（实现前默认）

| # | 问题 | 本计划默认 |
|---|------|------------|
| **Q1** | Capability 统一端口 vs Skill/MCP 分端口 | **MVP 统一 `capability` 多连**；W5 可拆 |
| **Q2** | 虚线是否自动写回 Definition | **否**；默认节点 resolved + 显式 Apply / Save as |
| **Q3** | Model\* 未连是否硬阻断 Compile | **Warn + 使用 General 默认 model**；UI Incomplete；设置项可升级为 block |
| **Q4** | 卫星是否允许跨 Agent 共享 | **允许**（尤其 Model）；删除策略：有引用则保留 |
| **Q5** | Memory MVP 枚举 | **`project` \| `buffer` \| `none`**；与 Agent-Memory 对齐，不发明第四套存储 |

产品若改写默认，须先改本文再开 W1。

---

## 10. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 画布噪声（卫星过多） | 默认折叠「Capability 组」；选中 Agent 才展开全部虚线；上限 16 |
| 用户把 Action 当 Tool 拖到 Agent | Palette 分区 + 端口类型拒绝 + 文档/空态文案 |
| Definition 被多图静默改坏 | Q2：强制 Apply 确认 |
| 与 Inspector 双通道不同步 | 单一 `resolveAgentWiring` 派生 UI |
| 控制流校验被 provides 污染 | 校验函数显式过滤 kind |
| 做成 n8n 克隆预期 | 文案强调 Capabilities / 工程 Action 分离 |

---

## 11. Definition of Done（计划级）

1. W0 文档与邻居互链完成；AW-D1–D10 与 Q1–Q5 默认被确认或修订记录。  
2. W1–W4 可独立 PR；每阶段有合格线。  
3. 用户可在 Loops Graph 用虚线完成：Model + Capabilities（± Memory）装配，并与 Duty 表单一致。  
4. 控制流四类节点语义与 NA-D7 无回归；无第二 Runtime。  
5. Apply / Save as Agent 与 Workforce / Marketplace 数据合流。  
6. 安全不变量：不自动 enable MCP、不写 permissions、community 可见风险。  
7. Eval 冒烟条目可执行。

---

## 12. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-11-05 | 初稿：基于 n8n AI Agent 对标讨论 + Project OS Agent/Capability/Workforce 现状；冻结 AW-D1–D10、端口合同、交互全流程、W0–W5 切片 |
