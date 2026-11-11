# Loops Graph · Project Workflow Runs + Task Materials

**状态**：计划权威稿（2026-11-10）。文档入仓 ≠ 完成；实现状态见下方矩阵与 [`Loops-Graph-Six-Goals-Execution-Tracking.md`](./Loops-Graph-Six-Goals-Execution-Tracking.md)。  
**范围**：在**不另起编排底座**的前提下，把已有 IntentGraph / LoopSpec / LoopInstance 做成「真正用于项目」的可保存流程 + 每次 run 绑定工程上下文；并统一多类型任务材料输入（与 Ask/Edit authoring 输入分离）。  
**同流约束**：保留六目标 / 全 11 平台连接器清单 / 手工 DutyCard + 真实 Agent 双入口 / Pure 组件与 token；不丢安全修复；无 Mac/外发/付费 live/merge 授权。

## 与已有权威文档的关系（互链，不重复造计划）

| 文档 | 关系 |
|------|------|
| [`Loops-Graph-Workflow-Studio-Dev-Plan.md`](./Loops-Graph-Workflow-Studio-Dev-Plan.md) | Studio 壳、D4「三种启动统一 Workflow Run」、D5 定义版本固定。**本文件具体化**「项目内选流程→预检→隔离工作区交付」产品路径。 |
| [`Loops-Graph-Gaps-Closure-Dev-Plan.md`](./Loops-Graph-Gaps-Closure-Dev-Plan.md) | 六机制 / pause / checkpoint / 触发总控。本文件 **不重做** GC-*；新增 **PW-\***（Project Workflow）与 **TM-\***（Task Materials）切片，依赖 GC 已落地能力。 |
| [`Loops-Graph-Node-Architecture-Dev-Plan.md`](./Loops-Graph-Node-Architecture-Dev-Plan.md) | 节点类型合同；材料可绑定节点，但不改 Agent/Action/Logic/Human 分类。 |
| [`Loops-Graph-UI-Visual-Authoring-Dev-Plan.md`](./Loops-Graph-UI-Visual-Authoring-Dev-Plan.md) | DutyCard / Palette；手工配置入口复用，不另造侧栏。 |
| [`Loops-Graph-Six-Goals-Execution-Tracking.md`](./Loops-Graph-Six-Goals-Execution-Tracking.md) | **执行跟踪 + 验收矩阵实况**（计划/实现/contract/live/待验）。 |
| [`Loops-Graph-Gmail-Connector-Dev-Plan.md`](./Loops-Graph-Gmail-Connector-Dev-Plan.md) | **Gmail 追加**（2026-11-10，非 5814430）：邮件→材料/RunBinding；只读首期；发送/push 边界。 |
| [`backend/Planning-Orchestration-Dev-Plan.md`](./backend/Planning-Orchestration-Dev-Plan.md) | Spec 冻结 / AgentRun / Evidence 底座不变。 |
| [`backend/Security-Governance-Dev-Plan.md`](./backend/Security-Governance-Dev-Plan.md) | 审批审计；材料与 URL 读取须遵守 SSRF/密钥边界（见 §5）。 |
| [`bugs.md`](../../bugs.md) | H3 SSRF 先例：材料 URL 读取必须默认拒内网/localhost，生产策略不放宽。 |

---

## 1. 全范围总览（六目标 + 11 平台 + 双入口 + 增量 A/B）

### 1.1 仍保留的六目标（不删）

1. GitHub / Slack / 飞书 Feishu / Lark / Sentry + Trigger/Action/Webhook/HTTP，并保留 Linear→PostHog 全清单分批。  
2. Condition / parallel / loop / timer / retry / pause / resume。  
3. Reusable Agents + 互调。  
4. Human review / approval（配置齐 ≠ 运行授权；审批通过 ≠ 开跑）。  
5. Engineering context（workspace / branch / code digest / Verify）。  
6. Observability（journal / audit / redaction）。

### 1.2 双入口（与本文件并行，不替代）

