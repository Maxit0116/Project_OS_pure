# Project OS 第一阶段全产品执行计划

**状态**：Draft v0.1  
**范围**：全产品第一阶段  
**阶段名称**：MVP Showcase / Whole Product Loop  
**主要读者**：内部开发者、演示负责人、早期设计伙伴  
**来源文档**：`Product-PRD.md`、`MVP-PRD.md`、`MVP-Showcase-Architecture-and-Dev-Plan.md`、`Full-Product-Architecture-and-Dev-Plan.md`

---

## 1. 第一阶段定义

第一阶段是 Project OS 的第一个完整产品切片。它不是完整生产级产品，但必须用一条受控路径展示 Project OS 的完整承诺：

1. 打开一个真实 sample codebase。
2. 将代码库渲染成 Function Map。
3. 渲染按功能语义分组的 Semantic File Tree。
4. 用户选择功能或文件后，Chat context 立即切换。
5. 执行前展示 Prompt Refinement。
6. 以 Agent Flow 展示 AI 执行过程。
7. 针对真实 sample files 打开真实 diff。
8. 触发一个错误。
9. 用 Debug Harness 展示根因推理。
10. 能可靠 reset 并反复 replay 整条 demo。

第一阶段必须像真实产品，而不是一次性 mock。可以在生产自治能力尚未必要的地方使用确定性 scenario data，但这些确定性路径必须位于同一套 schema 和 service interface 之后，以便后续阶段替换为真实实现。

---

## 2. 需求摘要

| 需求 | 第一阶段决策 | 验收标准 |
| --- | --- | --- |
| IDE 基座 | Void adoption spike 通过则使用 Void fork；保留 Electron + Monaco fallback。 | 开发者可以启动所选 shell，并看到 Project OS workbench surface。 |
| 产品表面 | 构建完整产品闭环，不做孤立 demo。 | Function Map、Semantic File Tree、Chat、Prompt Refinement、Agent Flow、Diff Review、Terminal/Error、Debug Harness 可见并联动。 |
| sample workspace | 使用 `sample-graph-saas/` 作为受控 demo project。 | demo 以 workspace 形式打开 sample，并渲染 8-10 个节点的精选 presentation graph。 |
| 数据骨架 | 只使用本地 `.projectos/` 文件。 | 第一阶段的 graph、tree、current work、run、harness、scenario 文件都能通过已记录 contracts 校验。 |
| cloud/database | 不实现生产 cloud；只保留 cloud schema 作为未来 contract。 | demo 核心路径不依赖 cloud auth、billing、sync 或 remote database。 |
| model behavior | deterministic first；可选 real provider path 也必须走同一 interface。 | 核心 demo 在没有 model key、没有网络时仍可运行。 |
| presentation reliability | 必须有一个 reset path 和已排练脚本。 | demo 可从干净 state 连续 replay 5 次。 |

---

## 3. 产品结果

第一阶段成功时，观众应能在 5-7 分钟 demo 后说清楚：

- “我能把 app 看成 feature，而不是只看 file。”
- “点某个 feature，AI 就拿到正确 context。”
- “改代码前，AI 会先告诉我它理解了什么。”
- “AI 执行过程是可见、可检查的 flow。”
- “我在 IDE 里 review 真实代码变更。”
- “debug 和 feature work 分离，并且目标是 root cause。”

内部结果：

- 第一批可持续演进的 Project OS contract 已经存在：local schema、typed local API、UI surface、scenario data、reset fixture。

---

## 4. 非目标

第一阶段不包含：

- 任意 repository 的通用支持。
- 生产级 cloud auth、billing、usage metering、team sync、remote database writes。
- 多人协作。
- extension marketplace 或 workflow marketplace。
- 通用 static analysis。
- 通用 Debug Harness 正确性。
- 生产级 auto-update 或发行渠道。
- 依赖 model provider 或网络稳定性的 demo 核心路径。

---

## 5. 第一阶段架构

