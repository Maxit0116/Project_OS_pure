import {
  ExecutorDelegationPlanSchema,
  type ExecutorDelegationPlan,
  type ExecutorInterfaceContract,
} from "../../contracts/executor-adapter.js";
import type { HierarchyDelegationPlan } from "../../contracts/hierarchy-delegation.js";

/**
 * Normalizes the current graph planner into the shared node-task contract.
 * Older stored plans omit dependency and interface fields; the contract schema
 * defaults those to empty, while new plans preserve server-validated values.
 */
export function normalizeHierarchyDelegationPlan(
  plan: HierarchyDelegationPlan,
): ExecutorDelegationPlan {
  const planPrefix = `${plan.planId}:`;
  const qualify = (id: string) => id.startsWith(planPrefix) ? id : `${planPrefix}${id}`;
  const taskIds = new Map(plan.tasks.map((task) => [task.taskId, qualify(task.taskId)]));
  const taskId = (id: string) => taskIds.get(id) ?? qualify(id);
  return ExecutorDelegationPlanSchema.parse({
    taskId: plan.parentRunId,
    objective: plan.objective,
    tasks: plan.tasks.map((task) => ({
      taskId: qualify(task.taskId),
      scope: task.targetKind === "planner"
        ? { kind: task.level, nodeId: task.nodeId }
        : { kind: "leaf-file", nodeId: task.nodeId, filePath: task.filePath },
      role: task.targetKind === "planner" ? "planner" : "leaf",
      objective: task.objective,
      dependencyTaskIds: (task.dependencyTaskIds ?? []).map(taskId),
      acceptanceCriteria: task.acceptanceCriteria,
      interfaceContractIds: (task.interfaceContractIds ?? []).map(qualify),
    })),
    contracts: (plan.contracts ?? []).map((contract) => ({
      ...contract,
      contractId: qualify(contract.contractId),
      producerTaskId: taskId(contract.producerTaskId),
      consumerTaskIds: contract.consumerTaskIds.map(taskId),
    })),
  });
}

export function mergeInterfaceContracts(
  ...groups: readonly (readonly ExecutorInterfaceContract[])[]
): ExecutorInterfaceContract[] {
  const byId = new Map<string, ExecutorInterfaceContract>();
  for (const contract of groups.flat()) {
    const existing = byId.get(contract.contractId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(contract)) {
      throw new Error(`Interface contract '${contract.contractId}' changed within one task tree`);
    }
    byId.set(contract.contractId, contract);
  }
  return [...byId.values()];
}

export function interfaceContractsForHierarchyChild(
  taskId: string,
  inheritedContracts: readonly ExecutorInterfaceContract[],
  plan: ExecutorDelegationPlan,
): ExecutorInterfaceContract[] {
  const currentContractIds = new Set(plan.contracts.map((contract) => contract.contractId));
  const inherited = inheritedContracts.filter((contract) => !currentContractIds.has(contract.contractId));
  const local = plan.contracts.filter((contract) =>
    contract.producerTaskId === taskId || contract.consumerTaskIds.includes(taskId));
  return mergeInterfaceContracts(inherited, local);
}
