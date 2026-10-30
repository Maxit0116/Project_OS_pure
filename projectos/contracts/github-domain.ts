import { z } from "zod";

/**
 * Shared domain model for GitHub Graph Feature Tree + Git History.
 * Distinct from the partition-tree view projection in `github-graph.ts`.
 * Feature is a Project OS entity (independent of story-map features.json).
 */

export const GithubPosIdSchema = z.string().min(1).max(120);
export type GithubPosId = z.infer<typeof GithubPosIdSchema>;

export const GithubShaSchema = z
  .string()
  .min(7)
  .max(64)
  .regex(/^[0-9a-fA-F]+$/u);
export type GithubSha = z.infer<typeof GithubShaSchema>;

export const GithubFeatureStatusSchema = z.enum([
  "planned",
  "active",
  "blocked",
  "done",
  "archived",
]);
export type GithubFeatureStatus = z.infer<typeof GithubFeatureStatusSchema>;

export const GithubRepoRefSchema = z
  .object({
    posId: GithubPosIdSchema,
    fullName: z.string().min(1).max(240),
    defaultBranch: z.string().min(1).max(240),
    remoteUrl: z.string().min(1).max(2048).optional(),
    lastSyncedAt: z.string().min(1).max(64).optional(),
  })
  .strict();
export type GithubRepoRef = z.infer<typeof GithubRepoRefSchema>;

export const GithubFeatureIssueRefSchema = z
  .object({
    number: z.number().int().positive(),
    url: z.string().min(1).max(2048).optional(),
    state: z.enum(["open", "closed"]).optional(),
  })
  .strict();

export const GithubFeatureSchema = z
  .object({
    id: GithubPosIdSchema,
    title: z.string().min(1).max(240),
    description: z.string().max(4_000).optional(),
    /** Hierarchical parent only — dependencies use typed relations. */
    parentFeatureId: GithubPosIdSchema.nullable().optional(),
    assigneeIds: z.array(z.string().min(1).max(120)).max(32).optional(),
    status: GithubFeatureStatusSchema.default("planned"),
    issueRef: GithubFeatureIssueRefSchema.nullable().optional(),
    updatedAt: z.string().min(1).max(64).optional(),
  })
  .strict();
export type GithubFeature = z.infer<typeof GithubFeatureSchema>;

export const GithubBranchRefSchema = z
  .object({
    name: z.string().min(1).max(240),
    headSha: GithubShaSchema.nullable().optional(),
    remote: z.boolean().default(false),
    upstream: z.string().min(1).max(280).optional(),
    deleted: z.boolean().default(false),
  })
  .strict();
export type GithubBranchRef = z.infer<typeof GithubBranchRefSchema>;

export const GithubCommitFileSummarySchema = z
  .object({
    path: z.string().min(1).max(1_024),
    status: z.string().min(1).max(40),
    additions: z.number().int().nonnegative().optional(),
    deletions: z.number().int().nonnegative().optional(),
    previousPath: z.string().min(1).max(1_024).optional(),
  })
  .strict();
export type GithubCommitFileSummary = z.infer<
  typeof GithubCommitFileSummarySchema
>;

export const GithubCommitSchema = z
  .object({
    sha: GithubShaSchema,
    /** Authoritative git parents — never invented UI edges. */
    parentShas: z.array(GithubShaSchema).max(16),
    message: z.string().min(1).max(8_000),
    authorName: z.string().min(1).max(240).optional(),
    authoredAt: z.string().min(1).max(64).optional(),
    changedFilesSummary: z
      .array(GithubCommitFileSummarySchema)
      .max(2_000)
      .optional(),
  })
  .strict();
export type GithubCommit = z.infer<typeof GithubCommitSchema>;

export const GithubPullRequestRefSchema = z
  .object({
    number: z.number().int().positive(),
    title: z.string().min(1).max(500),
    url: z.string().min(1).max(2048),
    headRef: z.string().min(1).max(240),
    baseRef: z.string().min(1).max(240),
    state: z.enum(["open", "closed", "merged"]).default("open"),
    headSha: GithubShaSchema.optional(),
  })
  .strict();
export type GithubPullRequestRef = z.infer<typeof GithubPullRequestRefSchema>;

export const GithubRelationKindSchema = z.enum([
  "feature-parent",
  "feature-depends",
  "feature-tracked-by",
  "feature-implemented-by",
  "feature-reviewed-by",
  "commit-parent",
  "branch-head",
  "pr-head",
  "pr-base",
  "pr-contains-commit",
  "validated-by",
  "agent-touched",
]);
export type GithubRelationKind = z.infer<typeof GithubRelationKindSchema>;

export const GithubRelationSourceSchema = z.enum([
  "user",
  "import",
  "heuristic",
  "git",
  "derived",
]);

export const GithubRelationSchema = z
  .object({
    id: GithubPosIdSchema,
    kind: GithubRelationKindSchema,
    fromType: z.enum([
      "feature",
      "branch",
      "commit",
      "pr",
      "issue",
      "check",
      "file",
      "agent-session",
    ]),
    fromKey: z.string().min(1).max(280),
    toType: z.enum([
      "feature",
      "branch",
      "commit",
      "pr",
      "issue",
      "check",
      "file",
      "agent-session",
    ]),
    toKey: z.string().min(1).max(280),
    source: GithubRelationSourceSchema.default("user"),
    createdAt: z.string().min(1).max(64).optional(),
    stale: z.boolean().default(false),
  })
  .strict();
export type GithubRelation = z.infer<typeof GithubRelationSchema>;

export const GithubDomainModelSchema = z
  .object({
    repo: GithubRepoRefSchema,
    features: z.array(GithubFeatureSchema).max(2_000),
    branches: z.array(GithubBranchRefSchema).max(500),
    commits: z.array(GithubCommitSchema).max(5_000),
    pullRequests: z.array(GithubPullRequestRefSchema).max(200),
    relations: z.array(GithubRelationSchema).max(20_000),
  })
  .strict();
export type GithubDomainModel = z.infer<typeof GithubDomainModelSchema>;

/** Default tip-first commit window for Git History (confirmed product default). */
export const GITHUB_HISTORY_COMMIT_CAP = 200;
