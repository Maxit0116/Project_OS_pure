# Project OS 前端 UI/UX：差距、目标与验收

状态：开发前参考。本文只描述现状与改法，不包含实现。

权威顺序：

1. `.cursor/skills/ai-devtool-ui/SKILL.md` 及其 `references/`（本文的验收标准）
2. 现有工作台架构：CSS Modules + `tokens.css`，不换框架、不重写布局
3. `frontend-design-bold` 与 `ui-ux-pro-max` 只在不和上两条冲突时采用

冲突时以第 1 条为准。下面两处明确不采用：

| 来源 | 建议 | 不采用的原因 |
|---|---|---|
| `frontend-design-bold` | 避开系统字体、用夸张排版、渐变网格、噪点、自定义光标 | 和「安静、精密、可连续工作数小时」相反。本产品走克制极简，不走夸张极简 |
| `ui-ux-pro-max`（2026-10-08，query: AI developer workspace，variance 3 / motion 3 / density 8） | 单列落地页、超大标题、Inter、石板蓝 `#0F172A` + 运行绿 `#22C55E`、GSAP 路由过渡 | 检索把开发工具匹配成了营销页。绿色主按钮和石板蓝正是上一轮被否掉的通用 SaaS 配色。密度 8 和「动效克制、默认暗色」可以保留 |

目标一句话：近黑、高密度、空间化的 AI 开发环境。功能地图、Agent、代码、文件树、对话是同一系统的不同视图，不是聊天框旁边挂一个编辑器。

---

## 1. 现在是什么

Workbench 在 `projectos/workbench`：Vite + React 18 + Zustand + CSS Modules。图标只用 `lucide-react`。用户文案在 `src/i18n`。

空间结构已经对：顶栏（项目上下文）、左栏（文件树）、中栏（功能地图 / 代码 / Agent Flow / Diff）、右栏（对话）、底栏（终端 / 诊断）。这符合 skill 第 4 节的工作区，不要改成单列页面。

视觉系统是两套 token 叠在一起：

- `--color-*`、`--glass-*`、`--radius-glass-*`：苹果 Liquid Glass 时期留下的
- `--tech-*`：后来的纯色表面。暗色对齐 Cursor Dark（内容 `#181818` / chrome `#141414` / 抬升 `#1C1C1C`），强调色是选中蓝，绿色只留给成功

欢迎页已改成暗色画布上的左对齐入口（标题、一句说明、两个内容宽度的按钮），不再是居中绿色营销卡。这是少数已经对齐 skill 的表面。其余表面大多还在用玻璃半径、玻璃边框和弹簧动效。

---

## 2. 差在哪里

每条都对应 skill 的规则，并指出代码位置。

### 2.1 圆角和「卡片感」仍然是消费级

`tokens.css` 的共享半径：

```text
--radius-sm: 10px
--radius-md: 14px
--radius-lg: 20px
--radius-glass-sm … xl: 14 / 18 / 24 / 34px
--radius-pill: 9999px
```

Skill 第 8 节要求：小控件 6–8px，标准控件 8–10px，大表面 10–14px。现在的 `--radius-sm` 已经等于 skill 的「大表面」。

仍引用 `--radius-glass-*` 或 `--radius-pill` 的模块包括功能地图节点（`FeatureNode.module.css`、`mapArtifactNodes.module.css`、`MapArtifactTabStrip.module.css`）、Agent Flow（`AgentFlowPanel.module.css` 等）、聊天 composer、Diff、设置、语义文件树。结果是节点、步骤卡、标签、徽章都偏圆、偏「浮起」，工作区被切成很多独立卡片。

### 2.2 玻璃身份没有退干净

`global.css` 仍定义 `.glass-nav`、`.glass-elevated`、`.glass-overlay`，并用 `backdrop-filter: blur(...)`。组件侧已很少挂这些 class，但 token 和工具类还在，后续改动容易抄回去。

仍在用的模糊：`layout/ThreeZoneLayout.module.css` 的 `.edgeRail`（折叠面板的侧边把手）使用 `backdrop-filter` 和 `--glass-border-subtle`。Skill 第 9 节：玻璃不能当主身份；关掉模糊产品也要成立。侧边把手应是实色细条。

