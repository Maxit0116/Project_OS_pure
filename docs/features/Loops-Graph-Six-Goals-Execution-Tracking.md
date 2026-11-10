# Loops Graph · Six Goals Execution Tracking

**Baseline**: `graph` @ `bec3dd75ef9ab0b50e7b7b564fb91ea5adf0f398`  
**Branch**: `cursor/loops-dispatch-evidence-cab8` (stacked on approval-binding PR9 `ccf2804`; targets `graph`; no third stack layer)  
**Prior tip**: `615fa644` / reliability WIP on `38404db`  
**Updated**: 2026-11-10 (reliability + n8n SaaS UI + connector batch1 contracts)

Status keys: **已有已测** · **已有待测/需增强** · **需新增** · **未配置/不可用** · **契约已测/live待验**（禁止标假完成；catalog/logo ≠ 接通）

| # | Goal | Inventory (source-checked) | Status |
|---|------|----------------------------|--------|
| 1 | GitHub/Slack/Feishu/Lark/Sentry + Trigger/Action/Webhook/HTTP | GitHub `settleGithubDispatch` **已有已测**；统一 `loop-connectors/` 框架 + Slack/Feishu/Lark/Sentry **契约已测/live待验**；Linear→PostHog **catalog_only** | 分批不删范围 |
| 2 | Condition/parallel/loop/timer/retry/pause/resume | GC + parallel drain **已有已测**；cancel/pause mid-dispatch 不复活 **已有已测** | 回归保留 |
| 3 | Reusable Agents + 互调 | roles/wiring **已有待测/需增强**；`loop-agent-call-budget` **已有已测** | — |
| 4 | Human review/approval | binding + choice whitelist **已有已测**；外部 actor 签名（Slack/Feishu/Lark）**契约已测**；`local_declared` 拒审批 **已有已测**；真实 OAuth/账号 **未配置** | — |
| 5 | Engineering context | workspace digester + Verify evidence binding **已有已测** | — |
| 6 | Observability | dispatch journal / approval_stale / connector audit redaction **已有已测** | — |

## Reliability slice (retained)

1. **Prepare → final gate → transport** with `preparing` vs `http_started` (deny clears only preparing).
2. **Identity-safe writeback** after every await; no fake CAS.
3. **Verify** via `requestVerification` (read-only), once-per-attempt digest.
4. LocalApi settle DI + probes; agent call budget; offline connector fail-closed.

## n8n-like SaaS node UI (authorized local UX)

- Independent Pure cards (`LoopSaaSNodeCard` + Overlay/Palette brand icons). **No n8n source/CSS** (Sustainable Use License).
- Local icons: GitHub/Slack/飞书 Feishu/Lark/Sentry — see `workbench/.../integrations/PROVENANCE.md`.
- Runtime status badges (未配置/未实现) separate from brand logo; disconnected nodes block run.
- Fixture screenshots: `/opt/cursor/artifacts/loops-saas-nodes-before-crop.png` · `loops-saas-nodes-after-crop.png` (zoom=1, mixed Agent/Human/Logic).

## Product connectors — full scope (batched)

### Batch 1 — reliability closed → GitHub deepen + collab + Sentry（本切片）

| Vendor | API pin | Triggers | Actions / Notify | Impl | Live |
|--------|---------|----------|------------------|------|------|
| GitHub | REST 2022-11-28 | `pr_opened` (partial) | `create_pr`, `create_branch` via `settleGithubDispatch` | **reuse_existing / 已有已测** | contract_tested；真实 token **未配置本轮** |
| Slack | Web API + Events | `message_trigger` | `chat_postMessage`; `incoming_webhook_notify` (**notify-only**); `interaction_approval` (signed) | **implemented_contract** | **契约已测/live待验** |
| 飞书 Feishu | open.feishu.cn OpenAPI v1 | `event_message_receive` | `im_message_create`; `custom_bot_notify` (**notify-only**); `card_action_approval` | **implemented_contract** | **契约已测/live待验** |
| Lark | open.larksuite.com OpenAPI v1 | same shape, **separate host/brand** | same as Feishu, Lark host | **implemented_contract** | **契约已测/live待验** |
| Sentry | API v0 | `issue_created_webhook` | `list_issues`, `get_issue` | **implemented_contract** | **契约已测/live待验** |

Shared framework (`projectos/services/loop-connectors/`):

- Credential **refs only** (schemes: oauth/bot/webhook/signing/api_key) — secrets never in frontend assets.
- Injectable HTTP transport + bounded 429/5xx retry; **POST timeout → `unknown_outcome` no blind resend**; AbortSignal cancel.
- Webhook HMAC verify + dedupe anti-replay; Slack/Feishu/Lark approval rejects `local_declared`.
- Audit events with redacted Authorization headers.
- High-risk defaults: Vercel promote/rollback & Supabase production writes **disabled** until independent auth (catalog flags).

### Batch 2 — tasks / docs / deploy（catalog only this round）

| Vendor | Triggers | Actions | Impl | Live |
|--------|----------|---------|------|------|
| Linear | issue webhooks | `create_issue` | catalog_only | unconfigured |
| Jira Cloud | issue updated | `create_issue` | catalog_only | unconfigured |
| Notion | page updated | `create_page` | catalog_only | unconfigured |
| Vercel | — | list (read); promote/rollback **default OFF** | catalog_only | disabled_high_risk |

### Batch 3 — data（catalog only this round）

| Vendor | Triggers | Actions | Impl | Live |
|--------|----------|---------|------|------|
| Supabase | — | read/RPC allowlist; production write **default OFF** | catalog_only | disabled_high_risk |
| PostHog | — | capture / query insights | catalog_only | unconfigured |

## Actual delivered this round (not wish-list)

1. Reliability harden settle/Verify/budget/offline (prior WIP retained).
2. n8n-like SaaS node visuals + palette Feishu/Slack/Lark/Sentry/GitHub + DOM/registry tests + screenshots.
3. `loop-connectors` production adapters + contract tests (request construct, cred ref, signature/replay, 429 retry, timeout unknown, cancel, redaction, notify≠approval).
4. Tracking table above with per-vendor Trigger/Action and honest live status.

**Not done / blocked on real user**: OAuth connect, reading existing credentials, live outbound Slack/Feishu/Lark/Sentry/GitHub, paid SaaS, merge, Mac, GroK Bot connector install as substitute.

## Verification

```text
npx vitest run <12 loop/connector/UI files>
→ Test Files 12 passed | Tests 88 passed | exit 0

Typecheck: 159 error TS (baseline ~160–161 on 615fa644/38404db; no new loop-connector regressions)
```

No merge / paid / live outbound / Mac / third PR layer.
