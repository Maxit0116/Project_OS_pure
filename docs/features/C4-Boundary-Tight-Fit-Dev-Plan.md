# C4 总体框随节点紧贴伸缩

**状态**：Draft  
**范围**：C4 画布上的虚线总体框（`c4Boundary`，例如「情侣打卡与兑奖」）  
**配套**：[`C4-Node-Drag-Live-Edge-Routing-Dev-Plan.md`](./C4-Node-Drag-Live-Edge-Routing-Dev-Plan.md)  
**不改**：框的标题与描述文案、框内成员资格的判定来源、WorkGroup 的创建与拖拽

---

## 1. 目标

框内节点不能被拖到虚线框外面。用户继续往外拖时，框的宽高在当帧跟着变，节点始终留在框内。

框不能只放大不缩小。节点改朝别的方向移动时，每一侧边到「该侧最靠边的节点」的空隙保持在固定限度内。松手或继续拖回来之后，不应留下一大块没有节点的空白。

框本身不可拖。它的矩形完全由当前成员节点的位置推导。

---

## 2. 现状

虚线框是 `C4Boundary`：`id`、`label`、`description`、`position`、`width`、`height`。画布上注册为 `c4Boundary`，`draggable: false`，`pointerEvents: none`，标题画在框的顶带（`BoundaryShape`）。

尺寸只在布局阶段确定：

- ELK 把框内节点放进 compound node，padding 来自 `layoutWithElk.ts` 的 `BOUNDARY_PAD`（左 56、右 56、上 72、下 48）。
- ELK 失败时用成员包围盒再加同一组 padding。
- `expandIfCramped` / `separateNodesForLabels` 在推开节点后会按同一规则重算单框。

用户拖节点时，overlay 只改节点坐标（见配套计划）。框的矩形仍是上次布局的结果，所以会出现两种错位：节点画出框外，或者节点聚拢后框里空出一大块。

成员集合在 `layoutWithElk` 里按「节点矩形落在框内」划分；划空时退回「非外部系统、非人物」的容器/组件/代码/数据存储。框外节点（图右侧伸出的外部系统）不参与框的尺寸。

---

## 3. 行为

1. 成员节点可以朝任意方向拖。拖出当前虚线边时，框的对应边立刻外移，节点与该边之间留下固定 padding，节点不会出现在框外。
2. 同一时刻只动被拖节点碰到的那一侧。往右拖只拉右边界；左边界仍贴着当前最左的成员。
3. 节点往回拖、或拖向另一侧时，不再被内容撑住的那一侧在同一帧收回。收回后，该侧空隙仍等于 padding，而不是停在历史最大尺寸。
4. 每一侧的空隙都有上限，上限就是该侧 padding。不存在「先拉大、再在对面留出无内容区域」的状态。
5. 框外节点的拖动不改变框。把框外节点拖进虚线范围内也不会把它收编为成员。
6. 多个框（组件图、代码图各有自己的 boundary）各自只包自己的成员，互不影响。
7. 刷新后框的大小与当前节点坐标一致，不单独保存框的宽高。

「任何节点到其最远框边的距离有限度」落成下面的不变量，而不是给每个节点单独设一个到四边的最大距离（那样会把框压成节点本身的大小）。空区只允许出现在 padding 带里；节点之间的间隔是内容，不是空框。

---

## 4. 不变量

对每个总体框、每一侧 `S ∈ {left, right, top, bottom}`：

```
gap(S) = 该侧框边 到 该侧最外成员外缘 的距离
gap(S) = PAD_S
```

因此：

- 框宽 = 最右成员右缘 − 最左成员左缘 + PAD_left + PAD_right
- 框高 = 最下成员下缘 − 最上成员上缘 + PAD_top + PAD_bottom
- 框左 = 最左成员左缘 − PAD_left
- 框上 = 最上成员上缘 − PAD_top

`PAD` 继续用现有 `BOUNDARY_PAD`（上边更大，留给标题「情侣打卡与兑奖」和描述）。把它提成 `c4/boundaryFit.ts` 的导出常量，`layoutWithElk.ts` 改为引用同一份，避免布局与拖动两套空隙。

无成员时保持布局给出的框，不缩成 0。

---

## 5. 纯函数

`fitBoundaryToMembers(boundary, members, pad) -> { position, width, height }`

