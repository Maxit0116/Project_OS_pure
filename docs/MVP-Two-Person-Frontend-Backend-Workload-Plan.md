# Project OS MVP 前端后端两人分工计划

**状态**：Draft v0.1  
**范围**：MVP Showcase / Stage 1 的两人执行分工  
**团队形态**：1 名前端负责人 + 1 名后端负责人  
**核心原则**：contract-first，前端只消费 typed API，后端拥有 local data、fixtures、scenario、service implementation

---

## 1. 分工结论

MVP 应拆成两条并行主线：

| 人员 | 角色 | 主要责任 | 不负责 |
| --- | --- | --- | --- |
| Person A | 前端负责人 | IDE shell integration、Project OS Workbench UI、Function Map、Semantic File Tree、Chat context、Prompt Refinement UI、Agent Flow UI、Diff Review UI、Debug Harness UI、presentation controls。 | 不直接读写 `.projectos` 文件；不直接实现 scenario timing、diff generation、harness logic。 |
| Person B | 后端负责人 | `.projectos` schemas、fixtures、validation、ProjectOSApi implementation、context assembler、deterministic scenario engine、agent run event stream、diff fixture/apply、harness record/reset。 | 不直接决定 UI layout 细节；不在 UI components 中塞业务逻辑。 |

两个人之间的唯一强边界是 `ProjectOSApi` 和 event contracts。前端可以 mock API；后端必须保证真实 implementation 与 mock contract 一致。

---

## 2. 总体架构边界

```
Frontend Owner
|
|-- Project OS Workbench UI
|-- ProjectOSApiClient
|-- UI state / selection state
|-- mock client for local UI development
|
| calls only typed API
v
Shared Contracts
|
|-- ProjectOSApi
|-- ProjectGraph
|-- SemanticTree
|-- ContextPayload
|-- PromptRefinement
|-- AgentRunEvent
|-- GeneratedDiff
|-- HarnessRecord
|
^
| implements typed API
|
Backend Owner
|
|-- ProjectOSApiServer / service adapter
|-- .projectos loader/writer
|-- fixture validator
|-- scenario engine
|-- agent run stream
|-- diff/harness/reset services
```

约束：

- 前端不得直接读取 `sample-graph-saas/.projectos/*`。
- 后端不得把 UI 状态写死到 fixtures 之外。
- shared contracts 的 breaking change 必须两人一起确认。
- demo path 允许 deterministic fixtures，但 interface 必须 production-shaped。

---

## 3. Shared Contracts

建议把 shared contracts 集中为一个可被前端和后端共同 import 的模块。实际路径可随 Void fork 调整，但逻辑上应拆成：

```
projectos/contracts/
  api.ts
  project.ts
  graph.ts
  semantic-tree.ts
  context.ts
  prompt-refinement.ts
  agent-run.ts
  diff.ts
  harness.ts
  events.ts
```

ownership：

- Person B 初始起草 contract，因为它直接约束 data 和 service implementation。
- Person A 必须 review contract，确认 UI 能以该 shape 渲染。
- contract 一旦进入 `Gate 1: Contract Freeze`，任何 breaking change 都走 change protocol。

---

## 4. API 对齐表

| API | 输入 | 输出 | 后端责任 | 前端责任 |
| --- | --- | --- | --- | --- |
| `openSampleWorkspace()` | 无 | `ProjectOSProject` | 定位 `sample-graph-saas/`，加载或初始化 `.projectos`。 | 调用后切换到 Project OS workbench opening state。 |
| `openWorkspace(path)` | workspace path | `ProjectOSProject` | 校验 path，加载 project metadata。 | 显示 workspace loading、success、error state。 |
| `analyzeWorkspace(projectId)` | `projectId` | `ProjectGraph` | MVP 可返回 fixture graph；必须 validate edges/files。 | 用 graph 渲染 Function Map。 |
| `getProjectGraph(projectId)` | `projectId` | `ProjectGraph` | 从 store 返回 graph。 | refresh graph view，不自己拼 graph。 |
| `getSemanticTree(projectId)` | `projectId` | `SemanticTree` | 从 graph/file index 或 fixture 返回 tree。 | 渲染 Semantic File Tree。 |
| `getContext(request)` | `ContextRequest` | `ContextPayload` | 组装 project/feature/file/debug/flow_step context。 | 更新 Chat context header 和 context preview。 |
| `refinePrompt(request)` | `PromptRefineRequest` | `PromptRefinement` | known prompt 走 fixture；可选 model path 保持同一返回结构。 | 渲染 Prompt Refinement card 和 confirm/edit/skip controls。 |
| `confirmExecution(refinementId)` | `refinementId` | `AgentRun` | 创建 deterministic run，准备 event stream。 | 打开 Agent Flow，并进入 running state。 |
| `streamAgentRun(runId, cb)` | `runId` | `AgentRunEvent` stream | 按顺序 emit run events。 | 渲染 step status、related files、related nodes。 |
| `getDiff(runId)` | `runId` | `GeneratedDiff` | 返回真实 sample files 的 curated diff。 | 打开 Diff Review UI。 |
| `applyDiff(runId)` | `runId` | `ApplyResult` | MVP 可写入 state 或模拟 apply；必须更新 current work。 | 展示 apply result，并刷新 graph/tree/status。 |
| `reportError(projectId, rawError)` | `projectId`, `rawError` | `HarnessRecord` | 将 auth error 映射到 business node 和 technical files。 | 打开 Debug Harness panel。 |
| `startHarnessFix(errorId)` | `errorId` | `AgentRun` | 创建 debug run event stream。 | 将 Agent Flow 切换到 debug path。 |
| `resetDemo(projectId)` | `projectId` | `ProjectOSProject` | 恢复 source 和 `.projectos` 到 opening scene。 | 清空 UI transient state，回到 opening screen。 |

