# Capability Marketplace — DevPlan

**状态**：Implemented（2026-11-05）— **P0–P6 已落地**（六类 Capability + 依赖引导 + Installed 总览 + 六类 Git/HTTP URL / Pack 导入 + 内置 Stencil catalog 扩容）。共享 catalog-client 抽取（CMP-5.5）仍可选延期。  
**产品定位一句话**：Project OS Marketplace 是 **Capability Marketplace（能力市场）**——分发「agent 怎么干活」的声明式包，而不是 VS Code 式 IDE Extension 插件主机。

**权威邻居**：

| 文档 | 关系 |
|------|------|
| [`MCP-Marketplace-Dev-Plan.md`](./MCP-Marketplace-Dev-Plan.md) | **已落地**：MCP catalog / install / Overlay tab（本计划继承，不重做） |
| [`Skills-Marketplace-Dev-Plan.md`](./Skills-Marketplace-Dev-Plan.md) | **已落地**：Skill catalog / install / Overlay tab（本计划继承，不重做） |
| [`Agent-Harness-Dev-Plan.md`](./Agent-Harness-Dev-Plan.md) / [`Agent-Harness-Tool-Registry.md`](./Agent-Harness-Tool-Registry.md) | Rules / Skills / permissions 消费面；catalog install ≠ policy allow |
| [`Specialized-Agent-Workforce-Dev-Plan.md`](./Specialized-Agent-Workforce-Dev-Plan.md) | Workforce Agent 本地 CRUD；本计划增加 **导出 / 目录安装** |
| [`Marketplace-Installed-Agent-Compose-Dev-Plan.md`](./Marketplace-Installed-Agent-Compose-Dev-Plan.md) | **Implemented**：Installed 视图 NL 装配专职 Agent（Consent + 可勾选提案）；创建仍走 Workforce |
| [`Loops-Graph-Workflow-Studio-Dev-Plan.md`](./Loops-Graph-Workflow-Studio-Dev-Plan.md) | Loop presets；文档已标 marketplace 延期——本计划承接 |
| [`UI-Stencil-on-Capture-Dev-Plan.md`](./UI-Stencil-on-Capture-Dev-Plan.md) | 本地 Stencil catalog；本计划增加 **可分享 pack** |
| [`backend/Security-Governance-Dev-Plan.md`](./backend/Security-Governance-Dev-Plan.md) | 验签、SSRF、community 默认关、无自动 permissions |

**已有实现锚点（勿重复建设）**：

- Overlay：`workbench/src/components/Marketplace/*`（tabs：MCP / Skills / Rules / Agents / Workflows / Stencils + Catalog/Installed）
- 契约：`contracts/mcp-catalog.ts`、`contracts/skill-marketplace.ts`、`contracts/marketplace-git-install.ts`
- 服务：`services/skill-marketplace/`、MCP catalog client、`services/marketplace-git-install/`
- Store：`workbenchStore` marketplace prefetch / install / uninstall / hide / report

---

## 0. 核心诉求（讨论锁定）

| # | 诉求 | 本计划对应 |
|---|------|------------|
| 1 | 网上有价值的工具 / 方法能装进本地，开发中可用 | **Install 通道**：MCP、Skill、Rules（及后续同类） |
| 2 | 用户在 Project OS 里创造的有价值资产可复用、可分享 | **Export / Publish 通道**：Workflow、Agent、Stencil（+ Skill/Rules 亦可自创） |
| 3 | 不做 VS Code Extension Marketplace | **明确不做** IDE 插件主机、Workbench 任意 JS 注入 |
| 4 | 安全与现有 MCP/Skill 市场同构 | 验签目录、community 风险文案、默认不写 `permissions.json` |
| 5 | 市场体现 Project OS 差异化，而非只做 MCP/Skill 搬运 | 六类能力：Tools / Methods / Roles / Processes / Intent |

**价值链**：

```text
外部目录（curated + community）          本项目创造
        │                                    │
        ▼                                    ▼
   Install into .projectos / settings   Export → Capability Pack
        │                                    │
        └────────► Capability Marketplace ◄──┘
                         │
                         ▼
              Harness / Loop / Capture / Chat 消费
```

---

