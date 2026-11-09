# Loops Graph · Gaps Closure DevPlan

**状态**：Implementing（2026-11-10）。本文件是对照成熟 Human-in-the-Loop Workflow 参考图后的**缺口补全总控计划**；授权按 Phase GC-* 切片实现。GC-0–GC-3、GC-4、GC-5、GC-6.1/6.2/6.3/6.4、GC-7.1 主体已落地；GC-6.5/6.6 与 GC-7.2 总勾选待收尾（见 §13）。  
**范围**：补齐 Sequence / Parallel / Branch / Loop / Gate / Recovery 六机制，以及成熟 Workflow System 必备的可靠性、可观测性、触发与治理能力；复用现有 Agent Runtime / Harness / Verification，**不**另起编排引擎，**不**做成通用 iPaaS。  
**产品定位一句话**：把已有「可编译、可批准、可步进」的 Loop Graph，升级为参考图级的工程工作流系统——控制流完备、失败可恢复、运行可看见、人可介入。

**与已有计划的关系**：

| 文档 | 关系 |
|------|------|
| [`Loops-Graph-Workflow-Studio-Dev-Plan.md`](./Loops-Graph-Workflow-Studio-Dev-Plan.md) | **并行权威**：Studio 壳、真 pause/cancel、Fresh·Stale、重规划、触发。本文件 **接管并重新编排** 其中与六机制/可观测性相关的缺口优先级；LG-* Task 被本文件 GC-* 映射吸收时，以本文件验收为准。 |
| [`Loops-Graph-Node-Architecture-Dev-Plan.md`](./Loops-Graph-Node-Architecture-Dev-Plan.md) | **并行权威**：四类 Node / Condition / 有限 Loop / Human 模式。本文件 **解锁** 原「Parallel 调度延后」为受控 MVP（见 GC-D3），并补 Logic `retry`/`wait` 运行时。 |
| [`Loops-Graph-UI-Visual-Authoring-Dev-Plan.md`](./Loops-Graph-UI-Visual-Authoring-Dev-Plan.md) | Draw 识读合同；本文件扩展 Run 态投影与控制流容器可视化。 |
| [`Loops-Graph-Review-Visual-Dev-Plan.md`](./Loops-Graph-Review-Visual-Dev-Plan.md) | Review 审批台已落地 MVP；本文件要求 Path Map 支持 Parallel/Branch/Loop 容器识读，不重做审批壳。 |
| [`Loops-Graph-Agent-Wiring-Dev-Plan.md`](./Loops-Graph-Agent-Wiring-Dev-Plan.md) | 配置卫星；本文件不改 wiring 语义。 |
| [`backend/Planning-Orchestration-Dev-Plan.md`](./backend/Planning-Orchestration-Dev-Plan.md) | P-0–P-3 底座不变。 |
| [`Agent-Harness-Dev-Plan.md`](./Agent-Harness-Dev-Plan.md) | Pause/Cancel/Resume 必须打到 harness。 |
| [`Agent-Flow-Activity-Dev-Plan.md`](./Agent-Flow-Activity-Dev-Plan.md) | 节点内轨迹仍归 Agent Flow；Loops 只投影任务单元状态与产物引用。 |

---

## 1. Executive Summary

### 1.1 调研结论（2026-11-09）

| 机制 | 现状 | 判定 |
|------|------|------|
| **Sequence** | `depends` 单链 + cursor 步进 | **已扎实** |
| **Parallel** | Merge 节点存在，但 depends 禁止 fan-out；单 `activeRun` | **基本不支持** |
| **Branch** | `condition` + `conditional` 边可跑；仅绑 TestReport/证据 | **部分支持** |
| **Loop** | 至多 1 条 `feedback` + `logic.loop` + `maxIterations` | **部分支持** |
| **Gate** | Human 节点 + HITL + Review Path Map / Gate Checklist | **已扎实（MVP）** |
| **Recovery** | `retryPolicy` / feedback / stop HITL；pause 未下传；无 cancel Loop；`retry`/`wait` logic 未实现 | **部分支持** |

成熟参考图还要求：执行态色点、Parallel/Loop 虚线容器、Join 语义、决策日志、Artifacts、Run History、Timeout/Interrupt、Error Fallback、State、Versioning、Observability。这些在 Loops 侧大多缺失或拆在 Agent Flow 而未合成。

### 1.2 本计划目标

