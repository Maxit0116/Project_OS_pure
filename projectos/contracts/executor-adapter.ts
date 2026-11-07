import { z } from "zod";

import { AgentRunScopeSchema } from "./agent-run.js";
import { GeneratedDiffSchema } from "./diff.js";

export const ExecutorModeSchema = z.enum(["ask", "plan", "change", "debug"]);
export const ExecutorRoleSchema = z.enum(["global", "planner", "leaf"]);
export const ExecutorUsagePrecisionSchema = z.enum(["reported", "estimated", "unavailable"]);

export const ExecutorCapabilitiesSchema = z.object({
  modes: z.array(ExecutorModeSchema),
  roles: z.array(ExecutorRoleSchema),
  structuredPlans: z.boolean(),
  proposalExport: z.boolean(),
  mediatedTools: z.boolean(),
  cancellation: z.boolean(),
  nativeResume: z.boolean(),
  usage: ExecutorUsagePrecisionSchema,
  thinkingDepths: z.array(z.enum(["off", "low", "medium", "high"])),
}).strict();

export const ExecutorInterfaceContractSchema = z.object({
  contractId: z.string().min(1),
  producerTaskId: z.string().min(1),
  consumerTaskIds: z.array(z.string().min(1)).min(1),
  identity: z.object({
    kind: z.enum(["symbol", "endpoint", "message"]),
    name: z.string().trim().min(1),
  }).strict(),
  behavior: z.string().trim().min(1),
  units: z.string().trim().min(1).optional(),
  failureSemantics: z.string().trim().min(1),
  acceptanceExamples: z.array(z.object({
    input: z.string(),
    expected: z.string(),
  }).strict()).min(1),
}).strict();

export const ExecutorTaskSchema = z.object({
  taskId: z.string().min(1),
  runId: z.string().min(1),
  parentTaskId: z.string().min(1).optional(),
  rootRunId: z.string().min(1),
  projectId: z.string().min(1),
  executorBindingId: z.string().min(1),
  scope: AgentRunScopeSchema,
  mode: ExecutorModeSchema,
  role: ExecutorRoleSchema,
  objective: z.string().trim().min(1),
  dependencyTaskIds: z.array(z.string().min(1)),
  acceptanceCriteria: z.array(z.string().trim().min(1)),
  interfaceContractIds: z.array(z.string().min(1)),
  interfaceContracts: z.array(ExecutorInterfaceContractSchema),
  contextBundleHash: z.string().min(1),
  allowedReadPaths: z.array(z.string()),
  allowedWritePaths: z.array(z.string()),
}).strict().superRefine((task, ctx) => {
  if (new Set(task.dependencyTaskIds).size !== task.dependencyTaskIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dependencyTaskIds"], message: "Dependency ids must be unique" });
  }
  if (new Set(task.interfaceContractIds).size !== task.interfaceContractIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["interfaceContractIds"], message: "Contract ids must be unique" });
  }
  const bodyIds = task.interfaceContracts.map((contract) => contract.contractId);
  if (new Set(bodyIds).size !== bodyIds.length ||
    task.interfaceContractIds.some((contractId) => !bodyIds.includes(contractId))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["interfaceContracts"], message: "Task contract references must have one matching contract body" });
  }
  for (const contractId of task.interfaceContractIds) {
    const contract = task.interfaceContracts.find((candidate) => candidate.contractId === contractId);
    if (contract && contract.producerTaskId !== task.taskId && !contract.consumerTaskIds.includes(task.taskId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["interfaceContractIds"], message: `Task '${task.taskId}' is not a participant in '${contractId}'` });
    }
  }
});

export const ExecutorPlannedTaskSchema = z.object({
  taskId: z.string().min(1),
  scope: AgentRunScopeSchema,
  role: ExecutorRoleSchema,
  objective: z.string().trim().min(1).max(500),
  dependencyTaskIds: z.array(z.string().min(1)),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(300)).min(1),
  interfaceContractIds: z.array(z.string().min(1)),
}).strict();

