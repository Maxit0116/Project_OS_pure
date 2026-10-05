import { z } from "zod";

import { DelegationPlanTaskSchema } from "./delegation-plan.js";

const ParentScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("global") }).strict(),
  z.object({
    kind: z.enum(["context", "container", "component"]),
    nodeId: z.string().min(1),
  }).strict(),
]);

export const NodeDeletionImpactSchema = z.object({
  targetPath: z.string().min(1),
  ownerNodeIds: z.array(z.string().min(1)).min(1),
  directImporters: z.array(z.string().min(1)).max(7),
  reverseTransitiveClosure: z.array(z.string().min(1)).max(128),
}).strict();

export const NodeDeletionPlanSchema = z.object({
  version: z.literal("0.1.0"),
  planId: z.string().min(1),
  projectId: z.string().min(1),
  parentRunId: z.string().min(1),
  parentScope: ParentScopeSchema,
  contextHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  baseGraphHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  objective: z.string().trim().min(1).max(500),
  rootNodeId: z.string().min(1),
  mode: z.enum(["leaf", "recursive"]),
  declaredNodeIds: z.array(z.string().min(1)).min(1).max(32),
  nodeIds: z.array(z.string().min(1)).min(1).max(32),
  ownedFilePaths: z.array(z.string().min(1)).max(32),
  impacts: z.array(NodeDeletionImpactSchema).max(32),
  tasks: z.array(DelegationPlanTaskSchema).max(32),
  rationale: z.string().trim().min(1).max(500),
}).strict().superRefine((plan, ctx) => {
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (
    !unique(plan.declaredNodeIds) ||
    !unique(plan.nodeIds) ||
    !unique(plan.ownedFilePaths) ||
    !unique(plan.impacts.map((impact) => impact.targetPath)) ||
    !unique(plan.tasks.map((task) => task.taskId)) ||
    !unique(plan.tasks.map((task) => task.filePath))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["nodeIds"],
      message: "Node deletion membership, files, impacts, and tasks must be unique",
    });
  }
  if (
    plan.nodeIds[0] !== plan.rootNodeId ||
    !plan.declaredNodeIds.includes(plan.rootNodeId) ||
    plan.mode === "leaf" && (plan.nodeIds.length !== 1 || plan.declaredNodeIds.length !== 1)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rootNodeId"],
      message: "Node deletion root and explicit mode do not match membership",
    });
  }
  if (
    plan.impacts.length !== plan.ownedFilePaths.length ||
    plan.impacts.some((impact, index) => impact.targetPath !== plan.ownedFilePaths[index])
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["impacts"],
      message: "Every server-derived owned file requires one ordered impact snapshot",
    });
  }
  const deletePaths = plan.tasks
    .filter((task) => task.operation === "delete")
    .map((task) => task.filePath);
  if (
    deletePaths.length !== plan.ownedFilePaths.length ||
    deletePaths.some((path, index) => path !== plan.ownedFilePaths[index]) ||
    plan.tasks.some((task) => task.operation === "create")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tasks"],
      message: "Node deletion tasks must contain every owned-file delete exactly once",
    });
  }
});

export type NodeDeletionPlan = z.infer<typeof NodeDeletionPlanSchema>;
