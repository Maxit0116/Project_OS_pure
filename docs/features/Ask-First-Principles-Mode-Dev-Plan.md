# Ask · First Principles Mode Dev Plan

**状态**：Implemented FP-0…FP-6（2026-11-05）— 契约 / Ask 二级 pill / fallback+LLM 动态出题（失败降级）/ Thesis 落盘 / Plan·Agent handoff / L4 Diagram / Soft suggest / 只读探索打脸 / Conflict Card / Go 可选写入 `.projectos/features.json`（尊重 `locked`）。FP-7 打磨仍 Planned。  
**产品名**：Ask · First Principles / Ask · 立论（代码前缀 `firstPrinciples` / `fp`）  
**产品定位一句话**：Ask 下的**二级 mode**——用第一性原理分层推导 + 卡片点选 + Diagram Graph 联动，帮独立开发者 / solo founder 在动手前把模糊 feature vision 推成可证伪的 Thesis；结案后才允许升 Plan 或切 Agent。  
**权威邻居**：

| 文档 | 关系 |
|------|------|
| [`Chat-Modes-Cursor-Parity-Dev-Plan.md`](./Chat-Modes-Cursor-Parity-Dev-Plan.md) | 一级 mode 仍是 Ask / Plan / Agent / Debug / Anchored；本能力是 **Ask 的二级态**，**不**进入 `CHAT_MODES` / `CYCLE_CHAT_MODES` |
| [`Requirement-Alignment-Card-Dev-Plan.md`](./Requirement-Alignment-Card-Dev-Plan.md) | Alignment = Agent 开跑前「做什么」契约；本 mode = 更上游的「该不该做 / 问题是否立得住」 |
| [`Diagram-Graph-Dev-Plan.md`](./Diagram-Graph-Dev-Plan.md) | 立论中的结构外脑；复用 `generateDiagram` + `DiagramSummaryCard` + overlay；含 UI 时建议同 Graph 的 `ui-wireframe` 线稿（见 [`UI-Wireframe-Pack-Dev-Plan.md`](./UI-Wireframe-Pack-Dev-Plan.md)）；**不**走 Design Tab；不替代 Function Map |
| [`Product-Lab-Dev-Plan.md`](./Product-Lab-Dev-Plan.md) | Lab 也不进 `CHAT_MODES`（顶栏入口）；本 mode 挂在 Composer Ask 二级，样板可参考「旁路状态、不污染一级枚举」 |
| Function Map / `.projectos/features.json` | 结案 Go 后**可选**写入 `planned` feature；遵守 `locked: true`；不得发明 UI `epic_flow` |
| [`Agent-Harness-Dev-Plan.md`](./Agent-Harness-Dev-Plan.md) | 全程只读策略对齐 Ask；升 Agent 后仍走 harness + Alignment，不绕过写权限 |

**实现锚点（规划）**：

| 层 | 预期落点 |
|----|----------|
| 契约 | `projectos/contracts/first-principles.ts`（新建） |
| 持久化 | `.projectos/thesis/<id>.json` + 可选 index；session 内挂 `pendingFirstPrinciples` |
| 服务 | `projectos/services/first-principles/`（session / layer turn / thesis / handoff） |
| Skill | `projectos/skills-templates/ask-first-principles-mode/SKILL.md`（切二级态；`disable-model-invocation: true`） |
| Store | `workbenchStore`：`askSubMode: 'chat' \| 'first_principles'` + `pendingFirstPrinciples`；**不**扩 `ChatMode` 一级枚举 |
| UI | Mode switch 旁 Ask 二级飞出（对齐 Agent picker）；`FirstPrinciplesLayerCard`；`ThesisReviewCard`；复用 `PlanClarificationQuestionItem` 选项卡 |
| Diagram | 调用现有 Diagram Graph API；Chat 双写 Summary Card |
| i18n | `chat.firstPrinciples.*` / `firstPrinciples.*`（en + zh） |

---

## 0. 核心诉求（讨论锁定）

