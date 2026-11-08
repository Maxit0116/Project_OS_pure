# Agent Flow Clean + Live UX — Dev Plan

**状态**：M0–M2 implemented（2026-11-08）。M3 仍明确延期。  
**产品名**：Agent Flow Clean Live UX（代码前缀建议：`liveStatus` / `flowRow`）  
**范围**：把 Agent Flow（悬浮窗 Timeline/Graph/Inspector + Chat 侧栏 activity 缩略行）收成 **Cursor 式整洁、可折叠、有 live 反馈** 的过程表面。本计划是 **展示层 UX**，不改写权限、不新开 tool loop、不伪造未发生步骤。  
**权威交叉引用**：

| 文档 | 关系 |
|------|------|
| [`Agent-Flow-Activity-Dev-Plan.md`](./Agent-Flow-Activity-Dev-Plan.md) | 侧栏缩略 ↔ 悬浮窗证据已定；**侧栏仍默认不展开思维链**；本计划强化「一行摘要 + 可选 `>` 展开」在悬浮窗内的一致性 |
| [`Agent-Flow-Inspector-Pane-Dev-Plan.md`](./Agent-Flow-Inspector-Pane-Dev-Plan.md) | 左骨架 / 右检视已落地；本计划继续 **减轻左列卡片感**，细节优先进右栏或折叠体 |
| [`Agent-Pool-Waterfall-UX-Dev-Plan.md`](./Agent-Pool-Waterfall-UX-Dev-Plan.md) | Pool 主 liveness = growing bar + playhead；本计划 **不** 给 Pool 加装饰性无限 shimmer；仅允许 status label 极轻 breath，与 waterfall 并存 |
| [`Chat-Modes-Cursor-Parity-Dev-Plan.md`](./Chat-Modes-Cursor-Parity-Dev-Plan.md) | Cursor 对标心智：过程默认收起、展开才见证据 |
| `.cursor/rules/liquid-glass-ui.mdc` / tech tokens | 无玻璃、少边框、`--tech-*`；无限动画仅用于 live/loading |

**实现锚点（规划）**：

| 层 | 落点 |
|----|------|
| Live 原语 | 新建 `components/ui/LiveStatusPulse.tsx` + `LiveStatusPulse.module.css`（dot / label shimmer） |
| 侧栏缩略 | `AgentActivitySummaryRow` |
| Timeline 行 | `AgentFlowStepRow` |
| Action / Activity 详情 | `AgentActionRow`、`AgentActivityDetails`、左列 phase 内联块 |
| Ask/Plan running | `AskTraceView` / `PlanTraceView` + `AgentActivityIndicator` / `ThinkingOrb` |
| Pool（轻触） | `AgentPoolRow` `data-pulse` 真正生效为 **label opacity breath**（非扫光主语言） |
| Graph（可选 M2） | `AgentFlowGraph` running 节点边框 breath |
| Tokens / motion | `tokens.css` 或 `motion.css`：`liveBreath` / `liveShimmer` + `prefers-reduced-motion` |
| i18n | 仅新增折叠 a11y 文案时改 `agentFlow.*`（en + zh） |
| 测试 | 行折叠默认态、running 挂 live class、reduced-motion 无无限动画 |

**明确不做（本计划）**：

- 不改 Activity 契约字段；不新增伪造 thinking / writeFile theater
- 不把完整 diff / 未截断 stdout 塞进折叠行（Diff 仍走中间栏；证据预算不变）
- 不把 Chat 侧栏变成可展开思维链（Activity Dev Plan 硬规则保留）
- 不用强 glow、彩虹扫光、多元素 bouncing；不用卡片堆叠「伪仪表盘」
- 不重做 Pool waterfall 主运动语法
- 不做列宽持久化 / 虚拟列表（可进后续）

**对标目标一句话**：Agent Flow 默认像 Cursor——**一行动词 + live 亮暗，细节藏在 `>` 后**；去掉臃肿可见边框，一眼扫完过程，需要时再展开核对。

---

## 0. 核心诉求（本文锁定）

用户连续提出的两层诉求，合并为本计划的单一产品目标：

| # | 诉求 | 用户要回答的问题 | 本计划对应 |
|---|------|------------------|------------|
| 1 | **Live 反馈** | 后端正在 thinking / writeFile / shell… 时，界面有没有在动？ | Cursor 式亮暗呼吸 / 文字 shimmer，仅挂在 `running` |
| 2 | **去臃肿** | 为什么满屏卡片边框？能不能像 Cursor 一样干净？ | 去掉多余 visible border；用间距与字重分层 |
| 3 | **渐进披露** | 默认要不要看细节？ | 默认折叠：一行摘要 + `>`；用户点开才看 detail |
| 4 | **整洁扫读** | 打开 Agent Flow 能否一眼看完流程？ | 左列骨架极简；长文进 Inspector 或折叠体 |

