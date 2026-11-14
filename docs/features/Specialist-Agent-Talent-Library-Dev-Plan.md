# Specialist Agent Talent Library — DevPlan

**状态**：P0–P5 implemented（2026-11-13）— 内置人才库、Marketplace UX、Picker/Palette 深链、Loop role 预填、Compose 启发式 Template 建议（不自动安装）。  
**范围**：在 **不推倒** Workforce / Marketplace / Loops Wiring 的前提下，把内置专职 Agent Catalog 从「2 条样例」升级为 **按部门组织的标准岗位人才库（Agent Template）**，并打通 Template → Instance（workforce `AgentDefinition`）→ Run（`AgentRun` / Pool 观察）与 Loops Graph 引用。  
**产品定位一句话**：用户从标准化、专业化、可组合的 AI 岗位目录里选用/实例化人才，再在 Chat 或 Loops Graph 里动态组建团队——而不是界面上换一批不同名字的聊天机器人。

**权威交叉引用**：

| 文档 | 关系 |
|------|------|
| [`Specialized-Agent-Workforce-Dev-Plan.md`](./Specialized-Agent-Workforce-Dev-Plan.md) | Template 安装/创建后的 **Instance CRUD** 与 runtime light 注入（instructions + skills） |
| [`Capability-Marketplace-Dev-Plan.md`](./Capability-Marketplace-Dev-Plan.md) | Agent Catalog / Export / Install（`agent_mkt_*`）；本计划扩展 **listing schema + 内置岗位内容** |
| [`Marketplace-Installed-Agent-Compose-Dev-Plan.md`](./Marketplace-Installed-Agent-Compose-Dev-Plan.md) | NL 装配入口；本计划岗位可被 Compose 匹配，不替换该流 |
| [`Loops-Graph-Agent-Wiring-Dev-Plan.md`](./Loops-Graph-Agent-Wiring-Dev-Plan.md) | Instance 的 model/skills/mcp 画布装配；本计划提供 **建议 `agentRole` + 推荐依赖**，不硬编码固定 Workflow |
| [`Loops-Graph-Agent-Work-Group-Dev-Plan.md`](./Loops-Graph-Agent-Work-Group-Dev-Plan.md) | 人才库多选 → Loops「组成工作组」批量放置；Template→Instance 仍走 Workforce |
| [`Agent-Pool-Dev-Plan.md`](./Agent-Pool-Dev-Plan.md) / Trace Waterfall | **运行态观察池**（易与「人才库」混淆——见 §0） |
| Settings `AgentProfile` | 仍只解析 **General Agent**；不把岗位目录并入 Settings 模板 |

---

## 0. 命名澄清（必读）

仓库里已有两套「Agent」表面，本计划刻意区分：

| 产品说法 | 代码真相 | 本计划角色 |
|----------|----------|------------|
| **Talent Library / 人才库 / Agent Templates** | Marketplace **Agents** tab + `agent-marketplace/bundled/catalog.json` + listing schema | **本计划主战场**：浏览岗位、看 Profile、从 Template 创建 Instance |
| **Workforce / My Agents** | `.projectos/agent-definitions/` 中 `kind: "workforce"` | Template 安装或手工 Create 后的 **Agent Instance** |
| **Agent Pool（Agent Flow tab）** | `AgentPool/*` 投影运行中的 `AgentRun` | **运行态观察**；本计划 **不**把岗位目录硬塞进该 tab |
| **General Agent** | `AgentProfile` + `activeAgentDefinitionId = null` | 不变 |

UI 文案优先用 **「人才库 / Specialist Agents / Templates」**；若用户口语说「Agent Pool 选人才」，产品映射到 Marketplace Agents / AgentPicker，而不是 Flow 的 Pool 观察面。

---

## 1. 现状与缺口（基于真实仓库）

### 1.1 已有锚点（必须复用）