| # | 诉求 | 用户要回答的问题 | 本计划对应 |
|---|------|------------------|-----------|
| 1 | Solo founder 的 feature 常是冲动 / 模糊 vision，未经推敲 | 这问题从根上立得住吗？ | §1 定位 + §3 立论层 |
| 2 | 不要一上来就开发；先想明白 | 现在该问 Why/Whether，还是 How？ | Exit Gate；禁止未结案开跑 |
| 3 | 用第一性原理**一步一步问**，不是散文说教 | 下一张卡该逼近哪一层原子主张？ | L0–L4 协议 |
| 4 | 交互以**卡片点选**为主 | 选哪个主张 / 反例 / MVP？ | Clarifying 选项卡复用 |
| 5 | 联动 diagram / graph 外化结构 | 旅程 / 因果 / 边界长什么样？ | Diagram Graph 联动 |
| 6 | 摸清后再切 Agent（或 Plan）开发 | Thesis 确认后如何无缝移交？ | Handoff CTAs |
| 7 | 普通 Ask 仍可做基础问答 | 二级 mode 如何与 Chat Ask 共存？ | `askSubMode`；不占一级 mode |

**价值链**：

```text
模糊 vision
  → Ask · First Principles（分层点选 + 可选读仓证据）
  → Thesis Card（Go / Pivot / Kill / Park）
  → Go → Plan 或 Agent（注入 thesis；Alignment 仍闸门）
  → Kill/Park → 落盘备忘，不写业务代码
```

**一句话验收心智**：成功时刻是用户说「原来我想要的其实是 Y，不是 X」——不是「AI 很会写代码」。

---

## 1. 产品分界（硬规则）

### 1.1 与一级 Chat Modes

| Mode | 回答 | 写文件 | 与 FP 关系 |
|------|------|--------|-----------|
| Ask · Chat（默认二级） | 代码/概念是什么 | 否 | 并存；一键可切 |
| **Ask · First Principles** | 该不该做 / 问题是否立得住 | 否 | 本文 |
| Plan | 怎么分步做 | 否（Build 后进 Agent） | FP Go 后升格；继承 answers |
| Agent (`change`) | 按契约改代码 | 是（leaf / harness） | FP **不**直连写；经 handoff |
| Debug | 假设→复现→修 | 受限写 | 无关；不混入 |
| Anchored | 锚定节点问答 | 否（可写决策记录） | 无关 |
| Product Lab | 体验找 bug | 经 Agent | **不**进 Composer mode switch |

**锁定**：`ChatSessionMode` / workbench `ChatMode` / `CHAT_MODES` / `CYCLE_CHAT_MODES` **不新增** `first_principles`。Shift+Tab 仍只循环一级 mode。二级态仅在 `chatMode === 'ask'` 时可见可切换。

### 1.2 与 Alignment Card / Plan clarifying

| | First Principles | Alignment Card | Plan clarifying |
|--|------------------|----------------|-----------------|
| 时机 | **动手前**立论 | Agent **开跑前**契约 | Plan **分步前**澄清 |
| 问题类型 | Why / Whether / 可证伪性 | 做什么 / 不做什么 / 猜测裁决 | 实现细节挡路项 |
| 输出 | `Thesis` + verdict | `AlignmentContract` | `ImplementationPlan` |
| 失败路径 | Kill / Park / Pivot | Revise prompt | 继续答题或 Revise |

硬规则：FP 结案 **不等于** Alignment 通过；升 Agent 后仍走 Alignment（若策略要求）。Plan `createPlan` 必须把 thesis 字段与已答层注入为 `existingAnswers` / 上下文，**禁止同义再问一遍**。

### 1.3 与 Diagram Graph / Function Map

| | 用途 |
|--|------|
| Diagram Graph | 描述性图：问题因果、用户旅程、系统边界、决策树、数据责任（非 C4 SoT） |
| Function Map | 现有代码结构真相；立论中若用户声称「仓库没有 X」而索引显示有，可用只读探索打脸 |

歧义时：先问一句「要画愿景结构还是对照现有代码结构？」——对齐 Diagram Graph D3。

### 1.4 明确非目标（v1）

