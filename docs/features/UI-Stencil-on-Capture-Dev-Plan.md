# UI Stencil on Capture：截图空间上的结构化 UI 意图模版

**状态**：M0–M3 implemented（2026-10-20）。可选「截图+线框」合成图仍 deferred。  
**范围**：在 Spatial Captures Workspace 与桌面截图 Overlay 上，提供可拖放的 **UI Stencil（组件 / 动效 / 视觉模版）**；投放后自动挂出 Compose Card；Agent 合成「用户意图 + 模版内置 brief + 截图参考」落地前后端。MVP 只做精选 catalog（~30），不做完整设计画布。  
**产品定位一句话**：Spatial Capture 解决「改哪里」；Stencil 解决「长什么样 / 怎么交互」；Compose 解决「业务要干什么」——三者叠成一条可提交的 agent 输入，而不是再做一个独立的 Material 设计器。  
**实现锚点**：
- 契约：`projectos/contracts/ui-stencil.ts`；region.`stencils`；`composer.stencilBrief` / `generationScope`
- Catalog：`UI_STENCIL_CATALOG`（Base/Motion/Visual + 3 Screen Presets）；Library 字母色块 + license / Maps-to 行；Motion 修饰符 chips
- Repo DS：`contracts/repo-design-system.ts`、`services/repo-design-system-service.ts`、`getRepoDesignSystem`
- UI：`StencilLibrary.tsx`、`StencilComposeExtras.tsx`、`SpatialCaptureCanvas` + Desktop `OverlayApp`
- 双入口共用：placement helpers + brief/scope/motion；Overlay 用 `STENCIL_UI_STRINGS_EN`

