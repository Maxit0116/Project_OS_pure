import { describe, expect, it } from "vitest";
import { ExecutorDelegationPlanSchema, ExecutorTaskSchema } from "./executor-adapter.js";

const plan = {
  taskId: "task_global",
  objective: "Implement receipt delivery",
  tasks: [
    {
      taskId: "task_api",
      scope: { kind: "node-plan", nodeId: "component_api" },
      role: "planner",
      objective: "Define the receipt endpoint",
      dependencyTaskIds: [],
      acceptanceCriteria: ["The endpoint returns the receipt id"],
      interfaceContractIds: ["contract_receipt"],
    },
    {
      taskId: "task_ui",
      scope: { kind: "leaf-file", nodeId: "component_ui", filePath: "app/billing/page.tsx" },
      role: "leaf",
      objective: "Show the receipt confirmation",
      dependencyTaskIds: ["task_api"],
      acceptanceCriteria: ["The confirmation uses the endpoint receipt id"],
      interfaceContractIds: ["contract_receipt"],
    },
  ],
  contracts: [{
    contractId: "contract_receipt",
    producerTaskId: "task_api",
    consumerTaskIds: ["task_ui"],
    identity: { kind: "endpoint", name: "POST /api/receipts" },
    behavior: "Creates one receipt for one successful payment",
    units: "receipt id is an opaque string",
    failureSemantics: "Duplicate payment ids return the original receipt; invalid payments return 422",
    acceptanceExamples: [{ input: "payment_123", expected: "receipt_456" }],
  }],
} as const;

describe("executor delegation contract", () => {
  it("accepts a dependency-ordered plan with one shared producer/consumer contract", () => {
    expect(ExecutorDelegationPlanSchema.parse(plan)).toEqual(plan);
  });

  it("rejects cyclic task dependencies before dispatch", () => {
    const cyclic = {
      ...plan,
      tasks: plan.tasks.map((task) => ({
        ...task,
        dependencyTaskIds: task.taskId === "task_api" ? ["task_ui"] : ["task_api"],
      })),
    };
    expect(ExecutorDelegationPlanSchema.safeParse(cyclic).success).toBe(false);
  });

  it("rejects a contract participant that did not receive the same contract", () => {
    const mismatch = {
      ...plan,
      tasks: plan.tasks.map((task) => task.taskId === "task_ui"
        ? { ...task, interfaceContractIds: [] }
        : task),
    };
    expect(ExecutorDelegationPlanSchema.safeParse(mismatch).success).toBe(false);
  });

  it("does not let a nonparticipant task claim an interface contract", () => {
    const outsider = {
      taskId: "task_other",
      runId: "run_other",
      rootRunId: "run_root",
      projectId: "project_1",
      executorBindingId: "model:test:v1",
      scope: { kind: "global" },
      mode: "change",
      role: "planner",
      objective: "Unrelated work",
      dependencyTaskIds: [],
      acceptanceCriteria: ["Complete the unrelated task"],
      interfaceContractIds: ["contract_receipt"],
      interfaceContracts: [plan.contracts[0]],
      contextBundleHash: "sha256:other",
      allowedReadPaths: [],
      allowedWritePaths: [],
    };
    expect(ExecutorTaskSchema.safeParse(outsider).success).toBe(false);
  });
});
