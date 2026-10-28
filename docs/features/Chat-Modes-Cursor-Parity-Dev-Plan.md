# Chat Modes：对标 Cursor 的差距与桥接计划

**状态**：Implemented（M0–M3 mode 层切片，2026-10-19；打磨：测试 / Custom Mode badge / Ask 多轮 / Plan 回读）  
**范围**：Workbench AI Chat sidebar 的 Ask / Change(Agent) / Plan / Debug / Anchored，以及 mode 切换、上下文隔离、Custom Modes  
**权威交叉引用**：
- `agent-requirements.md` — 图作用域 agent、leaf-only write、诚实 pipeline（D1–D3 / E / F）
- `docs/features/Agent-Harness-Dev-Plan.md` — Agent Harness 总地图（ToolPolicy、sandbox×approval、与 Cursor/Codex/Devin 差距）
- `docs/AI-Devtool-UI-Gap-and-Target.md` — 聊天表面视觉语言
- Cursor 公开文档：Ask / Agent / Plan / Debug / Custom Modes（skill-as-mode）

**明确不复制**：
- 不引入「模型可自行扩大写权限」的 Cursor 式开放 Agent
- 不放弃图 scope / leaf-only write / 服务器授权（`agent-requirements` Part 5 不变量）
- 不把 Anchored、功能地图绑定当成错误；它们是产品差异化

**对标目标一句话**：用户在模式意图、切换手感、探索力、计划审阅、调试闭环上感到「像 Cursor 一样可靠」；在写权限与可逆性上仍是 Project OS。

---

## 0. 模式映射（命名与心智）

| Cursor | Project OS 今日 | 建议产品命名 | 说明 |
|--------|-----------------|--------------|------|
| Ask | `ask` | Ask | 只读理解；应对齐「只读 Agent」而非单次 FAQ |
| Agent | `change` | **Agent**（UI）/ `change`（契约可保留） | 默认干活模式；内部仍走 scoped Change 管线 |
| Plan | `plan` | Plan | 先计划再 Build |
| Debug | `debug` | Debug | 假设 → 插桩 → 复现 → 定点修 |
| Custom Modes | 无 | Custom Modes | skill 常驻为 mode |
| — | `anchored` | Anchored | 保留；图节点/决策锚定问答 |
| — | `team_memory`（schema 残留） | 合并进 Ask / Anchored | 会话 hydrate 已映射为 `ask` |

UI 文案：`chat.changeMode` → 「Agent」（或「Agent · Change」过渡期）。契约类型 `ChatMode = 'change'` 可暂不改，避免大范围破坏；若改枚举，单独做迁移切片。

循环顺序建议与 Cursor 接近：`ask → plan → change → debug`，Anchored 放在末尾或仅从上下文入口进入（避免 Shift+Tab 噪音）。

---

## 1. 证据级现状（按 mode）

### 1.1 共享外壳（已有）

| 能力 | 现状 | 代码锚点 |
|------|------|----------|
| Mode picker | 有；仅显示名称，无「能否改文件」说明 | `ComposerControlBar.tsx` + `CHAT_MODES` |
| Shift+Tab 循环 | 有 | `ChatPanel.tsx` |
| Mode 切换 skill | 有（`ask-mode` / `plan-mode` / …） | `skills-templates/*-mode/SKILL.md` |
| 每 mode 独立 placeholder / help 文案 | 有 | `i18n` `chat.*ModeHelp` |
| 切换 mode 时隔离上下文 | **无** — 只改 `chatMode` | `workbenchStore.setChatMode` |
| 复杂任务自动建议 Plan | **无** | — |
| Stop 中断正在跑的 Agent | **弱** — dispose 订阅存在，无一等公民 Stop CTA | `runDisposable` |
| Conversation checkpoint / Restore | **无**（仅有 apply backup undo） | `restoreApplyBackup` |

### 1.2 Ask

**今日流水线**

```
sendPrompt(ask)
  → assemble LocalContextBundle (global | node | file)
  → GroundedAnswerService.answer (单次 complete)
  → 消息列表渲染 markdown
```

- System prompt 明确只读、禁止提 diff（`grounded-answer-service.ts`）。
- 上下文来自预组装 bundle + 可选 `@` 附件 / skill；**无 grep / 二次读文件 / 探索循环**。
- Global / node / file scope 均可用（`canSubmitAgentPrompt`）。

