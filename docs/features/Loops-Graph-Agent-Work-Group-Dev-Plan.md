# Loops Graph · Agent Work Group — DevPlan

**状态**：Implementing（2026-11-13）— WG-0–WG-6 主体已落地（契约 / Draw 虚线框 / 边界桩 / 编译展开 / Review 容器 / Runtime 组预算 / 人才库组队）；WG-7 验收矩阵见 §7。  
**范围**：在 Loops Graph Intent 画布上引入 **Agent Work Group（工作组）**：虚线矩形框收纳专职 Agent，作为可连线的内部编排小队；编译展开为 Spec 子编排；运行时复用现有 Loop Runtime + Workforce 注入，不另起引擎。  
**产品定位一句话**：用户在 Loops Graph 用虚线工作组「组队」，把若干专职 Agent 收成一个可运行的开发/执行小队，再把小队接到整条 Loop 流水线里。

**权威交叉引用**：

| 文档 | 关系 |
|------|------|
| [`Loops-Graph-Gaps-Closure-Dev-Plan.md`](./Loops-Graph-Gaps-Closure-Dev-Plan.md) | Parallel/Loop **拓扑虚线容器**与本计划 **编制工作组**语义分离、可并存；本计划不替代 GC Parallel |
| [`Loops-Graph-Workflow-Studio-Dev-Plan.md`](./Loops-Graph-Workflow-Studio-Dev-Plan.md) | Studio 壳 / Fresh·Stale；组编辑必须走既有 edit-stale |
| [`Loops-Graph-Node-Architecture-Dev-Plan.md`](./Loops-Graph-Node-Architecture-Dev-Plan.md) | 四类 Duty 不变；工作组不是第五类节点类型 |
| [`Loops-Graph-Agent-Wiring-Dev-Plan.md`](./Loops-Graph-Agent-Wiring-Dev-Plan.md) | Model/Skill/MCP **provides 卫星仍挂单 Agent**；不进工作组框 |
| [`Loops-Graph-UI-Visual-Authoring-Dev-Plan.md`](./Loops-Graph-UI-Visual-Authoring-Dev-Plan.md) | Palette / Overlay / Duty 卡；本计划叠加虚线框层 |
| [`Loops-Graph-Review-Visual-Dev-Plan.md`](./Loops-Graph-Review-Visual-Dev-Plan.md) | Review PathMap 识读工作组容器 |
| [`Loops-Graph-Semantic-Layout-Dev-Plan.md`](./Loops-Graph-Semantic-Layout-Dev-Plan.md) | 整图 TB 布局时 Work Group 为复合单元；L1 chip 矩阵合同保留 |
| [`Specialized-Agent-Workforce-Dev-Plan.md`](./Specialized-Agent-Workforce-Dev-Plan.md) | 成员必须绑定 workforce `AgentDefinition` |
| [`Specialist-Agent-Talent-Library-Dev-Plan.md`](./Specialist-Agent-Talent-Library-Dev-Plan.md) | 人才库多选 →「组成工作组」批量放置 |
| Function Map `map-work-group` | **仅借鉴**虚线框 + 标题 UI；**不**复用 sticky 邻接 / hole-free 几何 |

---

## 0. 命名澄清

| 产品说法 | 代码真相 | 说明 |
|----------|----------|------|
| **Agent Work Group / 工作组** | `LoopWorkGroup` + 成员 `workGroupId` | 本计划主战场：专职小队编制 |
| **Parallel / Loop 容器** | Gaps Review/Run 虚线区域 / `groupId`（拓扑） | 控制流区域，不是岗位编制 |
| **Map Work Group** | `MapWorkGroup` | Function Map 空间分组，无 Agent 运行语义 |
| **provides 虚线** | `IntentEdge.kind = "provides"` | Agent 配置卫星边，不是工作组框 |
| **Grok Bot** | 外部灵感；本仓库无产品绑定 | 协作语义 = 多专职 Bot 分工 + handoff |

---

## 1. 锁定产品决策

