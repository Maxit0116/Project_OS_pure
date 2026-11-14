# Loops Graph · Semantic Workflow Layout — DevPlan

**状态**：Implementing（2026-11-14）— SL-1/2 引擎 + Draw「按语义整理」+ L2 TB + Review Path Map TB 已落地；SL-4 端口廊道 / SL-6 容器一级公民仍可迭代。  
**范围**：把 Loops Graph 的 **节点空间排布**（以及与之绑定的端口偏好 / 回边廊道策略）从「自由落点 + 局部对齐 + 正交绕线」升级为 **可识读的标准 workflow 语义布局**（时间从上到下、头尾清晰、主路径居中、回边侧廊）。**不**改 Runtime / Spec 编译语义；**不**引入第二编排引擎；**不**把 Review 变成第二张可编辑 Draw。  
**产品定位一句话**：用户扫一眼 Loops Graph，应能分清 workflow 的头与尾、先与后；连线只是在强化这条竖直时间轴，而不是用乱线补救乱位。

**权威交叉引用**：

| 文档 | 关系 |
|------|------|
| [`Loops-Graph-Workflow-Studio-Dev-Plan.md`](./Loops-Graph-Workflow-Studio-Dev-Plan.md) | Studio 壳 / `draw \| review \| run`；本计划改的是 Draw 与 Review **空间呈现**，不改阶段机 |
| [`Loops-Graph-UI-Visual-Authoring-Dev-Plan.md`](./Loops-Graph-UI-Visual-Authoring-Dev-Plan.md) | 节点识读 / Palette / Duty 卡；本计划不改图标合同，只改位置与边廊 |
| [`Loops-Graph-Review-Visual-Dev-Plan.md`](./Loops-Graph-Review-Visual-Dev-Plan.md) | Review Path Map 只读；其 `layoutLoopReviewPath` **横向蛇形**是本计划优先改造点之一 |
| [`Loops-Graph-Node-Architecture-Dev-Plan.md`](./Loops-Graph-Node-Architecture-Dev-Plan.md) | `depends` / `feedback` / `conditional` / `provides` 语义权威；布局必须服从边 kind |
| [`Loops-Graph-Agent-Wiring-Dev-Plan.md`](./Loops-Graph-Agent-Wiring-Dev-Plan.md) | `provides` 卫星布局独立；语义 TB 布局默认 **忽略 provides**（折叠装配噪音） |
| [`Loops-Graph-Agent-Work-Group-Dev-Plan.md`](./Loops-Graph-Agent-Work-Group-Dev-Plan.md) | L1 chip 矩阵 / L2 完整卡；Work Group 是布局 **复合单元**，不是普通节点 |
| [`Loops-Graph-Gaps-Closure-Dev-Plan.md`](./Loops-Graph-Gaps-Closure-Dev-Plan.md) | Parallel / Loop 拓扑容器；本计划要让容器成为 **布局输入**，而非事后 AABB 包一层 |
| 标准参考：Human-in-the-Loop Workflow Graph（讨论图二） | TB 主脊柱、并行对称、回边侧廊、条件分流、Start/End 锚点 |

**设计气质**（承接既有 Studio）：`--tech-*` 高密度开发工具；禁止仪表盘 KPI、装饰性徽章、紫色渐变皮肤。

---

## 0. 问题陈述（讨论锁定 2026-11-14）

### 0.1 用户痛点（图一）

系统自动整理 / 当前落点结果常见症状：

1. **看不出头尾**：没有稳定的 Start→End 视觉锚点。  
2. **看不出先后**：语义时间轴不是竖直的；同深度节点 Y 差很大。  
3. **主路径被淹没**：happy path 与失败回环、条件支路抢同一走廊。  
4. **回边横切**：`feedback` / 失败回流从中部穿过主流程。  
5. **标签与线打架**：边文案可读性依赖局部 parking，结构一乱就更挤。

### 0.2 根因一句话

现有实现强于 **「给定位置后的正交连线质量」**，弱于 **「按依赖语义决定位置」**。  
拓扑序即便存在（Review `topoOrder`），也被映射成 **横向蛇形填格**，与人读 workflow 的 **纵向时间轴** 相反。

