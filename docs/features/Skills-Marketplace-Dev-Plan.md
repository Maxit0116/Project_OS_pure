# Skills Marketplace Dev Plan

**状态**：Implemented（2026-10-29）— SMP-0–3 基座 + Marketplace Overlay Skills tab 已落地。  
**权威邻居**：[`MCP-Marketplace-Dev-Plan.md`](MCP-Marketplace-Dev-Plan.md)、[`MCP-Dev-Plan.md`](MCP-Dev-Plan.md)、Harness skills（`.projectos/skills/**/SKILL.md`）

**合格线**：验签目录可列 → Install 写入 `.projectos/skills/<id>/SKILL.md` → `listSkills` 可见；默认不覆盖同 id；不自动切 Custom Mode；Hide/Report 本地生效。

## 0. 产品约束

- 目录形态与 MCP 市场同构（远程 + 缓存 + Ed25519 + bundled）。
- Listing 内嵌 `skillMarkdown`（及可选 companion `files`）；无 zip/git clone。
- 安装只写盘，不改 composer / permissions。
- Community 条目可装，但 UI 须有风险文案。

## 1. 切片

| ID | 主题 |
|----|------|
| SMP-0 | 契约与 prefs |
| SMP-1 | SkillCatalogClient |
| SMP-2 | Install API / IPC / store |
| SMP-3 | 安全单测 |
| MKT-* | 中央悬浮窗（见 Marketplace Overlay 计划） |

## 2. 明确不做

社区上传后台；自动 usable-as-mode；多文件远程包协议。

## 3. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-10-29 | 初稿；与 Overlay 计划一并落地。 |
| 2026-10-29 | SMP + Chat Marketplace Overlay（Skills/MCP tabs）实现完成。 |