---

## 5. Event 对齐

`streamAgentRun` 是前后端最容易错位的接口。必须先冻结 event types：

| Event Type | 后端含义 | 前端表现 |
| --- | --- | --- |
| `run_started` | run 已创建并开始。 | Agent Flow 打开，显示 running header。 |
| `prompt_refined` | refinement 已确认并绑定 run。 | Prompt card 进入 confirmed state。 |
| `step_started` | 一个 Agent Flow step 开始。 | 对应 step 进入 running。 |
| `step_completed` | step 完成。 | 对应 step 进入 complete，并显示 `outputSummary`。 |
| `step_failed` | step 失败。 | step 进入 error，右侧显示 error summary。 |
| `correction_added` | 用户纠正 context 或 file scope。 | flow 中显示 correction marker。 |
| `diff_ready` | diff 已生成。 | 启用 Diff Review entry。 |
| `verification_completed` | verification 已完成。 | 显示 pass/fail/demo_passed。 |
| `run_completed` | run 完成。 | graph/tree/current work 刷新为最终状态。 |

event payload 规则：

- 每个 event 必须包含 `eventId`、`runId`、`timestamp`、`type`。
- 如 event 关联 step，必须包含 `step.id`、`step.kind`、`step.status`。
- 如果 event 关联 graph/file，必须包含 `relatedNodeIds` 和 `relatedFiles`。
- 前端按 event 顺序渲染，不根据 timeout 自己编造状态。

---

## 6. 前端负责人 Workload

### 6.1 前端 owns

- Project OS workbench layout。
- Activity entry / command entry。
- Function Map rendering。
- Semantic File Tree rendering。
- selection state 和 highlight sync。
- Chat context header。
- Prompt Refinement card。
- Agent Flow timeline/graph。
- Diff Review surface。
- Debug Harness panel。
- Presentation controls：open sample、start scenario、trigger error、reset。
- loading/empty/error states。
- screenshot-ready presentation polish。

### 6.2 前端不 owns

- `.projectos` 文件读写。
- fixture schema definition。
- graph validation。
- context assembly logic。
- model/provider call。
- diff generation。
- harness root-cause logic。
- reset source file implementation。

### 6.3 前端 ticket

| Ticket | 工作 | 接口依赖 | 完成条件 |
| --- | --- | --- | --- |
| FE-1 | 搭建 three-zone layout。 | mock `openSampleWorkspace`。 | left/center/right 三区稳定渲染。 |
| FE-2 | 实现 Function Map。 | `getProjectGraph`。 | nodes/edges 可渲染、可选择、可显示 status。 |
| FE-3 | 实现 Semantic File Tree。 | `getSemanticTree`。 | 按 feature/file/status 展示，并支持 selection。 |
| FE-4 | 实现 context sync。 | `getContext`。 | 点击 node/file 后 Chat context 200 ms 内更新。 |
| FE-5 | 实现 Prompt Refinement card。 | `refinePrompt`。 | 展示 understood、ambiguities、suggestions、affected files。 |
| FE-6 | 实现 Agent Flow UI。 | `streamAgentRun`。 | event stream 能驱动 step status。 |
| FE-7 | 实现 Diff Review UI。 | `getDiff`、`applyDiff`。 | 显示真实 file path、summary、patch/apply result。 |
| FE-8 | 实现 Debug Harness UI。 | `reportError`、`startHarnessFix`。 | 展示 evidence、hypotheses、rejected fix、root cause、verification。 |
| FE-9 | 实现 presentation controls。 | `resetDemo` 等 command。 | demo 可从 UI open、run、error、reset。 |