### 0.3 价值链

```text
Intent / Spec 边语义
  depends / conditional = 前进
  feedback / 失败回流   = 回边
        │
        ▼
  Semantic Layout Engine（本计划新增核心）
        │  rank(Y) · spine(X) · side lanes · containers
        ▼
  Node positions (+ optional virtual Start/End)
        │
        ▼
  既有 Port Assignment + Orthogonal Batch Routing（复用、加约束）
        │
        ▼
  Draw 可编辑画布 / Review 只读 Path Map / L2 Work Group 内图
```

---

## 1. 锁定产品决策

| ID | 决策 | 落地含义 |
|----|------|----------|
| **SL-D1** | **时间轴 = 上→下（TB）** | 语义先后映射为增大的 `rank` → 增大的 `y`；禁止把主流程排成左→右蛇形主轴 |
| **SL-D2** | **主路径 = 中轴脊柱** | happy path（无 `feedback`、优先 `depends` 链）居中；分支/并行向左右展开后 Join |
| **SL-D3** | **边角色分流** | 前进边偏好 `s→n`（或整体向下）；回边走 **侧廊**（左右外通道）再回到上游，禁止默认横切主脊柱 |
| **SL-D4** | **显式头尾** | Layout 产出虚拟或真实的 entry/exit 锚点视觉（可用现有无入边/无出边节点高亮，或轻量 Start/End chrome）；扫读 1 秒能定位起止 |
| **SL-D5** | **容器是布局单元** | Parallel / Loop / Work Group 先占矩形槽，再排内部；禁止「先散落再事后包虚线框」作为最终策略 |
| **SL-D6** | **`provides` 不进语义 rank** | 配置卫星跟随 Agent；TB 布局只消费 workflow 边（`depends` / `conditional` / `feedback` / `fallback`） |
| **SL-D7** | **Draw = 可选整理，非强制锁死** | 提供「按语义整理」动作；整理后仍可手拖；松手可继续用现有 snap/route。Review = 始终按语义布局（只读） |
| **SL-D8** | **不引入重型 ELK 依赖（MVP）** | 自研 Sugiyama-lite（分层 + 层内排序 + 坐标赋值）；P2 再评估 ELK/dagre 是否值得 |
| **SL-D9** | **复用现有绕线栈** | 位置算完后仍走 `assignLoopWorkflowPorts` + `routeAllLoopWorkflowEdges`；布局层通过 **端口偏好与廊道约束** 引导绕线，而不是重写正交引擎 |
| **SL-D10** | **L1 Work Group 例外保留** | L1 表面仍为 chip 矩阵（WG-D8）；**进入 L2 / 整图整理时** Work Group 作为复合节点参与 TB；L2 内部可再跑一次局部 TB |
| **SL-D11** | **三类几何角色** | 每个布局节点标为 `spine` \| `side` \| `parked`；坐标赋值按角色，禁止「同 rank 全体居中横铺」 |
| **SL-D12** | **孤立后置停放** | 与主 workflow 连通分量无边的 node / Work Group **不进主轴 rank0**；主轴排完后在右侧（或底部）空位放置 |
| **SL-D13** | **宁竖长、勿横乱** | 接受主轴纵向拉长；拒绝图二式底排多节点一字排开抢中轴 |
| **SL-D14** | **连线贴轴少折** | 脊柱前进优先短竖线 `s→n`；侧支/回边走左右廊；位置对了再喂现有正交 router |

### 1.1 图一（目标）vs 图二（现状整理）— 2026-11-14 实机对照

| 维度 | 图一（目标） | 图二（当前整理） | 算法含义 |
|------|--------------|------------------|----------|
| 主脊柱 | Planner→…→Create PR 近似共线竖直 | 无清晰中轴；底排横向拉开 | spine 节点强制共线 X |
| 同层 | 仅真正并行才并排 | 同 rank 全体居中横铺（Approval/Tests/Condition/Reviewer 五连坐） | 禁止整层 `spineX - totalW/2` 横铺 |
| 侧支 | Run Tests 在主轴左侧廊 | Tests 当同层兄弟拉宽 | `side` → corridorX |
| 孤立 WG | 无边 → 主轴排完后搁右侧空位 | 无入边 ⇒ rank0 与 Start 顶行并排居中 | `parked` 后置 |
| 长宽比 | 竖长可接受 | 横向膨胀 | SL-D13 |
| 连线 | 贴轴、少折 | 大 U 弯（位置差导致） | 先修点，再端口偏好 |

