import { z } from "zod";

export const ActivityChannelSchema = z.enum([
  "agent",
  "verification",
  "build",
  "system",
]);

export const ActivityEntryKindSchema = z.enum([
  "lifecycle",
  "action",
  "reasoning",
  "verification",
  "command",
  "error",
]);

export const ActivityEntryStatusSchema = z.enum([
  "info",
  "success",
  "warning",
  "error",
]);

export const ActivityEntrySchema = z
  .object({
    id: z.string().min(1),
    timestamp: z.string().min(1),
    runId: z.string().min(1).optional(),
    channel: ActivityChannelSchema,
    kind: ActivityEntryKindSchema,
    title: z.string().min(1),
    detail: z.string().optional(),
    body: z.string().optional(),
    status: ActivityEntryStatusSchema.optional(),
    sourceEventId: z.string().optional(),
  })
  .strict();

export type ActivityChannel = z.infer<typeof ActivityChannelSchema>;
export type ActivityEntryKind = z.infer<typeof ActivityEntryKindSchema>;
export type ActivityEntryStatus = z.infer<typeof ActivityEntryStatusSchema>;
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;

export const ACTIVITY_LOG_MAX_ENTRIES = 2000;
export const ACTIVITY_BODY_MAX_BYTES = 64 * 1024;
