# Sandbox：命令执行环境开发计划

**状态**：Draft（2026-10-20）。SB-0、SB-1、SB-2 已落地。仍是软沙箱：`softOnly: true`，没有操作系统级隔离。  
**范围**：本地命令在 Policy 允许之后如何被限制、超时和清理。不在本计划里决定「哪个命令需要批准」，那是 ToolPolicy。  
**总计划**：[`Backend-Dev-Plan.md`](Backend-Dev-Plan.md) 把 SB-1 排在 Phase 3。Phase 1 只依赖超时和路径保护。SB-1、SB-2 已按该切片提前落地，操作系统隔离仍留在 Phase 4。  
**锚点**：`services/harness/shell-sandbox.ts`、`services/harness/run-shell.ts`、`.projectos/sandbox.json`。

**对标一句话**：读代码可以自动做；跑命令必须在有超时、有输出上限、有进程清理的入口里做。操作系统级隔离晚于「验证失败能修一次」。

## 0. 现状

`runHarnessShell` 的顺序是 ToolPolicy → `classifyShellInvocation` → `spawn`（`shell: false`）。

| 已有 | 行为 |
|------|------|
| 默认无网络 | `sandbox.json` 的 `networkAccess` 默认 false。`curl`、`wget`、`ssh` 等进入 ask |
| 保护路径 | `.git/config`、`.git/hooks`、`.projectos/permissions.json`、`.projectos/sandbox.json` 等被 deny |
| 未知二进制 | ask，不静默执行 |
| 已知构建工具 | `npm`、`node`、`tsc`、`eslint` 等在名单内才可能 soft-run |
| 超时 | 使用命令上的 `timeoutMs`，先 SIGTERM，1 秒后 SIGKILL |
| 输出 | 合计 64KB，超出截断 |
| 环境 | `buildSandboxedEnv` 收紧环境变量 |
| 诚实标记 | `softOnly: true`。没有 Seatbelt、Landlock、容器、CPU 或内存限额 |

验证命令在命令集已被批准时，把 sandbox 的 ask 和 Policy 的 ask 视为已解决。deny 仍然阻止。

这足够挡住明显的网络和外泄路径。它挡不住名单内的 `node` 自己去访问网络、写保护路径之外的家目录，或一次起很多进程。

## 1. 风险分层（保持今天的产品默认）

| 操作 | 默认 |
|------|------|
| 读文件、检索、符号查询 | 自动，只读 |
| 叶子范围内的 apply | 自动，必须有备份可撤销 |
| 已批准的验证命令 | 在软沙箱里跑 |
| 未知二进制、网络工具 | ask，未批准不跑 |
| 删除大量文件、改沙箱和权限文件 | deny 或现有删除扫描的服务器路径，不交给任意 shell |
| push、发布、改 git config | 不做工具。见 Tools 的明确不做 |

## 2. 切片

### SB-0 — 把软沙箱写成不可回退的地板

**目标**：后续切片不能为了「让测试跑起来」关掉分类。

- [x] 在 `Agent-Harness-Eval-Checklist.md` 的 H3 条目旁注明：SB-1 之前，`softOnly: true` 是已知限制，不是漏洞忽略。操作系统隔离落地前，这个标记继续留在分类结果里。
- [x] 单测继续覆盖：未知二进制 ask、网络二进制 ask、保护路径 deny、`shell: false`。
- [x] 不新增用户开关去关闭分类。

**验收**：现有 `shell-sandbox.test.ts` 保持通过。清单里写明没有 OS 隔离。

### SB-1 — 并发与进程清理

**目标**：一次运行不能无界地留下子进程。为 Loop 长时间执行做准备，仍不引入容器。

- [x] 每个工作区同时 soft-run 的命令数有上限（4）。超出时后来的命令被拒绝，并在结果信封里说明。
- [x] 超时时杀掉该命令派生的进程组，而不只是直接子进程。做不到的平台在结果里标记 `processCleanup: "direct-child-only"`。
- [x] 运行被取消时，走同一条清理。
- [x] 不限制 CPU 配额和内存 cgroup。做不到就不要报成已经限制。

**验收**：父进程被取消后，测试里启动的睡眠子进程不再残留。达到并发上限时，新命令不会偷偷执行。

### SB-2 — 工作区写入提示

**目标**：命令即使被允许，也不要无声地改写沙箱配置和权限文件。

- [x] 运行前后比较保护路径的哈希。变化则该次命令结果为失败，并要求用户查看。不自动还原整个工作区。
- [x] 叶子 apply 的备份机制不在这里重做。

**验收**：一条被允许的命令若改了 `.projectos/permissions.json`，结果 `ok: false`，文件变化可见。

### 明确不做

| 项 | 何时再看 |
|----|----------|
| macOS Seatbelt / Linux Landlock / 容器 | Phase 4。在 SB-1 的清理可靠之后再做实验，不替代 Policy |
| 云端 Devbox、依赖缓存镜像、环境快照 | 没有远程执行产品之前不做 |
| 默认允许网络安装依赖 | 与当前 `networkAccess: false` 相反 |
| 按命令内容做完美的静态安全证明 | 分类是名单和路径，不是通用程序分析 |

## 3. 依赖

SB-0 只改文档和测试锁。SB-1 依赖 Tools T-0 的结果信封来表达拒绝和清理失败。SB-1 应在 Planning P-1 让 Loop 真的跑命令之前完成。

## 4. 不变量

- deny 永不因为「验证很重要」而降级成执行。
- `softOnly` 在 OS 隔离落地前必须留在分类结果里，UI 不能把它显示成「已沙箱隔离」。
- 沙箱不扩大文件写范围。工作区里的叶子 ACL 仍然有效。
- 超时和取消必须结束进程或明确报告清理失败。

## 5. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-10-20 | 初稿。把 H3.B 软沙箱标成地板，并把进程清理和保护路径监视收成 SB-1、SB-2。 |
| 2026-10-20 | 落地 SB-0 到 SB-2：并发上限 4、进程组清理、保护路径变化记为失败且不自动还原。 |
