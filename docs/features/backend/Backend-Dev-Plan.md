# 后端总体开发计划：从可演示 Agent 到可交付的工程系统

**状态**：Phase 1–3 计划切片已落地（2026-10-20）。本目录 `docs/features/backend/` 是后端计划入口。后续排期以本文为索引，以各子系统计划为实施权威。  
**合格线**：Agent 能在真实仓库里完成一次可验证的修改，并且失败、中断和危险操作都有服务器决定的去向。不把「已接入 Memory / RAG / MCP」当作合格。  
**产品约束**：本地单用户桌面。功能图是写授权。C4 是架构视图。Loop 是工作流定义，Run 才是一次执行。  
**收尾**：实现切片已齐。仍欠桌面人工冒烟（见 [`Agent-Harness-Eval-Checklist.md`](../Agent-Harness-Eval-Checklist.md)）。RAG-5、Route ②、OS 沙箱、Phase 4 明确不做。

本文不要求把 12 个子系统拆成 12 个服务，也不要求把模型供应商、解析器、数据库、容器从零重写。已经够用的层保持不动；Phase 4 与各文档 DEFERRED 项现阶段不排。

## 0. 和已有计划的关系

下列文档的原切片已经落地，仍然是该层的历史权威。本文记录「到合格线还缺什么」；不重开已勾选的实现切片。

| 子系统 | 权威文档 | 状态（2026-10-20） |
|--------|----------|-------------------|
| Harness | [`Agent-Harness-Dev-Plan.md`](../Agent-Harness-Dev-Plan.md) H0–H7 | 诚实流水线、一次修复、中断续跑规则、写死预算。Route ② 仍关 |
| Context | [`Context-Engineering-Dev-Plan.md`](../Context-Engineering-Dev-Plan.md) CTX-0–CTX-6 | 六槽装配。叶子 Change 带只读引用方和同名测试附录；过期描述不进提示 |
| Memory | [`Agent-Memory-Dev-Plan.md`](../Agent-Memory-Dev-Plan.md) MEM-0–MEM-6 | 点名文件且核验哈希冲突的 `project` 笔记不注入。任务进度不属于记忆 |
| RAG | [`RAG-Dev-Plan.md`](../RAG-Dev-Plan.md) RAG-0–RAG-4、RAG-6–RAG-10 | `symbol` 走 `lookupSymbols` 并回源当前行。检索评估分数不进提示词。**RAG-5 向量仍关** |
| Code Intelligence | [`Code-Intelligence-Dev-Plan.md`](Code-Intelligence-Dev-Plan.md) CI-0–CI-4 | TS/JS 导出符号、引用影响、描述过期与刷新。不并入 C4 |
| Tools | [`Tools-Integrations-Dev-Plan.md`](Tools-Integrations-Dev-Plan.md) T-0–T-3 | `ToolResult` 信封；Git 只读 status；写仍只走事务 |
| Sandbox | [`Sandbox-Runtime-Dev-Plan.md`](Sandbox-Runtime-Dev-Plan.md) SB-0–SB-2 | 并发上限、进程组清理、保护路径监视。仍 `softOnly`，无 OS 隔离 |
| Planning | [`Planning-Orchestration-Dev-Plan.md`](Planning-Orchestration-Dev-Plan.md) P-0–P-3 | Implement 附着叶子 Run；verify 只认证据；失败才沿 feedback 再开一轮 |
| Loops Graph Studio | [`../Loops-Graph-Workflow-Studio-Dev-Plan.md`](../Loops-Graph-Workflow-Studio-Dev-Plan.md) | 产品级工作流编排演进（画布、可靠性、重规划、触发）；复用 Planning 底座，不另起 Runtime |
| Verification | [`Verification-Eval-Dev-Plan.md`](Verification-Eval-Dev-Plan.md) V-0–V-3 | 每次运行有证据；`not_run` 不是通过；离线分数不进用户验收 |
| Session | [`Session-State-Dev-Plan.md`](Session-State-Dev-Plan.md) S-0–S-2 | 半截运行是 `interrupted`；已写入的不会因继续而再写一遍 |
| Security | [`Security-Governance-Dev-Plan.md`](Security-Governance-Dev-Plan.md) SEC-0–SEC-3 | 审批与拒绝写入审计；无账号系统 |
| Observability 与 Model Gateway | [`Observability-Model-Gateway-Dev-Plan.md`](Observability-Model-Gateway-Dev-Plan.md) O-0、O-1、GW-0、GW-1 | `requestId`、token 合计、失败落点、预算超时 |

## 1. 已经够用、不要重做的部分