| 层 | 路径 | 已有能力 |
|----|------|----------|
| Catalog 契约 | `contracts/agent-marketplace.ts` → `AgentCatalogListing` | name / description / roleLabel / instructions / skillIds / dependsOn / permissionNotes / trustTier / iconUrl |
| Instance 契约 | `contracts/agent-pool-trace.ts` → `AgentDefinitionConfig` + `contracts/agent-workforce.ts` draft | workforce CRUD；Chat/Loop 选用 |
| 安装 | `services/agent-catalog-service.ts` | listing → `agent_mkt_*`；`modelProfileId: null`；不自动选用 |
| Catalog 客户端 | `services/agent-marketplace/` | bundled + 验签；与其它 capability catalog 同构 |
| UI | `MarketplaceOverlay` Agents tab + detail model；`AgentPicker`；Draft/Assembly Card | 安装、详情依赖、选用 |
| Runtime v1 | `resolveWorkforceRunOptions` | 仅注入 **instructions + skill bodies** |
| Loop 职责 taxonomy | `LOOP_AGENT_ROLES`：planner / coder / reviewer / researcher / tester / debugger / architect / documenter | 与 Instance 分离；可作 Template→放置建议 |
| Skill 内置库 | `skill-marketplace/bundled`（12） | 可作 `dependsOn.skills` 推荐（不可假定已装） |
| MCP 内置库 | `mcp-catalog/bundled`（6） | 可作 `dependsOn.mcpListings` 推荐（不可假定已连） |

### 1.2 现有内置 Agent（仅 2 条）

| Listing id | 名称 | 与岗位目录关系 |
|------------|------|----------------|
| `curated.code-reviewer` | Code Reviewer | **保留并升级**：并入 Software Dev / Senior 交叉审查叙事；或映射为 Senior 的默认 Review 配置面（见 §3） |
| `community.prompt-engineer` | Prompt Engineer | **保留**：并入 AI Engineering 部门旁支 / Domain 前身；不删除以免破坏已安装 provenance |

### 1.3 Schema / UX 缺口（对照「统一 Template 标准」）

| 要求字段族 | 现状 | 本计划 |
|------------|------|--------|
| Identity（部门、图标、简介） | 有 name/description/iconUrl；**无 department** | 扩展 listing |
| Role & Responsibilities | 主要靠 instructions 散文 | 结构化 `responsibilities` / `boundaries`（短文）+ instructions 精炼 |
| Capabilities 标签 | 无 | `capabilityTags` + `taskTypes` |
| Skills / MCP | skillIds + dependsOn | 继续用；禁止写死「已连接」 |
| Model Recommendation | 无；且安装强制 `modelProfileId: null` | 新增 **能力档位建议**（非固定模型 id） |
| Knowledge / I-O / Handoff / Validation | 无 | 结构化可选字段；长文不塞满 system prompt |
| Permissions | 仅 `permissionNotes` 文本 | 保留文本 + 可选 `permissionHints` 枚举；**仍不写** `permissions.json` |
| 按部门浏览 / 筛选 | Agents 网格无部门 | Marketplace Agents UX |
| Template ≠ Instance ≠ Run | 概念在代码层大致成立，产品文案易混 | §0 + UI 文案 |
| Orchestrator 按任务推荐 Agent | 无 | **P2 延期**（启发式推荐可做薄层；模型驱动调度不做） |

### 1.4 明确不做（本计划边界）

1. 不推倒 Agent Pool 观察面、不重做 Workforce CRUD / Compose。  
2. 不把 Skills / MCP / Models **升格**为岗位类型。  
3. 不把岗位目录硬编码成固定 Workflow（不强制「每单必经全部部门」）。  
4. 不伪造 MCP/Skill/模型已连接状态；未装依赖只展示推荐 + 引导安装。  
5. 不引入付费第三方服务。  
6. 不把完整专业能力散文全部塞进 `instructions`——结构化字段 + 模块化 Skill 依赖优先。  
7. Domain Specialist 的具体垂直岗（嵌入式 / 游戏 / 渗透…）**本次不实现实体 listing**，只保证扩展点。  
8. MCP tool catalog 按 Agent 裁剪、permissions 文件覆盖：**继续延期**（与 Workforce DevPlan 一致）。  
9. 「Senior 不得审查自己生成的代码」→ **Handoff / 产品规则 + instructions**；不在本计划强制双模型运行时（可建议不同 Instance / 不同 model 档位）。

