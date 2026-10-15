import { z } from "zod";

export const WorkspaceDirectoryEntryKindSchema = z.enum(["file", "directory"]);

export const WorkspaceDirectoryEntrySchema = z
  .object({
    name: z.string().min(1),
    path: z.string().min(1),
    kind: WorkspaceDirectoryEntryKindSchema,
  })
  .strict();

export type WorkspaceDirectoryEntryKind = z.infer<
  typeof WorkspaceDirectoryEntryKindSchema
>;
export type WorkspaceDirectoryEntry = z.infer<typeof WorkspaceDirectoryEntrySchema>;