```
Project OS Stage 1 Desktop
|
|-- IDE Foundation
|   |-- Void fork after spike, or fallback Electron + Monaco
|   |-- editor, diff editor, terminal panel, command palette
|
|-- Project OS Workbench
|   |-- Semantic File Tree
|   |-- Function Map
|   |-- Chat with context header
|   |-- Prompt Refinement card
|   |-- Agent Flow
|   |-- Debug Harness
|   |-- Presentation control / reset
|
|-- Local Core Services
|   |-- Workspace service
|   |-- Project graph service
|   |-- Semantic tree service
|   |-- Context assembler
|   |-- Prompt refinement service
|   |-- Agent run service
|   |-- Diff service
|   |-- Harness service
|   |-- Demo scenario service
|
|-- Local Storage
|   |-- sample-graph-saas/.projectos/*
|
|-- Optional Model Adapter
    |-- real provider path when configured
    |-- deterministic fixture path by default
```

边界规则：UI component 只调用 typed Project OS services。UI component 不直接读取任意 `.projectos` 文件，不直接调用 model provider，也不负责 scenario timing logic。

---

## 6. 第一阶段数据契约

第一阶段把本地数据当作产品 database。demo 完成前，sample workspace 中必须具备这些文件：

```
sample-graph-saas/
  .projectos/
    project.json
    graph.json
    semantic-tree.json
    current-work.json
    settings.json
    agent-runs/
      google-login-run.jsonl
      auth-bugfix-run.jsonl
    harness/
      auth-provider-error.json
    demo-scenarios/
      google-login.json
      auth-bugfix.json
    demo-reset.json
```

| 文件 | 第一阶段 owner | 必需行为 |
| --- | --- | --- |
| `project.json` | Workspace service | 标识 sample project、framework、presentation mode、active scenario。 |
| `graph.json` | Project graph service | 存放完整 sample graph，并通过 presentation metadata 或 scenario 定义精选 presentation subset。 |
| `semantic-tree.json` | Semantic tree service | 按 feature、status、route/API role 组织文件。 |
| `current-work.json` | Current work service | 记录 focused node、file、run、error、recent changes。 |
| `settings.json` | Settings service | 存放 presentation mode 和可选 provider settings。 |
| `agent-runs/*.jsonl` | Agent run service | presentation mode 下流式读取确定性 run events。 |
| `harness/*.json` | Harness service | 存放 error evidence、hypotheses、chosen root cause、verification。 |
| `demo-scenarios/*.json` | Demo scenario service | 将已知 prompt/error 映射到 refinement、flow、diff、harness fixtures。 |
| `demo-reset.json` | Demo scenario service | 将 source 和 `.projectos` state 恢复到 opening scene。 |

schema 规则：

- 每个文件在适用处包含 `version`、`projectId`、timestamp metadata。
- 每条 graph edge 都引用有效 node。
- 每个 linked file 都真实存在，或显式标记为 stale。
- Agent run log 使用 append-only JSON Lines。
- Harness record 必须包含 evidence、hypotheses、patch assessment、root cause、verification。
- 第一阶段不创建 cloud database records。

---

## 7. 接口契约冻结

第一阶段应实现 MVP plan 和 full-product plan 中的 local API 形状。具体 host mechanism 可随 shell 调整，但 workbench 应依赖下面的产品级 contract：

```ts
interface Stage1ProjectOSApi {
  openSampleWorkspace(): Promise<ProjectOSProject>
  openWorkspace(path: string): Promise<ProjectOSProject>
  analyzeWorkspace(projectId: string): Promise<ProjectGraph>
  getProjectGraph(projectId: string): Promise<ProjectGraph>
  getSemanticTree(projectId: string): Promise<SemanticTree>
  getContext(request: ContextRequest): Promise<ContextPayload>
  refinePrompt(request: PromptRefineRequest): Promise<PromptRefinement>
  confirmExecution(refinementId: string): Promise<AgentRun>
  streamAgentRun(runId: string, cb: (event: AgentRunEvent) => void): Disposable
  getDiff(runId: string): Promise<GeneratedDiff>
  applyDiff(runId: string): Promise<ApplyResult>
  reportError(projectId: string, rawError: string): Promise<HarnessRecord>
  startHarnessFix(errorId: string): Promise<AgentRun>
  resetDemo(projectId: string): Promise<ProjectOSProject>
}
```

