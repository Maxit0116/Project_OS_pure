# Project OS 全产品架构与开发计划

**状态**：Draft v0.1  
**范围**：完整产品，MVP showcase 之后的生产路径  
**与 MVP plan 的关系**：将 `MVP-Showcase-Architecture-and-Dev-Plan.md` 扩展为生产级产品架构  
**产品方向**：graph-driven AI IDE，让 codebase structure、AI execution、root-cause debugging 都变得可见、可控

---

## 1. 产品命题

Project OS 应成为一个以 project graph 为主要控制面，而不是以 linear chat thread 或 raw file tree 为主要控制面的 IDE。

完整产品会把 codebase 变成：

- **Function Map**：用于 feature-level understanding。
- **Semantic File Tree**：按意义、状态、功能组织文件。
- **Context-aware Chat**：随 selected feature、file、error、agent step 切换 context。
- **Prompt Refinement**：执行前确认 AI 对需求的理解。
- **Agent Flow**：把 AI execution 展示为可检查 steps。
- **Debug Harness**：把 bug fixing 推向 root-cause repair。
- **Workspace layer**：承载 collaboration、project memory、usage、cloud-backed services。

MVP showcase 证明故事成立；完整产品让这个故事可用于真实项目。

---

## 2. 规划原则

| 原则 | 产品含义 | 架构含义 |
| --- | --- | --- |
| Graph first | 用户操作 feature、file、error、agent step 等 connected objects。 | Graph 和 context services 是核心 platform services，不只是 UI state。 |
| Local first | codebase 仍是 source of truth。 | local `.projectos/` state 必须 durable、inspectable、rebuildable。 |
| Cloud assisted | cloud 负责 auth、billing、model proxying、team sync、heavy AI work。 | desktop app 在基本 graph/view workflows 上不依赖 cloud。 |
| AI 可见 | 用户能看到 AI 理解了什么、使用了什么 context、改了什么。 | `agent runs` 必须输出 structured events，而不只是 final text。 |
| 根因调试 | debugging 要连接 business nodes 和 technical files。 | Harness 记录 evidence、hypotheses、patch checks、verification。 |
| 可替换模型层 | models 会持续变化。 | prompt、provider、response contracts 必须被一个 gateway 隔离。 |

---

## 3. 产品阶段

### Phase 1：MVP Showcase

目标：在一条受控 demo 中证明完整产品闭环。

source of truth：

- `docs/MVP-Showcase-Architecture-and-Dev-Plan.md`
- `sample-graph-saas/`

只构建足够可靠展示闭环的真实基础设施。

### Phase 2：Private Alpha

目标：支持 5-20 个早期用户真实项目。

必需：

- Void-based app 或 fallback Electron shell 可稳定 build。
- 支持 TypeScript/Next.js 真实项目导入。
- Function Map 和 Semantic File Tree 可从真实代码 regenerate。
- Prompt Refinement 可调用 real model provider。
- Agent Flow 记录每次 run。
- Diff Review 和 apply 受 git checkpoints 保护。
- Debug Harness 支持常见 TypeScript/Next.js errors。
- Cloud auth 和 model proxy 可用。

### Phase 3：Paid Beta

目标：支持付费个人用户和可重复 workflow。

必需：

- account system、subscription、model usage limits。
- workspace/project metadata 同步。
- 可靠的 local project cache 与 migration handling。
- real update channel 和 crash/usage telemetry。
- AI-applied changes 的 reliable rollback。
- user-facing onboarding 和 demo templates。

### Phase 4：Team Workspace

目标：支持 small teams 和 collaborative graph-driven development。

必需：

- organizations 和 workspaces。
- team membership 和 project roles。
- shared graph metadata 和 agent run summaries。
- 团队可见 activity feed。
- 可选 sync Project OS metadata，默认不 sync source code。
- cloud actions、model usage、project access 的 permission model。

### Phase 5：Platform / Ecosystem

目标：让 Project OS 成为 reusable workflows 的 platform。

必需：

- workflow preset marketplace 或 curated library。
- multi-agent orchestration。
- project memory versioning。
- advanced architecture views。
- issue tracker、CI、deployment、observability integrations。

---

## 4. 系统架构

