# Requirement Alignment Card：执行前契约对齐 + Debug 分项结案

**状态**：M0–M1 implemented（2026-10-26）。M2（超契约 diff 警告 / Settings alignmentPolicy / Plan 答案继承）与 M3（Live Graph 归因）仍 Planned。  
**范围**：Agent（`change`）发送 prompt 后、写文件 / `confirmExecution` 之前的**需求描述对齐卡片**；以及 Debug 在多 bug 场景下的**分项对齐 + 分项结案**。把今日「整卡 Confirm / Revise」的 Prompt Refinement，升级为可勾选、可批注、可答题的**语句级任务契约（task contract）**。  
**权威交叉引用**：
- `docs/features/Chat-Modes-Cursor-Parity-Dev-Plan.md` — Change / Plan / Debug 管线；Plan `clarifyingQuestions` 交互是本卡第三区的对标实现
- `docs/Full-Product-Architecture-and-Dev-Plan.md` §10.2 Prompt Refinement — 「execution 前 confirm AI understanding」
- `docs/features/Agent-Flow-Activity-Dev-Plan.md` — 侧栏过程缩略；对齐卡是**结果/操作卡**，不是过程证据
- `docs/features/Live-Graph-Agent-Observability-Dev-Plan.md` — 契约条目应可归因到后续文件 / 活动
- `docs/features/Agent-Harness-Dev-Plan.md` — 写权限、审批、中断仍走 harness；本卡不扩大写权限
- `agent-requirements.md` — 图作用域、leaf-only write、诚实 pipeline（D1–D3）
- 契约现状：`projectos/contracts/prompt-refinement.ts`、`implementation-plan.ts`（`ClarifyingQuestion`）、`debug-session.ts`
- UI 现状：`PromptRefinementCard.tsx`、`PlanReviewCard.tsx` / `PlanClarificationQuestionItem.tsx`、`DebugSessionPanel.tsx`

**明确不复制 / 不做**：
- 不做无限多轮苏格拉底问答代替勾选卡；开放题有上限（见 §3.3）
- 不在 Ask / Anchored 强制对齐
- 不因对齐失败而静默开跑；可降级为可编辑空契约，不可跳过闸门除非用户偏好允许
- 不把本卡做成第二套 Plan：Alignment 回答「做什么 / 不做什么 / 关键歧义」；Plan 回答「怎么分步做」
- 不引入 Cursor 式「模型自行扩大写权限」；对齐通过 ≠ 解绑 leaf / scope
- 第一版不做多人协作批注、不做跨会话共享契约模板

**对标目标一句话**：用户发送 Agent prompt 后，先用勾选 + 批注 + 选项题把意图钉死，再允许开发；多 bug Debug 可逐条确认、逐条修、逐条勾「已消除」，而不是整单 Mark as fixed。

---

## 0. 核心诉求（本文锁定）

| # | 诉求 | 用户要回答的问题 | 本计划对应模块 |
|---|------|------------------|----------------|
| 1 | 执行前看见 AI 理解了什么 | 这次到底要做哪些事？ | §A 明确需求句 |
| 2 | 看见并裁决 AI 的猜测 | 哪些是我没说清、AI 自己补的？采纳吗？ | §B 猜测句 |
| 3 | 对「必须做但形态未知」做选择 | 实现方式 / scope / UX 形态选哪个？或自定义？ | §C 开放设计题（对标 Plan clarifying） |
| 4 | 用批注微调单条语句 | 这条对，但边界改成… | Item comment |
| 5 | Agent 只按契约开发 | 为什么改了这个文件？ | Task contract → run |
| 6 | 多 bug 分项对齐与结案 | 哪条还在、哪条已消？ | Debug Alignment + per-item fixed |

前五项是 Agent 闸门；第六项是 Debug 闸门与验收粒度。

---

## 1. 产品分界

### 1.1 三区卡片（Agent Alignment Card）

卡片位于 **AI Chat 输入框上方**（对话流与 composer 之间），状态为 `awaiting_alignment` 时**禁止** `confirmExecution` / 写文件。

