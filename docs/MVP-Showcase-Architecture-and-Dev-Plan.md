# Project OS MVP Showcase 架构与开发计划

**状态**：Draft v0.1  
**范围**：MVP 演示构建  
**决策**：从产品文档重建，不以当前旧实现为约束  
**主要基座**：fork Void 作为 Electron IDE shell，再将 Project OS 作为 first-party workbench surfaces 与 services 加入

---

## 1. MVP 定义

这个 MVP 是 **presentation-grade showcase**，不是完整通用的生产级产品。

目标是让观众通过一条受控 demo 理解 Project OS 的完整产品价值：

1. 打开一个已有 codebase。
2. 看到 codebase 变成可视化 Project Space。
3. 在 Function Map、Agent Flow、Semantic File Tree 三个联动视图中导航。
4. 点击 feature 或 file，AI context 立即切换。
5. 输入需求后，执行前先看到 Prompt Refinement。
6. 观看 Agent Flow 以可见步骤执行。
7. 在 IDE 内 review proposed code diff。
8. 触发或模拟一个 error。
9. 观看 Debug Harness 解释 root cause 和 repair path。
10. 以 map、file tree、agent flow、code diff 同步变绿的状态结束。

demo 可以在完整生产自治能力会拖慢交付的地方使用脚本化或 deterministic behavior。它仍必须像真实产品架构，而不是一次性 mock。

---

## 2. MVP 原则

| 原则 | 含义 |
| --- | --- |
| 展示完整产品闭环 | 观众必须看到完整产品承诺，即使部分 internals 是 deterministic。 |
| 使用真实 IDE shell | 编辑、文件导航、terminal、layout 应来自真实 Electron IDE foundation。 |
| 控制 demo path | 先支持一个打磨后的 sample workspace，再扩展。 |
| 让 state 可检查 | graph、semantic tree、run logs、harness records 存入 local files。 |
| 分离产品事实与 demo scripting | demo fixtures 应贴近 real schemas，并且可被替换。 |
| 保留未来架构 | services 和 APIs 的命名与形状应接近 production，即使背后暂由 fixture data 支持。 |

---

## 3. 为什么 MVP 选择 Void

Void 提供了接近目标体验的 Electron-based IDE foundation：file explorer、editor panes、terminal、command palette、extension-style services、AI-oriented workbench concepts。Project OS 不应从零重建 IDE shell，而应作为 first-party workspace layer 加入 Void fork。

使用 Void 承接：

- Electron desktop shell。
- Monaco 或 VS Code editor infrastructure。
- File explorer 和 workspace model。
- Terminal integration。
- Workbench panels、sidebars、commands、keybindings。
- 可复用的 AI/diff/apply patterns。

Project OS 增加：

- Function Map。
- Semantic File Tree。
- Agent Flow。
- Prompt Refinement cards。
- Debug Harness。
- Project Space graph 和 context model。
- Presentation scenario engine。

**必须先做 adoption spike**：实施前验证 Void license、build commands、branch health、packaging path，以及 first-party workbench contributions 应放在哪里。如果 Void fork 维护成本过高，fallback 是 fresh Electron shell + Monaco，但这是备选路径。

---

## 4. MVP 保真度模型

| 区域 | MVP 保真度 | 说明 |
| --- | --- | --- |
| IDE shell | real | fork Void 并作为真实 desktop IDE 运行。 |
| Code editor | real | 使用 Void editor panes 打开 file、diff preview、review。 |
| File navigation | real + enhanced | native explorer 保留；Project OS semantic tree 是新 view。 |
| Terminal | real enough | 使用 native terminal 或 terminal-like panel；只需支持一条 curated script path。 |
| Function Map | real UI, deterministic data | 从 `.projectos/graph.json` 渲染；graph 可生成或预置。 |
| Semantic File Tree | real UI, deterministic grouping | 从 graph 和 file index 构建；demo 可使用 curated roles。 |
| Node context switching | real | 选择 graph/tree/flow item 会更新 Chat context state。 |
| Prompt Refinement | semi-real | 可调用 model，但必须有 deterministic fallback 支持 demo prompts。 |
| Code execution | semi-real | 产生 real diff preview；apply 可限制在 curated files。 |
| Agent Flow | real UI, scripted events allowed | flow events 从 run log stream；demo run 可 deterministic。 |
| Debug Harness | real UI, scripted diagnosis allowed | 必须展示 evidence、root cause、patch rejection/pass、verification。 |
| Cloud auth/billing | not required | 可隐藏，或作为静态 future surface 展示。 |
| General repo support | not required | MVP 支持一个打磨后的 sample repo，加 optional best-effort import。 |

