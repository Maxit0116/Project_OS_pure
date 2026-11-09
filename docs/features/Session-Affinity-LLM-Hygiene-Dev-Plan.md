# Session Affinity + LLM Hygiene / Route Dev Plan

**状态**：M0–M4 implemented（2026-11-09）— prefs 三档 + L0 Affinity 收敛 + 日批/Route L1（balanced/accurate 门闩与 refine）已落地；M5 golden/打磨仍 Planned。  
**产品名**：Session Matching Intelligence / 会话匹配智能（代码前缀 `sessionAffinity` / `affinityMode`）  
**产品定位一句话**：用统一的启发式亲和层（L0）保证 Session Graph 与 Chat sidebar 路由「先收窄、再决策」；可选 LLM 复核层（L1）按三档 mode 提升整理 / 清理 / 智能路由的精确率，且永不静默删改。

**权威邻居**：

| 文档 | 关系 |
|------|------|
| [`Session-Graph-Canvas-Dev-Plan.md`](./Session-Graph-Canvas-Dev-Plan.md) | Session Graph 画布与 card strip；本计划管「跨卡整理 / 清理 / 匹配」，不改 strip 策展语义 |
| [`Session-Navigator-Dev-Plan.md`](./Session-Navigator-Dev-Plan.md) | **session 内** turn 导航；本计划是 **跨 session** 匹配与卫生 |
| [`Chat-Modes-Cursor-Parity-Dev-Plan.md`](./Chat-Modes-Cursor-Parity-Dev-Plan.md) | Composer / sidebar 发送路径；智能路由挂在发送前，不新增一级 ChatMode |
| [`Context-Engineering-Dev-Plan.md`](./Context-Engineering-Dev-Plan.md) | digest / inherited context；本计划消费 `responsibility` / `refs` / strip，不重做 digest 协议 |
| [`backend/Observability-Model-Gateway-Dev-Plan.md`](./backend/Observability-Model-Gateway-Dev-Plan.md) | L1 走现有 ModelGateway；复用 settings model profile |

**实现锚点（规划）**：

| 层 | 预期落点 |
|----|----------|
| 契约 L0 | 新建 `projectos/contracts/session-affinity.ts`；收敛 route/tidy 共用打分；sweep 规则仍以 `session-sweep.ts` 为主但共享 confidence 类型 |
| 契约 L1 | `projectos/contracts/session-affinity-llm.ts`（mode、judge schema、预算常量） |
| 服务 | `projectos/services/session-affinity/`（`refineTidyPlan` / `refineSweepPlan` / `refineRouteSuggestion` + gateway 调用） |
| Prefs | `sessionSweep` prefs 增 `affinityMode`；route prefs 只读同一 mode（或薄封装同步），避免两套心智 |
| Store | `sessionSweepStore.runHygieneCheck` 插入 L1；`sessionRouteStore` 发送前插入 L1 |
| Settings UI | `SessionSweepSettingsSection`：三档 segmented control + 当日调用摘要 |
| Review UI | Tidy / Sweep sheet 展示可选 `rationale`；默认勾选策略随 mode 变化 |
| i18n | `settings.sessionAffinity.*` / `chat.sessionGraph.affinity.*`（en + zh） |

---

## 0. 核心诉求（讨论锁定）

| # | 诉求 | 用户要回答的问题 | 本计划对应 |
|---|------|------------------|-----------|
| 1 | Session Graph 必须干净易懂 | 子 node 对话会不会脏进 Misc？同 feature 会不会散成多根？ | 前置：fork 子节点不进 Misc；本计划：tidy 合并散点 |
| 2 | 每日自动整理 / 清理要准 | 什么算 low-value？什么该挂回主线？ | L0 规则透明 + L1 复核中间带 |
| 3 | 整理要对到「正确的」session | 谁是 anchor？attach / absorb / rehome？ | 统一 affinity + cluster judge |
| 4 | Chat sidebar 智能路由要同源思维 | 发送前该 stay / switch / branch 到哪？ | 与 tidy 共用 L0；L1 可选复核 |
| 5 | 用户可控成本与精度 | 要不要花 token？性价比还是更准？ | Settings 三档 `off` / `balanced` / `accurate` |
| 6 | 不静默破坏图 | 自动跑完会不会直接删？ | 只提名；确认后执行；uncertain 宁缺毋滥 |