1. **六机制产品可达**：作者能画出、批准、跑通 Sequence / Parallel(fork-join) / Branch / Loop / Gate / Recovery。  
2. **可靠性闭环**：真 pause/cancel/resume、有限重试、checkpoint、预算记账、非幂等副作用保护。  
3. **运行可见**：Run 画布/面板上每个节点有显式状态色；Parallel/Loop 有分组容器；Human Decision / Artifacts / History 可查。  
4. **可演进触发**：手动 + 参数化 + 内部事件启动统一为 `LoopInstance`。  
5. **保持边界**：不是 n8n；不引入第二 Runtime；不要求 exactly-once 分布式事务。

### 1.3 非目标（仍延期）

| 非目标 | 原因 |
|--------|------|
| 通用 HTTP/DB/SaaS 集成市场 | 产品是 AI 开发闭环 |
| 任意表达式语言 / Code Node | Branch 先扩到「可视化比较 + 有限字段子集」 |
| 自动 worktree 并行隔离 + 冲突自动合并 | Parallel MVP 先同 worktree **串行排空就绪集**，再可选多 Run（见 GC-D3） |
| 多人审批链 / 邮件/IM 超时升级 | Gate 保持单人；Timeout → HITL 即可 |
| 插件市场 / 社区 Node 包 | 内置工程 Node |
| 多层 Sub-workflow 完整产品 | 契约可预留；实现延后 |
| 恰好一次分布式效果 | 本地单用户：安全阻塞 + 幂等键 |

---

## 2. 产品决策（本计划冻结）

继承 Studio D1–D9、Node Architecture NA-D1–D10，并追加：

| ID | 决策 | 落地含义 |
|----|------|----------|
| GC-D1 | **Gaps Closure 总控优先** | 与旧计划冲突时，以本文件 Phase/验收为准；旧文档加「被 GC 吸收」交叉引用 |
| GC-D2 | **机制完备 ≠ 通用 iPaaS** | 六机制必须产品可达；集成面仍限 github/test/terminal + Agent |
| GC-D3 | **Parallel 分两档** | **P0**：拓扑允许 fan-out + Merge wait-all；调度器对就绪兄弟节点 **串行排空**（单 `activeRun`）。**P1**：可选多 `activeRunIds`（仍无自动 worktree） |
| GC-D4 | **Branch 有限语义** | Condition 消费结构化字段（TestReport.status → 后续可扩 artifact 字段比较）；禁止任意 JS 表达式 |
| GC-D5 | **Loop 有限且可多反馈（受预算）** | 放宽「全局至多 1 条 feedback」为「每个 CycleGate 确认 + 全局 `stopPolicy.maxRounds` / 节点 `maxIterations`」；无限环仍禁止 |
| GC-D6 | **Recovery = 策略 + 运行时动作** | `retry` / `replan` / `pause_hitl` / `fallback` 边（可选）必须有 stepper；pause/cancel 必须下传 AgentRun |
| GC-D7 | **状态双轨** | Instance.status + 显式 `nodeRecords[]`；UI 色点只读 nodeRecords |
| GC-D8 | **定义 / 运行 / 产物分离** | Spec 冻结；Instance 可变；Artifact / HumanDecision 只追加 |
| GC-D9 | **可视化三态对齐** | Draw=编辑意图；Review=只读批准；Run=执行投影+控制（pause/cancel/HITL） |
| GC-D10 | **兼容演进** | `normalizeLoopGraphDocument` 必须读旧文档；新字段 optional + 默认值 |

---

## 3. Gap Inventory（完整清单）

### 3.1 六机制 Gaps

| Gap ID | 机制 | 缺口描述 | 目标验收 |
|--------|------|----------|----------|
| G-SEQ | Sequence | 已具备 | 回归：单链仍为默认；Preset 不破 |
| G-PAR | Parallel | 无 fan-out；Merge 无真实多父完成路径 | 可画 A∥B → Merge；批准通过；运行至 Join 后继续 |
| G-BR | Branch | 仅证据状态；无容器识读；条件失败 UX 弱 | Condition 菱形/图标清晰；≥2 `branchKey`；至少 pass/fail 路径 E2E |
| G-LP | Loop | 单 feedback；`logic.loop` 弱；无虚线容器 | 多 feedback（门闩确认）；Loop 容器；达 max → HITL |
| G-GT | Gate | Takeover/多人未做；Decision 日志弱 | Approval/Review/Input 分模式 UI；HumanDecision artifact 可查（Takeover 仍占位） |
| G-RC | Recovery | pause 未下传；无 cancel；retry/wait logic 未实现；无 fallback | 真 pause/cancel/resume；`logic.retry`/`wait`；失败策略可配置且可观测 |

### 3.2 成熟系统附加 Gaps