## 1. 产品决策

### 1.1 命名

| 对外 | 对内 | 说明 |
|------|------|------|
| **Marketplace** | **Capability Marketplace** | UI 标题可仍用 Marketplace；文档/代码注释用 Capability |
| 禁止称 | Extension Marketplace | 避免团队滑回插件主机心智 |

### 1.2 固定六类能力（本期范围上限）

| # | 类型 | 层 | 供给 | 安装落点 | 现状 |
|---|------|----|------|----------|------|
| 1 | **MCP** | Tools | 外部为主 | `settings.mcpServers`（provenance，默认 disabled） | ✅ Implemented |
| 2 | **Skill** | Methods | 外部 + 自创 | `.projectos/skills/<id>/` | ✅ Implemented |
| 3 | **Rules** | Methods | 外部 + 自创 | `.projectos/rules/`（pack 子目录或文件集） | ✅ Implemented（P1）；P6 补齐 git-url / Export |
| 4 | **Workflow** | Processes | 自创为主 + curated preset | `.projectos/loop-presets/` 或等价 IntentGraph pack | ✅ Implemented（P3） |
| 5 | **Agent** | Roles | 自创为主 + curated | `.projectos/agent-definitions/` | ✅ Implemented（P2） |
| 6 | **Stencil** | Intent | 自创 + curated pack | `.projectos/stencils/` 运行时 concat Library | ✅ Implemented（P4） |

**组合关系（不变量）**：

- Agent / Workflow 是 **组合层**：可声明依赖 `skillIds` / `mcpListingIds`（或本地 server ids）。
- 安装组合包时：**不**自动装齐依赖；UI 展示缺失依赖并引导去对应 tab 安装。
- Skill 与 Rules 都是指令，但 **Rules = 常驻**，**Skill = 按需**；市场分 tab，不合并。

### 1.3 明确不进 Marketplace

| 项 | 原因 |
|----|------|
| IDE / VS Code Extension | 需要 extension host；非 AI DevTool 主战场 |
| 任意 JS 插件改 Workbench 壳 | API 稳定面与安全成本爆炸 |
| Memory / 个人记忆包 | 用户私有、不可信、不可分发 |
| 裸 `permissions.json` 一键 allow | 安全红线；最多「建议策略」附在 listing 上，默认不应用 |
| `features.json` / 项目功能图 | 项目专属事实，非可复用包 |
| Plans / Debug harness records | 运行产物，非资产 |
| Prompt 散文件市场（独立第 7 类） | 并入 Skill 或 Rules；避免品类膨胀（见 §9 Q1） |

### 1.4 供给双通道

| 通道 | 行为 | 信任 |
|------|------|------|
| **Install** | 远程验签 catalog / bundled / git-url（沿用现有）→ 写入本项目 | curated / community；community 强制审慎默认 |
| **Export** | 从本项目打出 Capability Pack（JSON + 附属文件清单）→ 本地保存或复制 | 默认 `trustTier: community`（作者自签前） |
| **Publish**（后期） | 提交到远程目录 / PR 到官方 catalog | 本期 **不做** 服务端审核后台；可先「导出 + 打开贡献说明 URL」 |

### 1.5 安全不变量（继承 MMP/SMP，全品类适用）

1. Catalog install ≠ `permissions.json` allow。  
2. Community 包可装；MCP 类默认 `enabled: false`；指令类须有风险文案。  
3. 远程目录：HTTP SSRF guard + Ed25519 验签；失败回退 bundled。  
4. Hide / Report 仅本地 prefs；无社区上传 API（Publish 后台延期）。  
5. Secret 仍走 SecretStore；包内不得要求明文写入仓库。  
6. Marketplace Overlay **只安装配置 / 文件，不执行工具**。

---

## 2. 概念与包格式

### 2.1 统一 Capability Pack 信封（新契约）

所有新品类（Rules / Workflow / Agent / Stencil）及未来扩展共用一层信封；MCP/Skill **保留现有 listing schema**，通过 adapter 投影到统一 UI 模型（避免破坏已装 provenance）。

建议新文件：`projectos/contracts/capability-marketplace.ts`

