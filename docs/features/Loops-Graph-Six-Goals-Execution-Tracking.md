# Loops Graph · Six Goals Execution Tracking

**Baseline**: `graph` @ `bec3dd75ef9ab0b50e7b7b564fb91ea5adf0f398`  
**Branch**: `cursor/loops-dispatch-evidence-cab8` (stacked on approval-binding PR9; targets `graph`)  
**Updated**: 2026-11-10（PR10 tip `7ac2a91` 门禁包保留；product 待叠加 review-fix：index reconcile / freeze fail-closed / settle 边界诚实 / DI 无伪 backupId / skipPreflight 收敛；parent durable `219949a`）— Electron **Start→Pause→Resume** 同实例 UI ok（独立复核）；GC-6.6 a255 重挂**撤销** + ab55 不可变失败保留；**durable DI** 正式落盘可 restore（**合成 timeline ≠ live apply；无真实 undo backup**）；Studio/PDF/ACL 同前；**最终 clean 同源门禁待独立代码复核后再封**。**不宣称总交验 / 非 shipped / 非 live**。

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
| 1 | 连接器 GitHub…PostHog（11 平台不删）+ **Gmail 追加** | Batch1/2 **contract**/live待验；Batch3 **implemented_contract**（supabase/posthog loopback 适配器+settle；write_rows high-risk 密封；live **未接**）；Gmail loopback **实现/contract** + settle `attachments_get`（accountRef/50M）；真邮箱 **未接** |
| 2 | Condition/parallel/loop/timer/retry/pause/resume | GC 主体 **实现/contract**；Inspector logic UI **component 测**；GC-6.5 minimap **实现**；GC-6.6 DutyCard→`openAgentFlowForRun`→同 run **非空** Agent Flow（durable AgentRun）**localE2E** `loops-gc66-durable-*`；DutyCard 入口 = **dblclick** `[data-loop-node]` / Open Duty（≠ Review 架构详情）；GC-7.2 §9 逐项测映射；**仍非** shipped/live |
| 3 | Reusable Agents + 互调 | wiring **实现**；预算 contract；**LocalApi 产品入口** planner DevPlan→coder 交接（loopback·非 live）；≠ 仅预算 |
| 4 | Human review/approval | binding/runtime gate **contract**；**LocalApi** approve/reject/takeover→paused 同实例事件；`runApprovalContextDigest`；OAuth **未配置** |
| 5 | Engineering context | digester + Verify **实现/contract**；RunBinding 条款**已逐项核**（见 [`RUNBINDING-GAP.md`](./RUNBINDING-GAP.md)）；无未核「或许还有」 |
| 6 | Observability | journal/redaction **contract**；Diff 展开；**LocalApi** fail TestReport→feedback 路径（同实例事件；≠ 仅提示）；live未验 |

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
| TM TaskMaterial schema + Pure 输入复用 | **实现加深（仍非全勾）**：首批 plaintext/md/json/csv/log=`text_preview`；CSV/XLSX=`structured_selection`（上传默认选区+UI 列行）；PDF=`full_text_parse` **仅当宿主 `pdftotext`（Poppler）存在**；缺工具 → `unsupported` + 可安装说明（apt `poppler-utils` / brew `poppler`；**产品不自动安装 / 不擅自 Mac 安装**）；存在时解析、缺失 fail-closed（`loop-material-pdf.ts` / `loop-materials-security-audit.test.ts`）。png/jpeg=`vision_attach`。Electron ingest + **URL 面板** `ingestLoopUrlMaterial`（DNS-pin；失败成卡）。节点投影 `projectMaterialsForNode` **offline**。PW-7/TM-8 同前。证据：`/opt/cursor/artifacts/loops-evidence-bundle-evidence.json` + `loops-evidence-bundle-*.png` |
| URL SSRF 默认拒内网 | **实现/contract**：`loop-url-fetch-policy` + 生产 `fetchLoopUrlMaterial`（DNS 解析与 socket 绑定、多 A/AAAA 过滤私网、redirect 每跳重钉、无跨 host 凭证、登录墙≠已读） |
| 离线事件全天排队 | **实现/contract（非 live push）**：`.projectos/loop-event-queue.json` 持久 enqueue/dedupe/drain/recover + LocalApi；≠ 24/7 外网 webhook |

---

## 安全门禁（221b231 / 持续）