- `members` 是该框的成员矩形，不含框外节点。
- 与拖动方向无关。每次用全量成员重算，所以放大和收回是同一条公式，框不会记住历史最大宽高。
- 输入成员为空时返回原框。

`membersOfBoundary(boundary, nodes)` 只在**进入视图、布局完成**时算一次，得到稳定的 `memberIds`。拖动过程中不再用「是否仍在框内」重新划分，否则节点一顶到边上就会被当成框外节点，框就不再跟着它走。

划分规则与 `layoutWithElk` 对齐：优先采用布局阶段已经放进该 compound 的节点；若调用方只有几何，则用布局结束时的包含关系做一次快照。不要在 `pointermove` 里重新分类。

---

## 6. 和拖动的衔接

顺序固定：

1. 应用被拖节点的新坐标（配套计划的 `livePositionsById`）。
2. 用该坐标加其余成员的当前坐标调用 `fitBoundaryToMembers`。
3. 把得到的 `position/width/height` 写进对应 `c4Boundary` flow 节点的 `position`、`style.width/height`、`initialWidth/initialHeight`。
4. 再按新的节点矩形做连线重算。框矩形不进入路由障碍。

松手后同样重算一次，与最终节点坐标一起进入渲染。只持久化节点坐标。下次进入视图时：ELK（或已有布局）→ overlay 覆盖节点 → `fitBoundaryToMembers`。这样即使用户把节点拖得很开再拖回来，重新打开也不会残留大空框。

拖动中不要跑 ELK，也不要调用 `expandIfCramped`。那条路径会按比例放大所有节点间距，和「只动被拖节点」冲突。

---

## 7. 实现切片

1. 新增 `projectos/workbench/src/components/FunctionMap/c4/boundaryFit.ts` 与单元测试。导出 `BOUNDARY_PAD`、`fitBoundaryToMembers`。
2. `layoutWithElk.ts` 的手写包围盒分支改为调用 `fitBoundaryToMembers`，删除本地重复的 padding 加减。
3. 画布在 C4 布局快照应用到 flow 节点之前，对每个 boundary 套一次 fit。成员 id 挂在该次布局结果上（ref 即可，不必写入 graph）。
4. `onNodeDrag` / 拖动结束在更新 live 坐标之后更新框节点尺寸。框节点保持 `draggable: false` 与 `pointerEvents: none`。
5. 最小尺寸：沿用现在的下限（宽不少于 280、高不少于 200）只作为无成员或单节点时的地板。有成员时以不变量为准；若 padding 后仍小于地板，在不破坏 `gap(S) = PAD_S` 的前提下不再额外灌空区——地板仅用于空成员。

---

## 8. 不做

- 不让用户单独拖框的边或角。没有成员移动，框就不该变。
- 不把框外节点自动吸进框，也不把成员拖远后改 `parentId`。
- 不把框的宽高写入 overlay 或 `graph.json`。
- 不处理 WorkGroup。WorkGroup 仍是地图工件上的编组，拖组时成员平移，那是另一套交互。
- 不在框伸缩时重排未被拖动的节点。

---

## 9. 验收

- 拖动「情侣打卡与兑奖」框内任一节点越过右（左、上、下）边时，该边跟着外移，节点始终在虚线之内，标题仍在顶带内。
- 将该节点拖回，刚被拉出的那一侧在同一拖动手势里收回。松开后，该侧空隙等于 `PAD`，而不是停留在拖动过程中的最大宽度。
- 只向右拖时，左边界位置不变（仍等于最左成员左缘减 `PAD_left`）。
- 所有成员聚拢后，框内除节点间距和四边 padding 外，没有额外的大块空白。
- 拖动框外节点，框的位置和大小不变。
- 刷新后框贴合 overlay 里的节点坐标，不需要另存框尺寸。
- 连线在框变化的同一帧按配套计划更新，且不会为了躲开虚线框而绕路。

---

## 10. 测试

- 两个成员：向右移动右边成员，左边界不变，右边界 = 新右缘 + `PAD_right`，宽随之增大。
- 再把该成员移回原处，框矩形与移动前完全一致。
- 向上移动最上成员后移回，高度不保留历史最大值。
- 三个成员只移动中间那个、且未成为新的极值时，框矩形不变。
- 空成员返回原框。
- 框外矩形不参与计算，即使它的坐标落进框的几何范围。
- `layoutWithElk` 现有「单框包住内部节点」的断言仍然成立，padding 数值与 `BOUNDARY_PAD` 一致。
