# Reminder Graph Dev Plan

**状态**：Implemented（2026-11-05）— RG-0–RG-10 已落地：Overlay / timeline.json / Sync / 拖动确认+offer / Composer / 全量 binding / 通知+digest / LLM 回写 eval / commitments / **语义状态色**（轴点·chip·左边条·过滤器微标）。  
**产品名**：Reminder Graph  
**产品定位一句话**：从 PRD / Dev Plan 持续提炼的**项目时间意识层**——纵向混合时间轴上展示门闩与延后事项，支持拖动重排与自然语言改轴（确认后回写文档 + `.projectos` context），并在到点/依赖满足时通知用户。  
**权威邻居**：

| 文档 | 关系 |
|------|------|
| [`Diagram-Graph-Dev-Plan.md`](./Diagram-Graph-Dev-Plan.md) | 同级 GraphOverlay + StageRail 接入样板 |
| [`Loops-Graph-UI-Visual-Authoring-Dev-Plan.md`](./Loops-Graph-UI-Visual-Authoring-Dev-Plan.md) | Composer Ask/Edit、`pendingGraphEditOffer` 确认流样板 |
| [`Session-Graph-Canvas-Dev-Plan.md`](./Session-Graph-Canvas-Dev-Plan.md) | 中窗互斥 overlay 模式 |
| Function Map / `.projectos/features.json` | Timeline 管「何时」；Function Map 管「是什么」——双写相位，不替代 |
| Diff Ready 通知 | 到点提醒复用 system / in-app banner 通道 |

---

## 0. 核心诉求（讨论锁定）

| # | 诉求 | 本计划对应 |
|---|------|------------|
| 1 | vibe coding 高频生成/改写 PRD、Dev Plan，容易忘记时间点与延后功能 | **Temporal Sync**：每日 + 文档变更驱动，抽取门闩/延后项进轴 |
| 2 | 需要一眼看到「现在 → 门闩 → 延后事项」 | **纵向 Timeline** + **当前时间线（Now）** |
| 3 | 用户可手动改顺序，且改序必须回到真相源 | **拖动 → 确认 → Agent 回写文档 + context** |
| 4 | 也可用自然语言改轴 / 加 deadline | **底部 Composer**（Ask / Edit，对齐 Loop） |
| 5 | 到点要打扰用户 | **通知**（系统通知 / 应用内 banner） |
| 6 | 与 Session / Loop 等 graph 平级入口 | **StageRail graphs 组** + `canvasOverlay: 'reminder'` |

**价值链**：

```text
docs/features/** PRD & Dev Plan     用户拖动 / Composer Edit
        │                                    │
        ▼                                    ▼
   Temporal Sync Agent ──upsert──► .projectos/timeline.json
        │                         （索引 = 可执行承诺）
        │                                    │
        │                         确认后双写 ◄─┘
        ▼                                    │
   Reminder Graph Overlay                    ▼
   (GraphOverlayFrame)              源文档段落 + features.json
                                             │
                                             ▼
                                    到点 / ready → 通知
```

---

## 1. 锁定决策（2026-11-05）

| # | 议题 | 锁定 |
|---|------|------|
| D1 | 名称 | **Reminder Graph**（UI / StageRail / 文档统一；代码前缀 `reminder` / `ReminderGraph`） |
| D2 | 轴语义 | **混合**：主序 = 相位序（phase slots）；条目可挂可选 `targetDate` / `dueAt` 作提醒触发与次级排序 |
| D3 | 回写范围 | **都要更新**：触及的 PRD/Dev Plan 段落 **+** `.projectos` context（至少 `timeline.json`；相位变更时同步 `features.json` 相关 planned 相位字段，若存在） |
| D4 | Milestone 完成 | **手动勾选 + 绑定事件**，两种方式都支持且**联动**（任一侧完成 → 另一侧反映；绑定源撤销则 milestone 回退除非用户 `waived` / 强制保持） |
| D5 | 多文档冲突 | **新文档优先 + 用户 pin 优先**；被覆盖的旧约束标 `conflict`，不静默删除 |
| D6 | Overlay 壳 | 复用 `GraphOverlayFrame`；与其它 center overlay **互斥**；**不** boot 自动恢复 |
| D7 | 危险写 | 拖动松手 / Composer Edit 均不静默落盘：确认意图 →（建议）文档 diff offer → Accept 才 apply |
| D8 | 用户 pin | 用户确认过的顺序/锚点带 `userPinned: true`；Temporal Sync **不得**擅自挪回 |
| D9 | 与执行引擎边界 | v1 **不**硬拦 Agent 开工未到点功能；可注入 commitments 到 context（RG-7）；硬门闩属后期 |
| D10 | Timeline 着色 | **状态/紧急度优先于种类色**；只用 tech status tokens；色必须配文案；禁止按 feature/source 彩虹着色或硬编码 hex |