- 不做无限苏格拉底闲聊（层数、每层题数、总会话轮次有上限）
- 不做「AI 表演性反对一切新功能」；必须有诚实 Go 路径
- 不自动切 Agent、不静默写业务代码
- 不替代 PRD 长文写作工具（Thesis 是短契约，不是 PRD）
- 不把 FP 做成 Custom Mode 市场包的唯一形态（可另做 skill，但产品主入口是 Ask 二级）
- 不在 v1 做多人协作批注 / 跨设备同步 thesis
- 不发明 Function Map `epic_flow` UI 字段

---

## 2. 锁定的产品决策（拍板）

讨论中待拍板三项，本计划默认如下（实现前可改文档，改后勿 silently 偏航）：

| # | 决策点 | **锁定默认** | 备选 |
|---|--------|--------------|------|
| D1 | 愿景型 prompt 是否强制切 FP | **Soft suggest**（一条可拒横幅 / chip）；不强制 | Always suggest / Never |
| D2 | Thesis 是否落盘 | **是** → `.projectos/thesis/<id>.json` | 仅 session 内存 |
| D3 | 首次出图时机 | **L4 默认出图**；L1 末可选「先画一张草图」CTA | 每层都出图（否决：抖且贵） |

补充锁定：

| # | 决策 | 锁定 |
|---|------|------|
| D4 | 一级枚举 | **不**新增 `ChatMode` |
| D5 | 工具策略 | 与 Ask 相同：只读探索；禁止 write / shell 写 |
| D6 | Verdict 集合 | `go` \| `pivot` \| `kill` \| `park` |
| D7 | 深度上限 | 最多 **5** 层（L0–L4）；每层主问题 **1** + follow-up **≤1**；总会话模型回合软上限 **16**（超限强制进入 Thesis 草稿） |
| D8 | 选项卡 | 复用 Plan clarifying 控件；每题 2–5 options + 自定义 +「不确定」+「跳过本层」+ meta「这问题问错了」 |
| D9 | features.json | Go 后 **可选** 用户确认才写入 `planned`；尊重 `locked: true` |
| D10 | 切换一级 mode 离开 Ask | 默认 **保留** `pendingFirstPrinciples` 草稿；回到 Ask·FP 可续；isolate 新会话则不带（跟 `chatModeSwitch` 偏好） |

---

## 3. 立论协议（L0–L4 + Exit）

### 3.1 层定义

| Layer | 名称 | 目标 | 关键产出字段 |
|-------|------|------|----------------|
| **L0** | Anchor 现象锚定 | 具体事件，非抽象愿望；痛点归属 | `problem_statement`, `pain_owner` |
| **L1** | First Principles 拆解 | Who / Job / Constraint / Cost of inaction / Falsifier | `atomic_claims[]` |
| **L2** | Kill Test 反证 | 淘汰站不住的路 | `verdict_candidate`, `killed_alternatives[]` |
| **L3** | MVP Obligation | 最小可证伪切片 + 验收信号 + non-goals | `mvp_obligation`, `acceptance_signals`, `non_goals` |
| **L4** | Structure 外化 | 图 + 结构主张对齐 | `diagram_ids[]`, 可选结构笔记 |
| **Exit** | Thesis 结案 | 用户确认主张与 verdict | `thesis`, `verdict`, `confidence` |

### 3.2 Atomic claim 状态

```ts
type AtomicClaimStatus = 'assumed' | 'evidenced' | 'contested'
```

- `assumed`：用户口述、无仓内/外部证据  
- `evidenced`：只读探索或用户粘贴证据支撑  
- `contested`：与前层答案或仓内事实冲突（必须经冲突小卡）

### 3.3 单轮标准件（UI 合同）

每轮助手消息必须结构化为：

1. **Reflect**（≤2 句）：复述当前理解；用户可否决  
2. **Primary question**（恰好 1 个）  
3. **Options**（2–5）+ 自定义 + 不确定 + 跳过 +（可选）问错了  
4. **Progress**：`立论 n/5 · <层名>`  
5. 可选 **graphHint**：点选后对 diagram 的语义补丁意图（见 §6）

禁止：单轮抛出 3+ 互不相关开放题；禁止无选项的长问卷。

### 3.4 Kill Test 示例选项（产品文案，非硬编码唯一集）