export const ExecutorDelegationPlanSchema = z.object({
  taskId: z.string().min(1),
  objective: z.string().trim().min(1).max(500),
  tasks: z.array(ExecutorPlannedTaskSchema).min(1),
  contracts: z.array(ExecutorInterfaceContractSchema),
}).strict().superRefine((plan, ctx) => {
  const taskIds = new Set(plan.tasks.map((task) => task.taskId));
  if (taskIds.size !== plan.tasks.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tasks"], message: "Delegated task ids must be unique" });
  }
  for (const [index, task] of plan.tasks.entries()) {
    if (new Set(task.dependencyTaskIds).size !== task.dependencyTaskIds.length ||
      new Set(task.interfaceContractIds).size !== task.interfaceContractIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tasks", index], message: "Dependency and contract references must be unique" });
    }
    for (const dependencyId of task.dependencyTaskIds) {
      if (dependencyId === task.taskId || !taskIds.has(dependencyId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tasks", index, "dependencyTaskIds"], message: `Unknown or self dependency '${dependencyId}'` });
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const taskById = new Map(plan.tasks.map((task) => [task.taskId, task]));
  const hasCycle = (taskId: string): boolean => {
    if (visiting.has(taskId)) return true;
    if (visited.has(taskId)) return false;
    visiting.add(taskId);
    for (const dependencyId of taskById.get(taskId)?.dependencyTaskIds ?? []) {
      if (taskById.has(dependencyId) && hasCycle(dependencyId)) return true;
    }
    visiting.delete(taskId);
    visited.add(taskId);
    return false;
  };
  if (plan.tasks.some((task) => hasCycle(task.taskId))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tasks"], message: "Delegated task dependencies must be acyclic" });
  }

  const contractIds = new Set<string>();
  const taskContracts = new Map(plan.tasks.map((task) => [task.taskId, new Set(task.interfaceContractIds)]));
  for (const [index, contract] of plan.contracts.entries()) {
    if (contractIds.has(contract.contractId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["contracts", index, "contractId"], message: "Contract ids must be unique" });
    }
    contractIds.add(contract.contractId);
    const participants = [contract.producerTaskId, ...contract.consumerTaskIds];
    if (participants.some((taskId) => !taskIds.has(taskId)) ||
      new Set(contract.consumerTaskIds).size !== contract.consumerTaskIds.length ||
      contract.consumerTaskIds.includes(contract.producerTaskId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["contracts", index], message: "Contract participants must be unique delegated tasks" });
    }
    for (const taskId of participants) {
      if (!taskContracts.get(taskId)?.has(contract.contractId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["contracts", index], message: `Task '${taskId}' must reference contract '${contract.contractId}'` });
      }
    }
    const referencingTaskIds = plan.tasks
      .filter((task) => task.interfaceContractIds.includes(contract.contractId))
      .map((task) => task.taskId);
    if (new Set([...participants, ...referencingTaskIds]).size !== participants.length ||
      referencingTaskIds.length !== participants.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["contracts", index], message: "Only the declared producer and consumers may reference this contract" });
    }
  }
  for (const [index, task] of plan.tasks.entries()) {
    for (const contractId of task.interfaceContractIds) {
      if (!contractIds.has(contractId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tasks", index, "interfaceContractIds"], message: `Unknown interface contract '${contractId}'` });
      }
    }
  }
});

export const ExecutorTaskStatusSchema = z.enum([
  "pending", "ready", "running", "waiting", "blocked", "completed", "failed", "cancelled",
]);

export const ExecutorChildReportSchema = z.object({
  taskId: z.string().min(1),
  status: ExecutorTaskStatusSchema,
  outcome: z.enum(["answer", "delegated", "proposal", "waiting", "escalated", "failed", "cancelled"]),
  producedContractIds: z.array(z.string().min(1)),
  consumedContractIds: z.array(z.string().min(1)),
  changedResources: z.array(z.object({
    path: z.string().min(1),
    operation: z.enum(["create", "modify", "delete"]),
  }).strict()),
  evidence: z.array(z.object({
    kind: z.enum(["structural", "semantic", "executed"]),
    summary: z.string().trim().min(1),
    reference: z.string().optional(),
  }).strict()),
  deviations: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
  escalations: z.array(z.string()),
}).strict();