**相对 Cursor Ask 的差距**

| Cursor | Project OS | Gap ID |
|--------|------------|--------|
| 只读但可自主 search / 读文件 | 单次 grounded 回答 | A1 |
| 追问可继续探索同一会话 | 有消息历史，但每轮仍绑定同一预装 bundle | A2 |
| 「search the codebase」自然语言触发检索 | 无 | A1 |
| Ask 不能改文件（硬边界） | 已有 | — |

### 1.3 Change（对标 Agent）

**今日流水线**

```
sendPrompt(change)
  → refinePrompt → PromptRefinementCard（review_first）
  → confirmExecution → stream AgentRun → Diff / PendingChanges
  （executionPolicy === automatic 时可跳过确认卡）
```

- 默认 settings：`changeExecutionPolicy: "automatic"`（契约默认），但产品心智与 UI 仍大量围绕 refinement 卡。
- 写权限：leaf 单文件；节点委派 / 多文件事务在 `agent-requirements` E 仍为 PLANNED。
- Live Change Agent Flow 已诚实（D1–D3）：`context_prepared → locate_plan → generate_proposal → validate_proposal`；无假 retrieve/inspect/verify✓。Theater 仅残留于无 model 的 fallback / fixture 流（刻意保留）。
- Global 下亦可提交 Agent/Plan（M3.B）；无选中 node 时走 global scope。

**相对 Cursor Agent 的差距**

| Cursor | Project OS | Gap ID |
|--------|------------|--------|
| 打开就能改；全仓探索后多文件写入 | 绑图 scope；单文件写；无开放 tool loop | C1, C2 |
| 边跑边出 diff；可 Stop | 事件流有；Stop CTA 已补 | C3 |
| Restore Checkpoint（按消息回滚文件） | 消息级 Restore checkpoint 已有 | C4 |
| Subagents / 并行 explore | 委派契约部分存在；未产品化 | C5（对齐 E/F，勿另起炉灶） |
| 诚实工具步骤 | Live 已诚实（D1–D3）；fixture 可保留旧 kind | C6 |

### 1.4 Plan

**今日流水线**

```
createPlan → needs_clarification | ready
  → PlanReviewCard（只读展示 steps/todos）
  → Build → buildPlan → refinement(sourcePlanId) → 切 change + confirmRefinement
```

- 澄清问题 + 选项已齐；`updatePlan` API 已有，**UI 未接线**。
- `revisePlan` = 清空 pending + 把上次用户话塞回 composer（整段重提）。
- Plan 持久化在进程内 `plansById`（`persistPlan`），**非 Cursor 式「Save to workspace」markdown**。
- Build 强制 `executionPolicy: "review_first"`。

**相对 Cursor Plan 的差距**

| Cursor | Project OS | Gap ID |
|--------|------------|--------|
| 研究代码库再出计划 | 单次 plan complete + 预装 bundle | P1（共享 A1 能力） |
| 可编辑计划（聊天或 markdown） | 只读卡 + Revise 重提 | P2 |
| Save to workspace / 团队共享 | 无用户可见落盘 | P3 |
| 复杂任务自动建议切 Plan | 无 | P4 |
| Build 后不符预期 → 回计划改再 Build | Revise 弱；无「从计划重启」一等入口 | P5 |

### 1.5 Debug

**今日流水线**

```
startDebugSession
  → hypothesize / instrument（启发式插桩到 scope 文件）
  → reproduce（用户点「已复现」）
  → analyze → chooseRootCause（偏规则）
  → confirmDebugFix → refine + confirmExecution
  → markFixed → cleanup instrumentation
```

- 本地 `debugLogPort` + `fetch_log` / `console_log` 插桩与 Cursor「本地 debug server」同方向。
- 假设种子常为模板（`seedManualHypotheses`）；无「探索代码 → 多假设」的模型驱动循环。
- `submitDebugRepro` 收集日志后直接 `chooseRootCause`，分析深度有限。
- UI 为 `DebugSessionPanel` 阶段条 + 按钮，偏工作流面板，少对话内推进。

**相对 Cursor Debug 的差距**

| Cursor | Project OS | Gap ID |
|--------|------------|--------|
| 探索 + 多假设 | 模板假设 + 有限 harness 匹配 | Dbg1 |
| 针对性插桩 | 锚点启发式（`export ` / `function `） | Dbg2 |
| 按日志证据定点小修 | 转回 refinePrompt 通用修 | Dbg3 |
| 对话驱动阶段 | 面板按钮驱动 | Dbg4 |