| Gap ID | 能力 | 现状 | 目标 |
|--------|------|------|------|
| G-ERR | Error Handling & Fallback | 部分 retry/replan | 节点级 failure_policy；可选 fallback 边；耗尽 → HITL/error 明确 |
| G-TO | Timeout & Interrupt | stopPolicy 字段弱用 | 节点/全局 wallClock 检查；超时 → HITL 或 cancel |
| G-ST | State / nodeRecords | cursor+events | 显式 nodeRecords 状态机 |
| G-CP | Checkpoint / Resume | Agent checkpoint 有；Loop 无 | Instance checkpoint；安全 resume |
| G-ID | Idempotency | 无 | 启动幂等键；不明副作用 → Blocked |
| G-FS | Fresh / Stale | Review draft stale 有；运行上下文无 | Context baseline + Fresh/Stale 正交状态 |
| G-RP | Structured Replan | pendingCompile 弱 | ReplanProposal（diff/成本/复用）+ 审批 |
| G-TR | Triggers | 仅手动 start | 参数化 + 内部事件 + 去重 |
| G-OBS | Observability UI | Review Path Map；Run 弱 | Run 色点、容器、Decision/Artifacts/History 面板；可选 minimap |
| G-INT | Integrations | github/test/terminal 部分 | 补齐失败路径与审批门闩一致性（非新集成市场） |
| G-GOV | Versioning & Governance | Spec 版本有 | 权限审计事件；重规划不扩权 |
| G-IT | Iterate 生命周期 | draw/review/run | Run History → 一键派生新 draft（弱 Iterate） |

### 3.3 明确不做（对照参考图时勿误判为本计划失败）

- 通用集成市场 / credentials 商店  
- 自动 worktree 并行与冲突合并  
- 多人审批 / 外部通知升级  
- 任意表达式引擎  
- Subflow 完整产品  
- 把 Agent Flow 工具日志塞进 Loop 节点本体  

---

## 4. 目标架构

```text
┌─ Workbench Loop UI ─────────────────────────────────────────────┐
│ Draw │ Review │ Run                                              │
│ Palette · Canvas(+containers) · Duty · PathMap · RunProjection │
│ HITL · Decisions · Artifacts · History · (Minimap P2)            │
└───────────────┬──────────────────────────┬──────────────────────┘
                │                          │
                ▼                          ▼
┌─ Definition ──────────┐    ┌─ Orchestrator (loop-runtime-*) ────┐
│ IntentGraph           │    │ schedule ready set (seq / fork)    │
│ LoopSpec versions     │───►│ step nodeRecords                    │
│ topology validator    │    │ retry / condition / merge / loop   │
│ presets               │    │ pause/cancel → Agent hooks         │
└───────────────────────┘    │ checkpoint · budget · freshness    │
                             └───────────┬────────────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
             AgentOrchestrator    VerificationEvidence   .projectos/
             + Harness            + Artifacts            loop-graphs/
```

### 4.1 Parallel MVP 调度语义（GC-D3 P0）

```text
Fork: 节点经 depends 扇出到多个子节点 → 子节点同时 Ready
Drain: 调度器每次只启动一个 Ready 子节点的 Agent/Action（单 activeRun）
Join: Merge 等待所有 depends 入边父节点 Succeeded；缺一则 Waiting
```

P1 再允许同一 Instance 多个 `activeRunIds`（仍共享 worktree；写冲突 → Blocked + HITL）。

### 4.2 Branch 语义

```text
Condition 读取上游 Artifact（优先 TestReport.status；可扩展枚举字段）
→ match branchKey（pass/fail/…）
→ 推进匹配边；未匹配 → node_failed + HITL
Fail 支路计入 attemptCounts；超过 maxIterations → stop_policy HITL
```

### 4.3 Recovery 语义

| 策略 | 行为 |
|------|------|
| retry | 同节点再入队（受 maxAutoRetries / maxIterations） |
| replan | `awaiting_hitl` + pending replan 提案 |
| pause_hitl | 立即人工门闩 |
| fallback（新） | 走 `kind: fallback` 边到指定节点；无边则等同 pause_hitl |

---

## 5. 数据模型演进

### 5.1 `LoopInstance` 扩展（兼容 optional）

```text
status: ... | "cancelled" | "blocked"     // 新增
nodeRecords: LoopNodeRecord[]             // 新增
activeRunIds?: string[]                   // P1 Parallel
checkpoint?: LoopInstanceCheckpoint
budgetUsage?: { tokens?, wallClockMs?, retries? }
freshness?: { status: fresh|stale|unknown, baselineId?, checkedAt? }
launch?: { kind: manual|params|event, params?, eventId?, idempotencyKey? }
```

