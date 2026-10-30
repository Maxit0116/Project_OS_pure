import { describe, expect, it } from "vitest";
import {
  GITHUB_HISTORY_COMMIT_CAP,
  GithubCommitSchema,
  GithubDomainModelSchema,
  GithubFeatureSchema,
  GithubRelationSchema,
} from "./github-domain.js";
import {
  DEFAULT_GITHUB_GRAPH_NAV,
  GithubGraphNavStateSchema,
  parentGithubGraphMode,
  reduceGithubGraphNav,
} from "./github-graph-nav.js";

describe("github-domain contracts", () => {
  it("parses a minimal domain model", () => {
    const model = GithubDomainModelSchema.parse({
      repo: {
        posId: "repo:demo",
        fullName: "acme/demo",
        defaultBranch: "main",
      },
      features: [
        {
          id: "feat:auth",
          title: "Auth",
          status: "active",
          parentFeatureId: null,
        },
      ],
      branches: [{ name: "main", remote: false, headSha: "a".repeat(40) }],
      commits: [
        {
          sha: "a".repeat(40),
          parentShas: [],
          message: "init",
        },
        {
          sha: "b".repeat(40),
          parentShas: ["a".repeat(40)],
          message: "feat",
        },
      ],
      pullRequests: [],
      relations: [
        {
          id: "rel:1",
          kind: "feature-implemented-by",
          fromType: "feature",
          fromKey: "feat:auth",
          toType: "branch",
          toKey: "alice/auth/login",
          source: "user",
        },
      ],
    });
    expect(model.features[0]?.title).toBe("Auth");
    expect(model.commits[1]?.parentShas).toEqual(["a".repeat(40)]);
    expect(GITHUB_HISTORY_COMMIT_CAP).toBe(200);
  });

  it("rejects invalid commit sha", () => {
    expect(() =>
      GithubCommitSchema.parse({
        sha: "not-hex!",
        parentShas: [],
        message: "x",
      }),
    ).toThrow();
  });

  it("defaults feature status", () => {
    const feature = GithubFeatureSchema.parse({
      id: "feat:x",
      title: "X",
    });
    expect(feature.status).toBe("planned");
  });

  it("parses relations with git source", () => {
    const rel = GithubRelationSchema.parse({
      id: "rel:cp",
      kind: "commit-parent",
      fromType: "commit",
      fromKey: "b".repeat(40),
      toType: "commit",
      toKey: "a".repeat(40),
      source: "git",
    });
    expect(rel.stale).toBe(false);
  });
});

describe("github-graph-nav", () => {
  it("round-trips default nav state", () => {
    const parsed = GithubGraphNavStateSchema.parse({});
    expect(parsed.activeMode).toBe("partition");
    expect(parsed.visibleOverlays.ciChecks).toBe(false);
  });

  it("reduces mode switch and viewport independently", () => {
    let state = DEFAULT_GITHUB_GRAPH_NAV;
    state = reduceGithubGraphNav(state, {
      type: "set-viewport",
      mode: "partition",
      viewport: { x: 0, y: 0, scale: 1 },
    });
    state = reduceGithubGraphNav(state, {
      type: "set-viewport",
      mode: "feature-tree",
      viewport: { x: 1, y: 2, scale: 1 },
    });
    state = reduceGithubGraphNav(state, { type: "set-mode", mode: "git-history" });
    state = reduceGithubGraphNav(state, {
      type: "set-viewport",
      mode: "git-history",
      viewport: { x: 10, y: 20, scale: 0.8 },
    });
    expect(state.activeMode).toBe("git-history");
    expect(state.partitionViewport).toEqual({ x: 0, y: 0, scale: 1 });
    expect(state.featureTreeViewport).toEqual({ x: 1, y: 2, scale: 1 });
    expect(state.gitHistoryViewport).toEqual({ x: 10, y: 20, scale: 0.8 });
  });

  it("exposes parent layers for breadcrumb back", () => {
    expect(parentGithubGraphMode("partition")).toBeNull();
    expect(parentGithubGraphMode("feature-tree")).toBe("partition");
    expect(parentGithubGraphMode("git-history")).toBe("feature-tree");
  });

  it("toggles expanded features and clears stale selection", () => {
    let state = DEFAULT_GITHUB_GRAPH_NAV;
    state = reduceGithubGraphNav(state, {
      type: "toggle-feature-expanded",
      id: "feat:a",
    });
    state = reduceGithubGraphNav(state, {
      type: "focus-feature",
      id: "feat:a",
    });
    state = reduceGithubGraphNav(state, { type: "select-commit", sha: "a".repeat(40) });
    state = reduceGithubGraphNav(state, { type: "clear-stale-selection" });
    expect(state.expandedFeatureIds).toEqual(["feat:a"]);
    expect(state.focusedFeatureId).toBeNull();
    expect(state.selectedCommitSha).toBeNull();
  });
});