---

## 2. 锁定产品决策

| ID | 决策 | 含义 |
|----|------|------|
| **TL-D1** | Template = Catalog Listing；Instance = workforce Definition；Run = AgentRun | 三者 id 空间分离；Template 从不携带 run 状态 |
| **TL-D2** | 内置岗位默认 `trustTier: "curated"` | 产品官方人才；community 仅保留既有样例与未来社区包 |
| **TL-D3** | 安装 = 创建 Instance，不自动 Chat 选用 | 延续 CMP；Picker / Loop Switch 才绑定 |
| **TL-D4** | 同一 Template 可多次实例化 | catalog 安装用稳定 `agent_mkt_<listingId>`（单槽）；**额外实例**走「从 Template 创建」→ 新 `agent_<uuid>` draft（可改名） |
| **TL-D5** | Model 只推荐档位，不绑定具体 `modelProfileId` | listing 存 `modelTierHint`；用户本机再选 Profile |
| **TL-D6** | Loop：Template 提供 `suggestedLoopAgentRole`，不强制图结构 | Palette/Switch 可预填 role；Workflow 仍由用户/Preset 组装 |
| **TL-D7** | Specialist Pool 默认折叠 / 非必装 | Mobile / Data / Domain 入口可见但不要求每项目启用 |
| **TL-D8** | 兼容旧 listing | 新字段全部 optional；缺省时 UI 降级为 description + instructions |
| **TL-D9** | 签名与嵌入资产同步 | 改 `bundled/catalog.json` 必须重建 `.sig` 与 `bundled-assets.ts` 嵌入（补齐 agent 侧 rebuild 脚本） |

---

## 3. 岗位目录 ↔ Listing 映射

### 3.1 部门枚举

```ts
type AgentDepartment =
  | "product_architecture"   // Product & Architecture
  | "software_development"   // Software Development（重点）
  | "quality_infrastructure" // Quality & Infrastructure
  | "ai_engineering"         // AI Engineering
  | "specialist_pool";       // Specialist Pool（默认非必装）
```

### 3.2 内置 Template 清单（实现目标）

| # | Listing id（稳定） | 显示名 | 部门 | 建议 Loop `agentRole` | 备注 |
|---|-------------------|--------|------|----------------------|------|
| 1 | `curated.product-planner` | Product & Planner | product_architecture | `planner` | 新建 |
| 2 | `curated.software-architect` | Software Architect | product_architecture | `architect` | 新建；依赖 archify/diagram 类 skill（推荐） |
| 3 | `curated.ui-ux-designer` | UI/UX Designer | product_architecture | `documenter` 或保持 documenter/researcher | 新建；推荐 ui-ux / impeccable 等 skill |
| 4 | `curated.frontend-engineer` | Frontend Engineer | software_development | `coder` | 新建；推荐 Storybook/Playwright MCP 为可选 |
| 5 | `curated.backend-engineer` | Backend Engineer | software_development | `coder` | 新建 |
| 6 | `curated.fullstack-engineer` | Full-Stack Engineer | software_development | `coder` | 新建 |
| 7 | `curated.senior-software-engineer` | Senior Software Engineer | software_development | `coder` + handoff→独立 review | 新建；交叉审查规则见 §3.3 |
| 8 | `curated.qa-security` | QA & Security | quality_infrastructure | `tester` | 新建；基础安全 only |
| 9 | `curated.devops-reliability` | DevOps & Reliability | quality_infrastructure | `debugger`（或 coder） | 新建 |
| 10 | `curated.ai-llm-engineer` | AI/LLM Engineer | ai_engineering | `coder` | 新建；与 prompt-engineer 并存 |
| 11 | `curated.mobile-crossplatform` | Mobile & Cross-platform | specialist_pool | `coder` | 新建；默认折叠 |
| 12 | `curated.data-engineer` | Data Engineer | specialist_pool | `coder` | 新建；默认折叠 |
| 13 | `curated.domain-specialist` | Domain Specialist | specialist_pool | `researcher` | **扩展入口壳**：instructions 说明如何另存为垂直岗；不实现多个垂直实体 |
| — | `curated.code-reviewer` | Code Reviewer | software_development **或** quality | `reviewer` | **升级保留**：专职独立审查岗；Senior handoff 默认指向此类 Instance |
| — | `community.prompt-engineer` | Prompt Engineer | ai_engineering | `researcher` | **保留** community；UI 可标「旁支」 |