---

## 5. 面向用户的 MVP Demo Script

## 5.1 Sample Project 策略

MVP 应包含一个专门用于展示“通过图进行开发”的小型 sample project。它不是普通 test data，而是让 demo 可靠、可理解的 controlled workspace。

工作名：`sample-graph-saas`

推荐形状：

- Framework：Next.js App Router + TypeScript。
- Size：20-40 source files，适合 live demo 中理解。
- Domain：simple SaaS workspace。
- Features：
  - Home / marketing page。
  - User authentication。
  - Dashboard。
  - User profile。
  - Settings。
  - Billing or checkout。
  - Notifications。
  - Admin or analytics。
- Intentional error path：
  - 1 个 seeded auth 或 billing bug，用于 Debug Harness。
- Intentional missing/suggested feature：
  - Google login 或 team invite 作为 suggested node。

sample project 必须能自然映射成 graph nodes：

| Graph Node | Example Files | Demo Role |
| --- | --- | --- |
| Home | `app/page.tsx`, `components/Header.tsx` | entry point 与 navigation。 |
| User Authentication | `app/login/page.tsx`, `lib/auth.ts`, `app/api/auth/route.ts` | 主要 feature-change demo。 |
| Dashboard | `app/dashboard/page.tsx`, `components/StatsCard.tsx` | login 后的目标页面。 |
| Profile | `app/profile/page.tsx`, `components/ProfileForm.tsx` | auth demo 的 redirect target。 |
| Settings | `app/settings/page.tsx`, `app/api/settings/route.ts` | 展示 feature/file linkage。 |
| Billing | `app/checkout/page.tsx`, `lib/payments.ts` | data-flow edge example。 |
| Notifications | `app/notifications/page.tsx`, `lib/hooks/useNotifications.ts` | 展示 hooks/supporting files。 |
| Data Layer | `lib/db.ts`, `prisma/schema.prisma` | shared dependency node。 |

sample project 验收标准：

- 打开 sample project 后生成稳定 Function Map，包含 6-10 个 readable nodes。
- 每个 graph node 尽可能包含至少 1 个 primary file 和 1 个 supporting file。
- 至少 5 条 edges 可以在 demo 中直接解释：redirects、data layer、imports、shared data、API flow。
- Semantic File Tree 可以按 graph node 分组文件，无需额外口头解释。
- Google login scenario 有 deterministic Prompt Refinement、Agent Flow、Diff Review。
- seeded bug scenario 有 deterministic Harness record 和 visible graph/file error state。
- sample project 可通过一个 command 或一个 Project OS action reset 到 initial state。

实现说明：sample project 可在 MVP development 阶段放在 Project OS repo 内，但 demo 中应以 external workspace 方式打开，保证 IDE 体验真实。

---

### Script A：添加 Google Login

1. 启动 Project OS。
2. 打开 sample SaaS workspace。
3. Project OS 分析 workspace，并展示：
   - center：Function Map。
   - left：Semantic File Tree。
   - right：带 project-level context 的 AI Chat。
4. 点击 `用户认证 / User Authentication`。
5. Function Map 高亮该 node，Semantic File Tree 高亮 auth files，Chat 切换到 feature context。
6. 输入：`Add Google login and redirect users to profile after successful sign in.`
7. Prompt Refinement card 出现，包含：
   - understood behavior。
   - ambiguities。
   - 建议的 refined prompt。
   - confirm / edit / skip controls。
8. Confirm。
9. Agent Flow 打开并 stream steps：
   - understand request。
   - 取回 feature context。
   - inspect linked files。
   - generate change plan。
   - draft diff。
   - verify。
10. Diff preview 在 editor 中打开。
11. Apply curated diff。
12. Graph node status 先变为 `in_progress`，再变为 `active`。

