# Marketplace Installed → Compose Specialized Agent — DevPlan

**状态**：Implemented（2026-11-05）— A0–A4 已落地（契约 `assembleWorkforceAgent`、Installed Compose bar、Scope Consent、可勾选 Assembly Card、Catalog 扩搜 + 确认时 install-missing、创建后 CTA）。A5（多选预填 / DraftCard 勾选 UI 统一）仍可选。  
**范围**：在 Capability Marketplace Overlay 的 **Installed** 视图中，提供「基于本项目能力库（可选扩搜 Catalog）用自然语言装配专职 Agent」的第三创建入口；与 Chat / Loop 既有 `create_agent` 合流到同一 `WorkforceAgentDraft` / `createWorkforceAgent`。  
**产品定位一句话**：Installed 是「我的能力库工作台」——看见库里有什么，用一句话编成岗位，经可勾选卡片确认后再创建；外搜必须显式同意，安装 ≠ 启用 ≠ permissions。

**权威交叉引用**：

| 文档 | 关系 |
|------|------|
| [`Capability-Marketplace-Dev-Plan.md`](./Capability-Marketplace-Dev-Plan.md) | Installed 总览、六类 install/uninstall、P6 URL/Pack；本计划**不重做** Catalog |
| [`Specialized-Agent-Workforce-Dev-Plan.md`](./Specialized-Agent-Workforce-Dev-Plan.md) | 专职 Agent CRUD、Draft Card、Chat/Loop Create；本计划增加 **Installed 装配入口 + 提案契约** |
| [`Loops-Graph-Agent-Wiring-Dev-Plan.md`](./Loops-Graph-Agent-Wiring-Dev-Plan.md) | 画布虚线装配与本计划 bindings **同一真相**；装新能力仍走 Marketplace，不在 Graph 内重做 Consent |
| [`Agent-Harness-Dev-Plan.md`](./Agent-Harness-Dev-Plan.md) / Skills / MCP | 绑定 skillIds / mcpServerIds；runtime 注入沿用 Workforce light |
| [`backend/Security-Governance-Dev-Plan.md`](./backend/Security-Governance-Dev-Plan.md) | 外搜 SSRF / 验签；community 默认审慎；不写 permissions |
| [`Agent-Harness-Eval-Checklist.md`](./Agent-Harness-Eval-Checklist.md) | 冒烟条目见本文 §7 |

**已有实现锚点（勿重复建设）**：

- Overlay Installed：`workbench/src/components/Marketplace/MarketplaceOverlay.tsx` + `marketplaceDependencies.buildInstalledMarketplaceEntries`
- Workforce：`contracts/agent-workforce.ts`、`services/workforce-agent-draft.ts`（启发式 draft）、`AgentDraftCard.tsx`、`draftWorkforceAgent` / `createWorkforceAgent` API
- Marketplace install：各 kind `install*FromCatalog` / git-url；MCP community 默认 `enabled: false`

---

## 0. 核心诉求（讨论锁定）

| # | 诉求 | 本计划对应 |
|---|------|------------|
| 1 | Installed 分门别类展示已装能力，适合作为「看库编岗位」入口 | Installed 底部 Compose prompt + 装配流 |
| 2 | 用户用 prompt 描述想要的专职 Agent | 提交 → 装配提案（非直接入库） |
| 3 | 系统匹配本地库已有 capabilities | `scope=local` 默认；复用/扩展 `draftWorkforceAgent` 匹配面 |
| 4 | 弹出卡片展示将分配哪些能力；可勾选、确认、取消 | **Assembly Card**（可勾选绑定列表） |
| 5 | 输入后先询问是否允许去 Marketplace / 网上找更多能力 | **Scope Consent** 模态；同意后提案可混已装 + 未装 |
| 6 | 未装项在确认创建时再安装；不自动 enable / 不写 permissions | 确认流水线：Install missing → Create Agent |

**价值链**：