### 5.2 `LoopNodeRecord`

```text
nodeId
status: pending|ready|running|waiting|waiting_approval|blocked|
        verifying|succeeded|failed|skipped|cancelled
updatedAt
agentRunId? / evidenceId? / artifactIds?
errorMessage?
attempt?
freshness?
```

### 5.3 Edge kind 扩展

现有：`depends` | `feedback` | `conditional`（+ Intent `provides`）  
新增：`fallback`（Recovery）

### 5.4 Topology 规则变更

| 规则 | 旧 | 新 |
|------|----|----|
| depends outdegree | ≤1 | **允许 >1**（Parallel fork） |
| depends indegree | ≤1（Merge 例外） | ≤1 或 Merge fan-in |
| feedback 数量 | ≤1 | **允许多条**，每条必须有 CycleGate 确认；受 stopPolicy |
| conditional | 自 Condition，≥2，需 branchKey | 保持；UI 强制标 label |
| entry | 恰好 1 | 保持 |

### 5.5 Logic kinds

| kind | 契约 | Runtime |
|------|------|---------|
| condition | 有 | 有 → 增强 |
| loop | 有 | 有 → 增强 + 容器 |
| merge | 有 | 有 → 真 join |
| exit | 有 | 有 |
| retry | 有 | **本计划实现** |
| wait | 有 | **本计划实现**（等待上游 artifact / 超时） |

---

## 6. UI / 可视化规格（对齐参考图）

### 6.1 节点与边识读

| 元素 | 规格 |
|------|------|
| Agent / Action / Logic / Human | 沿用 `loopNodeVisuals` |
| Condition | 菱形或强逻辑角标；出边必须显示 `branchKey` |
| Merge | Join 图标；subtitle「wait for all」 |
| Feedback / Loop | 回环边强调色；Loop 虚线容器 |
| Parallel 区域 | 虚线容器包住 fork→…→merge 子图（自动检测或作者标记 `groupId`） |
| Run 色点 | succeeded=绿 running=蓝 waiting/waiting_approval=橙 failed=红 skipped/cancelled=灰 pending=muted |

### 6.2 Run 面板（参考图底部 Observability）

| 区块 | 内容 |
|------|------|
| Execution | 拓扑投影 + 色点；当前 cursor/ready 集 |
| Human Decisions | `human_decision` artifacts：Approve/Reject/理由 |
| Artifacts & Evidence | 按节点列出 artifact / evidenceId / agentRunId（深链 Agent Flow） |
| Run History | 同 Loop 历史 Instance 列表 + 轮次/耗时摘要 |
| Minimap | P2：大图导航缩略图 |

### 6.3 Review Path Map 增强

- 识别 Parallel fork-join 与 Loop 容器（只读）  
- feedback / conditional 标签保持  
- 多 feedback 时逐条进 Gate Checklist  

---

## 7. API 演进（新增不破坏）

| API | 用途 | Phase |
|-----|------|-------|
| `cancelLoopInstance` | Instance → cancelled；cancelAgentRun | GC-2 |
| `getLoopInstanceView` | 聚合 nodeRecords + artifacts + decisions | GC-3 |
| `startLoopInstanceWithParams` | 参数化启动 | GC-5 |
| `getLoopReplanProposal` / `applyLoopReplan` | 结构化重规划 | GC-4 |
| `listLoopRunHistory` | 历史 Instance | GC-3 |

现有 `pauseLoopInstance` / `resumeLoopInstance` / `resolveLoopHitl` / `stepLoopInstance` **语义加固**，不改名。

---

## 8. 分阶段任务清单

复杂度：S &lt; 0.5d · M ≈ 1–2d · L ≈ 3–5d · XL &gt; 5d

---

### Phase GC-0 — 冻结、清单与交叉引用

#### GC-0.1 本 DevPlan 入库与交叉链接

| 字段 | 内容 |
|------|------|
| Task ID | GC-0.1 |
| 类型 | Docs |
| 可能修改 | 本文件；Studio / Node Architecture / Review Visual 文首关系表 |
| 验收 | 三份权威文档均指向本 Gaps Closure；非目标与 GC-D1–D10 可见 |
| 复杂度 | S |

#### GC-0.2 Gap → Task 映射表（机器可读注释）

| 字段 | 内容 |
|------|------|
| Task ID | GC-0.2 |
| 类型 | Docs |
| 验收 | §3 每个 Gap ID 至少映射到一个 GC-* Task；无孤儿 Gap |
| 复杂度 | S |

**Gap 映射**：