`GlassLens` / `GlassPanelShell` 已是无折射的透传包装，但调用点还在（设置、对话菜单、地图对话框、composer）。名字和注释仍在教人做玻璃。

### 2.3 功能地图还是「3D 卡片演示」

`FeatureNode.module.css` 有 10px 挤出厚度、背面、侧面，选中态是 `box-shadow: 0 12px 32px` 加 2px 强调色描边。分支卡片还有 `0 10px 28px` 的重阴影。

Skill 第 15–16 节：节点应是小标题 + 类型 + 状态 + 关系。状态用细边框、小指示点，不要大色块、重阴影、彩虹边。3D 挤出不传达架构信息。

### 2.4 Agent 有数据，但看起来像一块面板里的卡片

`AgentFlowPanel.tsx` 在有步骤时会列出 step / action / trace，这和 skill 第 12–13 节的活动流同方向。空闲时只用 `EmptyState` 加一个 32px 的 Workflow 图标（`agentFlow.emptyTitle` / `emptyDesc`）。文案说明了下一步，这是对的；图标尺寸和卡片容器（`styles.card`、玻璃半径）把执行状态做成了仪表盘模块。

缺的是一眼能读的状态机外观：Idle → Thinking → Planning → Executing → Inspecting → Waiting → Completed。状态应是安静的指示（圆点、字重、一行摘要），不是头像、光晕或大号图标。进度不能是假的旋转。

`AgentActivityIndicator.module.css` 的 `.pill` 使用 `--radius-pill` 和 `--glass-border-subtle`，把状态做成胶囊徽章。Skill 第 30 节反对多余徽章。

### 2.5 对话、代码、Diff 的边界不够「意图 vs 执行」

布局上对话在右栏，这符合「聊天不是产品」。问题在表面语言：

- 用户气泡用 `--tech-accent` 铺满（`ChatPanel.module.css`）。强调色被用来填充整块对话，而不是标出状态。
- Composer、模式切换、历史菜单仍用玻璃半径。
- Diff 面板（`DiffReviewPanel.module.css`）有多处 `--radius-glass-*`。执行结果应是可检查的代码面，不是一组圆角卡。

Skill（`references/codex/principles.md`）：用户意图和系统执行要分开；编辑器是工作区的一部分，不要套在卡片里。

### 2.6 动效偏慢、偏弹

`tokens.css`：`--duration-slow: 420ms`，`--duration-panel-enter: 480ms`，`--ease-spring: cubic-bezier(0.34, 1.28, 0.64, 1)`。面板抽屉（`LeftPanel.module.css`、`RightPanel.module.css`）用这组弹簧。`motion.css` 的 `glassEnter` / `glassOverlayEnter` 带 scale。

Skill 第 22 节：120–250ms，用 opacity 和 transform，不要夸张弹簧和持续运动。面板开关可以有方向，但应在 200ms 内结束，且尊重 `prefers-reduced-motion`（部分已有，不完整）。

### 2.7 空状态、加载、错误不统一

`EmptyState` 组件结构是对的（标题、说明、可选动作）。代码编辑器和 Agent 的文案已经说清「这是什么、下一步」。浏览器空状态也具体。

缺口：

- 没有统一要求「为什么是空的」。
- 加载若仍是整页或大号 spinner，违反第 20 节。应留在当前表面，并写出正在做什么、进度来自真实计数。
- 错误若只有一句「出错了」，违反第 21 节。应包含发生了什么、系统试过什么、用户下一步。欢迎页的 IPC 错误（浏览器里打开示例项目）是这类：现在只显示一句 bridge 不可用，没有说明要在桌面应用里打开。

### 2.8 导航与命令面板的密度

顶栏、Tab、按钮已改成实色和细边框，方向正确。命令面板（`CommandPalette`）已去掉折射，但是搜索列表的项仍有 `translateX(4px)` 的悬停位移（`CommandPalette.module.css`）。Skill 第 11 节：快、安静、键盘优先。悬停不应推动布局。

侧边栏标题使用大写 + 字距（`LeftPanel.module.css` 的 `.title`）。可以保留为元数据层级，但不要再加大字号。

### 2.9 无障碍还没当验收项

全局 `:focus-visible` 已用 `--tech-shadow-focus`。缺口：

