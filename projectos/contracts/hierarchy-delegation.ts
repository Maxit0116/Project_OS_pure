import { z } from "zod";

export const HierarchyPlannerLevelSchema = z.enum([
  "context",
  "container",
  "component",
]);

const HierarchyTaskBaseSchema = z.object({
  taskId: z.string().min(1),
  objective: z.string().trim().min(1).max(500),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
});

export const HierarchyPlannerTaskSchema = HierarchyTaskBaseSchema.extend({
  targetKind: z.literal("planner"),
  nodeId: z.string().min(1),
  level: HierarchyPlannerLevelSchema,
}).strict();

export const HierarchyLeafTaskSchema = HierarchyTaskBaseSchema.extend({
  targetKind: z.literal("leaf-file"),
  nodeId: z.string().min(1),
  filePath: z.string().min(1),
}).strict();

export const HierarchyDelegationTaskSchema = z.discriminatedUnion("targetKind", [
  HierarchyPlannerTaskSchema,
  HierarchyLeafTaskSchema,
]);

export const HierarchyDelegationPlanSchema = z.object({
  version: z.literal("0.2.0"),
  planId: z.string().min(1),
  projectId: z.string().min(1),
  parentRunId: z.string().min(1),
  parentScope: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("global") }).strict(),
    z.object({ kind: HierarchyPlannerLevelSchema, nodeId: z.string().min(1) }).strict(),
  ]),
  contextHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  objective: z.string().trim().min(1).max(500),
  tasks: z.array(HierarchyDelegationTaskSchema).min(1).max(8),
  rationale: z.string().trim().min(1).max(500),
}).strict();

export const WholeTreeLeafTaskSchema = z.object({
  transactionTaskId: z.string().min(1),
  sourcePlanId: z.string().min(1),
  sourceTaskId: z.string().min(1),
  childRunId: z.string().min(1),
  nodeId: z.string().min(1),
  filePath: z.string().min(1),
  objective: z.string().trim().min(1).max(500),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(300)).min(1).max(48),
}).strict();

export const WholeTreeTransactionPlanSchema = z.object({
  version: z.literal("0.1.0"),
  transactionPlanId: z.string().min(1),
  projectId: z.string().min(1),
  rootRunId: z.string().min(1),
  rootContextHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  objective: z.string().trim().min(1).max(500),
  sourcePlanIds: z.array(z.string().min(1)).min(1).max(64),
  leaves: z.array(WholeTreeLeafTaskSchema).min(1).max(32),
}).strict();

export type HierarchyPlannerLevel = z.infer<typeof HierarchyPlannerLevelSchema>;
export type HierarchyDelegationTask = z.infer<typeof HierarchyDelegationTaskSchema>;
export type HierarchyDelegationPlan = z.infer<typeof HierarchyDelegationPlanSchema>;
export type WholeTreeLeafTask = z.infer<typeof WholeTreeLeafTaskSchema>;
export type WholeTreeTransactionPlan = z.infer<typeof WholeTreeTransactionPlanSchema>;
