import { z } from "zod";

export const FileTimelineVersionSchema = z.literal("0.1.0");

export const FileTimelineEntryKindSchema = z.enum([
  "agent_proposed",
  "agent_applied",
  "agent_reverted",
  "manual_save",
]);

export const FileTimelineSnapshotRefSchema = z
  .object({
    snapshotId: z.string().min(1),
    backupId: z.string().min(1).optional(),
    backupFile: z.string().min(1).optional(),
  })
  .strict();

export const FileTimelineEntrySchema = z
  .object({
    id: z.string().min(1),
    filePath: z.string().min(1),
    timestamp: z.string().min(1),
    kind: FileTimelineEntryKindSchema,
    runId: z.string().min(1).optional(),
    backupId: z.string().min(1).optional(),
    label: z.string().min(1),
    beforeSha256: z.string().optional(),
    afterSha256: z.string().optional(),
    snapshot: FileTimelineSnapshotRefSchema.optional(),
  })
  .strict();

export const FileTimelineIndexSchema = z
  .object({
    version: FileTimelineVersionSchema,
    entries: z.array(FileTimelineEntrySchema),
  })
  .strict();

export const FileTimelineSnapshotContentSchema = z
  .object({
    before: z.string().optional(),
    after: z.string().optional(),
  })
  .strict();

export const SaveFileWithHistoryResultSchema = z
  .object({
    entry: FileTimelineEntrySchema,
    created: z.boolean(),
  })
  .strict();

export type FileTimelineEntryKind = z.infer<typeof FileTimelineEntryKindSchema>;
export type FileTimelineEntry = z.infer<typeof FileTimelineEntrySchema>;
export type FileTimelineIndex = z.infer<typeof FileTimelineIndexSchema>;
export type FileTimelineSnapshotRef = z.infer<typeof FileTimelineSnapshotRefSchema>;
export type FileTimelineSnapshotContent = z.infer<typeof FileTimelineSnapshotContentSchema>;
export type SaveFileWithHistoryResult = z.infer<typeof SaveFileWithHistoryResultSchema>;

export const FILE_TIMELINE_MAX_ENTRIES_PER_FILE = 50;