- **写授权**：叶子一次一个文件；非叶子零写权限；检索命中和记忆都不进入 `allowedWritePaths`。
- **Harness 外壳**：ToolPolicy、Rules、Skills、记忆围栏、按模型 `systemDelta`、worktree 合并确认、H5 一次修复、H6 续跑、H7 预算。
- **六槽上下文 + CTX-6 附录**：`assembleRunContext`；回放用哈希。
- **个人记忆**：`AgentMemoryStore`；`observed` 不注入；MEM-6 路径哈希冲突不注入。
- **检索**：词法、图、块索引、运行记录；`symbol` 经代码索引；`vector` 仍拒绝。
- **代码事实**：`services/code-intelligence/` 的清单、导出符号、引用影响、描述过期。
- **工具与验证**：`ToolResult`、`VerificationEvidence`、Git 只读状态。
- **Session / Loop**：`interrupted` 调和；Loop implement/verify 挂真 Run 与证据。
- **模型调用**：`ModelGateway` 统一供应商、脱敏、用量与 MCP 循环上限。
- **可逆 apply**：备份、PendingChanges、对话 checkpoint 只回滚文件。
- **C4 结构图**：扫描、lint、节点级 impact、文件描述。它们回答「系统由什么组成」，不代替符号表。

## 2. 三条已对齐的模型

1. **事件**：模型调用、工具执行、代码变更、测试结果、人工审批可按 `runId` 串起来（run JSONL + 审计记录）。
2. **任务状态**：`AgentRunStatus` 含 `interrupted`。Loop 实例可挂 `agentRunId`；verify 不再默认「没强制失败就算过」。
3. **项目事实**：文件路径、内容哈希、符号 id、功能图节点 id、文件描述版本可互指；代码索引不写进 C4 边。

## 3. 继续锁定的产品决定

- Route ②（模型自由选择任意工具）保持关闭。验证失败后的再改，由服务器在同一条流水线里限次重试（H5）。
- 不把向量检索当成默认发现手段。RAG-5 仍关。
- 记忆不是项目事实。代码、图和当前文件字节优先（MEM-6）。
- 不把 C4 图扩成调用图。
- 不做云端 Devbox、多租户、计费和团队权限。
- 多 Agent 并行不在当前阶段做。worktree 是隔离目录，不是调度器。

## 4. 阶段进度

### Phase 1–3 · 已落地（实现切片）

| 阶段 | 切片 | 状态 |
|------|------|------|
| 1 | Tools T-0/T-1、Verification V-0–V-2、H5、H7、CI-0–CI-2、O-0、S-1 | 已落地 |
| 2 | CI-3–CI-4、CTX-6、RAG-9/10、MEM-6 | 已落地 |
| 3 | Planning P-0–P-3、S-2、H6、SB-1/SB-2、SEC-1/SEC-2 | 已落地 |

### Phase 4 · 规模化（现在不排）

多模型按难度路由、账号、计费、租户、OS 级沙箱、云端隔离。只有人工六问在桌面上勾通之后，才考虑开这一阶段。

## 5. 依赖（已闭合）

```text
Policy、六槽、记忆、词法检索、C4、叶子流水线
        │
        ├─ Tools T-0 ──► Verification V-0 ──► Harness H5 / H7
        ├─ Code Intelligence CI-2 ──► Context CTX-6 ──► RAG RAG-9
        ├─ Session S-1 ──► H6 / S-2 ──► Planning P-1 / P-2
        └─ Sandbox SB-1、Security 审计、Observability O-0 / GW-0
                │
                X  Phase 4 / RAG-5 / Route ② / OS 沙箱
```

## 6. 怎样算合格（人工仍要勾）

实现有单测支撑还不够。桌面冒烟用这六个问题，勾在 [`Agent-Harness-Eval-Checklist.md`](../Agent-Harness-Eval-Checklist.md) 的 Phase 1 六问段：

| 问题 | 通过时要能指给一段证据 |
|------|------------------------|
| 理解 | 问一个当前节点文件里没有的函数名，回答带来自符号索引的路径和行，写范围不变 |
| 行动 | 叶子 Change 改完文件后，Git 状态能说明分支和是否有未提交改动 |
| 验证 | 配置了命令时，成功记录含退出码和摘要；没配置时状态是 `not_run`，不能显示成通过 |
| 恢复 | 杀掉进程后，该运行是 `interrupted`。已 apply 的文件不会在恢复时再写一遍 |
| 治理 | 未知 shell、网络命令、写范围外路径仍然 deny 或 ask，并留下审计事件 |
| 改进 | 同一次运行能看到模型 `requestId`、工具结果和验证结论 |

## 7. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-10-20 | 初稿。按 12 子系统拆后端合格线。 |
| 2026-10-20 | Phase 1–3 切片落地后，更新关系表与「够用部分」；标明收尾是人工冒烟，不是再开实现切片。 |
