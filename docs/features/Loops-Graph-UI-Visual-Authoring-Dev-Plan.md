# Loops Graph · Visual Authoring UI 升级 DevPlan

**状态**：Implementing（2026-11-03）。UI-0→UI-3 已落地（图标节点、右侧可折叠 Palette、DnD、浮动 Duty 卡、右键 Open Duty / destructive Delete）；UI-4 测试与文档汇合进行中。  
**范围**：Loops Graph 画布的**视觉识读、节点库布局、拖放构建、右键 Duty 浮动卡**。不改 Runtime / Spec 语义；不引入第二编排引擎。  
**产品定位一句话**：用户应能靠图标与卡片形状快速认出节点职责，从右侧节点库拖放到画布搭流程，并用右键打开挂在节点旁的完整 Duty/Inspector 卡片。  
**决策锁定（产品确认 2026-11-03）**：

| # | 决策 | 锁定 |
|---|------|------|
| D1 | 画布节点默认视觉 | **图标 + 短标题卡片**（描述不默认展开；靠图形识类型） |
| D2 | Duty / Inspector 形态 | **整份 Inspector（Duty+Config+Runtime+Artifacts）变为节点旁浮动卡**，带 **X** 关闭；取消固定右侧 Inspector 栏 |
| D3 | 节点库位置 | 移到原 Duty 右侧栏位；**折叠 = 分类图标按钮**；**展开 = 现有带描述的条目列表** |
| D4 | 构建方式 | 保留点击放置；**新增 Palette → Canvas 拖放落点** |
| D5 | 删除 | 右键菜单已有 Delete；本计划**强化发现性与危险项样式**，不另造平行删除路径 |
| D6 | 图标族 | 与现有 LoopGraph 一致，使用 **lucide-react**（不混 Phosphor）；禁止 emoji 作结构图标 |

| 文档 | 关系 |
|------|------|
| [`Loops-Graph-Workflow-Studio-Dev-Plan.md`](./Loops-Graph-Workflow-Studio-Dev-Plan.md) | Studio 壳 / pause / Fresh·Stale；本计划细化 LG-1.x Palette/Inspector 的**落地 UI** |
| [`Loops-Graph-Node-Architecture-Dev-Plan.md`](./Loops-Graph-Node-Architecture-Dev-Plan.md) | 四类 Node 语义权威；本计划只做**展示与作者ing UX**，不改 Contract |
| [`backend/Planning-Orchestration-Dev-Plan.md`](./backend/Planning-Orchestration-Dev-Plan.md) | 执行底座不变 |

**设计原则（ai-devtool-ui + ui-ux-pro-max，适配本仓）**：

- 高信息密度、IDE 空间感；用 `--tech-*` / workbench tokens，**不**引入紫色渐变 / 玻璃拟态新皮肤。
- 图标可扫读；文字是辅助，不是唯一信号。
- 微交互 150–300ms；尊重 `prefers-reduced-motion`。
- 可点目标 ≥ 24px 可视 / 44px 触达（侧栏图标按钮）。
- 拖放须有落点高亮与键盘等价路径（点击仍可用）。

---

## 1. Executive Summary

### 现状

```text
[ LoopGraphRail | Palette(左·始终展开) | Canvas(文字卡) | Inspector(右·固定 Duty栏) ]
```

| 能力 | 现状 |
|------|------|
| 画布节点 | 文本 chip + title；无类型图标 |
| 节点库 | 左侧 220px；标题+描述列表；点击放置 |
| Inspector | 右侧固定；选中即显示 |
| 拖放建节点 | 无 |
| 右键删除 | 已有（确认对话框） |
| 右键「查看描述」 | 展开节点内 prompt，非 Duty 卡 |

### 目标布局

```text
[ LoopGraphRail | Canvas(图标+短标题) + 浮动 Inspector 卡 | Palette(右·折叠图标 / 展开描述) ]
```

用户路径：

1. 扫右侧图标认出 Agent / Action / Logic / Human。  
2. 拖（或点）到画布落点 → 创建带架构 seed 的节点。  
3. 画布上靠**图标 + 短标题**认节点，不必读长文。  
4. 右键节点 → **Open Duty** → 节点旁出现完整 Inspector 卡；**X** 关闭。  
5. 右键 → **Delete**（强化样式）→ 现有确认流。

---

## 2. Iconography Map（识读合同）

单一映射表，供 Palette 折叠态、画布节点、（可选）菜单共用。实现建议：`loopNodeVisuals.ts`。

