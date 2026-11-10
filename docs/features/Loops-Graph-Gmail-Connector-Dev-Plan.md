# Loops Graph · Gmail Connector（只读首期 + 发送边界）

**状态**：权威计划 + 首期只读契约开发（2026-11-10 **新增**；**不在** [`5814430`](https://github.com/Maxit0116/Project_OS_pure/commit/5814430be36e0e990e49bcd84887f1b6208a5772) 范围内）。  
**落地提交**：[`a9103ea`](https://github.com/Maxit0116/Project_OS_pure/commit/a9103eabf841c8ca8bc774b08457d748607c01c7)（同流 PR10；入文档 ≠ 交验完成）。  
**入文档 ≠ 完成。** 本流只做离线契约 / 生产入口 loopback；**不**连接用户邮箱、**不**真实读写/发信/删归档/标已读、**不**部署 Pub/Sub、**不**付费、**不**安装 Bot Gmail 插件。  
**同流**：追加到既有 Auto 主线（安全门禁 / 双作者入口 / Project Workflow + Task Materials），**不另开 PR 层**；保留原 11 平台清单，Gmail 为**追加**连接器。

## 权威互链（真实路径）

| 文档 / 代码 | 关系 |
|------|------|
| [`Loops-Graph-Six-Goals-Execution-Tracking.md`](./Loops-Graph-Six-Goals-Execution-Tracking.md) | 执行实况矩阵；Gmail 行与本文件同步 |
| [`Loops-Graph-Project-Workflow-and-Materials-Dev-Plan.md`](./Loops-Graph-Project-Workflow-and-Materials-Dev-Plan.md) | 邮件→TaskMaterial / RunBinding / 预检 |
| [`Loops-Graph-Workflow-Studio-Dev-Plan.md`](./Loops-Graph-Workflow-Studio-Dev-Plan.md) | Studio / DutyCard 手工配置入口 |
| [`Loops-Graph-Gaps-Closure-Dev-Plan.md`](./Loops-Graph-Gaps-Closure-Dev-Plan.md) | 触发/settle；push ≠ 普通 webhook 载信 |
| [`bugs.md`](../../bugs.md) | SSRF / 密钥；邮件 HTML/附件不可信 |
| [`projectos/services/loop-connectors/adapters/gmail.ts`](../../projectos/services/loop-connectors/adapters/gmail.ts) | 只读 adapter + MIME/TaskMaterial（loopback） |
| [`projectos/services/loop-connectors/gmail.contract.test.ts`](../../projectos/services/loop-connectors/gmail.contract.test.ts) | contract 测试 |
| 官方（核实用，非本仓实现承诺） | [Scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) · [Push](https://developers.google.com/workspace/gmail/api/guides/push) · [Sync](https://developers.google.com/workspace/gmail/api/guides/sync) · [Restricted verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification) · [Workspace user-data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy) |

---

## 1. 产品主场景（与工程闭环绑定）

1. **邮件 bug 线索** → 人在 Pure 内确认任务材料 → 工作区修复 / 测试 / PR。  
2. 产品内给出**回复建议 / 草稿计划**（建议 ≠ 已写入 Gmail 草稿 ≠ 已发送）。  
3. 私密邮件转公共 Issue / 外部服务前：**预览脱敏确认**；收件**不**自动公开或自动回复。  
4. 附件是**不可信数据**：解析失败透明；不因附件扩大权限。

---

## 2. Scope / 能力矩阵（官方分类核实）

来源：Gmail API scopes 页（Restricted / Sensitive / Non-sensitive）。**本地原型不自动等同「必须完成 Restricted 评估」**；公开发布 / Workspace 管理员 / 存服务端 Restricted 数据时按场景适用。

| Scope | 官方类 | Pure 产品策略 | 首期 |
|-------|--------|---------------|------|
| `gmail.readonly` | **Restricted** | 只读搜索分页 + thread/message 全文；list **仅 ID**，**禁止**用 snippet 冒充正文 | **目标 scope** |
| `gmail.metadata` | Restricted | 无正文；list **不支持** `q` 搜索 → **不可**替代 readonly 搜索场景 | 不做产品主路径 |
| `gmail.labels` | Non-sensitive | **labels 管理** = 标签定义 CRUD，**不是**「给邮件打标签」 | 计划（非首期） |
| `gmail.send` | Sensitive | 发送权限；**默认关**；须审批绑定精确字段 | 计划（发送默认关） |
| `gmail.compose` | Restricted | 含草稿+发送能力；产品策略仍**隔离**「草稿计划 / Gmail 草稿 / 发送」 | 计划；首期不申请 |
| `mail.google.com/` | Restricted | 过大；**避免** | **禁止**默认申请 |
| Add-on 限定 scopes | 视表 | 仅 Google Workspace add-on 交互语境 | 不走 Bot 插件路径 |

**OAuth**：合法系统浏览器授权；PKCE 适用性按客户端类型核实（公共原生/桌面客户端优先 PKCE）；**禁止**密码 / cookie / 明文 token 落盘。凭证只存 **credential ref**。  
**Google Limited Use**：Gmail 用户数据不得用于通用模型训练；模型用途 / 保留 / 同意须入产品文档与设置文案（实现切片另跟）。

---

## 3. 首期只读能力（实现目标）

| 能力 id | 说明 | 状态键目标 |
|---------|------|------------|
| `messages_search` | `users.messages.list` + `q` + pageToken；返回 **ID 分页**，正文另取 | 实现 / contract（loopback） |
| `messages_get` | `users.messages.get` format=full；递归 MIME plain/HTML 解码；**list snippet ≠ body** | 实现 / contract |
| `threads_get` | `users.threads.get` 完整线程正文 | 实现 / contract |
| `attachments_get` | 附件按 MIME/大小映射 TaskMaterial；记录 `accountRef` / message / thread / attachment 来源与 **run 快照** | 实现 / contract |
| `poll_history` | **在线轮询** `history.list`；明确「仅应用在线」；去重 / 分页 / 429 Retry-After 退避 / 取消 / scope 不足；**不得**声称全天监听 | 计划→实现（首期 stub+契约） |
| `users_watch` / PubSub push | `users.watch` → Pub/Sub → `history.list` → 读信；≥7 日续订（官方建议每日）；expiration / historyId；乱序重复漏通知；404 → 全量重同步 | **计划**；首期**不部署** Pub/Sub / 云服务 |

**安全 HTML**：净化后展示；**不**执行脚本、**不**自动加载跟踪像素。

---

## 4. 发送 / 草稿 / 审批（后续；边界现在写死）

| 项 | 规则 |
|----|------|
| 回复建议 | 产品内文本；≠ Gmail 草稿 ≠ 发送 |
| 保存 Gmail 草稿 | 另能力；默认关；需 compose 类 scope |
| 发送 | 默认关；审批必须绑定精确 `accountRef` / `runId` / `action` / to / cc / bcc / subject / body / 附件摘要 / thread 版本；**任一改动使批准失效** |
| 拒绝 | **零副作用** |
| 发送结果 unknown | **禁止盲重发**；send-only **不能**假装查过「已发送」 |
| labels | 管理定义 ≠ 给邮件打标签 |

---

## 5. Push 真机制（勿与普通 webhook 混淆）

1. `users.watch` 向 **Cloud Pub/Sub topic** 注册；响应含 `historyId` + `expiration`。  
2. Pub/Sub 投递的是 **emailAddress + historyId**（Base64 JSON），**不是**邮件正文。  
3. 应用侧用 `history.list(startHistoryId)` 取变更，再 `messages.get` / `threads.get`。  
4. watch **至少每 7 日**续订；官方**建议每日**。  
5. 须处理：乱序、重复、漏通知、分页、history **404 → 全量同步**。  
6. 首期：**不**部署 Pub/Sub、**不**付费云服务；产品文案不得把「在线轮询」写成「全天 push」。

---

## 6. 与 Task Materials / Preflight

- 邮件正文 / 附件 → `LoopTaskMaterial`，`source` 标明 Gmail；provenance：`accountRefId` / `messageId` / `threadId` / `attachmentId?`；绑定当前 **run 快照**，编辑定义不回写。  
- Pure 既有表单 / 材料卡 / 预检：账号 / query / 权限 / 解析失败必须透明。  
- mock UI store **不算**接通；须 LocalApi → dispatch → transport loopback。

---

## 7. 验收状态键（报告时拆开）

| 切片 | 计划 | 实现 | contract | 真实 Gmail | live provider |
|------|------|------|----------|------------|---------------|
| 文档互链 + scope/push 矩阵 | ✓ 本文件 | — | — | — | — |
| catalog `gmail` + readonly caps | ✓ | 本流 | 本流 | ✗ | ✗ |
| MIME / TaskMaterial 映射 | ✓ | 本流 | 本流 | ✗ | ✗ |
| OAuth / PKCE / 真邮箱 | ✓ 边界 | ✗ | ✗ | ✗ | ✗ |
| Pub/Sub watch | ✓ 边界 | ✗ | ✗ | ✗ | ✗ |
| 发送审批 | ✓ 边界 | ✗ | ✗ | ✗ | ✗ |

**Mock ≠ 接通。** 不得把本文件回溯进 5814430。

---

## 修订

| 日期 | 说明 |
|------|------|
| 2026-11-10 | 初版：Terran 确认加入当前 Auto 流；只读首期 + 发送/push 边界；官方 scopes/push/sync 核实；与 PW/TM/Six-Goals 互链 |