```
Project OS Desktop App
|
|-- IDE Foundation
|   |-- Void fork or Project OS Electron shell
|   |-- Editor, diff editor, terminal, explorer, command palette
|
|-- Project OS Workbench
|   |-- Function Map
|   |-- Semantic File Tree
|   |-- Project Space Dashboard
|   |-- Context-aware Chat
|   |-- Prompt Refinement
|   |-- Agent Flow
|   |-- Debug Harness
|
|-- Local Core Services
|   |-- Workspace Service
|   |-- Analyzer / Indexer
|   |-- Project Graph Service
|   |-- Semantic Tree Service
|   |-- Context Assembler
|   |-- Agent Run Orchestrator
|   |-- Agent Flow Tracker
|   |-- Diff / Apply / Rollback Service
|   |-- Harness Engine
|   |-- Local Persistence
|
|-- Cloud Services
|   |-- Auth and Account
|   |-- Workspace Metadata
|   |-- Model Gateway
|   |-- Usage and Billing
|   |-- Team Activity Sync
|   |-- Telemetry / Crash Intake
|
|-- External Providers
    |-- Model providers
    |-- Payment provider
    |-- Git host integrations
    |-- CI / issue tracker integrations
```

---

## 5. 核心边界

### 5.1 Desktop App Boundary

desktop app 负责：

- 选择本地 workspace；
- 读取和编辑 code；
- `.projectos/` state；
- graph rendering；
- context assembly；
- local diffs 和 git checkpoints；
- terminal/error capture；
- offline presentation mode；
- 用户交互闭环。

desktop app 不应把 raw Electron IPC 暴露给 renderer surfaces。所有调用应通过 typed Project OS services。

### 5.2 Cloud Boundary

cloud 负责：

- identity；
- subscriptions；
- usage accounting；
- model proxying；
- team/workspace metadata；
- 跨设备 Project OS metadata sync；
- 可选 heavy indexing jobs；
- telemetry 和 crash reports。

cloud 不应成为打开 local project 或读取 local graph state 的前置条件。

### 5.3 Model Boundary

所有 model calls 都必须走统一的 Model Gateway contract。gateway 负责：

- provider selection；
- request shaping；
- redaction policies；
- rate limits；
- response normalization；
- usage accounting；
- fallbacks。

UI component 不应直接调用 model provider。

---

## 6. 本地数据模型

local project data 存在 `.projectos/` 下。这些 files 是 workspace 的 local database。

### 6.1 文件布局

```
<workspace>/
  .projectos/
    project.json
    graph.json
    semantic-tree.json
    current-work.json
    settings.json
    indexes/
      file-index.json
      symbol-index.json
      route-index.json
      import-index.json
    agent-runs/
      run_<id>.jsonl
      run_<id>.summary.json
    harness/
      err_<id>.json
    memory/
      project-memory.json
      node-memory.json
    migrations/
      applied.json
```

### 6.2 本地 Schema Ownership

| File | Owner Service | 用途 |
| --- | --- | --- |
| `project.json` | Workspace Service | workspace metadata 和 project settings。 |
| `graph.json` | Project Graph Service | feature graph、edges、file membership。 |
| `semantic-tree.json` | Semantic Tree Service | 按 feature/module/status 分组的 file tree。 |
| `current-work.json` | Current Work Service | focused node/file/run/error 和 recent activity。 |
| `settings.json` | Settings Service | local project preferences 和 presentation flags。 |
| `indexes/*.json` | Analyzer / Indexer | 可 rebuild 的 static analysis outputs。 |
| `agent-runs/*.jsonl` | Agent Flow Tracker | append-only run event stream。 |
| `harness/*.json` | Harness Engine | root-cause debug records。 |
| `memory/*.json` | Memory Service | project 和 node memory。 |
| `migrations/applied.json` | Persistence Layer | local schema migration tracking。 |

### 6.3 本地 Schema Versioning

每个 local JSON file 都必须包含：

```ts
interface ProjectOSLocalFile {
  version: string
  projectId: string
  createdAt?: string
  updatedAt?: string
}
```

migration rules：

- 不静默丢弃 unknown user data。
- 优先 additive migrations。
- 保留 one-click `rebuild indexes` path。
- graph/index files 作为 rebuildable projections。
- memory、run logs、harness records 作为 user-visible history。

---

## 7. Cloud 数据模型