**价值链**：

```text
每日到点 / 手动 Scan
  → L0 Heuristic（route 同款亲和 + sweep 规则）
  → （mode≠off）L1 LLM Judge：confirm / reject / uncertain
  → Pending Tidy → Pending Sweep（tidy 成员排除）
  → 用户确认 → 改图 / 删节点 / 可选 summarize

Composer 输入
  → L0 Route suggestion
  → （mode≠off 且需复核）L1 Ranker
  → preview 或 high-confidence autoApply → 用户仍手动 Send
```

**一句话验收心智**：用户打开 Session Graph 时觉得「同 feature 聚在一起、垃圾不挡眼、Misc 不掺子 node 对话」；发送前路由与每日整理「像同一个人在判断」，且 Settings 能一眼选对成本档。

---

## 1. 产品分界（硬规则）

### 1.1 三件事，一个智能层

| 表面 | 职责 | 输入 | 输出 |
|------|------|------|------|
| **Smart Route** | 发送前匹配 session | 当前 prompt × 全 sessions | stay / switch / branch |
| **Continuity Tidy** | 同 feature 散点归拢 | sessions × sessions | attach / rehome / absorb clusters |
| **Low-value Sweep** | 提名可删 / 可重组 | 单 session 质量信号 | delete / reorganize（+ 未来 compress） |

三者共享 **L0 Affinity 信号族**（responsibility / refs / intent / title）；Sweep 另加质量规则（misc / trivial / short / quiet…）。  
L1 是可选复核，不是第三条独立产品。

### 1.2 与现有开关的关系

| 开关 | 含义 |
|------|------|
| Route / Tidy / Sweep **enabled** | 功能开没开 |
| **`affinityMode`** | 智能强度：`off` \| `balanced` \| `accurate` |
| `allowAbsorb` | 是否允许 absorb 动作（与 mode 正交） |
| `autoApplyHighConfidence` | Route 高置信是否跳过 preview（L1 可收紧/放宽，见 §4） |

功能关时 mode 无效；mode=`off` 时功能仍纯启发式可用。

### 1.3 明确非目标（v1）

- 不用 LLM **全库扫描**全文 transcript
- 不在 hygiene 路径 **静默删除 / 静默 absorb**
- 不把 L1 做成第三个并列「AI 整理 Agent」会话
- 不在 v1 引入独立向量库 / 长期 embedding 索引（accurate 的补召回仍基于 L0 信号）
- 不改变 Session Graph card strip 策展上限与 Misc 托盘交互骨架
- 不把 fork 子节点自动丢进 Misc（已有契约修复；本计划依赖之，不再回退）

---

## 2. 锁定的产品决策

| # | 决策点 | **锁定默认** | 备选（实现前可改文档） |
|---|--------|--------------|------------------------|
| D1 | Mode 集合 | `off` \| `balanced` \| `accurate` 三档 | 仅 on/off（否决：无法表达性价比） |
| D2 | Mode 作用域 | **Route + Tidy + Sweep 共用一个 mode** | 三处独立（否决：Settings 过碎） |
| D3 | Prefs 存放 | 主存在 `sessionSweep` prefs 的 `affinityMode`；Route Settings 同组展示只读/同写 | 复制进 route prefs |
| D4 | 默认档 | **`balanced`**；无 model profile / 演示 fixture → 运行时降级 `off` | 默认 `off` |
| D5 | L0 是否保留 | **永远先跑 L0**；L1 只看候选子集 | L1 直接扫全库（否决） |
| D6 | Judge 输出 | 结构化 `confirm` \| `reject` \| `uncertain` + 短 `rationale` | 自由文本（否决） |
| D7 | uncertain 策略 | **不提名 / 不 autoApply**（宁缺毋滥） | 降级展示给用户 |
| D8 | 失败降级 | 超时、坏 JSON、无 key → **静默回退 L0**，不打断 hygiene / 发送 | 弹错误 toast（仅 accurate 可加轻提示） |
| D9 | 卡片输入 | title / responsibility / top refs / 最近 ≤3 条 user 首行 / L0 score+reasons | 全文 messages（否决） |
| D10 | 日预算 | balanced：sweep ≤15 judges、tidy = 过门禁 cluster 数；accurate：更高硬顶（实现常量，Settings 先进阶隐藏） | 无上限 |
| D11 | Route 延迟 | balanced 仅 medium/边界；超时预算 ~600ms；超时用 L0 | 阻塞发送直到 LLM 返回（否决） |
| D12 | Review 默认勾选 | `off`：维持现状；`balanced`/`accurate`：仅 `confirm+high` 默认勾选 | 全选 |