**价值链**：

```text
运行中的 agent
  → 每一活着的步骤/活动：一行摘要 + live 亮暗
  → 默认不摊开 reasoning / meta / stdout
  → 用户点 `>` 或选中进 Inspector 才看细节
  → 完成：动画停，保留简洁完成态
```

**一句话验收心智**：跑起来时能感到「还在干活」；停下来时界面仍干净，不像一堆带框卡片。

---

## 1. 证据级现状（痛点清单）

### 1.1 Live 几乎静止

| 表面 | 文件 | 今日 | 缺口 |
|------|------|------|------|
| Chat activity 行 | `AgentActivitySummaryRow` | `.running .mark` 静态色点 | 无 pulse / shimmer |
| Timeline step | `AgentFlowStepRow` | 黄色实心 `Circle` | 无呼吸 |
| Ask/Plan running | `AskTraceView` / `PlanTraceView` | `AgentActivityIndicator` | `ThinkingOrb` 已是静态点 |
| Timeline streaming hint | `AgentFlowPanel` | 同上 | 静态 |
| Thinking pending 文案 | `AgentActivityDetails` | 纯文字 | 无 live |
| Pool `data-pulse` | `AgentPoolRow.module.css` | `opacity: 0.92` 固定 | **脉冲未真正实现** |
| Graph running 节点 | `AgentFlowGraph` | 黄边框 | 无 breath |

### 1.2 边框过重（「卡片墙」）

| 表面 | 今日边框语言 | 问题 |
|------|--------------|------|
| `AgentActionRow` | `1px` + 左侧 `3px` accent 卡片 | 每条动作一块牌，视觉噪 |
| `AgentActivityDetails` | elevated card + border | 详情像第二套面板 |
| `AgentFlowStepDetail` / Inspector 若干段 | glass/tech border 卡片 | 与左列重复卡片感 |
| `AgentPoolRow` | 整行 `1px` 边框卡片 | Pool 可保留弱分隔，但 Timeline 不应同级厚重 |
| 各类 `statusBadge` | pill + border | 可保留极轻，或改为纯色文字 |

### 1.3 展开模型不统一

| 今日 | 问题 |
|------|------|
| 部分 reasoning 用 `<details>` | 有雏形，但默认仍常露出过多 meta |
| Action 行总是展开全部 `ul` meta | 无法「只看动词」 |
| Activity detail 在 Inspector / 左列常整卡展开 | 与 Cursor「一行 Thinking ▸」相反 |
| 侧栏 activity **故意不可展开**（已定） | 本计划 **不改**；悬浮窗内才做 `>` |

---

## 2. 设计原则（硬规则）

来自 ui-ux-pro-max（AI-Native + minimal chrome + subtle motion）与本仓 tech theme 的合成：

1. **默认一行。** Timeline / 活动 / action 默认只显示：状态标 + 动词摘要（+ 可选短对象）。细节折叠。
2. **边框是例外，不是默认。** 分隔优先用空白、字重、muted 色；hairline 仅用于真正的区域分界（如 Inspector 左右分栏）。禁止「每行一卡片」。
3. **Live 只服务 running。** `complete` / `error` / `skipped` 无无限动画。连续动画数量：同一视口 **1–2 个** 焦点即可（当前 running 行），避免整列闪烁。
4. **动效语言统一。**  
   - **主**：label shimmer 或 opacity breath（Cursor 式亮暗）  
   - **辅**：小圆点 breath  
   - **禁**：强 glow、装饰性 bounce、Pool 上再叠扫光主语言
5. **`prefers-reduced-motion: reduce`** → 静态略亮/略暗，无循环。
6. **诚实。** 无活动不假装 Thinking；无写文件不显示 Writing。
7. **侧栏规则不变。** Chat `AgentActivitySummaryRow` 仍不可展开 detail；只加 live 动效与去噪。
8. **Inspector 仍是长文主表面。** 左列折叠 ≠ 消灭证据；展开或选中后右栏可读全文。

### 2.1 视觉语法（目标）

```text
▸ Thinking················     ← running：文字亮暗 / 点呼吸；无框
▸ Read auth.ts                 ← complete：静态；点 `>` 展开路径/片段
▸ Edited VoiceInput.tsx        ← complete
  └ (expanded)
      L12–40  +3 −1
      Open diff →
```

