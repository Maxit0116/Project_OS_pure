# Loops Graph · Review Tab 可视化审批台 — DevPlan

**状态**：Implementing（2026-11-09）。RV-0–RV-2 MVP 已落地（Review 布局壳、Intent strip、只读 Path Map、Gate 联动、强制确认、Stale 阻断）；RV-3 抛光可继续迭代。  
**范围**：把 Loops Graph **Review** 阶段从「纯文本卡片清单」升级为 **只读可视化审批台**（Intent strip + Compiled Path Map + Gate Checklist + 选中详情）。不改 Runtime / Spec 编译语义；不引入第二编排引擎；**不**把 Review 做成第二张可编辑 Draw 画布。  
**产品定位一句话**：Review 是「编译后的可扫读执行摘要 + 门闩确认」，让人 3 秒看懂拓扑与风险、30 秒能批准，同时仍能下钻到 workflow 细节。

**权威交叉引用**：

| 文档 | 关系 |
|------|------|
| [`Loops-Graph-Workflow-Studio-Dev-Plan.md`](./Loops-Graph-Workflow-Studio-Dev-Plan.md) | Studio 壳 / `draw \| review \| run` / LG-1.4 假设·CycleGate 门闩；本计划承接 **Review 展示层**，并补强 LG-1.4 的扫读体验 |
| [`Loops-Graph-Gaps-Closure-Dev-Plan.md`](./Loops-Graph-Gaps-Closure-Dev-Plan.md) | **缺口补全总控**：GC-6.4 要求 Path Map 增强 Parallel/Loop 容器只读识读；不改变本计划「Review ≠ 第二张 Draw」边界 |
| [`Loops-Graph-UI-Visual-Authoring-Dev-Plan.md`](./Loops-Graph-UI-Visual-Authoring-Dev-Plan.md) | 图标节点、`loopNodeVisuals`、Duty 卡；本计划 **复用同一识读合同**，Review 只读 |
| [`Loops-Graph-Node-Architecture-Dev-Plan.md`](./Loops-Graph-Node-Architecture-Dev-Plan.md) | 四类 Node / Edge kind；Path Map 只投影已编译 `LoopSpec` |
| [`Loops-Graph-Agent-Wiring-Dev-Plan.md`](./Loops-Graph-Agent-Wiring-Dev-Plan.md) | `provides` 配置边；Review Path Map **默认折叠/省略**配置卫星，避免审批噪音 |
| Goal Context（`LoopGoalContext` / `LoopGoalComposer`） | 本计划做 **弱合并**：Intent strip 展示已确认意图，不合并成单一 Tab |

**已有实现锚点（勿重复建设）**：

- Phase：`loopGraphStore.ts`（`LoopPhase = draw \| review \| run`）、`compile` → `compileResult` / `pendingCompile`、`approve`
- Review UI：`LoopGraphOverlay.tsx` 中 `phase === 'review' && compileResult` 的文本卡片区
- 编译：`services/loop-graph-compiler.ts` → `LoopCompileResult`（`specDraft` / `assumptions` / `cycleGates`）
- 视觉：`loopNodeVisuals.ts`、边样式（`edgeFeedback` / `edgeConditional` / `edgeProvides`）
- 意图：`draftGoalContext` / `confirmedGoalContext`、`summarizeGoalContextForGraphPrompt`

---

## 0. 核心诉求（讨论锁定 2026-11-09）

| # | 诉求 | 本计划对应 |
|---|------|------------|
| 1 | 纯文本 Review 阅读压力大，需要可视化 | Compiled Path Map（只读执行拓扑） |
| 2 | 可视化同时 **细节仍要丰富** | 右栏 Gate Checklist + 选中节点详情（渐进披露） |
| 3 | Goal Context 与 Review **弱合并、不合二为一** | 顶栏 Intent strip；确认门闩仍属 Review |
| 4 | Review **不是**第二张 Draw | 不可拖节点/改边；无 Palette；只投影 `compileResult` |
| 5 | 改图后 Review 易过期 | Stale 横幅：`draft.revision` ≠ `specDraft.graphRevision` 时提示重新「理解」 |
| 6 | 保持 AI-native 开发工具气质 | `--tech-*`、高密度、克制动效；禁止仪表盘 KPI 堆砌 / 装饰性徽章 |

**价值链**：

```text
Draw 意图图 ──「理解 / Interpret」──► LoopCompileResult
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
             Intent strip         Path Map（结构）      Gate Checklist
          (Goal Context 弱合并)   (扫读拓扑/回环)      (假设/反馈/权限)
                                         │
                                         ▼
                              选中节点 → 详情抽屉
                                         │
                                         ▼
                              门闩齐 → 批准 Loop Spec → Run
```

