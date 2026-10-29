import { z } from "zod";

export const WorkspaceGitStatusSchema = z
  .object({
    branch: z.string().nullable(),
    dirty: z.boolean(),
    ahead: z.number().int().nonnegative().optional(),
    behind: z.number().int().nonnegative().optional(),
    /** Primary remote https/ssh URL when known. */
    remoteUrl: z.string().min(1).max(2048).optional(),
    defaultBranch: z.string().min(1).max(240).optional(),
    error: z.string().max(2_000).optional(),
  })
  .strict();

export type WorkspaceGitStatus = z.infer<typeof WorkspaceGitStatusSchema>;

export const WorkspaceGitBranchSchema = z
  .object({
    name: z.string().min(1).max(240),
    /** Stable id for locator / graph (usually `branch:<name>`). */
    id: z.string().min(1).max(280),
    current: z.boolean().default(false),
    remote: z.boolean().default(false),
    upstream: z.string().min(1).max(280).optional(),
    ahead: z.number().int().nonnegative().optional(),
    behind: z.number().int().nonnegative().optional(),
  })
  .strict();

export type WorkspaceGitBranch = z.infer<typeof WorkspaceGitBranchSchema>;

export const WorkspaceGitBranchListSchema = z
  .object({
    defaultBranch: z.string().min(1).max(240).nullable(),
    currentBranch: z.string().min(1).max(240).nullable(),
    branches: z.array(WorkspaceGitBranchSchema).max(500),
  })
  .strict();

export type WorkspaceGitBranchList = z.infer<typeof WorkspaceGitBranchListSchema>;

export const WorkspaceGitMutationResultSchema = z
  .object({
    ok: z.boolean(),
    branch: z.string().min(1).max(240).nullable().optional(),
    message: z.string().max(2_000),
  })
  .strict();

export type WorkspaceGitMutationResult = z.infer<
  typeof WorkspaceGitMutationResultSchema
>;

export const WorkspaceGitPullRequestSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string().min(1).max(500),
    url: z.string().min(1).max(2048),
    headRef: z.string().min(1).max(240),
    baseRef: z.string().min(1).max(240),
    state: z.enum(["open", "closed", "merged"]).default("open"),
  })
  .strict();

export type WorkspaceGitPullRequest = z.infer<
  typeof WorkspaceGitPullRequestSchema
>;

export const WorkspaceGitPullRequestListSchema = z
  .object({
    available: z.boolean(),
    pullRequests: z.array(WorkspaceGitPullRequestSchema).max(100),
    message: z.string().max(2_000).optional(),
  })
  .strict();

export type WorkspaceGitPullRequestList = z.infer<
  typeof WorkspaceGitPullRequestListSchema
>;
