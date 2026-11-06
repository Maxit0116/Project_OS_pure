import { describe, expect, it } from "vitest";
import type { HierarchyDelegationPlan } from "../../contracts/hierarchy-delegation.js";
import {
  interfaceContractsForHierarchyChild,
  mergeInterfaceContracts,
  normalizeHierarchyDelegationPlan,
} from "./hierarchy-plan-adapter.js";

const plan: HierarchyDelegationPlan = {
  version: "0.2.0",
  planId: "plan_global",
  projectId: "project_1",
  parentRunId: "run_global",
  parentScope: { kind: "global" },
  contextHash: "sha256:context",
  objective: "Implement receipts",
  rationale: "The API and billing UI both change",
  tasks: [{
    taskId: "task_billing",
    targetKind: "planner",
    nodeId: "container_billing",
    level: "container",
    objective: "Coordinate billing changes",
    acceptanceCriteria: ["The billing flow remains coherent"],
  }],
};

describe("hierarchy plan adapter", () => {
  it("normalizes existing graph delegation without inventing dependencies or contracts", () => {
    expect(normalizeHierarchyDelegationPlan(plan)).toEqual({
      taskId: "run_global",
      objective: "Implement receipts",
      tasks: [{
        taskId: "plan_global:task_billing",
        scope: { kind: "container", nodeId: "container_billing" },
        role: "planner",
        objective: "Coordinate billing changes",
        dependencyTaskIds: [],
        acceptanceCriteria: ["The billing flow remains coherent"],
        interfaceContractIds: [],
      }],
      contracts: [],
    });
  });

  it("preserves an ancestor contract while adding only the child's own plan contracts", () => {
    const ancestorContract = {
      contractId: "root-plan:receipt",
      producerTaskId: "root-plan:task_api",
      consumerTaskIds: ["root-plan:task_ui"],
      identity: { kind: "endpoint" as const, name: "POST /api/receipts" },
      behavior: "Creates a receipt",
      failureSemantics: "Duplicate payment ids return the original receipt",
      acceptanceExamples: [{ input: "payment_1", expected: "receipt_1" }],
    };
    const nestedContract = {
      ...ancestorContract,
      contractId: "nested-plan:receipt_module",
      producerTaskId: "nested-plan:module",
      consumerTaskIds: ["nested-plan:page"],
      identity: { kind: "symbol" as const, name: "createReceipt" },
    };
    const nestedPlan = {
      taskId: "root-plan:task_api",
      objective: "Implement the API subtree",
      tasks: [{
        taskId: "nested-plan:module",
        scope: { kind: "leaf-file" as const, nodeId: "component_api", filePath: "app/api/receipts/route.ts" },
        role: "leaf" as const,
        objective: "Create receipts",
        dependencyTaskIds: [],
        acceptanceCriteria: ["The endpoint returns a receipt"],
        interfaceContractIds: [nestedContract.contractId],
      }, {
        taskId: "nested-plan:page",
        scope: { kind: "leaf-file" as const, nodeId: "component_api", filePath: "app/api/receipts/page.tsx" },
        role: "leaf" as const,
        objective: "Render receipts",
        dependencyTaskIds: ["nested-plan:module"],
        acceptanceCriteria: ["The page shows the receipt id"],
        interfaceContractIds: [nestedContract.contractId],
      }],
      contracts: [nestedContract],
    };

    expect(interfaceContractsForHierarchyChild(
      "nested-plan:module",
      [ancestorContract],
      nestedPlan,
    )).toEqual([ancestorContract, nestedContract]);
    expect(mergeInterfaceContracts([ancestorContract], [ancestorContract])).toEqual([ancestorContract]);
    expect(() => mergeInterfaceContracts([ancestorContract], [{
      ...ancestorContract,
      behavior: "Changed contract",
    }])).toThrow(/changed within one task tree/u);
  });
});