| Palette / 架构 | Lucide 建议 | 短标签（en / 可 i18n） | 类别色 token（建议） |
|----------------|-------------|------------------------|----------------------|
| `agent.planner` | `Map` / `ClipboardList` | Planner | `--loop-cat-agent` |
| `agent.coder` | `Code2` | Coder | 同上 |
| `agent.reviewer` | `SearchCheck` | Reviewer | 同上 |
| `action.test` | `FlaskConical` | Test | `--loop-cat-action` |
| `action.github.create_pr` | `GitPullRequest` | Create PR | 同上 |
| `action.github.create_branch` | `GitBranch` | Branch | 同上 |
| `action.terminal` | `Terminal` | Terminal | 同上 |
| `logic.condition` | `GitFork` / `Split` | Condition | `--loop-cat-logic` |
| `logic.loop` | `Repeat` | Loop | 同上 |
| `logic.merge` | `Merge` | Merge | 同上 |
| `logic.exit` | `CircleCheck` / `Flag` | Exit | 同上 |
| `human.approval` | `ShieldCheck` | Approval | `--loop-cat-human` |
| `human.review` | `MessageSquareWarning` | Review | 同上 |
| `human.input` | `TextCursorInput` | Input | 同上 |
| 未分类 / Draft | `Box` / `Sparkles` | Draft | muted |

**类别色**：四类各一 muted accent（描边/图标底），对比遵守 WCAG；不靠颜色作为唯一区分（图标形状必须可辨）。

**解析优先级**：`actionIntegration+operation` → `agentRole` → `logicKind` → `humanMode` → `type` → Draft。

---

## 3. 交互规格

### 3.1 右侧 Palette（原 Duty 栏位）

| 态 | UI | 行为 |
|----|-----|------|
| Collapsed（默认） | 窄轨（~48–56px）：按 category 分组的 **icon button**；tooltip = title | 点击 = 现有 `beginAuthorNodeFromPalette` 落点；**拖出** = DnD |
| Expanded | ~220–280px：现有分类标题 + 条目（图标 + title + description） | 顶部/轨上 **Expand / Collapse** 切换；记忆到 `sessionStorage` 或 overlay local state |
| Presets | 折叠态用单个「Preset」图标按钮打开 popover；展开态保留现有 presets 区 | 不变语义 |

拖放数据：`application/x-projectos-loop-palette` + `paletteItemId`（JSON）。Canvas `dragover` 必须 `preventDefault`；`drop` 将 client 坐标转为 world 后调用 `beginAuthorNodeFromPalette(id, position)`。拖过画布时显示 ghost / drop ring。

冲突：节点移动 pointer drag 与 palette HTML5 DnD 分离——palette 用 `draggable`；画布节点继续 pointer。落在已有节点上：仍在落点创建新节点（不合并），避免误绑。

### 3.2 画布节点（D1）

```text
┌──────────────────────────┐
│ [icon]  Short title    ▾ │  ← 默认；icon 表类型，title 一行 truncate
└──────────────────────────┘
         │ 可选展开 prompt（保留现 chevron，非 Duty 卡）
```

- 尺寸：在现 `LOOP_NODE_W/H`（200×56）上微调以容纳 16–18px 图标；路由常量同步更新。  
- 选中 / connecting / incomplete / running / HITL 态保留，图标不替换状态色。  
- **不**默认显示长 prompt；右键 Open Duty 才看完整编辑面。

### 3.3 浮动 Inspector 卡（D2）

- 触发：右键节点 → **Open Duty**（替换或并列现「View description」：产品文案改为 Open Duty；原仅展开 prompt 的行为可降为卡内折叠或删除）。  
- 内容：复用 [`LoopNodeInspector`](../../projectos/workbench/src/components/LoopGraph/LoopNodeInspector.tsx) 全部 section；外层加 chrome：**标题条 + X**。  
- 定位：锚在节点**右侧**（优先），视口溢出则左侧/下方；随 viewport pan/zoom 用同一 world→screen 变换更新；节点拖动时跟随。  
- 多卡：MVP **同时最多一张**（打开 B 关闭 A），避免遮挡；后续可允许多卡。  
- 关闭：X、Esc（焦点在卡内时）、删除该节点时。  
- 选中节点**不再**自动打开固定右栏；可选：双击节点 = Open Duty（增强，非必须）。

### 3.4 右键菜单

