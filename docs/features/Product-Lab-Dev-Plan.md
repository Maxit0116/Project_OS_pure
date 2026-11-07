# Product Lab Dev Plan

**状态**：Active revision（2026-11-06）— 主干 PL-0–PL-8 已落地；本轮修订 **主交互 → Chat Lab Card**、**Capability bootstrap（Marketplace + 网上搜索）**、**确认 Debug List**；实现与文档同步推进。  
**产品名**：Product Lab / 产品实验室（UI / 顶栏 / 文档统一；代码前缀 `lab` / `ProductLab`）  
**产品定位一句话**：独立的**体验调试模式**——用户从顶栏进入后直接使用正在开发的产品；系统/Agent 在体验中记录问题，用户在右栏 Lab Card 里审阅并确认 Debug List，再编排现有 Agent 修复与复验。它不是 Composer 里的一种对话 mode，也不以 prompt 为启动条件。  
**权威邻居**：

| 文档 | 关系 |
|------|------|
| [`Chat-Modes-Cursor-Parity-Dev-Plan.md`](./Chat-Modes-Cursor-Parity-Dev-Plan.md) | Lab **不**进入 `CHAT_MODES` / mode switch；与 Ask / Agent / Plan / Debug 分家 |
| [`Agent-Harness-Dev-Plan.md`](./Agent-Harness-Dev-Plan.md) | 修复仍走 Harness + Diff Review；默认不 YOLO 合入 |
| [`Live-Graph-Agent-Observability-Dev-Plan.md`](./Live-Graph-Agent-Observability-Dev-Plan.md) | Finding 投影到 Function Map 的样板（执行层叠加，不改架构拓扑） |
| [`Agent-Flow-Activity-Dev-Plan.md`](./Agent-Flow-Activity-Dev-Plan.md) | 修复 run 的文字活动流；Lab session 可链到同一 `agentRunId` |
| [`Loops-Graph-Workflow-Studio-Dev-Plan.md`](./Loops-Graph-Workflow-Studio-Dev-Plan.md) | 后期可将 Lab 旅程升格为 Loop preset；v1 **不**依赖 Loop Runtime |
| [`UI-Stencil-on-Capture-Dev-Plan.md`](./UI-Stencil-on-Capture-Dev-Plan.md) / Spatial Pin | **平行能力**：Pin = 视觉/设计细节；Lab = 行为/bug/流程摩擦 |
| [`MCP-Marketplace-Dev-Plan.md`](./MCP-Marketplace-Dev-Plan.md) | 可选接 ELU MCP 为社区/策展 listing；不阻塞本地 MVP |
| [`backend/Verification-Eval-Dev-Plan.md`](../backend/Verification-Eval-Dev-Plan.md) | 复验证据可挂 `VerificationEvidence`；v1 可用 Lab 内 journey 结果 |
| Product PRD / Full Architecture | Phase 5 observability 的本地入口；不替代生产级 telemetry 全方案 |

**实现锚点（规划）**：

| 层 | 预期落点 |
|----|----------|
| 契约 | `projectos/contracts/product-lab.ts`（新建） |
| 持久化 | `.projectos/lab/sessions/*.json` + `findings/*.json`（或单文件按 session 聚合） |
| 服务 | `projectos/services/product-lab/`（session / finding / handoff） |
| Store | `workbench/src/state/productLabStore.ts`（**独立于** `chatMode`） |
| 顶栏入口 | `layout/WorkbenchChromeActions.tsx`（替换 Terminal panel toggle） |
| 表面联动 | `browserStore` / `CenterPanel` Browser；`bottomDockStore` 按需；菜单 Terminal 保留 |
| Map 投影 | 扩展或旁路 Live overlay 思想；**不**写入 C4 架构边 |
| 修复移交 | 复用 `agent-orchestrator` + Diff Review（`change` / `debug` 管线） |

---

## 0. 核心诉求（讨论锁定）