### 1.6 Anchored（保留差异化）

- 要求 `chatAnchor` 或选中 node；走 `askAgent` node scope。
- 可写回决策（`lastAnchoredAnswer` / record）。
- **不需要对标 Cursor**；需避免与 Ask 混淆，并决定是否进入 Shift+Tab 循环。

### 1.7 Custom Modes / Skills

- `/` 菜单可挂 `invokedSkillId` 到**单条消息**。
- Mode skill 仅切换 `chatMode`（`disable-model-invocation: true`）。
- **无** Option+Enter /「Use as Mode」常驻；无 mode badge 的 icon/color 产品化。

| Cursor | Project OS | Gap ID |
|--------|------------|--------|
| Skill → Custom Mode，每轮注入 | 仅单次 invoke | M1 |
| Mode badge 样式 frontmatter | 无 | M2 |

---

## 2. 原则（桥接时必须遵守）

1. **意图对齐 Cursor，执行仍守 Project OS 不变量**  
   Ask 可探索但不可写；Change/Agent 可写但必须经服务器授权的 leaf（及将来的 child-run 组）。
2. **诚实优于「看起来像 Agent」**  
   禁止为了 parity 恢复假步骤；C6 跟 `agent-requirements` D1–D3。
3. **先补「感觉最像 Cursor」的缺口，再补重型 agent 架构**  
   Mode UX / Ask 探索 / Plan 可编辑 / Stop+Undo 优先于开放 tool loop（Route ② 仍 DEFERRED）。
4. **有限检索 ≠ 开放 tool loop**  
   Ask / Plan / locate 允许在 `allowedReadPaths`（及明确的只读索引）内扩展上下文；不打开任意写或任意 shell。
5. **Mode 切换默认新开会话（或强隔离）**  
   对齐 Cursor「each mode uses its own context」；同会话切换仅作高级选项。
6. **与现有路线图合并，不平行造轮**  
   Change 深度能力吃 D1–D3 / E / F；本文只定义 mode 层切片与依赖顺序。

---

## 3. 差距优先级总表

| ID | 主题 | 影响 | 依赖 | 建议波次 |
|----|------|------|------|----------|
| UX1 | Mode picker 文案/帮助/循环顺序；Change→Agent 命名 | 高 | — | M0 |
| UX2 | 切换 mode → 新 chat / 隔离上下文 | 高 | UX1 | M0 |
| UX3 | Stop run 一等 CTA | 高 | — | M0 |
| A1 | Ask 只读有限检索（grep + 授权路径读） | 极高 | — | M1 |
| A2 | Ask 多轮探索同一会话（复用扩展上下文） | 高 | A1 | M1 |
| P2 | Plan 可编辑（接线 `updatePlan`） | 高 | — | M1 |
| P3 | Plan Save to workspace（markdown） | 中 | P2 | M2 |
| P4 | 复杂任务建议切 Plan | 中 | UX1 | M2 |
| P5 | Build 失败/不符 → 回计划再 Build | 中 | P2 | M2 |
| P1 | Plan 创建前只读检索 | 高 | A1 | M2 |
| C6 | 诚实 Change pipeline | 极高 | — | 跟 D1–D3 |
| C3 | 流式可见性 + Stop | 高 | UX3 | M1–M2 |
| C4 | 对话 Checkpoint / Restore | 中高 | C6 部分 | M3 |
| C1 | 无选中也可 Agent（global plan→delegate） | 高 | E/F | M3+ |
| C2 | 多文件事务 | 高 | E | M3+ |
| Dbg1–4 | Debug 模型驱动假设/插桩/分析/对话化 | 中高 | A1 部分 | M2–M3 |
| M1–M2 | Custom Modes | 中 | UX1 | M2 |
| Anchored | 循环策略与 Ask 边界文档化 | 低 | UX1 | M0 |

---

## 4. 分波次开发计划

### M0 — Mode 外壳对齐（1 个短切片，纯 UX + 会话语义）

**目标**：打开 sidebar 时，模式选择与 Cursor 同构；切换不再污染上下文。

#### M0.1 Mode picker 与命名