**反模式（必须从坐标层消灭）**：把「依赖深度相同」当成「必须水平并排且整层居中」。

---

## 2. 现状盘点：布局相关子系统（代码真相）

### 2.1 分层一览

| 层 | 模块 | 做什么 | 不做（缺口） |
|----|------|--------|--------------|
| **A. 节点落点（Draw）** | Palette drop / `addNodeAt` / authoring / 用户拖动 | 自由坐标写入 `node.position` | 无全局依赖分层 |
| **B. 局部对齐** | `snapGraphNodePosition`（`loopEdgeRouting.ts`） | 拖放松手时对齐邻接端口轴，减少微弯 | 不改拓扑顺序、不保证 TB |
| **C. 端口分配** | `loopPortAssignment.ts` | 多端口沿边滑动、Agent/菱形单槽、避免同槽进出 | 默认不偏好「前进向下」 |
| **D. 正交绕线** | `loopEdgeRouting.ts` | stub、候选正交路径、避障 clearance、圆角、标签 parking、交叉计数 | 假设位置已给定 |
| **E. 批量路由** | `loopEdgeBatchRouting.ts` | 全图 workflow 边统一分配端口+路径+lane nudge+标签去冲突 | 不移动节点 |
| **F. Review 自动布局** | `loopReviewLayout.ts` | `topoOrder` + **每行 5 列横向填格**；前进边 E→W；feedback 走北侧 | **主轴错误（横向）** |
| **G. Work Group** | `loop-work-group.ts` + store reflow / L2 layout | L1 chip 矩阵；L2 完整卡网格展开 | L2 网格 ≠ 语义 TB |
| **H. provides 装配** | `loopWiringVisuals.ts` / agent wiring | Agent 底栏卫星相对位置 | 与 workflow TB 解耦（应保持） |
| **I. Preset 种子** | `loop-presets.ts` | 创建节点时带调用方传入的 `position` | 无标准 TB 模板坐标合同 |

### 2.2 核心逻辑细节（现有）

#### 2.2.1 Review `layoutLoopReviewPath`（唯一接近「自动整理」的路径）

```text
topoOrder(nodes, forwardEdges=depends|conditional)
  → index → (col = index % 5, row = floor(index/5))
  → x = PAD + col*(W+GAP_X)
  → y = PAD + row*(H+GAP_Y)
routeForward: E → W（横向）
routeFeedback: N → N（上方折线）
groups: 事后 AABB 包 workgroup / parallel fan-out / feedback 边两端
```

**问题**：拓扑序被压成 **行优先横向蛇形**；前进边水平；与标准 workflow「时间向下」相反。

#### 2.2.2 Draw 拖放后的 `snapGraphNodePosition`

- 仅在邻接边存在时，把中心对齐到邻居中心轴（水平或竖直偏好由端口暗示）。  
- Snap 窗口 ≈ `LOOP_EDGE_ALIGN_SNAP * 3`。  
- **目的**：少弯；**不是**语义分层。

#### 2.2.3 `preferredPortsForPair` / `assignLoopWorkflowPorts`

- 优化目标：弯折数最少 + 不压节点 + 朝向中心。  
- Agent / Condition·Approval 菱形：每边单槽。  
- 矩形 Action/Human：多槽（左/右 3，上/下 4）。  
- **缺**：按 edge kind 的端口策略（前进强制南→北、回边强制侧廊）。

#### 2.2.4 `pickClearOrthogonalRoute` + batch

- 枚举 laneOffset 候选，选障碍穿透少、交叉少的路径。  
- 平行边 pair 做竖直 lane nudge。  
- 标签按长文案优先占座，再做 label↔wire / label↔label 分离。  
- **强项应保留**；布局升级后这些质量会「顺势变好」。

#### 2.2.5 Work Group