cloud primary database 使用 Postgres。large logs/artifacts 使用 object storage；只有当 retrieval quality 需要时再加入 vector storage。

### 7.1 核心 Tables

```sql
users (
  id uuid primary key,
  email text unique not null,
  display_name text,
  created_at timestamptz not null,
  updated_at timestamptz not null
)

organizations (
  id uuid primary key,
  name text not null,
  owner_user_id uuid not null references users(id),
  plan text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
)

memberships (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  user_id uuid not null references users(id),
  role text not null,
  created_at timestamptz not null,
  unique (organization_id, user_id)
)

cloud_projects (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  local_project_id text not null,
  display_name text not null,
  framework text,
  last_seen_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
)

devices (
  id uuid primary key,
  user_id uuid not null references users(id),
  device_name text,
  platform text,
  last_seen_at timestamptz,
  created_at timestamptz not null
)
```

### 7.2 Usage 与 Billing Tables

```sql
subscriptions (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  provider text not null,
  provider_subscription_id text unique,
  status text not null,
  plan text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
)

usage_events (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  user_id uuid references users(id),
  cloud_project_id uuid references cloud_projects(id),
  event_type text not null,
  quantity numeric not null default 1,
  unit text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null
)

model_requests (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  user_id uuid references users(id),
  cloud_project_id uuid references cloud_projects(id),
  request_kind text not null,
  provider text not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  status text not null,
  latency_ms integer,
  error_code text,
  created_at timestamptz not null
)
```

### 7.3 Sync Tables

```sql
project_snapshots (
  id uuid primary key,
  cloud_project_id uuid not null references cloud_projects(id),
  snapshot_kind text not null,
  schema_version text not null,
  object_storage_key text not null,
  checksum text not null,
  created_by uuid references users(id),
  created_at timestamptz not null
)

agent_run_summaries (
  id uuid primary key,
  cloud_project_id uuid not null references cloud_projects(id),
  local_run_id text not null,
  run_kind text not null,
  status text not null,
  summary text,
  related_node_ids text[] not null default '{}',
  related_files text[] not null default '{}',
  created_by uuid references users(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null
)

harness_summaries (
  id uuid primary key,
  cloud_project_id uuid not null references cloud_projects(id),
  local_error_id text not null,
  status text not null,
  business_node_id text,
  technical_files text[] not null default '{}',
  root_cause_summary text,
  verification_status text,
  created_by uuid references users(id),
  created_at timestamptz not null
)
```

cloud sync 初期只存 summaries 和 metadata。early product phases 不要求 sync full source code。

---

## 8. 关键产品数据结构

### 8.1 Project Graph

graph 是 codebase 上的核心 product projection。

```ts
interface ProjectGraph {
  version: string
  projectId: string
  projectName: string
  projectType: 'nextjs-app' | 'nextjs-pages' | 'node' | 'unknown'
  analyzedAt: string
  analysisStatus: 'complete' | 'partial' | 'indexing' | 'error'
  nodes: FunctionalNode[]
  edges: FunctionalEdge[]
  fileIndex: FileEntry[]
}
```

MVP 之后的 production additions：

- node ownership；
- confidence evidence；
- stale markers；
- manual user edits；
- graph revision ID；
- analysis provenance。

### 8.2 Semantic Tree

Semantic File Tree 由 graph + file index + user edits 派生。

```ts
interface SemanticTreeNode {
  id: string
  label: string
  kind: 'feature' | 'folder' | 'file' | 'route' | 'api' | 'config' | 'test' | 'error_group'
  path?: string
  sourceNodeId?: string
  status: 'normal' | 'active' | 'in_progress' | 'error' | 'suggested' | 'stale'
  children: SemanticTreeNode[]
  badges?: string[]
  sortKey?: string
}
```

### 8.3 Prompt Refinement

```ts
interface PromptRefinement {
  id: string
  projectId: string
  nodeId?: string
  filePath?: string
  rawPrompt: string
  understood: {
    intent: string
    behavior: string[]
    constraints: string[]
    affectedNodeIds: string[]
    affectedFiles: string[]
  }
  ambiguities: Array<{
    question: string
    severity: 'blocking' | 'non_blocking'
    options?: string[]
  }>
  suggestions: Array<{
    label: string
    promptPatch: string
    reason: string
  }>
  confidence: number
  createdAt: string
}
```

