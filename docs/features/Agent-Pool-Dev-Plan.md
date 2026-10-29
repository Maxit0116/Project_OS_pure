# Agent Pool：多 Agent 态势与验收闭环

**状态**：M0–M3 implemented（初版，可迭代）。  
**范围**：Agent Flow 第三个 tab「Agent Pool」——以任务 identity 为行、叠放 history；用户点 Done 后在 Chat 弹出验收卡；通过离池，不通过续跑。  
**权威交叉引用**：
- 本仓库 Cursor plan：`Agent Pool Dev Plan`
- `docs/features/Agent-Flow-Activity-Dev-Plan.md` — Timeline / Graph 深读
- 契约：`projectos/contracts/events.ts`（delegation、actions、steps）
- Compose：`projectos/services/compose-subagents.ts`、`SpatialComposeHub`

**锁定决策**：
- 一行 = **任务 identity** + 可选 **叠放 history**
- **Done 由用户点击** → Chat 验收卡 → 通过离池 / 继续则 push history

---

## 产品分界

| 表面 | 负责 |
|------|------|
| **Agent Pool tab** | 态势、行内 mini flow、叠放、跳转、Done |
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

---

## 数据流

```
workbench run + delegation traces
chatSession heads (other working sessions)
compose hub slots → agentPoolStore.composeSubagents
        ↓
 projectAgentPool(+ overlay: removed / reviewing / history)
        ↓
 AgentPoolPanel rows
        ↓ Done
 agentPoolStore.startReview → Chat AgentPoolAcceptanceCard
        ↓ accept | continue
 remove row | push history + stack UI
```

---

## 明确不做（本轮）

- Pool 内嵌完整 Session / Loop 图
- 把 Timeline 整页搬进行内
- 品牌级 model SVG（现为色相字母 chip）
