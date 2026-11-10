# Loops Graph · Six Goals Execution Tracking

**Baseline**: `graph` @ `bec3dd75ef9ab0b50e7b7b564fb91ea5adf0f398`  
**Branch**: `cursor/loops-dispatch-evidence-cab8` (stacked on approval-binding PR9; targets `graph`)  
**Updated**: 2026-11-10 (`9453616`) — 材料首批可用（txt/csv/xlsx/pdf/png）+ URL DNS-pin SSRF + TM-8 重审 + PW-7 UI + ModelGateway 离线 contract；gate ATTRIBUTION 诚实修正（非 live）  

状态键：**计划** · **实现** · **contract** · **localE2E** · **live** · **待验** · **未配置** · **catalog_only**  
**入文档 ≠ 完成。**

## 权威互链

| 文档 | 角色 |
|------|------|
| [`Loops-Graph-Project-Workflow-and-Materials-Dev-Plan.md`](./Loops-Graph-Project-Workflow-and-Materials-Dev-Plan.md) | **增量 A/B 权威**：项目内真实 workflow run + 多类型任务材料；阶段依赖与验收矩阵 |
| [`Loops-Graph-Gmail-Connector-Dev-Plan.md`](./Loops-Graph-Gmail-Connector-Dev-Plan.md) | **Gmail 追加权威**（2026-11-10）：只读首期 + 发送/push 边界；非 5814430 |
| [`Loops-Graph-Gaps-Closure-Dev-Plan.md`](./Loops-Graph-Gaps-Closure-Dev-Plan.md) | 六机制 / 可靠性总控（GC-*） |
| [`Loops-Graph-Workflow-Studio-Dev-Plan.md`](./Loops-Graph-Workflow-Studio-Dev-Plan.md) | Studio 壳与 D1–D9 决策基线 |
| [`Loops-Graph-UI-Visual-Authoring-Dev-Plan.md`](./Loops-Graph-UI-Visual-Authoring-Dev-Plan.md) | DutyCard / Palette 手工入口 |
| [`Loops-Graph-Node-Architecture-Dev-Plan.md`](./Loops-Graph-Node-Architecture-Dev-Plan.md) | 四类节点合同 |
| [`bugs.md`](../../bugs.md) | H3 SSRF — URL 材料读取须默认拒内网 |

---

## 六目标实况

| # | Goal | 状态摘要 |
|---|------|----------|
| 1 | 连接器 GitHub…PostHog（11 平台不删）+ **Gmail 追加** | Batch1 **contract**/live待验；Batch2 Linear/Jira/Notion/Vercel-list **contract**/live待验；Batch3 **catalog_only**；Gmail readonly **实现/contract（loopback）**/真实邮箱 **未接** |
| 2 | Condition/parallel/loop/timer/retry/pause/resume | GC 主体 **实现/contract**；DutyCard logic 表单 **实现**/UI待验 |
| 3 | Reusable Agents + 互调 | wiring **实现**/待增强 |
| 4 | Human review/approval | binding **contract**；`before_write`/`before_test`/`before_external` 插入语义 + reject/approve/drift/orphan runtime **contract**；DutyCard **实现**/UI待验；OAuth **未配置** |
| 5 | Engineering context | digester + Verify binding **实现/contract**；完整 RunBinding **计划**（见 PW） |
| 6 | Observability | journal/redaction **contract** |

---

## Authoring 基线（事实）

| 项 | 事实 | 状态 |
|----|------|------|
| Heuristic vs LLM | **默认 `authoringEngine=provider`**（Composer chip 显式；rules 须用户点选）→ store → IPC → LocalApi `useProvider:true` → ModelGateway；无配置 **fail-closed**；rules=`useProvider:false` | provider **contract** + 用户入口路径测；**live未验** |
| Workflow + 选中节点上下文 | Provider prompt 含 RESPONSE_SCHEMA + NODE_FIELDS + catalog `api=`；全 draft + `selectedNodeId`；rules **不消费**选中 | provider **contract** |
| 局部 patch / ID 保留 | `applyIntentNodePatch` / `mergePreservingUntargeted` + Accept/Undo/stale；错误脱敏（无 Zod/provider 原文渗 UI） | **contract** |
| 真实 provider 三轮 | 无自动读 key / 无付费 live | **live未验**（外部缺口） |

