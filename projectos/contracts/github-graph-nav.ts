import { z } from "zod";

import { GithubPosIdSchema, GithubShaSchema } from "./github-domain.js";

/**
 * View layers for GitHub Graph (drill stack, not mutually exclusive data).
 * L0 partition → L1 feature-tree → L2 git-history.
 */
export const GithubGraphActiveModeSchema = z.enum([
  "partition",
  "feature-tree",
  "git-history",
]);
export type GithubGraphActiveMode = z.infer<typeof GithubGraphActiveModeSchema>;

export const GithubGraphViewportSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    scale: z.number().positive(),
  })
  .strict();
export type GithubGraphViewport = z.infer<typeof GithubGraphViewportSchema>;

export const GithubGraphOverlayFlagsSchema = z
  .object({
    pullRequests: z.boolean().default(true),
    ciChecks: z.boolean().default(false),
    fileBadges: z.boolean().default(false),
  })
  .strict();
export type GithubGraphOverlayFlags = z.infer<
  typeof GithubGraphOverlayFlagsSchema
>;

/**
 * Shared + per-layer navigation state for GitHub Graph.
 * Use stable IDs / SHAs — never display names — as primary identities.
 */
export const GithubGraphNavStateSchema = z
  .object({
    activeMode: GithubGraphActiveModeSchema.default("partition"),
    selectedEntityId: z.string().min(1).max(280).nullable().optional(),
    selectedCommitSha: GithubShaSchema.nullable().optional(),
    focusedBranchRef: z.string().min(1).max(240).nullable().optional(),
    focusedFeatureId: GithubPosIdSchema.nullable().optional(),
    expandedFeatureIds: z.array(GithubPosIdSchema).max(500).default([]),
    visibleOverlays: GithubGraphOverlayFlagsSchema.default({
      pullRequests: true,
      ciChecks: false,
      fileBadges: false,
    }),
    partitionViewport: GithubGraphViewportSchema.optional(),
    featureTreeViewport: GithubGraphViewportSchema.optional(),
    gitHistoryViewport: GithubGraphViewportSchema.optional(),
  })
  .strict();
export type GithubGraphNavState = z.infer<typeof GithubGraphNavStateSchema>;

export const DEFAULT_GITHUB_GRAPH_NAV: GithubGraphNavState = {
  activeMode: "partition",
  selectedEntityId: null,
  selectedCommitSha: null,
  focusedBranchRef: null,
  focusedFeatureId: null,
  expandedFeatureIds: [],
  visibleOverlays: {
    pullRequests: true,
    ciChecks: false,
    fileBadges: false,
  },
};

export type GithubGraphNavAction =
  | { type: "set-mode"; mode: GithubGraphActiveMode }
  | { type: "select-entity"; id: string | null }
  | { type: "select-commit"; sha: string | null }
  | { type: "focus-branch"; ref: string | null }
  | { type: "focus-feature"; id: string | null }
  | { type: "toggle-feature-expanded"; id: string }
  | {
      type: "set-viewport";
      mode: GithubGraphActiveMode;
      viewport: GithubGraphViewport;
    }
  | { type: "set-overlays"; overlays: Partial<GithubGraphOverlayFlags> }
  | { type: "clear-stale-selection" };

export function viewportForMode(
  state: GithubGraphNavState,
  mode: GithubGraphActiveMode,
): GithubGraphViewport | undefined {
  if (mode === "partition") return state.partitionViewport;
  if (mode === "feature-tree") return state.featureTreeViewport;
  return state.gitHistoryViewport;
}

export function reduceGithubGraphNav(
  state: GithubGraphNavState,
  action: GithubGraphNavAction,
): GithubGraphNavState {
  switch (action.type) {
    case "set-mode":
      return { ...state, activeMode: action.mode };
    case "select-entity":
      return { ...state, selectedEntityId: action.id };
    case "select-commit":
      return { ...state, selectedCommitSha: action.sha };
    case "focus-branch":
      return { ...state, focusedBranchRef: action.ref };
    case "focus-feature":
      return { ...state, focusedFeatureId: action.id };
    case "toggle-feature-expanded": {
      const has = state.expandedFeatureIds.includes(action.id);
      return {
        ...state,
        expandedFeatureIds: has
          ? state.expandedFeatureIds.filter((id) => id !== action.id)
          : [...state.expandedFeatureIds, action.id],
      };
    }
    case "set-viewport":
      if (action.mode === "partition") {
        return { ...state, partitionViewport: action.viewport };
      }
      if (action.mode === "feature-tree") {
        return { ...state, featureTreeViewport: action.viewport };
      }
      return { ...state, gitHistoryViewport: action.viewport };
    case "set-overlays":
      return {
        ...state,
        visibleOverlays: { ...state.visibleOverlays, ...action.overlays },
      };
    case "clear-stale-selection":
      return {
        ...state,
        selectedEntityId: null,
        selectedCommitSha: null,
        focusedBranchRef: null,
        focusedFeatureId: null,
      };
    default:
      return state;
  }
}

/** Parent layer for breadcrumb back (null at L0). */
export function parentGithubGraphMode(
  mode: GithubGraphActiveMode,
): GithubGraphActiveMode | null {
  if (mode === "git-history") return "feature-tree";
  if (mode === "feature-tree") return "partition";
  return null;
}