| 入口 | 产品行为 | 共享底座 |
|------|----------|----------|
| **手工** | Draw 双击 → DutyCard → Inspector 类型表单 | Intent 节点 schema / 校验 / revision / draftHistory |
| **真实 Agent** | Provider 通路（非 heuristic 冒充）；prompt 含 workflow + 选中节点 + connector schema；patch 保留未目标 ID/边/手工字段；diff→Accept/Dismiss/Undo | 同上；生成绝不自动执行 |

### 1.3 增量 A — Workflow 真正用于项目（PW）

复用 Definition（Intent）→ Approve（Spec 冻结）→ Instance（run）底座：

1. 可保存「实现功能 / 修 bug / 审 PR」类流程模板（项目内）。  
2. **每次 run 绑定**：`projectId` / repo / workspaceRoot / branch / code 版本指纹、任务 input、`specVersion`、权限预算、凭证 **引用**、产物引用。  
3. **编辑定义不污染运行快照**（Spec 冻结；Instance 只追加事件/产物）。  
4. 路径：项目内选流程 → 填任务材料 → **预检与确认**（工作区/分支/Agent 服务/缺配置/审批点）→ 真实隔离工作区编码测试/人工协作 → Diff / TestReport / Preview 或 PR 产物；失败保留有效证据可安全续。  
5. 快捷调用：Issue / PR / 选中代码 / 错误上下文 → 同一 run 机制。  
6. 事件：GitHub / Sentry / 定时 → 同 `LoopInstance` 创建路径（依赖 GC 触发；离线队列 = LocalApi/IPC 持久 enqueue/drain，**非** 24/7 live 全天接收 / 桌面自动 settle）。  
7. **产品支持真实工作区执行 ≠ 授权碰 Terran Mac / 日常源码 / 真实外发**。

### 1.4 增量 B — 多类型输入（TM）

统一 **任务描述 + 参考材料 + 项目上下文**：

| 材料类型 | 产品要求 | 分期 |
|----------|----------|------|
| 文字 | 主任务描述 | P0 |
| 图片 / 截图 / 设计稿 / 错误画面 | 标用途；视觉不支持须明确提示 | P0 卡片 + P1 视觉 |
| 文件文档 / API / log | 可选内容章节 | P0 元数据 + P1 解析 |
| CSV / XLSX | 预览 sheet/列/范围；标需求/测试/业务数据角色 | P1 |
| URL（网页/docs/Issue/PR） | 明确来源；读取/鉴权失败可见；防 SSRF | P0 策略 + P1 读取 |
| 项目文件 / 目录 / 代码 / C4 / 测试引用 | 免重复上传；可追溯引用 | P0 |

规则：

- **Authoring 输入**（Ask/Edit 改定义）与 **Task/Run 材料** 分离；上传 **不** 悄悄改定义。  
- 复用 Pure 现有输入 / 附件 / 粘贴拖拽 / 项目引用组件。  
- 材料卡片：预览 / 替换 / 删除；用途 / 范围 / 解析状态 / 大小格式限制 / 权限。  
- Schema：类型、必填、用途、节点绑定、默认值、run 覆盖、来源版本与快照或可追溯引用。  
- 材料变化 → 提示受影响计划/证据需重审；**不**机械全图重跑；按需只把必要材料交给相关节点/model。

---

## 2. 阶段依赖（核实后的顺序）

```text
S0  Security gates (high-risk / no blind POST retry / redaction / catalog_only)
    + 双入口 schema/校验/revision   [进行中 · 契约已测部分]
        ↓
S1  权威文档 + 验收矩阵同步（本文件 + Tracking）  [本提交]
        ↓
S2  共用 Input / Run 契约（TaskMaterial + RunBinding；与 LoopInstance 字段对齐）
        【初版 contract 已入库：`contracts/loop-task-materials.ts` + preflight/start 接线；
          完整产品 UI / 项目手动 E2E / 多格式解析仍属后续 — 勿把 schema 当 S2 全勾】
        ↓
S3  项目手动启动「实现页面」流程 + 首批材料（文字 + 项目引用 + 基础附件元数据）
        ↓
S4  其余格式（表/图视觉）+ Issue/PR/错误上下文快捷调用
        ↓
S5  GitHub/Sentry 事件同 run 机制 + 定时；离线队列诚实标 LocalApi/IPC 已实现（≠ live 全天 / 自动 UI）
        ↓
S6  11 平台其余批次 / runtime context / 观测 与六目标回归同闸
```