### Script B：用 Harness 修复 Bug

1. Terminal 展示或模拟 TypeScript/runtime error。
2. Error 映射到：
   - Business node：`用户认证 / User Authentication`。
   - Technical files：auth route 和 provider config。
3. Debug Harness 打开。
4. Harness 展示：
   - evidence collected。
   - 1-3 个 root-cause hypotheses。
   - 如适用，rejected patch-style fix。
   - chosen root-cause fix。
   - verification result。
5. Agent Flow 更新 debug path。
6. Function Map、Semantic File Tree、Chat 全部反映 fixed state。

---

## 6. 架构概览

```
Project OS MVP (Void fork)
|
|-- Void / VS Code workbench foundation
|   |-- Window, layout, editor groups
|   |-- File explorer
|   |-- Terminal
|   |-- Command palette and keybindings
|   |-- Diff editor
|
|-- Project OS workbench contribution
|   |-- Project Space activity view
|   |-- Function Map view/editor
|   |-- Semantic File Tree view
|   |-- Agent Flow view
|   |-- Prompt Refinement card
|   |-- Debug Harness panel
|   |-- Chat context header and context payload viewer
|
|-- Project OS local services
|   |-- WorkspaceIndexer
|   |-- ProjectGraphStore
|   |-- SemanticTreeBuilder
|   |-- ContextAssembler
|   |-- AgentRunOrchestrator
|   |-- AgentFlowTracker
|   |-- HarnessEngine
|   |-- DemoScenarioEngine
|   |-- ProjectOSPersistence
|
|-- Local project storage
|   |-- .projectos/project.json
|   |-- .projectos/graph.json
|   |-- .projectos/semantic-tree.json
|   |-- .projectos/current-work.json
|   |-- .projectos/agent-runs/*.jsonl
|   |-- .projectos/harness/*.json
|   |-- .projectos/demo-scenarios/*.json
|
|-- Optional model/provider bridge
    |-- Real provider when configured
    |-- Deterministic fixtures when no key or during presentation mode
```

---

## 7. Void 集成策略

### 7.1 Workbench Surfaces

| Surface | Void 集成形态 | MVP 行为 |
| --- | --- | --- |
| Project OS Activity | 新 activity bar entry 或 side view container。 | 打开 Project Space dashboard。 |
| Semantic File Tree | normal explorer 旁边或替代的 side view。 | 按 feature/module/status 分组 files。 |
| Function Map | custom editor 或 webview-like workbench panel。 | interactive graph，支持 selectable nodes and edges。 |
| Agent Flow | custom editor/panel。 | 从 `agent-runs/*.jsonl` stream run steps。 |
| Chat Sidebar | 复用或扩展 Void chat surface。 | 增加 Project OS context banner 和 Prompt Refinement card。 |
| Debug Harness | Chat 下方 panel 或独立 right-side view。 | 展示 evidence、hypotheses、root cause、fix、verification。 |
| Diff Review | 尽量使用 native diff editor。 | 打开 generated patch，供 review 和 optional apply。 |

### 7.2 Service Boundaries

Project OS 应实现为一组小型 first-party services，而不是把逻辑散落在 UI components 中。

| Service | Responsibility |
| --- | --- |
| `IProjectOSWorkspaceService` | tracking active workspace、project metadata、`.projectos` paths。 |
| `IProjectGraphService` | load、save、validate、update `graph.json`。 |
| `ISemanticTreeService` | 基于 graph + file index 构建 semantic tree。 |
| `IProjectOSContextService` | 组装 business、file、debug、run-step context payloads。 |
| `IAgentRunService` | 启动 showcase runs、tracking status、emit run events。 |
| `IAgentFlowService` | persist 和 stream flow steps。 |
| `IHarnessService` | map errors、generate hypotheses、track root-cause/fix records。 |
| `IDemoScenarioService` | load deterministic demo scripts 和 fallback responses。 |

### 7.3 Presentation Mode

添加 `projectOS.presentationMode` setting。

启用时：

