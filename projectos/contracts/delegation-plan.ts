import { z } from "zod";

export const DelegationPlanTaskSchema = z.object({
  taskId: z.string().min(1),
  filePath: z.string().min(1),
  operation: z.enum(["create", "delete"]).optional(),
  responsibility: z.string().trim().min(1).max(500).optional(),
  objective: z.string().trim().min(1).max(500),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
}).strict().superRefine((task, ctx) => {
  if (task.operation === "create" && !task.responsibility) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["responsibility"],
      message: "Create tasks require a file responsibility",
    });
  }
  if (task.operation !== "create" && task.responsibility) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["responsibility"],
      message: "Modify tasks cannot claim a create responsibility",
    });
  }
});

export const DelegationPlanSchema = z.object({
  version: z.literal("0.1.0"),
  planId: z.string().min(1),
  projectId: z.string().min(1),
  parentRunId: z.string().min(1),
  nodeId: z.string().min(1),
  contextBundleHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  objective: z.string().trim().min(1).max(500),
  tasks: z.array(DelegationPlanTaskSchema).min(1).max(8),
  impactAnalysis: z.object({
    kind: z.literal("file_delete"),
    scanner: z.literal("typescript_javascript_static_imports_v1"),
    targetPath: z.string().min(1),
    directImporters: z.array(z.string().min(1)).max(7),
    reverseTransitiveClosure: z.array(z.string().min(1)).max(128),
  }).strict().optional(),
  rationale: z.string().trim().min(1).max(500),
}).strict().superRefine((plan, ctx) => {
  const deleteTasks = plan.tasks.filter((task) => task.operation === "delete");
  if (deleteTasks.length === 0 && plan.impactAnalysis) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["impactAnalysis"],
      message: "Impact analysis requires a delete task",
    });
  }
  if (deleteTasks.length > 0) {
    if (deleteTasks.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tasks"],
        message: "A delete plan requires exactly one requested deletion target",
      });
    }
    if (!plan.impactAnalysis) return;
    const { directImporters, reverseTransitiveClosure, targetPath } = plan.impactAnalysis;
    if (
      new Set(directImporters).size !== directImporters.length ||
      new Set(reverseTransitiveClosure).size !== reverseTransitiveClosure.length ||
      directImporters.includes(targetPath) ||
      reverseTransitiveClosure.includes(targetPath) ||
      directImporters.some((path) => !reverseTransitiveClosure.includes(path))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["impactAnalysis"],
        message: "Delete impact paths must be unique, exclude the target, and include every direct importer in the reverse closure",
      });
    }
    if (deleteTasks[0]?.filePath !== plan.impactAnalysis.targetPath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["impactAnalysis"],
        message: "Delete impact analysis must match the requested target",
      });
    }
    const expectedPaths = [
      plan.impactAnalysis?.targetPath,
      ...(plan.impactAnalysis?.directImporters ?? []),
    ];
    if (
      plan.tasks.length !== expectedPaths.length ||
      plan.tasks.some((task, index) => task.filePath !== expectedPaths[index])
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tasks"],
        message: "Delete tasks must exactly match the server-derived impact set",
      });
    }
  }
});

export type DelegationPlanTask = z.infer<typeof DelegationPlanTaskSchema>;
export type DelegationPlan = z.infer<typeof DelegationPlanSchema>;