full-product plan 中的 cloud contracts 在第一阶段只作为未来 contract。它们可以以 inert interface definition 或 design note 形式存在，但不能成为 demo 的实时依赖。

---

## 8. Sample Project 策略

`sample-graph-saas/` 是第一阶段 demo workspace 的 source of truth。

presentation graph 要求：

- 默认可见 8-10 个 node。
- 为 Google login scenario 保留 1 个 suggested node。
- 为 Debug Harness scenario 保留 1 条 error state path。
- 至少 5 条容易解释的 edge。
- 每个可见 node 至少有 1 个 primary file；如可行，再有 1 个 supporting file。

raw sample graph 可以包含比 presentation graph 更多的 node。第一阶段应通过下面两种生产兼容方式之一处理：

1. 在 graph node 上使用 `presentation.visibleByDefault` metadata；
2. 在 `demo-scenarios/*.json` 中定义 active scenario 的 visible graph。

不要为了简化 demo 删除有价值的 sample features。产品应能 curate 默认展示内容，同时保留后续阶段需要的完整 graph data。

必需 demo scenarios：

| Scenario | Trigger | Output |
| --- | --- | --- |
| Google login | 从 `feat_login` / User Authentication 发起 prompt | Prompt refinement、Agent Flow、diff preview、graph status update。 |
| Auth bugfix | Terminal/runtime error | Error mapping、Harness record、debug Agent Flow、verification status。 |
| Demo reset | Command 或 button | Source files 和 `.projectos` files 恢复到 opening state。 |

---

## 9. 工作流

### Workstream A：Void Adoption 与 Shell

目标：决定并准备 IDE foundation。

交付物：

- Void fork 可在 macOS 本地 build。
- build/dev commands 已记录。
- workbench contribution points 已定位。
- 最小 Project OS view 可渲染。
- 如 Void 失败，Electron + Monaco fallback path 已记录。

验收：

- `Project OS: Open Sample Workspace` command 已存在或已 stub。
- placeholder Project OS workbench 可在无 sample data 时渲染。
- 在继续深入 shell work 前，continue/fallback decision 已写入文档。

### Workstream B：第一阶段 Local Core

目标：让 `.projectos/` 成为本地产品 database。

交付物：

- project、graph、tree、current work、runs、harness、scenarios、reset 的 schema definitions。
- `.projectos/` loader/writer service。
- sample fixtures validation script。
- 恢复 sample state 的 reset service。

验收：

- clean checkout 可以 validate 所有第一阶段 fixture files。
- reset 连续运行两次后得到完全相同的 state。
- invalid edge references 或 missing linked files 会导致 validation fail。

### Workstream C：Sample Workspace 与 Scenario Fixtures

目标：让 `sample-graph-saas/` 成为可靠 demo asset。

交付物：

- 精选 presentation graph。
- semantic tree fixture。
- Google login scenario fixture。
- auth bug scenario fixture。
- 触达真实 sample files 的 deterministic diff fixture。
- seeded error fixture 和 harness record。

验收：

- demo graph 打开后默认显示 8-10 个 visible nodes。
- Google login diff 引用真实 sample files。
- auth bug 映射到 User Authentication 和具体 technical files。
- sample 可 reset，无需手动 cleanup。

### Workstream D：Project OS Workbench UI

目标：让产品在一个 screen 内看起来清楚。

交付物：

- three-zone layout：
  - left：Semantic File Tree；
  - center：Function Map / Agent Flow / Code / Diff；
  - right：Chat / Prompt Refinement / Debug Harness。
- graph node selection。
- file tree selection。
- context header。
- presentation controls。

验收：

- 第一个 workspace screen 同时显示 Function Map、Semantic File Tree、Chat context。
- 在 sample project 中，选择 graph node 后 200 ms 内高亮 related files 并更新 Chat context。
- demo 核心 surface 不隐藏在多步导航之后。

### Workstream E：Context 与 Prompt Refinement

目标：证明 point-to-context 和 confirm-before-execute。

交付物：

- project、feature、file、debug、flow step scopes 的 context assembler。
- Prompt Refinement card。
- Google login refinement fixture。
- confirm/edit/skip controls。

