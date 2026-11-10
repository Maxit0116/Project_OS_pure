# Agent Flow Inspector Pane：左流程 / 右检视

**状态**：M0–M2 implemented（2026-11-08）。M3 仍明确延期。  
**产品名**：Agent Flow Inspector / 流程检视栏（代码前缀 `flowInspector`）  
**范围**：Agent Flow **中间浮窗**（`AgentFlowOverlay` → `AgentFlowPanel`）在 Timeline / Graph 模式下，把宽屏右侧竖直空带做成**选中上下文的检视栏**，优先承载 provider reasoning（类 CoT）与 step / activity 细节；委派树钻取作为同一栏的次要模式。不改写权限、不新开 ToT 推理引擎、不另起第二套活动模型。  
**权威交叉引用**：

| 文档 | 关系 |
|------|------|
| [`Agent-Flow-Activity-Dev-Plan.md`](./Agent-Flow-Activity-Dev-Plan.md) | 侧栏缩略 ↔ 悬浮窗证据已定；本计划解决悬浮窗**内部**「左骨架 / 右长文」空间，不改侧栏规则 |
| [`Agent-Pool-Trace-Waterfall-Dev-Plan.md`](./Agent-Pool-Trace-Waterfall-Dev-Plan.md) / [`Agent-Pool-Waterfall-UX-Dev-Plan.md`](./Agent-Pool-Waterfall-UX-Dev-Plan.md) | Pool tab 已有行内 Span Inspector；本栏是 **Timeline/Graph 的 master–detail**，不镜像 Pool waterfall |
| [`Hierarchical-Agent-Protocol-Dev-Plan.md`](./Hierarchical-Agent-Protocol-Dev-Plan.md) | 委派 / 子 run 真相源；右侧 Delegation 段只投影既有 `flowDelegationEvents` + `delegatedRunTraces` |
| [`Live-Graph-Agent-Observability-Dev-Plan.md`](./Live-Graph-Agent-Observability-Dev-Plan.md) | Graph 节点 Inspector 是 Live Graph 职责；本栏可与 Graph 视图**共用选中态**，不把 COT 整段塞进 Live Graph |
| [`Agent-Harness-Dev-Plan.md`](./Agent-Harness-Dev-Plan.md) | 证据预算、脱敏、截断沿用；本计划不扩大 tool loop |
| `agent-requirements.md` | 诚实 pipeline：不伪造未发生的 reasoning / 分支 |

**实现锚点（规划）**：

| 层 | 落点 |
|----|------|
| 布局 | `AgentFlowPanel.tsx` + `AgentFlowPanel.module.css`：`runBody` 改为左右分栏；去掉仅靠 `max-width: 520px` 留白的现状 |
| 右栏组件 | 新建 `AgentFlowInspector.tsx`（+ module css）；演进 / 吞并 `AgentFlowStepDetail.tsx` |
| 选中态 | 复用 `selectedFlowStepId`、`selectedActivityId`；可选新增 `flowInspectorTab` |
| 数据 | 既有 `flowSteps` / `flowActions` / `flowTransientTraces` / `flowDelegationEvents` / `delegatedRunTraces` / `projectAgentActivities` — **v1 不新契约** |
| Reasoning | 复用 `TransientReasoningTrace` 投影逻辑；从 timeline 内联 `<details>` **迁出或降级为摘要** |
| Graph | `AgentFlowGraph` 选中 step → 同一 Inspector |
| i18n | `agentFlow.inspector.*`（en + zh） |
| 测试 | Panel 布局 / 选中跟随 / 无 reasoning 空态 / 窄屏回退 |

**明确不做（v1）**：

- 不发明 Tree-of-Thought 分支搜索、评分、回溯引擎；产品文案**不叫 ToT**
- 不在右侧再画一条完整 timeline / waterfall（与左列、与 Pool 重复）
- 不把完整 diff / stdout 未截断原文搬进 Inspector（Diff 仍走中间栏；shell 证据遵守 Activity 预算）
- 不改 Ask 侧栏「不可展开」规则；Ask/Plan/Debug subject 整页仍可先保持现状，**v1 优先 `run` + Timeline/Graph**
- 不新增 provider 字段或伪造 reasoning；无 `provider_reasoning` 时显示诚实空态
- 不做列宽持久化 / 虚拟列表（可进 v1.1）

**对标目标一句话**：宽屏浮窗左侧是可扫读的流程骨架，右侧是当前步的 reasoning + 可核对细节——像 IDE master–detail，而不是一条 520px 窄列把长文全塞进去。