### 8.4 Agent Run

agent runs 由 event streams 和 summaries 组成。

```ts
interface AgentRunSummary {
  runId: string
  projectId: string
  kind: 'feature_change' | 'debug_fix' | 'review' | 'refactor' | 'plan'
  status: 'queued' | 'running' | 'awaiting_review' | 'complete' | 'error' | 'cancelled'
  relatedNodeIds: string[]
  relatedFiles: string[]
  result?: {
    summary: string
    filesChanged: string[]
    verificationStatus: 'not_run' | 'passed' | 'failed'
  }
  startedAt: string
  completedAt?: string
}
```

### 8.5 Harness Record

```ts
interface HarnessRecord {
  version: string
  errorId: string
  projectId: string
  rawError: string
  source: 'terminal' | 'compiler' | 'runtime' | 'ci'
  businessNodeId?: string
  technicalFiles: string[]
  hypotheses: RootCauseHypothesis[]
  chosenRootCauseId?: string
  patchAssessment?: PatchAssessment
  verification: VerificationResult
}
```

---

## 9. Interface Contracts

### 9.1 Local Desktop API

```ts
interface ProjectOSLocalApi {
  openWorkspace(path: string): Promise<ProjectOSProject>
  analyzeWorkspace(projectId: string, mode: 'full' | 'incremental'): Promise<ProjectGraph>
  getProjectGraph(projectId: string): Promise<ProjectGraph>
  updateGraphManualEdit(edit: GraphManualEdit): Promise<ProjectGraph>
  getSemanticTree(projectId: string): Promise<SemanticTree>
  getContext(request: ContextRequest): Promise<ContextPayload>
  refinePrompt(request: PromptRefineRequest): Promise<PromptRefinement>
  confirmExecution(refinementId: string): Promise<AgentRunSummary>
  streamAgentRun(runId: string, cb: (event: AgentRunEvent) => void): Disposable
  getDiff(runId: string): Promise<GeneratedDiff>
  applyDiff(runId: string, options: ApplyOptions): Promise<ApplyResult>
  createCheckpoint(projectId: string): Promise<GitCheckpoint>
  rollbackCheckpoint(checkpointId: string): Promise<void>
  reportError(projectId: string, rawError: string): Promise<HarnessRecord>
  startHarnessFix(errorId: string): Promise<AgentRunSummary>
}
```

### 9.2 Cloud API

```http
POST /v1/auth/device-login
GET  /v1/me
GET  /v1/organizations
POST /v1/organizations
GET  /v1/projects
POST /v1/projects/register
POST /v1/projects/:id/snapshots
GET  /v1/projects/:id/snapshots
POST /v1/model/complete
POST /v1/model/stream
POST /v1/usage/events
GET  /v1/billing/subscription
POST /v1/billing/checkout
POST /v1/telemetry/crash
POST /v1/telemetry/event
```

### 9.3 Model Gateway API

```ts
interface ModelGatewayRequest {
  organizationId: string
  userId: string
  projectId?: string
  requestKind:
    | 'feature_decomposition'
    | 'prompt_refinement'
    | 'change_generation'
    | 'root_cause_analysis'
    | 'code_review'
    | 'context_summary'
  modelPreference?: string
  input: unknown
  redactionPolicy: 'none' | 'local_paths_only' | 'secrets_and_paths'
  maxOutputTokens?: number
}

interface ModelGatewayResponse<T> {
  requestId: string
  provider: string
  model: string
  output: T
  usage: {
    inputTokens: number
    outputTokens: number
  }
  latencyMs: number
}
```

---

## 10. AI Logic

### 10.1 Feature Decomposition

inputs：

- route index；
- file index；
- import graph；
- package dependencies；
- README/package metadata；
- optional user hints。

outputs：

- graph nodes；
- file membership；
- edges；
- confidence 和 evidence；
- suggested nodes。

implementation path：

1. heuristic static pass 创建 candidate nodes。
2. model pass 将 candidates 重新命名并按产品语言分组。
3. validation pass 检查每个 linked file 存在，且 edges 指向 valid nodes。
4. user edits 作为上层覆盖，并在 re-indexing 后保留。

### 10.2 Prompt Refinement

inputs：

- raw user prompt；
- selected feature/file context；
- current work state；
- graph neighbors；
- recent errors；
- project conventions。

