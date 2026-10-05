# Structure Graph Scan（Project OS Pure）

为陌生本地仓库生成 **结构层 C4** `ProjectGraph`（`.projectos/graph.json`），效果要对齐 sample 仓库那种**可读 Function Map**：产品语言命名、清晰分层、真实文件挂载——不是目录壳。

## 任务

阅读仓库文件树与关键片段，输出一个完整的 `ProjectGraph` JSON 对象（version `0.3.0`）：

1. **context**：1 个 software_system；可选 1–2 个 person（如访客/会员）
2. **container**：按真实部署/包边界划分（如 Android 客户端、macOS 客户端、共享核心），用产品职责命名，**禁止** `android module` / `src module`
3. **component**：每个 container 下 1–3 个组件，用能力语言命名（录音引擎、同步服务、设置页）
4. **edges**：容器/组件之间的真实依赖（`depends_on` / `calls` / `data_flows_to` 等），每条边需要短 `label` 与 `evidence`
5. **fileIndex**：只列你挂到组件上的真实相对路径（优先入口/核心文件）；`imports`/`exports` 一律 `[]`
6. **linkedFiles**：把源文件挂到对应 component；`path` 必须落在 `fileIndex` 中

## 体积硬上限（必须遵守，否则输出会被截断）

- nodes ≤ 16（含 system/person/container/component）
- edges ≤ 20
- fileIndex ≤ 40
- 每个文本字段（description/summary/responsibility/label/evidence）≤ 100 字符
- 省略 `nameEn` / `refs` / `preview` / `fileRelations` / `technology`（不确定时）

## 输出

- 只返回 **一个** JSON 对象；首字符 `{`，末字符 `}`
- 不要 markdown 围栏（除非环境强制）
- 不要编造不存在的文件路径
- `analysisStatus` 设为 `"complete"`
- 节点 `tags` 使用 `["ai-scan"]`，不要保留 `bootstrap` / `heuristic`

## 命名

- 优先用户/产品语言（中文仓库用中文名）
- 坏例子：`android`、`android module`、`shared module`
- 好例子：`Android 客户端`、`情侣录音核心`、`本地存储`