- sample workspace 一键导入。
- known prompts 映射到 deterministic Prompt Refinement cards。
- Agent Flow 发出 timed、polished events。
- Diff output deterministic。
- Harness 使用 curated error 和 root-cause records。
- network/model failure 不会破坏 demo。

关闭时：

- 同一 UI 调用同一 interfaces。
- services 可逐步接入 static analysis、model providers、real command execution。

---

## 8. MVP 本地数据模型

MVP 不需要 cloud database。local project state 存在 `.projectos/` 下，保证可检查、可携带、可再生成。

### 8.1 文件布局

```
<workspace>/
  .projectos/
    project.json
    graph.json
    semantic-tree.json
    current-work.json
    agent-runs/
      run_<id>.jsonl
    harness/
      err_<id>.json
    demo-scenarios/
      google-login.json
      auth-bugfix.json
    demo-reset.json
```

### 8.2 `project.json`

```ts
interface ProjectOSProject {
  version: '0.1.0'
  projectId: string
  workspaceRoot: string
  displayName: string
  framework: 'nextjs-app' | 'nextjs-pages' | 'node' | 'unknown'
  createdAt: string
  updatedAt: string
  presentationMode: boolean
  activeScenarioId?: string
}
```

### 8.3 `graph.json`

```ts
interface ProjectGraph {
  version: '0.1.0'
  projectId: string
  projectName: string
  projectType: 'nextjs-app' | 'nextjs-pages' | 'node' | 'unknown'
  analyzedAt: string
  analysisStatus: 'complete' | 'partial' | 'demo_fixture' | 'error'
  nodes: FunctionalNode[]
  edges: FunctionalEdge[]
  fileIndex: FileEntry[]
}

interface FunctionalNode {
  id: string
  type: 'capability' | 'suggested'
  name: string
  nameEn?: string
  status: 'active' | 'in_progress' | 'error' | 'suggested'
  description: string
  summary: string
  linkedFiles: LinkedFile[]
  upstream: string[]
  downstream: string[]
  preview?: { route?: string | null; thumbnail?: string | null }
  confidence: number
  tags: string[]
}

interface FunctionalEdge {
  id: string
  source: string
  target: string
  relation: 'depends_on' | 'redirects_to' | 'data_flows_to' | 'imports' | 'shares_data'
  confidence: number
  evidence?: string
}

interface FileEntry {
  path: string
  type: 'page' | 'component' | 'api' | 'lib' | 'config' | 'style' | 'test' | 'asset' | 'other'
  nodeIds: string[]
  imports: string[]
  exports: string[]
  status?: 'normal' | 'changed' | 'error' | 'attention'
}

interface LinkedFile {
  path: string
  role: 'primary' | 'supporting' | 'config' | 'test'
  summary?: string
}
```

### 8.4 `semantic-tree.json`

```ts
interface SemanticTree {
  version: '0.1.0'
  projectId: string
  generatedAt: string
  roots: SemanticTreeNode[]
}

interface SemanticTreeNode {
  id: string
  label: string
  kind: 'feature' | 'folder' | 'file' | 'route' | 'api' | 'config' | 'test' | 'error_group'
  path?: string
  sourceNodeId?: string
  status: 'normal' | 'active' | 'in_progress' | 'error' | 'suggested'
  children: SemanticTreeNode[]
  badges?: string[]
}
```

### 8.5 `current-work.json`

```ts
interface CurrentWorkState {
  version: '0.1.0'
  projectId: string
  focusedNodeId?: string
  focusedFilePath?: string
  activeRunId?: string
  activeErrorId?: string
  recentChanges: Array<{
    path: string
    action: 'created' | 'modified' | 'deleted'
    runId?: string
    timestamp: string
  }>
  unresolvedErrors: string[]
}
```

### 8.6 Agent Run Log

使用 JSON Lines，方便 streaming。

```ts
interface AgentRunEvent {
  eventId: string
  runId: string
  timestamp: string
  type:
    | 'run_started'
    | 'prompt_refined'
    | 'step_started'
    | 'step_completed'
    | 'step_failed'
    | 'correction_added'
    | 'diff_ready'
    | 'verification_completed'
    | 'run_completed'
  step?: AgentFlowStep
  payload?: Record<string, unknown>
}

interface AgentFlowStep {
  id: string
  label: string
  kind: 'understand' | 'retrieve_context' | 'inspect_files' | 'plan' | 'generate_diff' | 'apply' | 'verify' | 'debug'
  status: 'pending' | 'running' | 'complete' | 'warning' | 'error' | 'skipped'
  inputSummary?: string
  outputSummary?: string
  relatedNodeIds: string[]
  relatedFiles: string[]
}
```