```text
CapabilityKind = "mcp" | "skill" | "rules" | "workflow" | "agent" | "stencil"

CapabilityPackMeta {
  id, name, description?, version, kind, trustTier,
  homepage?, iconUrl?,
  dependsOn?: { skills?: string[], mcpListings?: string[], rules?: string[] }
}

CapabilityCatalogListing = CapabilityPackMeta & {
  // kind-specific payload (discriminated union)
}

CapabilityCatalogDocument {
  version, generatedAt?, listings: CapabilityCatalogListing[]
}
```

**原则**：一个 catalog document **可按 kind 分文件**（与今日 mcp/skill 双 catalog 一致），Overlay 用统一卡片模型混排或分 tab；不必强行合并为一个远程 JSON。

### 2.2 各 kind 落盘约定

| Kind | Pack 内容 | 安装动作 |
|------|-----------|----------|
| **rules** | 一个或多个 `.md`（可带相对路径） | 写入 `.projectos/rules/<packId>/`（隔离目录，便于卸载） |
| **workflow** | IntentGraph / LoopSpec 快照 + meta（预算、标签） | 写入 `.projectos/loop-presets/<id>.json`（或现有 loop 用户目录，见 Q2） |
| **agent** | `WorkforceAgentDraft` 等价字段 + 依赖声明 | 写入 `.projectos/agent-definitions/<id>.json`；**不**自动启用为当前 Chat agent |
| **stencil** | `StencilDefinition[]` 子集 + 可选 preview 资源引用 | 写入 `.projectos/stencil-packs/<id>/`；Capture Library 合并可见 |

卸载：按 packId / listingId 删除对应目录或文件；不得误删用户手工文件（仅删带 provenance 标记的安装产物）。

### 2.3 Provenance

所有目录安装产物写入 provenance（与 MCP 对齐）：

```text
listingId, catalogVersion, trustTier, listingVersion, installedAt, source: catalog | manual | git-url | export-reimport
```

Rules/Workflow/Agent/Stencil 在文件旁或 manifest 内嵌 provenance；Agent JSON 可增 `provenance` 字段。

---

## 3. UX 表面

### 3.1 Marketplace Overlay（演进）

现状：`MarketTab = 'mcp' | 'skills'`。

目标信息架构：

```text
Marketplace
├── Browse
│   ├── MCP
│   ├── Skills
│   ├── Rules          ← 新增
│   ├── Workflows      ← 新增
│   ├── Agents         ← 新增
│   └── Stencils       ← 新增
└── Library / Installed（可选二期：跨 kind 已装列表）
```

- 顶栏：Refresh、Close；保留 git-url 安装（先支持 mcp/skill；新品类 git-url 按切片打开）。  
- 分区：Curated / Community（沿用）。  
- Detail：Overview / Facts / Setup / Risk；组合包增加 **Dependencies** 行。  
- i18n：`chat.marketplace.*` 扩展；subtitle 改为能力导向文案（不再写死 “MCP and skills only”）。

### 3.2 Export 入口（Project OS 原生创造）

| 来源表面 | 动作 | 产出 |
|----------|------|------|
| Settings / Rules 管理（若有）或 `.projectos/rules` | Export Rules Pack… | `rules` pack JSON + files |
| Loops Graph（已保存 preset / 当前图） | Share as Workflow… | `workflow` pack |
| Agent Picker / Workforce 管理 | Share Agent… | `agent` pack |
| Stencil Library | Share Pack… | `stencil` pack |
| Skill 库 | 已有 create-skill；补 Export Skill…（可复用 SMP listing 形状） | `skill` listing 形文件 |

Export v1：**下载/复制到剪贴板或写入用户选择路径**；UI 展示「如何贡献到官方 catalog」链接。  
**不做**：一键上传到 Project OS 云。

### 3.3 依赖引导

安装 Agent / Workflow 时若 `dependsOn` 未满足：

1. 仍允许安装本体。  
2. Detail / 成功 toast 列出缺失 Skill / MCP / Rules。  
3. 提供「前往安装」跳到对应 tab + 高亮 listing（若 catalog 中存在）。

---

## 4. 架构与复用