---

## 7. 后端负责人 Workload

### 7.1 后端 owns

- shared contracts 初稿。
- `.projectos` schema 和 validation。
- `sample-graph-saas/.projectos/*` fixtures。
- `ProjectOSApi` implementation。
- fixture-backed `openSampleWorkspace`。
- graph/tree/current-work store。
- context assembler。
- deterministic Prompt Refinement。
- Agent Run event stream。
- deterministic diff fixture 和 apply result。
- Harness record 和 debug run。
- demo reset。

### 7.2 后端不 owns

- UI layout。
- visual hierarchy。
- graph visual style。
- button copy 和 panel composition。
- frontend transient state。
- presentation animation timing，除非 timing 已在 event stream contract 中定义。

### 7.3 后端 ticket

| Ticket | 工作 | 前端依赖 | 完成条件 |
| --- | --- | --- | --- |
| BE-1 | 定义 shared contracts。 | FE review。 | contracts 覆盖 project、graph、tree、context、prompt、run、diff、harness。 |
| BE-2 | 建立 fixture validator。 | 无。 | invalid edges、missing files、malformed events 会 fail。 |
| BE-3 | 准备 sample `.projectos` fixtures。 | FE 使用 mock data。 | graph/tree/current-work/settings/scenarios/harness 全部存在。 |
| BE-4 | 实现 `openSampleWorkspace` 和 loader。 | FE-1。 | sample 可打开并返回 `ProjectOSProject`。 |
| BE-5 | 实现 graph/tree/context APIs。 | FE-2/FE-3/FE-4。 | 返回数据稳定且 contract-valid。 |
| BE-6 | 实现 Prompt Refinement fixture。 | FE-5。 | Google login prompt 返回 deterministic `PromptRefinement`。 |
| BE-7 | 实现 Agent Run stream。 | FE-6。 | `run_started` 到 `run_completed` 顺序稳定。 |
| BE-8 | 实现 diff/apply。 | FE-7。 | diff 引用真实 sample files，apply 更新 current work。 |
| BE-9 | 实现 harness/reportError/startHarnessFix。 | FE-8。 | auth bug 映射到 User Authentication，并输出 harness record。 |
| BE-10 | 实现 resetDemo。 | FE-9。 | 连续 reset 两次 state 相同。 |

---

## 8. Mock 与 Integration 策略

前端不能等后端全做完再开始。第一天必须建立 mock client：

```
ProjectOSApiClient
|-- MockProjectOSApiClient
|-- RealProjectOSApiClient
```

规则：

- `MockProjectOSApiClient` 使用 shared contracts 的 sample objects。
- `RealProjectOSApiClient` 调用后端 service adapter。
- mock data 必须从同一 fixture shape 生成，不能自造字段。
- 每次后端 contract 改动后，mock 必须同步更新。
- 前端每合并一次 UI slice，都要能在 mock client 下运行。
- 后端每合并一次 service slice，都要通过 fixture validator。

integration 节奏：

| 时间点 | 目标 | 负责人 |
| --- | --- | --- |
| Day 0 | freeze `ProjectOSApi` 和核心 types。 | 两人一起 |
| Day 1 | FE 用 mock 渲染 shell；BE 完成 schemas/fixtures 初稿。 | 各自 |
| Day 2 | graph/tree/context 首次 real integration。 | 两人一起 |
| Day 3 | Prompt Refinement + Agent Flow 首次 integration。 | 两人一起 |
| Day 4 | Diff Review + apply state integration。 | 两人一起 |
| Day 5 | Debug Harness integration。 | 两人一起 |
| Day 6 | reset、offline mode、presentation smoke。 | 两人一起 |

---

## 9. 接口变更流程

任何 interface change 都走 5 步：

1. 提出变更：写清楚改哪个 type/method/event，为什么现在必须改。
2. 影响评估：Person A 标记 UI impact，Person B 标记 data/service impact。
3. 更新 contract：先改 shared contract，再改 mock fixture，再改 backend implementation。
4. 双方验证：FE 跑 mock UI path，BE 跑 fixture validation 和 API smoke。
5. 记录：在相关 PR 或 `progress.md` 里记一句 contract change。