| 区 | 名称（产品） | 内容来源 | 默认交互 | 对执行的约束力 |
|----|--------------|----------|----------|----------------|
| **A** | 你明确要求的 | 从 raw prompt 抽取的需求原子句 | 默认**勾选**；可取消；可 comment | 勾选 = Must 纳入范围；取消 = 本次不做 |
| **B** | AI 猜测、你没说清的 | 合理推断、默认假设、范围扩张 | 默认**不勾选**；勾选才生效；可 comment | 未勾选**不得**成为写文件理由 |
| **C** | 需要你拍板的设计点 | AI 确认要做，但实现方式 / scope / 形态不明 | 每题：选项（2–5）或「自定义」文本；可标 blocking | **未答完的 blocking 题禁止开跑** |

区 C 交互**复用** Plan 已有模式（`ClarifyingQuestion` + `PlanClarificationQuestionItem`：选项卡 + 自定义 textarea），不要另造第三套问答控件；可抽共享组件（如 `ClarifyingQuestionItem`）。

### 1.2 与现有卡片的关系

| 现有 | 关系 |
|------|------|
| `PromptRefinementCard` | **被本卡取代或演进**：从只读 `understood` + 整卡 Confirm，升级为三区可交互契约；保留 Confirm / Revise 出口 |
| Plan `needs_clarification` | 区 C **同构**；Plan 仍保留完整 steps/todos。复杂任务：Alignment 通过后可建议升 Plan（沿用 `shouldSuggestPlanMode`） |
| `DebugSessionPanel` | 保留阶段条；新增 **Bug Alignment Card** 作为多 bug 入口闸门；结案从整单 `markFixed` 改为 per-item |

### 1.3 Alignment vs Plan

| | Alignment Card | Plan |
|--|----------------|------|
| 时机 | 每次 Agent 开跑前（可智能跳过） | 用户显式 Plan mode 或系统建议 |
| 粒度 | 短语句 + 少量表决题 | 有序 steps + acceptance |
| 输出 | `AlignmentContract`（可勾选条目 + 已答问题） | `ImplementationPlan` |
| 升格 | 条目多 / blocking 多 / 跨模块 → 建议 Plan | Build → 仍可生成 refinement，但应**继承**已确认 contract，避免用户答两遍 |

硬规则：若本轮已通过 Alignment 且用户未改 prompt，Plan 创建应将 contract 作为 `existingAnswers` / 上下文注入，**不得**用同义问题再问一遍。

---

## 2. 证据级现状

### 2.1 Agent（Change）今日流水线

```
sendPrompt(change)
  → refinePrompt → PromptRefinementCard（understood / ambiguities[] / suggestions[] 只读）
  → confirmExecution → AgentRun
  （executionPolicy === automatic 时可跳过确认卡）
```

缺口：

- `understood` 是整段散文，无法分项裁决
- `ambiguities` / `suggestions` 是 `string[]`，无勾选、无 comment、无选项
- Confirm = 全盘接受；Revise = 整段打回 composer
- 无「实现方式 / scope」类结构化表决（Plan 才有 `clarifyingQuestions`）

### 2.2 Plan 今日已具备（应对齐复用）

- `ClarifyingQuestion`：`question` + `options[]` + `selectedOptionId` / `answer`
- UI：选项卡 +「自定义」+ textarea（`PlanClarificationQuestionItem`）
- 未答完不可进入 ready / Build 的闸门逻辑可参考

### 2.3 Debug 今日流水线

```
startDebugSession
  → hypothesize / instrument → reproduce → analyze → chooseRootCause
  → confirmDebugFix → refine + confirmExecution
  → markFixed → cleanup
```

缺口：

- `bugDescription` 单字符串；多 bug 无分项模型
- 无「确认 bug 是否存在 / 形态」的对齐卡
- 结案粒度是整 session，不是单条 bug

### 2.4 代码锚点

| 层 | 路径 |
|----|------|
| 契约 | `contracts/prompt-refinement.ts`、`implementation-plan.ts`、`debug-session.ts`、`chat-session.ts`（`pendingRefinement`） |
| 服务 | `services/prompt-refinement-service.ts`、`plan-service.ts`、`project-os-local-api.ts`（`confirmExecution` / `confirmDebugFix`） |
| Store | `workbenchStore`：`pendingRefinement`、`confirmRefinement`、`reviseRefinement`、`debugSession`、`confirmDebugFix` |
| UI | `PromptRefinementCard.tsx`、`PlanClarificationQuestionItem.tsx`、`DebugSessionPanel.tsx`、`ComposerControlBar` 上方挂载点 |

---

## 3. 数据模型（目标契约）

