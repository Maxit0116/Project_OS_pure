import { describe, expect, it } from "vitest";

import {
  LocalContextBundleSchema,
  GlobalContextBundleSchema,
  NodeContextBundleSchema,
  canonicalizeLocalContextBundle,
  type LocalContextBundle,
  type NodeContextBundle,
} from "./local-context.js";

const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;

describe("LocalContextBundleSchema", () => {
  it("accepts a zero-write global context and binds its hashes", () => {
    const bundle = {
      version: "0.1.0",
      projectId: "project_test",
      assembledAt: "2026-07-19T00:00:00.000Z",
      scope: { kind: "global" },
      responseLanguage: "en",
      projectName: "Project Test",
      conciseDescription: "A concise project description.",
      descriptionSource: "user",
      analyzedAt: "2026-07-19T00:00:00.000Z",
      topLevelNodes: [{
        id: "system_test",
        name: "Test system",
        summary: "Top-level product context",
        level: "context",
        childCount: 2,
      }],
      contextHash: SHA_A,
      bundleHash: SHA_A,
      allowedReadPaths: [],
      allowedWritePaths: [],
    };
    expect(GlobalContextBundleSchema.safeParse(bundle).success).toBe(true);
    expect(GlobalContextBundleSchema.safeParse({
      ...bundle,
      bundleHash: SHA_B,
    }).success).toBe(false);
    expect(GlobalContextBundleSchema.safeParse({
      ...bundle,
      allowedWritePaths: ["src/not-allowed.ts"],
    }).success).toBe(false);
  });

  it("accepts a structurally consistent bundle", () => {
    expect(LocalContextBundleSchema.safeParse(createBundle()).success).toBe(true);
  });

  it.each([
    ["requires exactly one selected entry", (bundle: LocalContextBundle) => {
      bundle.fileManifest[1]!.relationship = "selected";
    }],
    ["requires the selected entry to be exact", (bundle: LocalContextBundle) => {
      bundle.fileManifest[0] = {
        ...bundle.fileManifest[0]!,
        disposition: "omitted",
        includedByteLength: 0,
        omissionReason: "read_failed",
        content: undefined,
        sha256: undefined,
        byteLength: undefined,
      };
    }],
    ["binds the selected manifest path to scope", (bundle: LocalContextBundle) => {
      bundle.scope.selectedFilePath = "src/other.ts";
    }],
    ["binds the only write path to the selected file", (bundle: LocalContextBundle) => {
      bundle.allowedWritePaths = ["src/other.ts"];
    }],
    ["derives read paths from included entries", (bundle: LocalContextBundle) => {
      bundle.allowedReadPaths = ["src/selected.ts"];
    }],
    ["requires content on included entries", (bundle: LocalContextBundle) => {
      bundle.fileManifest[1]!.content = undefined;
    }],
    ["requires complete-content hashes on included entries", (bundle: LocalContextBundle) => {
      bundle.fileManifest[1]!.sha256 = undefined;
    }],
    ["requires omission reasons on omitted entries", (bundle: LocalContextBundle) => {
      bundle.fileManifest[2]!.omissionReason = undefined;
    }],
    ["forbids content on omitted entries", (bundle: LocalContextBundle) => {
      bundle.fileManifest[2]!.content = "hidden";
    }],
    ["requires accurate truncation accounting", (bundle: LocalContextBundle) => {
      bundle.fileManifest[1]!.truncation!.omittedByteLength = 2;
    }],
  ])("%s", (_name, mutate) => {
    const bundle = createBundle();
    mutate(bundle);
    expect(LocalContextBundleSchema.safeParse(bundle).success).toBe(false);
  });

  it("validates hash format without performing Node-only hashing", () => {
    const bundle = createBundle();
    bundle.bundleHash = "not-a-sha";
    expect(LocalContextBundleSchema.safeParse(bundle).success).toBe(false);
  });

  it.each([
    ["rejects a self-parent", (bundle: LocalContextBundle) => {
      bundle.neighborhood.parent = bundle.neighborhood.selected;
    }],
    ["rejects a self-child", (bundle: LocalContextBundle) => {
      bundle.neighborhood.children = [bundle.neighborhood.selected];
      bundle.neighborhood.childrenCoverage = {
        totalCount: 1,
        includedCount: 1,
        omittedCount: 0,
        estimatedTokensIncluded: 1,
      };
    }],
    ["rejects duplicate children", (bundle: LocalContextBundle) => {
      const child = {
        id: "node_child",
        name: "Child",
        summary: "Child capability",
        status: "active" as const,
      };
      bundle.neighborhood.children = [child, child];
      bundle.neighborhood.childrenCoverage = {
        totalCount: 2,
        includedCount: 2,
        omittedCount: 0,
        estimatedTokensIncluded: 2,
      };
    }],
    ["rejects an included-count mismatch", (bundle: LocalContextBundle) => {
      bundle.neighborhood.childrenCoverage.includedCount = 1;
      bundle.neighborhood.childrenCoverage.totalCount = 1;
    }],
    ["rejects a total-count mismatch", (bundle: LocalContextBundle) => {
      bundle.neighborhood.childrenCoverage.omittedCount = 1;
    }],
  ])("%s", (_name, mutate) => {
    const bundle = createBundle();
    mutate(bundle);
    expect(LocalContextBundleSchema.safeParse(bundle).success).toBe(false);
  });
});

