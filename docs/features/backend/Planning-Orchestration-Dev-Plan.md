# Planning：任务规划与 Loop 执行开发计划

**状态**：Draft（2026-10-20）。P-0–P-3 已落地。Implement 完成来自 Agent Run，verify 完成来自验证证据。  
**范围**：把自然语言目标和 Loop 图变成可执行、可停、可验收的步骤。第一步仍是单 Agent。  
**总计划**：[`Backend-Dev-Plan.md`](Backend-Dev-Plan.md) Phase 3。P-1 不得早于 Verification V-0 和 Harness H5。  
**锚点**：

- 图上委托：`services/agent-orchestrator/index.ts` 的层级 run、验收标准继承、whole-tree apply。
- 计划文档：`services/plan-service.ts` 产出 JSON 计划，明确要求不声称已经改文件或跑过命令。
- Loop 规格：`services/loop-graph-compiler.ts` 把意图图编成带角色、依赖和停止策略的规格。启发式编译不调用模型。
- Loop 运行：`services/loop-runtime-service.ts` 的 `stepLoopInstance`。

**对标一句话**：Loop 是可批准的工作流定义。一次 Run 才去改代码和跑验证。节点被标成完成，必须是因为 Run 和验证证据这么说。  
**产品演进权威**：画布工作室、真暂停/恢复、Fresh·Stale、重规划提案、参数化/事件触发等见 [`../Loops-Graph-Workflow-Studio-Dev-Plan.md`](../Loops-Graph-Workflow-Studio-Dev-Plan.md)。本文仅锁定已落地的 P-0–P-3 执行底座。

## 0. 现状

| 能力 | 现状 |
|------|------|
| 单次叶子任务 | 服务器流水线：定位、生成、校验、apply、可选验证 |
| 多文件委托 | 非叶子只规划。叶子子 run 写文件。验收标准有数量上限。整树 apply 失败会把树标失败 |
| Plan 模式 | 可编辑、可落盘的实现计划。计划本身不执行 |
| Loop 编译 | 角色和边可以推断。缺目标时会记 assumption。拓扑用 `validateLoopSpecTopology` |
| Loop 步进 | `decide` 进入 `awaiting_hitl`。`implement` / `fix` 按功能图叶子启动 Agent Run，并等这次 Run 跑完再决定节点。多个叶子时用当前选中的功能图节点。`verify` 只在证据 `passed` 时前进 |
| 并行与冲突 | 无调度器。worktree 是手动隔离目录，不是自动并行 |
| 失败后重规划 | 无。委托失败有分类（`child-failure-category.ts`），不会生成新计划 |

因此 Loop 会启动已挂接叶子上的那一次 Run，而不是自己把节点标完成。多个叶子且没有选中功能图节点时，仍然失败并说明文件未挂接。

## 1. 实体

```text
IntentGraph / LoopSpec     用户确认过的定义。改定义是新版本，不是改正在跑的实例
LoopInstance               某一次执行：specVersion、cursor、round、status
AgentRun                   叶子或规划运行。Loop 的 implement 节点通过它干活
VerificationEvidence       verify 节点只读它，不自己宣布通过
```

一个 Loop 可以有多次 Instance。进行中的实例已经禁止第二个活跃实例（`startLoopInstance` 会拒绝）。这个限制保持。

## 2. 切片

### P-0 — 规格与实例的边界写进运行时

**目标**：步进器不能改写已批准规格。

- [x] `stepLoopInstance` 只更新实例的 cursor、round、events、status。
- [x] 需要新步骤时，产生一份待批准的规格草稿，不自动把草稿当成正在跑的 `specVersion`。
- [x] 事件继续放在实例上，上限保持现有截断行为，并在截断时保留 `started`。

**验收**：运行中的规格版本号不变。用户没批准新版本时，实例不会跳到新节点集合。

### P-1 — implement 节点启动 Agent Run

**目标**：实现节点的完成来自编排器，而不是步进器自己。