验收：

- User Authentication context 包含 summary、linked files、upstream/downstream nodes、recent changes。
- Google login prompt 离线生成 deterministic refinement。
- 用户可以 confirm refinement，并创建 agent run。

### Workstream F：Agent Flow 与 Diff Review

目标：让 AI execution 可见、可 review。

交付物：

- Agent run event stream reader。
- Agent Flow panel。
- timed presentation playback。
- Diff preview integration。
- apply result 更新 graph/tree/current-work state。

验收：

- confirm refinement 后自动打开 Agent Flow。
- flow steps 展示 understand、retrieve context、inspect files、plan、generate diff、verify。
- Diff preview 打开真实 sample files。
- apply curated diff 后，相关 graph node 和 files 标记为 changed 或 active。

### Workstream G：Debug Harness Showcase

目标：证明 root-cause repair。

交付物：

- Terminal/error trigger。
- auth error 的 error-to-node/file mapper。
- 展示 evidence、hypotheses、patch rejection、root cause、verification 的 Harness UI。
- debug Agent Flow events。
- status sync 回 Function Map 和 Semantic File Tree。

验收：

- trigger auth error 后，User Authentication 和 related files 标记为 error。
- Harness 展示至少 2 个 hypotheses、1 个 rejected patch-like fix、1 个 chosen root cause、verification result。
- harness flow 完成后 graph/tree state 回到 green。

### Workstream H：Presentation QA 与 Rehearsal

目标：让第一阶段可在压力下稳定演示。

交付物：

- 5-7 分钟 script。
- reset checklist。
- key screens screenshot checklist。
- smoke test checklist。
- recorded rehearsal。

验收：

- demo 可 reset 并连续 replay 5 次。
- core path 在 network disabled 情况下工作。
- 每个 required screen 都能在 desktop presentation viewport 渲染。
- presenter 有 optional model/provider step 的 written fallback。

---

## 10. 顺序与 Gates

| Gate | 必须成立 | 解锁 |
| --- | --- | --- |
| Gate 0: Foundation Decision | Void adoption spike 已有 continue/fallback decision。 | workbench implementation。 |
| Gate 1: Contract Freeze | Stage 1 schemas 和 local API 已接受。 | UI/service parallel work。 |
| Gate 2: Sample Ready | curated graph、semantic tree、scenario、harness、reset fixtures 已存在。 | end-to-end demo assembly。 |
| Gate 3: Core Loop Ready | graph selection、context、prompt refinement、Agent Flow、diff 已联通。 | Debug Harness integration。 |
| Gate 4: Harness Ready | error mapping、root cause record、verification、state sync 已工作。 | presentation hardening。 |
| Gate 5: Rehearsal Ready | reset、offline mode、screenshots、script、recorded run 已通过。 | Stage 1 signoff。 |

Gate 5 完成前，不开始 broad real-repository support。

---

## 11. Ticket 拆分

### S1.0 Foundation

| Ticket | 描述 | 完成条件 |
| --- | --- | --- |
| S1.0.1 | validate Void fork build 和 contribution points。 | build notes 和 continue/fallback decision 已存在。 |
| S1.0.2 | 添加 Project OS placeholder workbench。 | placeholder 在 chosen shell 中可渲染。 |
| S1.0.3 | 添加 Stage 1 command surface。 | open sample、analyze、start scenario、trigger error、reset commands 已存在或已 stub。 |

### S1.1 Local Contracts

| Ticket | 描述 | 完成条件 |
| --- | --- | --- |
| S1.1.1 | 定义 Stage 1 TypeScript schemas。 | schemas 覆盖 project、graph、tree、current work、run events、harness、scenarios、reset。 |
| S1.1.2 | 添加 fixture validator。 | validator 能拒绝 invalid edges、missing files、malformed run/harness data。 |
| S1.1.3 | 添加 `.projectos` loader/writer。 | services 可 load sample fixtures 并 update current work。 |
| S1.1.4 | 添加 reset service。 | reset 恢复 source 和 `.projectos` state。 |

### S1.2 Sample Fixtures