```text
Installed 能力库（可见）
        │
        ▼
  Compose prompt（NL）
        │
        ▼
  Scope Consent（仅本地 / 允许扩搜 / 取消）
        │
        ▼
  Assembly Proposal（角色 + 可勾选 bindings）
        │
        ├── 取消
        ├── 仅安装缺的（可选高级）
        └── 确认创建 → install missing → createWorkforceAgent
                    → 可选「在 Chat 选用」
```

---

## 1. 产品决策

### 1.1 第三入口，不另起 Agent 系统

| 入口 | 语境 | 默认匹配范围 |
|------|------|----------------|
| Chat Mode → Create Agent… | 对话中编角色 | 本地 skills + MCP（现有 heuristic） |
| Loop → `create_agent` | 图上编角色 | 同上 |
| **Marketplace Installed Compose** | **能力库装配** | **本地全库可视化 + 可选 Catalog 扩搜** |

三者最终都写入同一 workforce `AgentDefinition`。Installed 入口的差异化：**库可见、外搜许可、混合已装/未装勾选**。

### 1.2 三步分离（不变量）

1. **Match / Propose** — 只生成提案，不写盘。  
2. **Install missing**（可选）— 仅对用户勾选的未装项执行现有 marketplace install。  
3. **Create Agent** — `createWorkforceAgent`；不自动 `enabled: true` MCP；不写 `permissions.json`。

### 1.3 外搜许可

- 提交 prompt **之后**、匹配 **之前**，强制 Scope Consent。  
- **仅用本地库**（默认推荐）：只读项目已装 Skill / MCP /（可选 Rules 元数据）。  
- **允许扩展搜索**：在验签 Catalog（及产品允许的 git-url / pack 通道）内找候选；**不是**开放网页爬虫。UI 文案须写清「Marketplace 目录 / 受控 URL」，避免用户以为任意上网。  
- **取消**：关闭同意框，保留 prompt 文本。  
- 「本项目记住选择」为可选项；**默认不记住**。

### 1.4 Capability → Agent 绑定映射

| Kind | 进 Agent config？ | 卡片默认 |
|------|-------------------|----------|
| **Skill** | 是 → `skillIds` | 高置信默认勾选；上限例如 5 |
| **MCP** | 是 → `mcpServerIds` | 高置信可勾；**community 默认不勾** |
| **Rules** | v1：**不**直接绑 runtime；可「建议安装」或写入 instructions 摘要 | 默认不勾绑定；可「建议安装」分区 |
| **Workflow / Stencil** | v1：**不**绑 runtime | 「仅建议安装」折叠区，默认不勾 |
| **Agent pack** | 不用于装配源（避免套娃） | 不出现在绑定列表 |

### 1.5 装配器身份

对用户呈现为「帮你编专职 Agent 的助手」；实现上是 **产品内置 Compose 流程**（API + 启发式 / 可选模型），**不要求**先安装某个 marketplace meta-agent。禁止把装配流程做成会偷偷改项目权限的自主 Agent 循环。

### 1.6 明确不做

| 项 | 原因 |
|----|------|
| 未同意即 Catalog / 网上搜索 | 隐私与信任 |
| 确认前自动安装 | 提案 ≠ 安装 |
| 创建时自动 enable MCP / 写 permissions | 安全红线（与 MMP/CMP 一致） |
| 把 Installed 变成通用 Chat | prompt 只服务「编 Agent」 |
| 任意前端组件库 URL → Skill/Stencil 塞进 Agent | 与 Stencil/P6 定位冲突 |
| 替换 Chat/Loop Create Agent 入口 | 三入口并存 |
| v1 强制 LLM agent-spec compiler | 先启发式 + 可编辑卡片；模型增强可后期开关 |

---

## 2. UX 全流程

### 2.1 页面形态（Installed）

