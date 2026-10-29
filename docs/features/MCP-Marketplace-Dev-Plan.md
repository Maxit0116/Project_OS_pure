# MCP Marketplace Dev Plan

**状态**：Implemented（2026-10-29）— A3 基座（MMP-0–4）+ B2 市场（MMP-5–7）已落地；Chat Marketplace Overlay（MCP tab）见 Skills/Overlay 计划；人工冒烟见 Eval Checklist。  
**权威邻居**：[`MCP-Dev-Plan.md`](MCP-Dev-Plan.md)、[`Agent-Harness-Tool-Registry.md`](Agent-Harness-Tool-Registry.md)、[`backend/Tools-Integrations-Dev-Plan.md`](backend/Tools-Integrations-Dev-Plan.md)、[`backend/Security-Governance-Dev-Plan.md`](backend/Security-Governance-Dev-Plan.md)

**合格线（A）**：Settings 可浏览验签目录 → Install 写入 `mcpServers`（provenance、默认 `enabled: false`）→ Test/Refresh 与手工配置一致 → 无 `permissions.json` allow 时 Ask 不调用。  
**合格线（B）**：同一目录混排 curated/community；community 可装但强制默认关；本地 disable/report 生效；无上传 API、无自动 permissions。

## 0. 产品约束

- 安装只产生配置，**不**自动写 `permissions.json`；目录安装 ≠ policy allow。
- Secret 仍走 SecretStore；结果不可信。
- 有界 MCP，不开 Route ②。
- 远程目录必须过 HTTP SSRF guard + Ed25519 验签；失败回退 bundled 已签名快照。
- 无社区上传 / 审核后台；report 仅本地记录 + 可选打开 issue URL。

## 1. 切片

| ID | 主题 | 说明 |
|----|------|------|
| MMP-0 | 文档与契约 | `McpCatalogDocument` / listing / `provenance` / `mcpMarketplace` prefs |
| MMP-1 | CatalogClient | 远程 fetch、缓存、验签、bundled 回退 |
| MMP-2 | Install API | `listMcpCatalog` / `refreshMcpCatalog` / `installMcpFromCatalog` + IPC |
| MMP-3 | Settings UI | Marketplace 浏览 / 安装 / trust badge |
| MMP-4 | 安全与验收 | SSRF、坏签名、缓存投毒、checklist |
| MMP-5 | 社区呈现 | 分区 / 风险文案 / community 强制 disabled |
| MMP-6 | 本地治理 | disableListing / reportListing blocklist |
| MMP-7 | 文档收尾 | Registry / Backend / Tools 交叉引用 |

## 2. 明确不做

| 项 | 原因 |
|----|------|
| Route ② | Harness DEFERRED |
| 社区上传 / 服务端审核 | 本期仅消费远程 JSON |
| 自动 permissions allow | 安全不变量 |
| Marketplace 内执行工具 | 只安装配置 |
| OS 级 stdio 沙箱 | 与 MCP v1 一致 |

## 3. 验收

1. 远程或验签 cache/bundle 列出 curated + community。
2. Install → `enabled: false` + provenance；community 忽略强制 enable。
3. Test/Refresh 行为与手工 MCP 相同。
4. 坏签名 / 私网目录 URL 被拒；poisoned cache 不被当作已验签源使用。
5. disable 隐藏可安装项；report 写入本地 prefs。
6. Ask 在无 allow 时仍不 `callTool`。

## 4. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-10-29 | 初稿；按 A3→B2 锁定范围开始实现。 |
| 2026-10-29 | MMP-0–7 落地：契约/验签目录客户端、Install API、Settings 市场 UI、社区分区与本地 disable/report、单测与 Checklist。 |