### 3.3 Senior × 独立审查（特别要求）

产品规则（写入 Template `handoffRules` + Senior / Reviewer `instructions`）：

1. 实现类 Agent（Frontend/Backend/Full-Stack/Senior 写码）交付后，**Code Review 优先交给独立 Reviewer Instance**（`curated.code-reviewer` 或用户自建 Reviewer），而不是同一 run 自审。  
2. Loops 推荐拓扑（**可选 Preset 提示，非强制**）：`… → coder Instance → reviewer Instance → human/approve`。  
3. 若用户只有一个 Agent：UI 提示「建议另建 Reviewer 或换 model 档位」；**不阻断**单 Agent 工作流。  
4. 本计划不实现自动双模型调度。

### 3.4 推荐依赖（示例，实现时以 bundled 实 id 为准）

| Template | 推荐 Skills（dependsOn / skillIds） | 推荐 MCP listings | 推荐 Rules |
|----------|-------------------------------------|-------------------|------------|
| Software Architect | `community.archify`, `community.diagram-design`, `community.graphify` | — | 可选 `curated.typescript-strict` |
| UI/UX Designer | `community.ui-ux-pro-max`, `community.impeccable`, `community.taste-skill` | — | — |
| Frontend Engineer | （可选 impeccable） | `community.storybook-mcp`, `curated.playwright` | typescript-strict |
| QA & Security | — | `curated.playwright`, `curated.chrome-devtools` | — |
| Product & Planner | `community.elu` 仅当 MCP；或无 skill | `community.elu`（可选） | — |
| AI/LLM Engineer | `community.create-skill`, `community.prompt-engineer` 叙事 | — | — |
| 其它工程岗 | 以空或少量通用 skill 起步 | `curated.filesystem` / `curated.context7` 可选 | typescript-strict 可选 |

**原则（2026-11-13 更新）**：`dependsOn` / `skillIds` 仍是岗位推荐清单；**Install Agent 默认一并安装**这些 Skills / MCP / Rules，并把已装 MCP 的 server id 绑定到 Instance（`installDependencies` 默认 `true`，可显式关闭）。Community MCP 默认仍关闭；需鉴权的 MCP 可能装上配置后仍要用户补 token。详情页继续展示 missing / 失败项。

---

## 4. 数据结构

### 4.1 三层身份（不可混用）

```text
Agent Template  (catalog listing, 只读岗位标准)
       │  install / “Create instance from template”
       ▼
Agent Instance  (workforce AgentDefinition on disk)
       │  Chat select / Loop agentDefinitionId / run
       ▼
Agent Run       (AgentRun + optional pool_lane Definition 观察)
```

### 4.2 扩展 `AgentCatalogListing`（Template）

在 `contracts/agent-marketplace.ts` **向后兼容**扩展（全部新字段 optional，除非注明）：

