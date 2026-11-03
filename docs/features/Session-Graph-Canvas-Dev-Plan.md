# Session Graph Canvas（吸收 Trace Canvas）

**状态**：M0–M3 implemented（2026-11-03）。  
**范围**：把 Trace Canvas 的 **Canvas** 信息密度融入 Project OS Session Graph：会话卡升级为策展摘要 strip，并增强 live 状态、分叉边、筛选/聚焦与 Misc 副标题。  
**产品定位一句话**：Session Graph 仍是「会话树画布」；card 内是 highlight reel，不是全量 chat，也不是 Trace 的 thread。

## 与 Trace Canvas 对照

| Trace Canvas | Project OS Session Graph |
|--------------|--------------------------|
| Card = thread | Card = chat session |
| Strip = curated records | `head.previewStrip`（intent/decision/question/outcome/note） |
| Live tip on card | `running` / `awaiting_review` live chip |
| Fork/merge edges | Parent→child fork edge + label；merge 仍走 `mergeGraphs` |
| Inbox | Misc tray（chip 可带 strip 副标题） |
| Gone quiet | Foot「Quiet」（idle ≥ 3 天） |
| Branches / Timeline / Agents | **本计划不做** |

## 非目标

- 自由拖放位置持久化
- Branches / Timeline / Agents 视图
- `workLineId` 多会话绑同一工作线
- AI tidy-up / 多选 Merge 大改
- 把执行态写入 C4

## 实现锚点

| 层 | 路径 |
|----|------|
| 契约 | `projectos/contracts/chat-session.ts`（`previewStrip` / `messageCount`） |
| 投影 | `projectos/contracts/chat-session-context.ts`（`buildSessionGraphStrip` / `withSessionGraphHeadProjection`） |
| 持久化 | `projectos/services/chat-session-service.ts`、`client/mock-chat-session-store.ts` |
| UI | `workbench/.../SessionGraph/SessionGraphOverlay.tsx`、`layoutSessionGraph.ts`、`sessionGraphCardMeta.ts` |
| 跳转 | `chatSessionStore.openSessionAtMessage` + `ChatPanel` `pendingRevealMessageId` |

## 验收

1. Topic 卡最多 5 条摘要行；空态显示「暂无摘要」。
2. `running` / `awaiting_review` 卡头有 live chip。
3. 点击 strip 行打开会话并尽量滚到 `messageId`。
4. Fork 边有「分叉」标签；子卡 foot 有 Forked。
5. 搜索过滤 dim；点击卡聚焦；Misc 可显示 strip 副标题。