---

## 2. 非目标（MVP）

| 项 | 原因 |
|----|------|
| 完整个人日历 / 多项目甘特 / ICS 同步 | 偏离「文档时间意识」 |
| 自动阻止 coding agent 开发未到点功能 | 见 D9；先提醒 + context |
| 替代 Function Map / `features.json` 故事结构 | 只双写时间相位，不重做功能树 |
| 替代 Loop 运行时 | Timeline 不管 runtime |
| 静默改用户 Dev Plan / PRD | 必须确认 |
| 云端多人协作时间轴 | 单工作区本地优先 |
| Boot 自动打开 Reminder Graph | 与其它 Graph 一致，session-ephemeral |

---

## 3. 对象模型

### 3.1 条目种类

| Kind | 含义 | 拖动 | 典型例子 |
|------|------|------|----------|
| `milestone` | 重要时间点 / 阶段门闩 | 默认锁定；改位走 Composer 或 modifier+确认 | MVP 验收、v1 推向市场、功能 X 完成 |
| `reminder` | 延后事项 / 时间承诺 | **主拖动对象** | 「Marketplace 在全部 MVP 验收后开发」 |
| `inbox` | 扫到但未挂轴的灵感/章节 | 不参与主轴排序；可「挂到某槽」 | 新建 PRD 尚未写相位 |

### 3.2 排序（混合轴）

1. **主序**：`phaseIndex`（整数槽位）。Milestone 占据槽位边界；Reminder 落在槽位之间或某 milestone 的 `after` / `before` 依赖上。
2. **次序**：同槽内按 `manualOrder`（用户拖定）→ 否则 `targetDate` 升序 → 否则 `updatedAt`。
3. **Now 线**：按「今天」切分视觉；无日期的相位项相对 Now 的 past/future 由依赖 milestone 的 `status` 推断（依赖未满足 = future；依赖已 passed 且自身未 done = ready/overdue 带）。

### 3.3 状态

**Milestone `status`**：`upcoming` | `due` | `passed` | `waived`

**Reminder `status`**：`parked` | `ready` | `snoozed` | `done` | `dropped` | `conflict`

**完成联动（D4）**：

```text
手动勾选 milestone = passed
    → 所有 dependsOn 该 id 且其它依赖已满足的 reminder → ready
    → 若有 binding，尝试标记绑定源（见 §3.4）或仅记录 manualCompleteAt

绑定源变为完成（tag / checklist / loop）
    → 对应 milestone → passed（bindingCompleteAt）
    → 同上传播 ready

绑定源撤销 / 删除
    → milestone 若无 manualCompleteAt → 回 upcoming
    → 已 ready 的 reminder 回到 parked（除非 userPinned 为 done）
```

### 3.4 Milestone 绑定（binding）

```ts
type MilestoneBinding =
  | { type: 'manual' } // 仅手动；仍可稍后加绑定
  | { type: 'git_tag'; tagPattern: string }
  | { type: 'feature_acceptance'; featureId: string } // features.json / 验收
  | { type: 'loop_run'; loopId: string; requireStatus: 'succeeded' }
  | { type: 'checklist'; docPath: string; headingAnchor: string }
```

MVP 至少落地：`manual` + **一种**自动绑定（优先 `feature_acceptance` 或 `git_tag`）；其余类型契约预留、UI 可显示「即将支持」。

### 3.5 冲突（D5）

当 Sync 发现：新文档将 reminder R 锚到「现在做」，但旧文档 / 旧索引仍写「MVP 后」：

- 采用**新文档**推断更新 `dependsOn` / `phaseIndex`
- 若条目 `userPinned`：保留用户锚点，新推断写入 `conflictNote`，`status: conflict`
- 旧 sourceRef 保留在 `supersededSources[]`，不删历史

### 3.6 持久化真相源

```text
.projectos/timeline.json          # Reminder Graph 索引（可执行承诺）
docs/features/**                  # 叙述与证据（Sync 读；确认写回）
.projectos/features.json          # 相位双写目标之一（若 feature 有对应 id）
```

