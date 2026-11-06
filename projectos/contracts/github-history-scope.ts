import { z } from "zod";

import {
  GITHUB_HISTORY_COMMIT_CAP,
  GithubPosIdSchema,
} from "./github-domain.js";

/**
 * L2 temporal swimlane query scope (GitHub Graph Temporal Swimlane Dev Plan).
 * Double-click on an overview node resolves into this; layout never invents parents.
 */

export const GithubHistorySourceKindSchema = z.enum([
  "branch",
  "feature",
  "pr",
  "group",
  "default",
  "worktree",
]);
export type GithubHistorySourceKind = z.infer<
  typeof GithubHistorySourceKindSchema
>;

export const GithubHistoryWindowKindSchema = z.enum([
  "commit-cap",
  "since-days",
  "since-fork",
]);
export type GithubHistoryWindowKind = z.infer<
  typeof GithubHistoryWindowKindSchema
>;

export const GithubHistoryWindowSchema = z
  .object({
    kind: GithubHistoryWindowKindSchema.default("commit-cap"),
    commitCap: z
      .number()
      .int()
      .positive()
      .max(5_000)
      .default(GITHUB_HISTORY_COMMIT_CAP),
    sinceDays: z.number().int().positive().max(3_650).optional(),
  })
  .strict();
export type GithubHistoryWindow = z.infer<typeof GithubHistoryWindowSchema>;

export const GithubHistoryEmptyReasonSchema = z.enum([
  "no-association",
  "no-commits",
  "not-found",
  "unsupported",
]);
export type GithubHistoryEmptyReason = z.infer<
  typeof GithubHistoryEmptyReasonSchema
>;

export const GithubHistoryScopeSchema = z
  .object({
    sourceKind: GithubHistorySourceKindSchema,
    sourceId: z.string().min(1).max(280),
    /** Tips / refs included in the git query (may be empty → empty state). */
    branchRefs: z.array(z.string().min(1).max(240)).max(100).default([]),
    /** When sourceKind === 'pr': base...head style query. */
    prNumber: z.number().int().positive().optional(),
    prBaseRef: z.string().min(1).max(240).optional(),
    prHeadRef: z.string().min(1).max(240).optional(),
    window: GithubHistoryWindowSchema.default({
      kind: "commit-cap",
      commitCap: GITHUB_HISTORY_COMMIT_CAP,
    }),
    firstParentOnly: z.boolean().default(false),
    /** Feature id when entered from a feature — lane highlight. */
    highlightFeatureId: GithubPosIdSchema.optional(),
    /** Branches associated with the highlighted feature (subset of branchRefs). */
    highlightBranchRefs: z
      .array(z.string().min(1).max(240))
      .max(100)
      .optional(),
    /** Overview mode to restore on breadcrumb / Esc up-drill. */
    returnMode: z.enum(["partition", "feature-tree"]).default("partition"),
    emptyReason: GithubHistoryEmptyReasonSchema.optional(),
    emptyMessage: z.string().max(2_000).optional(),
  })
  .strict();
export type GithubHistoryScope = z.infer<typeof GithubHistoryScopeSchema>;

export const DEFAULT_GITHUB_HISTORY_WINDOW: GithubHistoryWindow = {
  kind: "commit-cap",
  commitCap: GITHUB_HISTORY_COMMIT_CAP,
};

export function createDefaultHistoryScope(
  partial: Pick<GithubHistoryScope, "sourceKind" | "sourceId"> &
    Partial<GithubHistoryScope>,
): GithubHistoryScope {
  return GithubHistoryScopeSchema.parse({
    sourceKind: partial.sourceKind,
    sourceId: partial.sourceId,
    branchRefs: partial.branchRefs ?? [],
    prNumber: partial.prNumber,
    prBaseRef: partial.prBaseRef,
    prHeadRef: partial.prHeadRef,
    window: partial.window ?? DEFAULT_GITHUB_HISTORY_WINDOW,
    firstParentOnly: partial.firstParentOnly ?? false,
    highlightFeatureId: partial.highlightFeatureId,
    highlightBranchRefs: partial.highlightBranchRefs,
    returnMode: partial.returnMode ?? "partition",
    emptyReason: partial.emptyReason,
    emptyMessage: partial.emptyMessage,
  });
}
