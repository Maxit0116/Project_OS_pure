# Loops Graph — Node Duty Checklist

## Goal

Node canvas body shows **workflow assignment** (checklist), not capability prose.
Agent / Human / Action duty nodes track per-item progress; Human confirm-release
requires required items done (UI hard gate).

## Status

| Phase | Scope | Status |
|-------|--------|--------|
| P0 | Intent `dutyItems` + compile → `acceptance` + canvas/inspector | Done |
| P1 | Human HITL checklist + Confirm release | Done |
| P2 | Runtime `dutyProgress` on nodeRecords; agent complete-on-advance | Done |
| P3 | Palette seed checklists; authoring `dutyItems` patches; runtime mutate + DevPlan projection | Done |

## Contracts

- `projectos/contracts/loop-duty.ts` — item / progress / mutate helpers
- Intent node: `dutyItems[]`, `dutyEdited`
- Instance `nodeRecords[].dutyProgress[]` + runtime `dutyItems[]` overlay
- API: `patchLoopDutyProgress`, `mutateLoopDutyChecklist`
- Palette seeds derive `dutyItems` from capability prompt
- Authoring `node_patch` may set `dutyItems` (and prompt-only patches derive checklist)
- Coder entry projects DevPlan tasks onto runtime duty overlay

## UX

- Palette drop: checklist already seeded from capability prompt
- Capability-only (no items): muted hint from `prompt`
- Inspector: Duty checklist editor + optional Notes field
- Composer/Edit: NL → `dutyItems` via authoring provider
- Run HITL: interactive checklist + add task; Confirm release disabled until required done
- Agent run: DevPlan tasks appear as coder checklist; completed task auto-checks
