# Diagram Graph Dev Plan

**Status**: MVP + Notebook（2026-11-05）+ **UI Wireframe Pack 扩展口径锁定（2026-11-06 docs reset）**.  
**Product name**: Diagram Graph  
**One-liner**: On-demand reference diagrams **and** UI wireframe packs (not C4 source of truth) — prompt in overlay or Chat → draw via [diagram-design](https://github.com/cathrynlavery/diagram-design) **or** wireframe pack pipeline → present in shared `GraphOverlayFrame` iframe.  
**Upstream**: https://github.com/cathrynlavery/diagram-design  
**Related**:
- [`Ask-First-Principles-Mode-Dev-Plan.md`](./Ask-First-Principles-Mode-Dev-Plan.md) — Ask · 立论在 L4（可选结构草图）调用本 Graph；Chat 双写仍守 D4。
- [`UI-Wireframe-Pack-Dev-Plan.md`](./UI-Wireframe-Pack-Dev-Plan.md) — **线稿套装权威扩展计划**；宿主表面 = 本 Graph（`ui-wireframe`），**不是** Design Tab，**不是**独立 Stage Rail。

## Locked decisions

| # | Decision | Lock | Since |
|---|----------|------|-------|
| D1 | Name | **Diagram Graph** | 2026-11-05 |
| D2 | MVP render | **HTML/SVG sandboxed iframe** (`srcDoc`). Interactive nodes only after MVP acceptance + explicit go-ahead | 2026-11-05 |
| D3 | vs Function Map | Descriptive / non-C4 types → Diagram Graph；current code structure → Function Map；ambiguous → one clarifying question | 2026-11-05 |
| D4 | Chat dual-write | Short **DiagramSummaryCard**（线稿可共用或轻扩展字段）in Chat + open **same** center overlay | 2026-11-05 |
| D5 | Brand / skill | **Full diagram-design** pack + first-run style-guide gate；Project OS tech profile default custom | 2026-11-05 |
| D6 | Notebook Area | Multi-block notes bound to `diagramId` / pack screen notes；right Stage Manager rail = hover + pin | 2026-11-05 |
| D7 | UI Wireframe family | Visual type **`ui-wireframe`**（Screen Pack）是本 Graph 的一等类型族；Freeze / Implement / Gap 见 Wireframe Dev Plan；**禁止**把架构 HTML 当 UI 验收真源 | **2026-11-06** |
| D8 | No Design Tab | Design Tab / Sketch canvas 为废案；线稿不依赖、不导入、不规划 Design Tab | **2026-11-06** |
| D9 | Single Stage entry | Stage Rail **仅** Diagram Graph 图标承载线稿；不另增线稿图标 | **2026-11-06** |

## Non-goals (MVP + wireframe extension)

- Executable Loop edits（线稿 Implement 可 handoff Agent；完整 Loop 节点自动写入另议）
- Replacing Function Map
- Self-built 45-type React layout engine
- Mermaid as primary renderer
- Auto-restore overlay on boot
- **Design Tab** as host or dependency
- Independent Wireframe Stage Rail / parallel product shell（待折叠进本 overlay）

## Architecture

```text
Stage Rail → DiagramGraphOverlay (GraphOverlayFrame)
  ├─ DiagramGraphRail (left; folders/DnD — includes ui-wireframe packs)
  ├─ iframe stage + DiagramGoalComposer
  │     typeHint: auto | architecture | sequence | flowchart | data-flow | state | ui-wireframe
  └─ DiagramNotebookRail (right; notes / pack annotations / gaps)
Chat → generateDiagram | generateWireframePack → Summary Card → same overlay
ensureDiagramDesignSkillPack → .projectos/skills/community.diagram-design/
architecture artifacts → .projectos/diagrams/<id>.html + notes + index.json
wireframe packs → .projectos/wireframes/<packId>/…  (see Wireframe Dev Plan)
rail layout → localStorage projectos_diagram_graph_rail_<projectId>
```

**Skill pack**: install full upstream `skills/diagram-design/**` via GitHub tarball / vendor（架构类）。线稿 brief **独立**，避免污染 architecture 提示词；共享 iframe 沙箱呈现。

## Milestones

| ID | Scope | Status |
|----|--------|--------|
| DG-0…DG-6 | Overlay / skill / generate / persist / Chat / notebook | Done（2026-11-05） |
| DG-WF-0 | Docs：线稿收敛进本 Graph；清除 Design Tab 废案规划 | Done |
| DG-WF-1…5 | `ui-wireframe` 类型、Pack 生成/冻结/Gap/Accept、折叠独立线稿壳 | Done — 见 [`UI-Wireframe-Pack-Dev-Plan.md`](./UI-Wireframe-Pack-Dev-Plan.md) |

## Key paths

- Contracts: `projectos/contracts/diagram-graph.ts`（+ wireframe type hint）
- Wireframe contracts/services: `projectos/contracts/ui-wireframe-pack.ts`、`services/ui-wireframe-pack/*`
- UI: `projectos/workbench/src/components/DiagramGraph/*`（线稿 UI 落此，不新建平行 Graph 产品）
- Store: `projectos/workbench/src/state/diagramGraphStore.ts`（Pack 状态可组合或由 Diagram 编排调用）
- Overlay slot: `projectos/workbench/src/state/chatSessionStore.ts` → `diagram`

## MVP acceptance checklist（架构图基线）

1. Stage Rail Diagram Graph icon toggles center overlay (peer of Session/Loop)
2. Overlay uses GraphOverlayFrame; bottom prompt fills sandboxed iframe
3. Full skill tree under `.projectos/skills/community.diagram-design/` after ensure
4. First-run style gate works; Project OS tech profile available
5. Artifacts under `.projectos/diagrams/`; reopen + history switch work
6. Chat diagram request opens same overlay + summary card
7. Structure-only asks prefer Function Map
8. Overlay mutual exclusion; no boot auto-restore
9. Interactive editing not shipped in MVP

## Wireframe extension acceptance（实现时）

见 [`UI-Wireframe-Pack-Dev-Plan.md`](./UI-Wireframe-Pack-Dev-Plan.md) §8 — 核心：只经 Diagram Graph 完成线稿闭环；无 Design Tab；无第二 Stage 图标。