- 现有 workaround 够用 ≥6 个月 → 倾向 `park`  
- 只有我自己痛、无第二用户 → 个人脚本，不做产品功能 → 倾向 `kill` 或缩小 scope  
- 这是另一问题的症状 → `pivot`  
- 过了反证 → 继续 L3  

### 3.5 Exit Gate · Thesis Card 必填字段

| 字段 | 说明 |
|------|------|
| `title` | 短标题 |
| `thesis` | 一句话问题主张 |
| `forWhom` | 为谁 |
| `whyNow` | 为何现在 |
| `mvp` | 最小切片 |
| `successSignal` | 如何知道做对了 |
| `nonGoals` | 明确不做 |
| `confidence` | 1–5 用户自评 |
| `verdict` | go / pivot / kill / park |
| `atomicClaims` | 摘要列表（只读展示，可展开） |
| `diagramIds` | 关联图 |

**Confirm 闸门**：`thesis` / `forWhom` / `mvp` / `successSignal` / `verdict` / `confidence` 均已填；若 `verdict === 'go'` 且 `confidence <= 2` → 二次确认文案（「低把握仍要做？」）。

未过 Exit Gate：禁止 handoff 到 Plan Build / Agent 写路径；允许「保存草稿 / 稍后继续」。

---

## 4. 数据模型（目标契约）

新建 `projectos/contracts/first-principles.ts`（**禁止**在 workbench 内另定义形状）。

### 4.1 枚举与层

```ts
type AskSubMode = 'chat' | 'first_principles'

type FirstPrinciplesLayerId = 'L0' | 'L1' | 'L2' | 'L3' | 'L4'

type FirstPrinciplesVerdict = 'go' | 'pivot' | 'kill' | 'park'

type FirstPrinciplesSessionStatus =
  | 'framing'          // 等待首轮模糊 vision
  | 'layer_active'     // 某层进行中
  | 'conflict'         // 冲突小卡
  | 'thesis_review'    // Exit Gate
  | 'concluded'        // 已确认 verdict
  | 'abandoned'        // 用户放弃
```

### 4.2 问题与答案（对齐 Plan Clarifying）

优先 **复用** `ClarifyingQuestion`；FP 扩展旁挂字段（或 `FirstPrinciplesQuestion = ClarifyingQuestion & { ... }`）：

```ts
type FirstPrinciplesQuestion = ClarifyingQuestion & {
  layerId: FirstPrinciplesLayerId
  blocking: boolean
  allowSkip: boolean
  metaOptions?: Array<'unsure' | 'skip_layer' | 'wrong_question'>
  graphHint?: {
    diagramKind?: 'causal' | 'journey' | 'boundary' | 'decision' | 'data_responsibility'
    patch?: Array<{ op: 'emphasize' | 'dim' | 'relabel' | 'add_note'; targetKey: string; value?: string }>
  }
}
```

答案：

```ts
type FirstPrinciplesAnswer = {
  questionId: string
  kind: 'option' | 'custom' | 'unsure' | 'skip_layer' | 'wrong_question'
  selectedOptionId?: string
  text?: string
  answeredAt: string
}
```

### 4.3 Session

```ts
type FirstPrinciplesSession = {
  version: '0.1.0'
  id: string
  projectId: string
  chatSessionId?: string
  status: FirstPrinciplesSessionStatus
  currentLayerId: FirstPrinciplesLayerId
  rawVision: string
  layers: Array<{
    id: FirstPrinciplesLayerId
    status: 'pending' | 'active' | 'complete' | 'skipped'
    questions: FirstPrinciplesQuestion[]
    answers: FirstPrinciplesAnswer[]
  }>
  atomicClaims: Array<{
    id: string
    text: string
    status: AtomicClaimStatus
    evidenceRefs?: string[]  // path#L or message ids
  }>
  problemStatement?: string
  painOwner?: 'self' | 'target_user' | 'trend' | 'unknown'
  killedAlternatives: string[]
  mvpObligation?: string
  acceptanceSignals: string[]
  nonGoals: string[]
  diagramIds: string[]
  thesis?: FirstPrinciplesThesis
  turnCount: number
  createdAt: string
  updatedAt: string
  concludedAt?: string
}

type FirstPrinciplesThesis = {
  title: string
  thesis: string
  forWhom: string
  whyNow: string
  mvp: string
  successSignal: string
  nonGoals: string[]
  confidence: 1 | 2 | 3 | 4 | 5
  verdict: FirstPrinciplesVerdict
}
```