补充锁定：

| # | 决策 | 锁定 |
|---|------|------|
| D13 | Compress | accurate 可将「短但相关」的 sweep 候选改标为 **交给 tidy / keep**，v1 不新增第四种用户可见 action 名（映射到 keep 或排除出 delete） |
| D14 | Anchor 改写 | accurate 允许 LLM 指定更好的 `anchorSessionId`；balanced 只 confirm/reject 整簇 |
| D15 | 缓存 | 以 cluster fingerprint / sessionId+contentHash / promptHash 为键；snooze 期内复用 judgment |
| D16 | 观测 | 本地记当日 `llmCallCount`（Settings 一行摘要）；不强制上传 |

---

## 3. 现状与差距

### 3.1 已有能力

| 能力 | 现状 | 锚点 |
|------|------|------|
| 每日调度 | 每分钟 poll，按 `dailyTime` 一天一轮；先 tidy 后 sweep | `useSessionSweepScheduler` / `runHygieneCheck` |
| Tidy L0 | Jaccard + refs + time；并查集 cluster；attach/rehome/absorb | `session-continuity.ts` |
| Sweep L0 | misc/trivial/short/explore/no_decisions/quiet；delete/reorganize | `session-sweep.ts` |
| Route L0 | 同族 Jaccard；stay/switch/branch + confidence + autoApply | `session-route.ts` |
| 人工确认 | Tidy / Sweep center sheets；snooze | `SessionTidyReviewSheet` / `SessionSweepReviewSheet` |
| Settings | 功能开关、时间、snooze、absorb、route autoApply | `SessionSweepSettingsSection` |
| Fork→Misc 修复 | 图上子节点不再因短 prompt 进 Misc | `resolveChatSessionClassification` / apply 护栏 |

### 3.2 差距

1. Route / Tidy **打分逻辑重复**，阈值漂移风险高。  
2. 检测 **纯启发式**，中间带误并 / 误删 / 误路由无复核。  
3. 无 **统一 confidence** 贯穿三场景。  
4. Settings **无成本/精度档位**。  
5. Review UI **无机器理由**（用户只能看到 L0 reason 枚举）。

---

## 4. 架构设计

### 4.1 双层管线

```text
                ┌──────────────────────────┐
                │  L0 Session Affinity     │
                │  + Sweep quality rules   │
                └────────────┬─────────────┘
                             │ candidates + score + reasons + confidence
                             ▼
              affinityMode === 'off' ──► 直接 pending / route UI
                             │
              balanced / accurate
                             ▼
                ┌──────────────────────────┐
                │  L1 LLM Judge / Ranker   │
                │  (ModelGateway + schema) │
                └────────────┬─────────────┘
                             │ confirm / reject / uncertain (+ optional rewrite)
                             ▼
                      pending review / route suggestion
```

### 4.2 L0 公共 Affinity（M1）

从 `session-route.ts` / `session-continuity.ts` 抽出：

- `tokenize` / `jaccard` / `sessionRefSet` / `sessionTextBlob`（或等价）
- `scoreSessionPair(a, b)` → `{ score, reasons }`（tidy）
- `scorePromptAgainstSession(prompt, record)` → `{ score, reasons }`（route）
- 共享 reason 枚举超集；场景可裁剪
- 统一 `AffinityConfidence = 'high' | 'medium' | 'low'` 映射函数（基于 score + gap + 强信号）

**原则**：行为与现网 golden tests 对齐；重构先绿再调参。

### 4.3 三档 Mode 行为矩阵