**权威交叉引用**：
- Spatial Capture / Pin：`contracts/spatial-capture-session.ts`、`contracts/spatial-pin.ts`、`SpatialCaptureCanvas.tsx`、`OverlayApp.tsx`、`OverlayArrowPrompt.tsx`、`submitSpatialPin`
- Compose / Agent 提交：`buildSpatialPinUserContent`、`project-os-local-api.ts` → chat session + snapshot images
- 产品愿景：[`Product-PRD.md`](../Product-PRD.md) — 「需求表达模糊」「产品形态不可见」；vibe coding as easy as possible
- UI 语言：`.cursor/skills/ai-devtool-ui/`、`.cursor/rules/liquid-glass-ui.mdc`（tech tokens；**不**为 catalog 把 Tailwind 引进 workbench 主壳）
- 对标概念（非依赖）：[m3e-canvas](https://github.com/lnkiai/m3e-canvas) — sketch → structured prompt → coding agent
- Catalog 内容来源（元数据级，非整库嵌入）：[shadcn/ui](https://github.com/shadcn-ui/ui)、[Motion](https://github.com/motiondivision/motion)、[React Bits](https://github.com/DavidHDev/react-bits)、[Magic UI](https://github.com/magicuidesign/magicui)

**明确不做 / 不复制**：
- **不**把 m3e-canvas Next.js 应用或 Material 3 Expressive 运行时嵌入 Workbench / Overlay
- **不**把 shadcn / Magic UI / React Bits 整包 `npm install` 进 Project OS workbench（CSS Modules + `--tech-*` 架构不变）
- MVP **不**做完整多屏 flow 预览、magnetic morph、M3 主题编辑器、分享链接站点
- MVP **不**追求「模版拖完即完整 App」；后端正确率不靠 stencil，靠用户意图 + 仓库上下文
- Visual 类（光效 / 粒子 / 重 shader）严格精选；默认不做 Ballpit、全屏 3D 画廊等
- React Bits 含 **MIT + Commons Clause**：收录须标注 license；商用分发策略需产品确认，MVP 可优先同效果的 MIT 源

---

## 0. 核心诉求（本计划锁定）

| # | 诉求 | 用户要回答的问题 | 本计划对应 |
|---|------|------------------|------------|
| 1 | 在真实截图上下文里表达 UI 意图 | 这块屏幕要加/改成什么样？ | Stencil 拖到 region 或整图 |
| 2 | 少写「描述 UI」的自然语言 | 控件类型、布局、交互不用全靠嘴说 | 模版内置 structured brief |
| 3 | 仍用熟悉的 Compose 提交 | 业务意图写在哪？怎么发给 agent？ | 自动挂 Compose Card |
| 4 | Agent 生成可进用户项目的代码 | 能不能用上 shadcn / Motion，而不是假 M3 皮？ | Catalog codegen hints |
| 5 | 捷径：甚至不框 region | 整张截图当参考行不行？ | 拖到面板 → 默认全图 region |

**一句话价值链**：

```text
截图定位（WHERE）
  + Stencil 结构意图（WHAT / HOW it looks & moves）
  + 用户 Compose 业务意图（WHY / behavior）
  → Agent 分层 brief + snapshot → FE（优先）+ 可选 BE stub
```

---

## 1. 产品决策（讨论收敛）

### 1.1 m3e-canvas 的正确用法

| 保留 | 替换 |
|------|------|
| Sketch → structured prompt → coding agent 范式 | Material 3 有限部件目录 |
| 「行列 / 重叠 / 网格写进 brief」的思路 | M3 主题、手机框、完整画布运行时 |
| 可选：一句 prompt 生成草稿布局（Phase 2） | 作为唯一模版来源 |

m3e 是 **交互与 prompt 工程教科书**，不是可嵌入的组件库。可直接 copy 进本仓库的代码预计 **&lt;10%**；可复用的产品能力约 **20–30%**（主要是 brief 写法）。

### 1.2 Catalog 策略：Registry，不是 Runtime

| 角色 | 用什么 |
|------|--------|
| 交互范式 | 学 m3e，自建投放 + Compose |
| Stencil 目录内容 | shadcn（基础 UI）+ Motion（动效）+ 精选 Bits/Magic（视觉） |
| 写进 **用户项目** 的代码 | Agent 按 `codegen` 指引安装/生成；非 Project OS 自带依赖 |
| Workbench 预览 | 静态缩略图 / 短 WebM / 可选隔离 iframe；主壳不引入 Tailwind |

### 1.3 设计系统默认（决定视觉准确率）

| 选项 | MVP 默认 | 说明 |
|------|----------|------|
| A. 中性线框 / 简预览 + brief | **是** | 预览「够认」即可 |
| B. 映射用户仓库已有 DS（如 `components/ui`） | **M3** | 探测 `components.json` / Tailwind / motion；badge + brief 复用路径 |
| C. 可选 M3 皮肤 | 非目标 | 仅当用户项目明确是 M3/Android 时再议 |

### 1.4 准确率预期（相对「纯截图 + 口语」）

| 场景 | 预期 |
|------|------|
| 单控件 / 局部块（按钮、表单项、卡片组） | **高** |
| 整屏 UI + 已知目标栈（React + shadcn） | **中高** |
| 全栈复杂业务后端 | **中低**（stencil 几乎不抬后端；需范围开关 + 业务 prompt） |
| Catalog 为 shadcn、项目非 Tailwind | 结构仍可用；视觉需 brief 写明「适配现有 DS」 |

相对「只做 m3e 部件目录」：前端可落地性大约 **+40–70%**（生成目标变成主流组件契约）；业务 App 主路径靠 **shadcn + Motion**；Bits/Magic 是营销/空态加分项。

### 1.5 生成范围开关（Compose 必显）

提交前用户必须能选（或默认清晰）：

- `UI only`（默认）
- `UI + API stub`
- `Full stack`（显式，且 brief 要求补实体 / 端点 / 鉴权意图）

以及：

- Prefer existing design system vs follow stencil visual
- 是否允许新建路由 / 表

---

## 2. 证据级现状（2026-10-20）

### 2.1 已有、可复用

| 能力 | 现状 | 锚点 |
|------|------|------|
| Capture session / region / arrow | 有 | `SpatialCaptureSessionSchema` |
| Compose card + prompt | 有 | `OverlayArrowPrompt`、arrow.`prompt` |
| 全图 backdrop + region 裁剪 | 有 | `backdropAssetPath`、`captureRect`、`snapshotAssetPath` |
| Pin 提交 → chat + 图 | 有 | `submitSpatialPin`、`buildSpatialPinUserContent`、`loadSpatialPinImages` |
| Workbench + Desktop 双入口 | 有 | `SpatialCaptureCanvas`、desktop spatial pin overlay |
| Workbench 自有 ui  primitives | 有（CSS Modules） | `workbench/src/components/ui/`（Button、Chip、…） |
| Tailwind / shadcn / motion 依赖 | **无** | `workbench/package.json` |

### 2.2 缺口（本计划要补）

| 缺口 | 说明 |
|------|------|
| 无 Stencil 模型 | Session 无 placement；Pin content 无 structured UI brief 段 |
| 无 Catalog | 无可拖模版、无预览资产、无 codegen hint |
| Compose 无分层 | 用户 prompt 与模版 brief 未分离、不可展开编辑 |
| 无「拖到面板 = 全图 region」捷径 | 仅手画 region |
| Agent 输入契约未扩展 | `buildSpatialPinUserContent` 只有自然语言 + location 行 |
| 仓库 DS 探测 | 无（Phase 2） |

**差距一句话**：空间定点与 Compose 提交链已通；缺的是「结构化 UI 意图层」与精选 catalog，不是再造一个设计 IDE。

---

## 3. 原则

1. **Stencil 是意图，不是像素真理。** 预览服务于认样；权威是 brief + 用户意图 + 截图。
2. **Catalog ≠ Workbench 依赖。** 元数据与预览资产进仓库；目标库进用户项目。
3. **分层 brief，禁止黑盒。** 用户可展开/编辑模版 brief；提交内容可审计。
4. **双入口同一 schema。** Workbench Spatial Captures 与桌面 Overlay 共用 `StencilPlacement` 与 brief builder。
5. **MVP 克制目录。** 默认 ~30；不做「打开就是组件天堂」。
6. **动效是修饰符。** Motion stencil 优先挂在 Base UI 上（chip），少做独立炫技块。
7. **后端不神话。** 范围开关默认 UI only；Full stack 必须用户显式。
8. **tech theme 主壳不变。** 不为 stencil 引入 glass 回潮或全局 Tailwind。

---

## 4. 对象模型（Contract 草案）

### 4.1 Catalog 定义（版本化、可单测）

```ts
type StencilCategory = 'base' | 'motion' | 'visual'

type StencilCodegenStrategy =
  | 'shadcn'
  | 'motion-snippet'
  | 'registry-url'
  | 'brief-only'

interface StencilDefinition {
  id: string                    // e.g. "btn-primary"
  category: StencilCategory
  title: string
  tags: string[]                // form | nav | feedback | marketing
  description: string           // 一行用途，给 Library 列表
  previewAsset: string          // 相对 catalog 的 png/webm
  propsSchema?: Record<string, unknown>  // 少量可编辑参数（label、variant…）
  briefTemplate: string         // 结构化 brief；支持 {{prop}} 插值
  codegen: {
    strategy: StencilCodegenStrategy
    packageHints?: string[]     // e.g. ["npx shadcn@latest add button"]
    registryUrl?: string
    targetFilesHint?: string
  }
  licenseNote?: string          // 尤其 React Bits
  motionAttachable?: boolean    // base 是否允许挂 motion 修饰符
}
```

### 4.2 Session 上的投放（持久化）

挂在 region 上（推荐），或 session 级 + `regionId` 可选：

```ts
interface StencilPlacement {
  id: string
  stencilId: string
  /** 相对 backdrop 或 region 的归一化/像素矩形（实施时与现有 ScreenRect 对齐） */
  rect: { x: number; y: number; width: number; height: number }
  zIndex?: number
  props?: Record<string, string | number | boolean>
  /** 挂上的动效修饰符 stencilId，最多 1–2 个（MVP） */
  motionModifierIds?: string[]
  /** 投放时生成的 brief 快照；用户可在 Compose 编辑后写回 */
  briefOverride?: string
  arrowId?: string              // 关联自动创建的 compose arrow
}
```

Region 扩展建议：

- `stencils: StencilPlacement[]`（max 与产品约定，MVP 建议单 region ≤ 5）
- 拖到面板空白：自动创建 `captureRect = 全 viewport` 的 region（或复用已有全图 region），再挂 placement

### 4.3 Agent 输入契约（扩展 `buildSpatialPinUserContent`）

强制分层，示例：

```text
[User intent]
<compose prompt>

[UI stencil brief]
<source: btn-primary + fade-in>
<editable brief text>

[Visual reference]
snapshot=...
stencil overlay note= placements at ...

[Repo constraints]
Prefer existing design system / components.
Codegen hints: npx shadcn@latest add button
Scope: UI only

[Out of scope]
...
```

图像通道保持现有 snapshot；Phase 2 可增加「backdrop + stencil 线框合成图」作为第二张附件。

---

## 5. 交互与展示契约

### 5.1 入口与布局

```text
Capture toolbar:  [ Arrow | Draw | Stencil ]
                         │
                         ▼
              Stencil Library drawer
              ┌ Base │ Motion │ Visual ┐
              │ search + tags            │
              │ [thumb] Button · CTA     │
              │ [thumb] Dialog · confirm │
              └──────────────────────────┘

Drop on region  → placement preview + auto Compose card
Drop on empty   → full-frame region + placement + Compose card
```

| 行为 | 规范 |
|------|------|
| Library | 左或底抽屉；默认只列 MVP catalog；搜索 + tag |
| 列表项 | 缩略图 + 名称 + 一行用途；hover 显示 codegen 提示（如 `→ shadcn button`） |
| 投放预览 | 半透明框 / 简线框叠在截图上；**不**跑完整第三方组件树 |
| 试看 | 可选右侧窄面板播 previewAsset；不打断标注 |
| Compose | 自动拉出；结构见下 |
| 删除 | 删 placement 可级联 draft arrow；已 submitted 的按现有 pin 规则 |

### 5.2 Compose Card 内容结构

1. **用户意图**（必填 textarea，现有行为）
2. **模版 brief**（可折叠；默认展开一行摘要；可编辑 → 写回 `briefOverride`）
3. **Chips**：stencil 名、motion 修饰符、Scope（UI only / …）
4. Submit（⌘↵）走现有 spatial pin 提交链

### 5.3 展示原则

- Visual 分区角标：`Best for landing / empty states`
- 探测到用户仓库 shadcn 时（Phase 2）：Base 项 badge `Maps to your components/ui`
- 短视频预览默认静音循环；`prefers-reduced-motion` 时只显示静帧

---

## 6. MVP Catalog（~30）

配比约 **16 Base / 8 Motion / 6 Visual**。

### 6.1 Base（shadcn 取向）

| id | 模版 | 用途 |
|----|------|------|
| `btn-primary` | Button primary/secondary/destructive | CTA / 表单提交 |
| `btn-icon` | Icon button | 工具栏 |
| `input-text` | Input + Label | 表单 |
| `textarea` | Textarea | 长文本 |
| `select` | Select | 筛选 |
| `checkbox-switch` | Checkbox / Switch | 设置 |
| `form-field-row` | Label + control + hint | 表单行结构 |
| `dialog` | Dialog / AlertDialog | 确认、编辑 |
| `sheet` | Sheet | 侧滑 / 底栏 |
| `dropdown-menu` | Dropdown menu | 操作菜单 |
| `popover` | Popover | 轻浮层 |
| `tabs` | Tabs | 分区 |
| `card` | Card | 信息块 |
| `table-basic` | 基础表格 + 行操作 | 后台列表 |
| `command` | Command palette | 快捷命令 |
| `toast` | Toast | 操作反馈 |

**MVP 不做**：复杂 DatePicker 全家、重型 Data Table、完整 Navigation Menu。

### 6.2 Motion（Motion 取向，优先作修饰符）

| id | 模版 | 用途 |
|----|------|------|
| `fade-in` | Opacity enter | 默认安全入场 |
| `slide-panel` | 侧栏/抽屉滑入 | 配 Sheet |
| `expand-collapse` | 高度展开 | FAQ / 详情 |
| `layout-shared` | Shared layout 暗示 | 列表→详情 |
| `tab-crossfade` | Tab 内容切换 | 配 Tabs |
| `list-stagger` | 列表错落入场 | 空态→有数据 |
| `drag-reorder` | 拖拽排序（brief 声明） | 看板 / 优先级 |
| `page-transition` | 路由进出 | 整页；默认不自动挂 |

### 6.3 Visual（Magic UI / React Bits 精选）

| id | 类型 | 用途 |
|----|------|------|
| `bg-grid-fade` | 淡网格/点阵背景 | 落地页 / 空态 |
| `bg-gradient-mesh` | 柔和 mesh 渐变 | Hero 背景 |
| `text-gradient` | 渐变标题 | 营销标题 |
| `text-split-reveal` | 逐词显现 | Hero 文案 |
| `btn-shine` | 按钮微光 | CTA 强调 |
| `card-glow-hover` | 卡片 hover 光边 | 特性卡片 |

**明确不收录（MVP）**：Ballpit、重度 shader、3D 画廊、全屏粒子。

---

## 7. 里程碑

### M0 — Contract + Brief builder（无炫 UI）

- [x] `StencilDefinition` catalog 模块（TS 常量 + zod 校验）— `contracts/ui-stencil.ts`
- [x] `StencilPlacement` 写入 `SpatialCaptureSession`（含序列化往返测试）
- [x] `buildStencilAwareUserContent` + `buildSpatialPinUserContent(pin, { placements })`
- [x] 单测：分层 markdown 稳定、空 brief、override 优先 — `contracts/ui-stencil.test.ts`

**完成标准**：不经新 UI，也能用 fixture placement 提交出正确 agent 文本。✅

### M1 — Library + 投放 + Compose（Workbench）

- [x] 工具条 Stencil 入口 + Library 抽屉（仅 MVP ids）— `StencilLibrary.tsx`
- [x] 选中后点击 region / 空白（自动全图 region）投放
- [x] 半透明 placement 预览 + 自动 Compose card
- [x] Compose：用户意图 + 可编辑 brief + scope select
- [x] Submit：`composer.stencilBrief` + `generationScope` → `buildSpatialPinUserContent` 分层输出
- [x] i18n（en/zh）
- [x] 预览：Library 字母色块占位（`previewAsset` 路径预留，静帧 PNG 可后补）

**完成标准**：用户可完成「选 Button → 点击投放 → 写一句 → Submit」；agent 消息含 stencil brief。✅

### M2 — Desktop Overlay 对齐 + Motion 修饰符

- [x] Overlay 共用同一 catalog / placement / `StencilLibrary` + `StencilComposeExtras` — `OverlayApp.tsx`
- [x] Base 上挂 1 个 motion 修饰符：Library chips + Compose select；写入 `motionModifierIds` → brief
- [x] `prefers-reduced-motion`：CSS 关 transition；brief 追加 reduced-motion 注记
- [x] 许可标注：Library 行显示 `licenseNote`（如 visual 模版）

**完成标准**：桌面截图插件与 Workbench 行为一致；修饰符出现在 brief 中。✅

### M3 — 仓库探测与 codegen 诚实性（Phase 2 入口）

- [x] 探测 `components.json` / Tailwind / `motion` 是否存在（`repo-design-system.ts` + `repo-design-system-service` + `getRepoDesignSystem`）
- [x] Library badge：`Maps to …`（`stencilMapsToRepoBadge`；Workbench / Overlay Library）
- [x] Brief 自动切换「复用已有路径」vs「安装 hint」（`collectRepoAwareCodegenHints`；`submitSpatialPin` 注入）
- [ ] 可选：合成「截图 + 线框」第二附件图（deferred）
- [x] Screen presets（Login / Settings / Dashboard）——`composedOf` 引用 Base ids

**完成标准**：有 shadcn 的仓库与无 shadcn 的仓库，brief 文案可区分且可测。✅

---

## 8. 工程落点建议

| 区域 | 建议路径 / 动作 |
|------|-----------------|
| Contract | `spatial-capture-session.ts` 增 `StencilPlacementSchema`；必要时 pin composer 增可选 `stencilBrief` |
| Brief | `contracts/spatial-pin.ts` 或 `services/stencil-brief.ts` 纯函数 |
| Catalog | `workbench/.../stencils/catalog.ts` + `previews/` |
| Canvas | `SpatialCaptureCanvas.tsx` 工具模式扩展；投放 hit-test |
| Overlay | `OverlayApp.tsx` 对齐；注意 Electron 性能（预览用静帧） |
| Persist | `captureSessionSerialize.ts` 往返；assets 仍走现有 spatial-captures 目录策略 |
| Tests | catalog zod、brief 快照、serialize、canvas 投放（可先单测逻辑再补组件测） |

**依赖政策**：

- Workbench：**不**新增 `tailwindcss` / `framer-motion` / shadcn 作为产品运行时依赖（M0–M2）
- 若 M1「试看」需要隔离演示：单独 `stencil-preview` iframe bundle（可选），与主 app 构建隔离
- Motion：仅当预览 iframe 需要时再议；主壳继续 CSS transition

---

## 9. 验收与评测集

固定用例（有/无 stencil 对比，记录一次成功率与返工轮次）：

1. 替换 / 强调现有 CTA 按钮  
2. 在设置页加 Switch 行  
3. 列表页加筛选 Select + 查询按钮  
4. 空态加 Card + 主按钮  
5. 表单 Dialog（姓名 + 提交）  
6. 侧栏 Sheet 详情  
7. Tabs 切换两块内容 + `tab-crossfade`  
8. 后台 Table 基础列  
9. 落地页 Hero：`text-gradient` + `bg-grid-fade`（Visual）  
10. 拖到面板空白、不手画 region，整图参考实现顶栏搜索  

**通过线（MVP）**：用例 1–6、10 在 Agent 模式下，有 stencil 时比无 stencil **少 ≥1 轮**「UI 理解返工」的主观评测通过；生成代码优先引用 brief 中的组件名 / install hint。

---

## 10. 风险与开放问题

| 风险 | 缓解 |
|------|------|
| Catalog 膨胀、选择困难 | MVP 锁 30；搜索 + tag；默认隐藏非 MVP |
| 用户项目非 Tailwind，shadcn hint 误导 | Brief 写清「适配现有 DS」；M3 探测后改写 hint |
| Visual 滥用导致生成花活 | Visual 分区警告；默认 scope UI only |
| Overlay 性能 | 静帧预览；限制同屏 placement 数 |
| Commons Clause（React Bits） | 标注或换 Magic UI 同类；法务确认后再默认收录 |
| 与「手绘箭头」心流冲突 | Stencil 为第三工具模式；不取代 Arrow/Draw |

**开放问题（实施前确认）**：

1. Placement 矩形坐标系：统一 backdrop 像素 vs region 归一化？建议与现有 arrow 点系一致。  
2. 一个 Compose card 是否允许绑定多个 stencil（一组）？MVP 建议 **1 primary + ≤2 motion**。  
3. Prompt 生成整屏草稿是否进 M3，还是独立 epic？建议独立，避免拖垮 MVP。  
4. 是否提供「仅复制 brief、不提交 agent」？对标 m3e Copy Prompt——可作为 M2 小项。

---

## 11. 文档维护

- 状态变更时更新文首 **状态** 行与里程碑勾选。  
- Catalog 增删在 §6 同步，并 bump catalog `version` 字段（实施时加入）。  
- 若拆 PR：优先 M0 → M1 → M2；M3 可另开 `UI-Stencil-Repo-Mapping-Dev-Plan` 子页。

---

## 附录 A. 讨论结论速查

| 问题 | 结论 |
|------|------|
| 核心诉求？ | 截图上投放结构化 UI 意图 → Compose → Agent |
| 有价值吗？ | 有；补齐 WHERE 之后的 WHAT/HOW |
| 可行吗？ | 高（接现有 capture/compose）；搬整库运行时低 |
| 跟 m3e 关系？ | 学范式；换目录为 shadcn/Motion/精选视觉 |
| 四库怎么进项目？ | **Stencil Registry**，不进 workbench 依赖 |
| MVP 目录？ | ~30，见 §6 |
| 怎么展示？ | 工具模式 + Library 抽屉 + 静帧预览 + 分层 Compose |

## 附录 B. 参考链接

- [m3e-canvas](https://github.com/lnkiai/m3e-canvas)  
- [shadcn/ui](https://github.com/shadcn-ui/ui)  
- [Motion](https://github.com/motiondivision/motion)  
- [React Bits](https://github.com/DavidHDev/react-bits)  
- [Magic UI](https://github.com/magicuidesign/magicui)  