| 项 | 状态 |
|----|------|
| High-risk / catalog_only 强制 | **contract** |
| 非幂等 POST 不盲重试；timeout/abort unknown；ledger | **contract** |
| URL/header/body 脱敏 + fake-secret | **contract** |
| Overlay 真实 LoopSaaSNodeCard；DutyCard 类型表单 | **实现**；暗色保留；A3 连续陈旧（planner 改标题保 retry=2；retry 2→1 保 1；重开）：`loops-a3-*`。**UI Accept-disabled ≠ server reject**（server 拒绝仅独立 contract：`loop-approval-runtime-gate` / `acceptLoopGraphEditOffer`）。B：`loops-b-pw-failfix-evidence.json` + `loops-b-ui-failfix-e2e-evidence.json` + `loops-b-ui-05-artifact-cards-visible.png`（可见产物卡；勿用错标题空图）。**不得**用 fatal 后手改当连续通过 |
| LocalApi→adapter→loopback settle | **实现**/contract 路径（**本阶段产品入口 = LocalApi + IPC 队列 API**；`settlePendingConnectorOp` 不在 ProjectOSApi 桌面自动 UI/自动 recover——不以 mock 冒充桌面完整产品）；GitHub write / connector 缺 `credentialRefId` / 无 DI transport / **无 RunBinding·permissionSet 冻结** **fail-closed**；live未验 |
| Studio 文首 vs DutyCard | **已同步文档**：Studio D3/LG-1.1 改写为 Pure **浮动 DutyCard**（非固定侧栏）；不擅自改全局 UI |
| GC 总勾选 / 发布门禁 | GC-7.2 §9 **逐项测映射已写**（Gaps §9）；**仍不得**宣称 shipped/live/总交验 |

---

## Gmail（追加；详见权威计划）

| 切片 | 状态 |
|------|------|
| 文档 scope/push/sync 矩阵 + Limited Use | **计划权威**（本仓新文件） |
| catalog + messages_search/get / threads_get / attachments→TM | **实现/contract**（loopback；无真邮箱） |
| 预览 plaintext-only（非 HTML sanitize 宣称） | **实现/contract** |
| accountRef 绑定 / preview≠full / 50M 消费拒 / deferred text body | **实现/contract（负例）**；settle 产品路径含 `attachments_get`（accountRef/size fail-closed） |
| 在线 poll_history（非全天监听；404→resync_required） | **实现/contract（loopback）**：`gmailPollHistory` dedupe + **`gmailIncrementalSync` 产品路径**（history→resync_required→recoverCursor→messages_search）；**恢复指引/helper ≠ 完整产品同步**——增量同步已接线，仍 **非** 24/7 轮询器/外发；真邮箱 **未接** |
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

近期 tip-final 闸（`ba5ee1e`；非总交验）：
```text
# builds: projectos tsc-build / workbench vite / desktop electron-vite — all EXIT 0
#   /opt/cursor/artifacts/gate-full/projectos-npm-run-build-ba5ee1e.txt
#   /opt/cursor/artifacts/gate-full/workbench-npm-run-build-ba5ee1e.txt
#   /opt/cursor/artifacts/gate-full/desktop-npm-run-build-ba5ee1e.txt
# full npm test: 587 files / 3323 tests — NPM_TEST_EXIT:0
#   /opt/cursor/artifacts/gate-full/projectos-npm-test-ba5ee1e.txt
# EXITS+manifest: gate-full/EXITS-ba5ee1e.txt · MANIFEST-ba5ee1e.json · REVIEW-PACK-ba5ee1e.json
# viewport tip-final (per-shot sourceCommit/time/hash): loops-evidence-viewport-evidence.json
#   01 PW7 no-selection · 02 XLSX A1:C3 expanded · 03 TM8 blocked · 04 TM8 acked
# six-goal matrix: gate-full/SIX-GOALS-MATRIX-ba5ee1e.json
```

**未完成范围（明列；不把所有余项归真账号）**：
- PDF：宿主缺 `pdftotext` 时产品边界已明确（unsupported + 安装说明）；本云未装 → 走缺失路径；**不**自动装 Mac/Poppler
- 完整 ACL 矩阵 = **原文后续增强**（不入本阶段范围）
- PW-7 live Issue/PR 拉票；编辑器选区依赖用户先选中（无选区诚实失败）
- Gmail 真邮箱 / OAuth / users.watch·Pub/Sub / 发送审批；增量同步 ≠ 24/7
- SaaS Batch1/2 live；Batch3 live 项目未接（适配器已 loopback）；离线队列已实现但仍 **非** 外网 24/7 push
- ModelGateway 视觉 **live**；`loop_authoring` protocol-path inventory 对齐债
- GC **shipped/live/总交验**（§9 可勾 ≠ 发布门禁）；Mac；付费 live；真实外发

### Batch3 / 离线队列 — 生产入口与边界（非 live）

| 路径 | 入口 | 边界 |
|------|------|------|
| Batch3 adapters | `services/loop-connectors/adapters/batch3.ts` → `settle-connector` → LocalApi connector settle | **implemented_contract** loopback；`write_rows` high-risk 密封；**无** 真 Supabase/PostHog 项目 |
| Catalog | `catalog.ts` batch=`batch3_data`（supabase/posthog） | catalog ≠ authorized；缺 `credentialRefId` fail-closed |
| 离线事件队列 | `.projectos/loop-event-queue.json`；LocalApi `enqueueOfflineLoopEvent` / `drainOfflineLoopEventQueue`；IPC 同名 | 持久 enqueue + **dedupe** + drain recover；失败条目保留；**≠** 外网 24/7 webhook/push |
| 测 | `batch3.contract.test.ts`；`loop-event-offline-queue.test.ts`；`loop-offline-event-queue.local-api.test.ts` | 产品路径 unit/LocalApi；无 live |