| | `off` | `balanced` | `accurate` |
|--|-------|------------|------------|
| **Route 调用** | 无 | 仅 `medium` 或 top2 分差过小 | `medium`+`high` 可复核；允许 L0 邻域补 1–2 候选 |
| **Tidy 调用** | 无 | 仅 cluster score ∈ 模糊带（建议 ≈ `[minPair, minPair+0.16]`） | 所有过门禁 cluster；可改 anchor / 踢卫星 |
| **Sweep 调用** | 无 | 仅 borderline（如单 reason、`short_oneshot`、`no_decisions`）；硬空壳可跳过 LLM | 几乎全部非硬排除候选；可将「相关短会话」改为 keep |
| **模型** | — | 轻量 / 便宜 profile | 更强 profile（可同一 gateway，不同 temperature/maxTokens） |
| **Route autoApply** | 现逻辑 | 需 L0 high；若走了 L1 则需 L1 confirm+high | L0+L1 双高才 autoApply（更稳） |
| **日预算** | 0 | 紧 | 松但仍有硬顶 |
| **失败** | — | 回退 L0 | 回退 L0；可选一次轻提示 |

### 4.4 L1 结构化契约（草案）

```ts
type AffinityMode = 'off' | 'balanced' | 'accurate'

type AffinityJudgeDecision = 'confirm' | 'reject' | 'uncertain'

interface AffinityJudgeResult {
  decision: AffinityJudgeDecision
  confidence: 'high' | 'medium' | 'low'
  rationale: string // ≤ 120 chars, user-visible
  // tidy
  anchorSessionId?: string
  memberActions?: Array<{
    sessionId: string
    action: 'attach' | 'rehome' | 'absorb' | 'leave'
  }>
  // sweep
  sweepAction?: 'delete' | 'reorganize' | 'keep'
  // route
  routeAction?: 'stay' | 'switch' | 'branch'
  targetSessionId?: string
  forkMessageId?: string
}
```

Zod 校验失败 → 视同 uncertain → 按 D7/D8 处理。

### 4.5 服务边界

- **contracts**：纯函数、schema、阈值常量、无 I/O  
- **services/session-affinity**：拼 prompt、调 gateway、解析、计数预算  
- **workbench stores**：编排；mode=`off` 时不 import 热路径重依赖（或动态 import）  
- **禁止**在 `session-continuity.ts` / `session-sweep.ts` 内直接调模型（保持可单测、可 off）

---

## 5. 交互流程

### 5.1 每日卫生（已有骨架 + L1）

```text
Scheduler tick / Settings「立即扫描」
  → shouldRun? 
  → loadAllSessionRecords
  → L0 tidy plan
  → refineTidy(mode)           // 过滤 reject；accurate 可改写
  → L0 sweep plan (exclude tidy ids)
  → refineSweep(mode)
  → persist pending + 分条 notify
  → 用户点 badge / Settings 打开 Tidy sheet → 确认
  → 再打开 Sweep sheet → 确认
```

**Review sheet 增量**：

- 每条候选可显示 `rationale`（无则只显示 L0 reasons）
- 默认勾选：D12
- 角标可区分「LLM confirmed」vs「heuristic only」（克制，一行小字即可）

### 5.2 Composer 智能路由

```text
用户输入（debounce 已有则复用）
  → L0 suggestion
  → needsL1(mode, suggestion)?
        no  → 现 UI
        yes → refineRoute（超时回退）
  → autoApply? 切换/分支预览
  → 用户 Send（路由不代发）
```

### 5.3 Settings

在 `SessionSweepSettingsSection` 顶部或独立 `SettingsGroup`：

1. **Segmented control**：无 LLM / 性价比 / 准确优先  
2. 一句话描述随档切换  
3. `Today: N LLM calls`（balanced/accurate）  
4. 现有 Route / Sweep / Tidy 开关保留，文案注明「受上方智能档位影响」

---

## 6. 里程碑

### M0 — 契约与 prefs 骨架（无行为变化）

- [x] 定义 `AffinityMode`、prefs 字段、normalize 默认 `balanced`
- [x] Settings UI 三档可切换并持久化（即使后端尚未调用 LLM）
- [x] i18n en/zh
- [x] 文档状态改为 M0 done

**验收**：切换 mode 刷新后仍在；不影响现有 tidy/sweep/route 结果。

### M1 — L0 Affinity 收敛