| Ticket | 描述 | 完成条件 |
| --- | --- | --- |
| S1.2.1 | curate presentation graph。 | opening graph 显示 8-10 个 visible nodes，并保留 raw sample coverage。 |
| S1.2.2 | 构建 semantic tree fixture。 | feature groups 展示 primary/supporting/config files。 |
| S1.2.3 | 构建 Google login scenario。 | prompt、refinement、run events、diff fixture 已存在。 |
| S1.2.4 | 构建 auth bug scenario。 | error、harness record、debug run events、verification fixture 已存在。 |

### S1.3 Workbench UI

| Ticket | 描述 | 完成条件 |
| --- | --- | --- |
| S1.3.1 | 实现 three-zone layout。 | Semantic tree、center surface、chat/harness side panel 同屏渲染。 |
| S1.3.2 | 实现 Function Map。 | nodes/edges 从 graph fixture 渲染，并支持 selection。 |
| S1.3.3 | 实现 Semantic File Tree。 | tree 从 semantic-tree fixture 渲染，并支持 selection。 |
| S1.3.4 | 实现 context sync。 | 选择 node/file 后更新 context 并高亮 linked surfaces。 |

### S1.4 Prompt 与 Agent Flow

| Ticket | 描述 | 完成条件 |
| --- | --- | --- |
| S1.4.1 | 实现 context assembler。 | feature/file/project context payloads 匹配 contract。 |
| S1.4.2 | 实现 Prompt Refinement card。 | Google login prompt 创建 deterministic refinement。 |
| S1.4.3 | 实现 Agent Flow playback。 | run events 以可见 sequence 流式展示。 |
| S1.4.4 | 实现 Diff Review path。 | diff 打开真实 sample files，并在 apply 后更新 state。 |

### S1.5 Debug Harness

| Ticket | 描述 | 完成条件 |
| --- | --- | --- |
| S1.5.1 | 添加 terminal/error trigger。 | trigger 创建或加载 auth error record。 |
| S1.5.2 | 实现 error mapping UI。 | error 展示 business node 和 technical files。 |
| S1.5.3 | 实现 Harness panel。 | evidence、hypotheses、patch rejection、root cause、verification 可见。 |
| S1.5.4 | sync harness state 到 graph/tree/flow。 | error 和 fixed states 在各 surface 间传播。 |

### S1.6 Presentation 稳定性强化

| Ticket | 描述 | Done When |
| --- | --- | --- |
| S1.6.1 | 添加 presentation mode。 | core demo 不需要 model key 或 network。 |
| S1.6.2 | 添加 demo reset command/button。 | reset 可从 app 内重复运行。 |
| S1.6.3 | 添加 smoke checklist。 | checklist 覆盖 launch、open sample、Google login、auth bug、reset。 |
| S1.6.4 | record rehearsal。 | 完成一条 5-7 分钟 recorded run。 |

---

## 12. 验证计划

### 契约验证

- validate 每个 `.projectos/*.json` 文件是否符合 Stage 1 schemas。
- validate 每条 `agent-runs/*.jsonl` line 是否为 known event type。
- validate 每个 harness record 是否包含 evidence、hypotheses、chosen root cause、verification。
- validate 每条 graph edge 是否引用 existing nodes。
- validate 每个 linked file 是否存在；不存在则必须 marked stale。

### UI 验证

- 打开 sample workspace。
- 确认 first screen 显示 Function Map、Semantic File Tree、Chat context。
- 选择 User Authentication，并验证 linked highlights。
- 确认 sample project 中 context update 在 200 ms 内可见。
- 确认 Google login prompt 出现 Prompt Refinement。
- 确认 Agent Flow 可 stream 到完成。
- 确认 Diff Review 打开 real files。
- 确认 Debug Harness 展示 auth bug root-cause path。
- 确认 reset 回到 opening scene。

### Presentation 验证

- 在 network disabled 情况下运行。
- 从 reset 连续 replay demo 5 次。
- 捕获 key screenshots：
  - opening Project Space；
  - selected User Authentication node；
  - Prompt Refinement card；
  - Agent Flow in progress；
  - Diff Review；
  - Debug Harness；
  - final green state。
- 记录一条 complete demo。