```text
                    ┌─────────────────────────────┐
                    │  Marketplace Overlay (UI)   │
                    │  unified card + per-kind    │
                    └─────────────┬───────────────┘
                                  │
                    ┌─────────────▼───────────────┐
                    │  workbenchStore             │
                    │  prefetch* / install* /     │
                    │  exportCapabilityPack       │
                    └─────────────┬───────────────┘
                                  │ IPC / LocalApi
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
   MCP CatalogClient      Skill CatalogClient     CapabilityCatalogClient
   (existing)             (existing)              (new: rules/workflow/
                                                   agent/stencil)
          │                       │                       │
          ▼                       ▼                       ▼
   settings.mcpServers    .projectos/skills/      kind-specific installers
                                                   + provenance
```

**复用**：

- 验签 / 缓存 / bundled / blocklist 模式：复制 `skill-marketplace` 客户端骨架，抽共享 `catalog-client` 工具（可选 CMP-0 重构；若风险高则先复制再抽）。  
- git-url：`marketplace-git-install` 按 kind 扩展 resolver。  
- Overlay：抽象 `MarketplaceKindAdapter`（list / install / uninstall / buildDetailModel）。

---

## 5. 里程碑与切片

### 阶段总览

| Phase | 主题 | 合格线 |
|-------|------|--------|
| **P0** | 文档 + 统一信封 + Overlay 可扩展骨架 | ✅ DevPlan 落地；`MarketTab` 可插拔；MCP/Skill 无回归 |
| **P1** | Rules Marketplace | ✅ 验签目录 → 安装到 `.projectos/rules/<packId>/` → harness 加载可见；Hide/Report |
| **P2** | Export 基线 + Agent pack | ✅ 本机 Export Agent；目录 Install Agent；不自动选中 |
| **P3** | Workflow pack | ✅ Export/Install Loop preset；Palette / Presets UI 可见 |
| **P4** | Stencil pack | ✅ Export/Install；Capture Library 合并 |
| **P5** | 依赖引导 + 抛光 + Eval | ✅ 依赖跳转；Installed 总览；Checklist；文档互链 |
| **P6** | URL / Pack / Stencil 扩容 | ✅ 六类 git-url + HTTP pack JSON；Import 粘贴；Rules Export；内置 Stencil 精选扩容 |

社区上传后台、远程 Publish API、IDE Extension：**全程延期**。

---

### P0 — 骨架（CMP-0）

| ID | 主题 | 说明 |
|----|------|------|
| CMP-0.1 | 本文档 + 邻居交叉引用 | 更新 MMP/SMP 头部指向本计划；Eval Checklist 预留条目 |
| CMP-0.2 | `capability-marketplace` 契约 | Kind、PackMeta、dependsOn、通用 Report/Prefs 形状 |
| CMP-0.3 | Overlay adapter 接口 | `MarketplaceKindAdapter`；mcp/skills 迁入 adapter；行为不变 |
| CMP-0.4 | i18n / 文案 | subtitle、空态改为 Capability 语义；tabs 预留但不强行露出空 tab |

**DoD**：MCP/Skill 安装/卸载/详情/git-url 冒烟通过；无新品类功能也可合并。

---

### P1 — Rules（CMP-1）

| ID | 主题 | 说明 |
|----|------|------|
| CMP-1.1 | Rules catalog schema + bundled 快照 | 至少 1 curated + 1 community fixture |
| CMP-1.2 | CatalogClient + cache + 验签 | 与 SMP 同构 |
| CMP-1.3 | `installRulesFromCatalog` / uninstall / list | 写入 `.projectos/rules/<packId>/`；manifest + provenance |
| CMP-1.4 | Overlay Rules tab | 卡片、详情、Hide/Report、community 风险文案 |
| CMP-1.5 | Harness 确认 | `loadProjectRulesMarkdown` 递归读到 pack 子目录；单测 |
| CMP-1.6 | Export Rules Pack（可选同 Phase） | 从已有 rules 目录打 pack；无远程 publish |

**合格线**：Install → Agent 下一轮 instructions 含新 rules；Uninstall 后消失；不碰 permissions。

---

### P2 — Agent packs（CMP-2）

