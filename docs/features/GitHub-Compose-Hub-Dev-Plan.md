# GitHub Compose Hub：本仓操作卫星 + 分区树浮窗

**状态**：M0–M3 implemented（初版，可迭代）。  
**范围**：Compose Hub 的 GitHub 卫星（当前项目本仓 HUD + 定位器）与 Workbench 中间浮窗 GitHub Graph（Sessions / Loops 同壳的分区树）；Overlay / Spatial Captures 仅多级浏览或搜索选中节点。  
**权威交叉引用**：
- 本仓库 Cursor plan：`GitHub Compose Hub`
- [`Tools-Integrations-Dev-Plan.md`](./backend/Tools-Integrations-Dev-Plan.md) — Git 只读 status；本计划用户发起的 workspace 写操作为 IPC，不是开放 agent 工具
- [`Agent-Harness-Dev-Plan.md`](./Agent-Harness-Dev-Plan.md) / worktree — graph 上挂 agent worktree 节点
- Compose：`SpatialComposeHub`、`hub-references.ts`、`spatial-pin.ts`
- Overlay 壳体：`GraphOverlayFrame`、`SessionGraphOverlay`、`LoopGraphOverlay`

**锁定决策**：
- **References → Repo** = 给 Agent 的外部参考仓；不做 checkout / PR
- **GitHub 卫星** = 演进现有 `repo` 卫星，绑定并操作**当前项目**本仓
- **GitHub Graph** = Workbench `GraphOverlayFrame` 中间浮窗；**分区树**，不是 commit Network Graph
- **Overlay / Spatial Captures** = 仅 `GithubBranchLocator`（多级目录 + 搜索）选中写回 `hub.repo`
- Dirty checkout（v1）= **拒绝**，不自动 stash
- PR（M3）= 优先 `gh`；否则打开 GitHub compare URL
- Push / Pull / Commit / force push / hard reset = **本轮不做**

---

## 产品分界

| 表面 | 负责 | 不负责 |
|------|------|--------|
| **References → Repo** | `kind: github` 参考源进 agent context | 工作区 checkout、开 PR |
| **GitHub 卫星** | 本仓身份、status HUD、打开定位器、常用只读/轻动作 | 完整图画布 |
| **GithubBranchLocator** | Capture / Overlay 内定位并绑定 branch | 渲染 Graph Overlay |
| **GitHub Graph 浮窗** | 树状可视化：checkout、branch-from、PR badge、worktree | Session / Loop 节点模型 |
| **Session / Loop Graph** | 对话分叉 / 工作流意图 | git 分区 |

---

## 实现对照

| Milestone | 内容 | 落点 |
|-----------|------|------|
| **M0** | 文案分界；卫星 HUD；status 透出 ahead/behind；prompt 区分本仓 vs 参考 | `composeHubStrings`、i18n、`workspace-git.ts`、`SpatialComposeHub`、`hub-references` 文案 — **done** |
| **M1** | `listWorkspaceGitBranches` + Locator（browse + search）bind-only | `git-context-service`、IPC/API、`GithubBranchLocator`、Overlay/Capture dataSource — **done** |
| **M2** | `CanvasOverlay += 'github'`；树浮窗；checkout / create branch | `chatSessionStore`、`GithubGraphOverlay`、`ChatToolsEdgeRail`、`AppShell` — **done** |
| **M3** | 扩展 `hub.repo`；`gh` PR / compare；worktree 节点；fetch + open remote | `spatial-pin`、`github-graph.ts`、`GithubGraphOverlay` PR/worktree、Agent Pool jump — **done** |

---

## 数据流

```
getWorkspaceGitStatus / listWorkspaceGitBranches
        ↓
 ComposeHubDataSource (Overlay IPC | Capture client)
        ↓
 GitHub Satellite HUD ──► GithubBranchLocator ──► hub.repo (bind)
        │
        └── Workbench only ──► setGithubGraphOpen
                                    ↓
                           GithubGraphOverlay (GraphOverlayFrame)
                                    ↓
              checkout / createBranch / listPRs(gh) / worktrees
                                    ↓
                           hub.repo (+ optional pr / worktree / nodeId)
                                    ↓
                     formatPinComposerHubLines → agent prompt
```

---

## 明确不做（本轮）

- Overlay / Spatial Captures 内嵌完整 GitHub Graph
- References Repo 上的 checkout / PR
- 全仓 commit DAG / Network Graph 作主 UI
- Agent 无确认 `git push` / 删分支
- force push / hard reset / clean
- Push / Pull / Commit IPC（推迟）

---

## 验收

1. 用户能从文案与动作区分 References Repo 与 GitHub 卫星。  
2. Workbench GitHub Graph 开闭 / shield 与 Sessions、Loops 一致。  
3. Graph 主视图是分区树；Capture / Overlay 只有定位器。  
4. 选中节点更新 `hub.repo`；`kind: github` 参考不改变工作区 checkout。  
5. Dirty 时 checkout 失败并提示；PR 有 `gh` 或 compare URL 回退。