| Gap | Tasks |
|-----|-------|
| G-SEQ | GC-1.4 回归 |
| G-PAR | GC-1.2, GC-1.3, GC-3.3 |
| G-BR | GC-1.1, GC-3.2, GC-6.1 |
| G-LP | GC-1.1, GC-3.2, GC-6.1 |
| G-GT | GC-3.4, GC-6.2 |
| G-RC | GC-2.*, GC-3.1 |
| G-ERR | GC-2.4, GC-3.1 |
| G-TO | GC-2.5 |
| G-ST | GC-2.1 |
| G-CP | GC-4.1 |
| G-ID | GC-4.3 |
| G-FS | GC-4.2 |
| G-RP | GC-4.4 |
| G-TR | GC-5.* |
| G-OBS | GC-6.* |
| G-INT | GC-3.5 |
| G-GOV | GC-4.5 |
| G-IT | GC-6.3 |

---

### Phase GC-1 — 控制流契约与拓扑解锁

#### GC-1.1 放宽 feedback / 强化 Loop·Condition 契约

| 字段 | 内容 |
|------|------|
| Task ID | GC-1.1 |
| 可能修改 | `contracts/loop-graph.ts`（`validateLoopSpecTopology`）、compiler、测试 |
| 验收 | 允许多 feedback（每条需可生成 CycleGate）；Loop 仍强制 `maxIterations`；旧单 feedback 文档仍通过 |
| 复杂度 | M |
| 前置 | GC-0.1 |

#### GC-1.2 Parallel 拓扑：depends fan-out + Merge fan-in

| 字段 | 内容 |
|------|------|
| Task ID | GC-1.2 |
| 可能修改 | `validateLoopSpecTopology`、`loop-graph.test.ts`、compiler 启发式 |
| 验收 | outdegree&gt;1 的 depends **合法**；非 Merge 的 indegree&gt;1 仍非法；单入口不变 |
| 复杂度 | M |
| 前置 | GC-1.1 |

#### GC-1.3 Edge `fallback` + Palette 标注

| 字段 | 内容 |
|------|------|
| Task ID | GC-1.3 |
| 可能修改 | `loop-graph.ts` Intent/Spec edge kind、`loopNodeVisuals` / edge 样式、Palette 帮助文案 |
| 验收 | 可创建 fallback 边；拓扑校验：fallback 从可失败节点出发；Review/Draw 可辨色 |
| 复杂度 | M |
| 前置 | GC-1.1 |

#### GC-1.4 Sequence 回归与 Feature Dev Preset

| 字段 | 内容 |
|------|------|
| Task ID | GC-1.4 |
| 可能修改 | presets / architecture E2E 测试 |
| 验收 | 现有线性 Feature Development preset 与 runtime 测试全绿 |
| 复杂度 | S |
| 前置 | GC-1.2 |

---

### Phase GC-2 — 执行引擎：状态机 + 真中断 + Recovery

#### GC-2.1 显式 `nodeRecords` 投影

| 字段 | 内容 |
|------|------|
| Task ID | GC-2.1 |
| 映射 | Studio LG-2.1 |
| 可能修改 | `LoopInstanceSchema`、`loop-runtime-service.ts`、normalize、测试 |
| 验收 | 每次 step 更新相关 nodeRecords；UI 可读；旧 Instance 无字段时 normalize 推导 |
| 复杂度 | L |
| 前置 | GC-1.4 |

#### GC-2.2 Pause / Cancel / Resume 下传 Agent Runtime

| 字段 | 内容 |
|------|------|
| Task ID | GC-2.2 |
| 映射 | Studio LG-2.2 |
| 可能修改 | `pauseLoopInstance`、新增 `cancelLoopInstance`、API/transport、hooks |
| 验收 | pause→`pauseAgentRun`；cancel→`cancelAgentRun` + status `cancelled`；resume 遵循 harness resume-policy |
| 复杂度 | L |
| 前置 | GC-2.1 |

#### GC-2.3 Ready-set 调度（Sequence + Parallel P0 串行排空）

| 字段 | 内容 |
|------|------|
| Task ID | GC-2.3 |
| 可能修改 | `loop-runtime-service.ts`、`loop-runtime-architecture.ts` |
| 验收 | fork 后兄弟节点均 Ready；一次只跑一个；Merge 等全 Succeeded；线性图行为不变 |
| 复杂度 | L |
| 前置 | GC-2.1、GC-1.2 |

#### GC-2.4 实现 `logic.retry` / `logic.wait` + failure_policy

