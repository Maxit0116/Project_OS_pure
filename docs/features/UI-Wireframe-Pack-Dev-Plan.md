# UI Wireframe Pack（Diagram Graph 扩展）Dev Plan

**Status**: Implementing（2026-11-06）— 线稿套装宿主 = **Diagram Graph · `ui-wireframe`**。独立 `WireframePackOverlay` / Stage Rail 图标已折叠；Design Tab 废案。  
**Product name**: UI Wireframe Pack / Screen Pack（线稿套装）— **宿主表面 = Diagram Graph**  
**One-liner**: 在 Diagram Graph 里用 `ui-wireframe` 类型生成并冻结多屏 L1 线稿契约，再交给 Agent / Loop 对照实现 → Split check → Gap → 人验收。  
**Philosophy**: From Vibe Coding to Vibe Engineering — `Intent → Pack (in Diagram Graph) → Freeze → Plan → Agent → Validate → Graph Update`。禁止 `线稿 → 代码` 直通。

---

## 0. 需求重述（本次锁定）

| # | 用户诉求 | 产品结论 |
|---|----------|----------|
| 1 | 从 0 做大功能需要前端界面时，要有一套线稿 | **要** Wireframe Pack（多屏 + flow + 冻结） |
| 2 | 在 diagram graph 里先生成，再给 agent 对照实现与 loop | **宿主 = Diagram Graph**（同一 overlay / rail / Chat 双写范式） |
| 3 | 不要 Design Tab | **Design Tab 为废案**：文档与规划中删除；不做双向导入、不做 Gesso 默认辅闸挂 Design Tab |
| 4 | 不要另起一套平行「线稿 Graph」心智 | **无**独立 Stage Rail 线稿图标；类型选 `ui-wireframe` 即可 |

**价值链**：

```text
模糊 / 大型 UI feature
  → Diagram Graph · 类型 ui-wireframe
  → 生成 Wireframe Pack（L1 默认）
  → 人审 + Freeze vN
  → Implement against Pack（Agent / Loop 按屏）
  → Split vs 线稿 → Gap → Fix / Accept intentional
  → Human Accept → realized
  → 后续微调 → Capture + Stencil（改已有屏，不重开从 0）
```

---

## 1. Locked decisions（2026-11-06 reset）

| # | Decision | Lock |
|---|----------|------|
| D1 | 宿主 | **Diagram Graph only** — 与 architecture / sequence / flowchart 等并列的 visual family：`ui-wireframe` |
| D2 | 名称 | 能力名仍可叫 UI Wireframe Pack / Screen Pack；UI 入口文案挂在 Diagram Graph 下 |
| D3 | 默认保真 | **L1 灰盒线稿 + 标注**为默认验收真源；高保真 mock 非目标 |
| D4 | 契约落盘 | `.projectos/wireframes/`（或 Diagram index 引用 packId）；**不**混进普通 architecture HTML 当验收真源 |
| D5 | 未冻结不可自动实现 | 未 Freeze 不得写入 Loop / Agent acceptance |
| D6 | Chat 双写 | 复用 Diagram 的 Summary Card 模式（可扩展 wireframe 字段）；打开 **同一** Diagram Graph overlay |
| D7 | vs 架构图 | 纯架构/时序 → 既有 diagram 类型；含屏幕/线稿/从 0 UI → `ui-wireframe`；歧义则问一句 |
| D8 | vs Design Tab | **不做**；Design Tab / Sketch canvas / Gesso-on-Design-Tab 文档与里程碑删除 |
| D9 | vs Stencil | 无界面从 0 → Pack；已有屏局部改 → Capture + Stencil |
| D10 | Acceptance | 模型不可放宽 `wireframe-pack@id@vN`；仅人可 intentional / amend / accept |
| D11 | Stage Rail | **仅 Diagram Graph 图标**；不增加独立线稿图标 |
| D12 | Check MVP | Split + 人标 Gap；可选 L-struct 启发式；像素回归非目标 |

---

## 2. Non-goals

- **Design Tab**（含 Sketch IR 画布、Design Preview 作为线稿宿主、Gesso 挂 Design Tab、双向导入）
- 独立 Wireframe Stage Rail / 与 Diagram 互斥的第二套 overlay 产品心智（实现上若曾落地，折叠进 Diagram）
- Figma 级画布、钢笔精修
- 以高保真生图作默认验收闸
- 替代 Function Map / C4 / Story
- Boot 自动恢复 overlay
- Mermaid 作线稿主渲染

---

## 3. 与相邻表面

| 表面 | 职责 | 与线稿 |
|------|------|--------|
| **Diagram Graph** | 说明性图 + **线稿 Pack** | **唯一宿主** |
| Function Map / Story | 功能真源 | Pack 可绑定 featureId；升 `implemented` 仍需 refs + `locked` |
| UI Stencil + Capture | 已有截图上改 UI | Pack Accept 后的打磨路径 |
| Loop / Agent | 执行 | 引用冻结 `acceptanceRef`；按屏切片 |
| Ask · FP | 立论 | Go 后可建议「在 Diagram Graph 生成线稿」 |
| ~~Design Tab~~ | ~~废案~~ | **删除** |

---

## 4. Diagram Graph 集成形态

### 4.1 类型与入口

```text
DiagramGoalComposer
  typeHint: auto | architecture | sequence | flowchart | data-flow | state | ui-wireframe
                                                                    └─ 新增
```