outputs：

- structured understanding；
- ambiguities；
- suggested prompt refinements；
- affected scope。

规则：

- model 可能错误，所以 UI 必须展示 uncertainty，并允许 users edit 或 skip。

### 10.3 Change Generation

inputs：

- confirmed prompt refinement；
- scoped context bundle；
- current files；
- git checkpoint；
- allowed file scope。

outputs：

- internal change plan；
- generated diff；
- verification plan；
- agent events。

safety：

- default file scope 是 selected node 加 direct neighbors。
- scope 扩大时必须给出 visible explanation。
- 只有在 diff review 后，或 trusted quick-apply mode 下，才能 apply。

### 10.4 Debug Harness

inputs：

- raw error；
- terminal/compiler/runtime source；
- graph；
- file/symbol index；
- recent changes；
- failing command output。

outputs：

- business node mapping；
- technical files；
- root-cause hypotheses；
- patch-style assessment；
- proposed fix；
- verification result。

patch detection signals：

- fix 只修改 thrown line；
- fix 避开 related business node files；
- fix suppress error 但不解释 causal path；
- fix 修改大量 unrelated files。

---

## 11. 安全与隐私

### 11.1 本地安全

- API tokens 存在 OS secure storage。
- 不向 renderer components 暴露 raw tokens。
- validate every local service request。
- file operations 限制在 active workspace。
- AI edits 前创建 git checkpoint。
- 对 model requests redact secrets。

### 11.2 Cloud 安全

- 每个 endpoint 执行 organization-scoped authorization。
- workspace actions 执行 membership role checks。
- usage events 必须 append-only。
- model request logs 默认存 metadata，不存 raw code。
- full project snapshots 需要 explicit user opt-in。
- billing webhooks 必须 idempotent。

### 11.3 Privacy Defaults

default sync policy：

- sync account、usage、subscription、project metadata。
- 只有 user opt-in 后才 sync graph 和 run summaries。
- 默认不 sync source code。

---

## 12. 可观测性

desktop telemetry：

- app launch success/failure；
- workspace open；
- graph generation time；
- Prompt Refinement shown/confirmed/skipped；
- Agent Flow run status；
- diff apply success/failure；
- Harness status；
- crash reports。

cloud telemetry：

- model latency；
- model error rate；
- token usage；
- billing status；
- sync failures；
- auth failures。

product metrics：

- visualization-driven edit ratio；
- Prompt Refinement confirmation rate；
- Agent Flow inspection rate；
- Harness root-cause repair rate；
- rollback rate；
- time from prompt to reviewed diff；
- repeated error rate。

---

## 13. 工程路线图

### Workstream A：IDE Foundation

1. validate Void fork。
2. 添加 Project OS workbench contribution。
3. 添加 graph/editor/chat panel layout。
4. 添加 command palette commands。
5. 添加 packaging 和 update path。

### Workstream B：Local Project Core

1. 实现 `.projectos` persistence 和 migrations。
2. 实现 TypeScript/Next.js analyzer/indexer。
3. 实现 graph service。
4. 实现 semantic tree service。
5. 实现 current work service。

### Workstream C：AI Workflow

1. 实现 context assembler。
2. 实现 Prompt Refinement。
3. 实现 agent run orchestrator。
4. 实现 Agent Flow event stream。
5. 实现 diff generation/apply/rollback。

### Workstream D：Debug Harness

1. capture terminal/compiler/runtime errors。
2. 将 errors 映射到 files 和 graph nodes。
3. 生成 root-cause hypotheses。
4. assess patch-style fixes。
5. run verification 并 record outcomes。

### Workstream E：Cloud Platform

1. auth 和 device login。
2. organization 和 membership model。
3. Model Gateway。
4. usage accounting。
5. subscription 和 billing。
6. project metadata sync。
7. telemetry 和 crash intake。

### Workstream F：Sample, QA, and Onboarding

1. 维护 `sample-graph-saas`。
2. 添加 demo reset。
3. 添加 onboarding walkthrough。
4. 添加 sample graph integration tests。
5. 添加 release smoke checklist。

---

## 14. 里程碑