| 字段 | 类型（建议） | 对应标准 |
|------|--------------|----------|
| `department` | `AgentDepartment` | Identity |
| `iconUrl` | 已有；补默认占位策略 | Identity |
| `tagline` | string ≤160 | 卡片一句话 |
| `responsibilities` | string[] ≤12 | Role |
| `boundaries` | string[] ≤8 | 职责边界（不做什么） |
| `capabilityTags` | string[] ≤24 | Capabilities |
| `taskTypes` | string[] ≤16 | 支持的任务类型 |
| `modelTierHint` | enum：`fast` \| `balanced` \| `deep` \| `any` | Model Recommendation |
| `knowledgeContext` | string ≤2k | 背景/规范需求 |
| `permissionHints` | enum[]：`read_repo` \| `propose_edits` \| `run_tests` \| `use_mcp` \| `network` \| `secrets_ask` | Permissions 建议 |
| `permissionNotes` | 已有 | 人读审批说明 |
| `inputContract` | string ≤2k | 输入要求 |
| `outputContract` | string ≤2k | 输出/交付物 |
| `handoffRules` | string ≤2k | 协作与交接 |
| `validationCriteria` | string ≤2k | 交付质量标准 |
| `suggestedLoopAgentRole` | `LoopAgentRole` | Loops 预填 |
| `specialistPool` | boolean default false | Specialist 折叠 |
| `instructions` / `skillIds` / `dependsOn` / `roleLabel` | 已有 | 运行注入与依赖 |

**不进 Catalog 的字段**：`modelProfileId`、本机 MCP UUID、run 状态、session 绑定。

### 4.3 Instance 映射（安装 / 从 Template 创建）

| Template 字段 | → Instance (`AgentDefinition.config`) |
|---------------|----------------------------------------|
| name | displayName |
| roleLabel | role + roleLabel |
| instructions | instructions（可拼接极短 boundary 摘要；完整 Profile 仍以 catalog/详情为准） |
| skillIds ∪ dependsOn.skills | skillIds |
| permissionNotes (+ hints 文本化) | permissionNotes |
| — | modelProfileId = null |
| — | mcpServerIds = Install 时从已装/新装的 `dependsOn.mcpListings` 解析绑定（可为空） |
| marketplaceProvenance | 仅 catalog/export 安装路径 |

**可选后续（本计划 P1 末可选）**：Instance 侧增加 `templateListingId` 只读溯源字段（便于「从哪一岗创建」）；若不想动 `AgentDefinitionConfig`，可靠 `marketplaceProvenance.listingId`（仅 mkt 安装）或 draft 元数据。

### 4.4 Profile 展示契约（UI）

详情页分组（Marketplace detail / 未来 Talent Profile）：

1. Overview（部门、tagline、trust、version）  
2. Responsibilities & Boundaries  
3. Capabilities & Task types  
4. Skills / MCP / Rules（installed vs recommended）  
5. Model tier hint  
6. Knowledge / I-O / Handoff / Validation  
7. Permission hints + notes  
8. Actions：Install / Create another instance / Use in Chat / Place on Loop  

---

## 5. 产品体验

### 5.1 Marketplace Agents = 人才库浏览

- Catalog 视图：**按部门分组**（A–E）；Specialist Pool 默认折叠或角标「按需」。  
- 卡片：岗位名、tagline、capabilityTags 前 3–5 个、适用 `taskTypes` 一句。  
- 筛选：部门、capabilityTag、taskType、trustTier、已装/未装。  
- 空态文案：明确「不必为每个项目装齐全部岗位」。  
- Installed：已装 Instance 列表；支持「再创建一个同岗 Instance」（→ draft 预填 Template 字段，新 uuid）。

### 5.2 AgentPicker / Chat / Loop

- Picker「My Agents」仍列 Instance；可增加「从人才库添加…」深链到 Agents tab。  
- Loop Palette：选 Template → 确认创建/选用 Instance → 放置节点并预填 `suggestedLoopAgentRole`。  
- 不把 13 岗做成固定 Palette 死节点类型。

### 5.3 与 Orchestrator