建议新文件 `projectos/contracts/alignment-contract.ts`（或演进 `PromptRefinement`；**禁止**在 workbench 内另定义形状）。第一版推荐**演进 PromptRefinement + 旁挂 AlignmentContract**，session 仍用 `pendingRefinement` 指针，避免双 pending。

### 3.1 AlignmentItem（区 A / B）

```ts
type AlignmentItemKind = 'stated' | 'guess' | 'constraint' | 'out_of_scope'
// stated = 区 A；guess = 区 B；constraint / out_of_scope 可并入 A/B 展示分组

type AlignmentItem = {
  id: string
  kind: AlignmentItemKind
  text: string                    // 短句，建议 ≤ 80 字（产品文案约束，非硬 schema）
  selected: boolean               // 用户勾选态；服务端生成时带默认
  comment?: string                // 用户批注；空 = 无调整
  severity?: 'blocking' | 'normal' // 取消某条 stated 通常不 blocking；见闸门规则
  relatedFileHints?: string[]     // 可选，展示用，不授权写权限
  sourceSpan?: { start: number; end: number } // 可选，映射回 raw prompt 片段
}
```

默认：

- `kind === 'stated'` → `selected: true`
- `kind === 'guess'` → `selected: false`
- `kind === 'out_of_scope'` → `selected: true` 表示「确认排除」

### 3.2 AlignmentQuestion（区 C，对标 Plan）

直接复用或 narrow-extend `ClarifyingQuestion`：

```ts
type AlignmentQuestion = ClarifyingQuestion & {
  topic: 'implementation' | 'scope' | 'ux' | 'data' | 'testing' | 'other'
  blocking: boolean               // true → 未答禁止 Confirm
  // options / selectedOptionId / answer 同 Plan
}
```

产品文案示例（实现方式 / scope）：

- 「改动范围？」→ 仅当前文件 / 当前组件子树 / 允许相关测试文件 / 自定义
- 「UI 形态？」→ 复用现有卡片样式 / 新抽屉 / 仅 API 先不动 UI / 自定义
- 「数据持久化？」→ 仅会话内存 / 写入 chat snapshot / 落盘 project 设置 / 自定义

### 3.3 AlignmentContract

```ts
type AlignmentContractStatus =
  | 'drafting'           // 模型生成中
  | 'awaiting_user'      // 卡已展示
  | 'confirmed'          // 用户确认，可开跑
  | 'revised'            // 打回 composer
  | 'superseded'         // 用户改了 prompt，旧契约作废

type AlignmentContract = {
  version: '0.1.0'
  id: string
  projectId: string
  chatSessionId?: string
  rawPrompt: string
  items: AlignmentItem[]
  questions: AlignmentQuestion[]
  // 兼容今日 PromptRefinement 展示字段（可派生）
  confidence: number
  affectedNodeIds: string[]
  affectedFiles: string[]
  executionPolicy?: ChangeExecutionPolicy
  sourcePlanId?: string
  status: AlignmentContractStatus
  createdAt: string
  updatedAt: string
}
```

开放题上限（产品硬规则）：

- 区 C 最多 **5** 题；blocking 最多 **3** 题
- 每题选项 **2–5** 个 + 隐式「自定义」
- 区 A+B 合计建议 ≤ **12** 条；超出则折叠低优先级 guess，并建议升 Plan

### 3.4 用户确认载荷

```ts
type ConfirmAlignmentRequest = {
  contractId: string
  items: Array<{ id: string; selected: boolean; comment?: string }>
  answers: Array<{
    questionId: string
    selectedOptionId?: string
    answer: string
  }>
}
```

`confirmExecution` 改为消费 **已确认 contract**（或 `confirmAlignment` → 内部再 `confirmExecution`）。Run 上下文必须注入：

1. 勾选的 items（含 comments）
2. 明确取消的 stated / 未勾选的 guess（作负向约束）
3. 已答 questions 的最终答案文本

### 3.5 Debug：BugAlignmentItem

```ts
type BugAlignmentStatus =
  | 'proposed'           // AI/用户提出，待确认
  | 'confirmed'          // 用户确认存在且形态 OK（或 comment 后确认）
  | 'rejected'           // 非 bug / 预期行为 / 描述错误
  | 'fixing'             // 修复进行中
  | 'fixed'              // 用户勾选「本条已消除」
  | 'regressed'          // 修其他项后复发

type BugAlignmentItem = {
  id: string
  summary: string                 // 短句 bug 描述
  selected: boolean               // 确认纳入本轮 debug
  comment?: string
  status: BugAlignmentStatus
  reproHint?: string
  evidenceRefs?: string[]         // log entry ids / 假设 ids
  dependsOn?: string[]            // 其他 bug item ids
  linkedRunId?: string
  fixedAt?: string
}
```