- [x] 新建 `session-affinity.ts`；route + tidy 改用共享打分
- [x] 统一 confidence 映射；现有单测全绿（允许微调断言分数但语义不变）
- [x] 补「公共层」单测：同责任/同 ref/标题重叠

**验收**：关闭 LLM（mode=off）时，路由与整理行为与重构前一致（golden / 快照）。

### M2 — L1 日批（Tidy + Sweep，`balanced`）

- [x] `services/session-affinity` judge 实现 + Zod
- [x] `runHygieneCheck` 接入；预算与缓存
- [x] Review sheet 显示 rationale；默认勾选策略
- [x] mode=`off` 路径零 LLM 调用（测试断言）
- [x] 无 profile 时自动跳过 L1

**验收**：用 fixture 构造「L0 误并 / 误删」中间带 → balanced 下 LLM reject 后不进 pending；confirm 的进 pending 且带理由。

### M3 — L1 Route（`balanced`）

- [x] Composer 路径 borderline 复核 + 超时回退
- [x] 与 `autoApplyHighConfidence` 组合测清
- [x] 延迟可感知时不阻塞输入框（suggestion 异步更新）

**验收**：medium 匹配可被 L1 纠正为 stay/switch；超时后行为等于 L0。

### M4 — `accurate` 增强

- [x] Tidy：改 anchor / 踢卫星 / 全量过门禁 cluster 复核
- [x] Sweep：全候选复核 + keep 改写（防误删相关短会话）
- [x] Route：high 也复核；轻量补召回；双高才 autoApply
- [x] 更高日预算常量 + Settings 摘要

**验收**：accurate 比 balanced 召回更多 borderline 修正；仍无静默删除；超预算熔断后剩余走 L0。

### M5 — 打磨与评测集（可选同期）

- [ ] `couple_recording` 风格 golden：期望 tidy clusters / sweep keep-delete / route cases
- [ ] 当日 call 计数与简单调试日志（DEV）
- [ ] 文案与空态：无 key、预算用尽、uncertain 清空

---

## 7. 测试计划

| 层 | 内容 |
|----|------|
| Unit | L0 打分回归；confidence 映射；mode 门闩（何时该调用 L1） |
| Unit | Judge JSON 解析 / 坏响应 → uncertain |
| Unit | refineTidy / refineSweep：reject 剔除、confirm 保留、accurate 改写 |
| Store | `runHygieneCheck` mode=off 不调 gateway；balanced 调次数 ≤ 预算 |
| UI | Settings 三档持久化；sheet 展示 rationale |
| Manual | 真实项目：短子 node 不进 Misc；散点 tidy；误删候选被 keep |

---

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| LLM 延迟拖慢发送 | Route 仅异步 suggestion；硬超时回退 L0 |
| Token 费用 | 卡片截断 + 日预算 + balanced 默认 + 缓存 |
| 误 reject 丢掉真集群 | uncertain/reject 只影响提名；用户仍可手动拖拽挂载 |
| 误 confirm 仍可能错 | 强制 review 确认；默认只勾 high |
| 与 fork→Misc 修复冲突 | L0/L1 均不得再把 `parentSessionId+graphId` 会话标进 Misc 清理优先项（硬排除或降权） |
| 重构 L0 行为漂移 | M1 先锁测试再抽公共层 |

---

## 9. 实现顺序建议（开发时）

1. **M0** prefs + Settings（用户可见、可讨论文案）  
2. **M1** L0 抽取（降低后续双写）  
3. **M2** 日批 L1（价值最大、延迟不敏感）  
4. **M3** Route L1  
5. **M4** accurate  
6. **M5** golden / 打磨  

每完成一档更新本文 **状态** 行与里程碑 checkbox。

---

## 10. 开放问题（实现前若变更须改文档）

1. accurate 是否允许单独指定「更强 model profile」，还是始终跟全局默认 profile？  
2. Route L1 是否在 Ask 以外的 mode（Plan/Agent）同样启用？（建议：**是**，跨 mode 一致）  
3. 日预算用尽时 Settings 是否展示「升级到 accurate 也无效，明日重置」文案？  
4. `compress` 是否在 v1.1 升级为用户可见第三动作，还是继续映射为 keep？

**当前默认**：1=跟全局 profile + accurate 提高 maxTokens；2=全 mode；3=要；4=v1 映射 keep。
