# Agent Memory：对标 Cursor / Devin / Codex / Claude Code 的开发计划

**状态**：MEM-0–MEM-5 已落地。模型提议只写 `observed`，采用前不进提示词。  
**范围**：跨会话、可审查的 **学习记忆**（agent 写下的笔记），以及它和已有 Rules / Skills、未来 Phase G、Part 7 检索的边界  
**权威交叉引用**：
- `agent-requirements.md` §2.2 / Part 4 **G** / Part 7 — 短暂实例、审计留痕、记忆准入、检索经纪人
- `docs/features/Agent-Harness-Dev-Plan.md` — Instructions 装配（H2.C 已落地）；完整 Memory Drive 原标 DEFERRED，本文件承接那一行
- `docs/features/Chat-Modes-Cursor-Parity-Dev-Plan.md` — `team_memory` 是 schema 残留，**不**作为 memory 产品入口
- Claude Code：[How Claude remembers your project](https://code.claude.com/docs/en/memory)
- Devin：[Memory and Dreaming](https://docs.devin.ai/product-guides/memory)
- Codex：[Memories](https://learn.chatgpt.com/docs/customization/memories)、[AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- Cursor：[Rules](https://cursor.com/docs/rules)（持久指令）；Cloud Automations 的 `MEMORIES.md`；BDK [memory journal](https://cursor.com/docs/bdk/reference/memory)
- 格式：[Agent Memory Repo](https://github.com/AgentMemoryRepo/agentmemoryrepo)（MIT，Cognition 开放规格）

**明确不复制**：
- 不把记忆当成写权限、范围或项目事实（Part 5：模型输出不是授权）
- 不因一次成功提交就把模型理由升成「项目真相」（Part 7 投毒约束）
- 不复活 `team_memory` 聊天模式；记忆是 instructions 旁的一层，不是第五种 mode
- 不做四家那种「每会话都让模型自由改记忆文件」的开放写。记忆写入走服务器校验
- 不做 Cursor BDK 式全用户共享 journal
- 不做 Devin 云端每日 Dreaming、组织/企业开关、额度门控（本地单用户桌面用不到）
- 不在本计划实现 Phase G 的每节点常驻 agent，也不实现 Part 7 的向量检索经纪人
- 不把 `.projectos/rules/` 重做成记忆库。Rules 仍由 Harness H2.C 负责

**对标目标一句话**：用户能让 agent 记住偏好、纠正和代码里看不出来的决策，下次会话用得上、看得到、删得掉；这些笔记始终是 **个人、可审计、非授权** 的上下文，项目真相仍在规则、代码和图里。

---

## 0. 术语：三层上下文，不要混

| 层 | 谁写 | 共享范围 | 我们今天 | 本计划 |
|----|------|----------|----------|--------|
| **指令 Rules** | 人（可提交） | 仓库 / 团队 | `.projectos/rules/**/*.md` 常驻注入 | 不重做。可选以后认 `AGENTS.md`，仍归 Harness |
| **Skills** | 人 | 仓库 | `.projectos/skills/` 按需 | 不重做。过程放 skill，事实放记忆 |
| **学习记忆 Memory** | agent 提议，服务器落盘 | 本机、本工作区、当前用户 | **无** | MEM-0 起 |
| **审计留痕** | 服务器 | 工作区 `.projectos` | run 事件、委托计划、校验结果 | 只作 `source` 引用，不自动入库 |
| **检索语料 RAG** | 索引器 | 按语料信任策略 | Part 7 设计笔记 | 本计划不做 |
| **常驻节点 agent** | — | 图节点 | Phase G DEFERRED | 本计划不做 |

四家产品的 memory 都是「同一个人跨会话的笔记」。Phase G 是「图上每个节点的常驻 agent」。本计划只做前者，并为后者留准入状态，避免以后推倒格式。

---

## 1. 四家怎么做（公开文档，2026-10）

共同骨架：

```text
会话开始 = 新上下文
  ├─ 人写的指令（AGENTS.md / CLAUDE.md / .cursor/rules）  常驻或按路径
  ├─ 学习记忆的短索引（MEMORY.md）                        常驻、有预算
  └─ 主题笔记                                             按需读，不整库注入
写入：偏好 / 纠正 / 代码推不出的决策
不写：密钥、会话摘要、任务状态（PR 号）、从代码或 git 能重新得到的结构
生效：新笔记从下一会话起，不回溯改当前会话
地位：上下文，不是权限。拦住动作靠 policy / hook，不靠提示词
```

| 维度 | Claude Code | Devin | Codex | Cursor | Project OS 取舍 |
|------|-------------|-------|-------|--------|-----------------|
| 人写指令 | `CLAUDE.md` 分层 + `.claude/rules/` 的 `paths` | Knowledge（触发器检索，团队共享） | `AGENTS.md` 从根走到 cwd，越近越后 | `.cursor/rules`：always / description / globs / @ | **已有** `.projectos/rules` 全量常驻。glob 以后归 Harness，不进本计划 |
| 学习记忆存在哪 | `~/.claude/projects/<repo>/memory/`，worktree 共用，不跨机器 | 个人 git Memory Drive，组织内不共享给队友 | `~/.codex/memories/`，默认关 | 按项目按个人；Automations 在工作区外的 `MEMORIES.md` | **本机用户目录，按工作区隔离**。不进 git，不当项目事实 |
| 启动注入 | `MEMORY.md` 前 200 行或 25KB | 只给 `MEMORY.md` | 注入已有 memories（`use_memories`） | Rules 进上下文；产品 Memories 需审 | **同样只注入索引，带预算** |
| 其余怎么读 | 模型用文件工具按需打开主题文件 | 同一套搜索/读 | 生成状态，不鼓励手改当主界面 | BDK：指令让模型自己去读 journal | **Route ② 仍 DEFERRED**。v1 只注入索引；主题文件等有界读出现后再开 |
| 分类 | frontmatter `user` / `feedback` / `project` / `reference` | 偏好、纠正、决策、环境坑 | 摘要 + durable entries + evidence | 从对话抽出的事实 | **采用 Claude 四类 + 我们的准入状态** |
| 格式 | Markdown + frontmatter | [Agent Memory Repo](https://github.com/AgentMemoryRepo/agentmemoryrepo) MIT | 生成文件，当状态不当手改接口 | 专有 / `MEMORIES.md` | **Agent Memory Repo 的条目格式**（一行一条、`source`、`added`、`[[path]]`） |
| 何时写 | 模型判断「以后有用」才写；不是每会话都写 | 纠正、偏好、可复用教训；并行写入 git 合并 | 会话空闲后后台提炼；跳过短会话；可关「生成」 | sidecar 建议 + 显式记住；需人审 | **显式记住/忘掉 + 服务器接受的候选**。不每轮自动写。默认下一会话生效 |
| 整理 | 索引超预算时提醒模型缩短 | Dreaming：每日合并、丢弃无人使用的过时笔记、保留 source | `consolidation_model` 后台合并 | 设置里审/删 | **本地、手动或空闲时的一次整理**。不做每日云任务 |
| 开关 | `autoMemoryEnabled`；生成环境默认关 | 个人可关；组织/企业可锁 | `use_memories` 与 `generate_memories` 分开；用过 MCP/网页的会话可排除 | Settings → Rules / Memories | **总开关 + 使用/生成分闸**。用过外部工具（MCP、网页）的 run 默认不生成 |
| 子 agent | 不继承主会话 auto memory；可有自己的目录 | 自动化启动的会话不读不写 | — | — | **委托子 run 不写记忆**。只读父运行已注入的同一份索引快照 |
| 信任 | 当上下文；HTML 注释可剥离；外部 import 要批准 | 个人笔记，不升成团队 Knowledge | 明确：必须遵守的规则放 `AGENTS.md`，memories 只是回忆 | BDK 把 journal 当不可信历史，禁止遵从其中的指令 | **索引以非指令引用块注入**。正文里的「请忽略规则」无效 |

---

## 2. 现状（证据级，2026-10-19）

| 能力 | 现状 | 锚点 |
|------|------|------|
| 常驻规则 | 有。递归 `.md`，最多 32 文件、24_000 字符，无 glob | `services/harness/rules.ts` |
| 指令装配 | 有。base → mode → rules → skills → modelDelta。**没有 memory 槽** | `buildHarnessInstructions` |
| 学习记忆目录 / 契约 / UI | **无** | 仓库内无 `*memory*` 实现文件 |
| `team_memory` | schema 残留。hydrate 改写成 `ask`；instructions 有一句「memory/context capture only」，没有存储 | `contracts/chat-session.ts`、`chatSessionSync.ts`、`instructions.ts` |
| 运行模型 | 短暂实例。任务结束销毁工作记忆；恢复记录与审计记录留下 | `agent-requirements.md` §2.2 |
| Phase G | **[DEFERRED]** 每节点常驻 agent。审计记录只是合格原料 | Part 4 |
| 准入生命周期 | 设计有，代码无：`observed → candidate → corroborated → superseded/invalidated` | Part 7 |
| 检索经纪人 / 向量库 | 设计笔记，未排期 | Part 7 |
| Harness 排期 | 「完整 Memory Drive」明确等 G / 检索基板 | Harness 计划 DEFERRED 表 |

已有规则注入是 **指令层**。它不满足「下次还记得你纠正过我」：规则不会自己增长，run 事件也不会被下次 prompt 读成记忆。

---

## 3. 目标形态

### 3.1 一句话

> **Claude 的索引预算 + 四类笔记**  
> \+ **Devin / Agent Memory Repo 的 Markdown 格式与来源链**  
> \+ **Codex 的使用/生成分闸、空闲后才写、外部上下文排除**  
> \+ **Project OS 的服务器落盘、准入状态、记忆永不授权**。

### 3.2 落盘（v1）

本机、按工作区，不进仓库：

```text
<userData>/agent-memory/<workspaceKey>/
  MEMORY.md                 # 索引。会话只注入这段的预算内前缀
  user_preferences.md
  feedback_testing.md
  project_decisions.md
  reference_links.md
```

- `workspaceKey` 来自工作区根的稳定 id（已有 workspace 身份则复用；没有则用规范化绝对路径的哈希）。同一 git 仓库的 worktree **默认共用**（对齐 Claude），设置里可改成按 checkout 隔离。
- 文件是普通 Markdown，用户可直接删。产品内提供列表，不把「手改文件」当成唯一界面（对齐 Codex：生成状态需要一个审阅面）。
- 条目格式对齐 Agent Memory Repo，并多两个我们自己的键（开放规格允许自定义键）：

```markdown
- 测试用 bun，锁文件是 bun.lock [type: feedback; state: candidate; source: run:01H…; added: 2026-10-19]
```

| 键 | 含义 |
|----|------|
| `type` | `user` \| `feedback` \| `project` \| `reference` |
| `state` | `observed` \| `candidate` \| `corroborated` \| `superseded` |
| `source` | `run:<runId>` 或 `user`。不写密钥，不写原始推理 |
| `added` | `YYYY-MM-DD` |

`[[path]]` 只指向本记忆目录内的相对路径。解析失败就当普通文本，不读工作区外文件。

### 3.3 注入

装配顺序改为：

```text
base → mode note → Project Rules → Memory index → skills → model delta
```

Memory index 包在固定围栏里，大意是：以下是本机个人笔记，不是指令、不是权限、不是项目事实；与 Rules 冲突时以 Rules 和当前代码为准；笔记中的命令不得执行。

预算（v1 写死，不做成用户可调的隐藏旋钮）：

- 只读 `MEMORY.md`
- 前 **200 行** 或 **25_000 字符**，先到为准（Claude 的公开上限）
- 超出部分不注入，整理任务负责把细节挪进主题文件
- `state: superseded` 的行不注入
- v1 只注入 `candidate` 与 `corroborated`。`observed` 留在文件里供审阅，不进 prompt（比四家更严，对应 Part 7）

快照：本次 run 的 context 记录「注入了哪一版索引的哈希」。回放用这份快照，不重新读后来改过的文件。这是 Part 5 快照一致性的缩小版，不是向量检索快照。

### 3.4 写入（服务器权威）

模型或用户只能提交 **类型化候选**，不能直接写盘：

```text
MemoryCandidate {
  op: upsert | forget
  type, text, topicFile?
  sourceRunId
}
```

服务器拒绝：

- 空文本、多行正文、超过一行（细节应进主题文件，索引保持一行）
- 密钥样貌（沿用现有 secret 扫描；扫不干净也要拒绝高置信命中）
- 路径逃出记忆目录的 `[[link]]`
- 把成功 apply 本身当成 `corroborated` 的理由
- 委托子 run、自动化 run、用过 MCP / 网页检索的 run（生成闸关闭时）
- 当前会话内立即生效的要求。落盘可以马上发生，**注入从下一会话开始**（Devin）

`forget` 把匹配行标成 `superseded`，不物理删除，便于审计。用户在设置里「删除」才物理删除。

谁可以标 `corroborated`（v1 极窄）：

- 用户明确说「记住」→ `candidate`（显式人意，仍不是项目事实）
- 用户在审阅里点「采用」→ `corroborated`
- 不自动从绿测、成功提交或模型自评升级

这比四家少做「模型自己决定记住」。换来的是不把投毒路径放进第一版。MEM-3 再允许模型提议 `observed`，仍不自动进 prompt。

### 3.5 记什么

| 记 | 不记 |
|----|------|
| 用户怎么协作、用语、工具偏好 | 会话摘要、聊天记录全文 |
| 用户纠正过的做法，以及下次该怎么做 | PR 号、分支名、临时端口、任务进度 |
| 代码和 git 推不出来的决策与理由 | 架构、路径、从仓库能重新读到的事实 |
| 仓库外的指针（issue 跟踪、内部文档入口），标 `reference` | 密钥、token、cookie、连接串 |
| | Rules / Skills 里已经写过的话 |

---

## 4. 切片

### MEM-0 — 契约与目录（无模型调用）

**目标**：格式和存储可测，还没有任何 prompt 变化。

- [x] `contracts/agent-memory.ts`：`MemoryEntry`、`MemoryCandidate`、`MemoryAdmissionState`、`MemoryNoteType`。
- [x] 存储：解析 / 序列化 Agent Memory Repo 行；损坏行跳过并计入诊断，不抛到整次聊天失败。
- [x] 目录创建在 userData，不在仓库内。测试用临时目录。
- [x] `superseded` 保留、`forget` 不物理删。
- [x] 单测：预算截断、状态过滤、链接逃逸拒绝、哈希快照稳定。

**验收**：给定一份 `MEMORY.md`，注入文本可复现，且不含 `observed` / `superseded`。

### MEM-1 — 只读注入

**目标**：已有笔记进入下一轮 instructions，仍不能写。

- [x] `buildHarnessInstructions` 增加可选 `memoryIndexMarkdown`，位置在 Rules 之后、Skills 之前。
- [x] Ask / Change / Plan / Debug 的 create-run 路径都走同一装配点（今天 Ask 与 Change 的注入口不一致，本切片把 memory 只接在 `buildHarnessInstructions`，不新开第二份拼接）。
- [x] 围栏文案固定、可单测，标明非指令、非授权。
- [x] context 事件带上索引哈希与截断标记。`memory_index_bound` 只记录 hash、truncated、entryCount，不把笔记全文抄进 Agent Flow。空索引不发这条事件。
- [x] 子 run 接收父 run 已冻结的索引文本，不自己再读盘。

**验收**：关掉总开关则零注入；打开且文件为空则零注入；有 `candidate` 行则出现在 system 侧且带围栏。

### MEM-2 — 显式记住 / 忘掉

**目标**：用户一句话能留下或废止一条，下一会话生效。

- [x] 意图只走服务器：用户消息匹配显式记住/忘掉。不靠模型自觉调用工具。设置里另有审阅，没有单独的 composer 按钮。
- [x] 记住 → `candidate` + `source: user` 或当前 `runId`。忘掉 → `superseded`。
- [x] 当前 run 的 prompt **不**重读刚写完的文件。Ask 用开口时的快照；Change 把同一份快照挂在 refinement 上，确认执行时传入。
- [x] 写入真实发生时用 toast 说明。拒绝（含密钥）也提示，原文不进事件。
- [x] 密钥样貌拒绝并告诉用户没保存，不把原文再写进事件。

**验收**：记住后新开会话能看见；同一会话的下一轮模型调用仍用旧快照；忘掉后新会话不再注入该行，文件里仍留 `superseded`。

### MEM-3 — 模型提议（仍默认不进 prompt）

**目标**：对齐 Claude「值得以后再用才记」，但提议停在 `observed`。

- [x] 仅在 run **结束且空闲**之后跑一次提取。`run_completed` 之后用微任务排队，默认再等 1.2s；期间若同项目还有 running run，则继续推迟。
- [x] 跳过：短于 80 字、失败/回滚、子 run、用过 MCP 的 run、生成闸或总开关关闭。
- [x] 提取结果经 `proposeObserved` 写成 `state: observed`。服务器仍做密钥、链接和长度拒绝。成功改文件也不会把条目升成 `candidate`。
- [x] 不把 provider reasoning 送进提取输入。只用用户原话和截断后的计划投影。
- [x] UI：observed 可「采用」为 `candidate`，或「始终采用」为 `corroborated`。丢弃 → `superseded`。observed 不进入下一轮系统提示，直到用户采用。

**验收**：成功改文件不会自动多出一条 `candidate`。待审条目不出现在下一次 system prompt 里，直到用户采用。

### MEM-4 — 审阅与开关

**目标**：对齐四家的「看得到、关得掉」。

- [x] 设置：总开关（默认 **关**）、`use` 与 `generate` 分闸。`generate` 由 MEM-3 的提取钩子消费。
- [x] 列表按 type / state 过滤；可打开主题文件原文；可物理删除。主题原文走 `getAgentMemoryTopic`，不交给模型当文件工具。
- [x] 文案写明：这是本机个人笔记，不会提交，也不会变成图上的事实。
- [x] i18n en/zh。

**验收**：生成闸关、使用闸开时，旧 `candidate` 仍注入，新 run 不产生 `observed`。

### MEM-5 — 本地整理（Dreaming 的缩小版）

**目标**：索引保持在预算内。不做每日模型任务。

- [x] 用户触发，索引超过预算的 80% 时在设置里提示，不自动烧一次模型调用。
- [x] 整理合并重复行，并把 `superseded` 留在底部。不调用模型，也不把长解释改写进主题文件。
- [x] 两条非用户来源的重复行合并后，`source` 标为 `consolidate`。任一侧是 `source: user` 时保留 `user`，整理不会删掉用户写下的行。

**验收**：整理后注入文本变短，用户显式记下的行还在。

### 明确不做（本文件的 DEFERRED）

| 项 | 放到哪 |
|----|--------|
| 每节点常驻 agent、按节点一份记忆 | Phase G |
| 向量库、检索经纪人、把 run 档案索引成语料 | [`RAG-Dev-Plan.md`](RAG-Dev-Plan.md)。届时 memory 只是其中一个语料，且只有 `corroborated` 可检索 |
| 主题文件按需读 | 等 Route ② 或 Ask 有界读。在那之前加开会把「索引预算」打穿 |
| `.projectos/rules` 的 globs / description 触发 | Harness，另开切片 |
| 自动读仓库里的 `AGENTS.md` | Harness。与 Rules 重复注入要先定优先级 |
| 团队共享记忆、组织强制开关 | 无多用户产品前不做 |
| 跨机器同步 | 不做。要同步就让用户自己抄进 Rules 并提交 |

Phase G 开工时的衔接（现在不写代码）：一个节点的常驻记忆 **复用同一格式与准入状态**，目录多一个 `nodeId` 段；全局个人索引不自动复制到节点。Part 7 开工时：只有 `corroborated` 且未 `superseded` 的条目可进检索，`observed` 永不作为「先前知识」。

---

## 5. 依赖

```text
Harness H2.C buildHarnessInstructions     （已有）
        │
        ▼
MEM-0 格式与目录
        │
        ▼
MEM-1 只读注入 ──► MEM-2 显式记住/忘掉 ──► MEM-4 设置与审阅
                            │
                            ▼
                     MEM-3 结束后提议 observed（可与 MEM-4 并行）
                            │
                            ▼
                     MEM-5 手动整理

以后：Phase G 按节点目录 │ RAG 计划只检索 corroborated（见 RAG-Dev-Plan.md）
```

MEM-0 与 MEM-1 不依赖 S 系列，也不依赖 tool loop。MEM-3 依赖「run 结束」信号，不依赖新的模型工具。

---

## 6. 不变量（实施时不得放宽）

- 记忆是 **非指令引用**。不得把 `MEMORY.md` 拼进 system prompt 的规则段，伪装成和 `.projectos/rules` 同级权威。
- 记忆 **不改变** `allowedReadPaths` / `allowedWritePaths`、tool policy、图 scope。
- 成功的 apply / verify **不得**把任何条目升到 `corroborated`。
- 原始推理、完整 diff、文件正文 **不得**写入记忆目录。
- 子 run **不得**写记忆。
- 注入用 run 开始时的哈希快照。会话中途改文件不影响本次。
- 持久化失败要表面化，禁止吞掉后仍显示「已记住」。

---

## 7. 建议排期

| 顺序 | 切片 | 体量 | 产出 |
|------|------|------|------|
| 1 | MEM-0 | S | 契约 + 解析 + 目录 |
| 2 | MEM-1 | S | 下一会话能读到已放进目录的笔记 |
| 3 | MEM-2 | M | 用户显式记住/忘掉 |
| 4 | MEM-4 | M | 开关与审阅（否则默认关的功能不可发现） |
| 5 | MEM-3 | M | 模型提议，默认不注入 |
| 6 | MEM-5 | S | 预算内整理 |

MEM-3 放在审阅之后：没有审阅界面时，自动提议只会堆在磁盘上。

---

## 8. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-10-19 | 初稿。对照 Claude Code auto memory、Devin Memory Drive / Dreaming、Codex local memories、Cursor Rules 与 Automations/BDK memory，以及 `agent-requirements` G / Part 7、Harness H2.C 现状 |
| 2026-10-19 | MEM-0/1/2/4 与确定性 MEM-5：`contracts/agent-memory.ts`、`services/harness/memory.ts`、指令围栏、设置审阅、显式记住/忘掉。MEM-3 未做 |
| 2026-10-19 | MEM-1 哈希事件、MEM-3 `observed` 提议、设置过滤与主题原文、合并来源 `consolidate` |
| 2026-10-19 | 检索经纪人改指向 [`RAG-Dev-Plan.md`](RAG-Dev-Plan.md) |
