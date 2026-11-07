import { z } from "zod";

/**
 * Workbench GitHub Graph partition-tree *view projection*.
 * Domain entities / dual-mode nav live in `github-domain.ts` + `github-graph-nav.ts`.
 * Nodes hang under the default branch (or synthetic root) via parentId.
 */
export const GithubGraphNodeKindSchema = z.enum([
  "default",
  "group",
  "feature",
  "branch",
  "pr",
  "worktree",
]);

export type GithubGraphNodeKind = z.infer<typeof GithubGraphNodeKindSchema>;

export const GithubGraphNodeSchema = z
  .object({
    id: z.string().min(1).max(280),
    kind: GithubGraphNodeKindSchema,
    name: z.string().min(1).max(240),
    parentId: z.string().min(1).max(280).nullable().optional(),
    current: z.boolean().default(false),
    /** True when the branch exists only as a remote-tracking / API-known ref. */
    remote: z.boolean().default(false),
    /**
     * Ephemeral UI state while create/push (or delete) is in flight.
     * Pending nodes render gray until the remote mutation settles.
     */
    pending: z.boolean().default(false),
    ahead: z.number().int().nonnegative().optional(),
    behind: z.number().int().nonnegative().optional(),
    prNumber: z.number().int().positive().optional(),
    prUrl: z.string().min(1).max(2048).optional(),
    worktreeId: z.string().min(1).max(120).optional(),
  })
  .strict();

export type GithubGraphNode = z.infer<typeof GithubGraphNodeSchema>;

export const GithubGraphModelSchema = z
  .object({
    repoLabel: z.string().min(1).max(240),
    defaultBranch: z.string().min(1).max(240).nullable(),
    currentBranch: z.string().min(1).max(240).nullable(),
    remoteUrl: z.string().min(1).max(2048).optional(),
    dirty: z.boolean().default(false),
    nodes: z.array(GithubGraphNodeSchema).max(600),
  })
  .strict();

export type GithubGraphModel = z.infer<typeof GithubGraphModelSchema>;