**非目标（本计划明确不做）**：

| 非目标 | 原因 |
|--------|------|
| Review 内可编辑图 / 同步写回 draft | 与 Draw 职责重复；混淆审批边界 |
| 把 Goal Context 整页并入 Review 替代 Composer | 意图澄清与 Spec 批准是不同门闩 |
| 通用流程图编辑器 / ELK 大布局引擎（MVP） | 当前拓扑以单链 + 至多一条 feedback 为主；自动线性/分层布局足够 |
| 重写 compile 语义或第二 Runtime | 只改展示与确认 UX |
| Run 阶段执行回放可视化 | 归 Studio / Agent Flow；本计划只做批准前 Review |

---

## 1. 产品决策（本计划基线）

| ID | 决策 | 落地含义 |
|----|------|----------|
| RV-D1 | Review = 只读审批台 | 数据源唯一为 `compileResult`（及文档上的 Goal Context 只读引用） |
| RV-D2 | 布局 = 顶栏 + 左图 + 右清单 | Intent strip 全宽；下分 Path Map \| Gate panel |
| RV-D3 | Path Map 复用 Draw 图标族 | 同一 `loopNodeVisuals` 映射；边 kind 用线型/色，不靠长文案 |
| RV-D4 | 渐进披露四层 | L0 扫读 → L1 结构 → L2 门闩 → L3 节点/意图全文 |
| RV-D5 | Goal Context 弱合并 | strip 展示 confirmed（优先）或 draft 摘要；点开展开；**不**替代勾选门闩 |
| RV-D6 | `provides` 边默认不进 Path Map | 配置装配噪音留给 Draw；可选「显示装配」开关（P1） |
| RV-D7 | Stale 可见 | draft 超前于 compile 的 `graphRevision` 时阻断或强警告批准 |
| RV-D8 | 门闩仍强制（承接 LG-1.4） | assumptions / cycleGates 未全确认不可 approve（落地强制，非仅 UI 摆设） |

---

## 2. 现状与问题

### 2.1 现状 UI

```text
Review phase
  └─ 纵向 reviewCard 堆叠
       ├─ 目标理解（一句 goal）
       ├─ 推断的执行计划（ol: role — goal）
       ├─ 假设审查（Checkbox 列表）
       ├─ 反馈边确认（Checkbox 列表）
       └─ （条件）HITL 按钮
```

### 2.2 痛点

1. **无结构图**：用户要在脑中重建拓扑与 feedback 回环。  
2. **无意图上下文**：Goal Context 的 constraints / doneWhen / outOfScope 不进 Review。  
3. **细节全摊开**：所有节点 goal 以长列表呈现，扫读成本高。  
4. **过期无感**：Draw 修改后切回 Review 仍可能显示旧 `compileResult`，且 `draftAhead` 只比「运行中 approved Spec」，不比 pendingCompile。  
5. **勾选未强制**：`acceptedAssumptions` / `confirmedCycles` 为本地 state，`approve` 未校验（Studio LG-1.4 缺口，本计划一并收口）。

---

## 3. 目标信息架构

### 3.1 四层披露

| 层 | 问题 | UI |
|----|------|-----|
| L0 扫读 | 这是什么目标？有几处风险？ | Intent strip + 计数 chip（节点数 / feedback 数 / 待确认门闩） |
| L1 结构 | 谁先谁后？哪里回环？哪里要人？ | Compiled Path Map |
| L2 门闩 | 我接受哪些推断与回环策略？ | Gate Checklist（assumptions / cycleGates / permissions·stop 摘要） |
| L3 细节 | 这个节点具体要做什么？完整意图是什么？ | 选中节点详情；Goal Context 展开抽屉 |

### 3.2 目标布局

```text
┌─ Review ──────────────────────────────────────────────────────┐
│ Intent strip                                                   │
│  goal · [约束 n] [完成条件 n] [范围外 n] · rev · [展开]         │
│  （若 Stale）⚠ Draft 已变更 — 请返回 Draw 重新「理解」          │
├───────────────────────────────┬────────────────────────────────┤
│ Compiled Path Map             │ Gate Checklist                 │
│  入口 → … → 出口              │  ☐ Assumptions…                │
│  feedback 弧线高亮            │  ☐ Cycle gates…                │
│  Human/Approval 强调          │  Permissions / stopPolicy      │
│  点击节点 → 选中              │  ── Selection detail ──        │
│                               │  goal / acceptance / 推断提示  │
└───────────────────────────────┴────────────────────────────────┘
│ Header 已有：批准 Loop Spec（门闩未齐或 Stale 时 disabled）      │
└────────────────────────────────────────────────────────────────┘
```