| 阶段 | 行为 |
|------|------|
| **P0–P1** | 无自动推荐；用户显式选用 |
| **P2（可选）** | 启发式：任务关键词 / Loop agentRole → 建议 Template id 列表（非强制） |
| **延期** | 模型驱动多 Agent 调度、自动拆团队 |

---

## 6. 实现里程碑

| Milestone | 内容 | 主要落点 | DoD |
|-----------|------|----------|-----|
| **P0** | 契约扩展 + 兼容解析 + 单测 | `contracts/agent-marketplace.ts`、schema-hardening、install 映射忽略未知已有 | ✅ 新字段 optional；旧 listing 兼容 |
| **P1** | 内置 catalog 内容 12+ 升级 + rebuild 脚本 | `agent-marketplace/bundled/catalog.json`、补 `scripts/rebuild-bundled-catalog.mjs`、`bundled-assets.ts` | ✅ 15 listings（含 Domain 壳 + 保留 code-reviewer / prompt-engineer） |
| **P2** | Marketplace Agents UX：部门分组、筛选、Profile 分组详情 | `MarketplaceOverlay`、`marketplaceDetailModel`、i18n en/zh | ✅ 部门分组 + Specialist 折叠 + Profile sections |
| **P3** | 「从 Template 创建另一 Instance」+ Loop 预填 role | `createWorkforceAgent` 预填、`AgentPicker`/Palette 入口 | ✅ Draft from Template；Switch Agent 预填 `suggestedLoopAgentRole` |
| **P4** | 文档互链 + Eval Checklist + 回归 | 本文件勾选、`Agent-Harness-Eval-Checklist`、相关单测 | ✅ schema/detail/suggest 单测 + Picker 深链 |
| **P5（可选）** | 薄层「建议 Agent」启发式 | assemble / composer hint | ✅ `suggestAgentTemplatesFromPrompt` → Assembly Card（不自动装） |

**建议落地顺序**：P0 → P1（内容可先于炫 UI）→ P2 → P3 → P4；P5 另开。

---

## 7. 文件级改动预期

| 文件 / 区域 | 作用 |
|-------------|------|
| `docs/features/Specialist-Agent-Talent-Library-Dev-Plan.md` | 本计划（权威） |
| `projectos/contracts/agent-marketplace.ts` | Template schema 扩展 |
| `projectos/contracts/schema-hardening.test.ts`（或 agent 专用测） | 兼容与校验 |
| `projectos/services/agent-marketplace/bundled/catalog.json` | 岗位内容 |
| `projectos/services/agent-marketplace/bundled/catalog.json.sig` + `catalog.pubkey.b64` | 验签 |
| `projectos/services/agent-marketplace/bundled-assets.ts` | 嵌入回退 |
| `projectos/services/agent-marketplace/scripts/rebuild-bundled-catalog.mjs` | **新增**（对齐 mcp/skill 脚本） |
| `projectos/services/agent-catalog-service.ts` | 安装映射；可选 template 溯源 |
| `projectos/services/agent-catalog-service.test.ts` / `client.test.ts` | 新 listing 冒烟 |
| `projectos/workbench/.../Marketplace/*` | 部门分组、筛选、详情 Profile |
| `projectos/workbench/src/i18n/locales/{en,zh}.ts` | 部门名、筛选、多 Instance CTA |
| `AgentPicker` / Loop Palette（轻触） | 「从人才库添加」「预填 role」 |
| `docs/features/Specialized-Agent-Workforce-Dev-Plan.md` 等 | 顶部互链一行 |
| `docs/features/Agent-Harness-Eval-Checklist.md` | 人才库验收条目 |

**刻意不改**：`AgentPool` 观察投影核心、Orchestrator 调度内核、permissions 强制引擎。

---

## 8. Template 内容编写规范（P1 质量门）

每条 curated listing 必须满足：