### 4.4 API 形状（规划）

| 方法 | 作用 |
|------|------|
| `startFirstPrinciples({ projectId, chatSessionId?, vision })` | 创建 session；首轮 L0 问题 |
| `answerFirstPrinciplesTurn({ sessionId, answer })` | 记账 + 生成下一问或进入冲突/thesis |
| `reviseFirstPrinciplesLayer({ sessionId, layerId })` | 回退层；后续层标 stale |
| `generateFirstPrinciplesDiagram({ sessionId, kind })` | 调 Diagram Graph；写回 `diagramIds` |
| `confirmFirstPrinciplesThesis({ sessionId, thesis })` | Exit Gate；status→concluded |
| `handoffFirstPrinciples({ sessionId, target: 'plan' \| 'agent' \| 'ask_chat' })` | 注入上下文并切 mode / submode |
| `listTheses(projectId)` / `getThesis(id)` | 读落盘 |

IPC / `ProjectOSLocalApi` / client transport / contracts `api.ts` 同步加薄封装；Mock fixture 必有。

### 4.5 持久化

```text
.projectos/thesis/
  index.json          # id, title, verdict, updatedAt, chatSessionId?
  <id>.json           # Full FirstPrinciplesSession 或 concluded 精简快照
```

- `concluded` 且 D2=是 → 写盘  
- `park` / `kill` 同样落盘（备忘价值更高）  
- 进行中草稿：优先 chat session snapshot 字段；崩溃恢复后再 hydrate

Chat session 旁挂（`chat-session.ts` 演进）：

```ts
askSubMode?: AskSubMode
pendingFirstPrinciplesSessionId?: string
```

---

## 5. 交互全流程（端到端）

```text
① 入口
   A. Composer：chatMode=ask → 二级 pill「Chat | First Principles」
   B. Soft suggest：普通 Ask/Agent/Plan 检测到愿景型输入 → chip「用立论理清？」
   C. Skill：`ask-first-principles-mode` 切 ask + askSubMode

② Framing
   Placeholder：「描述一个你想做、但还说不清的功能或冲动」
   用户提交 rawVision → startFirstPrinciples

③ 双表面
   Chat：层进度 + Layer Card（点选）
   Center：需要时打开 Diagram Graph overlay
   （可选）Diagram notebook 记与图绑定的笔记——v1 不强制第三栏

④ Layer loop
   Reflect → 一问 → 点选 → 更新 claims / thesis 草稿
   → 若 graphHint 且已有 diagram → 语义补丁（v1 可降级为「附注 + 建议 regenerate」）
   → 冲突 → Conflict Card → 解决后回层
   → 层完成 → 下一层；L3 完 → CTA「生成结构图」进 L4
   → turnCount 触顶 → 强制 thesis_review（草稿自动填充已知字段）

⑤ Thesis Review
   ThesisReviewCard：可编辑字段 + verdict + confidence
   Confirm → 落盘 → concluded
   Pivot → status=framing/layer_active（保留可复用 answers）
   Kill/Park → 落盘；CTAs 仅「回 Ask Chat / 查看 thesis」

⑥ Handoff（仅 go）
   [升 Plan] setChatMode('plan') + createPlan(objective from thesis, existingAnswers)
   [切 Agent] setChatMode('change') + setChatInput(thesis brief) + 可选 auto-send=false
             → 仍经 Alignment / refine
   [回 Ask Chat] askSubMode='chat'；transcript 保留
```

### 5.1 Soft suggest 启发式（v1 可规则，后可模型）

满足任意 ≥2 条则建议：

- 输入含愿景词：感觉 / 也许 / 要不要加 / 酷 / 想法 / vision / maybe we should  
- 无具体文件路径、无 `@` 附件、无 repro 步骤  
- 句子是产品功能名词堆砌，缺用户/场景/成功标准  
- 长度短（如 < 80 字）且无问号技术问题形态  

