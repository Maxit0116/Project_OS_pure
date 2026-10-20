# Code Intelligence：代码事实层开发计划

**状态**：CI-0–CI-4 已落地（2026-10-20）。Ask / 规划的 `kind: "symbol"` 由 RAG-9 经 `lookupSymbols` 回源；叶子 Change 仍不靠检索决定写路径。向量检索（RAG-5）仍关。  
**范围**：让 Agent 回答「这个符号在哪、谁引用它、改这个文件会碰到哪些文件和哪些功能图节点」。  
**总计划**：[`Backend-Dev-Plan.md`](Backend-Dev-Plan.md) Phase 1–2。  
**不要和这些文档混写**：

- C4 / 结构图：[`structure-graph-impact.ts`](../../../projectos/services/structure-graph-impact.ts) 走的是架构节点的边，不是函数调用。
- 文件职责描述：`contracts/code-file-understanding.ts`、`services/code-file-understanding-service.ts`。描述是给人和上下文看的句子，哈希过期后不能当代码事实。
- 检索块索引：`services/retrieval/code-index.ts` 按 40 行切块做词法搜索。它不是符号表。
- 写授权：`services/file-owner-resolution.ts`。本计划产出的路径只读，不进入 `allowedWritePaths`。

**对标一句话**：架构图回答系统由什么组成；代码索引回答文件、符号和影响面。两者用路径、内容哈希和节点 id 关联。

## 0. 现状（2026-10-20）

| 能力 | 现状 | 锚点 |
|------|------|------|
| 仓库文件进入功能图 | 有。文件挂到节点，未挂接的文件不能写 | `file-owner-resolution.ts`、`semantic-tree-files.ts` |
| 结构图扫描与节点影响 | 有。沿图的边和包含关系走，默认深度 2 | `structure-graph-ai-scan.ts`、`structure-graph-impact.ts` |
| 文件描述 | 有。模型写 `description` 和 `role`，绑定 `contentHash`。没有自动在哈希变化后标过期 | `code-file-understanding-store.ts` |
| TS/JS 静态 import 反向依赖 | 有。只服务删除修复，只覆盖 import/export 说明符，不解符号 | `dependency-impact-scanner.ts` |
| 编辑器符号 | 有。LSP 的 document symbol 给大纲和诊断，不进 Agent 上下文 | `workbench/src/lsp/`、`desktop/src/main/lsp/` |
| 词法代码块 | 有。块 id 是内容哈希，变更流作废旧 quote | `retrieval/code-index.ts` |
| 符号表、引用、调用图 | 无 | 检索经纪人对 `kind: "symbol"` 直接拒绝 |

所以今天「这个函数在哪」只能靠词法碰巧命中。「谁调用了它」和「改它要跑哪些测试」没有结构化答案。

## 1. 目标数据

两套数据，不合并进 C4 节点。

```text
Architecture Graph（已有）
  nodeId、层级、边、linkedFiles

Code Intelligence Index（本计划）
  file: path + contentHash + language
  symbol: id + kind + name + path + startLine + exported
  reference: fromSymbolId → toSymbolId，或 file → file（import）
  understanding: path + contentHash + description + role（已有文档，补过期）
```

`symbol.id` 用 `path + kind + name + startLine` 的稳定哈希。行号变了就是新 id，旧 id 作废。不要用模型生成的描述当 id。

功能图节点不内嵌符号列表。查询时用 `FileEntry.nodeIds` 把路径映射回节点。一个文件多个节点时，结果带上全部 `nodeIds`，由现有归属规则决定能不能写。

## 2. 语言范围

v1 只索引 TypeScript 和 JavaScript，包含 JSX/TSX。与 `DependencyImpactScanner` 的扩展名一致。其他语言的文件出现在文件清单里，符号索标记 `unsupported_language`，不假装有符号。

解析器用 TypeScript 编译器 API 或仓库里已经依赖的解析器。不用正则抽取函数名。引入新解析器时写明许可证和它不理解的语法（例如 Vue SFC、Python）如何 omission。

## 3. 切片

### CI-0 — 文件清单与过期描述

**目标**：先有一份可增量的文件事实，并让过期描述不再被当成当前事实。不提取符号。

- [x] 扫描工作区源文件：路径、语言、大小、内容哈希。忽略规则复用 `DefaultWorkspaceIgnorePolicy` 和检索里的敏感扩展名。
- [x] 只重哈希变更文件。删除的路径从清单消失。
- [x] 读文件描述时，若 `contentHash` 与当前文件不一致，返回 `stale: true`，调用方不得把 `description` 放进上下文。
- [x] 清单不包含符号，也不写功能图。

**验收**：改一行后，该文件哈希变了，描述被标过期；未改文件不重算。密钥样貌文件不进清单正文。

### CI-1 — 导出符号

**目标**：回答「这个名字在哪个文件的哪一行定义」。