1. **instructions ≤ ~1.5–2k 字**：岗位定位、边界、输出偏好、与 handoff 对齐的硬规则；细节放到 structured 字段 / Skill。  
2. **boundaries 明确**：例如 QA 不做完整渗透；Domain 壳不假装已是 FinTech 专家。  
3. **outputContract 可检查**：列出交付物名称（PRD、ADR、Test Plan…），便于 Validation。  
4. **dependsOn 只引用真实 bundled/catalog id**；没有的能力留空，不造假 skill id。  
5. **permissionNotes** 诚实：读写偏好、是否建议审批。  
6. **中英文**：catalog 正文先 **English**（与现网 catalog 一致）；Workbench UI 用 i18n。若后续要中文 catalog，另开 i18n listing 计划。  
7. **不写死技术栈口号到不可复用**：Frontend 可提 React/Vue 为能力标签，instructions 要求「跟随仓库既有栈」。

---

## 9. 验收标准

1. Agents Catalog 至少覆盖 §3.2 表格中 **新建 curated 岗位 + 升级保留的 code-reviewer**；Domain Specialist 为可扩展壳。  
2. 每条 Template 在详情中能展示 §4.4 分组（缺字段则隐藏该组，不报错）。  
3. Install → `.projectos/agent-definitions/agent_mkt_*`；**不**自动切换 Chat Agent。  
4. 可从同一 Template 再创建 `agent_<uuid>` Instance（显示名可改）。  
5. 缺 Skill/MCP 时详情显示 missing，**不**显示已连接。  
6. Loop 可绑定 Instance；可选预填 `suggestedLoopAgentRole`；无强制全部门 Workflow。  
7. 选用 Instance 后 Change run 仍注入 instructions + 已装 skill bodies（Workforce v1）。  
8. 旧项目已装 `curated.code-reviewer` / `community.prompt-engineer` 不因 catalog 升级而损坏（replace 策略不变）。  
9. 相关单测与 catalog 验签通过。

---

## 10. 风险与缓解

| 风险 | 缓解 |
|------|------|
| instructions 膨胀导致 token 浪费 | 结构化字段 + Skill 模块化；instructions 设硬上限与评审 |
| 用户以为必须装全套 | Specialist 折叠 + 空态/引导文案 |
| 与 Agent Pool 观察面概念混淆 | §0 文案；UI 避免在 Flow Pool 放岗位目录 |
| 签名私钥/重建流程遗漏 | P1 先补 rebuild 脚本；CI/测覆盖 bundled embed |
| Senior 自审 | handoff 文案 + 保留独立 `code-reviewer`；可选 P5 提示 |
| 依赖 skill 质量参差（community） | curated Agent 可 dependsOn community skill，但详情标 trust；或 instructions 内联最小规范、skill 仅可选 |

---

## 11. 与用户最终交付清单的对应

实现完成后（非本文档阶段）应能提供：

- 修改文件及作用（§7）  
- 新增/调整的 Agent Templates（§3.2）  
- Template 数据结构说明（§4）  
- Talent Library ↔ Loops 连接方式（§2 TL-D6、§5.2）  
- 测试结果与未完成项（对照 §6 / §9）

---

## 12. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-11-13 | 初稿：对照仓库缺口、13 岗映射、Template/Instance/Run 分离、Marketplace 为人才库主表面、里程碑 P0–P5、Senior 独立审查规则、Domain 扩展壳。 |
| 2026-11-13 | P0–P3 实现：Schema 扩展、15 条内置 Templates、rebuild 脚本、Marketplace 部门 UX / Profile、从 Template 建 Instance、Loop Switch 预填 role。 |
| 2026-11-13 | P4–P5：AgentPicker/Palette「从人才库添加」、Palette 放置预填 role、Template 启发式建议、schema/detail/suggest 单测。 |
| 2026-11-13 | Install Agent 默认连带安装 recommended Skills/MCP/Rules 并绑定 MCP server ids；返回 `InstallAgentFromCatalogResult`。 |