- 折叠指示：**ChevronRight / `>`**（lucide），`aria-expanded`
- 选中态：背景微亮或左侧 2px accent hairline，**不要** 整卡描边
- Running 色：沿用 `--color-accent` 或现有 warning 语义二选一——**本计划锁定为 accent 系亮暗**（少用大黄块，避免「警告」误读）；step running 可从 warning 圆点改为 accent breath

### 2.2 ui-ux-pro-max 约束摘要

| 项 | 采纳 |
|----|------|
| Continuous animation | 仅 loading/live |
| Excessive motion | 每视图 1–2 个关键动效 |
| Reduced motion | 必做 |
| Minimal chrome / AI-Native | 少边框、一行摘要、typing/pulse 类反馈 |
| Density 8 | 保持 IDE 密度，靠折叠而不是加大留白 |

---

## 3. 优化范围（更新后的工作清单）

### Pillar A — Live Status（Cursor 亮暗）

| ID | 工作项 | 优先级 |
|----|--------|--------|
| A1 | 共用 `LiveStatusPulse`（`dot` \| `label`） | P0 |
| A2 | `AgentActivitySummaryRow` running → pulse | P0 |
| A3 | `AgentFlowStepRow` running → pulse | P0 |
| A4 | `AgentActivityIndicator` / `ThinkingOrb` working 态 breath | P0 |
| A5 | Ask/Plan running、streaming hint 接入 | P0 |
| A6 | `AgentPoolRow` `data-pulse` 改为真实 label breath（轻） | P1 |
| A7 | Graph running 节点边框 opacity breath | P2 |

### Pillar B — De-card / 去可见边框

| ID | 工作项 | 优先级 |
|----|--------|--------|
| B1 | `AgentActionRow`：去卡片边框与厚 left bar；改为扁平行 | P0 |
| B2 | `AgentActivityDetails`：去 elevated card border；列表扁平 | P0 |
| B3 | Timeline / correction / automatic-summary：去掉非必要 `1px` 框 | P0 |
| B4 | Inspector 内段：保留分栏 hairline；去掉段内重复卡片框 | P1 |
| B5 | statusBadge：能去边则去边，改文字色语义 | P1 |

### Pillar C — Progressive disclosure（`>` 折叠）

| ID | 工作项 | 优先级 |
|----|--------|--------|
| C1 | `AgentActionRow`：默认只显示标题行；meta `ul` 折叠 | P0 |
| C2 | Timeline 下挂 activity/action：默认一行 + chevron；展开才见 detail | P0 |
| C3 | Reasoning / thinking 正文：左列仅标记或短摘要；全文在 Inspector 或显式展开 | P0（与 Inspector 计划对齐，补齐残留内联） |
| C4 | `AgentActivityDetails`：若仍出现在左列，包一层可折叠；Inspector 内可默认展开选中项 | P1 |
| C5 | 键盘：Enter/Space 切换；`aria-expanded` / `aria-controls` | P0 |

**不在本计划改**：Chat 侧栏 activity 展开规则。

---

## 4. 里程碑

### M0 — 原语 + 最高频 live（0.5–1 天）

- [x] `LiveStatusPulse` + CSS（breath + optional shimmer）+ reduced-motion
- [x] 接到 `AgentActivitySummaryRow`、`AgentFlowStepRow`、`ThinkingOrb` / `AgentActivityIndicator`
- [x] Ask/Plan running + streaming hint 统一 live 原语（label shimmer）

**验收**：running 可见动效；complete 静止；开系统「减少动态效果」后无循环。

### M1 — 去卡片 + 折叠 Timeline/Action（1–2 天）

- [x] `AgentActionRow` / `AgentActivityDetails` / timeline 相关 CSS 去可见边框
- [x] Action / step / activity 详情默认折叠，`>` 展开
- [x] 选中态用背景/微 hairline，不用粗框
- [x] phaseMarker / delegationSummary / statusBadge / correction / automaticSummary 去卡片框
- [x] 单测：`AgentFlowCleanLiveUx.test.tsx`（默认折叠 + live 标记）

**验收**：Timeline 扫读呈「行列表」而非「卡片堆」；默认不展示长 meta；展开可恢复证据。

### M2 — Ask/Plan/Inspector/Pool 收尾（0.5–1 天）

- [x] Thinking pending 文案接入 live；Inspector reasoning 去厚卡片
- [x] Pool label breath（`data-pulse` 兑现；不破坏 waterfall）
- [x] AskTraceView 去卡片边框；AgentActivityIndicator label shimmer
- [x] Graph running 节点 accent breath（`AgentFlowGraph.module.css`）
- [x] Inspector activity：`preferExpandSelected` 默认展开选中项

**验收**：三 tab 视觉语言一致（扁平行 + live）；Pool 仍以 bar/playhead 为主 liveness。

### M3 — 明确延期