| 视图 | 布局 | 节点视觉 |
|------|------|----------|
| L1 | `layoutWorkGroupMemberMatrix` chip 矩阵，框 hug | icon+title chip |
| L2 | `layoutWorkGroupInteriorGraph` 完整卡网格（非 TB） | 与一级 Duty/Agent 卡相同 |
| 进出组 | join/leave + reflow；拖出冻结框 | 已单独修 stale draft 覆盖问题 |

#### 2.2.6 边 kind 与布局的关系（契约已有、布局未用满）

| kind | 语义 | 布局应有的几何角色（目标） | 现状 |
|------|------|---------------------------|------|
| `depends` | 前进依赖 | 主脊柱 / 并行层 | 当普通边绕 |
| `conditional` | 条件分支 | 主臂向下，次臂侧展 | 当普通边绕 |
| `feedback` | 回环 | 侧廊回边 | Review 仅北折；Draw 无廊 |
| `fallback` | 退化路径 | 侧支 | 未特化 |
| `provides` | 配置装配 | 不参与 rank；曲线卫星 | 已隔离（好） |

`suggestIntentEdgeKind` 已能从角色启发式推断 feedback/conditional——布局引擎应消费 **已解析 kind**，而不是再猜一遍。

---

## 3. 标准 Workflow Graph 可吸取的核心逻辑（图二）

| # | 原则 | 几何合同 | 对我们的映射 |
|---|------|----------|--------------|
| P1 | **时间向下** | `rank(u) < rank(v)` ⇒ `y(u) < y(v)`（前进边） | SL-D1 |
| P2 | **主脊柱居中** | happy path 的 `x` 靠近画布中线 | SL-D2 |
| P3 | **同层对齐** | 同 rank 节点共享基线 `y` | Sugiyama layering |
| P4 | **并行对称** | fork 子节点同 rank、左右铺开，再 Join | Parallel 容器 |
| P5 | **回边侧廊** | 回边先水平出主轴，再竖直，再回到上游；不穿主路径节点带 | feedback lane |
| P6 | **条件分流** | Condition：默认/happy 向下；备选向右（或左）进支路容器 | conditional ports |
| P7 | **容器成块** | Loop / Parallel / Conditional branch 虚线框是布局一级公民 | SL-D5 |
| P8 | **头尾锚点** | Start 顶、End 底 | SL-D4 |
| P9 | **标签服务决策** | 决策边短标签贴廊道外侧，不挡节点卡 | 复用 label parking + 廊道预留 |
| P10 | **线服从位** | 先排点，再连线；禁止用弯线「假装」有结构 | SL-D9 |

**反模式（图一常见，必须避免）**：

- 用交叉数量优化代替分层。  
- 把拓扑序铺成左右阅读主轴。  
- 回边与前进边共用中轴通道。  
- 容器只做事后描边。

---

## 4. Gaps 矩阵（现状 → 目标）

| ID | Gap | 现状 | 目标 |
|----|-----|------|------|
| G1 | 布局主轴 | Draw 自由；Review 横向蛇形 | 全产品 TB |
| G2 | 头尾 | 无强制锚点 | entry/exit 视觉合同 |
| G3 | 主路径 | 无 spine 分配 | happy-path 中轴 |
| G4 | 前进/回边 | 统一正交策略 | kind→廊道/端口策略 |
| G5 | rank 几何 | Review 有序无竖直分层 | rank→Y |
| G6 | 并行 | 事后 AABB | 同层对称 + Join |
| G7 | 容器 | 布局后包框 | 先占槽再排内部 |
| G8 | Draw 整理 | 几乎无全局整理 | 「按语义整理」一键 |
| G9 | Review 布局 | `ROW_MAX=5` 横向 | 复用同一 Semantic Layout Engine（只读投影） |
| G10 | L2 WG | 均匀网格 | 局部 TB（可选切片） |
| G11 | 端口偏好 | 最少弯折 | 前进 s→n 优先；回边 e/w 侧廊 |
| G12 | 与绕线协作 | 位置乱→绕线再勤也乱 | 位置对了，绕线质量放大 |

---

## 5. 目标架构

### 5.1 新模块（建议）