```text
┌─ Marketplace Overlay ────────────────────────────┐
│  [Catalog] [Installed●]              刷新 / 关闭  │
│  能力库摘要：Skills N · MCP N · Rules N · …      │
│  ── 现有按 kind 分组的已装列表 ──                 │
│                                                   │
│  ┌─ Compose specialized agent ─────────────────┐ │
│  │  根据上方能力库，描述你想要的专职角色…       │ │
│  │  [__________ prompt _______________] [发送]  │ │
│  └──────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

- 空库：提示先去 Catalog 安装，或在 Consent 选「允许扩展搜索」。  
- 可选增强（v1.5+）：列表多选若干已装项 →「用选中项创建 Agent」预填 bindings，跳过盲匹配。

### 2.2 阶段机

```text
idle
  → (submit prompt) consent
  → local | expand | abort→idle
  → matching (cancellable)
  → proposal (Assembly Card)
       → cancel → idle
       → install_only → installing → proposal/idle
       → confirm → installing_missing → creating → success → idle
```

### 2.3 Scope Consent 模态

- 标题：是否允许到 Marketplace 寻找更多能力？  
- 正文：默认只用本项目已安装项；若允许，将检索验签目录中的候选，**不会自动安装或启用**。  
- 按钮：**仅用本地库** / **允许扩展搜索** / **取消**。

### 2.4 Matching 加载态

- 「正在匹配本地能力…」  
- 若 expand：「正在检索 Marketplace…」  
- 可取消 → 回 idle（保留 prompt）。

### 2.5 Assembly Card（核心确认面）

叠在 Installed 内容区（或右侧栏），**不关闭 Overlay**，便于对照库。

**分区**：

1. **角色摘要**（可编辑）：displayName、roleLabel、instructions（可折叠）。  
2. **将绑定的能力**（可勾选）：按 Skill / MCP 分组；每行含勾选、名称、kind 徽章、状态（Installed / Not installed · curated|community）、短 rationale。  
3. **仅建议、不绑定**（默认折叠）：Workflow / Stencil / Rules 安装建议。  
4. **风险条**：community MCP；同名 Agent；依赖连带（勾 Skill 建议勾其 dependsOn MCP）。  
5. **页脚**：**取消** | **仅安装缺的**（可选） | **创建 Agent**。

**默认勾选策略**：

- 本地高置信 Skill：勾选；总数封顶。  
- 本地高置信 MCP：勾选；community **不勾**。  
- Catalog 未装 curated：可进入「建议」；expand 时 Top-N curated 可默认勾「安装并绑定」。  
- Catalog community：只展示，默认不勾。  
- 已装与未装去重：同一逻辑能力 **已装优先**。

**行内操作**：打开现有 Marketplace Detail；「从库中添加」打开小型已装 picker。

### 2.6 确认创建流水线

1. 收集勾选 bindings。  
2. 对 `action=install-then-bind` 且未装：依次调用现有 install API；MCP 保持 disabled + provenance。  
3. 安装失败的行标红；用户可去掉勾选后继续，或中止。  
4. `createWorkforceAgent({ draft })`；draft.skillIds / mcpServerIds 仅含最终已装且勾选的 id。  
5. Toast 成功；CTA：**在对话中使用**（关 Overlay + 绑 `activeAgentDefinitionId`）/ **留在 Installed**。

### 2.7 与现有 AgentDraftCard 的关系

- v1 可新增 `AgentAssemblyCard`（Installed 专用），内部字段对齐 `WorkforceAgentDraft`。  
- v1.5+ 建议把 Chat/Loop 的 `AgentDraftCard` Skills/MCP **只读 chip** 升级为同一套可勾选绑定列表，避免三套 UI。

---

## 3. 契约与 API（建议）

### 3.1 新契约文件（建议）

`projectos/contracts/agent-assembly.ts`（名称可调）：

```text
AssemblySearchScope = "local" | "local_and_catalog"

AssemblyBindingAction = "bind" | "install_then_bind" | "suggest_install_only"

AssemblyBindingKind = "skill" | "mcp" | "rules" | "workflow" | "stencil"