- [x] `chat.changeMode` 显示为 **Agent**（help 文案说明：scoped edits / reviewable diff）。
- [x] Dropdown 每项展示一行 help（复用 `*ModeHelp`）：Ask=只读，Agent=可改，Plan=先计划，Debug=运行时调查。
- [x] `CYCLE_CHAT_MODES` 循环：`ask → plan → change → debug`；**Anchored 不进 Shift+Tab**（仅从节点菜单 / 显式选择进入）。
- [x] Mode chip 展示当前能力徽标：`Read-only` / `Can edit`（i18n）。

#### M0.2 切换 mode = 新会话（默认）

- [x] `setChatMode` 默认：`createSession({ chatMode, seedWelcome: false, draftInput: 当前 draft })` 并激活；旧会话保留在历史。
- [x] Settings 高级项：`chatModeSwitch: 'new_session' | 'same_session'`（默认 `same_session`，localStorage；与 Cursor 多 mode 同会话一致）。
- [x] 新会话标题带 mode 名（如 `Ask` / `Agent`）。
- [x] 测试：`workbenchStore.chatMode.test.ts` — 切换 mode 不串 `pendingPlan` / `debugSession` / `pendingRefinement`。

#### M0.3 Stop

- [x] Composer / Agent Flow 在 `flowStatus === 'running'`（及 refineLoading）时显示 **Stop**。
- [x] Stop：`runDisposable.dispose()` + `cancelAgentRun(runId)`（orchestrator abort + `cancelled` 状态）。
- [x] i18n + 测试。

**验收**：Shift+Tab 手感接近 Cursor；Ask↔Agent 切换后上下文不混；运行中可停。

**不在本波**：检索、Plan 编辑、Debug 重写。

**M0 状态**：Implemented（2026-10-19）

---

### M1 — Ask 只读探索 + Plan 可编辑 + Change 诚实基线并行

三条可并行（不同人/不同 PR），但 **A1 是 P1/Dbg 的前置**。

#### M1.A Ask 有限检索（Gap A1 / A2）

**设计（遵守原则 4）**

```
askAgent
  → 初始 bundle（今日）
  → 可选：只读检索轮（最多 N 轮，默认 2–3）
       tools（服务器执行）:
         - grep_workspace(pattern, glob?) → 命中路径+行（paths 必须 ∈ 可读索引）
         - read_authorized(path, range?) → 仅 allowedReadPaths 或检索命中且通过 ACL
  → 最终 grounded answer（仍 writeCapability: false）
```

- [x] 契约：`AgentAskRequest` 增加 `exploration?: { maxRounds: number }`；结果可带 `explorationTrace`（路径级，无大段源码入历史可选）。
- [x] 服务：`exploreForAskQuestion`（启发式 middle-ground）；**禁止**任何 write / shell。
- [x] ACL：`allowedReadPaths ∩ fileIndex`（Global 空读列表时退回 fileIndex）；读路径经 ToolPolicy `read_file` + `resolveContainedPath`（Harness H1.B）。
- [x] UI：Ask 回答上方可折叠「查阅了 N 个文件」（诚实，无假 spinner）。
- [x] 测试：索引外拒绝；`allowedReadPaths` 收窄；maxHits/maxReads 截断。

**中间态（已落地）**：**服务端启发式检索**（从 question 抽符号 → grep → 附加到 supplementalMarkdown），UI 展示查阅列表。Route ② 式 tool loop 仍属 DEFERRED。

**M1.A 加固**：2026-10-19 — Policy/ACL 与 `maxRounds → maxReads` 接线。

#### M1.B Plan 可编辑（Gap P2）

- [x] `PlanReviewCard`：objective / steps / todos / rationale 可编辑；「Save」调 `client.updatePlan`。
- [x] Build 前校验 `status === 'ready'` 且 steps 非空。
- [x] Revise：保留「清空重提」；新增「Edit in place」。
- [x] 接线：`savePlanEdits` + `savingEdits` UI。

#### M1.C Change 诚实基线（Gap C6）

- [x] **不在本文重写**；对齐 `agent-requirements` **D1–D3 live**（`context_prepared → locate_plan → generate_proposal → validate_proposal` ± automatic apply/verify；无假 verify✓）。
- [x] Agent Flow 对 live Change 不再显示未发生的 theater 步骤（fixture 流保留）。

#### M1.D Stop 与 running 可见性（Gap C3 前半）

- [x] 依赖 M0.3；Change/Debug fix run 共用 Stop（Composer + Agent Flow）。
- [x] `refineLoading` 时亦可 Stop；「构图中」用 refining pill 区分。