窄视口（&lt; ~900px）：Path Map 在上、Gate 在下，保持同一信息顺序。

---

## 4. 可视化规格

### 4.1 Intent strip（弱合并）

**数据优先级**：`confirmedGoalContext` → 否则 `draftGoalContext` → 否则仅 `compileResult.specDraft.goal`。

| 元素 | 行为 |
|------|------|
| 标题 | 一行 goal（truncate + `title` 全文） |
| Chips | constraints / doneWhen / outOfScope **数量**；无则不渲染空 chip |
| Meta | `status`（draft/confirmed）+ `revision` |
| 展开 | 展开区展示三列表全文（只读）；不提供「确认 Goal Context」主按钮（确认仍在 Composer） |
| 空态 | 无 Goal Context 时：strip 仅显示编译 goal + 次要提示「可在 Discuss 中完善 Goal Context」 |

### 4.2 Compiled Path Map

| 规则 | 说明 |
|------|------|
| 数据 | `specDraft.nodes` + 非 `provides` 的 `specDraft.edges` |
| 布局 MVP | 按控制流拓扑做 **分层/线性自动布局**（忽略 Draw 的自由 `position`，避免审批视图散乱） |
| 节点外观 | 图标 + 短标题（`loopNodeVisuals`）；角标区分 `agent/action/logic/human` |
| 边 | `depends` 实线；`conditional` 虚线/分支标记；`feedback` 醒目回环（色 + 粗细或弧） |
| 交互 | 点击选中；悬停显示一行 `node.goal`；**不可**拖拽改位/改连 |
| 空/错误 | 无 compileResult：保持现有「无内容 / 批准 disabled」；拓扑校验失败：地图上标注 + 阻断批准 |
| 动效 | 进入 Review 时路径可选依次显现（150–300ms）；`prefers-reduced-motion` 关闭 |

**实现建议**：新建 `LoopReviewPathMap.tsx`（+ module.css）；布局纯函数放 `loopReviewLayout.ts`，便于单测。不必复用 Draw 的 pointer/DnD 画布。

### 4.3 Gate Checklist（右栏）

保留并强化现有清单，改为与图联动：

| 区块 | 内容 | 联动 |
|------|------|------|
| Assumptions | 现有 Checkbox 文案 | 若能解析到 nodeId，勾选行 hover/focus 高亮 Path Map 节点 |
| Cycle gates | `triggerWhen · max N` + `onContinuousFailure` 可读文案 | hover/focus 高亮对应 feedback 边 |
| Policy strip（新增） | `stopPolicy.maxRounds`、`retryPolicy`、`permissions` 摘要 chips | 只读；高风险 permission（如 `github.create_pr`）用强调描边 |
| HITL | 保持现有 awaiting_hitl 操作卡 | 可钉在 Gate 栏顶部 |

**门闩强制（RV-D8）**：

- 所有 `assumptions` 与 `cycleGates` 均须确认后方可 `approve`。  
- 将确认结果写入 approve 路径（至少前端 gate；优选随 `pendingCompile` 或 approve payload 持久化 `accepted` / `confirmed` 字段——契约已有 optional boolean）。  
- Stale 时：批准按钮 disabled + 明确 CTA「返回绘制并重新理解」。

### 4.4 Selection detail

选中 Path Map 节点后，Gate 栏下半或侧滑展示：

- title / type / role（agentRole 等）  
- `goal` 全文  
- `constraints` / `acceptance`（若有）  
- 若存在「推断 architecture」类 assumption，显示只读提示  
- 上下游节点短链（from ← this → to）

取消选中则收起，回到门闩列表焦点。

### 4.5 与 Draw / Goal Context 边界

| 表面 | 可写？ | 主问题 |
|------|--------|--------|
| Goal Context（Composer） | 讨论中可改草稿并确认 | Why / What |
| Draw | 可编辑意图图 | How we author the graph |
| Review | 只读 + 勾选确认 | How it will run / what risks I accept |
| Run | 执行控制 | What is happening |

---

## 5. 数据与契约

### 5.1 复用（优先）

- `LoopCompileResult` / `LoopSpec` / `LoopAssumption` / `LoopCycleGate`  
- `LoopGoalContext`  
- `LoopSpec.graphRevision` ↔ `IntentGraph.revision` 做 Stale

### 5.2 可能的小扩展（按需，非阻塞 MVP）

