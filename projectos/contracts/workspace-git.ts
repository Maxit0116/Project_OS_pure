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

export const WorkspaceGitCommitSchema = z
  .object({
    sha: z
      .string()
      .min(7)
      .max(64)
      .regex(/^[0-9a-fA-F]+$/u),
    parentShas: z.array(z.string().min(7).max(64)).max(16),
    message: z.string().min(1).max(8_000),
    authorName: z.string().min(1).max(240).optional(),
    authoredAt: z.string().min(1).max(64).optional(),
  })
  .strict();

export type WorkspaceGitCommit = z.infer<typeof WorkspaceGitCommitSchema>;

export const WorkspaceGitCommitListSchema = z
  .object({
    commits: z.array(WorkspaceGitCommitSchema).max(5_000),
    truncated: z.boolean().default(false),
    tips: z.array(z.string().min(1).max(240)).max(100).optional(),
  })
  .strict();

export type WorkspaceGitCommitList = z.infer<
  typeof WorkspaceGitCommitListSchema
>;

export const WorkspaceGitCommitFileSchema = z
  .object({
    path: z.string().min(1).max(1_024),
    status: z.string().min(1).max(40),
    additions: z.number().int().nonnegative().optional(),
    deletions: z.number().int().nonnegative().optional(),
    previousPath: z.string().min(1).max(1_024).optional(),
  })
  .strict();

export type WorkspaceGitCommitFile = z.infer<
  typeof WorkspaceGitCommitFileSchema
>;

export const WorkspaceGitCommitDetailSchema = z
  .object({
    ok: z.boolean(),
    message: z.string().max(2_000),
    commit: WorkspaceGitCommitSchema.optional(),
    files: z.array(WorkspaceGitCommitFileSchema).max(2_000).optional(),
    patch: z.string().max(200_000).optional(),
    patchTruncated: z.boolean().optional(),
  })
  .strict();

export type WorkspaceGitCommitDetail = z.infer<
  typeof WorkspaceGitCommitDetailSchema
>;

export const WorkspaceGitPullRequestMutationResultSchema = z
  .object({
    ok: z.boolean(),
    message: z.string().max(2_000),
    url: z.string().min(1).max(2048).optional(),
    number: z.number().int().positive().optional(),
    sha: z.string().min(7).max(64).optional(),
  })
  .strict();

export type WorkspaceGitPullRequestMutationResult = z.infer<
  typeof WorkspaceGitPullRequestMutationResultSchema
>;

export const WorkspaceGitIssueSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string().min(1).max(500),
    url: z.string().min(1).max(2048),
    state: z.enum(["open", "closed"]).default("open"),
  })
  .strict();

export type WorkspaceGitIssue = z.infer<typeof WorkspaceGitIssueSchema>;

export const WorkspaceGitIssueListSchema = z
  .object({
    available: z.boolean(),
    issues: z.array(WorkspaceGitIssueSchema).max(100),
    message: z.string().max(2_000).optional(),
  })
  .strict();

export type WorkspaceGitIssueList = z.infer<typeof WorkspaceGitIssueListSchema>;

export const WorkspaceGitIssueMutationResultSchema = z
  .object({
    ok: z.boolean(),
    message: z.string().max(2_000),
    number: z.number().int().positive().optional(),
    url: z.string().min(1).max(2048).optional(),
  })
  .strict();

export type WorkspaceGitIssueMutationResult = z.infer<
  typeof WorkspaceGitIssueMutationResultSchema
>;

export const WorkspaceGitCheckRunSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1).max(240),
    status: z.string().min(1).max(40),
    conclusion: z.string().min(1).max(40).nullable(),
    htmlUrl: z.string().min(1).max(2048).optional(),
  })
  .strict();

export type WorkspaceGitCheckRun = z.infer<typeof WorkspaceGitCheckRunSchema>;

export const WorkspaceGitCheckRunListSchema = z
  .object({
    available: z.boolean(),
    checkRuns: z.array(WorkspaceGitCheckRunSchema).max(100),
    message: z.string().max(2_000).optional(),
  })
  .strict();

export type WorkspaceGitCheckRunList = z.infer<
  typeof WorkspaceGitCheckRunListSchema
>;