| 字段 | 内容 |
|------|------|
| Task ID | GC-2.4 |
| 可能修改 | `stepLogicNode`、节点 failure 配置、测试 |
| 验收 | retry/wait 不再 `Unsupported`；与 retryPolicy / maxIterations 取严；耗尽 → HITL |
| 复杂度 | M |
| 前置 | GC-2.1 |

#### GC-2.5 Timeout 检查

| 字段 | 内容 |
|------|------|
| Task ID | GC-2.5 |
| 可能修改 | runtime step 入口、`stopPolicy.maxWallClockMs`、可选节点 timeout |
| 验收 | 超时 → awaiting_hitl 或 cancelled（按策略）；事件可观测 |
| 复杂度 | M |
| 前置 | GC-2.2 |

#### GC-2.6 Fallback 边运行时

| 字段 | 内容 |
|------|------|
| Task ID | GC-2.6 |
| 可能修改 | runtime failure 路径、测试 |
| 验收 | onFailure/fallback 配置命中时走 fallback 边；无边则 HITL |
| 复杂度 | M |
| 前置 | GC-1.3、GC-2.4 |

---

### Phase GC-3 — Parallel / Branch / Loop 运行完备 + Gate 产物

#### GC-3.1 Merge 真 Join + 阻塞 HITL

| 字段 | 内容 |
|------|------|
| Task ID | GC-3.1 |
| 可能修改 | `stepMergeNode`、调度器 |
| 验收 | 多父全部 succeeded 才前进；部分失败可 fallback 或 HITL；去除「永远 merge_blocked」误报 |
| 复杂度 | M |
| 前置 | GC-2.3 |

#### GC-3.2 Branch / Loop E2E 强化

| 字段 | 内容 |
|------|------|
| Task ID | GC-3.2 |
| 可能修改 | runtime tests、compiler、Condition 字段解析小扩展 |
| 验收 | pass/fail 双路径；Loop 迭代计数；达上限 HITL；多 feedback 受 maxRounds |
| 复杂度 | M |
| 前置 | GC-2.3、GC-1.1 |

#### GC-3.3 Parallel Preset + 编译

| 字段 | 内容 |
|------|------|
| Task ID | GC-3.3 |
| 可能修改 | `loop-presets.ts`、compiler 启发式、测试 |
| 验收 | 内置「Research ∥ Plan → Merge」类 preset；可编译批准跑通（串行排空） |
| 复杂度 | M |
| 前置 | GC-3.1 |

#### GC-3.4 HumanDecision 规范化

| 字段 | 内容 |
|------|------|
| Task ID | GC-3.4 |
| 可能修改 | `resolveLoopHitl`、artifacts `human_decision`、Review/Run UI 读取 |
| 验收 | 每次 HITL 解析写入结构化 decision；Run 面板可列出 |
| 复杂度 | M |
| 前置 | GC-2.1 |

#### GC-3.5 Action 失败路径一致性（github/test/terminal）

| 字段 | 内容 |
|------|------|
| Task ID | GC-3.5 |
| 可能修改 | action steppers、pendingGithubOp settle |
| 验收 | 失败走 retry/fallback/HITL 与 Agent 节点一致；高副作用仍经 Approval |
| 复杂度 | M |
| 前置 | GC-2.6 |

---

### Phase GC-4 — Checkpoint、Freshness、Replan、治理

#### GC-4.1 Instance Checkpoint

| 字段 | 内容 |
|------|------|
| Task ID | GC-4.1 |
| 映射 | Studio LG-3.1 |
| 验收 | 关键步进持久化 checkpoint；进程重启后可从 checkpoint 恢复 cursor/nodeRecords |
| 复杂度 | L |
| 前置 | GC-2.3 |

#### GC-4.2 Context Baseline + Fresh/Stale

| 字段 | 内容 |
|------|------|
| Task ID | GC-4.2 |
| 映射 | Studio LG-4.1 |
| 验收 | 关键路径指纹；Stale 与 status 正交；Stale 时可 HITL 或仅警告（策略可配） |
| 复杂度 | L |
| 前置 | GC-4.1 |

#### GC-4.3 启动幂等键与副作用阻塞

| 字段 | 内容 |
|------|------|
| Task ID | GC-4.3 |
| 映射 | Studio LG-3.2 / LG-3.3 |
| 验收 | 同 idempotencyKey 不双启；不明副作用 → blocked |
| 复杂度 | M |
| 前置 | GC-2.2 |

#### GC-4.4 Structured ReplanProposal

| 字段 | 内容 |
|------|------|
| Task ID | GC-4.4 |
| 映射 | Studio LG-4.2 |
| 验收 | 提案含 diff 摘要/复用节点/风险；默认需批准；批准不扩大 permissions |
| 复杂度 | L |
| 前置 | GC-4.2 |

