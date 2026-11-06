# Agent Pool Waterfall UX v1.1 — DevPlan

**Status:** P0+P1 shipped (2026-11-05).  
**Scope:** Upgrade Agent Pool waterfall **UI/UX** toward Kobra Trace Waterfall’s name-column + shared-axis + disciplined live-motion grammar, using real `AgentRunEvent` projections.  
**Authority:** This document is the v1.1 UX upgrade plan for Agent Pool.  
**Baseline:** [`Agent-Pool-Trace-Waterfall-Dev-Plan.md`](./Agent-Pool-Trace-Waterfall-Dev-Plan.md) v1.0 (Phases 1–5 identity, projection, history, acceptance).  
**Reference:** [Kobra Trace Waterfall](https://kobra.systems/components/trace-waterfall) — REA-inspected fixture tree + `Bg(spans, now)` + accelerated clock; Project OS adapts **grammar**, not the paid component.

**Locked product principles (inherited + UX):**

1. JSONL `AgentRunEvent` logs are the source of truth.
2. Waterfall is a rebuildable projection, not a second event store.
3. Multi-lane Agent Pool remains the product surface (not a single-run marketing card).
4. Do not vendor `@kobra/trace-waterfall`; CSS Modules + `--tech-*` tokens only.
5. Do not invent duration, tokens, or cost when evidence is missing.
6. Live motion = growing bars + one playhead (+ optional KPI crossfade). No decorative infinite shimmer as primary liveness.
7. v1.1 ships **P0 + P1** only. Deferred to v1.2: column resize, history scrub/Replay, slowest-path mark, list virtualization.

---

## 1. Executive Summary

v1.0 delivered durable Pool identity, Major/Sub/Span projection, multi-expand, Span Inspector, and History/acceptance. The remaining gap versus Kobra is **visual grammar and motion discipline**:

| Gap | Fix in v1.1 |
|---|---|
| Panel used `tasks[0].originMs` | `min(task.originMs)` shared axis |
| Compact track anonymous | Short current-action label beside mini track |
| Expand short / chip-heavy | Name \| Track \| Duration Gantt + axis ticks + taller scroll |
| Motion noise (shimmer/pulses) | Growing bar + playhead only |
| Lane-count KPIs only | Per-expand Run KPI (duration, model/tool/error; tokens if reported) |
| Wait/handoff underused | Project `wait` / `handoff` spans from evidence |
| Retry hard to see | Surface attempt + failed sibling bars |

---

## 2. Kobra REA findings (adapted)

From REA browser capture + static analysis of the docs gallery bundle:

- Demo data is a nested span tree (`kind`: agent \| llm \| tool) with `start`/`end` in **seconds**, plus `error` / `retry`.
- Live feel = `now` advanced via `requestAnimationFrame` (demo uses ~2.6×) and `Bg(spans, now)` which drops unfinished `end`, prorates LLM tokens/cost.
- UI grammar: KPI strip · name column · shared axis · Collapse · Details · legend · Replay.

**Project OS mapping:** wall-clock `nowMs`; no fake Replay for live runs; tokens only when `model_request.usage === "reported"`; no cost dollars without schema evidence.

---

## 3. Target UX grammar

**L0 (collapsed lane):** short current Major/action label · mini shared-axis bars · elapsed · Done/History chrome unchanged.

**L1 (expanded lane):** Run KPI strip · time ticks · hierarchical Name \| Track \| Duration · kind legend · error icon+text · existing Span Inspector.

Panel header keeps **lane** counts (total / running / awaiting / errors) + Live badge.

---

## 4. Projection rules (additive)

### 4.1 `TraceSpanKind`

Add `handoff` alongside existing `wait`.

### 4.2 `AgentPoolRunKpi`

```ts
{
  durationMs: number
  modelCallCount: number
  toolCallCount: number
  errorCount: number
  tokensIn?: number   // only if every counted model_request has usage:"reported"
  tokensOut?: number
  // costUsd omitted in v1.1 — no reported cost field
}
```

### 4.3 Wait / handoff

- **wait:** from `run_completed` with awaiting_review (or equivalent) through optional later accept/continue bound; incomplete end while live awaiting.
- **handoff:** from `task_delegated` / `child_run_started` as point or short exact intervals with evidence event ids.
- Never invent decorative wait/handoff without events.

### 4.4 Retry

Preserve `_rN` attempt majors; expand UI shows attempt annotation and failed span status with non-color cue.

---

## 5. File-level change list

| Path | Operation |
|---|---|
| `docs/features/Agent-Pool-Waterfall-UX-Dev-Plan.md` | Create (this doc) |
| `docs/features/Agent-Pool-Trace-Waterfall-Dev-Plan.md` | Status pointer → v1.1 |
| `projectos/contracts/agent-pool-trace.ts` | `handoff` + `AgentPoolRunKpi` |
| `workbench/.../AgentPool/projectAgentPoolTrace.ts` | wait/handoff + `aggregateAgentPoolRunKpi` |
| `workbench/.../AgentPool/projectAgentPool.ts` | span kinds; attach kpi on tasks |
| `workbench/.../AgentPool/AgentPoolPanel.tsx` | `min(originMs)` |
| `workbench/.../AgentPool/AgentPoolRow.tsx` | compact short-name |
| `workbench/.../AgentPool/AgentPoolRowExpand.tsx` | KPI, ticks, legend, Gantt default |
| `workbench/.../AgentPool/AgentPoolMiniWaterfall.tsx` (+ CSS) | ticks; motion discipline; error cue |
| `workbench/src/i18n/locales/en.ts` / `zh.ts` | KPI / legend / wait / handoff strings |
| `*.test.ts` | origin, KPI honesty, wait/handoff |

---

## 6. Acceptance criteria

1. Concurrent lanes share `poolOriginMs = min(origins)`.
2. Collapsed lane shows readable current-action label with mini track.
3. Expanded lane shows Name \| Track \| Duration on tick-marked axis; scroll area ≥ ~360px.
4. Growing bar + single playhead convey liveness; infinite edge shimmer off by default.
5. Expand KPI: duration + model/tool/error counts; tokens only if usage reported.
6. Wait/handoff only when events justify them.
7. Failed spans show non-color cue; retry attempt visible.
8. No regression to Done / History / acceptance from v1.0.

---

## 7. Explicit non-goals (v1.1)

- Vendoring Kobra / Base UI Popover skin  
- Fake Replay clock for live runs  
- Cost dollars without schema evidence  
- Loops parallel scheduling  
- `.spans.json` as truth  
- Full Phase 6 load-test program  

---

## 8. Phased delivery

| Phase | Work |
|---|---|
| D0 | This DevPlan + v1.0 Status pointer |
| D1 | Contracts + projection + Panel origin + unit tests |
| D2 | L0/L1 UI grammar + motion discipline |
| D3 | KPI strip, legend, retry/error affordances, i18n |
| D4 | Validation against §6 |