---

## 0. 讨论回顾（本文锁定）

### 0.1 现象

Agent Flow 中间浮窗几乎铺满工作区，但 Timeline 内容区被 CSS 限制为：

```css
.timeline { max-width: 520px; }
```

于是宽屏右侧出现一条**竖直空带**：不是缺组件的 bug，而是「阅读宽度」约束留下的未消费空间。

### 0.2 今日信息堆叠（问题根因）

| 内容 | 今日位置 | 问题 |
|------|----------|------|
| Phase / step 行 | 左列 timeline | 合适 |
| Phase 下 actions | 左列内联 | 挤密度 |
| `provider_reasoning` | 左列 `<details>` | 长文占窄列 |
| `AgentActivityDetails` | 左列内联 | 长文占窄列 |
| `DelegatedRunTree` | 左列底部 | 树 + 子 traces 更挤 |
| `AgentFlowStepDetail` | **timeline/graph 下方叠卡片** | 未占用右侧空带；选中后纵向抢高 |

### 0.3 讨论过的三种用途与结论

| 候选 | 结论 |
|------|------|
| **CoT / provider reasoning** | **主视图之一**：数据已有（`AgentTransientTrace.type === 'provider_reasoning'`），适合右栏长读；须保留「provider-supplied / 可能截断不可靠」诚实标签 |
| **细节 Agent Flow / Step Inspector** | **与 CoT 合并为同一右栏**：actions、files、corrections、activity detail 按选中上下文展示；演进现有 `AgentFlowStepDetail` |
| **ToT** | **v1 不做产品命名与引擎**。真实可投影的是 **Delegation / 子 run 树**；作为 Inspector 内次要分段，有委派才显示 |

### 0.4 核心诉求（用户要回答的问题）

| # | 诉求 | 用户要回答的问题 | 本计划对应 |
|---|------|------------------|------------|
| 1 | 吃掉浮窗右侧竖直空带 | 这片空间给谁用？ | §1 左流程 / 右检视 |
| 2 | 看见模型在想什么（有则示） | 当前步的 reasoning 是什么？ | Inspector · Reasoning |
| 3 | 看见当前步细节，而不挤爆 timeline | 这步做了啥、改了哪些文件、如何纠错？ | Inspector · Actions / Files / Corrections |
| 4 | 多 agent 时能钻子流程 | 哪个子 run、状态与痕迹？ | Inspector · Delegation（有则显示） |
| 5 | 诚实、可扫读 | 没有数据时会不会假装有思维树？ | 空态 + 禁止伪造 ToT |
| 6 | 与现有三 tab 共存 | Timeline / Graph / Pool 怎么分工？ | §1.2；Pool 不改 |

**价值链**：

```text
宽屏浮窗空带
  → 左：phase 骨架 + 轻量标记（可扫）
  → 右：选中 / running 上下文的 Reasoning + Detail（可核）
  → 有委派：同一右栏 Delegation 钻取
  → 窄屏：回退为下方详情（不挤死）
```

**一句话验收心智**：用户打开 Agent Flow 宽屏时，不再对着空白竖条；点某一步能在右侧连续读完 reasoning 与证据，左侧仍能一眼看完全程。

---

## 1. 产品分界（硬规则）

### 1.1 布局契约

```text
┌─ Agent Flow Overlay ─────────────────────────────────────┐
│ Header + TabBar (timeline | graph | pool)                │
├────────────────────────┬─────────────────────────────────┤
│ Primary (左)           │ Inspector (右)                  │
│ Timeline ≤ ~520px 或   │ flex 吃剩余宽度                 │
│ Graph 画布             │ 跟随 selected / running         │
│ 轻量：step、状态、     │ Reasoning · Actions · Files ·   │
│ 短标记、委派摘要点     │ Corrections · Delegation?       │
├────────────────────────┴─────────────────────────────────┤
│ Footer（Review Diff / Apply / Undo）仍跨栏或贴左下       │
└──────────────────────────────────────────────────────────┘
```

硬规则：

1. **一区一职**：左 = 流程骨架；右 = 当前上下文长内容。禁止右侧第二条完整 timeline。
2. **选中优先，其次 running，再次空态**：`selectedFlowStepId` → 否则当前 `running` step → 否则「选择一步或等待首步」。
3. **Reasoning 只展示真实 `provider_reasoning`**；截断时沿用既有 truncated 提示。
4. **Activity 侧栏规则不变**：侧栏仍不可展开思维链；右栏是悬浮窗内的 detail 表面，与 Activity Dev Plan 一致。
5. **Pool tab**：整页仍是 `AgentPoolPanel`；**不**套本左右分栏（避免与行内 Span Inspector 叠床架屋）。