- [x] `implement` 或 `fix` 节点创建或附着一次 `AgentRun`，范围仍然由功能图决定，不由节点文案决定写哪些文件。
- [x] Run 处于 `running` / `awaiting_review` 时，Loop 实例停在该节点，状态与 Run 一致，不前进。
- [x] Run `complete` 且 apply 成功，节点才 `node_completed`。Run `error` 或 `cancelled`，节点失败并停住，除非规格有 feedback 边且下面的 P-2 允许回退。
- [x] 不在本切片并行多个 Run。

**验收**：没有可用的叶子写范围时，节点失败并说明文件未挂接。它不会显示「Completed implement」。

### P-2 — verify 节点读取证据

**目标**：验证通过与否来自 Verification 计划里的证据。

- [x] 删除「没有 `forceFailVerify` 就算通过」的默认。没有证据时，节点进入等待或失败，文案是「验证未运行」。
- [x] 证据 `passed` 才前进。`failed` 且存在来自该节点的 feedback 边时，按现有 `stopPolicy.maxRounds` 回到目标节点。
- [x] 回到的目标必须是 P-1 的实现节点，并开启新的 Agent Run，而不是把旧 Run 标成未完成。
- [x] `not_run` 不触发自动修复。它停下来等人配置或批准命令。

**验收**：失败证据会沿 feedback 边再进入一次真实 Run。没有 feedback 边时实例进入错误或 HITL，与今天缺边的失败路径一致。

### P-3 — 人的决定只走现有 HITL

**目标**：不另做一套审批 UI 协议。

- [x] `decide` 节点继续 `awaiting_hitl`，用 `resolveLoopHitl` 继续或停止。
- [x] 停止政策打满时继续要求人决定，不自动无限回退。
- [x] 人的答案写入实例事件。它不写入 Agent Memory。

**验收**：暂停、恢复、HITL 的现有 API 仍可用。自动修复次数到顶后不会自己往下跑。

### 明确不做

| 项 | 原因 |
|----|------|
| 多 Agent 并行、文件冲突检测 | 单运行的验证闭环还没接上 |
| 模型看图「自己理解」后直接改文件 | 必须先变成校验过的 LoopSpec |
| 失败后静默重写整张图 | 新规格要人批准 |
| 用 Plan 模式的 Markdown 代替 LoopSpec | 计划可以当输入，执行以规格和 Run 为准 |

## 3. 依赖

```text
Verification V-0 证据
Harness H5 一次修复（叶子内部，不必等 Loop）
        │
        ▼
P-0 规格冻结 ─► P-1 implement = AgentRun ─► P-2 verify = 证据
        │
        └─► P-3 HITL（已有 API，补「未运行不算通过」）
```

叶子任务的 H5 修复不依赖 P-1。P-1 依赖叶子流水线已经诚实。

## 4. 不变量

- Loop 文案、模型计划和检索命中都不能授予写路径。
- 实例绑定批准过的 `specVersion`。
- 节点完成必须能指向 Run id 或验证证据 id。指不出来就不是完成。
- 同一 Loop 同时只有一个活跃实例。
- 子 Run 不写记忆。与 Memory 计划一致。

## 5. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-10-20 | 初稿。对照 `stepLoopInstance` 的确定性完成、`plan-service` 的只读计划和编排器委托，把「真执行」收成 P-0–P-3。 |
| 2026-10-20 | 落地 P-0。步进只改实例；`replan` 写入 `pendingCompile` 并停在 HITL；事件截断保留 `started`。P-1 仍等 Harness H5。 |
| 2026-10-20 | 落地 P-1–P-3。叶子写范围只来自功能图；verify 读证据；HITL 答案留在实例事件上。 |
| 2026-10-20 | 补上 Run 启动。创建叶子 Run 时绑定功能图文件上下文并调用 `startRun`。多个叶子时使用调用方传入的功能图节点。 |