- 虚拟列表、列宽拖拽持久化
- Activity 契约扩展、开放 tool loop
- 侧栏可展开思维链
- 自定义每 kind 不同动画角色（thinking vs writeFile 异形动效）——v1 共用一套 live 语言即可

---

## 5. 文件级变更清单（实施时）

| Path | 操作 |
|------|------|
| `docs/features/Agent-Flow-Clean-Live-UX-Dev-Plan.md` | 创建（本文） |
| `workbench/src/components/ui/LiveStatusPulse.tsx` | 新建 |
| `workbench/src/components/ui/LiveStatusPulse.module.css` | 新建 |
| `workbench/src/components/ui/ThinkingOrb.tsx` / `.module.css` | 可选：working 态委托 LiveStatusPulse |
| `workbench/src/components/ui/AgentActivityIndicator.*` | 接入 live |
| `workbench/src/components/AgentFlow/AgentActivitySummaryRow.*` | live + 去噪 |
| `workbench/src/components/AgentFlow/AgentFlowStepRow.*` | live + 选中去粗框 |
| `workbench/src/components/AgentFlow/AgentActionRow.*` | 去卡片 + 默认折叠 |
| `workbench/src/components/AgentFlow/AgentActivityDetails.*` | 去卡片；可选折叠 |
| `workbench/src/components/AgentFlow/AgentFlowPanel.*` | phase 附属折叠；streaming hint |
| `workbench/src/components/AgentFlow/AskTraceView.tsx` / `PlanTraceView.tsx` | live 统一 |
| `workbench/src/components/AgentFlow/AgentFlowInspector.module.css` | 去段内重框 |
| `workbench/src/components/AgentFlow/AgentPool/AgentPoolRow.module.css` | 兑现 `data-pulse` |
| `workbench/src/styles/motion.css`（或 tokens） | 共享 keyframes（若多处复用） |
| `workbench/src/i18n/locales/en.ts` / `zh.ts` | 折叠 a11y 文案（如需） |
| 相关 `*.test.tsx` | 默认折叠 / live class / 无回归 |

**预计契约变更**：无（纯 UI）。

---

## 6. 与既有计划的边界

| 话题 | 归谁 |
|------|------|
| summary/detail 数据模型 | Activity Dev Plan（已实现） |
| 右栏 Reasoning Inspector | Inspector Pane Dev Plan（已实现） |
| Pool waterfall 运动 | Pool Waterfall UX Dev Plan |
| **扁平行 + `>` + live 亮暗** | **本文** |

冲突裁决：

- 与 Pool「禁止装饰 shimmer 作主 liveness」：**一致**——Pool 主运动仍是 bar；本计划只给 status **文字**极轻 breath。
- 与 Activity「侧栏不可展开」：**一致**——侧栏只加 live，不加展开。
- 与 Inspector「长文在右」：**一致**——左列折叠后，细节更应进右栏或显式 `>`。

---

## 7. 验收清单（发布前）

### Visual

- [ ] Timeline / Action / Activity 默认无「每行一框」卡片墙
- [ ] Running 行有 Cursor 式亮暗；完成即停
- [ ] 折叠行仅一行摘要；`>` 旋转或指向表达状态
- [ ] 无 emoji 状态图标；lucide 一致

### Interaction

- [ ] 点击 `>` / 行首控件切换展开；不误触选中逻辑（或明确：点行选中、点 chevron 展开）
- [ ] 键盘可操作；`aria-expanded` 正确
- [ ] `prefers-reduced-motion` 下无无限动画

### Product honesty

- [ ] 无活动不显示 Thinking live
- [ ] 侧栏仍不展开思维链
- [ ] Diff / 完整输出路径未被本计划破坏

### Regression

- [ ] Inspector 选中 / follow-live 仍可用
- [ ] Pool waterfall 与 History 无回归
- [ ] 现有 AgentFlow panel / inspector / phaseTrace 测试更新并通过

---

## 8. 实施顺序建议

```text
M0 LiveStatusPulse → SummaryRow + StepRow + ActivityIndicator
  → M1 ActionRow/ActivityDetails 去边框 + 默认折叠
  → M1 Panel phase 附属折叠对齐
  → M2 Ask/Plan/Inspector/Pool 收尾
  → 视觉走查（暗色 tech theme）+ reduced-motion
```

---

## 9. 讨论锁定摘要（给实现者）

**用户要的不是「更多状态色块」，而是：**

1. 正在执行 → **看得见在动**（亮暗）  
2. 默认 → **看不见细节边框墙**  
3. 需要时 → **`>` 自己打开**  

做完后，Agent Flow 应更接近 Cursor 的过程条：干净、可扫、可展开、live 时有呼吸感。