| 变更 | 用途 |
|------|------|
| approve 前校验 assumptions/cycleGates 的 `accepted`/`confirmed` | RV-D8 |
| UI state：`reviewSelectedNodeId`、`reviewHighlightEdgeId`（store 或 Overlay local） | 图清单联动 |
| 可选：`pendingCompile.compiledFromRevision` 显式字段 | 若不想用 `specDraft.graphRevision` 推断 |

**禁止**：为 Review 新建平行 Spec 模型；禁止 Path Map 写回 `document.draft`。

---

## 6. 任务分解

### Phase RV-0 — 冻结与壳

#### RV-0.1 文档与交叉引用

| 字段 | 内容 |
|------|------|
| Task ID | RV-0.1 |
| 类型 | Docs |
| 验收 | 本文件入库；Studio LG-1.4 / UI Authoring 相关节增加指向本计划的链接 |
| 复杂度 | S |

#### RV-0.2 Review 布局壳

| 字段 | 内容 |
|------|------|
| Task ID | RV-0.2 |
| 可能修改 | `LoopGraphOverlay.tsx`、`LoopGraphOverlay.module.css`；可选拆 `LoopReviewPanel.tsx` |
| 验收 | Review 为 strip + 双栏骨架；窄屏上下堆叠；现有文案内容仍可达（可暂放入右栏） |
| 复杂度 | M |

---

### Phase RV-1 — Path Map + Intent strip

#### RV-1.1 `loopReviewLayout` 自动布局

| 字段 | 内容 |
|------|------|
| Task ID | RV-1.1 |
| 可能修改 | 新增 `loopReviewLayout.ts` + 单测 |
| 验收 | 给定 `LoopSpec` 输出节点坐标与边列表；单链稳定；含一条 feedback 时回环可区分；忽略 provides |
| 复杂度 | M |

#### RV-1.2 `LoopReviewPathMap` 组件

| 字段 | 内容 |
|------|------|
| Task ID | RV-1.2 |
| 可能修改 | 新增 `LoopReviewPathMap.tsx` / `.module.css`；复用 `loopNodeVisuals` |
| 验收 | 只读渲染；点击选中；悬停 goal；feedback/conditional/human 可辨；无拖放 |
| 复杂度 | L |

#### RV-1.3 Intent strip

| 字段 | 内容 |
|------|------|
| Task ID | RV-1.3 |
| 验收 | 弱合并 Goal Context；chip 计数；展开全文；无 Context 时回退编译 goal |
| 复杂度 | S |

---

### Phase RV-2 — Gate 联动 + 强制门闩 + Stale

#### RV-2.1 Gate 栏与图联动

| 字段 | 内容 |
|------|------|
| Task ID | RV-2.1 |
| 验收 | assumption/cycle 行与 Path Map 高亮联动；Policy strip 展示 stop/retry/permissions 摘要 |
| 复杂度 | M |

#### RV-2.2 强制确认 + Stale 阻断

| 字段 | 内容 |
|------|------|
| Task ID | RV-2.2 |
| 可能修改 | `LoopGraphOverlay.tsx`、`loopGraphStore.approve`；必要时 contracts optional 字段写入 |
| 验收 | 未勾选齐不可批准；`draft.revision !== specDraft.graphRevision` 时 Stale UI + 不可批准（或二次确认策略按产品默认：**不可批准**） |
| 复杂度 | M |
| 备注 | 收口 Studio LG-1.4「未确认不可 approve」 |

#### RV-2.3 Selection detail

| 字段 | 内容 |
|------|------|
| Task ID | RV-2.3 |
| 验收 | 选中节点展示 L3 字段与上下游；取消选中恢复 |
| 复杂度 | M |

---

### Phase RV-3 — 抛光与汇合

#### RV-3.1 i18n / a11y / motion

| 字段 | 内容 |
|------|------|
| Task ID | RV-3.1 |
| 验收 | en/zh 文案；Path Map 节点 `aria-label`；键盘可选中；reduced-motion 关闭入场动画 |
| 复杂度 | S |

#### RV-3.2 测试与文档汇合

| 字段 | 内容 |
|------|------|
| Task ID | RV-3.2 |
| 验收 | 布局/门闩/Stale 单测绿；Studio / UI Authoring 交叉引用已更新；本文件状态改为 Implementing/Done 相应阶段 |
| 复杂度 | M |

---

## 7. Task Dependency Map

```text
RV-0.1 ── RV-0.2 ──┬── RV-1.1 ── RV-1.2 ──┐
                   │                      ├── RV-2.1 ── RV-2.2 ── RV-2.3 ── RV-3.1 ── RV-3.2
                   └── RV-1.3 ────────────┘
```