**不变量**：Timeline 索引可独立渲染与提醒；文档是证据链。禁止每次打开都纯现场 regex 解析 Markdown 而无索引。

---

## 4. UI / UX

### 4.1 入口

- `WorkbenchStageRail` graphs 组新增 Reminder Graph 按钮（建议图标 `CalendarClock`）
- `CanvasOverlay` 增加 `'reminder'`
- 通知点击 → 打开 overlay 并 `focusItemId`
- （可选 Phase 后）Chat / Agent 卡片「在 Reminder Graph 查看」

### 4.2 Overlay 布局

```text
┌─────────────────────────────────────────────┐
│ Header: Reminder Graph · last synced · Sync │
├─────────────────────────────────────────────┤
│ Filters: All | Milestones | Reminders |     │
│          Overdue | Conflicts | Inbox        │
├─────────────────────────────────────────────┤
│ Vertical Timeline（满宽）                   │
│  ── Now ──                                  │
│  milestone  [行内展开: binding/sources/完成] │
│  reminder                                   │
│  reminder                                   │
│  milestone                                  │
├─────────────────────────────────────────────┤
│ ReminderGoalComposer                        │
│ [Ask|Edit] · Activity/Selection bookmarks   │
└─────────────────────────────────────────────┘
```

无常驻右侧 Inspector；选中行在 timeline 内 accordion 展开详情与动作。

### 4.3 当前时间线（Now）

- 视觉贯穿主列的强调线/条带
- 滚动时长轴过长时：Now 迷你指示保持可见，或 past 区可折叠
- 逾期 reminder 聚集在 Now 附近（醒目 chip），不沉底

### 4.4 拖动

1. 仅 `reminder` 默认可拖；`milestone` 锁定
2. 拖动中显示插入槽（两 milestone 之间 / 相对某 reminder）
3. **pointerup → 确认窗**（意图 diff 摘要：旧锚点 → 新锚点）
4. 用户确认 → busy → Agent 生成文档 + timeline + features 变更 offer
5. Accept → apply；Reject / 关闭 → 轴回滚到拖前快照

### 4.5 Composer

| Mode | 行为 |
|------|------|
| Ask | 解释依赖、为何 parked、今天能否开工；**不改**索引 |
| Edit | 增删改 milestone/reminder/日期/依赖；走与拖动相同的 offer → Accept |

对齐 Loop：`authoringBusy`、最近步骤条、Undo draft（可选 MVP 后）。

### 4.6 语义状态色（RG-10 / D10）

**理念**：颜色服务**注意力优先级**，不是「每类事件一种彩虹色」。主编码 = 状态/紧急度；辅编码 = 类型（轴点形状 + 轻量 accent，且不抢紧急色）。

**Tone 优先级**（`resolveReminderVisualTone`，展示层纯函数）：

| Tone | 条件 | Token |
|------|------|-------|
| `conflict` | `reminderStatus === 'conflict'` | `--tech-error` |
| `ready` | `reminderStatus === 'ready'`（即使日期已过仍为 success；与 overdue **过滤器**可同时命中，但视觉不并入 due） | `--tech-success` |
| `due` | milestone `due`，或日期逾期（`dueAt`/`targetDate` &lt; now 且未终态） | `--tech-warning` |
| `done` | milestone `passed` / `waived`；reminder `done` / `dropped` | muted + 降对比 |
| `inbox` | `kind === 'inbox'` | warning 轻量 |
| `neutral` | 其余 parked / snoozed / upcoming | muted / 默认边框 |

**三通道（克制）**：

1. **轴点**：按 tone 填色；milestone 可用菱形区分类型；仅当 tone 为 `neutral`/`done` 时 milestone 可用 accent 点缀，紧急 tone 覆盖填色  
2. **Status chip**：文案保留；chip 用 `color-mix` 对齐 Loop 的 success/warning/error 样式  
3. **左侧 2–3px 色条**：仅 `conflict` | `due` | `ready`  

另：Past 区行整体降饱和/opacity；过滤器 Overdue / Conflicts 带同色微标记。禁止硬编码 hex、整行大面积染色、按 featureId/source 着色、闪烁动画。色盲友好：文案始终可见（色不是唯一通道）。

---

## 5. Temporal Sync Job

### 5.1 触发

| 触发 | MVP |
|------|-----|
| 每日（用户本地时区；优先「当日首次打开 Project OS」） | ✅ |
| `docs/features/**` 等文档变更 debounce | ✅ |
| Header「Sync now」 | ✅ |
| git tag / merge 后 | 可选 Phase 后 |