### 8.7 Harness Record

```ts
interface HarnessRecord {
  version: '0.1.0'
  errorId: string
  projectId: string
  source: 'terminal' | 'compiler' | 'runtime' | 'demo'
  rawError: string
  businessNodeId?: string
  technicalFiles: string[]
  hypotheses: Array<{
    id: string
    summary: string
    confidence: number
    evidence: string[]
    rejected?: boolean
    rejectionReason?: string
  }>
  chosenRootCauseId: string
  proposedFix: {
    summary: string
    touchedFiles: string[]
    patchKind: 'root_cause' | 'patch_like' | 'unknown'
  }
  verification: {
    status: 'not_run' | 'passed' | 'failed' | 'demo_passed'
    command?: string
    outputSummary?: string
  }
}
```

---

## 9. MVP Interface Contracts

这些 interfaces 是 Project OS UI surfaces 和 local services 之间的 internal contracts。即使实现暂由 fixtures 支持，也应存在。

```ts
interface ProjectOSApi {
  openSampleWorkspace(): Promise<ProjectOSProject>
  openWorkspace(path: string): Promise<ProjectOSProject>
  analyzeWorkspace(projectId: string): Promise<ProjectGraph>
  getProjectGraph(projectId: string): Promise<ProjectGraph>
  getSemanticTree(projectId: string): Promise<SemanticTree>
  getNodeContext(projectId: string, nodeId: string): Promise<ContextPayload>
  getFileContext(projectId: string, path: string): Promise<ContextPayload>
  refinePrompt(request: PromptRefineRequest): Promise<PromptRefinement>
  confirmExecution(refinementId: string): Promise<AgentRun>
  getAgentRun(runId: string): Promise<AgentRun>
  streamAgentRun(runId: string, cb: (event: AgentRunEvent) => void): Disposable
  getDiff(runId: string): Promise<GeneratedDiff>
  applyDiff(runId: string): Promise<ApplyResult>
  reportError(projectId: string, rawError: string): Promise<HarnessRecord>
  startHarnessFix(errorId: string): Promise<AgentRun>
}

interface ContextPayload {
  scope: 'project' | 'feature' | 'file' | 'debug' | 'flow_step'
  projectId: string
  nodeId?: string
  filePath?: string
  title: string
  summary: string
  linkedFiles: LinkedFile[]
  upstream: string[]
  downstream: string[]
  recentChanges: CurrentWorkState['recentChanges']
  rawContextMarkdown: string
}

interface PromptRefineRequest {
  projectId: string
  nodeId?: string
  filePath?: string
  rawPrompt: string
}

interface PromptRefinement {
  id: string
  understood: string
  ambiguities: string[]
  suggestions: string[]
  affectedNodeIds: string[]
  affectedFiles: string[]
  confidence: number
  mode: 'model' | 'deterministic_fixture'
}

interface AgentRun {
  runId: string
  projectId: string
  kind: 'feature_change' | 'debug_fix' | 'demo'
  status: 'queued' | 'running' | 'awaiting_review' | 'complete' | 'error'
  relatedNodeIds: string[]
  relatedFiles: string[]
  startedAt: string
  completedAt?: string
}

interface GeneratedDiff {
  runId: string
  summary: string
  files: Array<{
    path: string
    changeType: 'create' | 'modify' | 'delete'
    before?: string
    after?: string
    patch?: string
  }>
}

interface ApplyResult {
  runId: string
  applied: boolean
  filesChanged: string[]
  verificationStatus: 'not_run' | 'passed' | 'failed' | 'demo_passed'
}
```

---

## 10. MVP Screens

### 10.1 Required Screens