**验收**：Ask 能回答「XX 在哪定义」类问题且展示查阅证据；Plan 可改一步再 Build；Change 步骤诚实。

---

### M2 — Plan 产品化 + Debug 升维 + Custom Modes

#### M2.A Plan 落盘与建议（P3 / P4 / P5 / P1）

- [x] **Save to workspace**：写入 `.projectos/plans/<planId>.md`；按钮「Save to workspace」。
- [x] 从 markdown 回读：`loadPlanFromWorkspace` + PlanReviewCard「从工作区重新加载」。
- [x] **Suggest Plan**：`shouldSuggestPlanMode` + banner「改用 Plan？」一键切 mode（走 M0.2 新会话）。
- [x] **Rebuild from plan**：「Return to plan」恢复 `pendingPlan`；若有已 apply backup 则先 undo。
- [x] Plan 创建调用 Ask 同款只读检索（P1），再 `createPlan`。

#### M2.B Debug 升维（Dbg1–4）

分两小步，避免一次重写：

**M2.B1 — 模型假设 + 日志分析**

- [x] `startDebugSession`：无 harness 时用模型基于 bundle（+ A1 检索）生成假设，失败回退 `seedManualHypotheses`。
- [x] `submitDebugRepro`：将 `logEntries` 交给模型选择 root cause + `proposedFix`。
- [x] 插桩：模型输出 `InstrumentationSpec[]`（path ∈ scopeFiles，anchor 须在文件中）；失败回退启发式。

**M2.B2 — 对话化阶段**

- [x] 阶段推进在聊天内用系统消息（保留面板进度条 + CTA）。
- [x] Fix 路径带有界 log evidence snippet 进入 refinePrompt。

#### M2.C Custom Modes（M1–M2）

- [x] Skill frontmatter：`icon` / `color`（可选）；`usable-as-mode: true`。
- [x] `/` 菜单：「Use as Mode」或 Option/Meta+Enter → `activeCustomModeSkillId`，**每轮**注入 skill（直到 Exit）。
- [x] Chip 显示自定义 mode（解析 skill 名）；Exit 清除 pinned skill。
- [x] 与 built-in Ask/Agent/Plan/Debug **正交**：Custom Mode 是「常驻 skill」，不改变写权限合同。

**验收**：Plan 可保存与回炉；Debug 假设/根因来自模型+日志；Custom Mode 多轮仍在。

---

### M3 — Agent 深度（对齐 agent-requirements E/F + Checkpoint）

本波次是「像 Cursor Agent」，但仍守 leaf/事务不变量。

#### M3.A Checkpoint / Restore（C4）

- [x] 每次成功 apply 写入 conversation checkpoint（backupId 引用）；会话 snapshot 持久化。
- [x] 消息「Restore checkpoint」→ `restoreApplyBackup`；**不删消息**。
- [x] 与 PendingChanges undo 共用 restore 基础设施。

#### M3.B Global / Node Agent 入口（C1 / C2）

- [x] 跟现有 **E/F** 委派管线：global **Agent(Change)** / component node → leaf child runs；leaf 写仍走授权。
- [x] `canSubmitAgentPrompt`：global 下 Ask/Debug/Anchored/Plan/Agent(`change`) 均可提交。
- [x] UI：Global 空状态引导（`chat.globalAgentEmptyHint`）。
- [x] 多文件 E：独立 `validate_delegated_batch` 优先；事务组 commit + 单 backup 任务级 undo（Workbench `undoCurrentApply`）。

#### M3.C 明确不做（本波仍 DEFERRED）

- 开放模型 tool loop（Route ②）
- Cloud Agents / 浏览器 subagent 全家桶
- 对话全文 search-as-tool（可另开）

**验收**：component 多文件 Change 可原子完成并可任务级 undo；global Change 走 F 整树委派；消息级 Restore 可用。Global **Plan** 仍是 ImplementationPlan 工件（非 F 委派）。

---

## 5. 切片依赖图

```text
M0 (UX shell, mode isolation, Stop)
 │
 ├──────────────┬──────────────────┐
 ▼              ▼                  ▼
M1.A Ask     M1.B Plan edit     M1.C D1 honest Change
 exploration
 │              │                  │
 ▼              ▼                  ▼
M2.A Plan    M2.B Debug         M2.C Custom Modes
 productize   upgrade            (optional parallel)
 │
 ▼
M3 Checkpoint + E/F Agent depth
```