```text
projectos/workbench/src/components/LoopGraph/
  semanticLayout/
    types.ts                 # RankedNode, LayoutEdgeRole, LayoutContainer, ...
    graphModel.ts            # Intent/Spec → layout graph（剥 provides、标 edge role）
    layering.ts              # longest-path / network-simplex lite → rank
    crossingReduction.ts     # 层内排序（barycenter 迭代）
    coordinateAssign.ts      # rank→Y，spine/branch→X，容器框
    edgeRolePolicy.ts        # kind → preferred ports + corridor side
    applyLayout.ts           # 写回 position / 生成 ReviewLayout
    layoutLoopSemantic.ts    # 对外 API：layoutIntentGraphSemantic / layoutSpecSemantic
  semanticLayout/*.test.ts
```

Contracts 侧可选：`loop-semantic-layout.ts` 放 **纯函数、无 DOM** 的分层算法，便于 services/tests 共用；Workbench 只做尺寸估计与写回。

### 5.2 算法管线（Sugiyama-lite + 角色几何）

```text
1. Build layout graph
   - nodes: workflow nodes（可折叠 Work Group 为复合节点）
   - forward / back；ignore provides

2. Connected components
   - primary = 边最多 / 含主入口的分量
   - parked = 与 primary 无 workflow 边的节点/复合 WG（后置放置）

3. Layering（仅 primary）
   - 断开 back edges；longest-path rank
   - 孤立不得进入 primary rank0

4. Roles
   - spine = 最长 depends 链（happy path）
   - side = primary 内非 spine、但有边连到 spine/primary
   - parked = 步骤 2 的孤立集

5. Coordinate assignment（禁止整层居中横铺）
   - spine: 全部 centerX = spineX（共线）；y 按 rank
   - side: x = spineX ± CORRIDOR（左/右廊）；y 按 rank
   - 真正 parallel 兄弟：同层在 spine 两侧对称（少数）
   - parked: 主轴 AABB 右侧空位，不与 Start 并排抢中

6. Edge role → ports（可选迭代）
   - spine 前进 s→n；side/back 走廊道端口

7. Apply + 卫星 delta
```

### 5.3 与现有绕线栈的接口

| 现有 API | 布局升级后的用法 |
|----------|------------------|
| `assignLoopWorkflowPorts` | 增加 `preferredPortsByEdgeId` 输入（来自 edgeRolePolicy） |
| `routeAllLoopWorkflowEdges` | 增加可选 `corridorHints`（回边禁用穿越 spine 带） |
| `snapGraphNodePosition` | 保留；整理后拖动仍可用 |
| `layoutLoopReviewPath` | **改为调用** semantic layout，或薄封装删除横向逻辑 |
| WG matrix / L2 grid | L1 不变；整图整理时 WG 作复合节点；L2 可挂局部 semantic layout |

### 5.4 尺寸模型

布局必须使用与渲染一致的 AABB：

- Draw：`nodeBoxSize(..., { compactWorkGroupMembers: !focusedWorkGroupId })`  
- Review：可继续用紧凑 Path Map 尺寸，但 **坐标合同仍 TB**  
- Agent 含 wiring strip 高度；菱形用 measured/estimate diamond box  
- 卫星：跟随 Agent delta，不参与 rank

---

## 6. UX 合同

### 6.1 Draw

| 交互 | 行为 |
|------|------|
| 工具栏 / 命令「按语义整理」 | 对当前 draft（或 focused L2 子图）跑 semantic layout；可 undo（若已有 history则接入，否则至少 revision+1 可依赖后续编辑回退策略在实现切片定义） |
| 整理动画 | 150–300ms 位移动画；尊重 `prefers-reduced-motion`（瞬移） |
| 手拖 | 仍允许；不在每次 pointerup 强制全局重排 |
| 空图 / 单节点 | no-op 或仅居中 |

### 6.2 Review

| 交互 | 行为 |
|------|------|
| 进入 Review / 重新理解 | Path Map **始终** semantic TB |
| 只读 | 不可拖；点击选中逻辑保持 RV 计划 |
| 容器 | Parallel / Loop / Work Group 框与层对齐 |

### 6.3 识读验收（主观但可测）

