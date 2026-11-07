# GitHub Graph：时序泳道（Temporal Swimlane）Dev Plan

**状态**：M1+M2 in progress（2026-11-06）— TS-1…TS-9 主路径已落地：竖直泳道 L2、双击进入、窗口/first-parent、DetailPanel I/C/F；depth-DAG 已非默认 UI。  
**产品定位一句话**：在横向 GitHub Graph 总览上，用户双击正在开发的 node，进入竖直时序泳道，按真实 git 拓扑阅读事件递进并回溯理解；返回后总览上下文不丢。  
**范围**：将现有 L2 `git-history` 的 depth-DAG 卡片视图，升级为 **SourceGit 风格竖直泳道表**（行=事件，左轨右表）；总览 L0/L1 **保持横向**，不做整图改竖、不做总览缩略预览。

**权威交叉引用**：

| 文档 / 代码 | 关系 |
|-------------|------|
| [`GitHub-Graph-Feature-Tree-Git-History-Dev-Plan.md`](./GitHub-Graph-Feature-Tree-Git-History-Dev-Plan.md) | 父计划：一层领域模型 + Feature Tree + History；本计划 **专责 L2 History UI 与进入/返回交互** |
| [`GitHub-Compose-Hub-Dev-Plan.md`](./GitHub-Compose-Hub-Dev-Plan.md) | 分区树浮窗壳体与 git 突变边界 |
| [`GitHub-Auth-Dev-Plan.md`](./GitHub-Auth-Dev-Plan.md) | 认证；本计划不扩展 OAuth |
| `contracts/github-domain.ts`、`github-graph-nav.ts` | 领域模型与 L0/L1/L2 nav（复用并小幅扩展） |
| `layoutGithubCommitDag.ts` | **将被泳道路局替换**为默认 History 布局（可暂留测或删除） |
| `GithubGraphOverlay.tsx`、`GithubGraphDetailPanel.tsx` | 主改动面 |
| 参考（外部）：[sourcegit-scm/sourcegit](https://github.com/sourcegit-scm/sourcegit)、[the0807/git-graph-plus](https://github.com/the0807/git-graph-plus)、[graph-lab](https://www.npmjs.com/package/graph-lab) | 算法/交互借鉴；**不**引入为运行时依赖，除非 spike 证明必要 |

---

## 0. 核心诉求（讨论锁定）

| # | 诉求 | 本计划对应 |
|---|------|------------|
| 1 | 从**时序**看当前正在开发的 repo 事件如何递进 | L2 竖直泳道：拓扑序事件行 + lane 轨 |
| 2 | 方便**查看与回溯理解**，不是再做一个全能 Git GUI | 有界窗口 + first-parent 可选 + commit 详情；不做泳道内 merge/rebase GUI |
| 3 | 与现有横向 Graph **结合**，而非互相替换 | 总览横（结构）+ 时序竖（递进）；双击 node 进入 L2 |
| 4 | 可收起、按需进入 | 总览**无** sparkline/mini 预览；只有进入 L2 才看 history |
| 5 | 真实 git 拓扑，禁止假线性时间线冒充历史 | `parentShas` 权威；行序默认拓扑；时间仅作列展示 |

**价值链**：

```text
横向 L0 partition / L1 feature-tree（结构总览）
        │ 双击 node（branch / feature / PR / …）
        ▼
竖直 L2 temporal swimlane（scope 内事件递进）
        │ 选中 commit
        ▼
DetailPanel：Information / Changes / Files
        │ Esc / 面包屑
        ▼
回到总览（viewport + 原 node 选中 + selectedCommitSha 保留）
```

---

## 1. 锁定决策（2026-11-06）

| # | 议题 | 锁定 |
|---|------|------|
| D0 | 方向 | **总览横 + 时序竖**；不把 Tree Graph 改成竖直 |
| D1 | 进入手势 | **双击** node 进入竖直时序（单击仍=选中 + Detail） |
| D2 | 总览缩略 | **无** sparkline / mini 横预览；history 只在 L2 |
| D3 | 与 L0/L1/L2 | 竖直泳道 = **重做后的 L2 `git-history`**，替换当前 depth-DAG 为默认 History UI |
| D4 | Feature 多 branch | **F1**：一张多轨图（lane=branch），相关轨高亮 |
| D5 | 默认窗口 | **D**：默认最近 **N=`GITHUB_HISTORY_COMMIT_CAP`（200）** commits；UI 可切换「最近 T 天」或「自分叉点/起点」 |
| D6 | Lane 身份 | **C**：默认按 **Branch** 分轨；从 Feature 进入时仍按 Branch，并高亮该 Feature 关联轨 |
| D7 | 行序 | **A**：默认 **拓扑序**（类 SourceGit / `git log --graph`） |
| D8 | First-parent | **A**：有开关；**默认关**（看全部分叉） |
| D9 | MVP 主表事件 | **commit + WIP 虚行**；PR 作行内徽章/标记；CI / tag / agent **不进** MVP 主表 |
| D10 | Commit 详情 | **演进现有** `GithubGraphDetailPanel`：Information / Changes / Files 分区；泳道模式右侧停靠（不新做底栏 chrome） |
| D11 | 返回记忆 | Esc/面包屑=**上钻一层**；恢复总览 viewport+原 node；保留 `selectedCommitSha`；viewport 分存 |
| D12 | 参考产品 | 交互与轨几何对齐 SourceGit 竖直表；布局算法可借鉴 SourceGit / git-graph-plus / graph-lab 思路，**自研纯函数 + 单测** |

### 1.1 Node → 默认 scope（D4 补充）

| 打开的 node | 默认 scope | 不可下钻？ |
|-------------|------------|------------|
| **branch** | 该 tip 可达 commits（有界窗口） | — |
| **feature** | 关联 branches **并集**；lane=branch；关联轨高亮 | — |
| **PR** | `base...head` 区间；行内可标 PR 开/合/merge 徽章 | — |
| **group** | 组下 branches 并集 | — |
| **default / repo 根** | 「当前开发窗口」活跃 refs（非全仓考古） | — |
| **worktree** | 其 checkout branch + WIP 虚行 | — |
| **无 git 关联的 feature** | **空态** + 引导绑定 branch；**禁止**画假线 | 可双击进入空态，不可伪造 history |

双击 **commit**（仅当已在 L2）：不换 scope，只选中该行。

### 1.2 与父计划的关系

- **继承**：一层 `GithubDomainModel`、真实 `parentShas`、typed relations、可读性优先、agent 仅扩展点、复用 `GraphOverlayFrame`。
- **修正父计划 T7 默认 UI**：父计划中「ELK / layered DAG 卡片」不再作为 L2 默认；改为本计划竖直泳道。depth-DAG 实现视为过渡态，本计划交付后删除或降为调试开关（默认关）。
- **不重复**：Feature CRUD、M:N 持久关联、Issues/Checks REST、safe revert 菜单等仍归父计划里程碑；本计划只消费已有 commit/PR/feature 数据面。

---

## 2. 非目标（MVP）

| 项 | 原因 |
|----|------|
| 总览 Graph 改竖直 | D0；结构轴与时间轴分离 |
| 总览 sparkline / 横向 mini 时序条 | D2 |
| 横向时序作为主阅读面 | 竖表更适合回溯 |
| 泳道内完整 git 写操作（merge / rebase / cherry-pick GUI） | 总览侧已有突变；泳道专注阅读 |
| 全仓无限历史 / 无 cap 考古 | D5 有界窗口 |
| Webhook 实时推送 | 沿用手动 Refresh / 现有 reload |
| CI / tag / agent 完整主表可视化 | D9；仅预留扩展 |
| 把 L2 再拆成「横 DAG + 竖泳道」双 History | D3 单一默认 |
| 引入 React Flow / 捆绑 SourceGit 二进制 | 无证据不换栈 |
| 人造线性时间线冒充 git 历史 | 父计划锁定 |

---

## 3. 现状审计（实现前实勘摘要）

| 区域 | 路径 | 结论 |
|------|------|------|
| L2 UI | `GithubGraphOverlay.tsx` `activeMode === 'git-history'` | 横向 depth 卡片 + parent 贝塞尔边；**非**泳道表 |
| 布局 | `layoutGithubCommitDag.ts` | depth = 最长路径；兄弟扇出；**无 lane reservation** |
| Nav | `github-graph-nav.ts` | 已有 `git-history`、per-mode viewport、`selectedCommitSha`、`focusedFeatureId` / `focusedBranchRef` |
| 进入 | Overlay `switchMode('git-history')`、Feature Detail `onOpenHistory` | **无**「双击 node → scoped history」主路径 |
| 数据 | `git-context-service` commit list + parents；`GITHUB_HISTORY_COMMIT_CAP = 200` | 可复用；需补：WIP 行、窗口模式（天数/分叉点）、first-parent 过滤、scope 裁剪 |
| 详情 | `GithubGraphDetailPanel` | commit/feature popover；需演进为 I/C/F 分区并在泳道模式右侧固定 |
| Focus | `resolveGithubGraphFocus.ts` | Feature↔History 0/1/N；泳道进入时应复用并写入 scope |

**缺口（本计划必须补）**：lane 布局纯函数、竖直虚拟列表 UI、双击进入 + scope 解析、窗口切换、first-parent、WIP 行、返回上钻记忆、空态。

---

## 4. 产品交互规格

### 4.1 总览（L0 / L1）— 不变方向

- 横向树：`layoutGithubGraphTree` / Feature projection。
- **单击**：选中 + 现有 Detail / 菜单。
- **双击**（可下钻 kind）：解析 scope → `set-mode: git-history` + focus 字段 → 进入泳道。
- 不可下钻或无数据：双击进入 L2 **空态**（文案说明原因 + 绑定/返回 CTA），不静默失败。

### 4.2 时序层（L2）— 竖直泳道

**壳**：

1. 顶栏：面包屑（Partition → Feature? → Timeline）+ scope 芯片 + 窗口控件（N commits / T 天 / 分叉起）+ first-parent 开关 + 返回。
2. 主区：虚拟化竖直列表。
   - 左：lane rails + commit 点（merge 可用 `+` 或双亲汇入几何）。
   - 右列：subject、author、short SHA、相对时间；ref pills（branch HEAD / tag 若已有数据）。
   - WIP：列表顶虚行（dirty 时），点击可走现有 dirty/工作区语义（不强制打开外部 SCM）。
   - PR：关联行上徽章（非独立事件行，除非后续里程碑升格）。
3. 右侧：`GithubGraphDetailPanel`（选中 commit 时 Information / Changes / Files）。

**导航**：

| 输入 | 行为 |
|------|------|
| Esc / 面包屑上一级 | 上钻到进入前模式；恢复该模式 viewport 与 `selectedEntityId` |
| 单击行 | `selectedCommitSha` + 加载 detail |
| 搜索（MVP 可简） | 至少过滤 message / sha 前缀（实现阶段可列为 M1 或 M1.5） |

### 4.3 验收叙事（D13）

> 用户在横向 GitHub Graph 打开某个正在开发的 branch / feature / PR，进入竖直时序泳道，按真实 git 拓扑阅读事件递进，并能查看 commit 变更；返回后总览选中与视口不丢。

---

## 5. 数据与布局模型（提议）

### 5.1 Scope 描述（nav 或旁路 state）

```ts
// conceptual — 实现时进 contracts，名称可微调
type GithubHistoryWindowKind = 'commit-cap' | 'since-days' | 'since-fork'

interface GithubHistoryScope {
  /** What the user double-clicked */
  sourceKind: 'branch' | 'feature' | 'pr' | 'group' | 'default' | 'worktree'
  sourceId: string
  /** Tips / refs included in the query */
  branchRefs: string[]
  /** PR number when sourceKind === 'pr' */
  prNumber?: number
  window: {
    kind: GithubHistoryWindowKind
    commitCap: number          // default GITHUB_HISTORY_COMMIT_CAP
    sinceDays?: number
  }
  firstParentOnly: boolean     // default false
  /** Feature id when entered from feature — for lane highlight */
  highlightFeatureId?: string
}
```

- 进入 L2 时写入 scope；Refresh 按同一 scope 重拉。
- `focusedBranchRef` / `focusedFeatureId` 与 scope 对齐，供面包屑与返回。

### 5.2 行模型

```ts
type SwimlaneRowKind = 'commit' | 'wip'

interface GithubSwimlaneRow {
  id: string                   // sha or 'wip'
  kind: SwimlaneRowKind
  sha?: string
  parentShas: string[]         // empty for wip
  subject: string
  authorName?: string
  authoredAt?: string
  /** Lane index after layout */
  lane?: number
  isMerge?: boolean
  refLabels?: string[]         // HEAD names pointing here
  prBadges?: number[]          // PR numbers touching this commit if known
}
```

### 5.3 Lane 布局

- **Create**：`layoutGithubCommitSwimlane.ts`（纯函数）。
- **输入**：拓扑序 rows（newest-first 与 SourceGit 一致）+ `parentShas`。
- **算法**：active-lane reservation（first parent 续轨，额外 parent 开轨）——对齐 SourceGit / git-graph-plus / graph-lab 思路。
- **输出**：每行 `lane`、轨段几何（供 SVG/Canvas 画 rail）、`laneCount`、可选 `laneBranchNames` 着色键。
- **First-parent 开**：过滤/隐藏非 first-parent 边与仅属于旁路的行（精确定义在实现单测中钉死）。
- **禁止**：用 `authoredAt` 排序冒充实拓扑。

### 5.4 查询

| 窗口 | 行为 |
|------|------|
| `commit-cap`（默认） | 现有 tip-first `rev-list` + parents，limit=N |
| `since-days` | 同 tips，加 `--since`（或等价过滤） |
| `since-fork` | 相对 default（或 scope base）merge-base 之后的 commits；PR 用 `base...head` |

WIP：工作区 `dirty` 时在结果集前插入一行。

---

## 6. 任务拆解

### TS-0 — DevPlan 对齐与父计划交叉引用

- **Objective**：父计划 T7 注明「默认 UI 由本计划接管」；本文件为实现权威。
- **Acceptance**：交叉链接双向可点。

### TS-1 — Scope 契约 + nav 扩展

- **Objective**：`GithubHistoryScope`（或等价）+ reducer actions（set-scope、set-window、toggle-first-parent）。
- **Modify**：`github-graph-nav.ts`（或旁路 `github-history-scope.ts`）+ tests。
- **Acceptance**：zod 校验；默认值符合 D5/D8。

### TS-2 — Scope 解析器（双击 → scope）

- **Objective**：从 node kind + domain model 得到 `branchRefs` / PR 区间 / 空态原因。
- **Create**：`resolveGithubHistoryScope.ts`。
- **Reuse**：`resolveGithubGraphFocus` 的 0/1/N 语义；Feature 多 branch → 并集（D4/F1）。
- **Acceptance**：表格驱动：branch/feature/PR/group/default/worktree/无关联 feature。
- **Tests**：必选。

### TS-3 — 历史查询窗口

- **Objective**：service/API 支持 cap / since-days / since-fork（PR `base...head`）；WIP 标志。
- **Modify**：`git-context-service`、`workspace-git`、transports/clients 按需。
- **Acceptance**：默认 200；切换窗口不丢 scope；截断可观测（既有 truncated 文案可演进）。
- **Tests**：fixture merge / fork / dirty。

### TS-4 — Lane 布局纯函数

- **Objective**：`layoutGithubCommitSwimlane` + 几何输出。
- **Acceptance**：线性 / 分叉 / merge / 多 tip 并集稳定可测；first-parent 模式有固定夹具。
- **Tests**：金样或结构断言（lane 索引、边连接）。
- **Risk**：若自研卡住，允许 spike 移植 graph-lab / SourceGit 算法思路（许可证核对后），仍保持纯函数边界。

### TS-5 — 竖直泳道 UI（替换 L2 默认）

- **Objective**：`GithubGraphOverlay` 在 `git-history` 渲染泳道表 + rails；虚拟化（≥200 行可滚）。
- **Modify**：Overlay + CSS modules + i18n。
- **Acceptance**：不再默认展示 depth-DAG 卡片；merge 轨可读；ref / PR 徽章可见（有数据时）。
- **Note**：pan/zoom 对「列表+轨」可能改为「列表滚动 + 可选水平轨区滚动」——实现时选更贴 SourceGit 的一种，并在 PR 说明。

### TS-6 — 双击进入 + 面包屑返回

- **Objective**：L0/L1 双击 → TS-2 → L2；Esc/面包屑上钻；viewport/选中记忆（D11）。
- **Acceptance**：与单击选中不冲突；关整个 Graph 仍走现有关闭控件（Esc 不直接关 Graph）。
- **Tests**：nav 状态机单测 + 组件冒烟可选。

### TS-7 — DetailPanel I/C/F

- **Objective**：选中泳道行 → 右侧 Panel：Information / Changes / Files；复用既有 commit detail API。
- **Modify**：`GithubGraphDetailPanel.tsx`。
- **Acceptance**：加载/错误/截断；与 TS-5 同屏。

### TS-8 — 工具条：窗口 + first-parent

- **Objective**：顶栏切换 D5 窗口与 D8 开关；立即重算 rows/layout。
- **Acceptance**：默认拓扑全图；开 first-parent 变干净主干叙事。

### TS-9 — 空态与截断 UX

- **Objective**：无关联 / 无 commit / 权限失败 / truncated 文案与 CTA。
- **Acceptance**：无假边；可返回总览或去绑定（绑定 UI 可链到父计划已有能力）。

### TS-10 — 退役 depth-DAG 默认路径

- **Objective**：删除或 `DEV` 开关隐藏 `layoutGithubCommitDag` 主路径；更新测试。
- **Acceptance**：主路径仅泳道；回归绿。

### TS-11 — 性能与回归

- **Objective**：200 commits 交互流畅；既有 partition/feature/checkout/PR 不回归。
- **Tests**：扩展 swimlane layout + scope + overlay 相关；父计划 git mutation 回归全绿。

### TS-12 —（非 MVP，占位）扩展事件

- CI / tag / agent 行或徽章；总览 sparkline；底栏 SourceGit 三 tab chrome。  
- **仅文档占位**，本里程碑不实现。

---

## 7. 里程碑

### M1 — Scoped vertical history（可演示主路径）

**Tasks**：TS-0 … TS-7、TS-9（最小空态）  
**交付**：双击 branch/feature/PR → 竖直泳道（默认 200、拓扑、多轨）→ 选 commit 看详情 → 返回总览不丢上下文。

### M2 — 窗口与叙事控件

**Tasks**：TS-3 补 since-days/fork、TS-8、TS-9 完善、TS-10、TS-11  
**交付**：窗口切换、first-parent、depth-DAG 退役、性能与回归。

### M3 — 扩展（另开或并入父计划 M3）

**Tasks**：TS-12  
**交付**：CI/tag/agent、可选缩略预览等——需新产品决策后再做。

---

## 8. 测试策略

| 层 | 内容 |
|----|------|
| Unit | scope 解析 0/1/N；nav reducer；lane layout（linear/merge/multi-tip/first-parent）；窗口参数规范化 |
| Git fixtures | merge、diverged tips、shared ancestor、dirty WIP、PR base...head、空 feature |
| UI | 双击 vs 单击；Esc 上钻不关 overlay；截断/空态文案 |
| Regression | partition/feature 横向布局；既有 commit detail fetch；父计划 mutation |

---

## 9. 风险与决策

| 风险 | 缓解 | 备选 |
|------|------|------|
| Lane 算法边角（octopus merge、大量 tip） | 单测夹具 + cap；lane 上限与滚动 | 短期降级为单轨+缩进（需显式产品同意，默认不走） |
| 列表 vs 现有 pan/zoom 世界坐标冲突 | L2 改用列表滚动模型，总览保留 pan/zoom | L2 仍用 transform world，行高固定手动虚拟化 |
| Feature 多 branch 轨过多 | 高亮关联轨 + 可折叠非关联轨（M2 可选） | 进入前强制选 branch（与已锁 F1 冲突，勿默认） |
| 时间列与拓扑序「看起来矛盾」 | UI 文案标明「拓扑序」；时间只是列 | M2 只读「按时间」切换（非本计划锁定） |
| 与父计划 History 卡片用户习惯变化 | 本计划明确替换默认 L2 | DEV 开关回看旧 DAG（TS-10） |

---

## 10. 验收标准（功能完成时）

1. 总览 L0/L1 **保持横向**；L2 为**竖直**泳道表，且为 History **默认** UI。  
2. **双击** branch / feature / PR / group / default / worktree 进入对应 scope；单击不进入。  
3. Feature 多 branch 以 **多轨一张图** 展示，关联轨可区分高亮。  
4. 行序为**真实 parent 拓扑**；禁止人造线性冒充历史。  
5. 默认窗口 = **200** tip-first commits；可切换天数 / 分叉起点（M2 交付切换）。  
6. First-parent 开关存在且**默认关**。  
7. 主表含 **commit + dirty 时 WIP**；PR 为徽章级；无 CI/tag/agent 主表行。  
8. 选中 commit 可在演进后的 DetailPanel 查看 Information / Changes / Files。  
9. Esc/面包屑上钻恢复 viewport 与原 node；`selectedCommitSha` 保留；不因此关闭整个 Graph。  
10. 无关联 feature 显示空态与引导，不画假边。  
11. 既有横向树、checkout/PR 等路径不回归；自动化覆盖 layout + scope 核心。

---

## 11. 建议实现顺序

```text
TS-0 ──► TS-1 ──► TS-2 ──► TS-3 (cap 路径)
                      │
                      ├──► TS-4 ──► TS-5 ──► TS-6 ──► TS-7 ──► TS-9
                      │
         M2: TS-3 (days/fork) ──► TS-8 ──► TS-10 ──► TS-11
```

**可并行**：TS-4 ∥ TS-2（布局 vs 解析）；TS-7 ∥ TS-5 后半（Panel 与列表壳）。  
**不可乱序**：TS-5 依赖 TS-4；TS-6 依赖 TS-1+TS-2；TS-10 在泳道成默认之后。

---

## 12. 实现对照表

| 类别 | 项 |
|------|-----|
| **Reuse** | `GraphOverlayFrame`、domain model、commit fetch、`GITHUB_HISTORY_COMMIT_CAP`、DetailPanel 数据面、focus 0/1/N 语义、tech tokens、i18n 模式 |
| **Modify** | `GithubGraphOverlay.tsx`、`GithubGraphDetailPanel.tsx`、`github-graph-nav.ts`、git commit 查询 API、i18n、父计划 T7 表述 |
| **Create** | `resolveGithubHistoryScope.ts`、`layoutGithubCommitSwimlane.ts`、（可选）`GithubHistorySwimlane.tsx` 子组件、本 Dev Plan |
| **Replace / retire** | `layoutGithubCommitDag` 作为 L2 默认 |
| **Do not add (MVP)** | 总览缩略条、竖向 Tree、泳道内 rebase GUI、webhook、agent 主表事件 |

---

## 13. 拍板快照（便于回溯）

```text
方向: 总览横 + 时序竖
1 进入: A 双击
2 缩略: A 无
3 层级: A 重做 L2
4 多 branch: F1 多轨一张图 + 各 node scope 按 §1.1
5 窗口: D 默认 200，可切天数/分叉
6 Lane: C 按 Branch + Feature 高亮
7 行序: A 拓扑
8 First-parent: A 有，默认关
9 事件: commit + WIP；PR 徽章；其余二期
10 详情: 演进 DetailPanel I/C/F
11 返回: 上钻 + viewport/选中/sha 记忆
12 MVP 不做: 写操作 GUI、无限历史、webhook、横主阅读、agent 全可视化、总览改竖
13 验收: §4.3 / §10
```

---

**下一步**：本 Dev Plan 审阅通过后，按 §11 从 TS-1/TS-2/TS-4 起实现（先契约与纯函数，再 Overlay UI）。