### 1.2 与邻居表面

| 表面 | 本栏关系 |
|------|----------|
| Chat 侧栏 Activity 缩略 | 点击仍 `presentAgentFlow` + `selectedActivityId`；打开后右栏应能定位到对应 detail（M1） |
| `AgentFlowStepDetail` | **被 Inspector 吸收**；不再默认叠在 timeline 下方（窄屏例外） |
| Timeline 内 `TransientReasoningTrace` `<details>` | M1 起：**默认迁到右栏**；左列可留「有 reasoning」短标记，避免双份长文 |
| `DelegatedRunTree` 整块在左列 | M2：左列保留摘要 / 入口；完整树与子 traces 进右栏 Delegation |
| Pool Span Inspector | 不同 tab、不同交互；不合并组件也可，但视觉语法对齐 tech tokens |
| Live Graph Node Inspector | 另一 overlay；本计划不改 |

### 1.3 CoT vs ToT 命名（产品锁定）

| 用户口语 | 产品文案 | 数据 |
|----------|----------|------|
| CoT | **Model reasoning** / **模型推理**（可副标题 provider-supplied） | `AgentTransientTrace` |
| ToT | **v1 不使用** | 无分支搜索契约 |
| 多 agent 树 | **Delegated runs** / **委派运行** | `AgentDelegationEvent` + child traces |

---

## 2. 证据级现状

### 2.1 布局

- `AgentFlowOverlay` → `GraphOverlayFrame` 大卡几乎全宽。
- `AgentFlowPanel` `runBody`：timeline **或** graph，其后条件渲染 `AgentFlowStepDetail`（纵向堆叠）。
- `.timeline { max-width: 520px }` → 右侧空带。

### 2.2 已有可投影数据（无需新后端即可做 M0–M1）

| 数据 | Store / 来源 | 右栏用途 |
|------|----------------|----------|
| `flowSteps` + `selectedFlowStepId` | workbenchStore | 标题、kind、summary、files |
| `flowTransientTraces` filtered by `phaseId` | 同上 | Reasoning 段 |
| `flowActions` filtered by `phaseId` | 同上 | Actions 段（可复用 `AgentActionRow`） |
| phase-scoped `AgentActivity` | `projectAgentActivities` | Activity detail（thinking/grep/read/…） |
| `flowCorrections` | 同上 | Corrections + 提交纠错（现 StepDetail） |
| `flowDelegationEvents` / `delegatedRunTraces` | 同上 | Delegation 段（M2） |

### 2.3 缺口

- 无 master–detail 布局容器与右栏组件。
- StepDetail 未占右侧。
- Reasoning / Activity 长文仍塞左列。
- 无窄屏回退策略。
- `selectedActivityId` 打开浮窗后，详情仍埋在左列滚动流里，右侧无「固定检视」落点。

---

## 3. Inspector 信息架构

### 3.1 右栏分段（单一滚动列；可用粘性小 Tab 切换锚点）

| 段 | id | 内容 | 空态 |
|----|-----|------|------|
| Header | — | step label、kind、status chip、关闭选中（回 running 跟随） | — |
| Reasoning | `reasoning` | 该 phase 的全部 `provider_reasoning`，按时间；markdown | 「本步无 provider 推理痕迹」 |
| Actions | `actions` | 该 phase `AgentActionRow` 列表 | 「本步尚无动作事件」 |
| Activity | `activity` | 该 phase 的 `AgentActivityDetails`（或单条选中高亮） | 可与 Actions 合并展示策略见下 |
| Files | `files` | `relatedFiles` chips → `selectFile` | 隐藏段 |
| Corrections | `corrections` | 历史 + textarea + submit | 保留现 StepDetail 能力 |
| Delegation | `delegation` | 仅当本 run / 本步相关委派存在 | 整段隐藏 |

**Activity vs Actions**：v1 允许 Actions 用事件行、Activity 用已投影详情；若同 phase 两者重复感强，M1 验收时可改为「Activity 优先，Actions 折进 advanced」。默认先**并排分段**，避免过早丢事件元数据。

### 3.2 跟随规则

```text
if selectedFlowStepId → 检视该 step
else if any step.status === 'running' → 检视该 step（自动跟随，用户手动选中后停止自动跳步直到 clear）
else if selectedActivityId → 检视 activity.phaseId 对应 step，并滚动到 activity 段
else → EmptyState：选择时间线中的一步
```