| Screen | 用途 | Presentation 必需 |
| --- | --- | --- |
| Welcome / Open Sample | 快速启动受控故事。 | Yes |
| Project Space Dashboard | 一眼展示产品概念。 | Yes |
| Function Map | 展示 feature-level architecture。 | Yes |
| Semantic File Tree | 按意义展示文件，而不仅是目录层级。 | Yes |
| Code Editor / Diff | 证明这是 IDE，不只是 dashboard。 | Yes |
| Chat + Context Header | 展示 point-to-context workflow。 | Yes |
| Prompt Refinement Card | 展示“执行前确认理解”。 | Yes |
| Agent Flow | 展示 AI transparency 和 controllability。 | Yes |
| Debug Harness | 展示 root-cause repair 定位。 | Yes |
| Terminal / Error Surface | 触发 Debug Harness。 | Yes，可模拟 |

### 10.2 Visual Priorities

- 打开 sample 后的第一屏必须立即展示产品：Function Map、Semantic File Tree、AI Chat context。
- Agent Flow 必须像真实 execution trace，而不是 decorative timeline。
- Debug Harness 必须清楚区分 business context 与 debug context。
- “demo fixture” 只出现在 dev metadata 中，不出现在 user-facing copy。
- presentation 中不要把核心 surfaces 藏在过多 tabs 后。

---

## 11. MVP Showcase 开发计划

### Phase 0：Void Adoption Spike

**目标**：在承诺 build 前证明 Void 是可行基座。

交付物：

- fork 可在 macOS 本地 build。
- dev command 已记录。
- packaging path 已识别。
- first-party workbench contribution location 已识别。
- minimal Project OS activity/view 可渲染。
- risk decision：继续 Void，或 fallback 到 standalone Electron + Monaco。

验收：

- 开发者可 launch fork，并看到 Project OS placeholder view。
- 团队有关于 build time、code locations、maintenance risk 的 written note。

### Phase 1：Project OS Shell Inside Void

**目标**：让 Void 看起来并导航起来像 Project OS。

构建：

- Project OS activity entry。
- 面向 presentation 的 three-panel layout：
  - Left：Semantic File Tree。
  - Center：Function Map / Agent Flow / Code / Diff。
  - Right：Chat + Prompt Refinement + Debug Harness。
- Command palette commands：
  - `Project OS: Open Sample Workspace`
  - `Project OS: Analyze Workspace`
  - `Project OS: Start Demo Scenario`
  - `Project OS: Trigger Demo Error`

验收：

- 打开 sample workspace 后进入 Project OS view。
- view switching 和 selection state 感觉即时。

### Phase 2：Local Data and Project Space

**目标**：建立 data backbone。

构建：

- `.projectos/` file writer/loader。
- `graph.json` schema validation。
- `semantic-tree.json` builder。
- `current-work.json` state updates。
- `sample-graph-saas` fixture，包含 polished graph、semantic tree、seeded bug、reset state。
- 由 graph data 驱动的 Project Space dashboard。

验收：

- `Open Sample Workspace` 创建或加载全部 `.projectos` files。
- Function Map 和 Semantic File Tree 由这些 files 生成。
- 选择 graph node 会高亮 files 并更新 current work。
- reset sample workspace 会将 source files 和 `.projectos` state 恢复到 known opening scene。

### Phase 3：Context and Prompt Refinement

**目标**：证明 point-to-context 和 confirm-before-execute。

构建：

- Chat 中的 context header。
- project、feature、file 的 business context payloads。
- Prompt Refinement card。
- demo prompt 的 deterministic refinement。
- 同一 interface 后的 optional real provider path。

验收：

- demo workspace 中点击 node 后 200 ms 内 Chat context 改变。
- demo prompt 无需网络即可生成 polished refinement card。

### Phase 4：Agent Flow and Diff Review

**目标**：展示透明的 AI execution。

构建：

- `agent-runs/*.jsonl` event writer。
- stream events 的 Agent Flow panel。
- Google login 的 timed presentation scenario。
- 使用 native editor/diff surface 的 diff preview。
- apply result 更新 graph/tree/current-work state。

验收：

- confirm Prompt Refinement 后自动打开 Agent Flow。
- Agent Flow steps 按可信顺序出现。
- Diff preview 打开并引用真实 sample files。
- apply curated diff 后跨 surfaces 更新 UI status。