### 5.2 Agent / 管道职责

1. 枚举候选文档（PRD、`*Dev-Plan*`、用户配置的 glob）
2. 抽取：延期约束、阶段门闩、验收条件、明确日期、依赖句式
3. **增量 upsert** 到 `timeline.json`；尊重 `userPinned` / `locked`
4. 标记 `conflict`；填充 `inbox` 未挂载项
5. 写短 `lastSyncChangelog` 供 Header / toast 展示

### 5.3 安全

- Sync **只更新索引与 inbox**，不直接改写用户 Dev Plan 正文（正文改写仅来自用户确认的拖动/Edit）
- 解析失败 → 该项进 inbox 或跳过并记 warning，不炸整个 job

---

## 6. 通知

复用 Diff Ready 通道哲学：

| 条件 | 通道 |
|------|------|
| 窗口失焦 | 系统通知 |
| 窗口聚焦且不在 Reminder Graph | 应用内 banner |
| 已在 Reminder Graph 且 focus 该条 | 可抑制或降级为行内脉冲 |

**事件**：milestone `due` / 变 `passed`；reminder → `ready`；每日 digest；持续 `conflict`。

**动作**：打开 Graph + focus；打开源文档；Snooze（1d / 1w / until milestone）。

无绝对日期的相位 reminder **不**靠日历闹铃，靠 milestone 状态变化或 digest。

---

## 7. 架构与关键路径

```text
StageRail → ReminderGraphOverlay (GraphOverlayFrame)
                │
                ├─ reminderGraphStore (Zustand)
                ├─ contracts/reminder-graph.ts
                ├─ services/reminder-graph/
                │     sync-service.ts
                │     rewrite-agent.ts   # 确认后的文档+features 回写
                │     binding-watch.ts   # milestone 绑定轮询/事件
                │     notify.ts
                └─ persistence: .projectos/timeline.json
```

| 层 | 路径 |
|----|------|
| 契约 | `projectos/contracts/reminder-graph.ts` |
| 服务 | `projectos/services/reminder-graph/*` |
| Store | `projectos/workbench/src/state/reminderGraphStore.ts` |
| UI | `projectos/workbench/src/components/ReminderGraph/*` |
| Overlay 槽 | `chatSessionStore` `CanvasOverlay: 'reminder'` |
| StageRail | `layout/WorkbenchStageRail.tsx` |
| i18n | `locales/en.ts` / `zh.ts` → `chat.reminderGraph.*` |
| 通知 | 扩展或并列于 `notifications/diffReadyNotification*` |

---

## 8. 里程碑

| ID | 范围 | 验收要点 |
|----|------|----------|
| **RG-0** | Overlay 壳：`CanvasOverlay: 'reminder'`、StageRail 按钮、空态 Overlay、`reminderGraphStore` stub、i18n | 可开关；与其它 Graph 互斥；不 boot 恢复 |
| **RG-1** | Zod 契约 + `timeline.json` 读写 + mock fixtures | 合法文档可 hydrate；非法拒绝 |
| **RG-2** | 纵向 Timeline UI：milestone/reminder 行、Now 线、过滤器；详情行内展开（无常驻右侧 Inspector） | 混合轴可视化；past 可折叠；选中行展开 binding / sources / 完成动作 |
| **RG-3** | 拖动 reminder + 确认窗 + 回滚；Apply 管线（先写索引，Agent 回写文档/features） | 拒确认不改文档；接受后 source 更新 |
| **RG-4** | `ReminderGoalComposer` Ask/Edit + edit offer | 自然语言可加 deadline / 改依赖 |
| **RG-5** | Temporal Sync（日触达 + 文档 debounce + Sync now） | 给定含「MVP 后再做 X」的 Dev Plan → 轴上出现条目 + sourceRef；pin 不被覆盖 |
| **RG-6** | Milestone 手动完成 ↔ binding 联动；ready 传播；通知 | 勾选后依赖 reminder → ready 并通知 |
| **RG-7** | 把当前有效 commitments 注入 Agent/Harness context | coding agent 开干前能看见门闩 |
| **RG-8** | 测试 + 本文件状态更新 + MVP 验收清单打勾 | 见 §9 |
| **RG-9** | loop_run + checklist binding；每日 digest；LLM rewrite eval 门闩 | 四种 binding 均可自动完成；本地日切 digest；弱模型输出回退启发式 |
| **RG-10** | 语义状态色：tone 映射 + 轴点/chip/左边条/过滤器微标；Past 降饱和 | conflict/due/ready 可一眼扫出；无硬编码 hex；色+文案 |

