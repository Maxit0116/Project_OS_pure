import {
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  checkFixtures,
  createDefaultFixtureLayout,
  discoverManagedFixtureInventoryForTest,
  FixtureReconcilerError,
  scaffoldFixtures,
  syncFixtureMirrors,
  type FixtureLayout,
} from "./sample-fixture-reconciler.js";
import {
  ProjectGraphSchema,
  type ProjectGraph,
} from "../contracts/graph.js";
import {
  SemanticTreeSchema,
  type SemanticTree,
} from "../contracts/semantic-tree.js";

const disposableRoots: string[] = [];

afterEach(() => {
  for (const root of disposableRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("sample fixture reconciler", () => {
  it("checks the real checked-in fixture layout used by the repository gate", () => {
    const layout = createDefaultFixtureLayout(resolve("."));

    expect(checkFixtures(layout)).toMatchObject({
      ok: true,
      issues: [],
      indexedFileCount: 100,
      graphNodeCount: 23,
      mirrorCount: 1,
    });
  });

  it("accepts the authoritative fixture without normalizing inherited satellites", () => {
    const layout = createSandbox();

    expect(checkFixtures(layout)).toMatchObject({
      ok: true,
      issues: [],
      indexedFileCount: 100,
      graphNodeCount: 23,
      mirrorCount: 1,
    });
  });

  it("requires graph and semantic tree to describe the same project", () => {
    const layout = createSandbox();
    updateSemanticTree(layout, (tree) => {
      tree.projectId = "other-project";
    });
    copyAuthoritativeToMirrors(layout);

    expect(checkFixtures(layout).issues).toContainEqual(
      expect.objectContaining({
        code: "fixture_reference_invalid",
        path: "semantic-tree.json:projectId",
        message: expect.stringContaining(
          "Semantic tree project 'other-project' does not match graph project",
        ),
      }),
    );
  });

  it("detects byte drift and syncs only the explicit raw-byte mirror targets", () => {
    const layout = createSandbox();
    const mirrorGraphPath = join(layout.mirrorRoots[0]!, "graph.json");
    const authoritativeGraphPath = join(
      layout.authoritativeRoot,
      "graph.json",
    );
    writeFileSync(mirrorGraphPath, "{}\n", "utf8");

    expect(checkFixtures(layout).issues).toContainEqual(
      expect.objectContaining({
        code: "mirror_drift",
        path: "client/sample-projectos-fixtures/graph.json",
      }),
    );

    const result = syncFixtureMirrors(layout);

    expect(result.copied).toEqual([
      "client/sample-projectos-fixtures/graph.json",
    ]);
    expect(result.unchanged).toEqual([
      "client/sample-projectos-fixtures/semantic-tree.json",
    ]);
    expect(Array.from(readBytes(mirrorGraphPath))).toEqual(
      Array.from(readBytes(authoritativeGraphPath)),
    );
    expect(result.report.ok).toBe(true);
  });

  it("refuses mirror targets outside the projectos package", () => {
    const layout = createSandbox();

    expect(() => syncFixtureMirrors({
      ...layout,
      mirrorRoots: [join(layout.projectOSRoot, "..", "outside-mirror")],
    })).toThrow("must be a child of the projectos package");
  });

  it("refuses any alternate authority even when it is contained in the workspace", () => {
    const layout = createSandbox();
    const alternateRoot = join(layout.workspaceRoot, ".projectos-alternate");
    mkdirSync(alternateRoot, { recursive: true });
    for (const fixtureName of ["graph.json", "semantic-tree.json"]) {
      cpSync(
        join(layout.authoritativeRoot, fixtureName),
        join(alternateRoot, fixtureName),
      );
    }
    const alternateLayout = {
      ...layout,
      authoritativeRoot: alternateRoot,
    };
    updateGraph(alternateLayout, (graph) => {
      graph.edges[0]!.target = "missing_node";
    });

    expect(checkFixtures(alternateLayout).issues).toContainEqual(
      expect.objectContaining({
        code: "fixture_read_failed",
        message: expect.stringContaining(
          "Authoritative fixture root must be exactly",
        ),
      }),
    );
    expect(() => syncFixtureMirrors(alternateLayout)).toThrow(
      "Refusing to sync invalid authoritative fixtures",
    );
  });

  it("preflights every mirror before changing an earlier drifted target", () => {
    const layout = createSandbox();
    const firstMirrorGraph = join(layout.mirrorRoots[0]!, "graph.json");
    writeFileSync(firstMirrorGraph, "{}\n", "utf8");
    const driftedBytes = readBytes(firstMirrorGraph);

    expect(() => syncFixtureMirrors({
      ...layout,
      mirrorRoots: [
        layout.mirrorRoots[0]!,
        join(layout.projectOSRoot, "..", "outside-mirror"),
      ],
    })).toThrow("must be a child of the projectos package");
    expect(Array.from(readBytes(firstMirrorGraph))).toEqual(
      Array.from(driftedBytes),
    );
  });

  it("rejects symlinks in authoritative and mirror fixture paths", () => {
    const authoritativeLayout = createSandbox();
    const graphPath = join(
      authoritativeLayout.authoritativeRoot,
      "graph.json",
    );
    const graphBackingPath = join(
      authoritativeLayout.authoritativeRoot,
      "graph.backing.json",
    );
    cpSync(graphPath, graphBackingPath);
    unlinkSync(graphPath);
    symlinkSync("graph.backing.json", graphPath);

    expect(checkFixtures(authoritativeLayout).issues).toContainEqual(
      expect.objectContaining({
        code: "fixture_read_failed",
        path: ".projectos",
      }),
    );
    expect(() => syncFixtureMirrors(authoritativeLayout)).toThrow(
      FixtureReconcilerError,
    );

    const targetLayout = createSandbox();
    const mirrorGraphPath = join(targetLayout.mirrorRoots[0]!, "graph.json");
    unlinkSync(mirrorGraphPath);
    symlinkSync(
      join(targetLayout.authoritativeRoot, "graph.json"),
      mirrorGraphPath,
    );
    expect(checkFixtures(targetLayout).issues).toContainEqual(
      expect.objectContaining({
        code: "mirror_drift",
        path: "client/sample-projectos-fixtures/graph.json",
      }),
    );
    expect(() => syncFixtureMirrors(targetLayout)).toThrow(
      "may not traverse a symbolic link",
    );

    const directoryLayout = createSandbox();
    const mirrorRoot = directoryLayout.mirrorRoots[0]!;
    const backingRoot = join(directoryLayout.projectOSRoot, "mirror-backing");
    rmSync(mirrorRoot, { recursive: true, force: true });
    mkdirSync(backingRoot, { recursive: true });
    symlinkSync(backingRoot, mirrorRoot, "dir");
    expect(() => syncFixtureMirrors(directoryLayout)).toThrow(
      "may not traverse a symbolic link",
    );
  });

  it("rejects hard-linked authority and mirror aliases", () => {
    const authorityAliasLayout = createSandbox();
    const authorityGraph = join(
      authorityAliasLayout.authoritativeRoot,
      "graph.json",
    );
    const mirrorGraph = join(
      authorityAliasLayout.mirrorRoots[0]!,
      "graph.json",
    );
    unlinkSync(mirrorGraph);
    linkSync(authorityGraph, mirrorGraph);

    expect(checkFixtures(authorityAliasLayout).issues).toContainEqual(
      expect.objectContaining({
        code: "fixture_read_failed",
        message: expect.stringContaining("single-link regular file"),
      }),
    );
    expect(() => syncFixtureMirrors(authorityAliasLayout)).toThrow(
      "Refusing to sync invalid authoritative fixtures",
    );

    const mirrorAliasLayout = createSandbox();
    const secondMirror = join(
      mirrorAliasLayout.projectOSRoot,
      "client",
      "second-fixture-mirror",
    );
    mkdirSync(secondMirror, { recursive: true });
    cpSync(
      join(mirrorAliasLayout.authoritativeRoot, "semantic-tree.json"),
      join(secondMirror, "semantic-tree.json"),
    );
    linkSync(
      join(mirrorAliasLayout.mirrorRoots[0]!, "graph.json"),
      join(secondMirror, "graph.json"),
    );
    const twoMirrorLayout = {
      ...mirrorAliasLayout,
      mirrorRoots: [mirrorAliasLayout.mirrorRoots[0]!, secondMirror],
    };

    expect(checkFixtures(twoMirrorLayout).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "mirror_drift",
          message: expect.stringContaining("single-link regular file"),
        }),
      ]),
    );
    expect(() => syncFixtureMirrors(twoMirrorLayout)).toThrow(
      "single-link regular file",
    );
  });

  it("rejects a configured package root with a symbolic-link ancestor", () => {
    const layout = createSandbox();
    const sandboxRoot = dirname(layout.projectOSRoot);
    const aliasedSandboxRoot = `${sandboxRoot}-alias`;
    symlinkSync(sandboxRoot, aliasedSandboxRoot, "dir");
    const aliasedProjectOSRoot = join(aliasedSandboxRoot, "projectos");

    expect(() => syncFixtureMirrors({
      ...layout,
      projectOSRoot: aliasedProjectOSRoot,
      mirrorRoots: [
        join(aliasedProjectOSRoot, "client", "sample-projectos-fixtures"),
      ],
    })).toThrow("symbolic-link ancestor");
  });

  it("rolls back an earlier write after a deterministic later write fault", () => {
    const layout = createSandbox();
    const secondMirror = join(
      layout.projectOSRoot,
      "client",
      "second-fixture-mirror",
    );
    mkdirSync(secondMirror, { recursive: true });
    for (const fixtureName of ["graph.json", "semantic-tree.json"]) {
      cpSync(
        join(layout.authoritativeRoot, fixtureName),
        join(secondMirror, fixtureName),
      );
    }
    const firstGraph = join(layout.mirrorRoots[0]!, "graph.json");
    const secondGraph = join(secondMirror, "graph.json");
    writeFileSync(firstGraph, "{\"first\":true}\n", "utf8");
    writeFileSync(secondGraph, "{\"second\":true}\n", "utf8");
    const firstBefore = readBytes(firstGraph);
    const secondBefore = readBytes(secondGraph);

    expect(() => syncFixtureMirrors({
      ...layout,
      mirrorRoots: [layout.mirrorRoots[0]!, secondMirror],
    }, {
      beforeWriteForTest: ({ writeIndex }) => {
        if (writeIndex === 1) throw new Error("injected second-write fault");
      },
    })).toThrow("injected second-write fault");
    expect(Array.from(readBytes(firstGraph))).toEqual(Array.from(firstBefore));
    expect(Array.from(readBytes(secondGraph))).toEqual(Array.from(secondBefore));
  });

  it("records a successful rename before fallible post-rename verification", () => {
    const layout = createSandbox();
    const mirrorGraph = join(layout.mirrorRoots[0]!, "graph.json");
    writeFileSync(mirrorGraph, "{\"before\":true}\n", "utf8");
    const beforeBytes = readBytes(mirrorGraph);

    expect(() => syncFixtureMirrors(layout, {
      afterRenameBeforeVerificationForTest: ({ writeIndex }) => {
        if (writeIndex === 0) {
          throw new Error("injected post-rename verification fault");
        }
      },
    })).toThrow("injected post-rename verification fault");
    expect(Array.from(readBytes(mirrorGraph))).toEqual(
      Array.from(beforeBytes),
    );
  });

  it("detects a mirror parent swap before writing outside the package", () => {
    const layout = createSandbox();
    const mirrorRoot = layout.mirrorRoots[0]!;
    const displacedRoot = `${mirrorRoot}-displaced`;
    const outsideRoot = join(dirname(layout.projectOSRoot), "outside-target");
    mkdirSync(outsideRoot, { recursive: true });
    writeFileSync(join(mirrorRoot, "graph.json"), "{}\n", "utf8");

    expect(() => syncFixtureMirrors(layout, {
      beforeWriteForTest: ({ writeIndex }) => {
        if (writeIndex !== 0) return;
        renameSync(mirrorRoot, displacedRoot);
        symlinkSync(outsideRoot, mirrorRoot, "dir");
      },
    })).toThrow(
      /canonical non-symlink directory|disappeared after sync preflight/u,
    );
    expect(existsSync(join(outsideRoot, "graph.json"))).toBe(false);
  });

  it("pins target identity before writing and preserves a same-byte replacement", () => {
    const layout = createSandbox();
    const mirrorGraph = join(layout.mirrorRoots[0]!, "graph.json");
    writeFileSync(mirrorGraph, "{\"drifted\":true}\n", "utf8");
    const replacementBytes = readBytes(mirrorGraph);

    expect(() => syncFixtureMirrors(layout, {
      beforeWriteForTest: ({ writeIndex }) => {
        if (writeIndex !== 0) return;
        const replacement = `${mirrorGraph}.replacement`;
        writeFileSync(replacement, replacementBytes);
        renameSync(replacement, mirrorGraph);
      },
    })).toThrow("changed identity after sync preflight");
    expect(Array.from(readBytes(mirrorGraph))).toEqual(
      Array.from(replacementBytes),
    );
  });

  it("refuses rollback across a same-byte inode swap", () => {
    const layout = createSandbox();
    const secondMirror = join(
      layout.projectOSRoot,
      "client",
      "second-fixture-mirror",
    );
    mkdirSync(secondMirror, { recursive: true });
    for (const fixtureName of ["graph.json", "semantic-tree.json"]) {
      cpSync(
        join(layout.authoritativeRoot, fixtureName),
        join(secondMirror, fixtureName),
      );
    }
    const firstGraph = join(layout.mirrorRoots[0]!, "graph.json");
    const secondGraph = join(secondMirror, "graph.json");
    writeFileSync(firstGraph, "{\"first\":true}\n", "utf8");
    writeFileSync(secondGraph, "{\"second\":true}\n", "utf8");
    const sourceBytes = readBytes(
      join(layout.authoritativeRoot, "graph.json"),
    );

    expect(() => syncFixtureMirrors({
      ...layout,
      mirrorRoots: [layout.mirrorRoots[0]!, secondMirror],
    }, {
      beforeWriteForTest: ({ writeIndex }) => {
        if (writeIndex !== 1) return;
        const replacement = `${firstGraph}.replacement`;
        writeFileSync(replacement, readBytes(firstGraph));
        renameSync(replacement, firstGraph);
        throw new Error("injected post-swap fault");
      },
    })).toThrow("rollback was incomplete");
    expect(Array.from(readBytes(firstGraph))).toEqual(
      Array.from(sourceBytes),
    );
    expect(readFileSync(secondGraph, "utf8")).toBe(
      "{\"second\":true}\n",
    );
  });

  it("fails when a new managed source is not indexed", () => {
    const layout = createSandbox();
    writeWorkspaceFile(
      layout,
      "components/Unindexed.tsx",
      "export function Unindexed() { return null }\n",
    );

    expect(checkFixtures(layout).issues).toContainEqual({
      code: "managed_file_unindexed",
      path: "components/Unindexed.tsx",
      message:
        "Managed source/config/migration file is missing from graph.fileIndex",
    });
  });

  it("fails when an indexed managed source disappears", () => {
    const layout = createSandbox();
    updateGraph(layout, (graph) => {
      graph.fileIndex.push({
        path: "components/Missing.tsx",
        type: "component",
        nodeIds: [],
        imports: [],
        exports: [],
      });
    });
    copyAuthoritativeToMirrors(layout);

    expect(checkFixtures(layout).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "indexed_file_missing",
          path: "components/Missing.tsx",
        }),
        expect.objectContaining({
          code: "indexed_file_unmanaged",
          path: "components/Missing.tsx",
        }),
      ]),
    );
  });

  it("requires new managed files on fileIndex, linkedFiles, and semantic tree", () => {
    const layout = createSandbox();
    writeWorkspaceFile(
      layout,
      "components/Orphan.tsx",
      "export function Orphan() { return null }\n",
    );
    updateGraph(layout, (graph) => {
      graph.fileIndex.push({
        path: "components/Orphan.tsx",
        type: "component",
        nodeIds: ["feat_dashboard"],
        imports: [],
        exports: ["Orphan"],
      });
    });
    copyAuthoritativeToMirrors(layout);

    const issues = checkFixtures(layout).issues;

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ownership_incomplete",
          path: "components/Orphan.tsx",
          message: "Managed file is missing a graph linkedFiles owner",
        }),
        expect.objectContaining({
          code: "ownership_incomplete",
          path: "components/Orphan.tsx",
          message: "Managed file is missing a semantic-tree leaf owner",
        }),
      ]),
    );
  });

  it("allows reviewed supporting links while keeping one indexed and semantic primary owner", () => {
    const layout = createSandbox();
    writeWorkspaceFile(
      layout,
      "lib/shared-projects.ts",
      "export function listSharedProjects() { return [] }\n",
    );
    const candidate = scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "lib/shared-projects.ts",
        role: "supporting",
      }],
    }, layout);
    updateGraph(layout, (graph) => {
      graph.fileIndex.push(...candidate.fileIndex);
      graph.nodes
        .find((node) => node.id === "feat_dashboard")!
        .linkedFiles.push({
          ...candidate.linkedFiles[0]!,
          summary: "为仪表盘提供共享项目查询。",
        });
      graph.nodes
        .find((node) => node.id === "feat_profile")!
        .linkedFiles.push({
          path: "lib/shared-projects.ts",
          role: "supporting",
          summary: "在个人资料功能中复用共享项目查询。",
        });
    });
    updateSemanticTree(layout, (tree) => {
      findTreeNode(tree.roots, "tree_feat_dashboard")!
        .children.push(...candidate.semanticChildren);
    });
    copyAuthoritativeToMirrors(layout);

    expect(checkFixtures(layout)).toMatchObject({
      ok: true,
      issues: [],
    });
  });

  it("detects parsed local import drift outside the named legacy debt set", () => {
    const layout = createSandbox();
    const statsPath = join(layout.workspaceRoot, "components/StatsCard.tsx");
    const source = readFileSync(statsPath, "utf8");
    writeFileSync(
      statsPath,
      source.replace(
        "import styles from './StatsCard.module.css'\n",
        [
          "import styles from './StatsCard.module.css'",
          "import { cn } from '@/lib/utils'",
          "",
        ].join("\n"),
      ),
      "utf8",
    );

    expect(checkFixtures(layout).issues).toContainEqual(
      expect.objectContaining({
        code: "source_facts_drift",
        path: "components/StatsCard.tsx",
      }),
    );
  });

  it("keeps the graduated dashboard data module source facts exact", () => {
    const layout = createSandbox();
    const dataPath = join(layout.workspaceRoot, "lib/data.ts");
    const source = readFileSync(dataPath, "utf8");
    writeFileSync(
      dataPath,
      `import { cn } from "@/lib/utils"\n${source}`,
      "utf8",
    );

    expect(checkFixtures(layout).issues).toContainEqual(
      expect.objectContaining({
        code: "source_facts_drift",
        path: "lib/data.ts",
        message: expect.stringContaining(
          "Stored imports/exports differ from parsed source facts",
        ),
      }),
    );
  });

  it("rejects local imports that resolve outside the managed fixture universe", () => {
    const committedLayout = createSandbox();
    writeWorkspaceFile(
      committedLayout,
      "components/copy.json",
      "{\"label\":\"copy\"}\n",
    );
    const statsPath = join(
      committedLayout.workspaceRoot,
      "components/StatsCard.tsx",
    );
    writeFileSync(
      statsPath,
      [
        "import copy from './copy.json'",
        readFileSync(statsPath, "utf8"),
      ].join("\n"),
      "utf8",
    );
    updateGraph(committedLayout, (graph) => {
      graph.fileIndex
        .find((file) => file.path === "components/StatsCard.tsx")!
        .imports.push("components/copy.json");
    });
    copyAuthoritativeToMirrors(committedLayout);

    expect(checkFixtures(committedLayout).issues).toContainEqual(
      expect.objectContaining({
        code: "source_facts_drift",
        path: "components/StatsCard.tsx",
        message: expect.stringContaining("unmanaged path"),
      }),
    );

    const scaffoldLayout = createSandbox();
    writeWorkspaceFile(
      scaffoldLayout,
      "components/copy.json",
      "{\"label\":\"copy\"}\n",
    );
    writeWorkspaceFile(
      scaffoldLayout,
      "components/NewJsonConsumer.tsx",
      [
        "import copy from './copy.json'",
        "export default function NewJsonConsumer() { return <p>{copy.label}</p> }",
        "",
      ].join("\n"),
    );
    expect(() => scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "components/NewJsonConsumer.tsx",
        role: "supporting",
      }],
    }, scaffoldLayout)).toThrow("resolves to unmanaged path");
  });

  it("rejects committed and scaffold imports resolved inside skipped directories", () => {
    const committedLayout = createSandbox();
    writeWorkspaceFile(
      committedLayout,
      ".next/generated.ts",
      "export const generated = true\n",
    );
    const statsPath = join(
      committedLayout.workspaceRoot,
      "components/StatsCard.tsx",
    );
    writeFileSync(
      statsPath,
      [
        "import { generated } from '../.next/generated'",
        readFileSync(statsPath, "utf8"),
      ].join("\n"),
      "utf8",
    );
    expect(checkFixtures(committedLayout).issues).toContainEqual(
      expect.objectContaining({
        code: "source_facts_drift",
        path: "components/StatsCard.tsx",
        message: expect.stringContaining("unmanaged path"),
      }),
    );

    const scaffoldLayout = createSandbox();
    writeWorkspaceFile(
      scaffoldLayout,
      ".next/generated.ts",
      "export const generated = true\n",
    );
    writeWorkspaceFile(
      scaffoldLayout,
      "components/HiddenConsumer.tsx",
      [
        "import { generated } from '../.next/generated'",
        "export default function HiddenConsumer() { return <p>{String(generated)}</p> }",
        "",
      ].join("\n"),
    );
    expect(() => scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "components/HiddenConsumer.tsx",
        role: "supporting",
      }],
    }, scaffoldLayout)).toThrow("resolves to unmanaged path");
  });

  it("treats case aliases of generated and dependency directories as skipped", () => {
    const layout = createSandbox();
    writeWorkspaceFile(
      layout,
      ".NEXT/generated.ts",
      "export const generated = true\n",
    );
    writeWorkspaceFile(
      layout,
      "NODE_MODULES/local.ts",
      "export const dependency = true\n",
    );
    const inventory = discoverManagedFixtureInventoryForTest(
      layout.workspaceRoot,
    );
    expect(inventory.paths).not.toContain(".NEXT/generated.ts");
    expect(inventory.paths).not.toContain("NODE_MODULES/local.ts");

    const statsPath = join(
      layout.workspaceRoot,
      "components/StatsCard.tsx",
    );
    writeFileSync(
      statsPath,
      [
        "import { generated } from '../.NEXT/generated'",
        readFileSync(statsPath, "utf8"),
      ].join("\n"),
      "utf8",
    );
    expect(checkFixtures(layout).issues).toContainEqual(
      expect.objectContaining({
        code: "source_facts_drift",
        path: "components/StatsCard.tsx",
        message: expect.stringContaining("unmanaged path"),
      }),
    );

    const targetLayout = createSandbox();
    expect(() => scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: ".NEXT/generated.ts",
        role: "supporting",
      }],
    }, targetLayout)).toThrow("outside the managed fixture universe");
  });

  it("rejects duplicate node, import, and export facts before set comparison", () => {
    const ownerLayout = createSandbox();
    updateGraph(ownerLayout, (graph) => {
      graph.fileIndex
        .find((file) => file.path === "components/StatsCard.tsx")!
        .nodeIds.push("feat_dashboard");
    });
    copyAuthoritativeToMirrors(ownerLayout);
    expect(checkFixtures(ownerLayout).issues).toContainEqual({
      code: "ownership_drift",
      path: "components/StatsCard.tsx",
      message: "fileIndex.nodeIds must be a duplicate-free deterministic array",
    });

    const factLayout = createSandbox();
    updateGraph(factLayout, (graph) => {
      const statsCard = graph.fileIndex.find((file) =>
        file.path === "components/StatsCard.tsx")!;
      statsCard.imports.push("components/StatsCard.module.css");
      statsCard.exports.push("default");
    });
    copyAuthoritativeToMirrors(factLayout);
    expect(checkFixtures(factLayout).issues).toContainEqual({
      code: "source_facts_drift",
      path: "components/StatsCard.tsx",
      message:
        "Stored imports and exports must be duplicate-free deterministic arrays",
    });
  });

  it("reports an invalid tsconfig as source-fact drift without crashing", () => {
    const layout = createSandbox();
    writeFileSync(
      join(layout.workspaceRoot, "tsconfig.json"),
      "{ invalid json }\n",
      "utf8",
    );

    expect(checkFixtures(layout).issues).toContainEqual(
      expect.objectContaining({
        code: "source_facts_drift",
        path: "tsconfig.json",
      }),
    );
  });

  it("emits a deterministic read-only scaffold from explicit curated owners", () => {
    const layout = createSandbox();
    writeWorkspaceFile(
      layout,
      "components/NewCard.module.css",
      ".card { padding: 1rem; }\n",
    );
    writeWorkspaceFile(
      layout,
      "components/NewCard.tsx",
      [
        "import styles from './NewCard.module.css'",
        "import { cn } from '@/lib/utils'",
        "",
        "export default function NewCard() {",
        "  return <div className={cn(styles.card)}>New</div>",
        "}",
        "",
      ].join("\n"),
    );
    const sandboxBefore = snapshotRegularFileBytes(
      dirname(layout.projectOSRoot),
    );
    const request = {
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [
        {
          path: "components/NewCard.tsx",
          role: "supporting" as const,
        },
        {
          path: "components/NewCard.module.css",
          role: "supporting" as const,
        },
      ],
    };

    const first = scaffoldFixtures(request, layout);
    const second = scaffoldFixtures(request, layout);

    expect(second).toEqual(first);
    expect(first.fileIndex).toEqual([
      {
        path: "components/NewCard.module.css",
        type: "style",
        nodeIds: ["feat_dashboard"],
        imports: [],
        exports: [],
      },
      {
        path: "components/NewCard.tsx",
        type: "component",
        nodeIds: ["feat_dashboard"],
        imports: [
          "components/NewCard.module.css",
          "lib/utils.ts",
        ],
        exports: ["default"],
      },
    ]);
    expect(first.semanticChildren.map((node) => node.id)).toEqual([
      expect.stringMatching(
        /^tree_file_components_newcard_module_css_[a-f0-9]{10}$/u,
      ),
      expect.stringMatching(
        /^tree_file_components_newcard_tsx_[a-f0-9]{10}$/u,
      ),
    ]);
    expect(first.observedLocalImports).toEqual([
      {
        specifier: "./NewCard.module.css",
        resolvedPath: "components/NewCard.module.css",
        line: 1,
      },
      {
        specifier: "@/lib/utils",
        resolvedPath: "lib/utils.ts",
        line: 2,
      },
    ]);
    expect(first.linkedFiles.every((file) =>
      file.summary.includes("待人工"))).toBe(true);
    expect(snapshotRegularFileBytes(dirname(layout.projectOSRoot))).toEqual(
      sandboxBefore,
    );
  });

  it("scaffolds a requested file already imported by reviewed legacy source debt", () => {
    const layout = createSandbox();
    updateGraph(layout, (graph) => {
      graph.fileIndex = graph.fileIndex.filter(
        (file) => file.path !== "lib/workspace-context.ts",
      );
      const database = graph.nodes.find((node) => node.id === "feat_database")!;
      database.linkedFiles = database.linkedFiles.filter(
        (file) => file.path !== "lib/workspace-context.ts",
      );
      const team = graph.nodes.find((node) => node.id === "feat_team")!;
      team.linkedFiles = team.linkedFiles.filter(
        (file) => file.path !== "lib/workspace-context.ts",
      );
      const settings = graph.nodes.find((node) => node.id === "feat_settings")!;
      settings.linkedFiles = settings.linkedFiles.filter(
        (file) => file.path !== "lib/workspace-context.ts",
      );
      graph.fileRelations = graph.fileRelations?.filter(
        (relation) =>
          relation.sourcePath !== "lib/workspace-context.ts" &&
          relation.targetPath !== "lib/workspace-context.ts",
      );
    });
    updateSemanticTree(layout, (tree) => {
      const database = findTreeNode(tree.roots, "tree_feat_database")!;
      database.children = database.children.filter(
        (node) => node.path !== "lib/workspace-context.ts",
      );
    });
    copyAuthoritativeToMirrors(layout);

    const candidate = scaffoldFixtures({
      ownerId: "feat_database",
      treeParentId: "tree_feat_database",
      files: [{
        path: "lib/workspace-context.ts",
        role: "supporting",
      }],
    }, layout);

    expect(candidate.fileIndex).toEqual([
      expect.objectContaining({
        path: "lib/workspace-context.ts",
        nodeIds: ["feat_database"],
        imports: ["lib/auth.ts", "lib/db.ts", "lib/request-auth.ts"],
      }),
    ]);
  });

  it("fails scaffold dependency analysis closed for unresolved local imports and stylesheet dependencies", () => {
    const sourceLayout = createSandbox();
    writeWorkspaceFile(
      sourceLayout,
      "components/Unresolved.tsx",
      [
        "import Missing from './Missing'",
        "export default function Unresolved() { return <Missing /> }",
        "",
      ].join("\n"),
    );
    expect(() => scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "components/Unresolved.tsx",
        role: "supporting",
      }],
    }, sourceLayout)).toThrow(
      "Local import './Missing' in 'components/Unresolved.tsx' could not be resolved",
    );

    const styleLayout = createSandbox();
    writeWorkspaceFile(
      styleLayout,
      "components/Dependent.module.css",
      "@import './missing.css';\n.card { padding: 1rem; }\n",
    );
    expect(() => scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "components/Dependent.module.css",
        role: "supporting",
      }],
    }, styleLayout)).toThrow(
      "Stylesheet dependency or composition syntax",
    );

    const compositionLayout = createSandbox();
    writeWorkspaceFile(
      compositionLayout,
      "components/Composed.module.css",
      ".card { composes: base from './base.css'; }\n",
    );
    expect(() => scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "components/Composed.module.css",
        role: "supporting",
      }],
    }, compositionLayout)).toThrow(
      "Stylesheet dependency or composition syntax",
    );

    const commentLayout = createSandbox();
    writeWorkspaceFile(
      commentLayout,
      "components/Commented.module.css",
      [
        "/* @import './missing.css'; */",
        ".card::before { content: \"@use './missing.css'\"; }",
        "",
      ].join("\n"),
    );
    expect(scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "components/Commented.module.css",
        role: "supporting",
      }],
    }, commentLayout).fileIndex[0]).toMatchObject({
      path: "components/Commented.module.css",
      imports: [],
      exports: [],
    });

    const brokenLayout = createSandbox();
    writeWorkspaceFile(
      brokenLayout,
      "components/Broken.module.css",
      ".card { color: red;\n",
    );
    expect(() => scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "components/Broken.module.css",
        role: "supporting",
      }],
    }, brokenLayout)).toThrow(
      "Stylesheet dependency or composition syntax",
    );

    for (const [name, stylesheet] of [
      ["EscapedClose", ".card { color: red; content: \\};\n"],
      ["EscapedOpen", ".card \\{ color: red; }\n"],
      ["HexEscapedClose", ".card { color: red; content: \\7d ;\n"],
    ] as const) {
      const escapedLayout = createSandbox();
      const path = `components/${name}.module.css`;
      writeWorkspaceFile(escapedLayout, path, stylesheet);
      expect(() => scaffoldFixtures({
        ownerId: "feat_dashboard",
        treeParentId: "tree_feat_dashboard",
        files: [{ path, role: "supporting" }],
      }, escapedLayout)).toThrow(
        "Stylesheet dependency or composition syntax",
      );
    }
  });

  it("scaffolds TypeScript import-equals and CommonJS exports deterministically", () => {
    const layout = createSandbox();
    writeWorkspaceFile(
      layout,
      "components/legacy-helper.cjs",
      [
        "module.exports = {}",
        "exports.named = 1",
        "",
      ].join("\n"),
    );
    writeWorkspaceFile(
      layout,
      "components/import-equals.ts",
      [
        "export import helper = require('./legacy-helper.cjs')",
        "",
      ].join("\n"),
    );
    writeWorkspaceFile(
      layout,
      "components/module-loader.cjs",
      [
        "const helper = module.require('./legacy-helper.cjs')",
        "exports['helper'] = helper",
        "",
      ].join("\n"),
    );

    const candidate = scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [
        {
          path: "components/import-equals.ts",
          role: "supporting",
        },
        {
          path: "components/legacy-helper.cjs",
          role: "supporting",
        },
        {
          path: "components/module-loader.cjs",
          role: "supporting",
        },
      ],
    }, layout);

    expect(candidate.fileIndex).toEqual([
      {
        path: "components/import-equals.ts",
        type: "component",
        nodeIds: ["feat_dashboard"],
        imports: ["components/legacy-helper.cjs"],
        exports: ["helper"],
      },
      {
        path: "components/legacy-helper.cjs",
        type: "component",
        nodeIds: ["feat_dashboard"],
        imports: [],
        exports: ["default", "named"],
      },
      {
        path: "components/module-loader.cjs",
        type: "component",
        nodeIds: ["feat_dashboard"],
        imports: ["components/legacy-helper.cjs"],
        exports: ["helper"],
      },
    ]);
  });

  it("rejects aliased loaders, createRequire, and dynamic CommonJS exports", () => {
    const aliasedLayout = createSandbox();
    writeWorkspaceFile(
      aliasedLayout,
      "components/aliased-loader.cjs",
      "const load = require\nmodule.exports = load('./local.cjs')\n",
    );
    expect(() => scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "components/aliased-loader.cjs",
        role: "supporting",
      }],
    }, aliasedLayout)).toThrow("Aliased CommonJS loader");

    const createRequireLayout = createSandbox();
    writeWorkspaceFile(
      createRequireLayout,
      "components/create-require.mjs",
      [
        "import { createRequire as makeRequire } from 'node:module'",
        "const load = makeRequire(import.meta.url)",
        "export default load('./local.cjs')",
        "",
      ].join("\n"),
    );
    expect(() => scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "components/create-require.mjs",
        role: "supporting",
      }],
    }, createRequireLayout)).toThrow("createRequire loader aliases");

    const computedExportLayout = createSandbox();
    writeWorkspaceFile(
      computedExportLayout,
      "components/computed-export.cjs",
      "const name = 'value'\nexports[name] = 1\n",
    );
    expect(() => scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "components/computed-export.cjs",
        role: "supporting",
      }],
    }, computedExportLayout)).toThrow("Computed CommonJS export");
  });

  it("fails CommonJS and createRequire escape forms closed", () => {
    const namespaceLayout = createSandbox();
    writeWorkspaceFile(
      namespaceLayout,
      "components/namespace-create-require.mjs",
      [
        "import * as nodeModule from 'node:module'",
        "const load = nodeModule.createRequire(import.meta.url)",
        "export default load('./local.cjs')",
        "",
      ].join("\n"),
    );
    expect(() => scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "components/namespace-create-require.mjs",
        role: "supporting",
      }],
    }, namespaceLayout)).toThrow("createRequire loader aliases");

    const shadowedLayout = createSandbox();
    writeWorkspaceFile(
      shadowedLayout,
      "components/shadowed-exports.ts",
      "const exports = {}\nexports.fake = 1\nexport default exports\n",
    );
    expect(() => scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "components/shadowed-exports.ts",
        role: "supporting",
      }],
    }, shadowedLayout)).toThrow("shadows a reserved CommonJS identifier");

    for (const [fileName, source, message] of [
      [
        "wrapped-require.cjs",
        "const helper = (require)('./local.cjs')\nmodule.exports = helper\n",
        "Aliased or computed CommonJS loader",
      ],
      [
        "asserted-require.ts",
        "const helper = (require as any)('./local.cjs')\nexport default helper\n",
        "Aliased or computed CommonJS loader",
      ],
      [
        "call-export.cjs",
        "Object.defineProperty(exports, 'named', { value: 1 })\n",
        "Call-based CommonJS export mutation",
      ],
      [
        "compound-export.cjs",
        "exports.named ||= 1\n",
        "Compound CommonJS export mutation",
      ],
    ] as const) {
      const layout = createSandbox();
      const path = `components/${fileName}`;
      writeWorkspaceFile(layout, path, source);
      expect(
        () => scaffoldFixtures({
          ownerId: "feat_dashboard",
          treeParentId: "tree_feat_dashboard",
          files: [{ path, role: "supporting" }],
        }, layout),
        fileName,
      ).toThrow(message);
    }
  });

  it("allows unrelated reserved-looking identifiers in valid modules", () => {
    const layout = createSandbox();
    writeWorkspaceFile(
      layout,
      "components/valid-identifiers.ts",
      [
        "import { builtinModules } from 'node:module'",
        "export function label(module: string) { return `${module}:${builtinModules.length}` }",
        "export function localName(require: string) { return require }",
        "export function localProcess(process: { getBuiltinModule: string }) { return process.getBuiltinModule }",
        "export function localEvaluator(eval: string, Function: string) { return `${eval}:${Function}` }",
        "const config = { createRequire: false }",
        "export { config, builtinModules }",
        "",
      ].join("\n"),
    );

    expect(scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "components/valid-identifiers.ts",
        role: "supporting",
      }],
    }, layout).fileIndex[0]).toMatchObject({
      path: "components/valid-identifiers.ts",
      imports: [],
      exports: [
        "label",
        "localName",
        "localProcess",
        "localEvaluator",
        "config",
        "builtinModules",
      ],
    });
  });

  it("resolves reserved CommonJS authority per lexical reference", () => {
    for (const [fileName, source] of [
      [
        "higher-order-require.ts",
        [
          "declare function identity(value: unknown): any",
          "identity(require)('./hidden-local-module')",
          "export function label(require: string) { return require }",
          "",
        ].join("\n"),
      ],
      [
        "container-require.cjs",
        [
          "function label(require) { return require }",
          "const load = [require][0]",
          "module.exports = load('../lib/utils')",
          "",
        ].join("\n"),
      ],
      [
        "wrapper-redeclaration.cjs",
        [
          "var require",
          "const load = [require][0]",
          "module.exports = load('../lib/utils')",
          "",
        ].join("\n"),
      ],
    ] as const) {
      const layout = createSandbox();
      const path = `components/${fileName}`;
      writeWorkspaceFile(layout, path, source);
      expect(() => scaffoldFixtures({
        ownerId: "feat_dashboard",
        treeParentId: "tree_feat_dashboard",
        files: [{ path, role: "supporting" }],
      }, layout)).toThrow("Bare CommonJS 'require' reference");
    }
  });

  it("rejects dynamic evaluator and process builtin createRequire routes", () => {
    for (const [fileName, source, message] of [
      [
        "evaluated-require.cjs",
        "const load = eval('require')\nmodule.exports = load('./local.cjs')\n",
        "Dynamic code evaluation",
      ],
      [
        "function-require.cjs",
        "const load = Function('return require')()\nmodule.exports = load('./local.cjs')\n",
        "Dynamic code evaluation",
      ],
      [
        "process-create-require.mjs",
        [
          "const load = process.getBuiltinModule('node:module').createRequire(import.meta.url)",
          "export default load('./local.cjs')",
          "",
        ].join("\n"),
        "createRequire loader aliases",
      ],
      [
        "reflected-eval.cjs",
        [
          "const load = Reflect.apply(eval, globalThis, ['require'])",
          "module.exports = load('./local.cjs')",
          "",
        ].join("\n"),
        "Dynamic code evaluation",
      ],
      [
        "destructured-eval.cjs",
        [
          "const { eval: evaluate } = globalThis",
          "module.exports = evaluate('require')('./local.cjs')",
          "",
        ].join("\n"),
        "Dynamic code evaluation",
      ],
      [
        "aliased-global-eval.cjs",
        [
          "const root = globalThis",
          "const load = root.eval('require')",
          "module.exports = load('../lib/utils')",
          "",
        ].join("\n"),
        "Dynamic code evaluation",
      ],
      [
        "browser-global-eval.cjs",
        [
          "const load = self.eval('require')",
          "module.exports = load('../lib/utils')",
          "",
        ].join("\n"),
        "Dynamic code evaluation",
      ],
      [
        "ambient-eval.ts",
        [
          "declare const eval: (source: string) => any",
          "const load = eval('require')",
          "export default load('../lib/utils')",
          "",
        ].join("\n"),
        "Dynamic code evaluation",
      ],
      [
        "destructured-global-root.cjs",
        [
          "const { 'globalThis': root } = globalThis",
          "const load = root.eval('require')",
          "module.exports = load('../lib/utils')",
          "",
        ].join("\n"),
        "Opaque global evaluator authority",
      ],
      [
        "captured-process-getter.mjs",
        [
          "const builtin = process.getBuiltinModule",
          "const { createRequire } = builtin('node:module')",
          "const load = createRequire(import.meta.url)",
          "export default load('../lib/utils')",
          "",
        ].join("\n"),
        "Captured or computed process.getBuiltinModule reference",
      ],
      [
        "destructured-process-bridge.mjs",
        [
          "const { 'process': proc } = globalThis",
          "const { createRequire } = proc.getBuiltinModule('node:module')",
          "export default createRequire(import.meta.url)('../lib/utils')",
          "",
        ].join("\n"),
        "Opaque global evaluator authority",
      ],
      [
        "direct-process-bridge.mjs",
        [
          "const proc = globalThis.process",
          "const { createRequire } = proc.getBuiltinModule('node:module')",
          "export default createRequire(import.meta.url)('../lib/utils')",
          "",
        ].join("\n"),
        "Captured or computed process.getBuiltinModule reference",
      ],
      [
        "aliased-process-root.mjs",
        [
          "const proc = process",
          "const { createRequire } = proc.getBuiltinModule('node:module')",
          "export default createRequire(import.meta.url)('../lib/utils')",
          "",
        ].join("\n"),
        "Captured or computed process.getBuiltinModule reference",
      ],
      [
        "destructured-process-getter.mjs",
        [
          "const { getBuiltinModule } = process",
          "const { createRequire } = getBuiltinModule('node:module')",
          "export default createRequire(import.meta.url)('../lib/utils')",
          "",
        ].join("\n"),
        "Captured or computed process.getBuiltinModule reference",
      ],
      [
        "bound-process-getter.mjs",
        [
          "const builtin = process.getBuiltinModule.bind(process)",
          "const { createRequire } = builtin('node:module')",
          "export default createRequire(import.meta.url)('../lib/utils')",
          "",
        ].join("\n"),
        "Captured or computed process.getBuiltinModule reference",
      ],
      [
        "computed-process-getter.mjs",
        [
          "const name = 'getBuiltin' + 'Module'",
          "const builtin = process[name]",
          "export default builtin('node:module')",
          "",
        ].join("\n"),
        "Captured or computed process.getBuiltinModule reference",
      ],
    ] as const) {
      const layout = createSandbox();
      const path = `components/${fileName}`;
      writeWorkspaceFile(layout, path, source);
      expect(
        () => scaffoldFixtures({
          ownerId: "feat_dashboard",
          treeParentId: "tree_feat_dashboard",
          files: [{ path, role: "supporting" }],
        }, layout),
        fileName,
      ).toThrow(message);
    }
  });

  it("rejects implicit, existing, and escaping scaffold targets", () => {
    const layout = createSandbox();
    const baseRequest = {
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
    };

    expect(() => scaffoldFixtures({
      ...baseRequest,
      files: [],
    }, layout)).toThrow("At least one scaffold file is required");
    expect(() => scaffoldFixtures({
      ...baseRequest,
      files: [{
        path: "components/StatsCard.tsx",
        role: "supporting",
      }],
    }, layout)).toThrow("is already indexed");
    expect(() => scaffoldFixtures({
      ...baseRequest,
      files: [{
        path: "../outside.ts",
        role: "supporting",
      }],
    }, layout)).toThrow(FixtureReconcilerError);
    writeWorkspaceFile(
      layout,
      "components/NewLeaf.tsx",
      "export default function NewLeaf() { return null }\n",
    );
    expect(() => scaffoldFixtures({
      ...baseRequest,
      treeParentId: "tree_file_components_stats_card",
      files: [{
        path: "components/NewLeaf.tsx",
        role: "supporting",
      }],
    }, layout)).toThrow("must be a pathless feature node");
  });

  it("requires non-placeholder Chinese copy for a newly reconciled file", () => {
    const layout = createSandbox();
    writeWorkspaceFile(
      layout,
      "components/NewCard.tsx",
      "export default function NewCard() { return null }\n",
    );
    const candidate = scaffoldFixtures({
      ownerId: "feat_dashboard",
      treeParentId: "tree_feat_dashboard",
      files: [{
        path: "components/NewCard.tsx",
        role: "supporting",
      }],
    }, layout);
    updateGraph(layout, (graph) => {
      graph.fileIndex.push(...candidate.fileIndex);
      graph.nodes
        .find((node) => node.id === "feat_dashboard")!
        .linkedFiles.push(...candidate.linkedFiles);
    });
    updateSemanticTree(layout, (tree) => {
      findTreeNode(tree.roots, "tree_feat_dashboard")!
        .children.push(...candidate.semanticChildren);
    });
    copyAuthoritativeToMirrors(layout);

    expect(checkFixtures(layout).issues).toContainEqual(
      expect.objectContaining({
        code: "linked_summary_uncurated",
        path: "feat_dashboard:components/NewCard.tsx",
      }),
    );
  });

  it("recomputes topology instead of trusting stored totals", () => {
    const layout = createSandbox();
    updateGraph(layout, (graph) => {
      graph.topology!.totalNodes += 1;
    });
    copyAuthoritativeToMirrors(layout);

    expect(checkFixtures(layout).issues).toContainEqual(
      expect.objectContaining({
        code: "topology_drift",
        path: "graph.json:topology",
      }),
    );
  });

  it("rejects duplicate child IDs before topology set comparison", () => {
    const layout = createSandbox();
    updateGraph(layout, (graph) => {
      graph.nodes
        .find((node) => node.id === "container_next_web")!
        .children!.push("feat_dashboard");
    });
    copyAuthoritativeToMirrors(layout);

    expect(checkFixtures(layout).issues).toContainEqual({
      code: "topology_drift",
      path: "nodes.container_next_web.children",
      message: "Node children must be a duplicate-free deterministic array",
    });
  });

  it("composes the full fixture reference validator and refuses dangling-edge sync", () => {
    const layout = createSandbox();
    updateGraph(layout, (graph) => {
      graph.edges[0]!.target = "missing_node";
    });
    copyAuthoritativeToMirrors(layout);

    expect(checkFixtures(layout).issues).toContainEqual(
      expect.objectContaining({
        code: "fixture_reference_invalid",
        message: expect.stringContaining("edge_missing_node"),
      }),
    );
    expect(() => syncFixtureMirrors(layout)).toThrow(
      "Refusing to sync invalid authoritative fixtures",
    );
  });

  it("derives a qualifying dashboard edit candidate from authoritative graph facts", () => {
    const layout = createSandbox();
    updateGraph(layout, (graph) => {
      graph.nodes.find((node) => node.id === "feat_dashboard")!.preview = {
        route: "/not-dashboard",
        thumbnail: null,
      };
    });
    copyAuthoritativeToMirrors(layout);

    expect(checkFixtures(layout).issues).toContainEqual(
      expect.objectContaining({
        code: "editable_owner_invalid",
        path: "/dashboard",
      }),
    );
  });

  it("rejects duplicate semantic leaves for one managed path", () => {
    const layout = createSandbox();
    updateSemanticTree(layout, (tree) => {
      const dashboard = findTreeNode(tree.roots, "tree_feat_dashboard")!;
      const statsCard = findTreeNode(
        tree.roots,
        "tree_file_components_stats_card",
      )!;
      dashboard.children.push({
        ...statsCard,
        id: "tree_file_components_stats_card_duplicate",
        children: [],
      });
    });
    copyAuthoritativeToMirrors(layout);

    expect(checkFixtures(layout).issues).toContainEqual({
      code: "ownership_drift",
      path: "components/StatsCard.tsx",
      message: "A managed path may appear only once in the semantic tree",
    });
  });

  it("requires semantic leaves to remain under their unique source-owner feature", () => {
    const movedLeafLayout = createSandbox();
    updateSemanticTree(movedLeafLayout, (tree) => {
      const dashboard = findTreeNode(tree.roots, "tree_feat_dashboard")!;
      const leafIndex = dashboard.children.findIndex((node) =>
        node.id === "tree_file_components_stats_card");
      const [statsLeaf] = dashboard.children.splice(leafIndex, 1);
      findTreeNode(tree.roots, "tree_feat_login")!.children.push(statsLeaf!);
    });
    copyAuthoritativeToMirrors(movedLeafLayout);
    expect(checkFixtures(movedLeafLayout).issues).toContainEqual(
      expect.objectContaining({
        code: "ownership_drift",
        path: "tree_file_components_stats_card:components/StatsCard.tsx",
        message: expect.stringContaining(
          "directly under the pathless feature for their source owner",
        ),
      }),
    );

    const duplicateParentLayout = createSandbox();
    updateSemanticTree(duplicateParentLayout, (tree) => {
      tree.roots.push({
        id: "tree_feat_dashboard_duplicate",
        label: "重复仪表盘",
        kind: "feature",
        sourceNodeId: "feat_dashboard",
        status: "normal",
        children: [],
      });
    });
    copyAuthoritativeToMirrors(duplicateParentLayout);
    expect(checkFixtures(duplicateParentLayout).issues).toContainEqual(
      expect.objectContaining({
        code: "ownership_drift",
        path: "feat_dashboard",
        message: expect.stringContaining(
          "exactly one pathless semantic feature parent",
        ),
      }),
    );
  });

  it("allows at most one semantic feature parent for every graph owner", () => {
    const layout = createSandbox();
    updateSemanticTree(layout, (tree) => {
      tree.roots.push(
        {
          id: "tree_route_api_first",
          label: "路由接口一",
          kind: "feature",
          sourceNodeId: "component_route_api",
          status: "normal",
          children: [],
        },
        {
          id: "tree_route_api_second",
          label: "路由接口二",
          kind: "feature",
          sourceNodeId: "component_route_api",
          status: "normal",
          children: [],
        },
      );
    });
    copyAuthoritativeToMirrors(layout);

    expect(checkFixtures(layout).issues).toContainEqual(
      expect.objectContaining({
        code: "ownership_drift",
        path: "component_route_api",
        message: expect.stringContaining(
          "at most one pathless semantic feature parent",
        ),
      }),
    );
  });

  it("rejects empty semantic feature and leaf paths", () => {
    const featureLayout = createSandbox();
    updateSemanticTree(featureLayout, (tree) => {
      tree.roots.push({
        id: "tree_empty_feature_path",
        label: "空路径功能",
        kind: "feature",
        path: "",
        sourceNodeId: "feat_dashboard",
        status: "normal",
        children: [],
      });
    });
    copyAuthoritativeToMirrors(featureLayout);
    expect(checkFixtures(featureLayout).issues).toContainEqual(
      expect.objectContaining({
        code: "unsafe_fixture_path",
        path: "tree_empty_feature_path:",
      }),
    );

    const leafLayout = createSandbox();
    updateSemanticTree(leafLayout, (tree) => {
      findTreeNode(tree.roots, "tree_feat_dashboard")!.children.push({
        id: "tree_empty_leaf_path",
        label: "空路径文件",
        kind: "file",
        path: "",
        sourceNodeId: "feat_dashboard",
        status: "normal",
        children: [],
      });
    });
    copyAuthoritativeToMirrors(leafLayout);
    expect(checkFixtures(leafLayout).issues).toContainEqual(
      expect.objectContaining({
        code: "unsafe_fixture_path",
        path: "tree_empty_leaf_path:",
      }),
    );
  });

});