---

## 6. 合同与代码触点（实施时优先改这些）

| 区域 | 路径 |
|------|------|
| Mode 类型 / 提交门闸 | `workbenchStore.ts` (`ChatMode`, `canSubmitAgentPrompt`, `sendPrompt`, `setChatMode`) |
| Mode UI | `composer/chatModeVisuals.ts`, `ComposerControlBar.tsx`, `ChatPanel.tsx` |
| 会话 | `chatSessionStore.ts`, `contracts/chat-session.ts` |
| Ask | `grounded-answer-service.ts`, `project-os-local-api.askAgent` |
| Plan | `plan-service.ts`, `PlanReviewCard.tsx`, `updatePlan` / `buildPlan` |
| Debug | `debug-session-service.ts`, `debug-instrumentation-service.ts`, `DebugSessionPanel.tsx` |
| Change 诚实性 | `agent-requirements.md` D1–D3；Agent Flow 事件 |
| Skills / Custom Mode | `skills-templates/`, composer `/` 菜单, `invokedSkillId` → `activeCustomModeSkillId` |
| i18n | `en.ts` / `zh.ts` `chat.*` / `plan.*` / `debug.*` |

---

## 7. 测试与验收清单（跨波次）

### 行为

- [x] Ask 永远不产生 `GeneratedDiff` / 不写盘（exploration 只读）。
- [x] Agent(`change`) 写盘路径 ⊆ 服务器授权（不变式保留）。
- [x] Plan Build 前零写盘；Build 后走既有 Change 授权。
- [x] Debug 插桩可 cleanup；complete 后无残留 debug fetch。
- [x] Mode 默认切换不串 `pendingPlan` / `debugSession` / `pendingRefinement`。
- [x] Stop 后无继续 apply。

### UX

- [x] Picker 文案让新人 3 秒内懂「能不能改文件」。
- [x] Shift+Tab 顺序稳定；Anchored 不挡循环。
- [x] Ask 探索有可折叠证据，无假进度。

### 回归

- [x] `workbenchStore.agentConversation` / ask-exploration / suggestPlanMode 测试更新。
- [x] Fixture / presentationMode 路径不受损（未改 presentation 契约）。

---

## 8. 与 `agent-requirements.md` 的归并规则

| 本文 | agent-requirements |
|------|-------------------|
| M1.C | **D1**（必须先做或并行合入） |
| M3 多文件 / global | **D3 → E → F** |
| Ask/Plan 有限检索 | **§3.3 middle-ground**（`needsMoreContext` / 授权读）；**不是** Route ② |
| 开放 tool loop | 仍 **DEFERRED**；不因 Cursor parity 提前 |

若 D1 与 M0 冲突排期：**M0 可先合**（无服务端依赖）；**M1.C 与 D1 同 PR 或紧随**。

---

## 9. 建议排期（弹性）

| 波次 | 大致体量 | 产出 |
|------|----------|------|
| M0 | 小（数日） | 模式外壳 = Cursor 手感 |
| M1 | 中（1–2 周） | Ask 能查；Plan 能改；Change 诚实 |
| M2 | 中大 | Plan 落盘/建议；Debug 像调查；Custom Modes |
| M3 | 大 | Checkpoint；图上 Agent 委派（吃 E/F） |

---

## 10. 决策记录（本文锁定）

1. **UI 名 Agent，契约可暂留 `change`。**
2. **Mode 切换默认新会话。**
3. **Ask 补有限只读检索，不做开放 tool loop。**
4. **Anchored 保留，移出 Shift+Tab 主循环。**
5. **Custom Mode = 常驻 skill，不改变写权限合同。**
6. **Change 深度能力不平行开发，归并 D/E/F。**

---

## 11. 下一步（开发启动时）

1. 评审本文 M0–M1 范围与命名（Agent vs Change）。
2. 开 M0 PR（picker + 会话隔离 + Stop）。
3. 并行：M1.A 检索设计短文（ACL 表）+ M1.B Plan 编辑 + D1。
4. M1 验收通过后再拉 M2。

文档路径：`docs/features/Chat-Modes-Cursor-Parity-Dev-Plan.md`  
后续实现以本文勾选清单为准；重大偏离先更新本文「决策记录」再改代码。