依赖说明：

- PW 预检依赖：Spec 已批准、workspace 可解析、凭证引用存在性检查（非 secret 明文）、Human 审批点清单。  
- TM 依赖：S2 契约先于 UI；URL 读取依赖 Security 策略（默认拒内网）。  
- 双入口与 SaaS 卡片可与 S2 并行，但 **不可** 阻塞 S0 安全门禁。  
- Batch2/3 连接器 **不** 阻塞 PW 手动路径。

---

## 3. 契约（拟议；实现前落 contracts，文档不算完成）

### 3.1 RunBinding（Instance 侧快照，定义编辑不可回写污染）

| 字段 | 含义 | 状态 |
|------|------|------|
| `projectId` / `workspaceRoot` | 项目绑定 | 计划（部分可由 LocalApi 上下文推导） |
| `repo` / `branch` / `codeDigest` | 代码版本 | 计划（digest 底座已有） |
| `specVersion` | 定义版本锁 | **已实现**（Instance.specVersion） |
| `taskInputId` / materials[] | 任务材料引用 | 计划 |
| `budget` / `permissionSet` | 权限预算 | 部分（stopPolicy / retryPolicy） |
| `credentialRefIds[]` | 凭证引用 | 节点 `credentialRefId` + GitHub/connector offline fail-closed（缺 ref / 无 DI）；live 授权 **未接** |
| `artifacts[]` | 产物 | **已实现**（Instance.artifacts） |

### 3.2 TaskMaterial

| 字段 | 含义 |
|------|------|
| `id`, `kind` (`text`\|`image`\|`file`\|`table`\|`url`\|`project_ref`) | 类型 |
| `purpose` | 用途枚举（需求/设计/错误/API/测试数据/…） |
| `bindingNodeIds?` | 可选节点绑定 |
| `source` | upload / paste / project_ref / url |
| `contentRef` / `bytesHash` / `version` | 可追溯；大文件不进 Intent |
| `parseStatus` | pending / partial / ok / unsupported / failed |
| `runOverride?` | 仅本次 run 覆盖，不写回定义 |

### 3.3 Authoring vs Task 分离

| 通道 | 写入目标 | 禁止 |
|------|----------|------|
| Ask/Edit authoring | Intent draft + pendingGraphEditOffer | 不得因上传材料自动改 Spec |
| Start run / task pack | Instance launch + materials | 不得在无 Accept 时改 draft 定义 |

---

## 4. 验收矩阵

状态枚举：**计划** · **实现** · **contract** · **live** · **待验** · **未配置**。入文档 ≠ 完成。

### 4.1 增量 A（Project Workflow）

| ID | 验收项 | 状态 | 证据 |
|----|--------|------|------|
| PW-1 | 项目内选择已保存流程并启动 | **实现/localE2E**：rail 打开已保存流程 + `openSavedFlowForRun` → Run 页 materials→preflight→start；taskPack 重开 | Overlay `data-loop-open-saved-flow-run` + Electron failfix 路径 |
| PW-2 | Run 绑定 project/repo/workspace/branch/codeDigest/specVersion | **contract 初版** / 产品路径待验 | LocalApi start 接线 RunBinding 子集；完整字段 **未齐** |
| PW-3 | 预检：缺配置 / 分支 / Agent / 审批点列表，确认后才开跑 | **contract** + Electron 材料/预检面板 + 孤儿审批闸 **blocker**；temp 证据测 Spec→preflight→start；无 Spec 禁用 ≠ 通过条件 | `LoopRunMaterialsPanel` + `validateApprovalGateWiring`；审批通过 ≠ 开跑 |
| PW-4 | 隔离工作区编码+测试+人工；产出 Diff/TestReport/Preview 或 PR | **实现/localE2E（非 live）**：DI-only `local_tools`；语义 fail→fix→green；ChangeSet+TestReport+exitCode+unifiedDiff；UI Show Diff / exit DOM；`loops-b-ui-06-*`（单屏≠全文）。付费 live / 真 PR 外发 **未完** | `loop-execution-loopback` + credential fail-closed |
| PW-5 | 失败保留证据可续；cancel/recover | 部分实现 / 证据加深 | checkpoint / cancel **已测**；failfix 路径保留 failed+passed artifacts；缺 leaf→`文件未挂接` |
| PW-6 | 编辑定义不污染运行中 Instance 快照 | **实现/证据**（failfix + taskPack isolation） | Spec 冻结；taskPack 不 bump draft revision；start 后改 draft 不改 runBinding |
| PW-7 | Issue/PR/选中代码/错误上下文快捷调用同 run | **实现/contract**：`buildPw7ContextMaterial` + 面板表单 + **`data-loop-pw7-from-editor` 实入口**（无选区诚实报错）；非 live Issue 拉票 | `loop-pw7-context-materials` + `LoopRunMaterialsPanel` + evidence-bundle-09 |
| PW-8 | GitHub/Sentry/定时事件同机制；离线排队 | 部分加深 | GitHub/Sentry 同上；离线排队 **实现/contract**（持久 dedupe/drain/recover；非外网 24/7） |