describe("NodeContextBundleSchema", () => {
  it("accepts read-only node context and rejects selected-file/write semantics", () => {
    const bundle = createNodeBundle();
    expect(NodeContextBundleSchema.safeParse(bundle).success).toBe(true);

    const selected = structuredClone(bundle);
    selected.fileManifest[0]!.relationship = "selected";
    expect(NodeContextBundleSchema.safeParse(selected).success).toBe(false);

    const writable = structuredClone(bundle) as NodeContextBundle & {
      allowedWritePaths: string[];
    };
    writable.allowedWritePaths = ["src/connected.ts"];
    expect(NodeContextBundleSchema.safeParse(writable).success).toBe(false);
  });
});

describe("canonicalizeLocalContextBundle", () => {
  it("sorts object keys deterministically and excludes only the root bundleHash", () => {
    const bundle = createBundle();
    const reordered = Object.fromEntries(
      Object.entries(bundle).reverse(),
    ) as unknown as LocalContextBundle;

    expect(canonicalizeLocalContextBundle(reordered)).toBe(
      canonicalizeLocalContextBundle(bundle),
    );
    expect(canonicalizeLocalContextBundle(bundle)).not.toContain(bundle.bundleHash);
  });

  it("includes parent, children, and child coverage in canonical content", () => {
    const bundle = createBundle();
    bundle.neighborhood.parent = {
      id: "node_parent",
      name: "Parent",
      summary: "Parent capability",
      status: "active",
    };
    bundle.neighborhood.children = [{
      id: "node_child",
      name: "Child",
      summary: "Child capability",
      status: "active",
    }];
    bundle.neighborhood.childrenCoverage = {
      totalCount: 2,
      includedCount: 1,
      omittedCount: 1,
      estimatedTokensIncluded: 12,
    };

    const canonical = canonicalizeLocalContextBundle(bundle);
    expect(canonical).toContain("node_parent");
    expect(canonical).toContain("node_child");
    expect(canonical).toContain('"omittedCount":1');
  });
});

function createBundle(): LocalContextBundle {
  return {
    version: "0.2.0",
    projectId: "project_test",
    assembledAt: "2026-07-18T00:00:00.000Z",
    scope: {
      nodeId: "node_selected",
      selectedFilePath: "src/selected.ts",
    },
    responseLanguage: "en",
    project: {
      displayName: "Context Test",
      framework: "node",
      description: {
        content: "Context Test project.",
        source: "derived",
        estimatedTokens: 6,
      },
      synopsis: "A deterministic project synopsis.",
      synopsisSource: "derived_project_graph",
      graphAnalyzedAt: "2026-07-17T00:00:00.000Z",
      graphAnalysisStatus: "complete",
      synopsisOmittedNodeCount: 0,
    },
    neighborhood: {
      selected: {
        id: "node_selected",
        name: "Selected",
        summary: "Selected capability",
        status: "active",
      },
      parent: null,
      children: [],
      childrenCoverage: {
        totalCount: 0,
        includedCount: 0,
        omittedCount: 0,
        estimatedTokensIncluded: 0,
      },
      upstream: [],
      downstream: [],
      unresolvedNodeIds: [],
    },
    fileManifest: [
      {
        path: "src/selected.ts",
        relationship: "selected",
        linkedRole: "primary",
        disposition: "exact",
        byteLength: 4,
        sha256: SHA_A,
        includedByteLength: 4,
        content: "main",
      },
      {
        path: "src/connected.ts",
        relationship: "connected",
        linkedRole: "supporting",
        disposition: "truncated",
        byteLength: 8,
        sha256: SHA_B,
        includedByteLength: 4,
        content: "part",
        truncation: {
          strategy: "utf8_prefix",
          omittedByteLength: 4,
        },
      },
      {
        path: "src/ignored.ts",
        relationship: "connected",
        linkedRole: "test",
        disposition: "omitted",
        includedByteLength: 0,
        omissionReason: "ignored",
      },
    ],
    allowedReadPaths: ["src/selected.ts", "src/connected.ts"],
    allowedWritePaths: ["src/selected.ts"],
    budget: {
      estimator: "unicode_chars_div_4_v1",
      descriptionEstimatedTokens: 6,
      selectedEstimatedTokens: 1,
      connectedTokenLimit: 8_000,
      connectedEstimatedTokensIncluded: 1,
      connectedFileLimit: 8,
    },
    bundleHash: `sha256:${"0".repeat(64)}`,
  };
}

function createNodeBundle(): NodeContextBundle {
  const fileBundle = createBundle();
  return {
    ...fileBundle,
    scope: { kind: "node", nodeId: "node_selected" },
    fileManifest: fileBundle.fileManifest.slice(1),
    allowedReadPaths: ["src/connected.ts"],
    allowedWritePaths: [],
    budget: {
      ...fileBundle.budget,
      selectedEstimatedTokens: 0,
    },
  };
}
