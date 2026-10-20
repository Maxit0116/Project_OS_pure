# Session Navigator：会话内 Turn 导航轨

**状态**：M0–M2 implemented（2026-10-20）。  
**范围**：Workbench AI Chat sidebar 当前 session 内的 turn 级大纲导航——竖向 marker rail、hover/focus 预览、点击跳转、滚动同步高亮、Prev/Next / 回到最新键盘导航；M1 密度与高亮；M2 状态点、可搜索 prompt index、预览跳转 Agent Flow。  
**产品定位一句话**：用用户意图（user prompt）当章节标题，把长 transcript 变成可一跳到达的目录；不新增存储模型，不替代跨 session 的 Chat History。  
**实现锚点**：
- `ConversationNavRail.tsx` + `conversationNavTurns.ts`
- 挂载：`ChatPanel.tsx`（`messagesShell` overlay + `data-message-id`）
- 快捷键目录：`keyboardShortcutCatalog.ts`（Chat 组：Prev/Next/Latest + Search）

**权威交叉引用**：
- [`Chat-Modes-Cursor-Parity-Dev-Plan.md`](./Chat-Modes-Cursor-Parity-Dev-Plan.md) — Ask / Agent / Plan / Debug 共用同一消息列表；本轨跨 mode 生效
- [`Agent-Flow-Activity-Dev-Plan.md`](./Agent-Flow-Activity-Dev-Plan.md) — 侧栏活动缩略与 Agent Flow 悬浮窗；本轨挂 **user turn**，不把 activity / tool 升为顶层 marker
- [`Live-Graph-Agent-Observability-Dev-Plan.md`](./Live-Graph-Agent-Observability-Dev-Plan.md) — 空间执行投影；与 session 内文字大纲正交
- Chat 消息与会话：`projectos/contracts/chat-session.ts`、`ChatPanel.tsx`、`chatSessionSync.ts`
- UI 语言：`.cursor/skills/ai-devtool-ui/references/chatgpt/principles.md` — 借清晰与克制，不 1:1 抄 ChatGPT

