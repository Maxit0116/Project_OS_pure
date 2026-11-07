import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createMockSampleWorkspace,
  MockProjectOSApiClient,
} from "../client/mock-project-os-api-client.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("ProjectOSLocalApi durable run state", () => {
  it("lists and resolves canonical decisions and reloads checkpoints", async () => {
    const root = mkdtempSync(join(tmpdir(), "local-api-run-state-"));
    roots.push(root);
    const projectOSRoot = join(root, ".projectos");
    mkdirSync(projectOSRoot);
    const workspace = createMockSampleWorkspace();
    workspace.workspaceRoot = root;
    workspace.projectOSRoot = projectOSRoot;
    const api = new MockProjectOSApiClient({ workspace });
    const project = await api.openSampleWorkspace();
    api.recordRunDecision({
      version: "0.1.0",
      id: "decision_1",
      projectId: project.projectId,
      rootRunId: "run_1",
      runId: "run_1",
      kind: "budget",
      question: "Continue with a larger budget?",
      options: [{ id: "continue", label: "Continue" }, { id: "stop", label: "Stop" }],
      status: "pending",
      revision: 1,
      createdAt: new Date().toISOString(),
    });
    api.recordRunCheckpoint({
      version: "0.1.0",
      id: "checkpoint_1",
      projectId: project.projectId,
      rootRunId: "run_1",
      taskIds: ["task_1"],
      completedTaskIds: [],
      executorSelections: {},
      pendingDecisionIds: ["decision_1"],
      budgetUsage: {
        activeTimeMs: 0,
        inputTokens: 0,
        outputTokens: 0,
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
    });

    await expect(api.listRunDecisions(project.projectId, "run_1")).resolves.toHaveLength(1);
    await expect(api.resolveRunDecision(
      project.projectId,
      "decision_1",
      1,
      { optionId: "continue" },
    )).resolves.toMatchObject({ status: "resolved", revision: 2 });
    await expect(api.getRunCheckpoint(project.projectId, "checkpoint_1")).resolves.toMatchObject({
      rootRunId: "run_1",
      publication: "not_applied",
    });
  });
});
