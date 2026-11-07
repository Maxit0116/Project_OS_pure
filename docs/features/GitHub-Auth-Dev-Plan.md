# GitHub Auth Login Dev Plan

**状态**：Implemented（2026-10-29）— GHAUTH-0–6 已落地；人工冒烟见 Eval Checklist「GitHub Auth」。  
**决策**：方案 C（本地桌面身份 + 云端扩展点）+ 账号与 API 共用 OAuth token。  
**邻居**：[`GitHub-Compose-Hub-Dev-Plan.md`](GitHub-Compose-Hub-Dev-Plan.md)、[`Full-Product-Architecture-and-Dev-Plan.md`](../Full-Product-Architecture-and-Dev-Plan.md)（云 Auth 仍属后续阶段）。

**合格线**：用户能在 Settings / 顶栏一键 Device Flow 登录 GitHub；头像与 login 本地可见；token 只进 SecretStore；同一 token 优先驱动 PR list/create REST；未登录时仍可打开 workspace；Sign out 清 token+profile。

## 0. 产品约束

- **Local-first**：登录不是打开 workspace 的前置条件。
- **Token 永不进 settings JSON / renderer 明文**：只经 `SecretStore`（`github_auth:default`）。
- **Device Flow 默认**；`PROJECTOS_GITHUB_OAUTH_MODE=loopback` 为可选覆盖（需 Client Secret）。
- **Scopes**：`read:user user:email repo`。
- **本阶段不做**：云端 Auth、billing、定时 git sync、用 token 替换全部 git HTTPS push 凭证。

## 1. 切片

| ID | 主题 | 说明 |
|----|------|------|
| GHAUTH-0 | 文档与契约 | 本文件 + `contracts/github-auth.ts` + API 方法 |
| GHAUTH-1 | OAuth runtime | Device Flow（+ 可选 loopback）；env Client ID |
| GHAUTH-2 | 持久化 | SecretStore ref + `github-account.json` profile |
| GHAUTH-3 | API / IPC / store | LocalApi → IPC → client → workbenchStore |
| GHAUTH-4 | UI | Settings Team/GitHub + 顶栏账号入口 |
| GHAUTH-5 | API 消费 | PR list/create：app token REST 优先，否则 `gh` |
| GHAUTH-6 | 测试与验收 | 单测 + checklist |

## 2. 明确不做

| 项 | 原因 |
|----|------|
| Cloud `/v1/auth/*`、跨设备 session | 只留 `identityKind: 'local_github'`（预留 `'cloud'`） |
| 定时 auto pull/commit/push | 非登录+API 核心 |
| 强制登录门闸 | 违反 local-first |
| GitHub App 安装流 | OAuth App Device Flow 足够 |

## 3. 验收

1. 配置 `PROJECTOS_GITHUB_CLIENT_ID`（或打包内 public Client ID）后，Settings → Team / GitHub → Sign in 打开浏览器 Device Flow。
2. 授权后 Settings 与顶栏显示 avatar / `@{login}`；`secrets.json` 有 token，profile JSON 无 token。
3. 无 `gh` CLI 时，已登录仍可 `listWorkspacePullRequests` / create（REST）。
4. Sign out 后 status `connected: false`，secret 与 profile 清除；PR API 回退 `gh` 或诚实不可用。
5. presentation / fixture mock 模式可不碰真实 OAuth。

## 4. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-10-29 | 初稿；按 GHAUTH-0→6 实现。 |
| 2026-10-29 | GHAUTH-0–6 落地：契约、Device Flow、SecretStore、IPC/UI、REST PR 优先、单测与 Eval Checklist。 |