---

## 增量 A/B 状态（摘自权威计划；详表见该文档 §4）

| 切片 | 状态 |
|------|------|
| PW Project run binding / 预检 / 项目手动 E2E | **实现/localE2E（非 live）**：rail 选已保存流程 → `openSavedFlowForRun` / Run 页 → materials→preflight→start；taskPack 保存/重开/隔离 Intent；DI `local_tools` fail→feedback→语义 fix→green；ChangeSet+TestReport 含 failed+passed、exitCode、unifiedDiff；UI Diff 展开 + exit DOM（`loops-b-ui-06-diff-passed-viewport.png`；单屏不能当全文验收）。runBinding 隔离；cancel **contract**。付费 live / Issue 快捷入口 **未完** |
| TM TaskMaterial schema + Pure 输入复用 | **实现加深（仍非全勾）**：首批可用级别不再全 unsupported——plaintext/md/json/csv/log=`text_preview`；CSV/XLSX=`structured_selection`（选后）；PDF=`full_text_parse`（pdftotext；缺工具/加密/扫描空文如实 unsupported）；png/jpeg=`vision_attach`（magic+size 校验；缺视觉 blocker）。Electron `ingestLoopTaskMaterial` + 面板接线；节点投影→ModelGateway `images[]` **offline contract**；URL DNS-pin socket + port/login_wall/abort；PW-7 **UI**；TM-8 材料变化重审提示（不机械全图重跑） |
| URL SSRF 默认拒内网 | **实现/contract**：`loop-url-fetch-policy` + 生产 `fetchLoopUrlMaterial`（DNS 解析与 socket 绑定、多 A/AAAA 过滤私网、redirect 每跳重钉、无跨 host 凭证、登录墙≠已读） |
| 离线事件全天排队 | **未实现**（不可承诺） |

---

## 安全门禁（221b231 / 持续）

| 项 | 状态 |
|----|------|
| High-risk / catalog_only 强制 | **contract** |
| 非幂等 POST 不盲重试；timeout/abort unknown；ledger | **contract** |
| URL/header/body 脱敏 + fake-secret | **contract** |
| Overlay 真实 LoopSaaSNodeCard；DutyCard 类型表单 | **实现**；暗色保留；A3 连续陈旧（planner 改标题保 retry=2；retry 2→1 保 1；重开）：`loops-a3-*`。**UI Accept-disabled ≠ server reject**（server 拒绝仅独立 contract：`loop-approval-runtime-gate` / `acceptLoopGraphEditOffer`）。B：`loops-b-pw-failfix-evidence.json` + `loops-b-ui-failfix-e2e-evidence.json` + `loops-b-ui-05-artifact-cards-visible.png`（可见产物卡；勿用错标题空图）。**不得**用 fatal 后手改当连续通过 |
| LocalApi→adapter→loopback settle | **实现**/contract 路径；GitHub write / connector（含 Gmail）缺 `credentialRefId` 或无 DI transport **fail-closed**（catalog ≠ authorized）；live未验 |
| Studio 旧「固定侧栏 Inspector」文首 vs DutyCard | **冲突未消**：Studio D3/LG-1.1 仍写侧栏；现行 UI 为 Overlay 内 DutyCard / Inspector empty hint——**不以旧 Studio 文首当已验收** |
| GC 总勾选 / 发布门禁 | **未全勾**：GC-6.5/6.6、GC-7.2 总验收待收尾；**不得**宣称 GC 门禁已通过 |

---

## Gmail（追加；详见权威计划）

