import { describe, expect, it } from "vitest";
import type { ExecutorDelegationPlan, ExecutorTask } from "../../contracts/executor-adapter.js";
import type { GeneratedDiff } from "../../contracts/diff.js";
import { createScopedHarnessHost, type HarnessHost } from "./executor-adapter.js";
import { FakeExecutorAdapter } from "./fake-executor.js";
import { ExecutorRegistry } from "./executor-registry.js";

const task: ExecutorTask = {
  taskId: "task_1",
  runId: "run_1",
  rootRunId: "run_1",
  projectId: "project_1",
  executorBindingId: "model:test-profile:v1",
  scope: { kind: "leaf-file", nodeId: "feat_login", filePath: "app/login/page.tsx" },
  mode: "change",
  role: "leaf",
  objective: "Update the login heading",
  dependencyTaskIds: [],
  acceptanceCriteria: ["The heading is updated"],
  interfaceContractIds: [],
  interfaceContracts: [],
  contextBundleHash: "sha256:context",
  allowedReadPaths: ["app/login/page.tsx"],
  allowedWritePaths: ["app/login/page.tsx"],
};

const proposal: GeneratedDiff = {
  runId: "run_1",
  summary: "Update heading",
  files: [{ path: "app/login/page.tsx", changeType: "modify", before: "old", after: "new" }],
};

function createHost(overrides: Partial<HarnessHost> = {}): HarnessHost {
  return {
    async inspectNode() { throw new Error("not used"); },
    async listChildren() { return { nodeIds: [], totalCount: 0 }; },
    async readSource() { throw new Error("not used"); },
    async consultNode() { throw new Error("not used"); },
    async delegate() { return []; },
    async submitProposal() { return { accepted: true }; },
    async requestDecision() { return { decisionId: "decision_unused" }; },
    ...overrides,
  };
}

