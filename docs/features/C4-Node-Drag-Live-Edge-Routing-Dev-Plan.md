# C4 节点自由拖拽与连线实时重规划

**状态**：Draft  
**范围**：Function Map 的 C4 画布（Context / Container / Component / Code）  
**配套**：[`C4-Boundary-Tight-Fit-Dev-Plan.md`](./C4-Boundary-Tight-Fit-Dev-Plan.md)  
**不改**：边的语义数据（`label` / `purpose` / `technology` / `evidence` / `sequence`）、ELK 初次布局、WorkGroup 与地图便签的拖拽

---

## 1. 目标

用户可以自由拖动 C4 图上的功能节点。拖动过程中，与该节点相连的折线以及折线上的文案按现有正交路由规则同步重算：

- 连线和文案不压住其他节点，也不压住其他连线文案。
- 连线之间尽量少交叉。交叉是软约束，避让节点和文案优先。
- 允许一条连线有多个拐弯。
- 松手后位置记住，刷新或重新进入同一层级后仍在拖过的位置。

总体框（图中「情侣打卡与兑奖」那种虚线框）的伸缩由配套计划负责。本计划只保证：节点位置一变，路由输入里的矩形就是最新矩形。

---

## 2. 现状

| 事实 | 位置 |
| --- | --- |
| C4 功能节点 `draggable: false` | `FunctionMapCanvas.tsx` 里 `c4Shape` 节点 |
| 非 C4 功能节点同样不可拖，注释写明位置由布局拥有 | 同文件 `type: 'feature'` |
| 拖拽结束时已有一段逻辑：把功能节点位置写入 `layoutRef.positionsById`，并调用 `upsertC4LayoutPositions` | `onNodesChange` 的 `position` 分支 |
| 这段逻辑对 C4 节点不会发生，因为节点不可拖 | 同上 |
| 拖动中 `onNodeDrag` 只处理地图工件和 WorkGroup，功能节点直接 return | `onNodeDrag` |
| 正交路由 `routeAllOrthogonalEdges` 已经实现端口分配、多拐弯、障碍避让、文案占位、交叉软惩罚、`resolveOverlayConflicts` | `c4/orthogonalRoute.ts` |
| 画布上的边在 `flowEdges` 的 `useMemo` 里，用布局快照 `positionsById` 调用上面的函数 | `FunctionMapCanvas.tsx` |
| 用户拖过的坐标存在 `localStorage` 键 `projectos:c4-layout-overlay:${projectId}`，按 `level::scope::nodeId` 覆盖 ELK 坐标 | `c4/c4LayoutOverlay.ts` |

因此缺的不是一套新路由算法，而是把「拖动中的实时坐标」送进现有算法，并让 C4 节点真正可拖。

拖动结束分支里用的是固定 `NODE_WIDTH` / `NODE_HEIGHT`。C4 节点尺寸来自 `c4Node.width/height`，这条分支若原样套到 C4 上，避让和落点都会偏。

---

## 3. 行为

1. C4 视图下，功能节点（`c4Shape`）可拖。虚线总体框、层带保持不可拖、不可选。
2. 按下并移动时，节点跟指针走。不把节点吸回网格，也不在拖动中重跑 ELK。
3. 每一帧（合并到 `requestAnimationFrame`）用当前所有节点矩形重算受影响的边。
4. 松手后跑一次完整 `routeAllOrthogonalEdges`，再把该节点坐标写入布局快照和 overlay。
5. 只有被拖节点的坐标改变。其他节点保持不动。
6. 框外节点（外部系统、人物）同样可拖，规则相同。它们不因此变成框内成员。
7. 拖动节点时不改变边的选中、时序抽屉、或边的 `sequence` 数据。
8. 搜索变暗、层级聚焦过渡进行中时，保持现有不可交互状态，不额外开放拖拽。

非 C4 的分层架构视图不在本计划内。那些功能节点继续由层带布局拥有位置。

---

## 4. 路由契约（沿用，不改评分）

拖动期间和松手时都调用现有 `routeAllOrthogonalEdges`（或它的增量包装），输入改为**当前帧矩形**，而不是布局快照：

- `nodes`：每个可见功能节点的 `{ id, x, y, width, height }`，宽高用 C4 节点实测尺寸。
- `obstacles`：全部节点（函数内部已把节点当障碍）。
- `reservedLabels` / `foreignWires`：本帧已经排好的其他边，避免文案叠文案、文案压线。
- 文案盒子继续走 `fitEdgeLabel` + `formatC4EdgeLabel`。密集图（边数 > 8）维持现在的 `tech` 紧凑文案。
- 端口仍是四边固定槽位（左右 3、上下 4）。
- 折线允许多个拐点。评分顺序维持源码里的约定：硬拒绝压住节点 / 文案 / 他线，拐点数量优先于交叉数，交叉只加软惩罚。