`DebugSession` 演进：`bugs: BugAlignmentItem[]`；保留 `bugDescription` 作为原始用户输入或派生摘要。整单 `complete` 仅当：所有 `selected && status !== 'rejected'` 的条目均为 `fixed`，或用户显式「放弃剩余」。

---

## 4. 交互与闸门

### 4.1 Agent 主路径

```
sendPrompt(change)
  → refinePrompt / buildAlignmentContract
  → 智能跳过？ → 是 → 合成 contract（全 stated 勾选、无 blocking 题）→ confirmExecution
  → 否 → 展示 Alignment Card（awaiting_user）
       → 用户勾选 / comment / 答区 C
       → Confirm → 校验闸门 → confirmAlignment → confirmExecution → AgentRun
       → Revise → 契约 superseded，prompt 回 composer
```

**Confirm 闸门**（全部满足才可开跑）：

1. 至少 1 条 `selected` 的 `stated` 或 `guess`
2. 所有 `blocking === true` 的 questions 已有 option 或非空 custom answer
3. 无处于编辑中的非法态（例如选了自定义但 textarea 为空）

**执行硬规则**：

1. 未勾选的 guess **不得**成为写文件理由  
2. 被取消的 stated **不得**出现在目标 diff；若模型仍改了 → UI / Agent Flow 标「超出契约」  
3. Item comments **优先于** raw prompt 同主题表述  
4. 区 C 答案写入 run system / task brief，视为用户决策  
5. `automatic` executionPolicy：仅当智能跳过条件满足时才允许无卡；否则仍强制卡（设置可改为 Always / Smart / Never）

### 4.2 智能跳过（Smart）

建议同时满足才跳过：

- 区 A ≤ 2 条且无区 B / 无 blocking 区 C（模型侧判定）
- `confidence` ≥ 阈值（沿用 `ConfidenceSchema`）
- 单文件或明确 leaf scope
- 用户设置 ≠ Always align

Never = 永远跳过（高风险，默认不提供或需二次确认）；Always = 每次都卡。

### 4.3 Comment 语义

- Comment **不**自动勾选该行  
- Comment 绑定 `itemId`，原样进入 run 上下文；第一版不做结构化 DSL  
- 可选后续：对单条「根据 comment 重写句子」而不整卡作废（M2）

### 4.4 Debug 主路径

```
用户描述（可能多 bug）
  → startDebugSession / buildBugAlignment
  → 单 bug 且高置信？ → 可跳过对齐，直接 hypothesize
  → 多 bug 或低置信 → Bug Alignment Card
       → 勾选确认存在 / comment 改形态 / 拒绝非 bug
       → Continue → 仅对 confirmed 条目 hypothesize / instrument / fix
       → 每条 fix 完成后：用户勾「本条已消除」→ status=fixed
       → 可选清理该条相关 instrumentation
       → 全部应处理条目 fixed 或 abandoned → session complete
```

**分项结案规则**：

- 「本条已消除」是用户动作，不是模型自报  
- 可选要求勾选简易验证（复现步骤不再出现 / 日志无错误）—— M1 可先纯勾选  
- 修 B 导致 A `regressed`：A 从 `fixed` → `regressed`，需重新确认  
- `dependsOn`：未完成依赖时禁用该条 Fixed 或禁用开修  

与 Cursor Debug 的差异（产品话术）：不提供唯一的「全部 Mark as fixed」作为唯一出口；可保留「全部标为已消除」作为批量快捷方式，但默认强调分项。

### 4.5 进行中展示

- 确认后卡片折叠为 **Contract summary**（已选 N 条、已答 M 题）
- Agent Flow / 侧栏可显示「按契约执行」；条目 → 文件归因留到与 Live Graph 联动切片
- 用户中途改 prompt 发送：旧 contract `superseded`；若有 running run → 先 Stop 策略与现网一致

---

## 5. UI 规格（Workbench）

### 5.1 Agent Alignment Card

挂载：替换 / 演进 `PromptRefinementCard`；位置仍在 ChatPanel composer 上方。

结构：