### RunBinding — 见 [`RUNBINDING-GAP.md`](./RUNBINDING-GAP.md)（已核清单；无假设余项）

### GC-7.2 §9 — 见 Gaps Closure §9 逐项测名映射

| 产品语义（非控件存在） | 证据 |
|------------------------|------|
| DutyCard 入口 | Electron `loops-gc-dutycard-*` dblclick（独立复核已过） |
| Minimap 平移 | 同上 shot02（复核确认前后平移） |
| 关联 Run **同 run 非空** | **durable DI**：正式 `agent-runs` 落盘 + DutyCard 同 run 非空时间轴/重开/缺失诚实错误。**诚实边界**：DI timeline 为 schema 合成事件（非 live ModelGateway apply 审计；**无**可撤销真实 backupId）。历史：a255 撤销；ab55 `eefe4b60` 保留；dirty/fresh 层另存，不冒充最终 clean 同源 |
| pause/resume **状态变** | Electron UI `loops-start-pause-resume-*` Start enabled→awaiting_hitl→Pause paused→Resume 同实例（DI local_tools；**非**同 AgentRun 宣称）；另 LocalApi `loop-pause-resume.local-api.test.ts` |
| Batch3/Gmail settle LocalApi | `loop-batch3-gmail-offline.local-api.test.ts`（accountRef/50M/write seal/freeze） |
| 离线队列跨 reopen | 同上 + `loop-offline-event-queue.local-api.test.ts` |

### 六目标最终范围审计（原阶段必需 → 入口 / 级别 / 阻塞）

| Goal | 必需项 | 产品入口 | 级别 | 阻塞 |
|------|--------|----------|------|------|
| 1 连接器 | Batch1–3 + Gmail settle fail-closed | LocalApi `settlePendingConnectorOp`；runtime 排队含 gmail/supabase/posthog | **实现/contract/LocalApi** | **未live**（真 OAuth/邮箱/云项目） |
| 2 控制流 | 六机制 + DutyCard/minimap/关联 Run 非空 | Draw DutyCard；Gaps §9；GC-6.6 durable E2E | **实现/contract/localE2E** | **未live** |
| 3 Agents | planner→coder 交接 | LocalApi G3 | **LocalApi** | **未live** ModelGateway |
| 4 HITL | approve/reject/takeover + binding | LocalApi G4；approval-binding | **LocalApi/contract** | OAuth HITL **未配置** |
| 5 RunBinding | 身份/冻结/批准失效 | 见 RUNBINDING-GAP | **contract/LocalApi** | live digest **未授权** |
| 6 Observe | fail→feedback；Diff | LocalApi G6 | **LocalApi** | live observe **未验** |
| PW/TM | materials/preflight/TM-8 | 既有 tip 证据包 | **localE2E** | Issue 拉票/真 PR **未live** |

**需用户 live 授权（单列；本流不擅用）**：Gmail OAuth 真邮箱；Supabase/PostHog 真项目；SaaS Batch1/2 OAuth；付费 ModelGateway；Mac 实机；真实外发/merge。

**无账号阶段剩余（明确）**：完整 ACL 矩阵 = **原文后续增强**（不入本阶段）；其余既定项（GC-6.6 durable / Studio DutyCard 文案 / PDF 外部依赖提示）本 tip **已收**。仍 **非** shipped/live/总交验。

**DOM/Runtime 开链（云端 Linux xvfb，非 Mac）** — **不宣称闭环 / live / shipped**：
- Electron 材料证据 bundle（实入口）：`/opt/cursor/artifacts/loops-evidence-bundle-evidence.json`
  + `/opt/cursor/artifacts/loops-evidence-bundle-01-…png` … `-13-….png`（全路径；非简称）
- 覆盖：png/jpeg vision_attach；CSV 列行；XLSX structured_selection；PDF unsupported（无 pdftotext）；
  URL SSRF 失败卡；增删；重开 taskPack；节点投影 host 负例；TM-8 写回+ack；PW-7 面板+编辑器按钮
- Authoring A3 / Project B 既有证据仍有效；UI Accept-disabled ≠ server reject

**graph 只读分叉**（不 rebase/merge/force）：tip `34af3746c4024d32eb38a76ff5e78021ad840697`；merge-base `bec3dd75ef9ab0b50e7b7b564fb91ea5adf0f398`。

No merge / paid live / Mac / 真实外发 / 真 Gmail / 凭据授权 / 不自封发布。