不新写一套折线算法。若现有算法在极端密图上仍有残留重叠，记为既有路由质量问题，不在本功能里放宽「不许压节点、不许压文案」的硬约束。

---

## 5. 实时计算

`routeAllOrthogonalEdges` 会对全图做端口分配、逐边搜索和最多 10 轮文案消冲突。图一密，每像素都跑全图会卡。

策略：

1. **拖动中**：用 `requestAnimationFrame` 合并指针事件。每帧只把「端点包含被拖节点」的边标成脏边，对其重跑 `buildOrthogonalRoute`。未脏边的折线和文案矩形冻结，作为 `foreignWires` 和 `reservedLabels`。
2. 脏边重算后，对脏边再跑一轮与冻结边的消冲突（复用 `resolveOverlayConflicts` 的判定，范围限于脏边）。
3. **松手**：对当前全部矩形跑一次完整 `routeAllOrthogonalEdges`，端口和车道按终态重分配。
4. 若某一帧增量路由仍超过约 16ms，丢掉本帧中间结果，下一帧用最新坐标重算，不排队补历史帧。

坐标来源：拖动过程中以 React Flow 节点的实时 `position` 为准，写入一个仅存于画布的 `livePositionsById`。`flowEdges` 在存在 live 坐标时用它，否则用 `positionsById`。不要每帧写 `localStorage`。

总体框矩形不作为连线障碍。连到框外节点的线可以穿过虚线边，这是现在的行为。

---

## 6. 实现切片

1. **纯函数** `liveRouteFrame`（建议放在 `c4/liveEdgeRoutes.ts`）  
   输入：节点矩形、边说明、上一帧路由、脏节点 id 集合、`mode: 'incremental' | 'full'`。  
   输出：`Map<edgeId, OrthogonalRouteResult>`。  
   不读 store，不碰 DOM。

2. **打开拖拽**  
   `useC4Visuals && c4Node` 时 `draggable: true`。聚焦过渡把节点设为 `visibility: hidden` 时保持不可拖。

3. **拖动中**  
   `onNodeDrag` 识别 C4 功能节点（不是工件、不是 WorkGroup、不是 `c4Boundary`），更新 `livePositionsById`，调度一帧增量路由。  
   拖动开始时取消会清掉边选中的 pane-click 计时器，避免松手被当成点空白。

4. **松手**  
   完整路由。用该节点真实宽高做 `separateFromObstacles`（若仍需躲开 WorkGroup；C4 虚线框不参与推开，伸缩见配套计划）。  
   写入 `layoutRef.positionsById` 与 `upsertC4LayoutPositions`。  
   清空 `livePositionsById` 中该节点，让后续渲染回到快照。

5. **边的渲染**  
   `C4OrthogonalEdge` 继续吃路由结果。拖动中不要让 React Flow 用直线把正交结果盖掉。若库在拖动时改写连接点，以我们算出的 `path` 为准。

6. **尺寸**  
   拖动结束和路由输入都使用 `c4Node.width/height`（或 flow 节点 measured 尺寸），不再用 `NODE_WIDTH` / `NODE_HEIGHT` 代表 C4 节点。

---

## 7. 不做

- 不重跑 ELK，不因为拖动而推开其他节点。
- 不提供折线控制点的手工编辑。
- 不把坐标写进 `graph.json`。继续用现有 per-project overlay。换项目、清站点数据会回到自动布局。
- 不改边的生成、标签文案规则、时序图。
- 不让总体框可拖。框如何跟着成员变大变小见配套计划。

---

## 8. 验收

- 拖动任意 C4 节点，相邻折线在移动过程中跟着改道，松手后不再闪回旧路径。
- 拖过节点后，连线不穿过其他节点盒子，文案不盖住节点，文案不互相重叠。做不到零交叉时，交叉应少于「始终走两点间一条斜线」。
- 一条边可以出现两个以上拐点。
- 松手后刷新页面，节点仍在松手位置，边按该位置重算。
- 只拖一个节点时，其他节点坐标不变。
- 拖动不关闭已打开的边详情；点空白仍按现有逻辑取消选中。
- 密集图拖动时指针不持续落后于节点超过一帧的合并窗口。若增量路由超时，表现为少跳帧，而不是整页卡死。

---

## 9. 测试

- `liveEdgeRoutes`：两节点一条边，移动源节点后路径端点落在新矩形上；中间节点挡在直线上时路径绕开该矩形；第二条边的文案矩形不与第一条重叠。
- 增量模式：只移动一个节点时，不与它相连的边的 `points` 保持上一帧引用或坐标不变。
- `full` 模式与直接调用 `routeAllOrthogonalEdges` 的结果一致（同一输入）。
- 画布层：C4 节点 `draggable === true`；`c4Boundary` 仍为 false。拖动结束调用 overlay 写入的是 C4 宽高下的落点，而不是 `NODE_WIDTH` 常量推算的落点。
- 现有 `orthogonalRoute.test.ts` 保持通过，不改硬约束用例的期望。
