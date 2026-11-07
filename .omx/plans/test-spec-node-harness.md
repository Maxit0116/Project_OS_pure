# Test Specification: Node Harness and Adaptable Executors

**Source:** `build_plan.md` and `prd-node-harness.md`  
**Status:** Required Ralph gate; implementation begins with B1.

## Contract tests

- Executor selection discriminants reject extra/missing fields.
- Explicit model profile resolution beats fallback defaults.
- Runtime profiles remain explicit and unavailable runtimes fail closed.
- Run executor metadata excludes credentials and endpoint secrets.
- Older AgentRun/settings documents load without fabricated executor identity.

## B1 regression tests

- Composer sends the selected model as `executorSelection` on Ask, Plan, Change, and Debug requests.
- Fixture/presentation mode sends no live executor selection.
- Failed selection persistence leaves the previous model selected and clears pending state.
- Refinement followed by changed settings still confirms with its original model and thinking depth.
- Child runs inherit the parent binding after profiles/defaults change.
- Plan clarification/build and Debug analysis/fix retain the initiating binding.
- Focused model picker search matches label, provider, and model id; empty search and no results are correct.

## Adapter tests

- Built-in and fake executors emit normalized task lifecycle events.
- Fake decision, cancellation, usage, and invalid proposal paths are handled.
- Every proposal still passes server scope and transaction checks.

## Durable state tests

- Decisions resolve once under repeated requests and reject stale revisions.
- Shared budget reservations prevent over-dispatch.
- Waiting/budget checkpoints reload after restart.
- Applied transaction receipts block duplicate publication.

## Integration tests

- Contract-first producer/consumer flow detects dollars/cents and error-shape mismatches.
- Combined proposal analysis includes newly created files.
- Repair remains within approved intent and budget.
- Source plus graph transaction undo restores both.

## UI/desktop tests

- Picker keyboard and focus behavior.
- Waiting badge, decision list, answer history, and notification deep links.
- Intent approval and scope widening.
- Desktop restart, verification evidence, and undo.

## End-to-end scenarios

E1 single-file, E2 multi-file, E3 component bridge, E4 cross-service, E5 add/delete, E6 ambiguous request, E7 widening, E8 budget exhaustion, E9 interruption, E10 large/standalone graph, E11 missing capability, E12 stale/duplicate decision.

## Commands

```sh
cd projectos
npm run test:unit
npm run test:agent-flow
npm run typecheck
npm run build
cd workbench && npm run typecheck && npm run build
cd ../desktop && npm run typecheck && npm run build
```

Known baseline failures are recorded separately and must not be hidden. Every B-slice adds focused tests before broad verification.
