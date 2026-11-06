import { z } from "zod";

import { GithubPosIdSchema, GithubShaSchema } from "./github-domain.js";
import {
  GithubHistoryScopeSchema,
  type GithubHistoryScope,
  type GithubHistoryWindow,
} from "./github-history-scope.js";

/**
 * View layers for GitHub Graph (drill stack, not mutually exclusive data).
 * L0 partition → L1 feature-tree → L2 git-history (temporal swimlane).
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
    /** Active L2 swimlane scope (set on double-click enter). */
    historyScope: GithubHistoryScopeSchema.nullable().optional(),
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
  historyScope: null,
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
  | { type: "set-history-scope"; scope: GithubHistoryScope | null }
  | { type: "set-history-window"; window: GithubHistoryWindow }
  | { type: "toggle-history-first-parent" }
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
    case "set-history-scope":
      return { ...state, historyScope: action.scope };
    case "set-history-window":
      if (!state.historyScope) return state;
      return {
        ...state,
        historyScope: {
          ...state.historyScope,
          window: action.window,
        },
      };
    case "toggle-history-first-parent":
      if (!state.historyScope) return state;
      return {
        ...state,
        historyScope: {
          ...state.historyScope,
          firstParentOnly: !state.historyScope.firstParentOnly,
        },
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

/**
 * Parent layer for breadcrumb back (null at L0).
 * When leaving git-history, prefer the scope's returnMode (partition vs feature-tree).
 */
export function parentGithubGraphMode(
  mode: GithubGraphActiveMode,
  historyScope?: GithubHistoryScope | null,
): GithubGraphActiveMode | null {
  if (mode === "git-history") {
    return historyScope?.returnMode ?? "feature-tree";
  }
  if (mode === "feature-tree") return "partition";
  return null;
}