**建议首个可交付切片**：RV-0.2 → RV-1.1 → RV-1.2 → RV-1.3（先看到可视化审批台）→ RV-2.2（门闩/Stale 正确性）→ RV-2.1 / RV-2.3。

---

## 8. 测试与验收矩阵

| ID | 场景 | 期望 |
|----|------|------|
| T-RV1 | 编译成功进入 Review | 出现 Path Map，节点数 = duty nodes（无 provides 卫星） |
| T-RV2 | 含 feedback 的 Feature Development 类图 | 回环边视觉区别于 depends；Gate 中有对应 cycle 项 |
| T-RV3 | 已确认 Goal Context | Intent strip 显示 goal + 非零 chips；展开见全文 |
| T-RV4 | 无 Goal Context | strip 回退 `specDraft.goal`，无空状态崩溃 |
| T-RV5 | 勾选未完成点批准 | 按钮 disabled 或 approve no-op 并提示 |
| T-RV6 | Draw 改节点后不重新理解 | Stale 横幅；批准不可用 |
| T-RV7 | 重新「理解」 | Stale 消失；Path Map 与清单与新 compile 一致 |
| T-RV8 | 点击节点 | 详情区出现 goal/acceptance；再点空白取消 |
| T-RV9 | Gate 行 hover | 对应边或节点高亮 |
| T-RV10 | 窄视口 | 双栏改为上下堆叠，内容不丢 |
| T-RV11 | reduced-motion | 无强制入场动画 |
| T-RV12 | 仅点 Review tab、从未 compile | 无假数据；批准 disabled |

---

## 9. 风险与不变量

| 风险 | 缓解 |
|------|------|
| Path Map 与 Draw 坐标不一致引起困惑 | 文案标明「编译后的执行路径」；布局故意用自动分层，不假装是同一画布 |
| 双栏信息仍密 | L3 默认折叠；Policy 用 chip 而非长段落 |
| foreignObject/SVG 标签与 Review 图叠层 | Review Map 独立组件与 z-index；不复用 Draw 连线编辑 hit 区 |
| 强制门闩改变现有「一点即可批准」习惯 | 空 assumptions/cycleGates 时一键可批；有项才需勾选 |
| Stale 过严阻碍快速迭代 | CTA 明确「重新理解」；理解按钮仍在 Draw header |

**不变量**：

1. `compile` / `approve` / `startLoopInstance` 语义不变。  
2. Review **不得**修改 `document.draft` 拓扑。  
3. 不引入第二 Runtime。  
4. 图标族与 Draw 一致（lucide-react + `loopNodeVisuals`）。  
5. 技术主题：`--tech-*` tokens，无玻璃/紫渐变装饰皮。

---

## 10. Definition of Done

1. §6 任务按切片完成；§8 P0 用例（T-RV1–T-RV7、T-RV12）绿。  
2. Review 具备 Intent strip + Path Map + Gate 栏，不再是纯纵向文本卡作为唯一形态。  
3. Goal Context 弱合并可见；与 Composer 确认流不互相替代。  
4. assumptions / cycleGates 未确认或 Stale 时无法批准。  
5. 未把 Review 做成可编辑第二画布。  
6. Studio DevPlan LG-1.4 与本计划交叉引用一致。

---

## 11. 开放问题（不阻冻结）

| # | 问题 | 默认 |
|---|------|------|
| Q1 | Stale 时是否允许「仍要批准旧 Spec」？ | **否**（必须重新理解） |
| Q2 | Path Map 是否显示 `provides` 装配？ | MVP 隐藏；P1 开关 |
| Q3 | 选中详情是否复用 `LoopNodeDutyCard` 只读模式？ | 优先轻量 detail 面板；Duty 卡可选后续接入 |
| Q4 | 门闩确认是否持久化到 `pendingCompile`？ | MVP 可先会话内；优选写入 assumption.accepted / gate.confirmed |
| Q5 | Review 是否保留「理解」快捷入口？ | 仅 Stale CTA 回 Draw；不在 Review 重复闪光按钮 |

---

## 12. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-11-09 | 初稿。锁定：Split Review、Intent strip 弱合并 Goal Context、只读 Path Map、Gate 联动、强制门闩与 Stale、非第二画布。 |
| 2026-11-09 | 实现 MVP：`loopReviewLayout`、`LoopReviewPathMap`、`LoopReviewPanel`；Overlay 接入；approve 门闩/Stale；en/zh i18n。 |