| 入口 | 行为 |
|------|------|
| Stage Rail → Diagram Graph | 打开既有 overlay；类型选 Wireframe / Screen Pack |
| Chat | `looksLikeWireframePackRequest` → 走 Diagram Graph 生成 ui-wireframe（非独立 overlay） |
| Story / feature「从 0 做前端」 | 打开 Diagram Graph 并预填 ui-wireframe |

### 4.2 Overlay 内能力（仍用 GraphOverlayFrame）

```text
DiagramGraphOverlay
  ├─ Rail：diagrams + wireframe packs（可同 rail 分区，或 visualType 过滤）
  ├─ Stage：单屏 iframe | Pack 多屏切换 | Split（线稿 vs preview）
  ├─ Notebook：屏备注 / non-goals / gaps
  └─ Composer：prompt + typeHint（含 ui-wireframe）+ Freeze / Implement / Accept
```

### 4.3 产物

```text
.projectos/wireframes/<packId>/
  manifest.json | draft.json | vN/pack.json | screens/*.html | gaps.json

Diagram index（可选）
  artifacts[] 含 visualType: "ui-wireframe" + packId 引用
```

架构图仍落 `.projectos/diagrams/`；**线稿契约以 wireframes 为准**。

### 4.4 核心对象（契约层保留）

Pack / Screen / Region / Flow / FreezeMeta（`full` \| `main_path`）/ Gap / ImplementBrief（`acceptanceRef`、`screenSlices`、`loopAcceptance`）— 语义同前，**UI 宿主改为 Diagram Graph**。

---

## 5. 交互主路径

1. 打开 Diagram Graph → 选 **UI Wireframe** → 描述功能 → Generate  
2. Rail 切屏、补空态/错误、改 notebook  
3. Freeze full 或 Freeze main path → checksum `vN`  
4. Implement against Pack → brief（可 handoff Agent composer）  
5. Split 对照 → Scan struct / 手标 Gap → Fix / intentional  
6. Accept Pack → `realized`；提示 features sync **不**自动升格  
7. 打磨 → Capture + Stencil  

---

## 6. 里程碑（文档锁定后开发）

| ID | Scope | Status |
|----|--------|--------|
| DG-WF-0 | 文档对齐（本文 + Diagram-Graph-Dev-Plan）；废案 Design Tab 引用清除 | Done |
| DG-WF-1 | `DiagramVisualTypeHint` + `ui-wireframe`；composer / Chat 路由进 **同一** Diagram overlay | Done |
| DG-WF-2 | Pack 生成与 `.projectos/wireframes` 落盘；rail 展示 pack/screens | Done |
| DG-WF-3 | Freeze / Implement brief / Gaps / Accept（折叠既有服务，去掉独立 Stage Rail） | Done |
| DG-WF-4 | Split 对照 + Agent handoff；Feature 绑定徽章 | Done |
| DG-WF-5 | 移除/折叠独立 `WireframePackOverlay` 与独立 Stage Rail 入口；测试 + 验收 | Done |

**明确不做的里程碑（已删）**：Design Tab 双向导入、Gesso-on-Design-Tab、独立线稿 Graph。

---

## 7. 废案与折叠说明

| 项 | 处理 |
|----|------|
| Design Tab / Sketch / Design Preview 作为线稿宿主 | **废案** — 不写进产品规划；代码清理另开任务（本文档阶段只清文档） |
| `docs/Design-Tab-Gesso-Integration-*.md` | 已不存在 / 不再引用 |
| 独立 Wireframe Pack Stage Rail + Overlay | **已折叠**进 Diagram Graph（`WireframePackWorkspace` + `surfaceMode`） |
| sample / skill 中「Design tab · anti-slop」块 | **删除**；HTML 质检若需要，挂 Diagram 线稿导出，不挂 Design Tab |

---

## 8. Acceptance（文档 + 后续实现）

**文档阶段**

1. 本文与 Diagram-Graph-Dev-Plan 一致：线稿 = Diagram 类型族  
2. 无 Design Tab 作为线稿依赖或 M2 目标  
3. 无「独立线稿 Stage Rail」产品锁  

**实现阶段**

1. [x] 仅 Diagram Graph 可完成生成 → 冻结 → 实现 brief → Gap → Accept  
2. [x] Chat 线稿意图打开 Diagram overlay，不打开平行线稿产品壳  
3. [x] 架构图与线稿路由不互吞；歧义先问  
4. [x] `acceptanceRef` 不可被模型改松（契约层既有闸）  


---

## 9. Key paths（实现时预期）

| 层 | 路径 |
|----|------|
| 产品宿主 UI | `projectos/workbench/src/components/DiagramGraph/*` |
| Pack 契约/服务 | `projectos/contracts/ui-wireframe-pack.ts`、`services/ui-wireframe-pack/*`（可保留，由 Diagram 调用） |
| Diagram 契约 | `projectos/contracts/diagram-graph.ts`（扩展 type hint） |
| 持久化 | `.projectos/wireframes/` + 可选 diagrams index 引用 |
| 本文 | `docs/features/UI-Wireframe-Pack-Dev-Plan.md` |
| 宿主总计划 | `docs/features/Diagram-Graph-Dev-Plan.md` |

---

## 10. 幸福路径

```text
Stage Rail → Diagram Graph
  → type = UI Wireframe
  → 「团队协作看板从 0」→ 多屏 L1 Pack
  → Freeze v1 → Hand off to Agent
  → Split / Gaps → Accept
  → 微调走 Capture + Stencil
```