### 4.2 增量 B（Materials）

| ID | 验收项 | 状态 | 证据 |
|----|--------|------|------|
| TM-1 | 文字任务描述 | **实现**：材料卡预览/替换/错误 + text/`project_ref`/`file` 入 runBinding；级别 `text_preview` | `LoopRunMaterialsPanel` |
| TM-2 | 图片用途标注 + 不支持提示 | **实现加深**：真实 bytes→contentRef；缺视觉 apiFormat **preflight blocker** + 可替换；`vision_attach`→`ModelGatewayRequest.images`（openai_chat/anthropic_messages）；Pure 预览；**live 未授权** | vision-capability + preflight + ImagePreview |
| TM-3 | 文件/API/log 卡片 + 解析状态 | plaintext/md/json/log = text_preview；CSV/XLSX/PDF 见 TM-4；URL 见 TM-5 | formats + parsers |
| TM-4 | CSV/XLSX sheet/列/范围 + 角色 | CSV **structured_selection**；XLSX OOXML sheet/A1 + 禁外部 rel/zip bomb；PDF 页范围 + timeout/cancel/加密/扫描空文如实；Electron `ingestLoopTaskMaterial` | `loop-material-csv` / `xlsx` / `pdf` / `ingest` |
| TM-5 | URL 来源 + 鉴权/读取失败 + SSRF 默认拒内网 | **实现/contract + UI**：DNS-pin fetch；面板 URL 入口→`ingestLoopUrlMaterial`；失败成卡（ssrf/scheme/login_wall）；无 Cookie/Auth | `loop-url-material-fetch` + evidence-bundle-08 |
| TM-6 | 项目文件/C4/测试引用免重复上传 | 计划（C4 引用底座已有） | — |
| TM-7 | 增删替换 / 保存重开 / run 覆盖不改定义 | **实现/contract**：document.taskPack 持久化；select/load 恢复；create 不清污染；start 后恢复定义 pack；draft revision 不变 | `loop-task-pack.isolation.test` + evidence-bundle-12/13 |
| TM-8 | 材料变化提示重审；不机械全图重跑 | **实现/contract**：writeback→taskPack.materialRereview + ack + preflight blocker；`mechanicalFullRerun=false`；面板 stale evidence | `loop-material-rereview` + evidence-bundle-10/11 |

### 4.3 双入口 / 安全 / 连接器（交叉回归）