**手动选中锁定**：用户点击某 step 后，右栏固定该步，即使后续 step 变为 running（避免阅读被抢走）。提供「Follow live」控件或再次点击已选 step 清除选中以恢复跟随（实现时二选一，写进 i18n）。

### 3.3 Graph 模式

- 左：`AgentFlowGraph`；右：同一 `AgentFlowInspector`。
- `onSelectStep` 已有 → 无需第二套选中态。

### 3.4 窄屏回退

- 建议断点：容器宽度 `< 840px`（或 `max(左列+右列最小宽)`不满足时）。
- 回退：单列；Inspector 回到当前「选中后出现在主列下方」行为（接近今日 StepDetail）。
- 不在 v1 做抽屉 overlay 动画，除非实现成本接近。

---

## 4. 分波次

### M0 — 分栏骨架 + Step Inspector 迁入右侧

**目标**：宽屏右侧不再空白；选中 step 时右栏显示今日 StepDetail 级信息（label / kind / summary / files / corrections）。

- [x] `runBody` 改为 `.split`：`.primary` + `.inspectorPane`
- [x] `.primary` 内放 timeline 或 graph；timeline 保持可读宽度（可继续 ~520 或 `min(520px, 100%)`）
- [x] 新建 `AgentFlowInspector`，移植 `AgentFlowStepDetail` 行为
- [x] 宽屏：StepDetail **不再**渲染在主列下方
- [x] 未选中：右栏 Follow running 或空态；手动选中锁定 + Follow live
- [x] 窄屏回退（`max-width: 840px` 纵向堆叠）
- [x] i18n：`agentFlow.inspector.*`（en + zh）
- [x] 单测：Inspector props + `resolveInspectedFlowStepId` + split smoke

**验收**：打开浮窗宽屏 → 右侧有检视壳；点一步 → 右栏出详情与纠错；左侧仍能扫完全程。

**不在本波**：迁 reasoning、改 DelegatedRunTree、Ask/Plan/Debug subject 分栏。

---

### M1 — Reasoning + Phase 证据进入右栏

**目标**：CoT（provider reasoning）与 phase 级 actions/activity 在右栏可读；左列去掉或压缩长文。

- [x] Inspector 增加 Reasoning 段：按 `phaseId` 过滤 `flowTransientTraces`
- [x] 复用截断提示（`askReasoningTruncated`）
- [x] Actions 段：phase 过滤的 `flowActions` + `AgentActionRow`
- [x] Activity 段：phase 过滤的 activities；响应 `selectedActivityId` 滚动高亮
- [x] 左列改为 phase marker 短标记；**不再内联完整 reasoning `<details>`**
- [x] Graph 选中同样填充 Reasoning/Actions（共用 Inspector）
- [x] 测试：reasoning / empty reasoning / follow-live 解析

**验收**：跑含 `provider_reasoning` 的 Agent run → 右栏能连续阅读思维痕迹；timeline 恢复可扫读。

**不在本波**：Delegation 整树迁入；列宽拖拽。

---

### M2 — Delegation 钻取（原「ToT 空间」的诚实版本）

**目标**：多 agent 时右栏可看委派树与子 run traces，左列不再被整树撑爆。

- [x] 左列：委派摘要 +「在检视栏查看」
- [x] 右栏 Delegation：`DelegatedRunTree` 作为 Inspector 插槽
- [x] 子 run traces 留在右栏树内
- [x] 无委派时整段不渲染
- [x] 既有 delegation tree 单测保持通过

**验收**：层级委派 run 下，用户能在右侧钻子任务，左侧主时间线仍短。

---

### M3 — 明确延期 / 不做

| 项 | 去向 |
|----|------|
| 真 ToT（分支生成、评分、剪枝 UI） | 需独立研究 + 契约；**不在本计划** |
| Ask / Plan / Debug subject 整页左右分栏 | 可另开小品；v1 仅 run Timeline/Graph |
| Inspector 列宽拖拽 + 持久化 | v1.1 |
| Reasoning 流式 token 级打字机 | 仅当事件流已支持增量；今日整段 trace 到达即可 |
| 与 Live Graph Inspector 状态双向深链 | 另计划 |
| 虚拟列表海量 actions | 有性能证据再做 |

---

## 5. 切片依赖

```text
M0  分栏 + StepDetail 迁右 + 窄屏回退
 │
 ▼
M1  Reasoning / Actions / Activity 迁右 + 左列瘦身
 │
 ▼
M2  Delegation 钻取迁右
```

