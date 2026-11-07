import { z } from "zod";

import { ExecutorSelectionSchema } from "./executor-selection.js";

export const RunDecisionKindSchema = z.enum(["intent", "clarification", "scope_change", "budget"]);
export const RunDecisionStatusSchema = z.enum(["pending", "resolved", "declined", "superseded"]);

export const RunDecisionSchema = z.object({
  version: z.literal("0.1.0"),
  id: z.string().min(1),
  projectId: z.string().min(1),
  rootRunId: z.string().min(1),
  runId: z.string().min(1),
  nodeId: z.string().min(1).optional(),
  kind: RunDecisionKindSchema,
  question: z.string().trim().min(1),
  options: z.array(z.object({ id: z.string().min(1), label: z.string().trim().min(1) }).strict()).min(1),
  recommendation: z.string().trim().min(1).optional(),
  /**
   * Hash of the leaf scope in force when the decision was created.
   * Resolve/resume must not widen beyond this binding.
   */
  scopeBindingHash: z.string().min(1).optional(),
  /** Approved intent id that authorized the waiting run, when present. */
  authorizedIntentId: z.string().min(1).optional(),
  status: RunDecisionStatusSchema,
  revision: z.number().int().positive(),
  answer: z.object({ optionId: z.string().min(1), text: z.string().optional() }).strict().optional(),
  createdAt: z.string().min(1),
  resolvedAt: z.string().min(1).optional(),
}).strict();

export const RunBudgetSchema = z.object({
  maxActiveTimeMs: z.number().int().positive().optional(),
  maxInputTokens: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  maxSpendCents: z.number().int().positive().optional(),
  maxConcurrency: z.number().int().positive().default(1),
}).strict();

export const RunBudgetUsageSchema = z.object({
  activeTimeMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  spendCents: z.number().int().nonnegative(),
  reservedActiveTimeMs: z.number().int().nonnegative(),
  reservedInputTokens: z.number().int().nonnegative(),
  reservedOutputTokens: z.number().int().nonnegative(),
  reservedSpendCents: z.number().int().nonnegative(),
  reservedConcurrency: z.number().int().nonnegative(),
}).strict();

export const RunCheckpointSchema = z.object({
  version: z.literal("0.1.0"),
  id: z.string().min(1),
  projectId: z.string().min(1),
  rootRunId: z.string().min(1),
  approvedIntentRevision: z.number().int().positive().optional(),
  approvedIntentHash: z.string().min(1).optional(),
  graphRevision: z.string().min(1).optional(),
  taskIds: z.array(z.string().min(1)),
  completedTaskIds: z.array(z.string().min(1)),
  executorSelections: z.record(ExecutorSelectionSchema),
  pendingDecisionIds: z.array(z.string().min(1)),
  budgetUsage: RunBudgetUsageSchema,
  publication: z.enum(["not_applied", "applied", "rolled_back", "recovery_required"]),
  transactionReceiptIds: z.array(z.string().min(1)),
  eventCursor: z.string().min(1).optional(),
  adapterCheckpoint: z.unknown().optional(),
  updatedAt: z.string().min(1),
}).strict().superRefine((checkpoint, ctx) => {
  const taskIds = new Set(checkpoint.taskIds);
  const unique = (values: string[]) => new Set(values).size === values.length;
  if (!unique(checkpoint.taskIds)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["taskIds"], message: "Checkpoint task IDs must be unique" });
  }
  if (!unique(checkpoint.completedTaskIds) || checkpoint.completedTaskIds.some((id) => !taskIds.has(id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["completedTaskIds"], message: "Completed tasks must be unique checkpoint tasks" });
  }
  if (Object.keys(checkpoint.executorSelections).some((taskId) => !taskIds.has(taskId))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["executorSelections"], message: "Executor selections must belong to checkpoint tasks" });
  }
  if (!unique(checkpoint.pendingDecisionIds)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pendingDecisionIds"], message: "Pending decision IDs must be unique" });
  }
  if (!unique(checkpoint.transactionReceiptIds)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["transactionReceiptIds"], message: "Transaction receipt IDs must be unique" });
  }
});

export type RunDecision = z.infer<typeof RunDecisionSchema>;
export type RunDecisionKind = z.infer<typeof RunDecisionKindSchema>;
export type RunDecisionStatus = z.infer<typeof RunDecisionStatusSchema>;
export type RunBudget = z.infer<typeof RunBudgetSchema>;
export type RunBudgetUsage = z.infer<typeof RunBudgetUsageSchema>;
export type RunCheckpoint = z.infer<typeof RunCheckpointSchema>;
