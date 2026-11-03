# Agent Pool：多 Agent 态势与验收闭环

**状态**：M0–M4 implemented（基线）。  
**范围**：Agent Flow 第三个 tab「Agent Pool」——以任务 identity 为行、叠放 history；行内迷你 waterfall 在共享时钟上生长；用户点 Done 后在 Chat 弹出验收卡；通过离池，不通过续跑。  

**v1.0 升级权威文档**：[`Agent-Pool-Trace-Waterfall-Dev-Plan.md`](./Agent-Pool-Trace-Waterfall-Dev-Plan.md)  
（Stable Definition / independent PoolRun / JSONL Trace Projection / shared-axis Waterfall / durable History & acceptance。本文件保留为 M0–M4 已落地基线，不与升级计划竞争。）

**权威交叉引用**：
- `docs/features/Agent-Flow-Activity-Dev-Plan.md` — Timeline / Graph 深读
- 契约：`projectos/contracts/events.ts`（delegation、actions、steps）
- Compose：`projectos/services/compose-subagents.ts`、`SpatialComposeHub`
- 参考交互：Kobra Trace Waterfall（`spans` + `now` 共享时钟）

**锁定决策（M0–M4）**：
- 一行 = **任务 identity** + 可选 **叠放 history**
- **Done 由用户点击** → Chat 验收卡 → 通过离池 / 继续则 push history
- 行内可视化 = **迷你 span 轴**（不是完整 Timeline）；深读仍 Jump → Graph / Timeline

> v1.0 将把「任务 identity」升级为稳定 `AgentDefinition`，并把迷你 waterfall 升级为 Major Action 共享时间轴 + Inline Expand + Inspector；详见 Trace Waterfall DevPlan。

---

## 产品分界

| 表面 | 负责 |
|------|------|
| **Agent Pool tab** | 态势、行内 mini waterfall、叠放、跳转、Done |
| **Timeline / Graph** | 单 run 证据与结构 |
| **Chat** | 验收卡决策 |
| **Session / Loop overlay** | 被导航打开的目标图 |

---

## 实现对照

| Milestone | 内容 | 落点 |
|-----------|------|------|
| **M0** | `AgentFlowViewMode += 'pool'`；投影 + 行壳 | `AgentPool/projectAgentPool.ts`、`AgentPoolPanel`、`AgentPoolRow` |
| **M1** | 抽拉 mini flow；跳转 Graph / Sessions / Chat（Loops 有关联才显示） | `AgentPoolRowExpand`、`AgentPoolJumpMenu` |
| **M2** | Done → `AgentPoolAcceptanceCard`；accept / continue + 叠放 | `agentPoolStore`、`ChatPanel` |
| **M3** | 跨 session working heads；Compose Hub sync；model letter icon；本文档 | `syncComposeSubagents.ts`、i18n、本文件 |
| **M4** | `AgentPoolSpan` 投影 + 面板 `now` 时钟；折叠态 compact waterfall；展开态矮 waterfall；池级 summary | `projectAgentPoolSpans`、`useAgentPoolNow`、`AgentPoolMiniWaterfall` |

---

## 数据流

```
workbench run + delegation traces
chatSession heads (other working sessions)
compose hub slots → agentPoolStore.composeSubagents
        ↓
 projectAgentPool(+ overlay: removed / reviewing / history)
   → tasks with spans[] + originMs
        ↓
 AgentPoolPanel (useAgentPoolNow) → rows + MiniWaterfall(now)
        ↓ Done
 agentPoolStore.startReview → Chat AgentPoolAcceptanceCard
        ↓ accept | continue
 remove row | push history (sealed spans) + stack UI
```

---

## 明确不做（M0–M4 本轮）

- Pool 内嵌完整 Session / Loop 图
- 把 Timeline 整页搬进行内（无 zoom / 最慢路径分析）
- 品牌级 model SVG（现为色相字母 chip）
- Cost / Tokens 仪表盘（契约未提供池级计费时不做）

v1.0 范围与延期项以 [`Agent-Pool-Trace-Waterfall-Dev-Plan.md`](./Agent-Pool-Trace-Waterfall-Dev-Plan.md) §11 / §17 为准。