1. 3 秒内指出流程起点与终点。  
2. 主成功路径可沿中轴用手指从上描到下，少穿越。  
3. 任一条 feedback 可指出其侧廊，且不穿过超过 1 个非相关节点 AABB（目标）。

---

## 7. 工作切片

### SL-0 · 基线与合同（0.5–1d）

- [ ] 固化本文 SL-D1–D10；补跨文档互链（Review / WG / Wiring）。  
- [ ] 冻结 fixture：图一样式「杂乱 Intent」（Planner→Human→Coder→Reviewer→Tests→Condition→Approval + feedback）。  
- [ ] 定义验收截图/坐标断言格式（rank 单调、spine 偏差、回边走廊）。

### SL-1 · Layout graph + layering 纯函数（1–2d）

- [x] `graphModel`：剥 provides、标 forward/back。  
- [x] `layering`：最长路径 rank；环处理（断 feedback）。  
- [x] 单测：链、菱形分支、带 feedback 的 HITL 环、双入口。

### SL-2 · 层内排序 + 坐标赋值（1–2d）

- [x] barycenter 排序；spine 贴中。  
- [x] `coordinateAssign`：按 spine/side/parked 赋 X（禁止整层居中横铺）。  
- [x] 连通分量 + 孤立后置；spine 捷径压缩。  
- [x] 输出 `Map<nodeId, {x,y}>` + roles。

### SL-3 · Review Path Map 切换到 TB（1d）

- [x] 重写/替换 `layoutLoopReviewPath` 横向蛇形。  
- [ ] groups 改为基于 rank/容器的框，而非纯事后 AABB（可先混合）。  
- [x] 更新 `loopReviewLayout.test.ts`；目视验收图一 fixture。

### SL-4 · Edge role → 端口/廊道（1–2d）

- [ ] `edgeRolePolicy` 产出 preferred ports。  
- [ ] 扩展 `assignLoopWorkflowPorts` / batch router 接受偏好与 corridor hint。  
- [ ] feedback 侧廊单测（不穿越 spine 带的软约束 + 统计）。

### SL-5 · Draw「按语义整理」（1–2d）

- [ ] store action `layoutDraftSemantically()`。  
- [ ] Overlay 命令/按钮 + i18n。  
- [ ] 卫星 delta 跟随；Work Group L1：整理时把组当复合节点，内部保持 chip 矩阵相对坐标或整组平移。

### SL-6 · 容器一级公民（1–2d）

- [ ] Parallel fan-out/fan-in 识别 → 同层槽。  
- [ ] Loop / feedback 对 → 侧廊预留宽度。  
- [ ] Work Group 复合节点高度 = L1 框高（整图）或展开 L2 TB（可选开关）。

### SL-7 · 抛光与文档（0.5–1d）

- [ ] reduced-motion；整理 busy 态。  
- [ ] DevPlan 勾选；Studio/Review 文档互链更新。  
- [ ] 非目标确认：未引入 ELK。

**建议落地顺序**：SL-0 → SL-1 → SL-2 → **SL-3（用户立刻在 Review 看见 TB）** → SL-4 → SL-5 → SL-6 → SL-7。

---

## 8. 验收矩阵

| # | 场景 | 期望 |
|---|------|------|
| A1 | 线性 depends 链 4 节点 | rank 0..3；y 严格递增；x 近似共线 |
| A2 | Condition 两路 conditional | 两子节点同层或分层清晰；主臂偏中 |
| A3 | Tests fail → feedback → Coder | 回边走侧廊；与主路径交叉 ≤ 阈值 |
| A4 | Parallel fan-out + join | 同层左右对称；虚线框包住并行带 |
| A5 | Work Group 在整图中 | 组框作为一块参与 TB；不拆散 L1 chip 合同 |
| A6 | Review 打开图一 fixture | 头在上尾在下；不再横向蛇形 |
| A7 | Draw 点「按语义整理」 | 位置更新；provides 卫星仍挂靠 Agent |
| A8 | 整理后手拖 + 连线 | 现有 router/snap 仍工作 |
| A9 | `provides` 很多 | rank 不受卫星数量影响 |
| A10 | reduced-motion | 无位移动画或时长≈0 |