M0 可独立合入并立刻消除「空白竖条」观感。M1 交付核心 CoT 诉求。M2 覆盖多 agent 细节流诉求。

---

## 6. 代码触点

| 区域 | 路径 | 动作 |
|------|------|------|
| Panel 布局 | `workbench/src/components/AgentFlow/AgentFlowPanel.tsx` | split；条件渲染 Inspector |
| Panel 样式 | `AgentFlowPanel.module.css` | `.split` / `.primary` / `.inspector`；调整 `.timeline` |
| Inspector | **新建** `AgentFlowInspector.tsx` + `.module.css` | 右栏主体 |
| StepDetail | `AgentFlowStepDetail.tsx` | 逻辑迁入或变为 Inspector 内 section |
| Reasoning | `TransientReasoningTrace`（Panel 内） | 抽共享或只在 Inspector 用 |
| Graph | `AgentFlowGraph.tsx` | 保持 onSelect；确认与 split 共存 |
| Overlay | `AgentFlowOverlay.tsx` | 通常无需改；确认 body flex 链 |
| Store | `workbenchStore.ts` | 可选 `flowInspectorTab` / `flowInspectorFollowLive` |
| i18n | `en.ts` / `zh.ts` | `agentFlow.inspector.*` |
| 测试 | `AgentFlowPanel.*.test.tsx` 等 | 布局与投影断言 |
| 契约 | — | **v1 不改**；沿用 `events.ts` traces / actions |

---

## 7. UI / 视觉约束

- Tech theme：`--tech-*` tokens；无 glass / blur。
- 右栏：左侧一条 hairline（`border-left: 1px solid var(--tech-border)`）；背景可用 `--tech-bg-elevated` 与主列微差，避免「又一张大卡片」堆叠。
- 密度：开发者工具级；Reasoning 用可读 markdown，不要巨大标题。
- 运动：选中切换可用短 fade（≤200ms）；遵守 `prefers-reduced-motion`。
- 无障碍：右栏 `role="complementary"` + `aria-label`；键盘选中 step 仍可用。

---

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 双份 reasoning（左 details + 右栏） | M1 验收明确：左列禁止全文 |
| 用户以为有 ToT | 文案只用 Reasoning / Delegated runs；DevPlan / UI 禁 ToT |
| 自动跟随抢走阅读 | 手动选中锁定 + Follow live |
| 窄屏双栏不可用 | container 回退单列 |
| Pool 用户困惑 | Pool tab 不分栏；文档写清 |
| StepDetail 纠错回归 | M0 必须保留 submit correction 路径与测试 |

---

## 9. 验收清单（合并后总验收）

- [ ] 宽屏 Timeline：右侧 Inspector 可见，不再大片空白
- [ ] 选中 step → 右栏 Header/Files/Corrections 正确
- [ ] 有 `provider_reasoning` → 仅右栏全文；左列可扫
- [ ] 无 reasoning → 空态文案，不伪造
- [ ] `selectedActivityId` 打开浮窗 → 右栏能落到对应证据
- [ ] Graph 选中与 Timeline 共用右栏
- [ ] 有委派 → 右栏 Delegation；无则隐藏
- [ ] 窄屏 → 单列，详情仍可达
- [ ] Pool tab 行为与今日一致
- [ ] en/zh 文案齐全；无硬编码用户可见串

---

## 10. 建议实现顺序（开发时）

1. 落地 M0 分栏与 Inspector 壳（最快可见）  
2. 迁 StepDetail  
3. M1 Reasoning + 左列瘦身  
4. M1 Activity / `selectedActivityId` 联动  
5. M2 Delegation  
6. 回归：correction、diff footer、delegation 现有测试  

---

## 11. 开放问题（实现前可拍板；有默认）

| # | 问题 | 默认 |
|---|------|------|
| Q1 | 手动选中后是否默认锁定、需显式 Follow live？ | **是**（锁定 + Follow live） |
| Q2 | 左列 phase 下是否保留 action 一行摘要？ | **保留短标记**；全文在右 |
| Q3 | Ask/Plan/Debug 是否同期分栏？ | **否**，仅 run Timeline/Graph |
| Q4 | Inspector 内用 sticky tabs 还是纯滚动分段？ | **纯滚动 + 段标题**；内容多再加 sticky |
| Q5 | 列宽可否拖？ | **v1 否**；固定 min 宽度 |

拍板后把默认写进实现 PR 描述即可；若推翻默认，先改本文再写代码。