describe("executor adapter contract", () => {
  it("rejects reads and proposals outside the task's server-issued path capabilities", async () => {
    let reads = 0;
    let submissions = 0;
    const host = createScopedHarnessHost(task, {
      async inspectNode() { throw new Error("not used"); },
      async listChildren() { return { nodeIds: [], totalCount: 0 }; },
      async readSource(_task, path) {
        reads += 1;
        return { path, sha256: "sha256:source", content: "source" };
      },
      async consultNode() { throw new Error("not used"); },
      async delegate() { return []; },
      async submitProposal() {
        submissions += 1;
        return { accepted: true };
      },
      async requestDecision() { return { decisionId: "unused" }; },
    });

    await expect(host.readSource({ taskId: task.taskId, path: "app/admin/page.tsx" }))
      .rejects.toThrow(/cannot read/u);
    await expect(host.submitProposal({
      proposalId: "proposal_outside_scope",
      taskId: task.taskId,
      diff: { ...proposal, files: [{ ...proposal.files[0]!, path: "app/admin/page.tsx" }] },
    })).rejects.toThrow(/cannot propose/u);
    expect(reads).toBe(0);
    expect(submissions).toBe(0);
  });

  it("validates a delegation plan before calling the server materializer", async () => {
    let materializeCalls = 0;
    const host = createScopedHarnessHost(task, {
      async inspectNode() { throw new Error("not used"); },
      async listChildren() { return { nodeIds: [], totalCount: 0 }; },
      async readSource(_task, path) { return { path, sha256: "sha256:source", content: "source" }; },
      async consultNode() { throw new Error("not used"); },
      async delegate() { materializeCalls += 1; return []; },
      async submitProposal() { return { accepted: true }; },
      async requestDecision() { return { decisionId: "unused" }; },
    });
    const cyclicPlan = {
      taskId: task.taskId,
      objective: "Invalid cycle",
      tasks: [{
        taskId: "child_a",
        scope: task.scope,
        role: "leaf",
        objective: "A",
        dependencyTaskIds: ["child_b"],
        acceptanceCriteria: ["A completes"],
        interfaceContractIds: [],
      }, {
        taskId: "child_b",
        scope: task.scope,
        role: "leaf",
        objective: "B",
        dependencyTaskIds: ["child_a"],
        acceptanceCriteria: ["B completes"],
        interfaceContractIds: [],
      }],
      contracts: [],
    } as ExecutorDelegationPlan;

    await expect(host.delegate(cyclicPlan)).rejects.toThrow(/acyclic/u);
    expect(materializeCalls).toBe(0);
  });

  it("requires server-materialized children to inherit the parent executor binding", async () => {
    const plan: ExecutorDelegationPlan = {
      taskId: task.taskId,
      objective: "Split the login change",
      tasks: [{
        taskId: "child_login",
        scope: task.scope,
        role: "leaf",
        objective: "Update the login heading",
        dependencyTaskIds: [],
        acceptanceCriteria: ["The heading is updated"],
        interfaceContractIds: [],
      }],
      contracts: [],
    };
    const host = createScopedHarnessHost(task, {
      async inspectNode() { throw new Error("not used"); },
      async listChildren() { return { nodeIds: [], totalCount: 0 }; },
      async readSource(_task, path) { return { path, sha256: "sha256:source", content: "source" }; },
      async consultNode() { throw new Error("not used"); },
      async delegate(parent, proposed) {
        return [{
          taskId: "child_login",
          runId: "run_child",
          parentTaskId: parent.taskId,
          rootRunId: parent.rootRunId,
          projectId: parent.projectId,
          executorBindingId: "model:different-profile:v1",
          scope: proposed.tasks[0]!.scope,
          mode: parent.mode,
          role: "leaf",
          objective: "Update the login heading",
          dependencyTaskIds: [],
          acceptanceCriteria: ["The heading is updated"],
          interfaceContractIds: [],
          interfaceContracts: [],
          contextBundleHash: "sha256:child",
          allowedReadPaths: ["app/login/page.tsx"],
          allowedWritePaths: ["app/login/page.tsx"],
        }];
      },
      async submitProposal() { return { accepted: true }; },
      async requestDecision() { return { decisionId: "unused" }; },
    });

    await expect(host.delegate(plan)).rejects.toThrow(/changed or failed to authorize/u);
  });

  it("normalizes a fake proposal and keeps publication behind the host", async () => {
    const submitted: unknown[] = [];
    const adapter = new FakeExecutorAdapter({ proposal: { proposalId: "proposal_1", taskId: task.taskId, diff: proposal } });
    const handle = await adapter.start(task, createHost({
      async submitProposal(value) {
        submitted.push(value);
        return { accepted: true };
      },
    }));
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
    const handle = await adapter.start(task, createHost({
      async submitProposal() { return { accepted: false, reason: "scope denied" }; },
    }));
    await expect(handle.result).resolves.toMatchObject({ outcome: "failed", reason: "scope denied" });
  });

  it("normalizes a decision request as waiting instead of pretending completion", async () => {
    const adapter = new FakeExecutorAdapter({ decisionQuestion: "Should the receipt include tax?" });
    const handle = await adapter.start(task, createHost({
      async requestDecision(input) {
        expect(input.question).toContain("tax");
        return { decisionId: "decision_1" };
      },
    }));
    await expect(handle.result).resolves.toEqual({
      outcome: "waiting",
      taskId: task.taskId,
      decisionId: "decision_1",
    });
  });

  it("reports cancellation when an in-flight staged proposal is accepted afterward", async () => {
    let finishSubmission!: (result: { accepted: boolean }) => void;
    const adapter = new FakeExecutorAdapter({ proposal: { proposalId: "proposal_1", taskId: task.taskId, diff: proposal } });
    const handle = await adapter.start(task, createHost({
      submitProposal: () => new Promise((resolve) => { finishSubmission = resolve; }),
    }));
    await Promise.resolve();
    await handle.cancel("user stopped task");
    finishSubmission({ accepted: true });

    await expect(handle.result).resolves.toEqual({
      outcome: "cancelled",
      taskId: task.taskId,
      reason: "user stopped task",
    });
    const events: string[] = [];
    for await (const event of handle.events) events.push(event.type);
    expect(events).toContain("task_cancelled");
    expect(events).not.toContain("task_completed");
  });

  it("settles decision and proposal waits when the host never resolves", async () => {
    const waitingForDecision = await new FakeExecutorAdapter({ decisionQuestion: "Confirm the recipient?" })
      .start(task, createHost({ requestDecision: () => new Promise(() => {}) }));
    await waitingForDecision.cancel("stop waiting");
    await expect(waitingForDecision.result).resolves.toMatchObject({
      outcome: "cancelled",
      reason: "stop waiting",
    });

    const waitingForProposal = await new FakeExecutorAdapter({
      proposal: { proposalId: "proposal_1", taskId: task.taskId, diff: proposal },
    }).start(task, createHost({ submitProposal: () => new Promise(() => {}) }));
    await waitingForProposal.cancel("stop proposal");
    await expect(waitingForProposal.result).resolves.toMatchObject({
      outcome: "cancelled",
      reason: "stop proposal",
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