| 项 | 动作 |
|----|------|
| Connect | 现有 |
| Open Duty | 打开浮动 Inspector 卡 |
| Delete | 现有 `setPendingDelete`；菜单项用 destructive 样式（`--color-error`）提高发现性 |

Blank / Edge 菜单不变。

---

## 4. 信息架构 / 组件拆分

| 组件 | 职责 |
|------|------|
| `loopNodeVisuals.ts` | id/架构 → icon 组件、短标签、类别色 class |
| `LoopGraphPalette.tsx` | 右栏；collapsed / expanded；DnD `dragstart` |
| `LoopGraphOverlay.tsx` | 布局去左 Palette / 去固定 Inspector；canvas drop；浮动卡锚点 |
| `LoopNodeCard.tsx`（新建，建议） | 从 overlay 抽出节点外观：icon+title+ports |
| `LoopNodeDutyCard.tsx`（新建） | 浮动壳：定位、X、内嵌 `LoopNodeInspector` |
| `LoopGraphContextMenu.tsx` | Open Duty；Delete 强化 |
| `loopEdgeRouting.ts` | 若节点尺寸变，更新 `LOOP_NODE_W/H` |
| i18n `en.ts` / `zh.ts` | `openDuty`、`paletteExpand`、`paletteCollapse`、tooltip |

**Store**：尽量不改 `loopGraphStore` 持久化文档；浮动卡打开态用 overlay `useState`（`dutyCardNodeId`）。Palette 展开态 local。

---

## 5. 非目标

- 不改 LoopSpec / Runtime / Artifact 契约。  
- 不做通用表达式编辑器、并行 DAG 调度 UI。  
- 不把节点库做成可搜索 Command Palette（可后续）。  
- 不强制移动端触控完整 DnD（桌面优先；点击放置保留为等价路径）。  
- 不新造删除 API。

---

## 6. 任务切片

### Phase UI-0 — 冻结与映射

#### UI-0.1 Icon + 文案映射表

| 字段 | 内容 |
|------|------|
| Task ID | UI-0.1 |
| 验收 | §2 表落地为 `loopNodeVisuals` + 单测（palette id → icon key） |
| 复杂度 | S |

#### UI-0.2 布局线框确认

| 字段 | 内容 |
|------|------|
| Task ID | UI-0.2 |
| 验收 | 右 Palette / 无固定 Inspector / 浮动卡锚点规则写进本文件（已含）；实现按此执行 |
| 复杂度 | S |

---

### Phase UI-1 — 画布节点视觉

#### UI-1.1 Icon + 短标题节点卡

| 字段 | 内容 |
|------|------|
| Task ID | UI-1.1 |
| 可能修改 | `LoopGraphOverlay.tsx` / 新 `LoopNodeCard.tsx`、`LoopGraphOverlay.module.css`、`loopEdgeRouting.ts` |
| 验收 | 所有架构类型可辨；Draft 有独立图标；title truncate；状态 class 不回归 |
| 复杂度 | M |

#### UI-1.2 a11y

| 字段 | 内容 |
|------|------|
| Task ID | UI-1.2 |
| 验收 | `aria-label` = 短标签 + title；不只靠颜色 |
| 复杂度 | S |

---

### Phase UI-2 — 右侧可折叠 Palette + DnD

#### UI-2.1 搬迁与折叠轨

| 字段 | 内容 |
|------|------|
| Task ID | UI-2.1 |
| 可能修改 | `LoopGraphPalette.tsx`、`.module.css`、`LoopGraphOverlay.tsx` |
| 验收 | Palette 在右侧；默认折叠为图标按钮；展开为描述列表；presets 可达 |
| 复杂度 | M |

#### UI-2.2 Palette → Canvas DnD

| 字段 | 内容 |
|------|------|
| Task ID | UI-2.2 |
| 验收 | 拖到画布空白处按落点创建节点；点击放置仍可用；非法 drop 无静默失败 |
| 复杂度 | M |

---

### Phase UI-3 — 浮动 Duty/Inspector 卡 + 菜单

#### UI-3.1 LoopNodeDutyCard

| 字段 | 内容 |
|------|------|
| Task ID | UI-3.1 |
| 验收 | 右键 Open Duty 打开；X / Esc 关闭；跟随节点与 viewport；含 Duty+Config+Runtime+Artifacts |
| 复杂度 | L |

#### UI-3.2 移除固定右栏 + 菜单文案