| ID | 验收项 | 状态 |
|----|--------|------|
| DE-1 | DutyCard 类型表单 Agent/Action/Logic/Human | **实现**；产品入口 = Draw **dblclick** `[data-loop-node]` / 右键 Open Duty（**≠** Review 架构节点详情）；含 GC-6.6 关联 Run；截图见 Six-Goals |
| DE-2 | Provider authoring loopback：空图；审批闸语义；连续陈旧负例 | **实现/证据**（**loopback·not live**）：A3 连续脚本无 fatal——改其他字段保 retry=2；改 retry→1 则保 1（不假恢复 2）；timeout 恒 7777、无 9999；重开一致。**UI Accept-disabled ≠ server reject**（分层：UI 禁用 vs `acceptLoopGraphEditOffer` / runtime gate **contract**）。付费 live **未验** |
| SEC-1 | High-risk / catalog_only 不可调用方绕过 | **contract** |
| SEC-2 | 非幂等 POST 不盲重试；timeout/abort unknown；脱敏全链 | **contract** |
| CON-1 | Batch1 GitHub/Slack/Feishu/Lark/Sentry | **contract** + GitHub/connector offline credential fail-closed / live未验 |
| CON-2 | Batch2 Linear/Jira/Notion/Vercel-list | **contract** / live未验 |
| CON-3 | Batch3 Supabase/PostHog | **implemented_contract**（loopback 适配器+`settlePendingConnectorOp`；write_rows high-risk 密封；live 未接）。**本阶段交验边界 = LocalApi + IPC 离线队列 API**（非 ProjectOSApi 桌面自动 settle/UI 自动 recover；不以 mock 冒充桌面完整产品） |

### 4.4 连续脚本（与前轮手工+AI 同回归）

1. Prompt 生成 Issue→计划→编码→测试→PR 草稿流程。  
2. 手工仅把适用节点 retry 改 2。  
3. Prompt 只改一个 node timeout。  
4. 再插人工审批。  
证明：未目标 ID/边/参数保留；Accept/Dismiss/Undo；陈旧拒绝；缺参追问；未知 connector/无效字段拒绝；缺凭证不误示可运行；保存重开；失败取消恢复。  
材料脚本：文字+图+API+表+URL+源码引用逐批；缺项/解析失败预检；工作区 Diff/Test/Preview。

**证据要求**：真实 DOM 截图 + 状态标注；contract/mock 不得标 live。

---

## 5. 安全（材料与 URL）

1. 文件与 URL **均为不可信参考**；内嵌指令不授予额外行动权限。  
2. URL 读取使用目标鉴权；防 SSRF / 重定向绕过；**默认拒绝**内网与 localhost 端点。  
3. 不读取任意 secrets，不外发。  
4. 实现可用 loopback + DI 测策略；**生产 URL 策略不放宽**。  
5. 无账号 OAuth 注册连接、付费/live 模型、常驻部署、生产写/merge 权限（本 Auto 流）。

---

## 6. 非目标（本文件明确）

| 非目标 | 说明 |
|--------|------|
| 另起第二套 workflow 引擎 | 复用 Spec/Instance |
| 通用 iPaaS / 材料自动改定义 | Authoring ≠ Task pack |
| 承诺离线全天事件接收 | LocalApi/IPC 队列已实现；**live 全天 / 自动 UI** 未承诺 |
| Terran Mac / 真实外发 / 付费 live 冒充 | 外部缺口如实报 |

---

## 7. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-11-10 | 初版：增量 A/B 全范围、阶段依赖、契约、验收矩阵；与 Studio/GC/Six-Goals/bugs 互链 |
| 2026-11-10 | S2→**contract 初版**（非全勾）；PW-2/3、TM-1/3/5 状态对齐实现；材料 UI/E2E 仍待验 |
| 2026-11-10 | PW-4/5/6 + TM-2/3/4：fail→fix→green local deterministic E2E；格式显式支持/不支持矩阵；UI≠server 拒绝分层 |
| 2026-11-10 | PW-1/TM-7 产品入口 taskPack；parseLevel 精确分层；image vision 预检+Pure 预览；Diff/exit UI；GitHub/Gmail offline credential gate；gate-attribution vs bec3dd7 + graph tip |
| 2026-11-10 | TM image→ModelGateway.images；CSV/XLSX structured_selection；PDF 分期；URL 生产 fetch；PW-7 contract；connector recover/dedup；gate-deep 归一化诊断 |
| 2026-11-10 | 首批格式可用阶段；URL DNS-pin/login_wall；image magic；Electron ingest→ModelGateway offline contract；PW-7 UI；TM-8；Gmail poll dedupe；ATTRIBUTION 诚实修正（newVsBec/newVsGraph） |
