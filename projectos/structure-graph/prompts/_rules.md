# Structure Graph Rules（Project OS Pure）

CodeSee 三原则在结构层的变体。

## MUST

1. **语义归模型**：命名、职责、分层、`technology`、外部系统写入两轮 JSON；文件挂载与 import 边由程序补齐
2. **路径真实**：`pathHints` 必须是仓库内真实前缀；不确定就省略
3. **L2 完备**：1 system + ≥1 container + 按仓库规模足够的 component（产品能力名）
4. **语言跟随 README**
5. 枚举值只能使用 `_schema.md` 中的合法值（含 `data_store`、`external_system`）
6. **C4 形状可用**：container / data_store 必须有短 `technology`（Next.js、PostgreSQL、Redis、Kafka、React Native 等），数据库用 `data_store`
7. **边带协议**：关系尽量写短 `technology`（HTTP / HTTPS / gRPC / Kafka / SQL …）
8. **嵌套 parentId**：container/data_store → software_system；component → container
9. **三层文案**：每个节点同时写 `summary`、`description`、`responsibility`，三句不互相复述。`summary` 是卡片一行短述（中文 ≤24 字，英文 ≤12 词）；`description` 是悬停预览的 1–2 句（中文约 40–120 字，补上谁在用、连到哪里、边界）；`responsibility` 是详情里的一句职责

## MUST NOT

1. 编造不存在的文件或包路径
2. 输出完整 `fileIndex` / `fileRelations`（会截断）
3. 用「frontend module / src module / android module」作为最终名称
4. 恢复故事层 / features.json
5. 发明新的 `elementType`（只能用 schema 枚举）
6. 把布局坐标、画布状态写进 graph.json

## SHOULD

1. 组件按产品能力/子系统划分，而不是按文件扩展名堆叠
2. 优先把入口文件、路由、API handler、核心服务挂到对应 component
3. `imports`/`exports` 可为空；第一期不强制 AST 依赖图
4. 中文仓库用中文命名；英文仓库用英文命名
5. 第三方支付、鉴权、云 AI、对象存储等用 `external_system`，不要画进本系统 container
6. prisma / sqlite / postgres / redis / kafka 等证据优先落成 `data_store` 或带对应 `technology` 的 container
7. 低置信节点写 `openQuestions`；有证据写 `notes`；可选 `owners`