### Phase 5：Debug Harness Showcase

**目标**：展示 root-cause repair，而不是 patching。

构建：

- Terminal/error trigger。
- sample auth error 的 error-to-node/file mapper。
- Harness record UI：
  - Evidence。
  - Hypotheses。
  - Patch-like rejection。
  - Chosen root cause。
  - Verification result。
- Agent Flow 中的 debug run events。
- Function Map 和 Semantic File Tree 中的 error visual sync。

验收：

- trigger demo error 后，相关 node 和 files 变红。
- Harness 解释 root cause，并 reject patch-like fix。
- completing fix 后 status 变绿，并记录 harness history。

### Phase 6：Presentation Polish and QA

**目标**：让 demo 在压力下可靠。

构建：

- one-click reset demo state。
- offline presentation mode。
- seeded sample repo。
- recording script。
- key screens screenshot checks。
- smoke test checklist。

验收：

- demo 可 reset 并 replay 5 次，无需 manual cleanup。
- core presentation 不需要 model/network call。
- 所有 required screens 都能在 desktop presentation size 渲染。
- 5-7 分钟 live demo script 已记录。

---

## 12. MVP Team Lanes

| Lane | Owns | Notes |
| --- | --- | --- |
| Void Platform | fork、build、workbench contribution、packaging | early risk 最高。 |
| Product UI | Function Map、Semantic File Tree、Agent Flow、Harness panels | 优先 presentation clarity。 |
| Local Data/Core | `.projectos` schemas、stores、context assembler、scenario engine | fixture-backed 但 production-shaped。 |
| Agent/Demo Logic | Prompt refinement、run logs、diff generation、harness records | deterministic first，model-backed later。 |
| QA/Presentation | demo script、reset、screenshots、rehearsal checklist | 因为 MVP 是 showcase，所以必需。 |

---

## 13. MVP 明确不要求

- 任意 repository 上的通用 AI coding。
- 生产级 cloud auth、billing、subscriptions、team sync。
- 完整 multi-agent orchestration。
- 所有 project shapes 上完全准确的 Semantic File Tree。
- 任意 stack trace 上完全正确的 Debug Harness。
- 完整 extension marketplace support。
- 完整 packaging 和 auto-update pipeline，除非 presentation 必需。

---

## 14. 关键风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| Void fork 难以 build 或修改 | 可能阻塞 MVP shell。 | 先做 Phase 0 spike；fallback 到 standalone Electron + Monaco。 |
| demo 看起来假 | 观众失去信任。 | 使用 real IDE shell、real files、real diff preview、inspectable local data。 |
| 产品 surface 太多导致观众过载 | core value 被淹没。 | 构建一条 guided presentation path，并默认 progressive disclosure。 |
| Agent behavior live failure | demo 中断。 | Presentation mode 必须 deterministic 且 offline-safe。 |
| 快速推进时 data schemas drift | UI/services 断裂。 | 将本文 TypeScript interfaces 作为 MVP contract；validate local JSON。 |
| Harness promise 过强 | credibility risk。 | 将 Harness 表达为 root-cause workflow showcase，而不是 universal bug fixer。 |

---

## 15. 完成定义

MVP showcase 完成条件：

1. Void-based app 以 Project OS 启动。
2. 一个 sample workspace 打开，并显示全部 core product surfaces。
3. Function Map、Semantic File Tree、Chat context、Agent Flow、Code/Diff、Terminal/Error、Debug Harness 可见并联动。
4. Google login demo path end to end 完成。
5. Debug Harness demo path end to end 完成。
6. demo 可通过一个 command 或 button reset 到 known state。
7. core `.projectos` files 是 valid JSON，并匹配本文 interfaces。
8. 团队有 recorded rehearsal 和 live-demo checklist。

---

## 16. Full Product Plan 后续事项

MVP plan 被接受后，单独维护 full-product plan，覆盖：

- production architecture。
- cloud service boundaries。
- auth、billing、usage、team workspace database。
- real analyzer 和 model pipeline。
- long-term schema evolution。
- Phase 2 到 Phase 4 roadmap。
- 从 presentation-mode services 到 production services 的 migration。