| ID | 主题 | 说明 |
|----|------|------|
| CMP-2.1 | Agent listing ↔ `WorkforceAgentDraft` 映射 | 含 dependsOn |
| CMP-2.2 | `exportCapabilityPack({ kind: "agent" })` | 读 `.projectos/agent-definitions/` |
| CMP-2.3 | `installAgentFromCatalog` | 新 id；冲突需 replace；不改 `activeAgentDefinitionId` |
| CMP-2.4 | Overlay Agents tab + Export 入口（Picker 菜单） | |
| CMP-2.5 | 依赖展示 | Detail 列出 skill/MCP；缺失提示（完整跳转可到 P5） |

**合格线**：Export → 另一项目 Install → 出现在 Agent Picker；选用后 runtime 行为与手工创建一致（skills 注入仍遵 Workforce v1）。

---

### P3 — Workflow packs（CMP-3）✅

| ID | 主题 | 说明 |
|----|------|------|
| CMP-3.1 | Workflow pack schema | ✅ IntentGraph pack + sanitize（strip authoringSessionId / agentDefinitionId） |
| CMP-3.2 | 用户 preset 目录 | ✅ `.projectos/loop-presets/<id>.json` + provenance |
| CMP-3.3 | Export from Graph / Install to presets | ✅ Overlay Share；Palette 合并 builtins + user |
| CMP-3.4 | Overlay Workflows tab + curated 内置 1–2 条 | ✅ curated.feature-development + community.quick-review |
| CMP-3.5 | 与内置 `loop-presets.ts` 共存 | ✅ `LOOP_GRAPH_PRESETS` 不变；resolve 优先 builtin 再读磁盘 |

**合格线**：分享一条「Feature Dev」类用户图 → 他机安装 → 可从 Preset 打开编辑。

---

### P4 — Stencil packs（CMP-4）✅

| ID | 主题 | 说明 |
|----|------|------|
| CMP-4.1 | Stencil pack schema | ✅ `StencilCatalogListing.stencils[]` 复用 `StencilDefinition`；保留 licenseNote |
| CMP-4.2 | 安装合并进 Library | ✅ `.projectos/stencils/<id>.json`；`setProjectStencilOverlay` 运行时 concat；拒绝与内置 id 冲突 |
| CMP-4.3 | Export 选中 stencils | ✅ Library preview Share → `exportCapabilityPack({ kind: "stencil" })` |
| CMP-4.4 | Overlay Stencils tab | ✅ curated.status-pill + community.empty-state；community 风险文案 |

**合格线**：安装 pack 后 Capture Library 可见；投放 → Compose brief 含自定义 stencil。

---

### P5 — 闭环与治理（CMP-5）✅

| ID | 主题 | 说明 |
|----|------|------|
| CMP-5.1 | 依赖引导跳转 | ✅ Agent Detail → Dependencies「前往安装」切 tab + 高亮 listing |
| CMP-5.2 | Installed 总览 | ✅ Overlay Catalog/Installed 切换；跨 kind 卸载 |
| CMP-5.3 | Eval Checklist 条目 | ✅ 六类冒烟 + 安全回归条目 |
| CMP-5.4 | 文档收尾 | ✅ Capability / Loops / Workforce / Stencil / Full-Product / Eval 互链 |
| CMP-5.5 | （可选）共享 catalog-client 抽取 | ⬜ 延期——各 kind client 仍复制同构，避免打断 MMP/SMP |

---

### P6 — URL / Pack / Stencil 扩容（CMP-6）

| ID | 主题 | 说明 |
|----|------|------|
| CMP-6.0 | DevPlan / Eval / i18n 骨架 | ✅ 本文档 P6；Eval 冒烟条；Import / kind 文案 |
| CMP-6.1 | `marketplace-git-install` 契约扩展 | ✅ kind：`mcp\|skills\|rules\|agents\|workflows\|stencils`；Ok/Conflict/Failed 结果 |
| CMP-6.2 | Rules GitHub URL | ✅ pack JSON 优先；否则 `**/*.md` 合成 listing → `.projectos/rules/<packId>/`；`source: git-url` |
| CMP-6.3 | Agent/Workflow/Stencil Pack URL | ✅ GitHub 定位 `.projectos-pack.json` / `capability-pack.json`；裸 `.json` HTTP（SSRF guard）；无 schema 不瞎扫 |
| CMP-6.4 | Overlay + Rules Export | ✅ 六 tab `supportsGitUrl`；Import pack 粘贴；`ExportCapabilityPack` 含 `rules` |
| CMP-6.5 | 内置 Stencil catalog 精选扩容 | ✅ `UI_STENCIL_CATALOG` v0.2 +15 shadcn 取向条目；**不**嵌入 npm 组件库 |
| CMP-6.6 | 测试 / Eval / 文档闭环 | ✅ resolver / 契约单测；MCP/Skill git-url 回归；状态 → Implemented |

