# Session：运行状态与恢复开发计划

**状态**：Draft（2026-10-20）。S-0、S-1、S-2 已落地。  
**范围**：会话、Agent Run、Loop 实例在进程重启之后仍然可读，并且不会把一次写了一半的 apply 再执行一遍。  
**总计划**：[`Backend-Dev-Plan.md`](Backend-Dev-Plan.md) Phase 1 做 S-1，Phase 3 做 S-2。  
**锚点**：

- 聊天会话：`services/chat-session-service.ts`，落在 `.projectos/chat-sessions/`。
- 会话压缩：`services/session-compaction.ts`。摘要不是运行状态。
- Agent 事件：`agent-orchestrator` 把事件追加到 `.projectos/agent-runs/<runId>.jsonl`。运行对象 `this.runs` 在内存中。
- 内存事件模式：`eventPersistence === "memory"` 时不落盘。
- 取消：`cancelAgentRun`。
- Loop 实例：存在 Loop 图文档里，事件最多保留 500 条。
- 文件回滚：apply backup 与对话 checkpoint。Restore 只回滚文件，不删消息。

**对标一句话**：会话是人与 Agent 的对话。Run 是一次执行。Loop Instance 是某版规格的一次执行。三者可以互指 id，但不能共用一个含糊的「会话状态」。

## 0. 现状

| 实体 | 重启之后 |
|------|----------|
| Chat session | 还在。消息、钉选、压缩快照都在文件里 |
| Agent 事件 JSONL | 默认还在。没有从 JSONL 重建「现在算不算还在跑」 |
| 编排器状态机 | 丢了。进程退出后没有 `interrupted` |
| 验证批准 | 文件存储存在，但服务默认是内存实现。见 Verification V-0 |
| Loop 实例 | 在 Loop 文档里。步进不依赖编排器内存，所以「假完成」也会被持久化 |
| 队列 / worker | 无。长任务就是桌面进程里的一次调用 |
| 断线补发 | 同一次进程里有监听器。新 UI 连接不会从 JSONL 把错过的事件补齐 |

所以多轮聊天是够的。一次改到一半如果应用退出，用户看不到可靠的「已中断」，也可能不知道 apply 有没有发生。

## 1. 状态

在 `AgentRunStatus` 增加 `interrupted`。不增加「验证中」作为持久状态；验证是事件加 `VerificationEvidence`，避免和 Loop 的状态各写一套。

```text
queued → running → awaiting_review → complete
                 → error
                 → cancelled
                 → interrupted
```

`interrupted` 只由启动时的恢复逻辑写入：磁盘上最后一条事件不是终态，且内存里已经没有这个运行。用户取消仍然是 `cancelled`。

## 2. 切片

### S-0 — 身份对照

**目标**：后来的代码知道 id 各指什么。不改行为。

- [x] 在编排器或契约注释里固定：`sessionId`、`runId`、`rootRunId`、`parentRunId`、Loop `loopId`、`instanceId`、`specVersion`。
- [x] Chat 里发起的 Run 在会话记录上保存 `runId`。已经有的字段就复用，不新造同义字段。
- [x] Loop 节点若还没有 `agentRunId`，P-1 再加。本切片不启动 Run。

**验收**：读一份会话文件和一份 run JSONL，能说明它们是否同一次任务。对不上时保持为空，不猜测。

### S-1 — 启动时把半截运行标成中断

**目标**：Phase 1 的恢复合格线。先不做续跑。

- [x] 进程启动时扫描 `.projectos/agent-runs/*.jsonl`。最后事件不是 `run_completed`、错误或取消时，追加一条中断事件，运行状态视为 `interrupted`。
- [x] 不自动调用 apply，不自动重放工具。
- [x] 若该 run 已有 backup id，事件带上该 id，现有 undo 可以打开。没有 backup 时 `writes` 是 `none` 或 `unknown`，不编造备份。
- [x] `eventPersistence: "memory"` 的测试运行不写 JSONL，因此不参与扫描。

**验收**：写到一半杀掉进程，再次打开后该 run 不是 `running`。工作区文件与杀掉前一致。

### S-2 — 有条件的续跑

**目标**：只有能证明不会重复写入时才继续。依赖 Harness H6 的规则，本文件定义状态侧。

- [x] 未 apply：允许从最后一次成功的阶段重新生成。重新生成使用新的模型调用，不重放旧输出当事实。
- [x] 已 apply：禁止再次 apply。只允许查看证据、跑还没跑的验证，或 undo。
- [x] 幂等键是 `runId + backupId`。相同的 apply 请求返回已有结果。
- [x] Loop 实例若指向一个 `interrupted` 的 Run，实例也进入暂停，不继续把后面的节点标完成。

**验收**：重复提交同一次 apply 不写第二次。已写入的运行恢复后不会再生成一份 diff 盖上去。

### 明确不做

| 项 | 原因 |
|----|------|
| 后台队列、多 worker、优先级 | 没有远程执行。桌面进程内的运行先做对 |
| 多设备同步会话 | 单用户本地 |
| 把压缩摘要当成可恢复的运行现场 | 摘要会丢工具输出，而且被标明不是授权 |
| 从 JSONL 重放模型工具调用 | 工具有副作用 |

## 3. 依赖

S-0 可立即做。S-1 不依赖代码索引。S-2 依赖 V-0 的证据和 apply 的 backup id。Planning P-1 在 S-1 之后把 Loop 挂到 Run 上，否则 Loop 会在编排器已中断时继续步进。

## 4. 不变量

- 终态是 `complete`、`error`、`cancelled`、`interrupted` 之一，重启不会把它们变回 `running`。
- 恢复不扩大写范围，不跳过 Policy。
- 事件追加失败时，现有逻辑已经停止把运行当成可持久。恢复逻辑遇到写坏的 JSONL 行要跳过并表面化，不用半行 JSON 猜测成功。
- 会话摘要、记忆和检索快照都不是运行检查点。

## 5. 修订记录

| 日期 | 变更 |
|------|------|
| 2026-10-20 | 初稿。对照聊天会话文件、run JSONL 和编排器内存状态，把中断和有条件续跑分开。 |
| 2026-10-20 | S-0 固定 id 含义。S-1 在打开工作区时把未结束的 JSONL 标成 interrupted，不重放 apply。 |
| 2026-10-20 | 落地 S-1：未结束的 JSONL 追加 `run_interrupted`，并标明是否已有备份。 |
| 2026-10-20 | S-2：已写入的运行拒绝再次 apply；Loop 碰到 interrupted 的 Run 会暂停。 |