| ID | 决策 | 落地含义 |
|----|------|----------|
| **WG-D1** | 工作组 = **内部编排小队** | coordinator 派活 → 成员执行 → 汇总出口；不是纯 UI 标签，也不是 Parallel fork-join 容器 |
| **WG-D2** | 表面成员 = 专职 Agent；内部成员可含 Action/Logic/Human | L1 虚线框只显示专职 Agent（chip）；Action/Logic/Human 仅在双击进入的 **L2 协作子图**出现；**L2 节点视觉与一级 Loops Graph 相同**（完整 Agent/Duty 卡 + wiring）；config 卫星不得入组；编译时每个表面 Agent 必须有 `agentDefinitionId` |
| **WG-D3** | **禁止嵌套** | 一节点最多一个 `workGroupId`；组不可包含组 |
| **WG-D4** | 对外连 **组边界桩** | 默认 `in` / `out`；连到具体成员仅作 override，编译折叠进组协议 |
| **WG-D5** | 空组策略 | Draw 允许短暂空组；**compile 硬失败**若无成员或缺专职绑定 |
| **WG-D6** | 协作模式 | `coordinator`（默认）\| `serial` \| `parallel_join` |
| **WG-D7** | Spec stale | 组结构/成员/模式变更使 approved Spec stale（复用现有 edit-stale） |
| **WG-D8** | 视觉 | 虚线矩形 + 标题栏；组内表面 Agent 为 **icon+标题小芯片**，按**矩阵**排列（非自由画布）；框 AABB 紧包矩阵；组内不可自由拖排，仅可拖入/拖出；provides 卫星在组内隐藏；不搬 Map sticky |
| **WG-D9** | Runtime | 不新引擎；编译展开成员节点 + 组元数据 + 隐式内部边；复用 stepper + agent call budget，另加每组上限 |
| **WG-D10** | 兼容 | `normalizeLoopGraphDocument`：缺 `workGroups` → `[]` |

---

## 2. 概念模型

```
[上游 Duty] --depends--> [WorkGroup in]
                              │
                    ┌─────────┴─────────┐
                    │ 虚线工作组框        │
                    │  Coordinator*     │
                    │  Specialist A/B…  │
                    └─────────┬─────────┘
                              │
[WorkGroup out] --depends--> [下游 Duty]
```

- Intent：`draft.workGroups[]` + 成员节点 `workGroupId`
- 成员仍是真实 Agent 节点（可各自挂 provides 卫星）
- Spec：保留组记录；展开内部 depends；对外边改写为入口/出口语义
- Run：组聚合状态 + 可展开成员进度

### 2.1 协作模式展开规则

| Mode | 内部边 |
|------|--------|
| `coordinator` | 入口 → coordinator；coordinator → 每位非协调成员；每位成员 → 出口汇合 |
| `serial` | 入口 → members[0] → … → members[n] → 出口（`memberNodeIds` 序） |
| `parallel_join` | 入口 fan-out → 全员 → 出口 join |

### 2.2 失败与预算

- 成员失败 → 组失败（首版）；可接 Human HITL（既有节点在组外）
- 计入全局 `loop-agent-call-budget`；另加 `maxAgentCallsPerWorkGroup`（默认 8）

---

## 3. 契约

### 3.1 `LoopWorkGroup`

```ts
{
  id: string
  title: string
  memberNodeIds: string[]          // 1..16 at compile; Draw 可空
  collaborationMode: "coordinator" | "serial" | "parallel_join"
  coordinatorNodeId?: string       // required when mode=coordinator & members>0
  createdAt: string
  updatedAt: string
}
```

Limits：`workGroupsPerDocument ≤ 64`，`membersPerGroup ≤ 16`。

### 3.2 Intent / Spec 扩展

- `IntentGraphNode.workGroupId?: string`
- `IntentGraph.workGroups: LoopWorkGroup[]`
- `IntentGraph.workGroupSeq?: number`（默认标题序号）
- Spec 节点保留 `workGroupId`；Spec 文档带 `workGroups` 元数据快照
- Instance 可选 `workGroupRecords[]`（聚合 running/succeeded/failed + 成员 id）

### 3.3 校验（`loop-work-group` 模块）

1. 成员必须存在且为 agent  
2. 编译：每成员 `agentDefinitionId` 非空  
3. 无嵌套 / 无跨组重复成员  
4. coordinator ∈ members（coordinator 模式）  
5. 边界边：指向组的对外 depends 合法  

布局：仅 `computeWorkGroupFrameBounds`（AABB + padding + title bar）。

---

## 4. 交互全流程

### 4.1 创建

1. Palette `workgroup` → 画布落空虚线框  
2. 多选 ≥1 专职 Agent →「组成工作组」  
3. 人才库多选 Template →「组成工作组」→ 批量实例化/绑定并落入新组  

默认标题 `Workgroup N`（`workGroupSeq`）。

### 4.2 成员

- 拖专职进框并松手确认 → **先**按落点 hit-test（勿先做邻接 snap），再 join + reflow 矩阵（边框可扩）  
- 组内拖动：冻结虚线框 + 文档矩阵坐标不变，仅幽灵跟随；松手仍在框内 → 无变更；幽灵中心出框松手 → leave + reflow（边框可缩）  
- **禁止**选中框/拖动过程中 reflow；边框长宽只在确认加入/移除后变化  
- 组内表面成员渲染为 icon+标题芯片矩阵；对外 depends 边仍挂在成员节点上  
- 画布空白单击 → 取消 node / workgroup 选中  
- General / 非 Agent 拖入 → 拒绝 + toast  
- 标题菜单：重命名、设协作模式、设 coordinator、解散  
- 解散：清除 `workGroupId`，保留节点与 provides wiring；离组后恢复完整 Agent 卡与卫星 

### 4.3 连线