| Milestone | Target | Outcome |
| --- | --- | --- |
| M0: MVP Showcase | controlled demo | 在 `sample-graph-saas` 上看到完整产品闭环。 |
| M1: Local Alpha | 5-20 projects | real import、graph、tree、context、prompt refinement、diff review。 |
| M2: AI Execution Alpha | internal users | Agent Flow 和 guarded diffs 可在真实项目上工作。 |
| M3: Harness Beta | early users | 常见 TypeScript/Next.js errors 映射到 root-cause workflows。 |
| M4: Paid Beta | first paid users | auth、billing、model proxy、usage limits、onboarding。 |
| M5: Team Beta | small teams | workspace metadata、shared run summaries、roles。 |
| M6: Platform | ecosystem | workflow presets、integrations、advanced architecture views。 |

---

## 15. 验收标准

### Product

- users 可打开真实 TypeScript/Next.js project，并看到 usable graph。
- users 可选择 feature，并获得 relevant chat context。
- users 可在 execution 前 confirm 或 edit AI understanding。
- users 可 inspect AI steps during execution。
- users 可 review diffs before apply。
- users 可通过 git checkpoints 从 failed AI edits 恢复。
- users 可在 common errors 上运行 Debug Harness。

### Architecture

- local state versioned 且 migration-safe。
- UI 使用 typed local services，而不是 ad hoc file reads。
- model calls 走 Model Gateway。
- cloud sync 对 local workflows 是 optional。
- billing 和 usage enforceable，且 provider logic 不 hard-code 到 desktop app。

### Data

- 每条 graph edge 引用 valid nodes。
- 每个 linked file 存在，或 marked stale。
- agent runs 是 append-only event streams。
- harness records 包含 evidence、hypotheses、chosen root cause、verification。
- cloud tables enforce organization scoping。

---

## 16. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| Void fork maintenance expensive | 保持 Project OS services portable；保留 fallback Electron shell path。 |
| graph quality 在真实项目上低 | 从 Next.js 开始，展示 confidence，保留 manual edits，加入 user correction loop。 |
| AI edits break user projects | 限制 scope，要求 git checkpoints，展示 diffs，支持 rollback。 |
| Debug Harness over-promises | 从常见 TypeScript/Next.js failures 开始，并展示 confidence/evidence。 |
| cloud privacy concerns block adoption | local-first defaults，opt-in sync，metadata-first cloud model。 |
| model costs unpredictable | centralized Model Gateway、usage accounting、plan limits、适当 deterministic local fallbacks。 |
| product surface too complex | progressive disclosure：先 graph，再 context，再 flow，再 harness。 |

---

## 17. 从 MVP Showcase 迁移到完整产品

MVP showcase 不应被丢弃。它应成为真实 service contracts 的第一个 fixture-backed implementation。

migration steps：

1. 保留同一套 local schemas 和 typed service interfaces。
2. 按 service 逐一用 real analyzer/model implementations 替换 deterministic demo scenario outputs。
3. 保留 `sample-graph-saas` 作为 regression fixture。
4. 在同一 `openWorkspace` 和 `analyzeWorkspace` calls 后加入 real project imports。
5. 在 Prompt Refinement 和 Change Generation 后接入 model provider calls。
6. local flows 稳定后加入 Cloud Model Gateway。
7. 只有 local product loop 可信后再加入 cloud account/billing。

---

## 18. 完整产品就绪定义

完整产品实现 ready 的条件：

1. Void adoption spike 已有 continue/fallback decision。
2. MVP showcase local schemas 被接受为 v0 contracts。
3. `sample-graph-saas` 有 stable graph 和 harness fixtures。
4. auth、database、billing、model gateway 的 cloud provider choices 已缩小范围。
5. security/privacy defaults 已接受。
6. Workstreams A-F 有 owners。

---

## 19. 完整产品完成定义

第一个完整产品 release 完成条件：

1. user 可安装 Project OS 并打开真实 supported project。
2. Function Map 和 Semantic File Tree 从真实代码生成。
3. Context-aware Chat、Prompt Refinement、Agent Flow、Diff Review、Debug Harness 都能在非 demo 项目上工作。
4. git checkpoint 和 rollback 可靠工作。
5. auth、billing、usage、model proxy production-ready。
6. local data migrations 已测试。
7. privacy defaults 已记录并 enforced。
8. 产品不依赖 presentation fixtures 也能完成 core workflow demo。