Suggest UI：composer 上方非阻塞 chip；点「开始立论」带当前 input 为 `rawVision`；点忽略写入 session 级 suppress（本会话不再提示同类）。

### 5.2 Composer UX

- `chatMode !== 'ask'` 时隐藏二级 pill  
- Ask + `first_principles`：placeholder / help 文案换成立论文案  
- Mode tone：沿用 Ask 色；pill 上小标「立论」以免与 Chat 混淆  
- 发送键：在 `thesis_review` 等待 Confirm 时，主发送可禁用或改为「补充说明」旁路（避免误开新层）——推荐：**Confirm 在卡片上**，composer 仍可发「补充上下文」作为非层问题（计入 turnCount）

### 5.3 卡片组件

| 组件 | 职责 |
|------|------|
| `AskSubModeToggle` | Chat / First Principles |
| `FirstPrinciplesProgress` | L0–L4 进度 |
| `FirstPrinciplesLayerCard` | Reflect + 复用 clarifying 选项 UI |
| `FirstPrinciplesConflictCard` | 矛盾双方 + 保留哪边 |
| `ThesisReviewCard` | Exit Gate 编辑与 Confirm |
| `FirstPrinciplesSuggestChip` | Soft suggest |
| `ThesisHandoffBar` | Go 后 Plan / Agent / Ask |

样式：对齐 `PromptRefinementCard.module.css` / Plan 卡；tech tokens；不做 glass。

---

## 6. Diagram 联动细节

### 6.1 出图

- D3：默认 L4 用户点「生成结构图」或层自动进入时 `generateFirstPrinciplesDiagram`  
- 可选 L1 末 CTA「先画草图」→ 同 API，`kind` 默认 `causal` 或 `journey`  
- 提示词由服务从 session 字段装配（problem / claims / non-goals），不让用户从零写长 prompt  
- 成功：`diagramIds` push；Chat 插 `DiagramSummaryCard`；打开 overlay（对齐 DG D4）

### 6.2 点选 → 图更新（分里程碑）

| 里程碑 | 行为 |
|--------|------|
| FP-3 | 出图 + Summary Card；点选**不**改图（只更新文字 thesis） |
| FP-5 | `graphHint` → 对同一 `diagramId` **regenerate with patch brief**（整图重渲可接受） |
| FP-later | 真·语义补丁（emphasize/dim/relabel）无闪全页——依赖 Diagram Graph interactive 能力 |

v1 验收以 FP-3 为准；FP-5 为增强。

### 6.3 图类型菜单（L4）

- 问题因果（causal）  
- 用户旅程（journey）  
- 系统边界（boundary）  
- 决策树（decision）  
- 数据责任（data_responsibility）  

映射到现有 `DiagramVisualTypeHint` 时：能进 enum 的进；否则 `auto` + prompt 内写明类型（契约可后续扩 enum）。

---

## 7. 服务与 Prompt 设计

### 7.1 `FirstPrinciplesService` 职责

- 维护 session 状态机（§8）  
- 组装 system prompt：**只问当前层**；注入已答摘要 + atomic claims  
- 解析模型输出为 **严格 Zod**：`reflect` + `question` + `options` + 可选 `claimUpdates` + 可选 `graphHint`  
- 失败降级：模板层问题（每层 1 套 fallback），保证 UI 不空转  
- 只读探索：复用 Ask `GroundedAnswerService` / exploration 路径（若已有 A1）；用于 `evidenced` / 打脸；无探索则跳过，不阻塞立论

### 7.2 System prompt 要点（实现时落 skill 或服务内常量）

- 你是立论搭档，不是实现工程师  
- 禁止给出「开始写代码」的步骤清单；可建议「结案后去 Plan」  
- 每轮只推进一层一个主问题  
- 必须提供可点选选项；选项要互斥、可执行  
- 鼓励 falsifier；允许 Go  
- 若用户已给出足够信息，可 `skip` 剩余层并生成 thesis 草稿  

### 7.3 Handoff 文本装配

```text
# Thesis (First Principles)
Verdict: go
Confidence: 4/5
Statement: ...
For: ...
MVP: ...
Success: ...
Non-goals: ...
Claims: ...
Diagrams: ...
```