---

## 9. 非目标

| 非目标 | 原因 |
|--------|------|
| MVP 引入 ELK/dagre/完整 Sugiyama network-simplex | 体积与调试成本；先自研 lite |
| Review 可编辑 / 写回 draft | 违反 RV-D1 |
| 每次 pointermove 全局重排 | 性能与可预期性差 |
| 用布局改写 edge kind / 编译语义 | 布局只消费契约 |
| 把 provides 画进 Path Map 主拓扑 | 装配噪音（RV-D6 / SL-D6） |
| 替换正交绕线引擎 | 复用 D/E 层，只加约束 |
| 强制用户不能手拖 | Draw 仍是作者ing 画布（SL-D7） |

---

## 10. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 手摆位置被「整理」毁掉 | 明确显式动作；后续可加整理前快照 / undo |
| 大图层内排序抖动 | 固定随机种子/稳定排序键（nodeId） |
| Agent 卡很宽导致层过高 | 层高按真实 `nodeBoxSize`；GAP_Y 随 maxH 自适应下限 |
| 回边过多挤爆侧廊 | 多回边分左右廊；超出则加 corridor index |
| WG 复合节点与 L2 两套坐标 | 文档化：整图复合 vs L2 局部 layout 互斥视图 |
| Review 旧测试绑死横向坐标 | SL-3 一并改断言为 rank/单调性 |

---

## 11. 常量建议（实现时可调）

| 常量 | 建议起点 | 说明 |
|------|----------|------|
| `SEM_GAP_Y` | 72–96 | 层间距（Review 可略紧） |
| `SEM_GAP_X` | 48–72 | 同层间距 |
| `SEM_CORRIDOR_W` | 64–96 | 回边侧廊宽度 |
| `SEM_SPINE_BIAS` | 居中 | happy-path x 贴 worldCenter |
| `SEM_BARY_ITERS` | 8 | 层内排序迭代 |
| `SEM_REVIEW_NODE` | 保持现有 148×40 或略增 | 只改坐标合同 |

---

## 12. 实现锚点（改造时对照）

| 文件 | 角色 |
|------|------|
| `workbench/.../loopReviewLayout.ts` | **优先替换**横向蛇形 |
| `workbench/.../loopEdgeRouting.ts` | 保留；或加 corridor 约束钩子 |
| `workbench/.../loopEdgeBatchRouting.ts` | 接受 port/corridor 偏好 |
| `workbench/.../loopPortAssignment.ts` | 接受 preferredPorts |
| `workbench/.../LoopGraphOverlay.tsx` | 整理命令入口；尺寸 opts |
| `workbench/.../loopGraphStore.ts` | `layoutDraftSemantically` |
| `contracts/loop-graph.ts` | edge kind 语义（只读消费） |
| `contracts/loop-work-group.ts` | 矩阵/框；复合节点尺寸 |

---

## 13. 变更日志

| 日期 | 说明 |
|------|------|
| 2026-11-14 | 初稿：盘点 A–I 子系统；锁定 SL-D1–D10；吸收标准 TB workflow 原则；Gaps G1–G12；Sugiyama-lite 管线；切片 SL-0–SL-7；验收与非目标 |
| 2026-11-14 | 落地：`semanticLayout/` 引擎；`layoutDraftSemantically`（L1 复合 WG）；L2 `layoutWorkGroupInteriorGraph` 改 TB；Review `layoutLoopReviewPath` 改 TB；Draw 顶栏整理按钮 |
| 2026-11-14 | 图一/图二实机对照：锁定 SL-D11–D14（spine/side/parked、孤立后置、宁竖长勿横乱、贴轴少折）；坐标层禁止同 rank 全体居中横铺 |
| 2026-11-14 | 实现：连通分量 primary/parked；spine 最长链 + 捷径压缩；side 左右廊；parked 主轴右侧停放；单测覆盖共线/孤立/侧支 |

---

## 14. 一句话收束

**先按语义把节点排成从上到下的时间脊柱，再让现有正交绕线去服务这条脊柱——而不是继续用聪明的线，去拯救没有时间方向的点。**
