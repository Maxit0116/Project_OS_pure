import { z } from "zod";

export const WorkspaceGitStatusSchema = z
  .object({
    branch: z.string().nullable(),
    dirty: z.boolean(),
  })
  .strict();

export type WorkspaceGitStatus = z.infer<typeof WorkspaceGitStatusSchema>;
