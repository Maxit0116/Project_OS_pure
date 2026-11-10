# Loops Graph · Six Goals Execution Tracking

**Baseline**: `graph` @ `bec3dd75ef9ab0b50e7b7b564fb91ea5adf0f398`  
**Branch**: `cursor/loops-dispatch-evidence-cab8` (stacked on approval-binding PR9; targets `graph`)  
**Updated**: 2026-11-10 — security/dual-entry WIP + **Project Workflow / Materials** 权威计划入仓  

状态键：**计划** · **实现** · **contract** · **live** · **待验** · **未配置** · **catalog_only**  
**入文档 ≠ 完成。**

## 权威互链

| 文档 | 角色 |
|------|------|
| [`Loops-Graph-Project-Workflow-and-Materials-Dev-Plan.md`](./Loops-Graph-Project-Workflow-and-Materials-Dev-Plan.md) | **增量 A/B 权威**：项目内真实 workflow run + 多类型任务材料；阶段依赖与验收矩阵 |
| [`Loops-Graph-Gaps-Closure-Dev-Plan.md`](./Loops-Graph-Gaps-Closure-Dev-Plan.md) | 六机制 / 可靠性总控（GC-*） |
| [`Loops-Graph-Workflow-Studio-Dev-Plan.md`](./Loops-Graph-Workflow-Studio-Dev-Plan.md) | Studio 壳与 D1–D9 决策基线 |
| [`Loops-Graph-UI-Visual-Authoring-Dev-Plan.md`](./Loops-Graph-UI-Visual-Authoring-Dev-Plan.md) | DutyCard / Palette 手工入口 |
| [`Loops-Graph-Node-Architecture-Dev-Plan.md`](./Loops-Graph-Node-Architecture-Dev-Plan.md) | 四类节点合同 |
| [`bugs.md`](../../bugs.md) | H3 SSRF — URL 材料读取须默认拒内网 |

---

## 六目标实况

| # | Goal | 状态摘要 |
|---|------|----------|
| 1 | 连接器 GitHub…PostHog（11 平台不删） | Batch1 **contract**/live待验；Batch2 Linear/Jira/Notion/Vercel-list **contract**/live待验；Batch3 **catalog_only** |
| 2 | Condition/parallel/loop/timer/retry/pause/resume | GC 主体 **实现/contract**；DutyCard logic 表单 **实现**/UI待验 |
| 3 | Reusable Agents + 互调 | wiring **实现**/待增强 |
| 4 | Human review/approval | binding **contract**；DutyCard human 表单 **实现**/UI待验；OAuth **未配置** |
| 5 | Engineering context | digester + Verify binding **实现/contract**；完整 RunBinding **计划**（见 PW） |
| 6 | Observability | journal/redaction **contract** |

---

## Authoring 基线（事实）

| 项 | 事实 | 状态 |
|----|------|------|
| Heuristic vs LLM | 默认同 `*Heuristic`；`sendLoopAuthoringTurnAsync` + injectable provider（ModelGateway 可接） | provider **contract**（loopback）；**live未验** |
| Workflow + 选中节点上下文 | Provider prompt 含全 draft + `selectedNodeId`；heuristic **不消费**选中 | provider **contract** |
| 局部 patch / ID 保留 | `applyIntentNodePatch` / `mergePreservingUntargeted` + Accept/Undo/stale | **contract** |
| 真实 provider 三轮 | 无自动读 key / 无付费 live | **live未验**（外部缺口） |

---

## 增量 A/B 状态（摘自权威计划；详表见该文档 §4）

| 切片 | 状态 |
|------|------|
| PW Project run binding / 预检 / 项目手动 E2E | **计划**（底座 Spec/Instance 已有） |
| TM TaskMaterial schema + Pure 输入复用 | **计划** |
| URL SSRF 默认拒内网 | **计划**（须 contract；对齐 bugs H3） |
| 离线事件全天排队 | **未实现**（不可承诺） |

---

## 安全门禁（221b231 / 持续）

| 项 | 状态 |
|----|------|
| High-risk / catalog_only 强制 | **contract** |
| 非幂等 POST 不盲重试；timeout/abort unknown；ledger | **contract** |
| URL/header/body 脱敏 + fake-secret | **contract** |
| Overlay 真实 LoopSaaSNodeCard；DutyCard 类型表单 | **实现** / 真实 DOM **待验** |
| LocalApi→adapter→loopback settle | **实现**/contract 路径；live未验 |

---

## 验证闸（每推送更新）

```text
# 近期 Loops 发现集示例（以当次命令输出为准）
npx vitest run services/loop-* workbench/src/components/LoopGraph
# 记录：Test Files / Tests / exit
# tsc --noEmit：目标不引入 loop-* 新回归；近期基线约 160 error TS（仓库既有债）
```

近期本地闸（实现切片，非文档完成）：**29 files / 157 tests passed**；tsc **160**（无新增 loop-connectors/authoring 回归）。

No merge / paid live / Mac / 真实外发。