- 暗色次要文字若回到 `rgba(255,255,255,0.36)` 会低于 4.5:1。当前 muted 约 `0.48`，小字勉强够，不要再降。
- 只靠颜色区分节点状态（选中、错误、Agent 正在改）不够，要同时有形状或文字。
- 图标按钮必须有 `aria-label`（项目规则已要求，实现时逐个表面核对）。
- `prefers-reduced-motion` 要覆盖面板弹簧和命令面板入场，不只是按钮。

### 2.10 字体

`--font-sans` 是 `-apple-system, SF Pro, system-ui`。这对桌面工具是对的，不要改成 Inter，也不要加展示字体。等宽字体继续用于路径、diff、终端。层级靠字号和字重的少量档位，不要再引入 `--font-size-2xl`（28px）做界面标题。欢迎页标题已是 22px / semibold，工作区标题应更小（13–16px）。

---

## 3. 改成什么样

不换布局。改的是同一套工作区里的材料：颜色、半径、边框、阴影、动效、状态的表达方式。

### 3.1 材料

沿用已经落地的暗色中性色，不要改回石板蓝或运行绿。

| 角色 | 暗色 | 用途 |
|---|---|---|
| 画布 | `#181818` | 窗口底 / 地图 / 编辑器（`editor.background`） |
| Chrome | `#141414` | 左右栏、顶栏、Terminal / bottom dock（`sideBar` / `panel` / `titleBar` / `terminal.background`） |
| 抬升 | `#1C1C1C` | 菜单、节点、编辑器里的浮层 |
| 悬停 | `#222222` | hover，不用投影抬起 |
| 边框 | `rgba(255,255,255,0.08)` | 分区，不是装饰 |
| 主文字 | `rgba(255,255,255,0.92)` | |
| 次文字 | `rgba(255,255,255,0.58)` | |
| 弱文字 | 不低于约 0.48 白 | 元数据，仍要可读 |
| 选中 / 主操作 | 现有蓝 `#4C7DFF` | 只标选中、焦点、主按钮 |
| 成功 / 警告 / 错误 | 现有绿 / 黄 / 红 | 状态，不拿来填按钮和气泡 |

浅色是同一结构的反相：冷灰底、白表面、同一蓝。不使用 iOS 系统蓝 `#007AFF` 作为身份色。

半径改为：

```text
--radius-sm: 6px
--radius-md: 8px
--radius-lg: 12px
```

删除或停止使用 `--radius-glass-*` 和 `--radius-pill`。标签用 6px，不用胶囊。

阴影默认没有。只有命令面板、菜单、对话框可以用一层很轻的 `--tech-shadow-md`。节点、步骤、聊天气泡不用投影。

### 3.2 各表面的完成形态

**欢迎。** 保持现在的左上角入口。不要加回预览插画、居中卡片、全宽色块按钮。错误要写明：浏览器预览没有桌面 IPC，示例项目要在桌面应用里打开。

**顶栏与面板。** 实色、1px 分隔、无模糊。折叠把手与面板同一材料。当前页（地图 / 代码 / Agent / Diff）在顶栏用位置和字重表示，不用发光。

**命令面板。** 顶部一条输入，下面按组排列的紧凑行（命令、文件、节点）。键盘高亮用背景色，不用位移。宽度约 480px，圆角 8px，无折射。

**功能地图。** 节点是平面矩形：名称、类型、一行状态。选中 = 1px 强调色边框。悬停 = 背景变 `--tech-bg-muted`。错误 / 运行中 / Agent 正在处理 = 角上的小点加文字，不只靠颜色。去掉 3D 挤出和重阴影。边表示关系，颜色数量保持很少。

**代码。** 编辑器贴在中栏里，头只有路径和保存状态。选区上的解释 / 修改 / 重构贴着选区，不另开一张营销卡。

**Diff。** 文件路径、增删统计、并排差异。通过 / 失败用成功色和错误色的细边，不用大徽章。

**对话。** 右栏保持上下文对话。用户内容与助手内容靠对齐和一条细边界限，用户气泡不要铺满强调色。Composer 是工作区底部的一条输入，圆角 8px。

**Agent。** 活动流示例（真实步骤，不造进度）：

```text
● 规划
  └─ 3 个文件
● 编辑  src/graph/layout.ts
● 测试  42 通过
✓ 完成
```