breaking change 标准：

- method rename。
- required field 新增或删除。
- enum value rename。
- event order 改变。
- payload shape 改变。
- status semantics 改变。

breaking change 不允许在 demo 前最后 48 小时发生，除非当前 demo path 已经 broken。

---

## 10. 日常沟通协议

每天固定 15 分钟：

| 议题 | 输出 |
| --- | --- |
| 昨天完成了什么 | 对应 ticket 和可运行证据。 |
| 今天改哪些 shared surface | 是否影响 contract。 |
| 有无 blocked | 谁需要 unblock，什么时候给。 |
| mock 与 real 是否一致 | 差异列表。 |
| 今天是否需要 integration checkpoint | 明确时间和验证 path。 |

异步沟通格式：

```
接口变更：
- method/type/event:
- 当前问题:
- proposed shape:
- FE impact:
- BE impact:
- 是否 breaking:
```

blocked 超过半天时，不继续私下猜。直接开 20 分钟 contract review。

---

## 11. Merge 与验收规则

每个人可以独立 merge 自己 lane，但必须满足对应 gate：

| Gate | 前端必须证明 | 后端必须证明 |
| --- | --- | --- |
| Contract Freeze | UI 能用 mock contract 渲染三大核心 surface。 | contracts、fixtures、validator 已存在。 |
| Graph/Tree Ready | Function Map 和 Semantic File Tree 能消费 real API。 | graph/tree/context API 返回 valid data。 |
| Prompt/Flow Ready | Prompt card 和 Agent Flow 可由 events 驱动。 | refinement、run stream、event ordering 稳定。 |
| Diff Ready | Diff Review 可显示并触发 apply。 | diff/apply 返回 valid result，并更新 current work。 |
| Harness Ready | Harness UI 可展示 full record。 | reportError/startHarnessFix 返回 valid record/run。 |
| Demo Ready | UI open/run/error/reset 一条路径可走完。 | reset 连续运行稳定，offline core path 可用。 |

最终 MVP demo 验收由两人一起跑：

1. reset demo。
2. open sample workspace。
3. select User Authentication。
4. run Google login scenario。
5. review diff。
6. apply result。
7. trigger auth error。
8. run Debug Harness。
9. reset demo。

---

## 12. 文件 ownership 建议

实际路径会随 Void fork 调整，但 ownership 应保持稳定：

| Area | Person A | Person B |
| --- | --- | --- |
| `projectos/contracts/*` | review + consumer tests | owner |
| `projectos/client/*` | owner | review |
| `projectos/workbench/*` | owner | no direct edits |
| `projectos/ui/*` | owner | no direct edits |
| `projectos/services/*` | review | owner |
| `projectos/persistence/*` | no direct edits | owner |
| `sample-graph-saas/.projectos/*` | review visual needs | owner |
| `sample-graph-saas` source fixtures | review demo needs | owner |
| `docs/*plan*.md` | both may edit | both review contract changes |

如果同一文件必须两人改，先约定 30 分钟 pairing window，不并行改。

---

## 13. 风险与处理

| 风险 | 处理 |
| --- | --- |
| 前端等后端导致停滞 | Day 1 必须有 `MockProjectOSApiClient`。 |
| 后端 shape 改动导致 UI 反复返工 | `Gate 1: Contract Freeze` 后 breaking change 需要双人确认。 |
| mock 和 real API 分叉 | mock data 从同一 contract/fixture shape 生成；integration checkpoint 每天至少一次。 |
| UI 直接读 `.projectos` | 明确禁止；只通过 API client。 |
| backend 把 UI 逻辑塞进 scenario | scenario 只输出 data/event，不决定 layout。 |
| event timing 不一致 | 后端拥有 event order；前端只负责渲染，不自己伪造 run state。 |
| demo 前 48 小时接口变动 | 默认禁止，除非 demo path 已 broken。 |

---

## 14. 完成定义

两人分工计划完成后的 MVP implementation ready 条件：

1. `ProjectOSApi` 和 event contracts 已冻结。
2. Person A 能用 mock client 跑完整 UI demo path。
3. Person B 能用 real service 跑完整 data/service demo path。
4. mock 和 real 返回 shape 一致。
5. graph/tree/context/prompt/run/diff/harness/reset 都有至少一个 end-to-end integration checkpoint。
6. demo path 可离线运行。
7. reset 后能重复 replay。
8. 两人都知道自己 owns 哪些 files、哪些 tickets、哪些验收证据。