**建议实现序**：RG-0 → RG-1 → RG-2 → RG-5（先有数据）→ RG-3 → RG-4 → RG-6 → RG-8；RG-7 可并行或紧随 MVP；RG-10 在 RG-2 行内展开之后。

---

## 9. MVP 验收清单

1. StageRail Reminder Graph 图标切换中窗；与 Session/Loop/Diagram/GitHub/Marketplace 互斥。
2. Overlay 使用 `GraphOverlayFrame`；底部有 Composer。
3. `.projectos/timeline.json` 为索引真相源；Refresh/Sync 可更新。
4. 给定含「MVP 后再做 X」的 Dev Plan，Sync 后出现对应 reminder + MVP milestone，且有 `sourceRefs`。
5. 拖动 X 到 MVP 前 → 确认 → 文档相应段落与 timeline（及可解析到的 features 相位）更新；拒绝则全回滚。
6. 用户 pin 的顺序在下一次 Sync 中不被无故覆盖。
7. Now 线正确分割；逾期态可见。
8. Composer Edit：「添加 YYYY-MM-DD 冻结日」→ 出现 milestone（经确认）。
9. 手动勾选 milestone 完成 → 依赖 reminder 变 `ready` 并通知（或进入可测的 notify sink）。
10. 绑定源完成（`git_tag` / `feature_acceptance` / `loop_run`→complete / `checklist` 全勾）→ 同一 milestone 变 `passed`，与手动路径联动一致；binding-only 可在源撤销时回退。
11. 新旧文档冲突 → `conflict` 可见，不丢旧 source。
12. Overlay 不在 boot/项目打开时自动恢复。
13. 每个本地日历日至多一次 digest（有 ready/due/conflict/overdue 才打扰）。
14. LLM 回写经 eval 门闩：弱输出 / prompt 泄漏回退启发式，不强行落盘。
15. ✅（RG-10）Timeline 行 `data-tone` 反映 conflict / due / ready / done / inbox / neutral；轴点与 chip 使用 tech status tokens；Overdue/Conflicts 过滤器有同色微标；无硬编码状态色。

---

## 10. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Sync Agent 胡写索引 | Zod 校验；pin 保护；changelog 可审；正文不由 Sync 改 |
| 拖动与日历日期语义打架 | 主序强制相位；日期只触发提醒与次排序 |
| 回写破坏 Dev Plan 结构 | offer 展示 diff；限制改写范围到锚定段落；失败可 undo 索引快照 |
| 通知过吵 | digest 合并；Settings 开关；已 focus 抑制 |
| 与 Function Map 双写不一致 | 相位字段契约明确；写失败标 conflict，不假装成功 |
| 绑定轮询耗电/吵 | 事件驱动优先（打开项目、git 变更、features sync）；少用高频 poll |

---

## 11. 测试策略

| 层 | 内容 |
|----|------|
| 契约单测 | Zod round-trip；排序；ready 传播；冲突合并；pin 保护 |
| 服务单测 | Sync upsert；rewrite apply/rollback；binding 联动 |
| UI 测 | Overlay 空态/互斥；拖动确认取消回滚（可测 store）；Composer mode；`resolveReminderVisualTone` 优先级；行 `data-tone` 静态渲染 |
| 通知测 | 通道选择与抑制条件 |

---

## 12. 开放但可延后

| 项 | 说明 |
|----|------|
| 全部 binding 类型 UI | MVP 一种自动 + manual；其余契约预留 |
| Hard gate 拦 Agent | RG-7 context 注入后评估 |
| Chat 内 ReminderSummaryCard | 对齐 DiagramSummaryCard |
| 多工作区统一轴 | 非目标 |

---

## 13. 实现备注（给 Agent）

- 遵循 tech theme tokens；无 glass。
- 用户可见文案走 i18n（en/zh）。
- 图标仅 `lucide-react`。
- Mock 模式必须可演示完整轴（fixtures），不依赖真实 LLM 才能打开 Overlay；Sync/Rewrite 在 mock 下返回确定性结果。
- 改 `CanvasOverlay` 时同步：`overlayState` 派生 boolean、`WorkbenchStageRail`、`AppShell` 挂载 Overlay、相关 test。
)