#### GC-4.5 预算记账与治理事件

| 字段 | 内容 |
|------|------|
| Task ID | GC-4.5 |
| 映射 | Studio LG-3.4 |
| 验收 | budgetUsage 更新；超预算 HITL；关键审批写入 events |
| 复杂度 | M |
| 前置 | GC-2.5 |

---

### Phase GC-5 — 触发器

#### GC-5.1 参数化启动

| 字段 | 内容 |
|------|------|
| Task ID | GC-5.1 |
| 映射 | Studio LG-5.1 |
| 验收 | Spec 声明 inputParams；`startLoopInstanceWithParams` 校验后启动 |
| 复杂度 | M |
| 前置 | GC-2.1 |

#### GC-5.2 内部事件触发 + 去重

| 字段 | 内容 |
|------|------|
| Task ID | GC-5.2 |
| 映射 | Studio LG-5.2 |
| 验收 | 订阅 Project OS 内部事件；去重键防抖；禁止外部任意 webhook |
| 复杂度 | L |
| 前置 | GC-5.1、GC-4.3 |

---

### Phase GC-6 — 可观测性 UI（对齐参考图）

#### GC-6.1 Run 投影：色点 + Parallel/Loop 容器

| 字段 | 内容 |
|------|------|
| Task ID | GC-6.1 |
| 可能修改 | `LoopGraphOverlay` Run phase、`loopNodeVisuals`、新 `loopRunProjection.ts` |
| 验收 | Run 态节点色点正确；fork-join / loop 虚线容器可见；reduced-motion 可关 |
| 复杂度 | L |
| 前置 | GC-2.1、GC-3.1 |

#### GC-6.2 Decisions / Artifacts / Evidence 面板

| 字段 | 内容 |
|------|------|
| Task ID | GC-6.2 |
| 可能修改 | 新 Run side panel 组件、i18n |
| 验收 | 三区块可扫读；深链 agentRunId / evidenceId；空态友好 |
| 复杂度 | M |
| 前置 | GC-3.4 |

#### GC-6.3 Run History + 弱 Iterate

| 字段 | 内容 |
|------|------|
| Task ID | GC-6.3 |
| 映射 | Studio LG-6.2 |
| 验收 | 列出历史 Instance；可从失败 run「派生新 draft」（复制图，不静默改运行中 Spec） |
| 复杂度 | M |
| 前置 | GC-6.2 |

#### GC-6.4 Review Path Map 容器识读

| 字段 | 内容 |
|------|------|
| Task ID | GC-6.4 |
| 可能修改 | `loopReviewLayout.ts`、`LoopReviewPathMap.tsx` |
| 验收 | Review 只读图能标 parallel 区域与 loop 回环；不破坏现有单链布局 |
| 复杂度 | M |
| 前置 | GC-1.2 |

#### GC-6.5 Minimap（P2）

| 字段 | 内容 |
|------|------|
| Task ID | GC-6.5 |
| 验收 | 大图可导航缩略图；点击平移；非 MVP 阻塞项 |
| 复杂度 | M |
| 前置 | GC-6.1 |

#### GC-6.6 Graph 联动（Loop ↔ Agent Flow / C4）

| 字段 | 内容 |
|------|------|
| Task ID | GC-6.6 |
| 映射 | Studio LG-6.1 |
| 验收 | 从 Loop 节点打开关联 Run；不维护矛盾状态 |
| 复杂度 | M |
| 前置 | GC-6.2 |

---

### Phase GC-7 — Parallel P1（可选多 Run）与验收

#### GC-7.1 多 `activeRunIds` 调度

| 字段 | 内容 |
|------|------|
| Task ID | GC-7.1 |
| 验收 | 同 Instance 可并行多个 AgentRun；写范围冲突 → blocked + HITL；可关闭回退 P0 |
| 复杂度 | XL |
| 前置 | GC-3.3、GC-4.3 |

#### GC-7.2 可靠性验收清单

| 字段 | 内容 |
|------|------|
| Task ID | GC-7.2 |
| 映射 | Studio Phase 7 |
| 验收 | §9 清单全勾；六机制各至少 1 条 E2E；旧文档兼容测试绿 |
| 复杂度 | M |
| 前置 | GC-6.*、GC-4.*、GC-5.*（P1 可与 GC-7.1 并行收尾） |

---

## 9. 验收清单（Definition of Done）

### 9.1 六机制

