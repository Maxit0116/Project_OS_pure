# Agent Harness：对标 Cursor / Devin / Codex 的差距与开发计划

**状态**：Draft（后续开发以此为准）  
**范围**：Project OS 的 **Agent Harness**（会话生命周期、模式、指令、工具策略、编排循环、验证与可逆性），以及与 **Debug Harness Record** 的边界  
**权威交叉引用**：
- `agent-requirements.md` — 图作用域 agent、leaf-only write、诚实 pipeline（D1–D3 / E / F / S0–S6）
- `docs/features/Chat-Modes-Cursor-Parity-Dev-Plan.md` — Mode / Ask 探索 / Plan / Stop 产品面
- `projectos/contracts/harness.ts` — Debug 根因档案（**不是**本文件的主体）
- Cursor：[Understanding agent harnesses](https://cursor.com/blog/agent-best-practices)、[Run Modes](https://cursor.com/docs/agent/security/run-modes)
- Codex：[Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform)、[Unlocking the Codex harness](https://openai.com/index/unlocking-the-codex-harness/)、[sandbox.md](https://github.com/openai/codex/blob/main/docs/sandbox.md)
- Devin：[Local Agent](https://docs.devin.ai/desktop/devin-local)、[Enterprise deployment](https://docs.devin.ai/enterprise/deployment/overview)

**明确不复制**：
- 不引入「模型可自行扩大写权限」的 Cursor 式开放 Agent
- 不默认 YOLO / Run Everything / `--dangerously-bypass-approvals-and-sandbox`
- 不放弃图 scope / leaf-only write / 服务器授权（`agent-requirements` Part 5）
- 不把 Debug `HarnessRecord` 当成整个 agent harness
- 不在本计划复活假 retrieve / inspect / verify（theater）

**对标目标一句话**：用户在会话、模式、计划、工具策略、可观察执行与可逆性上感到「像 Cursor / Codex 一样可靠」；在写权限与拓扑上仍是 **图授权 + 诚实编排 pipeline** 的 Project OS。

---

## 0. 术语：两种「Harness」

| 术语 | 含义 | 代码 / 落盘锚点 |
|------|------|-----------------|
| **Agent Harness**（本文主体） | 包在模型外的运行时：Instructions + Tools + Model + Orchestrator + Policy + Session | `agent-orchestrator/`、`model-gateway/`、`agent-tools/`、events、apply/verify、modes |
| **Debug Harness Record**（附属产物） | 错误 → 假设 → 根因 → 修复 → verification 的调试档案 | `contracts/harness.ts`、`.projectos/harness/*.json`、Debug Harness UI |

业界（Cursor / Codex / Devin）说的 harness = 上表第一行。  
Debug Record = Cursor Debug Mode 流程的 **持久化证据**；应作为 harness 上的一种 **workflow 产物**，不是 harness 本身。

---

## 1. 大厂标准：Agent Harness 共性骨架

三家公开信息收敛到同一套分层（实现细节不同，骨架同构）：

```text
┌──────────────────────────────────────────────────────────┐
│  Session / Thread 生命周期 + 事件流持久化 + 可重连 UI       │
├──────────────────────────────────────────────────────────┤
│  Mode（Ask / Plan / Agent / Debug / Custom…）              │
├──────────────────────────────────────────────────────────┤
│  Instructions（system + rules 常驻 + skills 按需）         │
├──────────────────────────────────────────────────────────┤
│  Tool registry + 统一 Policy 入口                          │
│    sandbox（能做什么） × approval（何时问人）               │
│    Deny / Ask / Allow（Devin）或 Auto-review（Cursor）     │
├──────────────────────────────────────────────────────────┤
│  Orchestrator loop（模型选工具）或固定 pipeline（服务器编排）│
├──────────────────────────────────────────────────────────┤
│  Verify / Stop / Checkpoint / Undo / 并行隔离（worktree）  │
└──────────────────────────────────────────────────────────┘
```

### 1.1 Cursor（产品完整度最高的参考）

公开定义（2026-01）：harness = **Instructions + Tools + Model**，按模型调参。

| 层 | 要点 |
|----|------|
| 编排 | Model 发 tool_calls → 执行 → 回填上下文 → 循环 |
| 模式 | Ask / Agent / Plan / Debug / Custom Modes |
| 策略 | Run Modes：Auto-review / Allowlist / Run Everything + OS sandbox |
| 扩展 | Rules（常驻）、Skills（按需）、Hooks、MCP |
| 长任务 | Plan 先对齐；long-running 多 agent 互检 |
| 隔离 | 本地 sandbox、git worktree、cloud VM |
| 调参 | **同一 harness 按模型换 prompt / 工具偏好** |

**对我们最有用**：Mode 心智、Plan 可编辑、Stop / Checkpoint、Skills/Rules、Debug 假设驱动流程、诚实可观察执行。

### 1.2 Codex（工程结构最清晰、可照搬分层）

| 层 | 要点 |
|----|------|
| Core | Thread / turn / context / tools / stream / persist |
| Tool orchestrator | `approval → select sandbox → attempt → denial 时 escalate 重试`（缓存批准） |
| 双轴策略 | `sandbox_mode` × `approval_policy` |
| App Server | JSON-RPC 双向；服务端可 pause 等 approval；客户端只画 UI |
| 扩展 | MCP、skills，同一套 policy |

**对我们最有用**：统一 ToolPolicy 门、sandbox×approval 双轴、会话协议与事件流、服务端权威。

### 1.3 Devin（执行环境与权限规则最完整）

| 层 | 要点 |
|----|------|
| 架构 | Brain（云推理）+ Devbox（shell / editor / browser） |
| Local harness | Normal / Plan / Ask；Deny/Ask/Allow；subagents；worktrees；持久 Markdown plan |
| Memory | Git 管的 Memory Drive；与 Skills 分离 |
| Outposts | 推理在云、工具在自有机器 |

**对我们最有用**：权限规则表、Plan 落盘、worktree 隔离、subagent「父会话 + 独立链」形态（映射为我们的图上委托，而非开放 spawn）。

### 1.4 三家差异（决定我们抄什么）

| 维度 | Cursor | Codex | Devin | Project OS 选择 |
|------|--------|-------|-------|-----------------|
| 谁选工具 | 模型 tool loop | 模型 tool loop | 模型 + Devbox | **先服务器 pipeline（Route ①）**；开放 loop DEFERRED |
| 写权限 | 工作区宽写 | workspace-write + 批准 | permissions 规则 | **leaf + 服务器授权** |
| 默认安全网 | 人批准 / classifier | sandbox×approval | Deny/Ask/Allow | **agent validate + undo**（非 coder） |
| 拓扑 | 对话 / subagent | thread | Devbox 会话 | **功能地图 = 委托拓扑** |

---

## 2. Project OS 现状（证据级）

### 2.1 已有、接近 harness 内核的部分

| 能力 | 现状 | 锚点 |
|------|------|------|
| 图作用域上下文 | `LocalContextBundle` + `allowedReadPaths` / `allowedWritePaths` | `contracts/local-context.ts`、`local-context-assembler.ts` |
| 写授权 | 服务器强制单文件 leaf；generate 与 apply 双检 | `agent-requirements` Part 1 / Part 5 |
| Modes | Ask / Change(Agent) / Plan / Debug / Anchored | Chat Modes 计划；M0 已落地命名与隔离 |
| Orchestrator | 大流水线：refine → generate → apply → verify；委托/greenfield 分支 | `services/agent-orchestrator/index.ts` |
| 事件流 | `AgentRunEvent` / Agent Flow UI | `contracts/events.ts`、AgentFlowPanel |
| 事务与 undo | 可恢复 apply、backup、PendingChanges undo | apply 路径、post-apply trust |
| Verify | 配置命令 + approval_required | verification-command-approval |
| Model gateway | 含 MCP tool loop（有 maxToolCalls / 时长上限） | `model-gateway/gateway.ts` |
| 原始工具表 | `readFile` / `listFiles` / `getContext`（未成统一 policy 门） | `services/agent-tools/index.ts` |
| Debug Record | 假设 / 根因 / proposedFix / verification | `contracts/harness.ts` |
| Loop 权限草稿 | `LoopSpec.permissions` | `contracts/loop-graph.ts` |
| Stop | `cancelAgentRun` + UI Stop（M0） | Chat Modes M0.3 |

### 2.2 明显缺口（相对大厂 harness）

| ID | 缺口 | 说明 |
|----|------|------|
| H1 | **无显式 Harness 模块边界** | 能力散落在 orchestrator / gateway / tools / chat；无「统一入口」文档化契约 |
| H2 | **无统一 ToolPolicy** | 写路径靠 context ACL；shell/MCP/fetch 无 Codex 式 `approval→sandbox→retry` |
| H3 | **诚实 pipeline 未完成** | theater 问题；D1–D3 仍是 NEXT/PLANNED |
| H4 | **Ask/Plan 缺有限检索** | 预装 bundle，非按需探索（Chat Modes A1） |
| H5 | **Route ② tool loop DEFERRED** | 与 Cursor/Codex 默认体验差距大；短期用 pipeline + 有限检索弥合 |
| H6 | **会话协议偏薄** | 有 run 事件；缺 Codex 级 thread fork/resume/archive 与双向 pause-for-approval 协议抽象 |
| H7 | **Instructions 分层未产品化** | mode skills 有雏形；缺 Rules 常驻 / Skills 按需 / 按模型调参策略 |
| H8 | **无 OS 级 shell sandbox** | Electron / pty 相关硬化仍弱；无 workspace-write 网络闸 |
| H9 | **无 worktree / 并行 agent 隔离** | 委托存在，但非 worktree 级文件系统隔离 |
| H10 | **Checkpoint 非对话一等公民** | 有 apply backup；缺消息级 Restore（Chat Modes C4） |
| H11 | **Debug Record ↔ Map 绑定弱** | 档案有；模型驱动假设/插桩/对话化未齐（Dbg1–4） |
| H12 | **按模型调 harness 未体系化** | 有 model profile；缺「每模型 instructions+tools 变体」的 eval/配置位 |

### 2.3 与 Chat Modes / agent-requirements 的分工

| 文档 | 负责 |
|------|------|
| **本文（Harness）** | 运行时骨架、ToolPolicy、pipeline 诚实性、会话协议、sandbox/approval、扩展点、与大厂差距的总地图 |
| **Chat-Modes** | Mode UX、Ask 探索、Plan 编辑/落盘、Stop、Custom Modes、用户可感知 parity |
| **agent-requirements** | leaf pipeline D1–D3、E/F 委托、S0–S6 图文件事务、不变量 |

**规则**：Chat Modes 的 M1–M3 与 D1–D3 / E/F **不平行造轮**；本文只定义 harness 层切片与依赖顺序，执行切片时优先引用已有 ID（D1、A1…），不另起同义 Gap。

---

## 3. 目标形态：Project OS Agent Harness

### 3.1 一句话架构

> **Codex 级的会话 / 工具 / 策略外壳**  
> \+ **Cursor 级的 Mode / Plan / Skills 产品面**  
> \+ **自研「图授权 + 诚实编排 pipeline + 可逆事务」内核**  
> \+ **Debug Record 作为 Debug Mode 的证据落盘**。

### 3.2 逻辑模块（建议落地边界，可渐进抽取）

```text
projectos/
  harness/                    # 可选新包名；初期可为「逻辑边界」，代码仍可住现有目录
    session/                  # Thread 生命周期、重连、Stop、pause-for-approval
    instructions/             # system + rules + skills 装配（按 mode / 模型）
    tools/
      registry.ts             # 工具目录：read / grep / edit / shell / mcp / verify…
      policy.ts               # Deny|Ask|Allow + sandbox 能力位 + 图 ACL
      orchestrator.ts         # approval → sandbox → execute → escalate
    pipeline/                 # Route ①：locate → generate → validate → apply → verify
    modes/                    # 与 ChatMode 绑定的能力声明（read-only / can-edit）
    verify/                   # 已有 verification 的 harness 视角封装
    debug-record/             # 写 HarnessRecord；不拥有 Debug UI
```

短期允许 **逻辑边界先于物理拆包**：在 `agent-orchestrator` 旁增加 `tool-policy` / `harness-session` 模块，避免大爆炸搬迁。

### 3.3 双路径编排（已锁定）

| 路径 | 状态 | 说明 |
|------|------|------|
| **Route ① — Orchestrated visible pipeline** | **主路径 / NEXT** | 服务器定义阶段；工具是真实编排操作；任意模型可跑 |
| **有限检索中间态** | M1 / D2 附近 | `needsMoreContext` 或 Ask N 轮 grep/read，仅限 `allowedReadPaths` / 只读索引 |
| **Route ② — Model-directed tool loop** | **DEFERRED** | Cursor/Codex 默认；需稳定 function-calling + 终止/预算/恢复策略 |

### 3.4 策略双轴（直接改编 Codex）

| 轴 | 候选值 | 映射到现有/计划 |
|----|--------|-----------------|
| **Capability（sandbox）** | `read_only` / `scoped_write` / `shell_sandboxed` / `network` | `allowedRead/WritePaths`；未来 shell 沙箱 |
| **Approval** | `automatic` / `on_request` / `review_first` / `never`（仅 CI） | `ChangeExecutionPolicy`；verify command approval |

**默认（非 coder）**：`scoped_write` + `automatic` apply，安全网 = **独立 validator + 服务器再校验 + undo**，不是逐步点批准。  
**程序员高级**：`review_first` + 可选 Ask 规则（对齐 Cursor Allowlist / Codex on-request）。

### 3.5 工具目录（v1 最小集 → 扩展）

| 工具 | Mode 可用性 | Policy |
|------|-------------|--------|
| `grep_workspace` / `read_authorized` | Ask / Plan / locate | 只读 ACL |
| `emit_file_edit_plan` / `generate_diff` | Agent（leaf） | 服务器阶段，非模型随意调用 |
| `apply` / `undo` | 基础设施 | 事务内核 |
| `run_verification` | Agent / Debug | 命令白名单 + approval |
| `debug_*`（hypothesize / instrument / analyze） | Debug | scopeFiles ACL |
| `mcp_*` | 可选、默认 Ask | Deny/Ask/Allow |
| `shell` | **后期** | 强制 sandbox；默认 Ask |

**禁止**：模型直接拿到「任意路径写」或「无策略 shell」。

---

## 4. 原则（开发时必须遵守）

1. **意图对齐大厂，执行守 Project OS 不变量**（见 `agent-requirements` Part 5）。
2. **诚实优于像 Agent**：无假步骤；无合成 thinking。
3. **Server is authority**：plan / validator / diff / MCP 结果皆为不可信数据。
4. **Policy 单一入口**：任何副作用工具（写文件、shell、网络、MCP）必须过 ToolPolicy；禁止旁路。
5. **有限检索 ≠ 开放 tool loop**。
6. **可逆性是默认安全网**：automatic apply 合法，前提是 undo / checkpoint 可靠。
7. **按模型调 instructions/tools** 是 harness 职责，不是每个 feature 私藏 prompt。
8. **与 Chat Modes / D-E-F / S 系列合并切片**，不平行造轮。

---

## 5. 差距优先级总表

| ID | 主题 | 影响 | 主要借鉴 | 依赖 | 建议波次 |
|----|------|------|----------|------|----------|
| H-DOC | 本文 + 模块边界约定 | 高 | — | — | H0 |
| H-POL0 | ToolPolicy 接口 + 现有写路径接入 | 极高 | Codex | — | H0 |
| D1 | 去 theater，诚实 Change 基线 | 极高 | Cursor 诚实性 | — | H1（= agent-req D1） |
| A1/A2 | Ask 有限检索 | 极高 | Cursor Ask | H-POL0 | H1（= Chat Modes M1.A） |
| D2 | locate + phase 事件 | 高 | Cursor Plan 前研究 | D1 | H1–H2 |
| H-SESS0 | Stop / cancel 统一；run 可观察 | 高 | Codex events | M0 已有 | H1 |
| D3 | automatic + validator + verify 诚实 | 极高 | Cursor + 自研 | D2 | H2 |
| P2/P3 | Plan 可编辑 / 落盘 | 高 | Cursor/Devin | — | H2（Chat Modes） |
| H-INSTR0 | Rules 常驻 + Skills 按需装配 | 高 | Cursor | Mode M0 | H2 |
| Dbg* | Debug 模型驱动 + Record 写回 | 中高 | Cursor Debug | A1 | H2–H3 |
| H-POL1 | shell/MCP Deny/Ask/Allow + 事件 | 高 | Devin/Codex | H-POL0 | H3 |
| H-SBOX0 | 本地 shell sandbox（网/FS） | 高 | Cursor/Codex | H-POL1 | H3 |
| C4 | Checkpoint / Restore | 中高 | Cursor | D3 | H3 |
| E/F | 图上委托 = subagent 拓扑 | 极高 | Devin subagent 形态 | D3 | H3–H4 |
| H-MODEL | 按模型调 instructions/tools | 中 | Cursor | H-INSTR0 | H4 |
| H-WT | worktree 并行隔离 | 中 | Cursor/Devin | E | H4+ |
| R2 | Route ② 开放 tool loop | 中（长期） | Cursor/Codex | D3+稳定 FC | **DEFERRED** |
| H-CLOUD | 远程 Devbox / Outpost | 低（远期） | Devin | H-SBOX0 | **DEFERRED** |

---

## 6. 分波次开发计划

### H0 — Harness 边界与 Policy 门（短切片，无用户可见大改）

**目标**：后续所有工具副作用有唯一门禁；文档与代码边界对齐。

**H0 状态**：Implemented（2026-10-19）

#### H0.1 文档与命名

- [x] 落地本文；在 `agent-requirements.md` / Chat-Modes 文首互链「Agent Harness」。
- [x] 代码注释 / 模块 README：区分 **Agent Harness** vs **Debug Harness Record**（`services/harness/README.md`）。
- [x] 约定：新工具不得直接在 orchestrator 内 `spawn` 旁路；必须注册到 registry。

#### H0.2 ToolPolicy v0（只包现有写路径）

- [x] 引入最小契约（`contracts/tool-policy.ts`）：
  - `HarnessToolName`、`ToolCallRequest`、`PolicyDecision = allow | ask | deny`
  - `CapabilityContext`：mode、`allowedReadPaths`、`allowedWritePaths`、executionPolicy、`writeCapability`
- [x] `evaluateToolCall(req, ctx) → decision`：今日仅实现
  - 读：路径 ∈ allowedRead（或 `list_files` 只读索引）
  - 写/apply：路径 ∈ allowedWrite 且 leaf 规则
  - 未知工具 → deny；shell/mcp/fetch/grep → deny until later waves
- [x] apply / generateDiff 授权检查改为 **调用 Policy**（`assertDiffPathsAllowedByPolicy` → 仍映射 `diff_scope_violation`；identity 再校验保留）。
- [x] `agent-tools.runAgentTool` 强制传入 CapabilityContext 并过 Policy。
- [x] 单元测试：`services/harness/tool-policy.test.ts`。

#### H0.3 Tool registry 清单

- [x] 文档化当前真实工具：[`Agent-Harness-Tool-Registry.md`](./Agent-Harness-Tool-Registry.md)。
- [x] 标记每项：`implemented | planned | deferred`。

**验收**：Policy 测试绿；写路径仍只过服务器授权；无行为回归。

**不在本波**：新 shell、开放 loop、UI 大改。

---

### H1 — 诚实内核 + 只读探索（与 D1 / Chat Modes M1 对齐）

**目标**：harness 对外「可信」——步骤真、Ask 能查、可停。

**H1 状态（A/B/C）**：Implemented（2026-10-19）。H1.D Plan 可编辑仍挂 Chat Modes M1.B。

#### H1.A 诚实 Change pipeline（= D1；live 已含 D2/D3 核心）

- [x] 执行 `agent-requirements` **D1**（live `runLiveModelChangePipeline`）。
- [x] Agent Flow：真实阶段 `context_prepared → locate_plan → generate_proposal → validate_proposal`（± automatic apply/verify）；`review_first` 下 verify 为诚实 `not_run`。
- [x] `stepSequence` 不再驱动内建 live Change（§3.6；单测覆盖）。Fixture/scenario 流保留原样。

#### H1.B Ask 有限检索（= Chat Modes M1.A / A1–A2）

- [x] 只读工具走 H0 Policy（`read_file` + `allowedReadPaths ∩ fileIndex`）。
- [x] maxRounds → `maxReads`；`explorationTrace` 诚实展示（ChatPanel）。
- [x] **禁止** write / shell。

#### H1.C Session 最小能力

- [x] Stop / `cancelAgentRun`（M0.3）覆盖 Change / Debug fix runs。
- [x] 取消态经 orchestrator abort；UI Stop CTA 已接。

#### H1.D Plan 可编辑（= Chat Modes M1.B，可并行）

- [x] Chat Modes M1.B 已落地（不阻塞 H1.A/B）。

**验收**：无 theater（live）；Ask「XX 在哪」可查并展示查阅列表；运行中可停。

---

### H2 — 可自动、可验证、可配置指令（D2–D3 + Instructions + Plan/Debug）

**目标**：leaf harness 达到「非 coder 默认可自动改 + 可 undo + 真 verify」；指令层像 Cursor。

**H2 状态**：Implemented（2026-10-19）

#### H2.A locate + 可观察阶段（= D2）

- [x] 真实 locate → `FileEditPlan` → generate（live pipeline）。
- [x] `phaseId` 挂到 action events。
- [x] Provider reasoning 经 transient 通道。

#### H2.B automatic + validator（= D3）

- [x] `automatic | review_first`。
- [x] 独立 validator（零写权限，fail-closed）。
- [x] 服务器再校验后 apply；配置 verify；失败不自动 undo。
- [x] Undo 一等入口（PendingChanges / backup）。

#### H2.C Instructions 装配（H-INSTR0）

- [x] **Rules**：`.projectos/rules/` 递归 markdown（`loadProjectRulesMarkdown`）。
- [x] **Skills**：按需经 composer / Custom Mode → supplemental（既有）；装配 API 支持 `skillBodies`。
- [x] 装配点：`buildHarnessInstructions`；Ask 注入 `instructionAppendix`；Change/Debug 在 `createRun` 富化 `agentProfile.systemPrompt`。
- [x] 单测：`services/harness/instructions.test.ts`。

#### H2.D Plan / Debug 产品化（跟 Chat Modes M2）

- [x] Plan Save / Suggest / Rebuild（Chat Modes M2.A）。
- [x] Debug 模型假设 / 日志 / 插桩（M2.B）。
- [x] Custom Modes（M2.C）。

**验收**：automatic leaf 可 undo；Rules 进 system；Skills 按需；Plan/Debug 产品面已齐。

---

### H3 — 策略外延 + Checkpoint + 图上 Subagent 形态（E 起步）

**目标**：副作用工具有 Devin/Codex 级规则；对话可 Restore；节点级委托可用。

#### H3.A ToolPolicy v1（H-POL1）

- [x] 规则表：Deny > Ask > Allow（`ToolPermissionDocument` + `resolvePermissionRules`）。
- [x] 项目级配置：`.projectos/permissions.json`，设置 → Agent harness 可编辑（同时含 sandbox / model-harness）。
- [x] `ModelGateway.completeWithTools` 在 `executeTool` 前过 Policy；deny/ask 不执行，回写错误内容给模型。
- [x] Agent Flow：`tool_policy_decision` / `mcp_tool_call` 契约 + UI 元数据 / i18n / coarseFlow；gateway `onPolicyDecision` 回调。

**H3.A 状态**：Implemented（2026-10-19）。验证被 Policy 拒绝时 `recordToolPolicyDecision` 写入 run 事件。MCP `completeWithTools` 的 `onPolicyDecision` 在生产调用方接入时同样走该记录方法；缺省会从 `workspaceRoot` 加载 `permissions.json`。

#### H3.B Shell sandbox v0（H-SBOX0）

- [x] 本地命令软沙箱：默认无网（`sandbox.json`）、保护 `.git/*` / 敏感 `.projectos` 路径；`shell: false` argv spawn。
- [x] sandbox `deny` / `ask` → 不执行；`ask` 仅在显式 `approvalResolved`（如 verification 命令集已批准）后 soft-run；**从不**静默全权。
- [x] 无 OS Seatbelt/Landlock：`softOnly: true`；未知二进制 → `ask`（诚实降级）。
- [x] 统一入口：`runHarnessShell`（ToolPolicy → classify → soft spawn）；`VerificationRunner` 以 `run_verification` 接入，并加载 `.projectos/permissions.json`。

**H3.B 状态**：Implemented soft-sandbox v0（2026-10-19）。OS 级隔离列为后续增强。

#### H3.C Checkpoint / Restore（= Chat Modes C4）

- [x] 成功 apply 写 conversation checkpoint（手动 apply 与 automatic `apply_result` 共用同一 backup，避免重复）。
- [x] Restore 只回滚文件，不删消息。

#### H3.D Node→file 委托（= E）

- [x] 非叶 plan-only；leaf child runs；batch validation；原子事务组（现有 E 管线 + Chat Modes M3.B）。
- [x] UI：父/子 run 事件流（既有 Agent Flow 委托可视化可继续抛光）。

**H3 状态**：Complete（A + Flow events / B soft / C / D）。OS Seatbelt 列为后续增强。

**验收**：MCP/shell 无旁路；Checkpoint/E 已齐；软沙箱对未知/网络命令要求批准；policy 事件可在 Agent Flow 展示。

---

### H4 — 向上委托、按模型调参、并行隔离

#### H4.A Global / 容器委托（= F）

- [x] `AgentRun` 层级字段：scope / parentRunId / rootRunId / role（既有 E/F 契约）。
- [x] Global Agent 入口（Chat Modes M3.B + 现有委派管线）。

#### H4.B Per-model harness variants（H-MODEL）

- [x] 配置：`.projectos/model-harness.json` → `{ match, systemDelta, preferGrepVsSearch? }`。
- [x] 装配：Ask / Change `createRun` 经 `modelHarnessSystemDelta` → `buildHarnessInstructions.modelDelta`。
- [x] 内部 eval 清单：`docs/features/Agent-Harness-Eval-Checklist.md`（人工抽检；CI 脚本非阻塞）。

**H4.B 状态**：Config + wiring Implemented（2026-10-19）

#### H4.C Worktree 并行（H-WT，可选）

- [x] 长任务 / 多方案：git worktree 隔离（`.projectos/agent-worktrees/` + manifest）。
- [x] 合并需用户确认：`mergeAgentWorktree({ confirm: true })`；无 confirm 拒绝。
- [x] API：`list/create/merge/remove/getDiff` 经 local-api + IPC。
- [x] 与图授权不冲突：worktree checkout 作为独立 root 时仍走 leaf ACL（隔离 ≠ 扩写 scope）。

**H4.C 状态**：Implemented service + API + Settings UI（2026-10-19）。设置 → Agent harness：列表、diff 预览、二次确认合并、移除检出。

**验收**：Global 委托已可用；模型差异化 instructions 可经 `model-harness.json` 配置；worktree create/merge-gate/remove 可用。

---

### DEFERRED（明确不做的波次）

| 项 | 原因 |
|----|------|
| Route ② 全开放 tool loop | 需稳定 FC + 终止/预算/注入防护；本地模型现状不足 |
| Cloud Devbox / Outposts | 产品阶段过早；先本地 sandbox |
| Run Everything 默认 | 违反非 coder 安全模型 |
| 模型自扩写 scope | 破坏 Part 5 |
| 完整 Memory Drive | 见 [`Agent-Memory-Dev-Plan.md`](Agent-Memory-Dev-Plan.md)。学习笔记按 MEM-0 起做；Phase G 常驻 agent 仍不做 |
| 共享检索 / RAG | 见 [`RAG-Dev-Plan.md`](RAG-Dev-Plan.md)。Part 7 约束不变；精确搜索可先于向量库 |
| Browser 全家桶 subagent | 非 MVP 差异化焦点 |

---

## 7. 依赖图

```text
H0  ToolPolicy v0 + 边界
 │
 ├──────────────────┬────────────────────┐
 ▼                  ▼                    ▼
H1.A D1 诚实      H1.B Ask 检索        H1.C Session/Stop
 │                  │
 │                  └──────────► Chat Modes M2 Plan/Debug
 ▼
H2.A D2 locate ──► H2.B D3 automatic+validator
 │                      │
 │                      ├─► H2.C Instructions
 │                      └─► H2.D Plan/Debug Record
 ▼
H3.A Policy v1 ─► H3.B Sandbox ─► H3.C Checkpoint
 │
 └─► H3.D E (node→file)
          │
          └─► H4.A F (upward) ─► H4.B per-model ─► H4.C worktree
                                      │
                                      X  Route ② / Cloud  (DEFERRED)
```

与 Chat Modes：

```text
Chat M0 (done) ──► Harness H1 共用 Stop/Mode
Chat M1.A Ask ──► 必须 H0 Policy
Chat M2 Plan/Debug ──► H2
Chat M3 Checkpoint/E ──► H3
```

---

## 8. 契约与落盘（预期增量）

| 区域 | 预期 |
|------|------|
| `contracts/tool-policy.ts` | PolicyDecision、规则、CapabilityContext |
| `contracts/events.ts` | phaseId；tool_policy_denied；sandbox_escalation；已有事件不破坏 |
| `contracts/agent-run.ts` | 层级委托字段（E/F） |
| `.projectos/rules/` 或等价 | 常驻 Rules |
| `.projectos/plans/*.md` | Plan 落盘（Chat Modes P3） |
| `.projectos/harness/*.json` | Debug Record（保持；增强写入路径） |
| Settings | executionPolicy、chatModeSwitch（已有）、未来 permissions profile |

**兼容**：fixture / demo scenario / external agent 事件流按 D1 要求 **原样保留**；仅内建 live Change 改诚实 pipeline。

---

## 9. 测试与验收门禁

每波次合并前至少：

1. **不变量测试**：Ask 永不写；leaf 越权 deny；validator 不能 commit。
2. **诚实性测试**：Agent Flow 步骤与真实调用一一对应（禁 theater 回归）。
3. **Policy 测试**：未知工具 deny；Ask 模式 shell/write deny。
4. **可逆性测试**：automatic apply → undo 字节级恢复（已有则扩覆盖）。
5. **取消测试**：running 中 Stop → terminal cancelled，无半套假完成。

建议增加「Harness 对照清单」手工验收（发布前勾选）：

- [ ] 像 Cursor：Mode / Plan / Stop / 可观察步骤  
- [ ] 像 Codex：副作用必经 Policy；approval 可 pause  
- [ ] 像 Devin：权限规则可读；计划可落盘  
- [ ] 仍是 Project OS：图 scope、leaf write、undo、Map 可追踪 Debug Record  

---

## 10. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 大拆包阻断交付 | H0–H2 逻辑边界优先，物理搬迁可后置 |
| 过早做 Route ② | 用 A1 有限检索 + D2 locate 吃掉 80% 体感 |
| Policy 与旧授权双轨漂移 | apply/generate 只保留 Policy 一条路径 |
| Sandbox 平台差异 | 无能力则 Ask，不假装安全 |
| Prompt 散落导致「按模型调参」失败 | H2.C 强制单一装配点 |
| Theater 回潮 | D1 回归测试 + Code review 检查表 |

---

## 11. 建议执行顺序（给排期）

| 顺序 | 切片 | 预估体量 | 产出 |
|------|------|----------|------|
| 1 | H0 | S | Policy 门 + 文档互链 |
| 2 | H1.A = D1 | M | 诚实 Change |
| 3 | H1.B = M1.A | M | Ask 检索 |
| 4 | H2.A/B = D2/D3 | L | 自动 leaf + validator |
| 5 | H2.C + Chat M2 | M | Instructions + Plan/Debug |
| 6 | H3.A/B | L | MCP/shell 策略 + sandbox |
| 7 | H3.C + E | L | Checkpoint + 节点委托 |
| 8 | H4 / DEFERRED | — | 按产品优先级再开 |

---

## 12. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-10-19 | 初稿：基于 Cursor/Devin/Codex 公开 harness 与仓库现状差距讨论落地 |
| 2026-10-19 | **H0 Implemented**：`contracts/tool-policy.ts`、`services/harness/`、写路径经 Policy、工具清单 |
| 2026-10-19 | **H1.A/B/C Implemented**：诚实 live Change（D1–D3 核心）、Ask 探索经 Policy/ACL、Stop |
| 2026-10-19 | **H2 Implemented** + **H3.A core**：`buildHarnessInstructions` / `.projectos/rules`、permissions.json Deny>Ask>Allow、MCP gateway 门控 |
| 2026-10-19 | **H3.B soft sandbox**：`classifyShellInvocation` / `runHarnessShell` / `.projectos/sandbox.json`；VerificationRunner 接入 |
| 2026-10-19 | **H4.A/B**：确认委托字段；`.projectos/model-harness.json` 按模型 systemDelta |
| 2026-10-19 | **H3.A polish + H4.C**：`tool_policy_decision` Agent Flow；worktree API；Eval Checklist |

---

## 附录 A — 快速借鉴清单（实施时查阅）

### 可直接搬

- Instructions + Tools + Model 三分法；按模型调参  
- Mode 心智与切换  
- Plan：研究 → 可编辑 → 批准 → Build  
- Sandbox × Approval 双轴  
- Tool orchestrator：`policy → execute → event → 回填`  
- 双向控制：Stop；服务端 pause-for-approval  
- Rules / Skills / Hooks / MCP 边界  
- Debug：假设 → 插桩 → 复现 → 证据 → 定点修  
- Verify 作为可迭代目标  
- 事件驱动 UI  

### 改编后搬

- Tool loop → **固定诚实 pipeline** + 有限检索  
- 宽写权限 → **leaf + 服务器授权 + 原子事务**  
- 人肉逐步批准 → **validator + undo**（非 coder）  
- Subagent → **图上 plan/delegate child runs**  
- Debug 流程 → 产物落 **HarnessRecord + Map**  

### 禁止照搬

- Run Everything / YOLO 默认  
- 模型自扩写 scope  
- 虚构步骤  
- 用 Debug Record 冒充整个 harness  
- 一上来全量 Route ②  

## 附录 B — 与「Debug Harness」UI 的关系

- Debug Mode 的 **运行时** 属于 Agent Harness（阶段、工具、Policy）。  
- Debug Harness **面板 / Record** 属于证据与历史 UX。  
- 开发时：不要在 `DebugHarnessPanel` 里实现通用 tool loop；通用能力进 harness，Debug 只消费。  