function createSandbox(): FixtureLayout {
  const sourceLayout = createDefaultFixtureLayout(resolve("."));
  const root = mkdtempSync(
    join(realpathSync(tmpdir()), "projectos-fixture-reconciler-"),
  );
  disposableRoots.push(root);
  const layout: FixtureLayout = {
    projectOSRoot: join(root, "projectos"),
    workspaceRoot: join(root, "sample-graph-saas"),
    authoritativeRoot: join(root, "sample-graph-saas", ".projectos"),
    mirrorRoots: [
      join(root, "projectos", "client", "sample-projectos-fixtures"),
    ],
  };
  mkdirSync(layout.authoritativeRoot, { recursive: true });
  mkdirSync(layout.mirrorRoots[0]!, { recursive: true });

  for (const fixtureName of ["graph.json", "semantic-tree.json"]) {
    cpSync(
      join(sourceLayout.authoritativeRoot, fixtureName),
      join(layout.authoritativeRoot, fixtureName),
    );
  }
  const graph = ProjectGraphSchema.parse(JSON.parse(readFileSync(
    join(sourceLayout.authoritativeRoot, "graph.json"),
    "utf8",
  )));
  for (const file of graph.fileIndex) {
    const sourcePath = join(sourceLayout.workspaceRoot, file.path);
    const targetPath = join(layout.workspaceRoot, file.path);
    mkdirSync(dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath);
  }
  copyAuthoritativeToMirrors(layout);
  return layout;
}