- [x] **Sequence**：线性 preset 跑通  
- [x] **Parallel**：fan-out → 串行排空 → Merge join → 继续  
- [x] **Branch**：Condition pass/fail 双路径  
- [x] **Loop**：有限迭代 + 达上限 HITL；≥1 条确认过的 feedback  
- [x] **Gate**：Human approval/review/input 可暂停并恢复；Decision 可查  
- [x] **Recovery**：retry / fallback / pause_hitl / 真 cancel 可演示  

### 9.2 成熟能力

- [x] nodeRecords 色点在 Run 可见  
- [x] Parallel/Loop 容器可见（Draw 或 Run 至少一处 + Review 只读）  
- [x] pause/cancel 下传 AgentRun  
- [x] checkpoint 可恢复  
- [x] Fresh/Stale 正交  
- [x] 参数化或事件启动至少一种  
- [x] Artifacts + Decisions + History 面板  
- [x] 旧 `loop-graphs` JSON 仍可读可跑  

### 9.3 回归

- [x] `loop-runtime-*.test.ts` / `loop-graph*.test.ts` / Review layout 测试绿  
- [x] Feature Development 示范 workflow 仍满足 NA 验收不变量  

---

## 10. 实施顺序建议（关键路径）

```text
GC-0 Docs
  → GC-1 拓扑解锁（feedback / parallel / fallback）
  → GC-2 状态机 + 真中断 + ready-set 调度 + retry/wait
  → GC-3 Merge/Branch/Loop E2E + Parallel preset + HumanDecision
  → GC-6.1/6.2/6.4 可观测性（早于完整 GC-4，便于边做边看）
  → GC-4 Checkpoint / Fresh / Replan / 治理
  → GC-5 触发器
  → GC-6.3/6.5/6.6 抛光
  → GC-7 Parallel P1 + 总验收
```

**本会话执行策略**：先落地 GC-0 + GC-1 + GC-2 尽可能多的切片，再推进 GC-3 / GC-6 可视化；GC-4/5/7 按依赖继续。

---

## 11. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Parallel 与单 worktree 写冲突 | P0 串行排空；冲突检测 → Blocked |
| 多 feedback 导致难审 | CycleGate 强制确认；Review 逐条高亮 |
| pause 语义与 harness 不一致 | 单测 + 对齐 resume-policy；不明副作用不盲续 |
| 范围膨胀成 iPaaS | 非目标表；集成不新增品类 |
| 旧文档破裂 | normalize + 兼容测试先于放宽校验 |

---

## 12. 开放题（已关闭）

| 题 | 结论 |
|----|------|
| 是否坚持「永不 Parallel」？ | **否**；本计划 GC-D3 解锁受控 Parallel |
| 是否允许多 feedback？ | **是**；门闩 + 预算约束 |
| Run 可视化是否并进 Review？ | **否**；Review 只读批准；Run 负责执行投影 |
| 是否先做完整多 Agent 并行？ | **否**；先 P0 串行排空，再 P1 |

---

## 13. 变更日志

| 日期 | 变更 |
|------|------|
| 2026-11-09 | 初版：完整 Gap inventory、GC-D1–D10、Phase GC-0–GC-7、与 Studio/NA/Review 映射 |
| 2026-11-09 | **开始落地**：GC-0 文档交叉链接；GC-1 拓扑解锁（depends fan-out、多 feedback、`fallback` 边）；GC-2.1 nodeRecords；GC-2.2 `cancelLoopInstance` + pause/cancel/resume 下传 Agent hooks；GC-2.3 ready-set 串行排空 Parallel；GC-2.4 `logic.retry`/`wait` stepper；Palette `retry`/`wait`；Preset `parallel_research` |
| 2026-11-10 | **续作**：GC-2.5 wall-clock timeout HITL；GC-2.6 fallback 全路径（failNode + Action/Verify）；GC-3.1 Merge 真 Join（sibling drain / 失败 HITL）；GC-3.3/3.4 HumanDecision + Parallel preset 验收；GC-6.1 Run 色点；GC-6.2 `LoopRunSidePanel`；GC-6.4 Review Path Map Parallel/Loop 容器 |
| 2026-11-10 | **GC-4/5/7 落地**：Instance `checkpoint` 步进落盘 + `restoreLoopInstanceFromCheckpoint`；Fresh/Stale 正交 + `stalePolicy`；启动 `idempotencyKey` / 不明副作用 resume → HITL；`ReplanProposal` + 预算记账；`inputParams` / `startLoopInstanceWithParams` / 内部事件去重；Parallel P1 `multi_run` 共享 leaf → `write_conflict` HITL；Run History + derive draft；API/IPC/mock/UI 打通 |