AssemblyBinding {
  kind, id, name, trustTier?,
  source: "installed" | "catalog" | "git-url",
  installed: boolean,
  selected: boolean,          // 默认勾选状态
  action: AssemblyBindingAction,
  rationale?: string,
  listingId?: string,         // catalog 安装用
  risk?: "community_mcp" | ...
}

AssembleWorkforceAgentRequest {
  projectId, prompt,
  scope: AssemblySearchScope,
  /** 可选：用户在列表多选预填的已装 id */
  seedSkillIds?, seedMcpServerIds?
}

AssembleWorkforceAgentResult {
  draft: WorkforceAgentDraft,   // 与现网 create 对齐
  sourcePrompt: string,
  scope: AssemblySearchScope,
  bindings: AssemblyBinding[],
  gaps?: string[],              // 意图提到但未匹配到的点
  rationale?: string
}
```

`WorkforceAgentDraft` **不必**塞满未装 listing；未装项只活在 `bindings` 里，确认安装成功后再写入 draft ids。

### 3.2 API

| 方法 | 职责 |
|------|------|
| `assembleWorkforceAgent(req)` | 本地匹配 ± catalog 检索 → `AssembleWorkforceAgentResult`（不写盘） |
| 现有 `install*FromCatalog` / git-url | Card 确认时按需调用 |
| 现有 `createWorkforceAgent` | 最终入库 |

可在 v1 将 `assembleWorkforceAgent` 实现为对 `draftWorkforceAgentFromPrompt` 的扩展包装（增加 MCP/catalog bindings 元数据），避免两套启发式分叉过久。

### 3.3 匹配启发式（v1）

扩展 [`workforce-agent-draft.ts`](../../projectos/services/workforce-agent-draft.ts)：

- 继续：role / displayName / instructions / skill name·id token / MCP name·id。  
- 新增：遍历 Installed 全量（含非 marketplace 本地 skill）；可选读 catalog listings（name/description/tags）做 token 重叠。  
- 打分 → selected 阈值与上限；community MCP selected=false。  
- 模型增强：**延期**为可选开关，失败回退启发式。

---

## 4. UI / Store 切片

| 层 | 路径 / 职责 |
|----|-------------|
| Overlay | `MarketplaceOverlay` Installed：Compose bar、Consent 模态、matching 态、挂载 Assembly Card |
| Card | `AgentAssemblyCard.tsx`（新建）或增强 `AgentDraftCard` |
| Store | `assembleWorkforceAgent`、assembly 会话态（prompt/scope/result/busy）、confirm 流水线 |
| i18n | `chat.marketplace.compose*` / `workforce.assembly*` |
| 样式 | 贴合 Marketplace Overlay tech tokens；底部 bar 不抢 Catalog tabs |

---

## 5. 里程碑与切片

| Phase | 主题 | 合格线 |
|-------|------|--------|
| **A0** | 本文档 + 邻居互链 + Eval 预留 | ✅ |
| **A1** | 契约 `assembleWorkforceAgent` + 本地匹配扩展 | ✅ `agent-assembly.ts` + `workforce-agent-assemble.ts`；单测 |
| **A2** | Installed Compose bar + Consent + local-only Card | ✅ Overlay Installed 底栏 + Consent + `AgentAssemblyCard` |
| **A3** | Catalog 扩搜 + 混合未装 bindings + 确认时 install | ✅ `scope=local_and_catalog`；confirm 流水线 install-then-create |
| **A4** | 风险文案、成功 CTA「在对话中使用」、Eval | ✅ community 风险条；Use in chat CTA；Eval 条目 |
| **A5**（可选） | 多选预填；与 AgentDraftCard 勾选 UI 统一；记住 scope 偏好 | ⬜ 延期 |

**建议执行顺序**：A0 → A1 → A2 → A3 → A4；（A5 按需）

---

## 6. 明确延期

| 项 | 原因 |
|----|------|
| 开放 Web 爬虫式「网上找能力」 | 安全与质量；仅 Catalog / 受控 URL |
| 装配流程内自主多轮 Agent 改仓库 | 与「确认卡片」产品形态冲突 |
| Rules 强制注入 harness 绑定模型 | 需单独设计；v1 建议安装即可 |
| Workflow/Stencil 绑进 Agent runtime | 无执行语义 |
| 按 Agent 裁剪 MCP tool 子集 / permissions 覆盖 | Workforce 已延期项 |
| 强制 LLM compiler | 启发式足够支撑 v1 |

---

## 7. 测试与验收

### 7.1 自动化

- Zod：`AssembleWorkforceAgentRequest/Result` round-trip。  
- 本地匹配：给定 prompt + fixture skills/MCP → 预期 selected ids。  
- Confirm 流水线（服务层或 store 测）：勾选未装 → mock install → create；取消不写盘。  
- 安全：assemble 本身不调用 enable MCP / 不写 permissions。

### 7.2 人工冒烟

1. Installed 有若干 Skill/MCP → Compose → 仅本地 → 卡片勾选正确 → 创建 → Picker 可见 → Chat 可选用。  
2. Consent 选取消 → 不进入 matching。  
3. 允许扩搜 → 卡片出现 Not installed curated → 确认 → 先装再创建；MCP 仍 disabled。  
4. Community MCP 默认不勾；手勾后安装仍 disabled。  
5. Chat/Loop Create Agent 旧路径无回归。  
6. 空库 + 仅本地 → 诚实空态 / gaps；扩搜可给出 catalog 候选。

### 7.3 Eval Checklist 预留

见 [`Agent-Harness-Eval-Checklist.md`](./Agent-Harness-Eval-Checklist.md) — Marketplace Installed Compose 条目（A0 写入占位，A4 勾选）。

---

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 把库内所有能力绑进一个 Agent | 默认勾选上限；低置信不勾 |
| 用户以为「允许网上找」= 任意爬虫 | 文案限定 Marketplace 验签目录 |
| 与 Chat Draft Card 行为不一致 | 共享 draft schema；后期统一勾选 UI |
| 扩搜噪声 / 幻觉 listing | 只用来自 catalog client 的真实 listing；禁止模型编造 id |
| Installed 页信息过载 | Compose bar 固定底栏；Card 模态化分层 |

---

## 9. 未决问题（实现前默认）

| # | 问题 | 本计划默认 |
|---|------|------------|
| Q1 | 扩搜是否含 git-url 自动探测 | **v1 仅验签 Catalog**；git-url 保持手动 Paste |
| Q2 | Rules 是否可写入 `skillIds` 旁路 | **否**；建议安装或 instructions 摘要 |
| Q3 | 创建成功是否默认选用 | **否**；提供 CTA，与「创建不强制选中」Workforce 习惯一致 |
| Q4 | assemble 是否必须走 LLM | **否**；启发式优先 |
| Q5 | 「仅安装缺的」按钮是否进 v1 | **A3 可做**；A2 可隐藏 |

---

## 10. Definition of Done（计划级）

1. A0 文档与邻居互链完成；实现按 A1–A4 切片可独立合并。  
2. Installed 可完成：prompt → consent → proposal →（可选 install）→ create → Picker 可见。  
3. 外搜仅在用户同意后发生；未同意零 catalog 网络（除用户已打开 Overlay 的既有 prefetch 外，assemble 本身不触发扩搜）。  
4. 安全不变量：不自动 enable MCP、不写 permissions、community 默认不勾。  
5. Chat/Loop `create_agent` 无回归。  
6. Eval 冒烟条目可执行。

---

## 11. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-11-05 | 初稿：基于「Installed 作为专职 Agent 装配入口」讨论收敛——Scope Consent、可勾选 Assembly Card、本地优先 + 可选 Catalog 混合未装、与 Workforce/Marketplace 三入口合流；A0–A5 切片与安全不变量。 |
| 2026-11-05 | **A1–A4 实现**：`assembleWorkforceAgent` API；Installed Compose UX；Catalog 扩搜与确认安装；创建 CTA。 |
