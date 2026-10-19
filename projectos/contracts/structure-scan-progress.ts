import { z } from "zod";

import { StructureScanModeSchema } from "./graph.js";

/** User-visible pipeline steps for structure-map generation. */
export const StructureScanStepIdSchema = z.enum([
  "index_repo",
  "map_context",
  "map_components",
  "link_code",
  "validate_save",
]);

export const StructureScanStepStatusSchema = z.enum([
  "pending",
  "running",
  "complete",
  "skipped",
  "failed",
]);

export const StructureScanStepSchema = z
  .object({
    id: StructureScanStepIdSchema,
    status: StructureScanStepStatusSchema,
    /** Short secondary detail (e.g. "238 files", "4 containers"). */
    detail: z.string().max(256).optional(),
  })
  .strict();

export const StructureScanStatusSchema = z.enum([
  "idle",
  "running",
  "success",
  "failed",
  "cancelled",
]);

export const StructureScanProgressSchema = z
  .object({
    scanId: z.string().min(1),
    projectId: z.string().min(1),
    mode: StructureScanModeSchema,
    status: StructureScanStatusSchema,
    steps: z.array(StructureScanStepSchema).min(1).max(8),
    startedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    error: z.string().max(2_048).optional(),
  })
  .strict();

export const StructureScanProgressEventTypeSchema = z.enum([
  "scan_planned",
  "step_started",
  "step_completed",
  "step_skipped",
  "step_failed",
  "scan_completed",
  "scan_failed",
  "scan_cancelled",
]);

const StructureScanEventBaseSchema = z.object({
  type: StructureScanProgressEventTypeSchema,
  scanId: z.string().min(1),
  projectId: z.string().min(1),
  timestamp: z.string().datetime(),
});

export const StructureScanProgressEventSchema = z.discriminatedUnion("type", [
  StructureScanEventBaseSchema.extend({
    type: z.literal("scan_planned"),
    mode: StructureScanModeSchema,
    steps: z.array(StructureScanStepSchema).min(1).max(8),
  }).strict(),
  StructureScanEventBaseSchema.extend({
    type: z.literal("step_started"),
    stepId: StructureScanStepIdSchema,
    detail: z.string().max(256).optional(),
  }).strict(),
  StructureScanEventBaseSchema.extend({
    type: z.literal("step_completed"),
    stepId: StructureScanStepIdSchema,
    detail: z.string().max(256).optional(),
  }).strict(),
  StructureScanEventBaseSchema.extend({
    type: z.literal("step_skipped"),
    stepId: StructureScanStepIdSchema,
    detail: z.string().max(256).optional(),
  }).strict(),
  StructureScanEventBaseSchema.extend({
    type: z.literal("step_failed"),
    stepId: StructureScanStepIdSchema,
    message: z.string().max(2_048),
  }).strict(),
  StructureScanEventBaseSchema.extend({
    type: z.literal("scan_completed"),
  }).strict(),
  StructureScanEventBaseSchema.extend({
    type: z.literal("scan_failed"),
    stepId: StructureScanStepIdSchema.optional(),
    message: z.string().max(2_048),
  }).strict(),
  StructureScanEventBaseSchema.extend({
    type: z.literal("scan_cancelled"),
  }).strict(),
]);

export type StructureScanStepId = z.infer<typeof StructureScanStepIdSchema>;
export type StructureScanStepStatus = z.infer<
  typeof StructureScanStepStatusSchema
>;
export type StructureScanStep = z.infer<typeof StructureScanStepSchema>;
export type StructureScanStatus = z.infer<typeof StructureScanStatusSchema>;
export type StructureScanProgress = z.infer<typeof StructureScanProgressSchema>;
export type StructureScanProgressEvent = z.infer<
  typeof StructureScanProgressEventSchema
>;
export type StructureScanProgressEventType = z.infer<
  typeof StructureScanProgressEventTypeSchema
>;

export const STRUCTURE_SCAN_STEP_ORDER: StructureScanStepId[] = [
  "index_repo",
  "map_context",
  "map_components",
  "link_code",
  "validate_save",
];

export function createPlannedStructureScanSteps(input?: {
  skipMapContext?: boolean;
}): StructureScanStep[] {
  return STRUCTURE_SCAN_STEP_ORDER.map((id) => ({
    id,
    status:
      input?.skipMapContext && id === "map_context" ? "skipped" : "pending",
  }));
}
