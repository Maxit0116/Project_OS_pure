import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RunCheckpoint, RunDecision } from "../../contracts/run-state.js";
import { DurableRunStateStore, RootBudgetLedger } from "./durable-run-state.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function decision(): RunDecision {
  return {
    version: "0.1.0",
    id: "decision_1",
    projectId: "project_1",
    rootRunId: "run_1",
    runId: "run_1",
    kind: "scope_change",
    question: "Approve the additional settings file?",
    options: [{ id: "approve", label: "Approve" }, { id: "decline", label: "Decline" }],
    status: "pending",
    revision: 1,
    createdAt: new Date().toISOString(),
  };
}

function checkpoint(): RunCheckpoint {
  return {
    version: "0.1.0",
    id: "checkpoint_1",
    projectId: "project_1",
    rootRunId: "run_1",
    taskIds: ["task_1"],
    completedTaskIds: [],
    executorSelections: { task_1: { kind: "model", modelProfileId: "model_1" } },
    pendingDecisionIds: ["decision_1"],
    budgetUsage: {
      activeTimeMs: 10,
      inputTokens: 20,
      outputTokens: 10,
      spendCents: 0,
      reservedActiveTimeMs: 0,
      reservedInputTokens: 0,
      reservedOutputTokens: 0,
      reservedSpendCents: 0,
      reservedConcurrency: 0,
    },
    publication: "not_applied",
    transactionReceiptIds: [],
    updatedAt: new Date().toISOString(),
  };
}

describe("durable run state", () => {
  it("persists decisions and rejects stale or repeated resolutions", () => {
    const root = mkdtempSync(join(tmpdir(), "run-state-")); roots.push(root);
    const store = new DurableRunStateStore(join(root, ".projectos"));
    store.saveDecision(decision());
    expect(store.loadDecision("decision_1")?.status).toBe("pending");
    expect(store.resolveDecision("decision_1", 1, { optionId: "approve" }).status).toBe("resolved");
    expect(() => store.resolveDecision("decision_1", 1, { optionId: "approve" })).toThrow(/stale|no longer/);
  });

  it("persists a checkpoint separately from publication receipts", () => {
    const root = mkdtempSync(join(tmpdir(), "run-state-")); roots.push(root);
    const store = new DurableRunStateStore(join(root, ".projectos"));
    store.saveDecision(decision());
    store.saveCheckpoint(checkpoint());
    expect(store.loadCheckpoint("checkpoint_1")).toMatchObject({ publication: "not_applied", pendingDecisionIds: ["decision_1"] });
    store.resolveDecision("decision_1", 1, { optionId: "approve" });
    expect(store.loadCheckpoint("checkpoint_1")?.pendingDecisionIds).toEqual(["decision_1"]);
    const restartedStore = new DurableRunStateStore(join(root, ".projectos"));
    expect(restartedStore.loadCheckpoint("checkpoint_1")?.pendingDecisionIds).toEqual(["decision_1"]);
    expect(restartedStore.loadDecision("decision_1")?.answer?.optionId).toBe("approve");
    expect(() => store.saveCheckpoint({ ...checkpoint(), pendingDecisionIds: ["missing"] }))
      .toThrow(/missing, resolved, or foreign pending decision/);
    expect(() => store.saveCheckpoint({ ...checkpoint(), completedTaskIds: ["unknown"] }))
      .toThrow(/Completed tasks must be unique checkpoint tasks/);
  });

  it("reserves a shared root budget and refuses over-dispatch", () => {
    const ledger = new RootBudgetLedger({ maxConcurrency: 2, maxInputTokens: 100, maxOutputTokens: 100 });
    ledger.reserve({ id: "child_1", concurrency: 1, activeTimeMs: 20, inputTokens: 50, outputTokens: 10, spendCents: 0 });
    expect(() => ledger.reserve({ id: "child_1", concurrency: 1, activeTimeMs: 20, inputTokens: 51, outputTokens: 10, spendCents: 0 })).toThrow(/different limits/);
    ledger.reserve({ id: "child_2", concurrency: 1, activeTimeMs: 20, inputTokens: 20, outputTokens: 10, spendCents: 0 });
    expect(() => ledger.reserve({ id: "child_3", concurrency: 1, activeTimeMs: 1, inputTokens: 1, outputTokens: 1, spendCents: 0 })).toThrow(/exhausted/);
    expect(() => ledger.reserve({ id: "overspend", concurrency: 0, activeTimeMs: 0, inputTokens: 31, outputTokens: 0, spendCents: 0 })).toThrow(/exhausted/);
    expect(ledger.reconcile("child_1", { activeTimeMs: 5, inputTokens: 50, outputTokens: 10, spendCents: 0 })).toMatchObject({ reservedConcurrency: 1, inputTokens: 50 });
  });
});