**P6 产品决策（锁定）**：

- **Pack-first**：Agent/Workflow/Stencil 必须找到 Capability Pack JSON；找不到 → `failed` + agent fallback。  
- **Rules 额外探测**：允许从 GitHub md 目录合成 pack（深度/文件数上限）。  
- **同一 API**：`installFromGitUrl` 内部分流 git vs 裸 HTTP pack JSON（不新增 IPC）。  
- **Stencil ≠ 前端组件库**：只扩 brief/codegen 元数据；任意前端仓库 URL ≠ 可装 Stencil。

**合格线**：六 tab URL 可装；粘贴 Export JSON 可导入；内置 Library 可见新常用件；不写 permissions / 不自动 enable MCP。

---

## 6. 明确延期

| 项 | 原因 |
|----|------|
| IDE Extension Marketplace / 插件主机 | 产品定位排除 |
| 社区上传 + 服务端审核后台 | 与 MMP 同期策略；先 Export + 人工 PR catalog |
| 自动应用 permissions / 自动 enable MCP | 安全不变量 |
| Marketplace 内执行工具或跑 Loop | 只装配置 |
| Memory pack 分发 | 隐私与信任 |
| Prompt 独立第七品类 | 并入 Skill/Rules |
| 按 Agent 强制裁剪 MCP tool 子集 | Workforce 已延期；本计划不抢做 |
| 远程计费 / 私有组织目录 | 平台期 |
| 任意前端组件库仓库 URL 自动变 Stencil | 无 pack schema；与「意图模版」定位冲突 |
| 非 GitHub git 主机确定性安装 | 继续 agent fallback（与 MCP/Skill v1 一致） |

---

## 7. 测试与验收

### 7.1 自动化（每 Phase 最低）

- Zod：pack / listing round-trip。  
- Install / uninstall 文件系统单测（temp workspace）。  
- 验签失败 / SSRF / poisoned cache（复用 SMP 模式）。  
- Rules：install 后 `loadProjectRulesMarkdown` 含内容；uninstall 后不含。  
- Agent：install 后 `listWorkforceAgents` 可见；session active id 不变。  
- Overlay adapter：mcp/skill 回归（若有组件测或 store 测）。

### 7.2 人工冒烟（P5 / P6）

1. MCP/Skill 旧路径无回归（含 git-url）。  
2. Rules：装 → 对话可见约束 → 卸。  
3. Agent：Export → 新项目 Install → Picker 选用。  
4. Workflow：Export → Install → Preset 打开。  
5. Stencil：Install → Library → 投放 brief。  
6. Community 风险文案可见；Hide 后列表消失。  
7. 无 allow 时 Ask 仍不 `callTool`（MCP）。  
8. **P6**：Rules GitHub md / pack URL → `.projectos/rules/<id>/`。  
9. **P6**：Agents/Workflows/Stencils 粘贴 Export JSON 或 pack URL 可装；冲突 replace。  
10. **P6**：内置 Stencil Library 可见新增常用件；投放 brief 含模版。

---

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 六 tab 过空、产品显得「未做完」 | P0 只露出有 catalog 的 tab；空 kind 隐藏 |
| Rules 装进根目录难卸载 | 强制 `.projectos/rules/<packId>/` 隔离 |
| Workflow 序列化拖入不安全节点 | pack 白名单字段；拒绝未知 node type |
| Agent 依赖 Skill 未装导致「半残角色」 | dependsOn UI + 文档；不静默失败 |
| 抽共享 catalog-client 打断 MMP/SMP | P0/P1 先复制；P5 再抽 |
| 与「Extension」用语混淆 | UI/文档统一 Capability；本 DevPlan 开篇锁定 |

