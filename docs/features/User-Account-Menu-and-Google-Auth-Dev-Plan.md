# User Account Menu + Google Auth Dev Plan

**状态**：Implemented（ACCT-0–6，2026-11-12）— 顶栏账号菜单 + Google/GitHub 产品身份；OAuth 仍走系统浏览器；人工冒烟见文末验收。  
**决策**：顶栏入口从「GitHub 专用按钮」升级为 **User Account**；MVP 支持 **Google + GitHub** 登录；OAuth **继续走系统外部浏览器全流程**（不在内置 Browser tab 内跑授权页）；账号菜单对标 Cursor 账号面板，但按 Project OS 裁剪。  
**邻居**：
- [`GitHub-Auth-Dev-Plan.md`](./GitHub-Auth-Dev-Plan.md) — 既有本地 GitHub OAuth（Device Flow / loopback / `gh`）；本计划复用，不推翻
- [`Loops-Graph-Gmail-Connector-Dev-Plan.md`](./Loops-Graph-Gmail-Connector-Dev-Plan.md) — Loop **邮件连接器**（`gmail.readonly` 等）；**≠** 本计划的 Google 产品登录
- [`Full-Product-Architecture-and-Dev-Plan.md`](../Full-Product-Architecture-and-Dev-Plan.md) — 云 Auth / billing 仍属后续；本阶段只做本地桌面多 provider 身份

**合格线**：用户点击顶栏账号入口即出现账号菜单；可用 Google 或 GitHub 经外部浏览器完成登录；已登录显示头像 / 名字 / 邮箱；菜单含 Profile、Appearance、Help、Switch account、Sign out；token 只进 SecretStore；未登录仍可打开 workspace。

---

## 0. 核心诉求（已对齐）

1. **语义升级**：顶栏按钮不再表示「仅 GitHub」，而表示 **当前用户账号**（可来自 Google 或 GitHub）。
2. **即时反馈**：点击后弹出账号选项栏（popover），而不是几乎无感地跳进 Settings → Team/GitHub。
3. **多登录方式 MVP**：Google（Gmail 身份）+ GitHub；后续可扩展 Apple 等，本阶段不做。
4. **菜单内容按产品裁剪**：旁边已有 Settings 齿轮，菜单内 **不放 Open Settings**。
5. **OAuth 载体**：GitHub / Google 登录 **仍走系统外部浏览器全流程**；明确 **不** 在内置 Browser tab 中跑授权页（避免 Google WebView 封禁、宿主注入风险、与 Lab/Spatial 注入冲突）。

---

## 1. 产品分层（必须分清）

| 层 | 含义 | MVP |
|----|------|-----|
| **Product Account** | 「你是谁」：显示名、邮箱、头像、登出 / 切账号 | Google Sign-In **或** 以 GitHub 作为账号身份 |
| **Capability · GitHub** | 「能对 repo/PR 干什么」：既有 `githubAuth` token + scopes | 继续独立存在；可与 product account 同源（用户用 GitHub 登录时），也可后接 |
| **Capability · Gmail connector** | Loop 读邮件材料 | **本计划不做**；禁止把产品登录 scope 扩成 `gmail.readonly` |

契约演进方向（建议）：

- 引入薄层 `UserAccount` / `productSession`（provider: `google` \| `github`），顶栏与账号菜单只读这一层。
- 既有 `GitHubAuthSessionManager` **保留**为 GitHub capability + 可选 identity provider；不要把 Google token 塞进 `github-auth` 契约。
- `AccountIdentityKind` 今日为 `local_github` \| `cloud`；本阶段以 **本地多 provider** 落地，可扩展为 `local_google` / `local_github`，或统一 `identityKind: 'local'` + `provider` 字段（实现切片选定，保持向后兼容）。

---

## 2. 交互全流程

### 2.1 顶栏触发器

| 状态 | 外观 | 点击 |
|------|------|------|
| 未登录 | 通用 User / Account 图标（不再默认 `GitBranch`） | 打开账号菜单 |
| 已登录 | 头像（无头像则首字母 / 通用图标） | 打开账号菜单 |
| 登录进行中 | 可选 subtle busy / pending 态 | 菜单显示「Waiting for browser…」+ Cancel |

位置：仍在 `WorkbenchChromeActions`（含 Mac DesktopTitleBar compact 路径）；**右侧 Settings 齿轮保持独立**。

### 2.2 账号菜单 — 未登录

