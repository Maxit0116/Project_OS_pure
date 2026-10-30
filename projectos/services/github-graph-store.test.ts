import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  deleteGithubGraphFeature,
  loadGithubGraphStore,
  upsertGithubGraphFeature,
  upsertGithubGraphRelation,
} from "./github-graph-store.js";

describe("github-graph-store", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "pos-gh-store-"));
    roots.push(root);
    return root;
  }

  it("returns empty document when missing", () => {
    const root = tempRoot();
    const doc = loadGithubGraphStore(root);
    expect(doc.features).toEqual([]);
    expect(doc.relations).toEqual([]);
    expect(doc.version).toBe("0.1.0");
  });

  it("persists features and relations across reload", () => {
    const root = tempRoot();
    upsertGithubGraphFeature(root, {
      id: "feat:auth",
      title: "Auth",
      status: "active",
    });
    upsertGithubGraphRelation(root, {
      id: "rel:1",
      kind: "feature-implemented-by",
      fromType: "feature",
      fromKey: "feat:auth",
      toType: "branch",
      toKey: "alice/auth",
      source: "user",
      stale: false,
    });

    const reloaded = loadGithubGraphStore(root);
    expect(reloaded.features).toHaveLength(1);
    expect(reloaded.features[0]?.title).toBe("Auth");
    expect(reloaded.relations).toHaveLength(1);
    expect(reloaded.updatedAt).toBeTruthy();
  });

  it("deletes feature and its feature-linked relations", () => {
    const root = tempRoot();
    upsertGithubGraphFeature(root, {
      id: "feat:auth",
      title: "Auth",
      status: "planned",
    });
    upsertGithubGraphRelation(root, {
      id: "rel:1",
      kind: "feature-implemented-by",
      fromType: "feature",
      fromKey: "feat:auth",
      toType: "branch",
      toKey: "alice/auth",
      source: "user",
      stale: false,
    });
    upsertGithubGraphRelation(root, {
      id: "rel:cp",
      kind: "commit-parent",
      fromType: "commit",
      fromKey: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      toType: "commit",
      toKey: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      source: "git",
      stale: false,
    });

    const next = deleteGithubGraphFeature(root, "feat:auth");
    expect(next.features).toHaveLength(0);
    expect(next.relations.map((rel) => rel.id)).toEqual(["rel:cp"]);
  });
});