写入 Plan `objective` 前言或 Agent composer brief；并传 `existingAnswers` 派生自 layers.answers。

---

## 8. 状态机

```text
framing
  → layer_active (L0)
  → layer_active (L1…L4) ⇄ conflict
  → thesis_review
  → concluded
  → (handoff side-effect: plan | change | ask chat)

任意层 → abandoned（用户退出二级 mode 且选择丢弃）
pivot from thesis_review → layer_active 或 framing
```

非法转移由服务拒绝（`ProjectOSError`）；UI 不假设客户端自建状态。

---

## 9. 证据级现状（实现前基线）

| 能力 | 现状 | 缺口 |
|------|------|------|
| Ask 只读问答 | `sendPrompt(ask)` → GroundedAnswer | 无分层立论状态机 |
| Clarifying 选项卡 | Plan `PlanClarificationQuestionItem` | 未抽共享；FP 需复用 |
| Alignment | Agent 执行前契约 | 更下游；无 Why 协议 |
| Diagram Graph | `generateDiagram` + overlay + Summary Card | 无 FP session 装配 prompt / 无 graphHint |
| Ask 二级态 | 无 `askSubMode` | 需加 |
| Mode skills | `ask-mode` 等 | 需 `ask-first-principles-mode` |
| Thesis 落盘 | 无 | `.projectos/thesis/` |
| Soft suggest | 无 | 启发式 chip |

代码锚点：

- `workbench/.../composer/chatModeVisuals.ts` — `CHAT_MODES`  
- `workbenchStore.setChatMode` / `sendPrompt`  
- `PlanClarificationQuestionItem.tsx`  
- `services/plan-service.ts`、`grounded-answer-service.ts`  
- `services/diagram-graph/*`  
- `contracts/chat-session.ts`、`implementation-plan.ts`

---

## 10. 里程碑切片

| ID | 范围 | 验收 |
|----|------|------|
| **FP-0** | 契约 `first-principles.ts` + Zod 单测；api 类型桩；本文档互链 Chat-Modes / Alignment / Diagram | CI 类型通过；无 UI |
| **FP-1** | `askSubMode` store + Composer 二级 pill + i18n + skill 切换；不调用模型 | Ask 下可切 Chat/FP；离开 Ask 隐藏 pill；Shift+Tab 不变 |
| **FP-2** | `FirstPrinciplesService` 状态机 + fallback 问题（可先无 LLM）+ Layer Card 点选走通 L0–L4→Thesis | 纯 UI/服务 fixture 可结案 Kill/Park/Go |
| **FP-3** | LLM turn（严格 JSON）+ Soft suggest chip + Thesis 落盘 `.projectos/thesis` | 模糊 vision 经点选产出 Thesis；刷新可 list |
| **FP-4** | Handoff → Plan / Agent；Plan 继承 answers；Go+低 confidence 二次确认 | 同义题不重复；Agent 仍经 Alignment |
| **FP-5** | Diagram：L4 出图 + Summary Card + overlay；可选 L1 草图 CTA | 结案 session 含 `diagramIds`；图可打开 |
| **FP-6** | 只读探索打脸（复用 Ask exploration）+ Conflict Card + features.json 可选 planned 写入 | 有证据 claim→evidenced；locked feature 不覆盖 |
| **FP-7** | 打磨：进度动画、stale 层回退、turn 上限、Mock/Real 双通路测试、Eval 清单 | 清单全绿 |

**建议实施顺序**：FP-0 → FP-1 → FP-2 → FP-3 → FP-4 → FP-5 → FP-6 → FP-7。  
**可并行**：FP-5 的 Diagram 接线与 FP-4 handoff 在契约稳定后并行。

---

## 11. 测试与 Eval 清单

### 11.1 单测

- Zod：session / answer / thesis / 非法 verdict  
- 状态机：合法转移 / 拒绝非法转移  
- turn 上限强制 `thesis_review`  
- handoff 装配字符串含非空 thesis 字段  

### 11.2 UI / 集成

