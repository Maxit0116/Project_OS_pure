import { z } from "zod";

export const BatchValidationCriterionSchema = z.object({
  criterion: z.string().trim().min(1).max(300),
  status: z.enum(["satisfied", "unsatisfied", "uncertain"]),
}).strict();

export const BatchValidationTaskSchema = z.object({
  taskId: z.string().min(1),
  childRunId: z.string().min(1),
  path: z.string().min(1),
  status: z.enum(["consistent", "inconsistent", "uncertain"]),
  criteria: z.array(BatchValidationCriterionSchema).min(1).max(48),
  summary: z.string().trim().min(1).max(500),
}).strict();

export const BatchValidationResultSchema = z.object({
  version: z.literal("0.1.0"),
  parentRunId: z.string().min(1),
  planId: z.string().min(1),
  contextBundleHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  verdict: z.enum(["valid", "invalid"]),
  tasks: z.array(BatchValidationTaskSchema).min(1).max(32),
  crossFileAssessment: z.object({
    status: z.enum(["consistent", "inconsistent", "uncertain"]),
    summary: z.string().trim().min(1).max(500),
  }).strict(),
  summary: z.string().trim().min(1).max(500),
  rationale: z.string().trim().min(1).max(500),
}).strict();

export type BatchValidationCriterion = z.infer<typeof BatchValidationCriterionSchema>;
export type BatchValidationTask = z.infer<typeof BatchValidationTaskSchema>;
export type BatchValidationResult = z.infer<typeof BatchValidationResultSchema>;