```
┌─────────────────────────────┐
│  Sign in to Project OS      │
│  Local identity · optional  │
├─────────────────────────────┤
│  Continue with Google       │
│  Continue with GitHub       │
├─────────────────────────────┤
│  Appearance            ›    │  ← 内联或二级：System / Light / Dark
│  Help                       │
│  Profile                    │  ← 未登录：提示需先登录 / 灰显
└─────────────────────────────┘
```

- **不出现** Open Settings / Close settings。
- Appearance 复用既有 `themePreference`（`ThemeSettingsSection` 同源逻辑），不必新开设置页。
- Help：打开既有帮助入口（文档链接 / 应用内 Help）；若尚无一等公民 Help 页，MVP 可用外部文档 URL 或占位路由，但菜单项必须存在。

### 2.3 账号菜单 — 已登录

```
┌─────────────────────────────┐
│  [Avatar] Display name      │
│           email@domain      │
│           Google | GitHub   │
├─────────────────────────────┤
│  Profile                    │
│  Appearance            ›    │
│  Help                       │
├─────────────────────────────┤
│  Switch account             │
│  Sign out                   │
└─────────────────────────────┘
```

| 项 | 行为 |
|----|------|
| **Profile** | 只读资料面板或轻 sheet：名字、邮箱、provider、connectedAt；MVP 不做云端资料编辑 |
| **Appearance** | 切换 System / Light / Dark |
| **Help** | 帮助入口 |
| **Switch account** | Sign out 当前 product session → 菜单回到未登录选项（可继续选 Google / GitHub）；**默认不**自动 disconnect GitHub capability token（见下） |
| **Sign out** | 清除当前 product session（token + profile）；菜单关闭或回到未登录 |

**Switch account vs Sign out（MVP 约定）**

- Sign out：结束当前身份，停留在「未登录」。
- Switch account：结束当前身份，并保持菜单打开在「选择登录方式」。
- 若当前身份 provider 是 GitHub，且同一 token 同时服务 repo API：Sign out / Switch **会**清除该 GitHub session（与今日 Settings disconnect 等价）。若未来 product account 与 GitHub capability 分离存储，再改为「只清 identity、保留 capability」——本 MVP 允许 GitHub 登录身份与 capability 共用 token（与 GHAUTH 一致）。

### 2.4 Google 登录流程（外部浏览器）

```
菜单 Continue with Google
  → main: beginGoogleOAuth (PKCE + loopback 或等价桌面安全流)
  → shell.openExternal(authorizeUrl)          // 系统浏览器，非内置 tab
  → 用户在 Google 同意 openid/email/profile
  → redirect → http://127.0.0.1:<port>/oauth/callback
  → main 收 code → token 换取 → SecretStore
  → 写 google-account / user-account profile（无 token）
  → workbenchStore 刷新 → 顶栏头像 + 菜单已登录态
```

- Scopes：**仅** `openid email profile`（身份）。禁止为登录申请 Gmail API scopes。
- Cancel：中止 loopback / abort controller；菜单恢复未登录。
- Mock / presentation mode：可返回 fixture profile，不碰真实 Google。

### 2.5 GitHub 登录流程（外部浏览器，复用既有）

```
菜单 Continue with GitHub
  → 复用 connectGitHub() / Device Flow（默认）
  → shell.openExternal(verificationUri*)     // 仍外部浏览器
  → Settings 既有 pending UI 可保留；菜单也可显示 pending + Cancel
  → 成功后 product account 映射自 GitHub profile（login/name/email/avatar）
```

- Settings → Team/GitHub **保留**为 capability 管理面（scopes 说明、Client ID、`gh` import、disconnect）。
- 顶栏 **不再** 以「打开 Team/GitHub settings」作为唯一点击反馈。

### 2.6 明确不做的交互

| 项 | 原因 |
|----|------|
| 内置 Browser tab 跑 OAuth 授权页 | 已拍板；Google 易封 WebView；与 guest 注入冲突 |
| 菜单内 Open Settings | 邻侧已有 Settings 按钮 |
| Upgrade / Billing / Download app | 无云计费；对标 Cursor 但不照搬 |
| 强制登录门闸 | Local-first |
| Apple 登录 | 非 MVP |
| 用产品 Google 登录自动开通 Gmail connector | 分层不同；connector 另计划 |

---

## 3. 工程切片