| # | 诉求 | 本计划对应 |
|---|------|------------|
| 1 | 借鉴 ELU「运行时产品智能 + 自愈闭环」，但做成 Project OS **独立功能** | Product Lab 模式 + finding → fix → re-verify |
| 2 | 用户点击后启动正在开发的项目，**从头使用产品**找问题 | 零 prompt 启动；Browser/preview 编排 |
| 3 | 交互过程中记录 bug，再交给 agent 修改 | Finding 模型 + Handoff-to-Agent（默认需 Diff 确认） |
| 4 | 将来可用 agent **模仿用户**操作，达到类似效果 | Phase 2 Synthetic Driver；v1 不做 |
| 5 | **不要**做成 Composer mode；与 Agent mode 分家 | 不进 `CHAT_MODES`；顶栏唯一主入口 |
| 6 | Terminal 顶栏按钮让位；Terminal 只留菜单 New Terminal 等 | Chrome 替换 + `menu.terminal` / 快捷键保留 |
| 7 | 与 Function Map 绑定：scope、落点、验收看板 | Scope from selection；finding → `nodeIds`；投影 badge |
| 8 | 与 Spatial Pin 分工清楚 | Lab = bug/行为；Pin = 设计/视觉标注 |

**价值链**：

```text
顶栏 Lab icon（零 prompt）
    │
    ▼
右栏新建 Lab Chat Session + Lab Card（主交互面）
    │
    ├─► Capability bootstrap（若缺）
    │      Marketplace 检索 + Agent 网上搜索 MCP/skill/rules
    │      → 许可卡 → 用户允许后安装 → 用 capabilities 打开/运行
    ├─► 起/连表面：Browser（仅网页）/ Terminal / 外部 IDE·模拟器
    ├─► 用户体验产品（中栏尽量零 chrome）
    │         │
    │         ▼
    │    Findings 流入 Lab Card（自动 + Agent + 用户补记）
    │         │
    │         ▼
    │    用户确认 Debug List
    │         │
    │         ├─► Function Map 投影（nodeIds）
    │         └─► Handoff → 现有 Agent 管线 → Diff Review
    │                        │
    │                        ▼
    └────────────── 同旅程再验 ←──────────┘
```

---

## 1. 对 ELU Labs 的借鉴与边界

调研对象（2026-11）：