- `askSubMode` 仅 Ask 可见  
- 点选 option / custom / skip / wrong_question  
- Confirm 闸门（缺字段不可 concluded）  
- Soft suggest 可忽略且本会话 suppress  
- Handoff Plan：`createPlan` 收到 inherited answers  
- Handoff Agent：`chatMode==='change'` 且未绕过 refine/alignment  
- Kill/Park：无业务文件 write；thesis 文件可存在  

### 11.3 产品 Eval（手动）

1. 输入「我想加一个 AI 助手，感觉会很酷」→ 建议立论 → 走完 → Pivot 或 Kill 合理  
2. 输入真实个人痛点 → Go → Thesis 可执行 → Plan 不再问「为谁做」  
3. L4 出图与主张一致（人工看）  
4. 中途切 Plan 再回 Ask·FP：草稿仍在（非 isolate）  
5. 普通 Ask「这个函数做什么」→ **不**误进 FP（suggest 不触发或易忽略）  

---

## 12. i18n 与文案键（规划）

```text
chat.askSubMode.chat
chat.askSubMode.firstPrinciples
chat.firstPrinciplesModeHelp
firstPrinciples.placeholder
firstPrinciples.progress          # 立论 {current}/5 · {layer}
firstPrinciples.suggestChip
firstPrinciples.thesis.title
firstPrinciples.verdict.go|pivot|kill|park
firstPrinciples.handoff.plan|agent|ask
firstPrinciples.lowConfidenceConfirm
```

中英同步；禁止 JSX 硬编码用户可见文案。

---

## 13. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 变成说教机器人，劝退一切功能 | 选项含明确 Go；Kill 必须给可反驳理由；评测看 Go 路径 |
| 与 Plan clarifying 重复折磨 | Handoff 强制继承 answers；文档写进 Plan 服务注释 |
| 每层出图贵且抖 | D3：默认仅 L4；点选改图延后到 FP-5 |
| 污染一级 mode 心智 | D4：二级 pill；文档与 Product Lab 同样强调 |
| 模型输出不稳定 | Zod 严格解析 + 每层 fallback 模板 |
| Solo 用户嫌慢 | 允许 skip 层；信息充足可早进 thesis；软上限 16 回合 |

---

## 14. 开放问题（实现中遇到再锁）

1. Thesis index 是否进 Session Graph strip（intent/decision）？默认 **v1 不做**，结案后手动「钉到 Session Graph」可作 FP-7+。  
2. `graphHint` 补丁格式是否上升为 Diagram Graph 一等 API？默认 FP-5 用 regenerate brief。  
3. Soft suggest 是否对 Agent mode 也出示？默认 **Ask + Plan** 出示；Agent 仅当 executionPolicy 未开跑且输入极像愿景时出示一次。  
4. 中文产品名「立论」vs「第一性原理」：UI 短名建议 **立论**，帮助文案写「第一性原理」。  

---

## 15. 落地检查清单（DoD）

- [ ] 契约 + 服务 + UI 均按 FP-0…FP-7 可演示  
- [ ] `CHAT_MODES` / `CYCLE_CHAT_MODES` 无 `first_principles`  
- [ ] 未 concluded 无法经 FP handoff 直接写文件  
- [ ] Go → Plan/Agent 带 thesis；Kill/Park 只落 thesis  
- [ ] Diagram 双写符合 DG D4  
- [ ] en/zh i18n 齐全  
- [ ] Chat-Modes 文档增加一小节「Ask 二级：First Principles」互链本文  
- [ ] 用户可在 Workbench 走完：模糊 vision → 点选 → Thesis → 升 Plan  

---

## 16. 附录：与前序讨论的追溯

| 用户原话要点 | 文档落点 |
|--------------|----------|
| Solo founder / 模糊 vision / 经不起推敲 | §0、L0–L1 |
| 第一性原理一步步问清楚再开发 | §3、Exit Gate |
| Ask 的二级 mode | §1.1、D4、FP-1 |
| 卡片点选 | §3.3、§5.3、复用 Plan clarifying |
| 联动 diagram graph | §6、FP-5 |
| 摸清后切 Agent | §5 ⑥、FP-4 |

**下一步（实现）**：从 **FP-0** 契约与互链开始，再 FP-1 UI 壳，避免先做 prompt 导致无状态机空转。
`)