空闲时说明：询问节点或文件会在这里留下轨迹；确认修改后会看到执行。保留现有 `agentFlow.emptyDesc` 的信息，去掉 32px 装饰图标或改成 16px。

**空、加载、错误。** 每个空表面三句话：这是什么、为什么空、下一步（一个按钮）。加载写具体动作和真实数字。错误四行：发生了什么、原因、系统试过什么、用户可以做什么。

### 3.3 动效

交互 120–200ms，`--ease-out`。面板 200ms 滑入，不用 480ms 弹簧。命令面板只用透明度。`prefers-reduced-motion: reduce` 时去掉位移。

---

## 4. 怎么改（顺序）

每一阶段都应能单独运行，不重写组件树。

1. **Token。** 改 `tokens.css` 的半径；确认暗色 / 浅色 `--color-*` 与 `--tech-*` 仍指向同一套中性色。不新增第三套变量。
2. **全局。** 删掉或停用 `global.css` 里的 `.glass-*` 模糊类。侧边把手改为实色。动效时长改到 200ms 以内。
3. **替换引用。** 把各模块的 `--radius-glass-*`、`--radius-pill`、`--glass-border*`、`--glass-shadow*` 换成 `--radius-*` 和 `--tech-*`。优先：功能地图节点、Agent Flow、聊天、Diff、命令面板、文件树。
4. **节点。** 去掉 `FeatureNode` 的 3D 挤出，保留点击、选中、拖拽行为。
5. **Agent 活动流。** 在现有 step 数据上改行样式，使状态可读。不发明新的假进度。
6. **空 / 错 / 加载。** 只改文案和 `EmptyState` 的尺寸，补上欢迎页 IPC 错误的下一步说明。
7. **核对。** 桌面应用里打开示例项目，看地图、代码、对话、Agent、命令面板（⌘K）、浅色主题。浏览器只能看欢迎页。

不要做的事：不要引入 Tailwind、Inter、GSAP、自定义光标、渐变英雄区、玻璃滤镜、新的图标库。

---

## 5. 怎样算符合 ai-devtool-ui

开发完成时逐条回答。有一条否，就不能算完成。

| # | 问题 | 通过时的证据 |
|---|---|---|
| 1 | 像专业开发工具，还是像 SaaS 落地页？ | 无居中英雄区、无装饰插画、无大号标题 |
| 2 | 层次来自位置、字号、间距、对比，而不是渐变和阴影？ | 节点和步骤无重投影；分区靠 1px 边框 |
| 3 | 强调色是否只表示状态？ | 蓝 = 选中 / 主操作；绿 = 成功；气泡和节点不全被强调色填满 |
| 4 | 关掉模糊是否仍然完整？ | 源码中工作区表面没有 `backdrop-filter: blur` |
| 5 | 圆角是否在 6–14px？ | 无 `--radius-glass-*`、无胶囊标签 |
| 6 | 开发者能否不点五次就知道：我在哪、Agent 在做什么、改了什么、什么失败了、下一步？ | 顶栏有项目与当前面；Agent 流有真实步骤；Diff 有文件与结果 |
| 7 | 聊天是否只是工作区的一面？ | 右栏，且与地图 / 代码 / 执行可互相指向 |
| 8 | 地图是否像架构而不是思维导图？ | 平面节点，有类型和状态，无 3D 挤出 |
| 9 | 空、加载、错误是否可行动？ | 三句空状态；加载有真实进度；错误有下一步 |
| 10 | 动效是否快且可关？ | ≤200ms；`prefers-reduced-motion` 无位移动效 |
| 11 | 键盘是否清楚？ | 命令面板、按钮、输入有可见 `:focus-visible` |
| 12 | 对比度？ | 主文字 ≥4.5:1，次文字 ≥3:1，暗色和浅色都要看 |
| 13 | 是否复用现有 Button、Tab、EmptyState、命令面板？ | 不新造一套按钮 |
| 14 | 是否保留现有数据流和交互？ | 打开项目、选节点、对话、Diff、终端行为不变 |

`frontend-design-bold` 的「大胆、难忘」在本产品里的对应物是：地图、Agent、代码是同一套安静材料的三种视图。不是另一种视觉风格。

`ui-ux-pro-max` 在本产品里只保留：默认暗色、短动效、可见焦点、不用 emoji 当图标、对比度。不保留它给出的落地页结构和绿色 CTA。