- [x] 为每个受支持文件提取导出的函数、类、类型、接口、枚举、常量。
- [x] 记录 `name`、`kind`、`path`、`startLine`、`exported`、`contentHash`。
- [x] 文件哈希未变则不重新解析。
- [x] 查询按精确名字。同名多条全部返回，并带 `nodeIds`（可能为空，表示未挂接）。
- [x] 不把查询结果写入 `allowedWritePaths`。

**验收**：在未选中定义文件的节点上提问，能返回定义路径和行。该路径若不属于当前节点，Change 仍被拒绝。

### CI-2 — 给上下文和检索用的只读查询

**目标**：别的子系统通过一个函数取符号，而不是各自解析。

- [x] `lookupSymbols({ name, pathPrefix? })` 与 `symbolsInFile(path)`。
- [x] 返回值带内容哈希。调用方发现文件已变就 omission，不返回旧行号。
- [x] RAG 计划的 RAG-9 才能把 `kind: "symbol"` 接到这里。经纪人仍然拒绝 `symbol`。

**验收**：索引进程落后于磁盘时，查询要么给出新行号，要么 omission，不会给出改之前的行。

### CI-3 — 引用与文件影响

**目标**：回答「谁引用了这个符号」和「改这个文件会碰到哪些文件」。

- [x] 文件级影响先复用 `DependencyImpactScanner` 的直接 import 闭包，不要复制第二套 import 解析。
- [x] 符号级引用 v1 只做同仓库相对导入能解析到的导出名。动态导入和解构别名做不到就 omission `unresolved_import`。
- [x] 影响结果附带功能图 `nodeIds` 和距离。图上没有的文件单独成组。
- [x] 测试文件：路径含 `*.test.*` / `*.spec.*`，或与源文件同名加测试后缀。这是名单，不是「这些测试一定覆盖该函数」。

**验收**：给一个被两处 import 的导出函数，结果含这两个文件。给一个只有 C4 边、没有 import 的节点，符号影响结果不为了「看起来完整」去抄 `impactStructureGraph`。

### CI-4 — 描述刷新

**目标**：哈希过期的描述可以按预算重新生成，而不是每次聊天现算。

- [x] 沿用 `CodeFileUnderstandingService` 的提示词和 JSON 形状。
- [x] 输入增加 CI-3 的直接引用方和依赖文件名，仍截断到现有邻居上限。
- [x] 一次刷新有文件数上限。失败保留旧条目并保持 `stale: true`。
- [x] 描述正文仍然不是写授权，也不是符号表。

**验收**：刷新后的条目哈希等于当时文件哈希。模型没返回可用 JSON 时，旧描述继续显示为过期。

### 明确不做

| 项 | 原因 |
|----|------|
| 全语言 LSP 索引、调用图闭包超过直接引用 | v1 会把「未知」说成「没有调用方」 |
| 把符号塞进 C4 节点或结构图边 | 架构视图和代码事实会互相污染 |
| 语义向量、跨仓库索引 | RAG-5 仍关 |
| 用索引结果扩大写范围或自动改测试 | 写仍然只走叶子授权 |
| 用文件描述代替符号查询 | 描述是句子，会过期 |

## 4. 依赖

```text
CI-0 文件清单与描述过期
  └─► CI-1 导出符号 ─► CI-2 查询接口 ─► RAG RAG-9、Context CTX-6
         └─► CI-3 引用与影响 ─► CI-4 描述刷新、Verification V-2 的测试名单
```

CI-0 可以和 Verification V-0 并行。CI-3 依赖现有 import 扫描，不依赖 Loop。

## 5. 不变量

- 索引是只读事实。它不创建节点，不改 `linkedFiles`，不计算 `allowedWritePaths`。
- 内容哈希对不上的符号、描述、引用都不能进入当次上下文。
- 结构图 impact 和代码 impact 必须分字段返回。禁止合成一条没有来源的「系统说会影响到」。
- 不索引 `node_modules`、构建产物、密钥样貌文件。
- 解析失败的文件记 omission，不让整库索引失败。

## 6. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-10-20 | 初稿。对照 C4、文件描述、import 扫描、LSP 大纲和检索块索引的真实边界，把符号和影响面收成 CI-0–CI-4。 |
| 2026-10-20 | CI-0–CI-2：`.projectos/code-intelligence/` 文件清单与导出符号索引，`lookupSymbols` / `symbolsInFile` 按当前字节校验行号。 |
| 2026-10-20 | CI-3–CI-4：`codeImpact` 复用 import 扫描做文件闭包和直接符号引用；过期描述按文件数上限刷新，失败保持 `stale`。 |
| 2026-10-20 | 文首与 RAG-9 对齐：`symbol` 检索经 `lookupSymbols` 回源；叶子 Change 仍不靠检索扩写。 |