- 组边界桩 `in`（西）/ `out`（东）  
- 实线 `depends` / `feedback` / `conditional` 可挂边界  
- provides 仍只连 Agent 卡，不连组框  

### 4.4 Compile → Review → Run

- Compile 校验组 → 展开内部边 → Spec  
- Review PathMap 显示工作组虚线容器（文案区分 Parallel）  
- Run：组行可展开成员；色点聚合  

---

## 5. 实现挂载点

| 层 | 路径 |
|----|------|
| 契约 | `projectos/contracts/loop-work-group.ts`；扩展 `loop-graph.ts` |
| 校验/布局 | `projectos/contracts/loop-work-group.ts`（纯函数）+ 单测 |
| 编译 | `projectos/services/loop-graph-compiler.ts` |
| 运行 | `projectos/services/loop-runtime-service.ts`；`loop-agent-call-budget.ts` |
| Store | `projectos/workbench/src/state/loopGraphStore.ts` |
| Palette | `projectos/contracts/loop-presets.ts`；`LoopGraphPalette.tsx` |
| Canvas | `LoopGraphOverlay.tsx` + `LoopWorkGroupFrame` 组件 |
| Review | `LoopReviewPathMap.tsx` / `loopReviewLayout.ts` |
| Talent | Marketplace / AgentPicker 组队入口（WG-6） |

---

## 6. 里程碑切片

| Slice | 范围 | Exit |
|-------|------|------|
| **WG-0** | 本 DevPlan + 交叉引用 | 计划可评审 |
| **WG-1** | 契约 + normalize + 校验单测 | Zod 绿；旧文档可读 |
| **WG-2** | Draw 虚线框、Palette、拖入/拖出、标题、解散 | 可组队编辑 |
| **WG-3** | 边界桩 + 组属性面板 | 可画通对外边 |
| **WG-4** | Compile 展开 + Review 容器 + stale | Approve 路径通 |
| **WG-5** | Runtime 组协议 + Run 展开 + budget | 小队主路径可跑 |
| **WG-6** | 人才库「组成工作组」 | 批量放置通 |
| **WG-7** | 验收矩阵 / i18n / 回归 | 清单勾选 |

---

## 7. 验收矩阵

| # | 场景 | 期望 | 状态 |
|---|------|------|------|
| A1 | Palette 创建空组 | 虚线框 + 默认标题 | ✅ 代码路径 |
| A2 | 拖入专职 | 加入 `memberNodeIds`；框扩容 | ✅ 代码路径 |
| A3 | 拖入 General / Action | 拒绝 + toast | ✅ 代码路径 |
| A4 | 边界连线 in/out | depends 可连；编译合法 | ✅ 单测 |
| A5 | coordinator / serial / parallel_join | 内部边按模式展开 | ✅ 单测 |
| A6 | 空组 / 无 Definition compile | 硬失败，明确错误码 | ✅ 单测（compile gate） |
| A7 | 组编辑后 Spec | stale（revision 相对 graphRevision） | ✅ 复用既有 stale |
| A8 | Run 小队 | 成员推进；组聚合状态可见 | ✅ Run 面板 + records |
| A9 | 超 per-group budget | 失败（failNode） | ✅ 单测 |
| A10 | 解散 | 成员保留；provides 不丢 | ✅ 代码路径 |
| A11 | 与 Parallel 容器 | 文案/样式可区分（Work Group vs Parallel） | ✅ Review CSS |

---

## 8. 明确不做

1. 组套组 / 多层子工作流产品化  
2. 组内混入 Action / Logic / Human / config  
3. Map sticky 邻接几何  
4. 模型驱动自动拆队  
5. 绑定真实 Grok 生态  
6. 替换 Gaps Parallel/Loop 拓扑容器  
7. 组内无限并行 worktree 隔离  

---

## 9. 错误码（建议）

| Code | 何时 |
|------|------|
| `work_group_empty` | compile 时空组 |
| `work_group_member_not_specialist` | 成员无 `agentDefinitionId` |
| `work_group_member_invalid_type` | 非 agent |
| `work_group_nested_or_dup` | 嵌套或重复归属 |
| `work_group_coordinator_invalid` | coordinator 缺失或不在成员中 |
| `work_group_budget_exceeded` | 组内 agent calls 超限 |

---

## 10. 变更日志

| 日期 | 说明 |
|------|------|
| 2026-11-13 | 初稿：WG-D1–D10、契约、流程、WG-0–WG-7、验收；授权按切片实现 |
| 2026-11-13 | WG-0–WG-6 落地：`loop-work-group` 契约、Draw 框/边界桩、compiler 展开、Review/Run、人才库组队；验收表勾选 |
| 2026-11-14 | L2 协作子图：双击标题进入；内部 Action/Logic/Human 仅 L2 可见；顶栏返回面包屑 |
| 2026-11-14 | L2 使用与一级 Loops Graph 相同的完整 Duty/Agent 卡片（非 L1 chip）；进入时展开布局，退出恢复表面矩阵 |