export const ExecutorTaskTreeResultSchema = z.object({
  rootTaskId: z.string().min(1),
  outcome: z.enum(["completed", "waiting", "failed", "cancelled"]),
  rootResult: z.lazy(() => ExecutorResultSchema),
  taskStatuses: z.array(z.object({
    taskId: z.string().min(1),
    status: ExecutorTaskStatusSchema,
  }).strict()),
  reports: z.array(ExecutorChildReportSchema),
}).strict();

export const ExecutorUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
}).strict();

export const ExecutorEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task_started"), taskId: z.string(), timestamp: z.string() }).strict(),
  z.object({ type: z.literal("progress"), taskId: z.string(), message: z.string(), timestamp: z.string() }).strict(),
  z.object({ type: z.literal("decision_requested"), taskId: z.string(), decisionId: z.string(), question: z.string(), timestamp: z.string() }).strict(),
  z.object({ type: z.literal("proposal_ready"), taskId: z.string(), proposalId: z.string(), timestamp: z.string() }).strict(),
  z.object({ type: z.literal("delegation_ready"), taskId: z.string(), childTaskIds: z.array(z.string()), timestamp: z.string() }).strict(),
  z.object({ type: z.literal("escalated"), taskId: z.string(), reason: z.string(), timestamp: z.string() }).strict(),
  z.object({ type: z.literal("usage"), taskId: z.string(), usage: ExecutorUsageSchema, timestamp: z.string() }).strict(),
  z.object({ type: z.literal("task_completed"), taskId: z.string(), timestamp: z.string() }).strict(),
  z.object({ type: z.literal("task_failed"), taskId: z.string(), reason: z.string(), timestamp: z.string() }).strict(),
  z.object({ type: z.literal("task_cancelled"), taskId: z.string(), reason: z.string(), timestamp: z.string() }).strict(),
]);

export const ExecutorProposalSchema = z.object({
  proposalId: z.string().min(1),
  taskId: z.string().min(1),
  diff: GeneratedDiffSchema,
}).strict();

export const ExecutorResultSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("completed"), taskId: z.string(), proposal: ExecutorProposalSchema.optional() }).strict(),
  z.object({ outcome: z.literal("answer"), taskId: z.string(), answer: z.string().trim().min(1), evidence: z.array(z.string()) }).strict(),
  z.object({ outcome: z.literal("delegation"), plan: ExecutorDelegationPlanSchema }).strict(),
  z.object({ outcome: z.literal("escalated"), taskId: z.string(), reason: z.string().trim().min(1), requestedEffects: z.array(z.string()) }).strict(),
  z.object({ outcome: z.literal("waiting"), taskId: z.string(), decisionId: z.string() }).strict(),
  z.object({ outcome: z.literal("failed"), taskId: z.string(), reason: z.string() }).strict(),
  z.object({ outcome: z.literal("cancelled"), taskId: z.string(), reason: z.string() }).strict(),
]);

export type ExecutorMode = z.infer<typeof ExecutorModeSchema>;
export type ExecutorRole = z.infer<typeof ExecutorRoleSchema>;
export type ExecutorCapabilities = z.infer<typeof ExecutorCapabilitiesSchema>;
export type ExecutorTask = z.infer<typeof ExecutorTaskSchema>;
export type ExecutorPlannedTask = z.infer<typeof ExecutorPlannedTaskSchema>;
export type ExecutorInterfaceContract = z.infer<typeof ExecutorInterfaceContractSchema>;
export type ExecutorDelegationPlan = z.infer<typeof ExecutorDelegationPlanSchema>;
export type ExecutorTaskStatus = z.infer<typeof ExecutorTaskStatusSchema>;
export type ExecutorChildReport = z.infer<typeof ExecutorChildReportSchema>;
export type ExecutorTaskTreeResult = z.infer<typeof ExecutorTaskTreeResultSchema>;
export type ExecutorUsage = z.infer<typeof ExecutorUsageSchema>;
export type ExecutorEvent = z.infer<typeof ExecutorEventSchema>;
export type ExecutorProposal = z.infer<typeof ExecutorProposalSchema>;
export type ExecutorResult = z.infer<typeof ExecutorResultSchema>;