| 资产 | 形态 | 借鉴点 | 明确不照搬 |
|------|------|--------|------------|
| [elu.dev](https://elu.dev/) 产品 | 商业化产品智能 SaaS | 「体验 → 摩擦/bug → 路径到修复」叙事；隐私/masking 意识 | 不自研完整 session replay / heatmap / 云端 finding 引擎 |
| `@elu-labs/analytics-browser` | npm Browser SDK | 事件 / identify / replay / flags / 自建 `api_host` 的采集能力可作为 **Phase 2+ 可选后端** | v1 不强制装 ELU SDK；不把 site key 写进仓库默认配置 |
| `@elu-labs/cli` / `@elu-labs/mcp-setup` | 一键打 tag + 写用户级 MCP | 「编排入口简单」；MCP 密钥进用户配置不进 git | 不在 v1 自动改用户 `~/.cursor/mcp.json`；Marketplace 可选 listing |
| [ELU-Labs/dark-factory](https://github.com/ELU-Labs/dark-factory) | Prompt 工厂（Grok Bots + ELU） | **证据门禁**：真人/浏览器代理测 preview；finding → spec → build → accept → learn；Bots 电脑上的结果不算证据 | 不引入「无人写代码/无人 review」；不默认无限自愈；不绑定 Grok 生态 |
| `ELU-Labs/elu-ios` / `elu-android` | 移动 SDK 早期公开仓 | 长期多端预览可能 | v1 只做网页项目路径 |

**从 dark-factory 提炼的可迁移原则（写入本产品）**：

1. **证据外置**：本地 Agent 自述 ≠ 通过；Browser 旅程结果 / console / 网络失败才是 Lab 证据。  
2. **Accept 门禁**：修复候选要过「同旅程再验」，不只过类型检查。  
3. **Learn**：复现过的失败应沉淀为可再跑的 journey（v1 手动/半自动；后期场景库）。  
4. **Stop rules**：轮次、预算、Blocked / Needs human——对齐 Harness，禁止削弱验收以求通过。

**集成策略（锁定）**：

| 阶段 | 策略 |
|------|------|
| v1（本计划主交付） | **编排在己，发现做轻量本地**：console / 未处理 rejection / 失败 fetch / 用户「记一个问题」 |
| v1.5 | Function Map 投影完善；journey 复跑；可选 Playwright MCP 代点 |
| v2 | 可选 ELU SDK/MCP 作为深度 replay/finding 源；Marketplace listing |

---

## 2. 锁定决策（2026-11-05）

| # | 议题 | 锁定 |
|---|------|------|
| D1 | 名称 | **Product Lab**（对外）；代码 `lab` / `ProductLab` |
| D2 | 产品形态 | **独立模式**，不是 Chat Composer mode，不进入 `CHAT_MODES` / Shift+Tab 循环 |
| D3 | 主入口 | **仅顶栏 icon**（替换 `WorkbenchChromeActions` 中 Terminal panel toggle） |
| D4 | 启动仪式 | **零 prompt**：点击即进入 Lab、编排表面、开始体验；不先丢空 Chat 等用户打字 |
| D5 | 与 Agent mode 分界 | Agent/Change = 用户用 prompt 声明意图；Lab = 先当用户使用产品，系统长出 finding |
| D6 | Terminal 入口 | 顶栏移除 Terminal icon；保留 `menu.terminal`（New Terminal / Toggle / Split…）与既有快捷键 |
| D7 | 主壳 | **不**做独立大 Overlay；**主交互面 = 右栏 Lab Chat Session 内的 Lab Card**（对齐 Refinement/Plan 卡）。中栏/Browser **不再**贴 Lab chrome，留给纯体验。顶栏烧瓶仅入口 + badge |
| D8 | 表面路径 | **Web** → Browser preview；**可 Terminal 启动** → 底栏 Terminal + Agent；**需 Xcode/Android Studio/模拟器** → Capability bootstrap（见 D16）后再体验 |
| D9 | Function Map | Scope 默认来自当前选中节点（有则用 `preview.route`）；finding 带 `nodeIds[]`；投影叠加，不改 C4 拓扑 |
| D10 | 修复闸 | 用户在 Lab Card **确认 Debug List** 后，才对清单 handoff；Agent **自动提案**允许；**合入默认需 Diff Review / 人确认** |
| D11 | Spatial Pin | 平行能力；Lab 不复用 Pin 捕获流作为主路径（原生体验可用 Pin 补证据） |
| D12 | ELU | 可选增强，**非** v1 硬依赖 |
| D13 | Synthetic Agent 用户 | Phase 2+；网页可「Agent 代走」；原生依赖已装 MCP 能力 |
| D14 | 持久化 | 本地 `.projectos/lab/`；local-first；不默认同步云 |
| D15 | 右栏 Chat | Lab **不**进入 `CHAT_MODES`；启动时 **系统创建/聚焦 Lab 专用 Chat session 并插入 Lab Card**（零用户输入）。修复 handoff 可同 session 或 isolate Agent/Debug |
| D16 | Capability bootstrap | 启动检测缺口（IDE/模拟器 MCP、skill、rules 等）。检索顺序：**本机已装 → Marketplace catalog → Agent 网上搜索**。**主交互面 = Marketplace 中央悬浮窗内的临时「Lab 能力准备」页**（能力全景含已装 + 待许可安装清单）；Lab Card 仅作状态与重开入口。**必须用户许可**后才下载/安装。禁止静默装 |
| D17 | Debug List | 体验阶段 findings 可累计；「结束本轮体验 / 审阅」后用户勾选、补记、剔除，**确认 Debug List** 冻结清单再修 |

---

## 3. 非目标（MVP / v1）

| 项 | 原因 |
|----|------|
| 把 Lab 做成 `ChatSessionMode` / mode switch 一项 | 与 D2/D5 冲突；会逼用户先打 prompt |
| 独立 Lab 主工作台 / 完整 analytics dashboard | 重复 Browser + Chat；偏离体验优先 |
| 自研完整 session replay / heatmap / autocapture 平台 | 对齐 ELU 边界；成本过高 |
| 无人值守无限自愈 / 无 Diff 自动合入 | 与 Harness、可见可控冲突 |
| 照搬 dark-factory 全角色工厂 | 那是外部 Bot 编排；Project OS 用自身 Agent + Lab |
| v1 强制接入 ELU Cloud / 改用户全局 MCP 配置 | 可选后期 |
| v1 Agent 自动乱逛整站 | 无旅程约束易假阳性；放 Phase 2 |
| 静默安装网上搜到的 MCP/skill | 必须 Marketplace 临时页许可闸；无用户同意不写配置、不下载体 |
| 声称已驱动 Xcode/AS 但无可用 MCP | 诚实 `LAB_START_BLOCKED` + 手动打开指引 |
| 生产流量对比 / progressive deploy 门禁 | dark-factory 级；超出 IDE Lab |
| 用 Lab 替代 Debug mode | Debug = 已知症状根因；Lab = 使用中发现 |
| 把 Lab 做成中栏顶 chrome 主面 | 已废止 B1；改为 D7 Lab Card |

---

## 4. 与相邻功能的边界

```text
┌──────────────────────────────────────────────────────────┐
│ Product Lab · 体验中发现行为/流程问题 → 记 finding → 修 → 再验 │
├──────────────────────────────────────────────────────────┤
│ Spatial Pin · 屏幕框选 / 标注 · 设计与细节意图               │
├──────────────────────────────────────────────────────────┤
│ Debug mode · 已知报错/复现 → 假设 → 根因 → 定点修            │
├──────────────────────────────────────────────────────────┤
│ Agent (change) mode · 用户 prompt 驱动实现/改动              │
├──────────────────────────────────────────────────────────┤
│ Live Graph · Agent 执行投影到 C4（读写/测）                   │
│ Lab Overlay · Finding/旅程投影到 C4（摩擦/错误/已改善）        │
└──────────────────────────────────────────────────────────┘
```

| 能力 | 主证据 | 启动条件 |
|------|--------|----------|
| Lab | 操作旅程、console、失败请求、用户标记 | 顶栏；零 prompt |
| Pin | 截图、框选、stencil | Spatial Pin 按钮 |
| Debug | 堆栈、复现步骤、插桩 | Composer debug mode |
| Agent | 自然语言需求 | Composer change mode |

---

## 5. 对象模型

### 5.1 LabSession

```ts
type LabSessionStatus =
  | 'starting'      // 编排表面 / capability bootstrap
  | 'experiencing'  // 用户正在使用；findings 可流入
  | 'recording'     // 同 experiencing；强调采集开 / Agent 代走
  | 'triaging'      // 审阅 findings → 确认 Debug List
  | 'fixing'       // 已移交 agent（Debug List 内）
  | 'verifying'     // 同旅程再验
  | 'idle'          // 会话存在但未在跑
  | 'ended'

/** Lab Card 阶段（UI 主状态；可与 status 对齐） */
type LabCardPhase =
  | 'bootstrapping' // 能力缺口许可 / 安装 / 启动表面
  | 'experiencing'  // 请用户去体验；Card 实时列出已记 bugs
  | 'reviewing'     // 勾选/补记 → 确认 Debug List
  | 'fixing'       // 对清单 handoff / 复验

interface LabSession {
  id: string
  projectId: string
  status: LabSessionStatus
  /** Function Map node ids；空 = 全站/未绑定 */
  scopeNodeIds: string[]
  /** 网页 preview 入口 */
  previewUrl: string | null
  browserTabId: string | null
  /** 半自动采集开关 */
  capture: {
    consoleErrors: boolean
    unhandledRejections: boolean
    failedNetwork: boolean
    manualNotes: boolean
  }
  journeyId: string | null
  findingIds: string[]
  activeFixRunId: string | null
  createdAt: string
  updatedAt: string
  endedAt: string | null
}
```

### 5.2 LabFinding

```ts
type LabFindingKind =
  | 'manual'              // 用户点「记一个问题」
  | 'console_error'
  | 'unhandled_rejection'
  | 'network_failure'
  | 'friction'            // Phase 2：rage-click 等
  | 'journey_failure'     // Phase 2：脚本/Agent 旅程失败
  | 'external'            // Phase 2：ELU 等导入

type LabFindingStatus =
  | 'open'
  | 'dismissed'           // 预期行为 / 误报
  | 'handed_off'          // 已交给 agent
  | 'fix_proposed'        // 有 pending diff
  | 'fix_applied'
  | 'verified_fixed'
  | 'verified_still_broken'

interface LabFinding {
  id: string
  sessionId: string
  kind: LabFindingKind
  status: LabFindingStatus
  title: string
  detail: string
  /** C4 / Function Map；允许暂时为空（unmapped） */
  nodeIds: string[]
  /** 证据：截断后的 console、URL、status code、用户备注等 */
  evidence: LabEvidence[]
  /** 可选：发生时的路由 / 页面标题 */
  location: { url?: string; route?: string; title?: string }
  agentRunId: string | null
  createdAt: string
  updatedAt: string
}
```

### 5.3 LabJourney（v1 最小；Phase 2 加脚本）

```ts
interface LabJourney {
  id: string
  sessionId: string
  /** v1：人工「开始标记 / 结束标记」或隐式整段 session */
  kind: 'session_span' | 'scripted' | 'acceptance_derived'
  label: string
  startUrl: string | null
  steps: LabJourneyStep[]  // v1 可为空数组，仅保留 span 元数据
  lastResult: 'unknown' | 'passed' | 'failed' | null
}
```

### 5.4 与 Function Map 的映射规则

1. 启动时若 `selectedNodeId` 存在 → `scopeNodeIds = [selectedNodeId]`（可扩展祖先 container）。  
2. 若节点有 `preview.route` → 拼到 preview origin 作为初始 Browser URL。  
3. 无 route → 打开 preview 根路径，并在 Lab 条提示「未绑定预览路由」。  
4. Finding 产生时：优先用当前 Browser URL 匹配 `preview.route` / fileIndex；匹配失败则 `nodeIds = scopeNodeIds` 或 `[]`。  
5. 投影：节点级 summary（open count / primary kind），**永不**因 Lab 触发全图重布局。

---

## 6. 状态机与主路径

### 6.1 会话状态机

```text
(no session) --顶栏--> starting --> experiencing ←→ triaging
                              │                      │
                              │                      ├─ dismiss finding
                              │                      ├─ handoff → fixing
                              │                      │              │
                              │                      │              ▼
                              │                      │         verifying
                              │                      │           │    │
                              │                      │    fixed ─┘    └─ still_broken → triaging
                              │                      │
                              └──── 用户结束 ─────────► ended
```

### 6.2 用户主路径（v1 合格线）

1. 打开工作区与 Function Map（可选选中节点）。  
2. 点击顶栏 Lab icon。  
3. 系统：创建 `LabSession` → 确保 preview 可达 → `centerTab = browser` → 打开 URL。  
4. 用户从头使用产品；可随时「记一个问题」；自动捕获错误类事件。  
5. Findings 面板列出问题；可 dismiss 或「修复」。  
6. 「修复」→ 组装证据 + scope → 启动现有 Agent 管线（新建或附着 session，**系统生成任务说明**，用户仍可不先写 prompt）。  
7. Diff Review 确认后 apply。  
8. Lab 进入 verifying：提示用户再走相关路径；用户标记通过/仍坏，或半自动再抓同类错误。  
9. 顶栏再次点击或「结束 Lab」→ `ended`；Browser 可保留。

### 6.3 Agent 代操作路径（Phase 2，不阻塞 v1）

- 旅程来源优先级：节点 Acceptance artifact → 用户故事/responsibility → 用户确认的候选步骤。  
- 执行：Playwright MCP / Browser MCP；结果写入 `journey_failure` finding。  
- 同样走 handoff → Diff → 再验。

---

## 7. UI / 入口规格

### 7.1 顶栏（`WorkbenchChromeActions`）

**今日**：Spatial Pin（桌面）| Tree | **Terminal** | Chat | Account | Settings  

**目标**：Spatial Pin | Tree | **Product Lab** | Chat | Account | Settings  

| 属性 | 规格 |
|------|------|
| Icon | Lucide：`FlaskConical` 或 `Activity`（实现时定一，避开 Crosshair/Terminal/MessageSquare） |
| 无 session | 点击 → 创建并 `starting` |
| 有活跃 session | 点击 → 聚焦 Lab UI / Browser；二次确认或菜单项「结束 Lab」 |
| Badge | `open` findings 数量（>0 显示） |
| Active 态 | session 为 `experiencing` \| `recording` \| `fixing` \| `verifying` 时 `aria-pressed` |
| i18n | `topBar.productLab` / `topBar.productLabActive` 等；中英都要 |

**移除**：顶栏 Terminal `togglePanel` 按钮。  
**保留**：`appMenu` `menu.terminal` 全部项；`keyboardShortcutCatalog` terminal 组；`menuCommands` `terminal-*` / `toggle-bottom-panel`。

### 7.2 Lab Card（主交互面，右栏 Chat Session）

**锁定（2026-11-06，取代 B1）**：

- 点顶栏 Lab → 系统创建/聚焦 **Lab 专用 Chat session**（不进 mode switch）并钉住 **Lab Card**（样式对齐 `PromptRefinementCard` / Plan 卡）。  
- 中栏 / Browser **不**再挂 Session Bar；体验视口保持干净。顶栏烧瓶 badge 仍显示 open findings。  
- Card 分阶段：`bootstrapping` → `experiencing` → `reviewing` → `fixing`。

| 阶段 | Card 内容 | 用户动作 |
|------|-----------|----------|
| bootstrapping | 状态摘要 +「打开能力准备」；安装许可在 Marketplace 临时页 | 打开/重开 Marketplace 准备页；跳过并手动启动 |
| experiencing | 「先去体验产品」；实时 findings 摘要；补记入口 | 使用产品；可随时补记；「结束本轮体验」 |
| reviewing | 完整 findings；勾选进 Debug List；补记漏网 | 「确认 Debug List」 |
| fixing | Debug List + 逐条/批量修复 + 复验 ✓/✕ | 修复 / 忽略 / 在图上显示 / 结束 Lab |

**禁止**：全屏 Lab dashboard；中栏顶 chrome 抢体验空间；把 Lab 塞进 `CYCLE_CHAT_MODES`。

### 7.3 Capability bootstrap（Marketplace 临时页 + 网上）

```text
detectLabLaunchProfile
  → needsIdeCapabilities / capabilityNeeds[]（如 ios-simulator、android-emulator、xcode、android-studio）
  → 盘点本机已装（mcpServers / installed skills 关键词匹配）→ inventory ready
  → 全部 ready？→ 跳过准备页，直接 experiencing
  → 自动打开 Marketplace 中央悬浮窗 + 临时「Lab 能力准备」页
       ├─ 能力全景：本次任务全部 needs（含已装 ready）
       └─ 待安装清单：缺口候选（marketplace | web | builtin stub）+ Allow/Deny
  → Marketplace catalog 关键词检索（后台 enrichment，不阻塞页首屏）
  → Agent 网上搜索同主题 capabilities（GitHub / 文档 / npm MCP 等）
  → 用户在临时页允许 → installMcpFromCatalog / installSkillFromCatalog / installFromGitUrl
  → 「继续体验」关闭临时页 → Lab experiencing（Terminal / 非 Web 等按 profile）
```

规则：

1. **许可闸**：无用户在 Marketplace 临时页明确允许，不得下载、写 MCP 配置、改 skill 目录。  
2. **双通道检索**：Marketplace 不够时必须允许 Agent **网上搜索**并回填候选（含 gitUrl / 说明）。  
3. **诚实失败**：搜不到或装完仍无法驱动 IDE → 准备页 / Lab Card 显示手动步骤，不假绿。  
4. **Lab Card 不承载安装闸**：bootstrapping 只摘要进度并提供「打开能力准备」；主清单在临时页。

### 7.4 Findings / Debug List

- 体验中：自动 + Agent + 手动 → findings（可 dismiss）。  
- 审阅中：勾选构成 **Debug List**；可补记。  
- 确认后：仅清单内条目进入 handoff；每条 kind 图标、title、status、节点、「修复」「忽略」「在图上显示」。  

---

## 8. 表面联动

| 表面 | 行为 |
|------|------|
| Chat / Lab Card | **Lab 主交互面**（体验 / 审阅 / 修复）；bootstrap 时只作状态与入口 |
| Marketplace 临时页 | **能力准备主面**：能力全景（含已装）+ 待装许可闸 |
| Browser | **仅** `hasWebPreview` 时切换；非网页 **不**联动、不打开 Project OS 自身 localhost |
| Terminal | `needsTerminalStart` 且无需 IDE capabilities（或能力已就绪）时弹出并跑建议命令 |
| 外部 IDE / 模拟器 | `needsIdeCapabilities` → bootstrap 装 MCP/skill 后由 Agent/tools 打开；否则手动指引 |
| Services / preview | 复用现有能力；失败可见 |
| Function Map | 不强制切 tab；finding 投影；「在图上显示」时切 map |
| Composer mode switch | **永不**出现 Lab |

---

## 9. 切片（实现顺序）

> **本文件当前不授权编码。** Phase 0 关闭后按 PL-0 → PL-6 推进；PL-7+ 为增强。

### Phase 0 — 冻结检查清单（文档/产品）

- [x] 确认产品名文案（Product Lab / 产品实验室）  
- [x] ~~确认 Lab chrome 位置：B1~~ → **2026-11-06 修订为 Lab Card（D7）**  

- [x] 确认 finding 最小字段与证据截断上限（见 §5；detail ≤ 4k，evidence body ≤ 2k × 8）  
- [x] 确认 handoff：`console_error` / `unhandled_rejection` / `network_failure` → **debug**；其余（含 `manual`）→ **change**  
- [x] 本计划状态改为 Ready to implement  

### PL-0 — 契约与空壳存储

- `contracts/product-lab.ts` + zod  
- `.projectos/lab/` 读写服务（CRUD session/finding）  
- 单测：schema round-trip、路径安全  

### PL-1 — 顶栏入口与 Lab store

- `productLabStore`：create / focus / end  
- `WorkbenchChromeActions`：Terminal → Lab icon  
- i18n；桌面 compact title bar 同步  
- 验收：点击创建 session；菜单仍可开 Terminal  

### PL-2 — 启动编排（零 prompt）

- 解析 scope（selected node + `preview.route`）  
- 切换 Browser、打开 URL  
- preview 不可达时诚实错误态  
- Session 条最小 UI（状态 + 结束）  

### PL-3 — Finding 采集（半自动 + 手动） ✅

- 手动「记一个问题」  
- Browser guest 注入（`injectLabCapture`）：error / unhandledrejection / fetch+XHR 失败；经 console 前缀回传；宿主 dedupe  
- 另：webview `console-message` level=error、`did-fail-load` → network_failure  
- Findings 列表 + dismiss；证据截断与脱敏  
- **安全**：仅 console 通道前缀；无无界 eval；脱敏 Authorization/Bearer/token  


### PL-4 — Function Map 投影

- `nodeIds` 解析  
- 节点 badge / ring（Lab 专用 kind，避免与 Live Agent ring 语义混淆；可并排或优先级表）  
- 「在图上显示」  

### PL-5 — Handoff 修复

- Finding → 系统生成修复任务（含 evidence）  
- 调用现有 orchestrator；绑定 `agentRunId`  
- Diff Review 确认后更新 finding status  
- **不**自动 `permissions` 放宽；不写 Route ②  

### PL-6 — 再验与结束

- verifying 状态与用户确认 fixed / still_broken  
- 结束 session；badge 清零  
- Eval checklist（人工冒烟）  

### PL-7 — Journey / Synthetic（Phase 2） ✅

- Acceptance / responsibility / generic smoke → `buildLabJourneyPlan`  
- Lab 条「Agent 代走」→ Ask + Playwright MCP 提示词；解析 `JOURNEY_PASSED` / `JOURNEY_FAILED`  
- 失败写入 `journey_failure` finding  

### PL-8 — ELU 可选集成（Phase 2） ✅（MCP listing + external finding）

- Marketplace：`community.elu` → `https://elu.dev/api/mcp`（需 `elu_live_` key；默认 disabled）  
- Lab 条「记为 ELU」→ `kind: external` finding（本地桥；非自动拉云端）  
- 完整 `@elu-labs/analytics-browser` 嵌入仍可选，不阻塞 Lab  


---

## 10. 安全与隐私

| 项 | 要求 |
|----|------|
| 证据 | 截断；脱敏 token/cookie/Authorization；密码框内容永不进 finding |
| Browser hook | 最小权限；不开启无界 eval；遵循现有 webview / IPC 校验 |
| Secrets | 不把 ELU `elu_live_` 写入仓库；用户级 secret store |
| 自动修 | 默认人审 Diff；leaf-only write / 图 scope 不变量保持 |
| SSRF | preview URL 仅本地/已允许 origin（复用现有 browser/preview 策略） |

---

## 11. 验收（v1 合格线）

1. 顶栏无 Terminal icon；有 Lab icon；`Terminal → New Terminal` 仍可用。  
2. 无工作区时点 Lab → 诚实提示，不创建假 session。  
3. 有工作区时点 Lab → **无需输入 prompt** 即进入 Browser 体验态。  
4. 选中带 `preview.route` 的节点再开 Lab → 初始 URL 含该 route。  
5. 手动记问题 → finding 出现；可 dismiss。  
6. 触发可捕获错误（fixture 页）→ 自动产生 finding（若 PL-3 启用对应采集）。  
7. 「修复」→ 出现 Agent/Diff 路径；确认前不改用户文件。  
8. 再验可标记 `verified_fixed` / `verified_still_broken`。  
9. Lab **不**出现在 Composer mode switch / `CYCLE_CHAT_MODES`。  
10. Function Map 上对有 `nodeIds` 的 open finding 有可见投影（PL-4）。  

---

## 12. 测试策略

| 层 | 内容 |
|----|------|
| 契约 | zod 边界、枚举、截断 |
| 服务 | session/finding CRUD；handoff payload 形状 |
| Store | 启动/结束；badge count |
| UI | Chrome actions 无 Terminal、有 Lab；mode visuals 回归不含 lab |
| 冒烟 | checklist 见 §11；sample-graph-saas 作体验对象 |

---

## 13. 风险与开放问题

| ID | 风险 / 问题 | 倾向 |
|----|-------------|------|
| R1 | Browser 内错误采集实现难度与安全面 | PL-3 可先 **仅手动 finding** 达标，自动采集紧随 |
| R2 | preview 启动与 Lab 竞态 | 复用 Services/preview 状态机；失败可见 |
| R3 | Lab ring 与 Live Agent ring 抢视觉 | 分 kind；同时存在时 Inspector 分 tab |
| R4 | 用户期望「全自动修好」 | 文案强调提案+确认；设置里远期 auto-apply |
| R5 | ~~B1 vs B2~~ | **已决：Lab Card（D7）**；废止中栏 chrome 主面 |
| R6 | handoff 用 change 还是 debug | 按 finding.kind 分流（见 Phase 0） |
| R7 | 网上搜到恶意 MCP | 许可闸 + 展示来源 URL；优先 Marketplace 策展；git 安装走既有校验 |
| R8 | 原生无自动 capture | 体验阶段强调手动补记 / Spatial Pin；有 MCP 后再增强 Agent 代操作 |

---

## 14. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-11-05 | 初稿：汇总 ELU / dark-factory 借鉴、零 prompt 独立 Lab、顶栏入口、Function Map 绑定、与 Composer mode / Spatial Pin / Debug 边界；切片 PL-0–PL-8；**不授权立即开发**。 |
| 2026-11-05 | Phase 0 关闭：B1 chrome、中英名、handoff 分流、Ready to implement；开始 PL-0→PL-6。 |
| 2026-11-05 | PL-0–PL-6 主干实现：契约/`.projectos/lab/state.json`、顶栏 Lab 替换 Terminal、Browser Session Bar、手动 finding、handoff→Agent、Function Map badge；自动采集与 Synthetic/ELU 未做。 |
| 2026-11-05 | PL-3b/7/8：guest 自动采集、Agent 代走旅程、`community.elu` Marketplace listing、external finding 导入。 |
| 2026-11-05 | Launch profile：非网页不联动 Browser；Terminal + Agent 启动。 |
| 2026-11-06 | **修订 D7/D8/D10/D15–D17**：主交互 → Chat Lab Card；Capability bootstrap = Marketplace **+ 网上搜索** + 用户许可安装；体验后确认 Debug List 再修；废止 B1 中栏 chrome。 |
| 2026-11-06 | **D16 交互修订**：能力准备主面迁至 Marketplace 中央悬浮窗**临时页**（能力全景含已装 + 待装许可闸）；Lab Card bootstrapping 仅状态与重开入口。 |

---

## Appendix A — 讨论结论摘要

1. ELU = 运行时产品智能；Project OS = 图谱 IDE；Lab = 二者在本地开发期的桥。  
2. 独立 Lab，不进 prompt mode switch。  
3. 启动零 prompt；顶栏唯一主入口；Terminal 退回菜单。  
4. 真人体检是 v1；Agent 仿用户是增强。  
5. **主交互在右栏 Lab Card**；中栏留给产品体验；不需要独立大界面。  
6. 缺 Xcode/AS/模拟器等能力时：自动打开 **Marketplace 临时能力准备页**（全景含已装 + 待装许可）→ 网上搜索补候选 → 用户许可 → 安装 → 再启动。  
7. Findings 先体验累计，再确认 **Debug List**，然后 handoff。  
8. 修复走现有 Agent + Diff，不造第二套 runtime。  