| 切片 | 状态 |
|------|------|
| 文档 scope/push/sync 矩阵 + Limited Use | **计划权威**（本仓新文件） |
| catalog + messages_search/get / threads_get / attachments→TM | **实现/contract**（loopback；无真邮箱） |
| 预览 plaintext-only（非 HTML sanitize 宣称） | **实现/contract** |
| accountRef 绑定 / preview≠full / 50M 消费拒 / deferred text body | **实现/contract（负例）** |
| 在线 poll_history（非全天监听；404→resync_required） | **实现/contract（loopback）**：增量 dedupe + `recoverConnectorCursor` 指引；非完整 24/7 轮询器；真邮箱 **未接** |
| users.watch → Pub/Sub | **计划**；首期不部署 |
| 发送审批 / compose | **计划**；默认关 |
| 真实 Gmail / OAuth live | **未配置 / 未验**（只读开发 ≠ 授权连邮箱） |

---

## 验证闸（每推送更新）

```text
# 发现命令（完整；遗漏见 /opt/cursor/artifacts/vitest-discovery-command.txt）
cd projectos
env PROJECTOS_REQUIRE_REAL_PREVIEW=1 npx vitest run --maxWorkers=1 --minWorkers=1 \
  services/loop- services/loop-connectors contracts/loop- \
  workbench/src/components/LoopGraph workbench/src/state/loop \
  client/mock-loop-graph-store.test.ts
# 遗漏相对全仓 `npm test`：desktop e2e、非 loop* services/contracts、live Gmail/ModelGateway、SaaS OAuth
```

近期本地闸（实现切片，非文档完成；以当次命令为准；**最终 HEAD 日志见 gate-deep/pr-final，勿贴 a14 旧 log**）：
```text
# Loops 定向发现集（≠ 全项目）：→ Test Files 61 / Tests 266（以当次命令为准）
# projectos tsc --noEmit：最终工作树 **0**（pr-final）；先前 a14 日志 raw 22 不得当最终 HEAD
#   bec3dd7 raw 159 / graph tip raw 138 — **不得**仅用历史 22<<159 宣称无回归；tsconfig 与 bec/graph 相同（无缩覆盖）
#   先前 newVsBecCount=2（createdAt + history map）本轮已独立修掉 → newVsBecCount=0
# workbench `tsc -b`：最终工作树 **0**。诚实更正：graph tip 同工具链早已 unique0，而 a14 PR tip unique26
#   （newVsGraph=26）——不得写「workbench 全是基线与 graph 一样」；本轮最小类型补丁清零，非 merge。
#   完整：/opt/cursor/artifacts/gate-deep/ATTRIBUTION.json + pr-final/*tsc*.txt
```

**DOM/Runtime 开链（云端 Linux xvfb，非 Mac）** — 本轮**不宣称闭环 / 不宣称 live / 不自封 shipped**：
- Authoring A3（**loopback·not live**）：证据 `loops-a3-evidence.json` + `loops-a3-*.png`。
- Approval：**UI Accept-disabled 不是 server 拒绝**；server gate 独立 contract。
- Project B（**local deterministic E2E · DI-only**）：`loops-b-pw-failfix-evidence.json`、`loops-b-ui-failfix-e2e-evidence.json`；截图单 viewport ≠ 全文。
- TM 首批可用：txt/md/json/csv/log + xlsx/pdf（Electron ingest）+ png/jpeg vision；URL DNS-pin；PW-7 UI；TM-8 重审提示。offline contract：`loop-material-electron-gateway.contract.test.ts`。
- Gmail/SaaS：readonly **contract/loopback** + poll dedupe/recover 指引；Batch3 **catalog_only**；真邮箱/OAuth **未接**。
- **工程未完**：离线全天排队、付费 live、真 Gmail、SaaS 生产账号接线、Mac。**真外部阻塞**：账号/OAuth/付费 live/外发/Mac。

**graph 只读分叉**（不 rebase/merge/force）：tip `34af3746c4024d32eb38a76ff5e78021ad840697`；merge-base `bec3dd75ef9ab0b50e7b7b564fb91ea5adf0f398`。

No merge / paid live / Mac / 真实外发 / 真 Gmail / 凭据授权。