1. Header：标题「需求对齐」+ badge（model / fixture）+ 可选 confidence  
2. 说明一行：勾选表示纳入本次开发；猜测默认不勾选  
3. Section A：checkbox 列表 + 每行「添加备注」展开 inline input  
4. Section B：同控件，视觉降权（次要边框 / 标题标明「猜测」）  
5. Section C：复用 `ClarifyingQuestionItem`（选项 + 自定义）  
6. Actions：`开始开发`（闸门 disabled 原因 tooltip）、`修改原需求`（Revise）  
7. Confirmed 态：只读摘要 +「已确认」

视觉：tech theme tokens；**非** glass；卡片用 `--tech-bg-elevated`。不在此卡堆统计条或第二套 diff。

i18n：`alignment.*`（en/zh）；勿硬编码英文。

### 5.2 Bug Alignment Card

可独立组件 `BugAlignmentCard.tsx`，或 Debug 面板顶部嵌入。

每行：checkbox（确认存在）+ summary + comment + 状态 chip +（fix 后）「已消除」checkbox。  
Actions：`开始 Debug` / `修改描述`。

### 5.3 共享组件抽取

| 组件 | 职责 |
|------|------|
| `ClarifyingQuestionItem` | 从 Plan 抽出，Plan + Alignment 共用 |
| `AlignmentItemRow` | checkbox + text + comment toggle |
| `AlignmentCardShell` | header / sections / actions 布局 |

---

## 6. 后端与服务面

### 6.1 生成

`refinePrompt` 演进为生成 `AlignmentContract`（或 `buildAlignmentContract`）：

- 输入：今日 `PromptRefineRequest` + 可选图 scope / bundle  
- 输出：items + questions + confidence + affected*  
- 失败：fallback fixture / 单条 stated=rawPrompt 摘要 + 空 questions；**仍展示卡**（除非 Smart 跳过且用户 Never）  
- 模型 prompt 必须要求：短句、区 A/B 分离、区 C 仅真正阻塞的设计点、遵守数量上限  

### 6.2 确认与执行

```
confirmAlignment(request) → AlignmentContract(status=confirmed)
  → confirmExecution(refinementId | contractId)
  → AgentRun（brief 含 contract 序列化）
```

Orchestrator / change generation：**禁止**仅使用 `rawPrompt`；必须以 confirmed items + answers 为 primary brief。审计日志记录 contractId 与每条 selected/answer。

### 6.3 Debug API 增量（概念）

| API | 作用 |
|-----|------|
| `buildBugAlignment` / 扩展 `startDebugSession` | 返回 `bugs[]` |
| `confirmBugAlignment` | 写入 selected/comment/status |
| `markBugFixed(sessionId, bugId)` | 分项结案；触发该条 cleanup |
| `abandonBugs(sessionId, bugIds)` | 显式放弃 |
| 保留 `markFixed` | 映射为「全部剩余 confirmed → fixed」快捷方式，内部循环调用 |

### 6.4 Session 持久化

`chat-session` snapshot：`pendingRefinement` 升级为可承载 contract（或 `pendingAlignment`）；Debug snapshot 含 `bugs[]`。刷新后卡可恢复，不丢勾选草稿（草稿可仅存前端 store，确认后落盘）。

---

## 7. 与周边系统联动

| 系统 | 联动 |
|------|------|
| Agent Flow | 确认后侧栏保留 contract 缩略；过程证据仍走活动行，不把勾选过程当 thinking |
| Live Graph | M2+：文件活动 metadata 带 `alignmentItemIds` |
| Plan | 继承 answers；Suggest Plan 时带上 contract |
| Harness / PendingChanges | 超范围 diff 可标 warning（M2） |
| Settings | `alignmentPolicy: always \| smart \| never`（Change）；Debug 可共用或分设 |

---

## 8. MVP 分期

### M0 — 契约 + Agent 三区卡（可演示）

- [x] `alignment-contract.ts`（或扩展 `PromptRefinementSchema`）Zod + 导出  
- [x] `refinePrompt` 产出 items / questions（model + fixture 路径）  
- [x] UI：`PromptRefinementCard` → Alignment Card（A/B checkbox+comment，C 复用 Plan 选项题）  
- [x] `confirmAlignment` 闸门；`confirmExecution` brief 注入契约  
- [x] `automatic` + Smart 跳过最小实现  
- [x] 测试：schema、闸门、未勾选 guess 不进 brief、blocking 未答不可确认  
- [x] i18n en/zh  

