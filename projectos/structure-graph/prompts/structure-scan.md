# Structure Graph Scan（Project OS Pure）— L2

为陌生本地仓库生成 **sample 级可读 C4** `ProjectGraph`。模型只出语义骨架；文件挂载与 code 层由程序补齐。

## 两轮输出（均只要小 JSON，不要 fileIndex / fileRelations）

### Round A

`{ architecture, nodes, edges }`

- 0–4 person（context）
- 1 software_system（context）
- 0–4 external_system（context）：SaaS / 云 / 第三方（Stripe、Auth0、OpenAI、AWS…）；建议 `tags: ["External"]`
- 2–6 container，产品/部署边界命名，禁止 `android module` / `src module`
- 数据库 / 缓存用 `elementType: "data_store"`（`level: "container"`），不要只写普通 container
- 每个 container / data_store / 关键的 external_system 填短 `technology`，供 C4 形状选择：
  - Web：`Next.js` / `React` / `Vue` / `Angular` / `Svelte`
  - Phone：`Android` / `iOS` / `React Native` / `Flutter` / `Jetpack Compose`。`SwiftUI` 只在 iOS 客户端上使用
  - Desktop：`macOS` / `Windows` / `Electron` / `Tauri`。macOS 上的 `SwiftUI` 写 `macOS`，不要写成手机
  - Server：`Node.js / Express` / `NestJS` / `Django` / `FastAPI` / `Go`
  - Data：`PostgreSQL` / `MySQL` / `MongoDB` / `SQLite` / `Redis`
  - Queue：`Kafka` / `RabbitMQ` / `SQS` / `NATS` / `Pub/Sub`
- 客户端外形看名称：名称含 Android / iOS 画手机，含 macOS / Windows / 桌面 画笔记本，网页画浏览器。不要靠颜色区分平台
- **每条边带协议 `technology`**（HTTP / HTTPS / gRPC / Kafka / SQL …）+ 短 `label` + `evidence`
- 嵌套：`container` / `data_store` 的 `parentId` = software_system id
- 低置信（低于 0.6）节点写 `openQuestions`；有路径证据写 `notes`
- 可选 `owners`

### Round B

`{ components, edges }`

- 每个 container 2–6 个 component（全仓约 8–20）
- 能力命名（录音引擎、身份与访问…）
- 每组件 `pathHints: string[]`，必须是真实路径前缀（如 `android/app`, `src/auth`）
- 组件可带短 `technology`、`notes`、`openQuestions`、`owners`
- 组件边同样带协议 `technology`

## 文案分层

每个节点必须同时给出三句，且彼此不重复：

- `summary`：卡片上一行短述。中文不超过 24 字，英文不超过 12 个词。不要重复 `name`。
- `description`：悬停预览用的稍详细说明，1–2 句，中文约 40–120 字。补上谁在用、连到哪里、不负责什么。不要复述 `summary`。
- `responsibility`：一句职责，给详情面板。不要复述 `summary`。

## 语言

跟随仓库 README：中文 README 用中文名，否则英文名。

## MUST NOT

- 不要输出 `fileIndex` / `fileRelations` / 完整文件列表
- 不要编造路径
- 不要用目录壳当最终名称
- 不要发明 schema 以外的 `elementType` 枚举值
- 不要输出布局坐标或画布状态