---

## 13. 验收标准

第一阶段只有在以下标准全部通过时才可接受：

1. 所选 IDE shell 可以 launch Project OS。
2. `sample-graph-saas/` 可以作为 demo workspace 打开。
3. opening screen 同时显示产品三大核心 surface。
4. visible presentation graph 有 8-10 个清晰 node 和至少 5 条可解释 edge。
5. Semantic File Tree 按 feature meaning 分组文件。
6. 选择 graph node 后，Chat context 和 file highlights 在 200 ms 内更新。
7. Google login prompt 可离线生成 deterministic Prompt Refinement。
8. confirm refinement 后启动 Agent Flow。
9. Agent Flow 流式展示至少 6 个有意义 step。
10. Diff Review 打开真实 sample files。
11. apply curated diff 后更新 graph/tree/current-work state。
12. trigger auth error 后，相关 node/files 变为红色 error state。
13. Debug Harness 展示 evidence、hypotheses、rejected patch-like fix、chosen root cause、verification。
14. debug flow 完成后，相关 node/files 回到 fixed/green state。
15. Demo reset 恢复 source 和 `.projectos` state。
16. core demo path 不依赖 cloud、billing、model provider 或 network。
17. 所有 Stage 1 local fixtures 通过 validation。
18. 5-7 分钟 demo script 和 recorded rehearsal 已存在。

---

## 14. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| Void fork 理解成本过高 | Stage 1 在产品 work 前阻塞。 | time-box adoption spike，并保留 Electron + Monaco fallback。 |
| demo graph 过于繁杂 | 观众看不清核心产品闭环。 | curate default visible graph，同时保留 raw sample graph data。 |
| fixture-backed flow 显得假 | 可信度下降。 | 使用真实 sample files、真实 diff preview、真实 state changes、inspectable local data。 |
| UI 开发时 interface 漂移 | Stage 2 migration 成本升高。 | UI/service parallel work 前 freeze Stage 1 API 和 schema contracts。 |
| Harness 承诺过强 | 产品表达失真。 | 将 Harness 定位为已知 TypeScript/Next.js error 的 root-cause workflow showcase。 |
| presentation live failure | demo 失去信任。 | offline presentation mode、one-click reset、smoke checklist、recorded rehearsal。 |

---

## 15. 人员分工建议

建议 lanes：

| Lane | Role | Owns |
| --- | --- | --- |
| Product/PM | product manager + designer | demo narrative、stage scope、acceptance criteria、script。 |
| Shell | Electron/Void engineer | fork spike、workbench contribution、command surface。 |
| Local Core | TypeScript engineer | `.projectos` schemas、services、validation、reset。 |
| Product UI | frontend engineer | graph、semantic tree、chat context、flow、harness panels。 |
| Scenario/Agent | AI workflow engineer | prompt refinement、run events、diff fixture、harness fixture。 |
| QA/Presentation | QA engineer | smoke tests、screenshots、rehearsal、reset reliability。 |

并行规则：

- shell spike 和 local contract design 可并行。
- UI implementation 在 Gate 1 contract freeze 后开始。
- Agent Flow 和 Debug Harness 可在 sample fixtures 存在后并行。
- Presentation hardening 只在 core loop 和 harness loop 都工作后开始。

---

## 16. 第一阶段到第二阶段的出口

第二阶段只能在第一阶段被接受后开始。

第一阶段会带入第二阶段的 artifacts：

- local schema definitions；
- typed local API；
- Project OS workbench surfaces；
- `sample-graph-saas/` regression fixture；
- demo reset pattern；
- Agent Flow event model；
- Harness record model。

第二阶段按 service 逐一替换 deterministic internals：

1. 用真实 TypeScript/Next.js analyzer 替换 graph fixture。
2. 用 model-backed prompt refinement 替换 prompt fixture。
3. 用 scoped change generation 替换 diff fixture。
4. 用 common-error root-cause analysis 替换 harness fixture。
5. 围绕 real edits 添加 git checkpoint 和 rollback。
6. 只在 local loop 可靠后添加 cloud model gateway。

在 real local project workflows 可信之前，不添加 production auth、billing 或 team sync。