---

## 9. 未决问题（实现前需确认）

| # | 问题 | 选项 | 建议默认 |
|---|------|------|----------|
| Q1 | `.projectos/prompts/`（scan/sync）是否单独成 tab？ | 独立 / 并入 Skill / 并入 Rules | **并入 Skill**（工作流说明书）或保持「产品内置安装」不进市场 |
| Q2 | 用户 Workflow 存放路径 | `.projectos/loop-presets/` vs 现有 loop 图目录 | **`.projectos/loop-presets/`** |
| Q3 | Rules pack 是否允许写到 rules 根（扁平）？ | 允许 / 禁止 | **禁止**；仅 `<packId>/` |
| Q4 | Export 是否包含 MCP 配置明文（command/env）？ | 含 / 仅 listingId 引用 | Agent/Workflow **只引用 id**；MCP 本体仍走 MCP tab |
| Q5 | Stencil preview 二进制是否进 pack？ | 内嵌 / 仅 URL | **仅 URL 或省略**；避免巨包 |
| Q6 | Overlay 默认 tab | mcp / skills / 上次选择 | **上次选择**，首次 `mcp` |
| Q7 | Publish 到官方 catalog 的贡献流 | 仅文档链接 / 生成 PR 模板 | **文档 + 导出文件**；无 API |

---

## 10. 建议执行顺序

```text
CMP-0 … CMP-5（已完成）
  → CMP-6.0 DevPlan / Eval / i18n
  → CMP-6.1 契约
  → CMP-6.2 Rules git-url
  → CMP-6.3 Pack JSON（GitHub + HTTP）
  → CMP-6.4 Overlay Import + Rules Export
  → CMP-6.5 内置 Stencil 扩容
  → CMP-6.6 测试 / 文档闭环
```

---

## 11. Definition of Done（计划级）

1. 六类能力均有：契约、安装落点、Overlay 入口（或明确隐藏空 tab）、Unload、provenance。  
2. Export 至少覆盖 Agent + Workflow + Rules（或 Rules 目录安装 + Agent/Workflow Export）。  
3. 安全不变量 §1.5 全部有测试或 Checklist 勾选。  
4. 无 Extension host、无自动 permissions、无上传后台。  
5. MMP/SMP 行为无回归；邻居 DevPlan 已互链。  
6. 开发者仅凭本文档 + 所列路径可实施，无需再猜品类范围。

---

## 12. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-11-05 | 初稿：基于 Capability Marketplace 讨论收敛——否定 IDE Extension 市场；锁定 MCP/Skill/Rules/Workflow/Agent/Stencil 六类；Install + Export 双通道；P0–P5 切片与安全不变量。 |
| 2026-11-05 | P0–P5 实现完成：六 tab + Export（Agent/Workflow/Stencil）+ 依赖跳转 + Installed 总览；CMP-5.5 共享 client 抽取仍延期。 |
| 2026-11-05 | **P0/P1 实现**：`capability-marketplace` + `rules-marketplace` 契约；Rules CatalogClient / install 至 `.projectos/rules/<packId>/`；Overlay Rules tab + kind registry；验签 bundled 目录与单测。 |
| 2026-11-05 | **P2 实现**：`agent-marketplace` 契约；Agent CatalogClient / install（`agent_mkt_*` + provenance）；Export pack + AgentPicker 分享；Overlay Agents tab；dependsOn 展示。 |
| 2026-11-05 | **P6 计划**：六类 git-url / HTTP pack / Import 粘贴；Rules Export；内置 Stencil catalog 精选扩容；明确「任意前端仓库 ≠ Stencil」。 |
| 2026-11-05 | **P6 实现**：`marketplace-git-install` 六 kind；Rules md/pack + Agent/Workflow/Stencil pack URL；Overlay Import；Rules Export；`UI_STENCIL_CATALOG` v0.2。 |
| 2026-11-05 | 互链 [`Marketplace-Installed-Agent-Compose-Dev-Plan.md`](./Marketplace-Installed-Agent-Compose-Dev-Plan.md)（Installed NL 装配专职 Agent；Planned）。 |