function updateGraph(
  layout: FixtureLayout,
  mutate: (graph: ProjectGraph) => void,
): void {
  const path = join(layout.authoritativeRoot, "graph.json");
  const graph = ProjectGraphSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  mutate(graph);
  writeJson(path, graph);
}

function updateSemanticTree(
  layout: FixtureLayout,
  mutate: (tree: SemanticTree) => void,
): void {
  const path = join(layout.authoritativeRoot, "semantic-tree.json");
  const tree = SemanticTreeSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  mutate(tree);
  writeJson(path, tree);
}

function findTreeNode(
  roots: SemanticTree["roots"],
  nodeId: string,
): SemanticTree["roots"][number] | undefined {
  const pending = [...roots];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.id === nodeId) return node;
    pending.push(...node.children);
  }
  return undefined;
}

function writeWorkspaceFile(
  layout: FixtureLayout,
  path: string,
  source: string,
): void {
  const absolutePath = join(layout.workspaceRoot, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, "utf8");
}

function copyAuthoritativeToMirrors(layout: FixtureLayout): void {
  for (const mirrorRoot of layout.mirrorRoots) {
    mkdirSync(mirrorRoot, { recursive: true });
    for (const fixtureName of ["graph.json", "semantic-tree.json"]) {
      cpSync(
        join(layout.authoritativeRoot, fixtureName),
        join(mirrorRoot, fixtureName),
      );
    }
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readBytes(path: string): Uint8Array {
  return readFileSync(path, { encoding: null });
}

function snapshotRegularFileBytes(root: string): Record<string, number[]> {
  const snapshot: Record<string, number[]> = {};
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory).sort()) {
      const path = join(directory, entry);
      const status = lstatSync(path);
      if (status.isDirectory()) {
        pending.push(path);
      } else if (status.isFile()) {
        snapshot[relative(root, path)] = Array.from(readBytes(path));
      }
    }
  }
  return snapshot;
}
