import { describe, expect, it } from "vitest";
import type { ExecutorTask } from "../../contracts/executor-adapter.js";
import type { GeneratedDiff } from "../../contracts/diff.js";
import { FakeExecutorAdapter } from "./fake-executor.js";
import { ExecutorRegistry } from "./executor-registry.js";

const task: ExecutorTask = {
  taskId: "task_1",
  rootRunId: "run_1",
  projectId: "project_1",
  scope: { kind: "leaf-file", nodeId: "feat_login", filePath: "app/login/page.tsx" },
  mode: "change",
  role: "leaf",
  objective: "Update the login heading",
  acceptanceCriteria: ["The heading is updated"],
  contextBundleHash: "sha256:context",
  allowedReadPaths: ["app/login/page.tsx"],
  allowedWritePaths: ["app/login/page.tsx"],
};

const proposal: GeneratedDiff = {
  runId: "run_1",
  summary: "Update heading",
  files: [{ path: "app/login/page.tsx", changeType: "modify", before: "old", after: "new" }],
};

describe("executor adapter contract", () => {
  it("normalizes a fake proposal and keeps publication behind the host", async () => {
    const submitted: unknown[] = [];
    const adapter = new FakeExecutorAdapter({ proposal: { proposalId: "proposal_1", taskId: task.taskId, diff: proposal } });
    const handle = await adapter.start(task, {
      async submitProposal(value) {
        submitted.push(value);
        return { accepted: true };
      },
      async requestDecision() {
        return { decisionId: "decision_unused" };
      },
    });
    const result = await handle.result;
    const events: unknown[] = [];
    for await (const event of handle.events) events.push(event);
    expect(result).toMatchObject({ outcome: "completed", taskId: task.taskId });
    expect(submitted).toHaveLength(1);
    expect(events.map((event) => (event as { type: string }).type)).toEqual([
      "task_started", "progress", "proposal_ready", "task_completed",
    ]);
  });

  it("turns a host rejection into a failed result without a direct write path", async () => {
    const adapter = new FakeExecutorAdapter({ proposal: { proposalId: "proposal_1", taskId: task.taskId, diff: proposal } });
    const handle = await adapter.start(task, {
      async submitProposal() { return { accepted: false, reason: "scope denied" }; },
      async requestDecision() { return { decisionId: "decision_unused" }; },
    });
    await expect(handle.result).resolves.toMatchObject({ outcome: "failed", reason: "scope denied" });
  });

  it("normalizes a decision request as waiting instead of pretending completion", async () => {
    const adapter = new FakeExecutorAdapter({ decisionQuestion: "Should the receipt include tax?" });
    const handle = await adapter.start(task, {
      async submitProposal() { return { accepted: true }; },
      async requestDecision(input) {
        expect(input.question).toContain("tax");
        return { decisionId: "decision_1" };
      },
    });
    await expect(handle.result).resolves.toEqual({
      outcome: "waiting",
      taskId: task.taskId,
      decisionId: "decision_1",
    });
  });

  it("registers adapters and exposes their capabilities", () => {
    const registry = new ExecutorRegistry();
    registry.register(new FakeExecutorAdapter());
    expect(registry.resolve("fake")).toBeDefined();
    expect(registry.list()).toMatchObject([{ id: "fake", enabled: true, capabilities: { proposalExport: true } }]);
    expect(() => registry.register(new FakeExecutorAdapter())).toThrow(/already registered/);
  });
});