| ID | 主题 | 说明 | 依赖 |
|----|------|------|------|
| **ACCT-0** | 文档与契约 | 本文件；`UserAccount` / status / begin / cancel / signOut 契约；与 `github-auth` 边界注释 | — |
| **ACCT-1** | 账号菜单 UI | 顶栏触发器语义 + popover（未登录 / 已登录 / pending）；Profile / Appearance / Help / Switch / Sign out；i18n en+zh | ACCT-0 可并行 UI 骨架 |
| **ACCT-2** | Product session 存储 | SecretStore ref + profile JSON；store 选择器供顶栏 / 菜单 | ACCT-0 |
| **ACCT-3** | Google OAuth runtime | Desktop PKCE + loopback；外部 `openExternalUrl`；IPC + LocalApi + client | ACCT-0/2 |
| **ACCT-4** | GitHub 接入菜单 | 菜单 Continue with GitHub 接既有 `connectGitHub`；登录成功映射 product account；顶栏去掉「只开 settings」 | ACCT-1 + 既有 GHAUTH |
| **ACCT-5** | Profile / Appearance / Help | Profile 只读面板；Appearance 接 theme；Help 入口落地 | ACCT-1 |
| **ACCT-6** | 测试与验收 | 契约/单测；mock Google；菜单交互单测；Eval Checklist 条目 | ACCT-1–5 |

建议落地顺序：**ACCT-0 → ACCT-1（可先只接 GitHub）→ ACCT-2/3 → ACCT-4 收口 → ACCT-5 → ACCT-6**。

### 3.1 代码锚点（现状）

| 区域 | 路径 |
|------|------|
| 顶栏账号按钮 | `projectos/workbench/src/layout/WorkbenchChromeActions.tsx` |
| GitHub Settings UI | `projectos/workbench/src/components/Settings/TeamGithubSection.tsx` |
| GitHub session | `projectos/services/github-auth/*` |
| 契约 | `projectos/contracts/github-auth.ts`（扩展点 / 新文件并列） |
| Theme | `ThemeSettingsSection.tsx` + workbenchStore `themePreference` |
| 内置 Browser（**本计划不用于 OAuth**） | `workbench/src/components/Browser/*` |

---

## 4. 安全与隐私约束

- Token **永不**进入 settings JSON、renderer 明文、账号菜单 DOM 文案。
- Google / GitHub token 分 ref 存储；profile 仅非敏感字段。
- OAuth 只经 **系统浏览器** + 本地 loopback / Device Flow；禁止把授权页载入带 `executeJavaScript` 注入的 guest webview。
- Local-first：无账号也可打开工程、用本地 agent；登录只增强身份展示与后续云能力预留。
- Presentation / mock mode 不得误写真实 SecretStore。

---

## 5. 验收（Eval Checklist 预留）

1. 未登录点击顶栏账号按钮 → 弹出菜单（Google / GitHub / Appearance / Help / Profile），**不**默认打开 Settings。
2. Continue with GitHub → 系统浏览器 Device Flow → 成功后顶栏头像 + 菜单身份头；Settings Team/GitHub 仍显示已连接。
3. Continue with Google → 系统浏览器同意 → 回调回 app → 顶栏与菜单显示 Google 资料；SecretStore 有 token，profile 无 token。
4. Appearance 可从菜单改 theme，与 Settings → Theme 一致。
5. Sign out 清除当前 product session；Switch account 清 session 后菜单停在登录选项。
6. 内置 Browser 打开任意页 **不会** 被 OAuth 流程占用；OAuth 失败 / Cancel 可恢复。
7. 未登录仍可打开 workspace；无强制门闸。

---

## 6. 明确不做（本阶段）

| 项 | 原因 |
|----|------|
| 内置 Browser tab OAuth | 已拍板 |
| Cloud `/v1/auth/*`、跨设备 session、billing、Upgrade CTA | 架构后续阶段 |
| Apple / 邮箱密码登录 | 非 MVP |
| 产品登录申请 Gmail API scopes | 与 connector 计划分离 |
| 菜单内 Open Settings | 邻侧已有入口 |
| 用账号菜单替换 Team/GitHub 设置页 | Settings 仍管 OAuth Client / `gh` / scopes |

---

## 7. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-11-12 | 初稿：账号入口语义、菜单 MVP 项、Google+GitHub、外部浏览器 OAuth、与 Gmail connector / GHAUTH 分层、切片 ACCT-0–6。 |
| 2026-11-12 | 落地 ACCT-0–6：`user-account` 契约、Google PKCE loopback、UserAccountSessionManager、IPC/store、顶栏 AccountMenu（Profile/Appearance/Help/Switch/Sign out）。 |