**验收**：Agent 发 prompt 后出现三区卡；答完 blocking 题并勾选后才开跑；Revise 仍可用。

### M1 — Debug 分项对齐与结案

- [x] `BugAlignmentItem` 进 `debug-session`  
- [x] 多 bug 拆分（启发式编号/分句）+ Bug Alignment UI（`DebugSessionPanel`）  
- [x] `markBugFixed`；面板上分项「已消除」  
- [x] session complete 条件改为分项聚合  
- [x] 单 bug Smart 跳过（不进入 `align` phase）  
- [x] 测试：拒绝项不进入 focused description；分项 fixed 聚合 complete  

**验收**：一次描述 3 个 bug，可只确认 2 个；修完可分别勾已消除。

### M2 — 约束执行与体验打磨

- [ ] 超契约 diff 检测 / 警告（路径或目标与 selected items 对齐启发式）  
- [ ] 单条 comment → 重写该句  
- [ ] 进行中 contract summary + item 状态随 run 更新  
- [ ] Settings：alignmentPolicy  
- [ ] 与 Plan 答案去重 / 继承  
- [ ] `dependsOn` / regress 提示（Debug）  
- [ ] 指标埋点：确认率、guess 勾选率、blocking 题数、分项结案时长（可选）  

**验收**：取消的 stated 若仍被改到文件，用户能看见「超出契约」提示；Plan 不再重复已答设计题。

### M3 — 可观测归因（可选，可并入 Live Graph）

- [ ] run 事件 / Agent Flow 详情带 `alignmentItemId`  
- [ ] Graph Inspector：「因契约条目 #id」  
- [ ] 明确不做：用聊天文案反推契约  

---

## 9. 测试计划（摘要）

| 层 | 用例 |
|----|------|
| Contract | Zod 拒绝无 options 的非法 question；selected 默认值 |
| Service | fixture 路径稳定；model 失败 fallback 仍返回可展示 contract |
| Store | 未满足闸门时 `confirmAlignment` no-op + toast；Confirm 后 pending 清空/confirmed |
| UI | checkbox / comment / 自定义题；Confirm disabled 原因 |
| Debug | 多 bug 确认子集；`markBugFixed` 单条；abandon 后可 complete |
| Regress | 旧 `PromptRefinement` fixture 迁移或适配层；Plan Build → change 仍通 |

---

## 10. 风险与开放问题

| 风险 | 缓解 |
|------|------|
| 每次对齐增加摩擦 | Smart 跳过 + 设置项；短任务不卡 |
| 区 C 与 Plan 重复提问 | 答案继承；产品文案区分 Alignment vs Plan |
| 模型把猜测写进区 A | 生成 prompt 强约束 + 评测 fixture；UI 允许用户把条目「移到猜测」？（M2 可选） |
| Comment 过长淹没 brief | 截断 + 每条字数提示 |
| Debug 分项与现 harness 单 root cause 冲突 | M1：confirmed bugs 串行修或一轮只选一个 root；并行修标为 M2 |
| automatic 用户期望「发了就跑」 | Smart 对齐默认；Always 仅高级设置 |

**开放问题（实现前拍板）**：

1. 演进 `PromptRefinement` 字段 vs 新 `AlignmentContract` + 适配层？推荐新契约 + refinement 适配，避免 string[] 双源。  
2. Global Agent 多文件时是否**强制**区 C 至少一题 scope？推荐：affectedFiles > 1 时强制 scope 题。  
3. Debug 第一版串行还是允许同 run 修多个 confirmed bugs？推荐 M1 串行（一次一个 `fix` phase）。  

---

## 11. 非目标回顾

- Ask 模式对齐卡  
- 团队共享 / 评审 Alignment  
- 用 Alignment 替代 Diff Review  
- 开放 Agent 写权限  
- 复制 Cursor 整单 Mark as fixed 作为唯一结案 UX  

---

## 12. 建议实施顺序（给人看的）

1. 契约与 fixture（M0）  
2. 共享 `ClarifyingQuestionItem` 抽取 + Alignment Card UI  
3. Store / API 闸门与 brief 注入  
4. Smart 跳过与 i18n  
5. Debug bugs[] + 分项 fixed（M1）  
6. 超契约警告与 Plan 继承（M2）  

完成后：在 Workbench 用 Agent 发一条含糊多文件需求，应先看到三区卡；用 Debug 粘贴两条 bug，应能分项确认与分项勾已消除。
