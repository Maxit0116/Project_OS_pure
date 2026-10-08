import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CurrentWorkStateSchema } from "../contracts/context.js";
import { GraphProductOverlaySchema } from "../contracts/graph-provenance.js";
import { ProjectOSProjectSchema } from "../contracts/project.js";
import { ProjectOSError } from "../errors.js";
import { ProjectOSLocalApi } from "../services/index.js";
import { withProjectWriteTransactionLock } from "../services/project-write-transaction-lock.js";
import { resolveContainedPath } from "../utils/path-containment.js";
import { ProjectOSWorkspaceStore } from "./workspace-store.js";
import { deriveGraphProductOverlay } from "../services/graph-provenance.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("ProjectOSWorkspaceStore", () => {
  it("loads the real sample workspace fixtures", () => {
    const store = new ProjectOSWorkspaceStore();
    const workspace = store.loadWorkspace(sampleWorkspaceRoot);

    expect(ProjectOSProjectSchema.safeParse(workspace.project).success).toBe(true);
    expect(workspace.project.projectId).toBe(
      "a41ce3a4-8ba8-43ec-9ad6-285811867d28",
    );
    expect(workspace.graph.nodes.some((node) => node.id === "feat_login")).toBe(
      true,
    );
    expect(workspace.semanticTree.roots.length).toBeGreaterThan(0);
  });

  it("writes current-work.json atomically to a copied .projectos directory", async () => {
    const tempWorkspaceRoot = mkdtempSync(join(tmpdir(), "projectos-store-"));
    temporaryRoots.push(tempWorkspaceRoot);
    cpSync(
      join(sampleWorkspaceRoot, ".projectos"),
      join(tempWorkspaceRoot, ".projectos"),
      { recursive: true },
    );

    const store = new ProjectOSWorkspaceStore();
    const written = await store.writeCurrentWork(tempWorkspaceRoot, {
      version: "0.1.0",
      projectId: "a41ce3a4-8ba8-43ec-9ad6-285811867d28",
      focusedNodeId: "feat_login",
      recentChanges: [
        {
          path: "app/login/page.tsx",
          action: "modified",
          timestamp: "2026-07-07T00:10:00.000Z",
        },
      ],
      unresolvedErrors: [],
    });

    const persisted = CurrentWorkStateSchema.parse(
      JSON.parse(
        readFileSync(
          join(tempWorkspaceRoot, ".projectos", "current-work.json"),
          "utf8",
        ),
      ) as unknown,
    );

    expect(persisted).toEqual(written);
    expect(persisted.focusedNodeId).toBe("feat_login");
  });

  it("serializes direct current-work persistence with the project transaction lock", async () => {
    const tempWorkspaceRoot = mkdtempSync(join(tmpdir(), "projectos-store-lock-"));
    temporaryRoots.push(tempWorkspaceRoot);
    cpSync(sampleWorkspaceRoot, tempWorkspaceRoot, { recursive: true });
    const targetPath = join(tempWorkspaceRoot, ".projectos", "current-work.json");
    const before = readFileSync(targetPath, "utf8");
    const temporaryPaths: string[] = [];
    const store = new ProjectOSWorkspaceStore({
      replace(temporaryPath, destinationPath) {
        temporaryPaths.push(temporaryPath);
        renameSync(temporaryPath, destinationPath);
      },
    });
    const entered = deferred();
    const release = deferred();
    const heldLock = withProjectWriteTransactionLock(
      resolveContainedPath(tempWorkspaceRoot, "."),
      async () => {
        entered.resolve();
        await release.promise;
      },
    );
    await entered.promise;

    const firstWrite = store.writeCurrentWork(tempWorkspaceRoot, {
      version: "0.1.0",
      projectId: "a41ce3a4-8ba8-43ec-9ad6-285811867d28",
      focusedNodeId: "feat_dashboard",
      activeRunId: "concurrent-writer-1",
      recentChanges: [],
      unresolvedErrors: [],
    });
    const secondWrite = store.writeCurrentWork(tempWorkspaceRoot, {
      version: "0.1.0",
      projectId: "a41ce3a4-8ba8-43ec-9ad6-285811867d28",
      focusedNodeId: "feat_login",
      activeRunId: "concurrent-writer-2",
      recentChanges: [],
      unresolvedErrors: [],
    });
    await Promise.resolve();
    const changedWhileLockHeld = readFileSync(targetPath, "utf8") !== before;

    release.resolve();
    await heldLock;
    await Promise.all([firstWrite, secondWrite]);
    expect(changedWhileLockHeld).toBe(false);
    expect(JSON.parse(readFileSync(targetPath, "utf8"))).toMatchObject({
      focusedNodeId: "feat_login",
      activeRunId: "concurrent-writer-2",
    });
    expect(new Set(temporaryPaths).size).toBe(2);
    expect(temporaryPaths).toHaveLength(2);
  });

  it("keeps the old document and cleans its unique temp when replacement is interrupted", async () => {
    const tempWorkspaceRoot = mkdtempSync(join(tmpdir(), "projectos-store-interruption-"));
    temporaryRoots.push(tempWorkspaceRoot);
    cpSync(sampleWorkspaceRoot, tempWorkspaceRoot, { recursive: true });
    const targetPath = join(tempWorkspaceRoot, ".projectos", "current-work.json");
    const before = readFileSync(targetPath, "utf8");
    const attemptedTemps: string[] = [];
    const store = new ProjectOSWorkspaceStore({
      replace(temporaryPath) {
        attemptedTemps.push(temporaryPath);
        throw new Error("simulated interruption before durable rename");
      },
    });

    await expect(store.writeCurrentWork(tempWorkspaceRoot, {
      version: "0.1.0",
      projectId: "a41ce3a4-8ba8-43ec-9ad6-285811867d28",
      focusedNodeId: "feat_dashboard",
      recentChanges: [],
      unresolvedErrors: [],
    })).rejects.toMatchObject({ code: "persistence_write_failed" });

    expect(readFileSync(targetPath, "utf8")).toBe(before);
    expect(attemptedTemps).toHaveLength(1);
    expect(attemptedTemps[0]).toMatch(/\.current-work\.json\.projectos-[A-Za-z0-9-]+\.tmp$/u);
    expect(readdirSync(join(tempWorkspaceRoot, ".projectos")))
      .not.toContain(attemptedTemps[0]!.split("/").at(-1));
  });

  it("loads a composed graph and prepares graph/tree documents without writing them", async () => {
    const tempWorkspaceRoot = mkdtempSync(join(tmpdir(), "projectos-provenance-"));
    temporaryRoots.push(tempWorkspaceRoot);
    cpSync(sampleWorkspaceRoot, tempWorkspaceRoot, { recursive: true });
    const store = new ProjectOSWorkspaceStore();
    const initial = store.loadWorkspace(tempWorkspaceRoot);
    const effective = structuredClone(initial.graph);
    effective.nodes.find((node) => node.id === "feat_login")!.summary = "Product-owned login summary";
    const overlay = await deriveGraphProductOverlay({
      analyzerBase: initial.graphBase!,
      effectiveGraph: effective,
      revision: 1,
      updatedAt: "2026-07-19T04:00:00.000Z",
      analyzerEvidenceStale: true,
    });
    const overlayPath = join(tempWorkspaceRoot, ".projectos", "graph-product-overlay.json");
    const graphDocument = store.prepareGraphOverlayPersistence(tempWorkspaceRoot, overlay);
    const treeDocument = store.prepareSemanticTreePersistence(tempWorkspaceRoot, initial.semanticTree);

    expect(graphDocument).toMatchObject({
      resource: "graph_product_overlay",
      relativePath: ".projectos/graph-product-overlay.json",
      targetPath: overlayPath,
    });
    expect(graphDocument.beforeBytes).toBeUndefined();
    expect(GraphProductOverlaySchema.parse(JSON.parse(new TextDecoder().decode(graphDocument.afterBytes)))).toEqual(overlay);
    expect(treeDocument).toMatchObject({
      resource: "semantic_tree",
      relativePath: ".projectos/semantic-tree.json",
    });
    expect(existsSync(overlayPath)).toBe(false);

    writeFileSync(overlayPath, graphDocument.afterBytes);
    const reloaded = store.loadWorkspace(tempWorkspaceRoot);
    expect(reloaded.graphBase?.nodes.find((node) => node.id === "feat_login")?.summary)
      .not.toBe("Product-owned login summary");
    expect(reloaded.graph.nodes.find((node) => node.id === "feat_login")?.summary)
      .toBe("Product-owned login summary");
  });

  it("rejects transaction-ready internal documents bound to another project", () => {
    const tempWorkspaceRoot = mkdtempSync(join(tmpdir(), "projectos-provenance-binding-"));
    temporaryRoots.push(tempWorkspaceRoot);
    cpSync(sampleWorkspaceRoot, tempWorkspaceRoot, { recursive: true });
    const store = new ProjectOSWorkspaceStore();
    const workspace = store.loadWorkspace(tempWorkspaceRoot);
    expect(() => store.prepareSemanticTreePersistence(tempWorkspaceRoot, {
      ...workspace.semanticTree,
      projectId: "other-project",
    })).toThrowError(expect.objectContaining({ code: "invalid_workspace_fixtures" }));
  });

  it("derives missing descriptions without writing, then persists user edits across analysis", async () => {
    const tempWorkspaceRoot = mkdtempSync(join(tmpdir(), "projectos-description-"));
    temporaryRoots.push(tempWorkspaceRoot);
    cpSync(sampleWorkspaceRoot, tempWorkspaceRoot, { recursive: true });
    const descriptionPath = join(tempWorkspaceRoot, ".projectos", "project-description.json");
    rmSync(descriptionPath, { force: true });

    const store = new ProjectOSWorkspaceStore();
    const derived = store.loadWorkspace(tempWorkspaceRoot).projectDescription;
    expect(derived).toMatchObject({ source: "derived" });
    expect(derived.conciseDescription).toContain("saas-starter");
    expect(existsSync(descriptionPath)).toBe(false);

    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    const updated = await api.updateProjectDescription(
      project.projectId,
      "A concise user-authored description of the product.",
    );
    expect(updated).toMatchObject({ source: "user", projectId: project.projectId });
    expect(existsSync(descriptionPath)).toBe(true);

    try {
      await api.analyzeWorkspace(project.projectId);
    } catch {
      // Sample workspaces may lack a usable API key; analysis must not wipe description.
    }
    expect(await api.getProjectDescription(project.projectId)).toEqual(updated);
    expect(store.loadWorkspace(tempWorkspaceRoot).projectDescription).toEqual(updated);
  });

  it("rejects oversized updates and project-mismatched persisted descriptions", async () => {
    const tempWorkspaceRoot = mkdtempSync(join(tmpdir(), "projectos-description-binding-"));
    temporaryRoots.push(tempWorkspaceRoot);
    cpSync(sampleWorkspaceRoot, tempWorkspaceRoot, { recursive: true });
    const descriptionPath = join(tempWorkspaceRoot, ".projectos", "project-description.json");
    rmSync(descriptionPath, { force: true });

    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: tempWorkspaceRoot });
    const project = await api.openSampleWorkspace();
    await expect(api.updateProjectDescription(project.projectId, "x".repeat(2_001)))
      .rejects.toMatchObject({ code: "invalid_project_description" });

    await expect(new ProjectOSWorkspaceStore().writeProjectDescription(
      tempWorkspaceRoot,
      {
        version: "0.1.0",
        projectId: "different-project",
        conciseDescription: "Mismatched description.",
        source: "user",
        updatedAt: "2026-07-18T00:00:00.000Z",
      },
    )).rejects.toMatchObject({ code: "invalid_project_description" });

    writeFileSync(descriptionPath, `${JSON.stringify({
      version: "0.1.0",
      projectId: "different-project",
      conciseDescription: "Mismatched description.",
      source: "user",
      updatedAt: "2026-07-18T00:00:00.000Z",
    })}\n`, "utf8");
    expect(() => new ProjectOSWorkspaceStore().loadWorkspace(tempWorkspaceRoot))
      .toThrowError(expect.objectContaining({ code: "invalid_workspace_fixtures" }));
  });

  it("rejects a path that is not a workspace", async () => {
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot,
    });

    await expect(api.openWorkspace(resolve("missing-workspace"))).rejects.toMatchObject({
      code: "invalid_workspace_path",
    } satisfies Partial<ProjectOSError>);
  });
});

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

describe("ProjectOSLocalApi", () => {
  it("opens the injected sample workspace", async () => {
    const api = new ProjectOSLocalApi({
      sampleWorkspaceRoot,
    });

    const project = await api.openSampleWorkspace();

    expect(ProjectOSProjectSchema.safeParse(project).success).toBe(true);
    expect(project.displayName).toBe("saas-starter");
  });
});