**对标说明（非复制清单）**：
- ChatGPT **Work** / Codex 桌面端有 conversation navigation rail：按 user turn 挂 marker，点击跳转；active 应随滚动同步（上游曾有不同步 bug，本计划验收显式规避）。
- 官方 [Get started with ChatGPT Work](https://learn.chatgpt.com/docs/get-started-with-work) 讲任务委托与产出，**几乎不写** rail UX；hover 预览多为社区期望形态。本产品按开发者长会话需求设计，不宣称「严格复刻官方文档」。

**明确不做 / 不复制**：
- 不为每条 assistant / thinking / tool / Agent 活动单独占顶层 marker
- 不把本轨做成跨 session 历史（那是 Chat History）
- M0 不做语义搜索、可过滤 prompt index、marker 状态色点、从预览直接 fork / restore
- 不新增后端字段、不改变 `ChatMessage` / session 持久化形状（M0–M1）
- 不在窄侧栏再吃固定内容宽度（rail 必须 overlay）

---

## 0. 产品分界（本文锁定）

| 表面 | 职责 | 不职责 |
|------|------|--------|
| **Session Navigator（本计划）** | 当前 session 内 user-turn 大纲、预览、跳转、键盘移动 | 跨 session 列表；活动证据详情 |
| **Chat History** | 切换 / 归档 / 重命名会话 | session 内滚动定位 |
| **Agent Activity 缩略行** | 某一轮里发生了什么（Thinking / Read / Edited…） | 代替 turn 目录 |
| **Session Graph / fork / checkpoint** | 分支与恢复点 | 日常「我刚才说了哪句」导航 |

**锚点单位**：每个非空 `role === 'user'` 消息 → 一个 marker。该 turn 下的 assistant 回复、Agent 活动、Plan 卡、Debug 条都算「这一章的内容」，不升顶层。

**交互契约**：

| 行为 | 规范 |
|------|------|
| 布局 | 贴消息滚动区（`.messages`）右缘 overlay；宽度约 8–12px；不挤气泡内容 |
| Hover / focus | 浮层向左展开：用户原文截断约 80–120 字；可选副信息（相对时间、当前 `chatMode`） |
| Click | 平滑滚到对应用户消息；`block: 'start'` + sticky header 偏移，目标落在可读区顶部（避免落在 composer 附近） |
| Active | 「距视口顶部最近的 user turn」高亮；点击跳转后**立即**同步；手动滚动持续更新 |
| 显示条件 | user turn ≥ 3 **且** 消息区可滚动（内容溢出）时显示；否则隐藏 |
| 键盘（M0 必须） | Prev user turn / Next user turn / 回到最新；建议键位 `Alt+↑` / `Alt+↓` / `Alt+End`；须登记进快捷键面板与 i18n；实现期可微调键位但不得默默无文档 |

```text
Messages viewport                         Nav rail
┌─────────────────────────────┐          │
│ [User] Investigate auth …   │◄──────── ●  Investigate auth…
│   activities / assistant    │          │
│ [User] Implement refresh …  │◄──────── ◉  Implement refresh…  ← active
│   … long reply …            │          │
│ [User] Compare designs      │◄──────── ○  Compare designs
└─────────────────────────────┘          │
```

---

## 1. 证据级现状

| 能力 | 现状 | 代码锚点 |
|------|------|----------|
| 消息列表与稳定 id | 有；`messages.map` 用 `msg.id` | `projectos/workbench/src/components/ChatPanel/ChatPanel.tsx` |
| 滚动容器 | `.messages`：`flex: 1; overflow: auto` | `ChatPanel.module.css` |
| User / assistant 气泡 DOM | 有；**无** `data-message-id` 导航约定 | 同上 |
| Session 内 turn 导航 / rail | **无** | — |
| 跨 session 历史 | 有 | `ChatHistory/` |
| 消息级 fork | 有 | `forkSession(activeSessionId, msg.id)` |
| Conversation checkpoint restore | 有（挂在带 `checkpointId` 的消息上） | `restoreConversationCheckpoint` |
| Agent 活动按 message 归组 | 有 | `activitiesForMessage` / `anchorMessageId` |
| 全局快捷键体系 | 有 | `appMenu/`、`keyboardShortcuts` i18n |

**差距一句话**：数据与 `message.id` 已够做纯前端导航；缺的是 rail UI、滚动同步、键盘与 a11y。

---

## 2. 原则

1. **User-intent first。** 顶层目录只反映用户发言；过程噪音留在章节内部（活动缩略 / Agent Flow）。
2. **导航不是新存储。** M0 只读现有 `messages`；预览由 `content` 截断生成，不写库。
3. **位置诚实。** Active marker 必须与视口一致；跳转对齐顶部可读区——显式规避 ChatGPT Work / Codex 已暴露的两类坑（active 卡住、目标贴底）。
4. **侧栏克制。** Overlay + 阈值显示；短对话不出现 rail。
5. **可发现。** 键盘进快捷键面板；marker 可聚焦；预览对键盘 focus 同等可用。
6. **与现有动作正交。** Fork / checkpoint / 打开 Agent Flow 不塞进 M0 预览菜单。

---

## 3. 交互与组件契约（实施时）

### 3.1 组件

| 项 | 约定 |
|----|------|
| 组件名 | `ConversationNavRail` |
| 路径 | `projectos/workbench/src/components/ChatPanel/ConversationNavRail.tsx` + `ConversationNavRail.module.css` |
| 挂载 | `ChatPanel` 消息区：容器 `position: relative`；rail `position: absolute` 贴右 |
| 锚点 DOM | user 消息根节点设置 `data-message-id={msg.id}`（或稳定 `id`）；供 jump / IntersectionObserver 使用 |
| Turn 列表 | `messages.filter(m => m.role === 'user' && m.content.trim().length > 0)` |
| 预览文案 | 确定性截断（空白折叠）；spatial-pin 等特殊内容取可读摘要，避免整段 JSON |

### 3.2 Active 与跳转

- Active：`IntersectionObserver`（推荐）或 scroll 监听，计算距滚动容器顶最近的 user 锚点。
- Jump：`element.scrollIntoView({ block: 'start', behavior: 'smooth' })`，并补偿 Chat 顶栏 / context header 高度；`prefers-reduced-motion: reduce` 时用 `auto`（M1 打磨可接受，M0 至少不破坏可读）。
- 点击后先设 `activeMessageId`，再滚，避免动画期间高亮仍停在最新 turn。

### 3.3 键盘

| 动作 | 建议键位 | 行为 |
|------|----------|------|
| Previous user turn | `Alt+↑` | 跳到当前 active 之上一条；已在首条则 no-op 或轻微反馈 |
| Next user turn | `Alt+↓` | 跳到下一条 |
| Jump to latest | `Alt+End` | 跳到最后一条 user turn（或滚到底并激活最新） |

- 仅在 Chat 侧栏聚焦 / 会话表面活跃时响应，避免与编辑器、图谱快捷键冲突。
- 登记：`keyboardShortcuts`（或等价菜单命令）+ `en.ts` / `zh.ts`。

### 3.4 无障碍

- 每个 marker：原生 `<button>`，`aria-label` 含预览截断或「User message N」。
- 预览：`role="tooltip"` 或等价；不靠仅颜色区分 active。
- 键盘可到达整个 rail（Tab 或 roving tabindex，二选一写进实现 PR）。

### 3.5 主题

- 使用 `--tech-*` token；无 glass / blur。
- Marker 默认/hover/active 对比清晰；浮层用 elevated 表面 + 短阴影。

---

## 4. 里程碑

```text
M0  NavRail MVP（markers + 预览 + jump + scroll-sync + 阈值 + 键盘 + a11y + i18n）
 │
 ▼
M1  密度与打磨（100+ turn 压缩、跳转后短暂高亮气泡、motion、快捷键冲突实测）
 │
 ▼
M2  状态与检索（marker 状态点、可搜索 prompt index、可选链到 Agent Flow activity）
```

### M0 — NavRail MVP（首发）

**目标**：长 session 内任意已加载 user turn 一次点击或一次快捷键到达。

**包含**：
- [x] `ConversationNavRail` 挂载于消息区右缘 overlay
- [x] User-turn markers；显示条件：≥3 user turns **且** 容器可滚动
- [x] Hover/focus 用户原文缩略预览
- [x] Click jump + 顶部对齐；active 立即正确
- [x] 手动滚动时 active 跟随
- [x] 键盘 Prev / Next / 回到最新 + 快捷键面板登记 + i18n
- [x] Marker a11y（`aria-label`、可聚焦）
- [x] 纯前端；无 `contracts` / 持久化变更

**不包含**：assistant marker、搜索 index、状态色点、fork/restore 入口。

**验收**：
- [x] 短会话（&lt;3 user turn 或未溢出）不渲染 rail（逻辑 + 单测）
- [x] 点击 marker → 对应用户气泡在可读区顶部；active 与目标一致
- [x] 滚动全程 active 不卡在「最新」
- [x] 三条快捷键在 Chat 表面可用，且可在快捷键 UI 中发现
- [x] 无新后端字段；session 快照形状不变
- [x] 单测：turn 过滤、预览、active 计算、显示阈值（`conversationNavTurns.test.ts`）

### M1 — 密度与打磨

- [x] 高密度策略：**比例定位**（`markerTopPercent`）；≥40 turn 启用 `railDense` 更小 hit；每条 turn 仍可点（不做分段折叠）
- [x] 跳转后目标气泡短暂高亮（`flashTurnHighlight` + `.navFlash`）
- [x] `prefers-reduced-motion`：滚动 `auto`、缩短高亮、CSS transition 关闭
- [x] 快捷键守卫：仅 Chat 面板 armed/聚焦时响应；与全局 ⌘ 系、图谱键分离（Alt 修饰）

### M2 — 状态与检索

- [x] Marker 轻量状态点：running / checkpoint / error（优先序 error → running → checkpoint；读 `AgentActivity` + `checkpointId`）
- [x] 可搜索 prompt index（rail 顶 Search + `Alt+Shift+F`）
- [x] 预览内「打开活动」→ 已有 `presentAgentFlow` / `setSelectedActivityId`

### 明确不做（本计划完成定义之外）

- 跨 session 全局「所有 prompt」搜索产品化（属 Chat History / 另开计划）
- 把 rail 做成第二套 Session Graph
- 为预览持久化单独索引表

---

## 5. 切片依赖

```text
M0 纯 UI 导航（可独立合入）
 │
 ▼
M1 打磨（依赖 M0 DOM 锚点与 active 模型）
 │
 ▼
M2 状态点与搜索（依赖 M0 turn 列表；状态点可读 AgentActivity / checkpoint）
```

M0 不阻塞 Live Graph / Agent Flow；M2 若链到 activity，只读已有 `anchorMessageId`。

---

## 6. 代码触点（实现启动时）

| 区域 | 路径 |
|------|------|
| 新组件 | `projectos/workbench/src/components/ChatPanel/ConversationNavRail.tsx` + `.module.css` |
| 挂载与锚点 | `ChatPanel.tsx`、`ChatPanel.module.css`（`.messages` relative；user 行 `data-message-id`） |
| 消息类型 | `workbenchStore` / `contracts/chat-session.ts` 的 `ChatMessage`（只读） |
| 快捷键 | `appMenu/` 或 Chat 局部 `keydown`；`i18n` `keyboardShortcuts` / `chat.nav*` |
| 测试 | `ConversationNavRail.test.tsx`（及必要时 ChatPanel 轻量集成） |

---

## 7. 测试与验收（汇总）

### 行为

- [x] 仅 user、非空 content 产生 marker
- [x] 显示阈值：turn 数与 overflow 同时满足才出现
- [x] Jump 顶部对齐；active 点击后与滚动中均正确
- [x] 预览为用户原文截断，不含整段 assistant
- [x] 键盘路径可用；焦点不在 Chat 时不误触（armed / contains 守卫）
- [x] 不渲染 glass；token 来自 `--tech-*`
- [x] M1 比例密度 + 跳转高亮 + reduced-motion
- [x] M2 状态点 + 搜索 index + 打开活动

### 回归

- [x] Fork / checkpoint / Agent 活动缩略 / mode 切换 / 复制按钮路径未改契约
- [x] rail overlay 不抢消息区布局宽度；搜索面板 Esc 可关

---

## 8. 决策记录

1. **锚点 = user turn，不是每条气泡。** 开发者记住的是自己的指令，不是工具噪声。
2. **Hover 预览默认用户原文。** 需要看 AI 长回复时跳转后向下读即可。
3. **键盘进 M0。** 长回复场景下 prev/next turn 与点击同等重要。
4. **显示阈值 = 3 turns 且可滚动。** 避免短对话装饰性 UI。
5. **M0 零契约变更。** 证明导航是视图能力，不是数据模型能力。
6. **不 1:1 抄 ChatGPT Work。** 借 rail 心智；状态点、搜索、与 Agent Flow 联动按 Project OS 差异化放在 M2。
7. **M1 密度 = 比例定位，不做分段折叠。** 每条 user turn 始终可点；≥40 turn 缩小 marker（`NAV_DENSE_TURN_THRESHOLD`）。
8. **M2 状态优先序：error → running → checkpoint。** 只读已有活动与 `checkpointId`。
9. **搜索快捷键 `Alt+Shift+F`。** 与 M0 的 `Alt+↑/↓/End` 同属 Chat 作用域，避免 ⌘ 冲突。

---

## 9. 下一步

本计划 M0–M2 已落地。后续若要跨 session 全局 prompt 搜索或更强的密度分桶，另开计划。

文档路径：`docs/features/Session-Navigator-Dev-Plan.md`  
重大偏离先更新「决策记录」再改代码。