| 字段 | 内容 |
|------|------|
| Task ID | UI-3.2 |
| 验收 | 无常驻 Inspector 栏；Context menu 含 Open Duty + destructive Delete；确认删流程仍走 `pendingDelete` |
| 复杂度 | S |

---

### Phase UI-4 — 测试与文档汇合

#### UI-4.1 组件/交互测试

| 字段 | 内容 |
|------|------|
| Task ID | UI-4.1 |
| 验收 | Overlay/Palette/ContextMenu 单测覆盖：视觉映射、drop 调用 store、Open Duty 开关、删除仍触发 pending |
| 复杂度 | M |

#### UI-4.2 Studio 交叉修订

| 字段 | 内容 |
|------|------|
| Task ID | UI-4.2 |
| 验收 | Studio DevPlan LG-1.1/1.2 指向本文件；状态改为 Visual Authoring 已规划 |
| 复杂度 | S |

---

## 7. Task Dependency Map

```text
UI-0.1 ──┬── UI-1.1 ── UI-1.2
         │
         ├── UI-2.1 ── UI-2.2
         │
         └── UI-3.1 ── UI-3.2 ── UI-4.1 ── UI-4.2
```

**建议首个可交付切片**：UI-0.1 → UI-1.1 → UI-2.1 → UI-2.2 → UI-3.1 → UI-3.2。

---

## 8. 测试与验收矩阵

| ID | 场景 | 期望 |
|----|------|------|
| T-UI1 | Feature Development 各节点类型 | 图标互不相同且与类别一致 |
| T-UI2 | Palette 折叠 | 仅图标；tooltip 有 title |
| T-UI3 | Palette 展开 | 描述可见；宽度不挡关键节点操作 |
| T-UI4 | DnD 落点 | 新节点 `position` ≈ drop world 坐标 |
| T-UI5 | 点击 palette 项 | 仍创建节点（无拖也能用） |
| T-UI6 | Open Duty | 浮动卡含四段；X 关闭后无残留 |
| T-UI7 | 拖动画布 / pan | 卡与节点相对位置保持 |
| T-UI8 | Delete | 右键 Delete → 确认 → 节点与边移除 |
| T-UI9 | reduced-motion | 无强制大动画 |
| T-UI10 | 键盘 | Esc 关菜单/卡；菜单焦点不丢 |

---

## 9. 风险与不变量

| 风险 | 缓解 |
|------|------|
| 浮动卡遮挡边/端口 | 优先节点右侧 + 视口夹紧；半透明阴影分离层 |
| DnD 与节点 pointer drag 冲突 | 不同输入源；canvas drop 仅接受 palette MIME |
| 节点尺寸变化导致边错位 | 同步 `LOOP_NODE_W/H` 与单测 |
| 用户找不到删除 | destructive 样式 + 保持确认，避免误删 |
| Inspector 无选中态常驻 | Open Duty 入口在右键；可选后续加工具栏按钮 |

**不变量**：`beginAuthorNodeFromPalette` / `removeAuthoringTarget` / 架构 seed 语义不变；运行态只读 Inspector 仍尊重 `readOnly`。

---

## 10. Definition of Done

1. §6 任务 DoD 满足；§8 P0 测试绿。  
2. 布局为「左 Rail · 中 Canvas · 右 Palette」；无固定 Inspector 栏。  
3. 画布节点为图标+短标题；浮动卡可开可关。  
4. DnD 与点击放置双路径可用。  
5. 未改 Runtime / contracts 语义（除可选的纯展示 helper）。  
6. Studio / Node Architecture 文档已交叉引用本计划。

---

## 11. 开放问题（不阻冻结）

| # | 问题 | 默认 |
|---|------|------|
| Q1 | 双击节点是否 Open Duty？ | 是（UI-3 可加） |
| Q2 | 是否允许多张 Duty 卡？ | MVP 单张 |
| Q3 | Palette 展开态是否持久化到用户设置？ | 先 session/local |
| Q4 | Run phase 是否隐藏 Palette？ | 保持现 draw-only 逻辑 |

---

## 12. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-11-03 | 初稿。产品确认 D1=图标+短标题、D2=整份 Inspector 浮动卡；纳入 Palette 右置折叠、DnD、右键 Open Duty / Delete 强化。 |
| 2026-11-03 | 实现 UI-0–UI-3：`loopNodeVisuals`、画布图标卡、右栏 Palette 折叠/展开、Palette→Canvas DnD、`LoopNodeDutyCard`、Context menu Open Duty。 |
