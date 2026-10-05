import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { GraphChangeSet } from "../contracts/index.js";
import { ApplyBackupManifestV4Schema } from "../contracts/index.js";
import { ProjectOSWorkspaceStore } from "../persistence/workspace-store.js";
import {
  RecoverableWriteTransactionKernel,
  bindCreateAuthorization,
  bindExistingFileAuthorization,
} from "./recoverable-write-transaction.js";
import { computeProjectGraphHash } from "./graph-change-set-engine.js";
import { WorkspaceTransactionCoordinator } from "./workspace-transaction-coordinator.js";
import { ProjectOSLocalApi } from "./project-os-local-api.js";

const sampleWorkspaceRoot = resolve("..", "sample-graph-saas");
const temporaryRoots: string[] = [];
const idFactory = {
  nodeId: (tempRef: string) => `server_node_${tempRef}`,
  edgeId: (tempRef: string) => `server_edge_${tempRef}`,
};

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("WorkspaceTransactionCoordinator", () => {
  it("commits a graph-only change through journaled internal resources", async () => {
    const workspaceRoot = copySampleWorkspace();
    const store = new ProjectOSWorkspaceStore();
    const workspace = store.loadWorkspace(workspaceRoot);
    const coordinator = new WorkspaceTransactionCoordinator(
      store,
      new RecoverableWriteTransactionKernel(),
    );

    const result = await coordinator.commit({
      runId: "graph_only",
      workspace,
      changeSet: await renameLoginChangeSet(workspace, "Login product revision"),
      semanticTree: workspace.semanticTree,
      sourceOperations: [],
      idFactory,
      updatedAt: "2026-07-19T08:00:00.000Z",
    });

    expect(result.outcome).toBe("committed");
    expect(result.filesChanged).toEqual([
      ".projectos/graph-product-overlay.json",
      ".projectos/semantic-tree.json",
      ".projectos/current-work.json",
    ]);
    expect(ApplyBackupManifestV4Schema.parse(JSON.parse(readFileSync(
      join(workspace.projectOSRoot, "apply-backups", result.backupId, "manifest.json"),
      "utf8",
    ))).files).toMatchObject([
      {
        operation: "internal",
        resource: "graph_product_overlay",
        existedBefore: false,
        resultedExists: true,
        afterSha256: expect.stringMatching(/^sha256:/u),
      },
      {
        operation: "internal",
        resource: "semantic_tree",
        existedBefore: true,
        resultedExists: true,
        originalSha256: expect.stringMatching(/^sha256:/u),
        afterSha256: expect.stringMatching(/^sha256:/u),
      },
      {
        operation: "internal",
        resource: "current_work",
        existedBefore: true,
        resultedExists: true,
        originalSha256: expect.stringMatching(/^sha256:/u),
        afterSha256: expect.stringMatching(/^sha256:/u),
      },
    ]);
    expect(workspace.graph.nodes.find((node) => node.id === "feat_login")?.summary)
      .toBe("Login product revision");
    expect(store.loadWorkspace(workspaceRoot).graph.nodes.find((node) => node.id === "feat_login")?.summary)
      .toBe("Login product revision");
  });

  it("returns the same graph hash that reload computes after overriding a base file entry", async () => {
    const workspaceRoot = copySampleWorkspace();
    const store = new ProjectOSWorkspaceStore();
    const workspace = store.loadWorkspace(workspaceRoot);
    const existingPath = "app/login/page.tsx";
    const originalIndex = workspace.graph.fileIndex.findIndex((entry) => entry.path === existingPath);
    expect(originalIndex).toBeGreaterThanOrEqual(0);
    const changeSet: GraphChangeSet = {
      version: "0.1.0",
      projectId: workspace.project.projectId,
      baseGraphHash: await computeProjectGraphHash(workspace.graph),
      operations: [{
        kind: "addNode",
        tempRef: "roundtrip_component",
        parent: { kind: "existing", nodeId: "container_next_web" },
        node: {
          type: "capability",
          name: "哈希往返组件",
          nameEn: "Hash Round-trip Component",
          status: "active",
          description: "验证已有文件所有权覆盖在持久化往返后保持稳定。",
          summary: "验证图哈希往返。",
          responsibility: "验证图哈希持久化一致性。",
          elementType: "component",
          level: "component",
          layer: "application",
          linkedFiles: [{
            path: existingPath,
            role: "supporting",
            summary: "复用登录页面以验证文件索引覆盖。",
          }],
          tags: ["test"],
        },
      }],
    };
    const coordinator = new WorkspaceTransactionCoordinator(
      store,
      new RecoverableWriteTransactionKernel(),
    );

    const result = await coordinator.commit({
      runId: "file_index_hash_roundtrip",
      workspace,
      changeSet,
      semanticTree: workspace.semanticTree,
      sourceOperations: [],
      idFactory,
      updatedAt: "2026-07-21T12:00:00.000Z",
    });
    const reloaded = store.loadWorkspace(workspaceRoot);

    expect(reloaded.graph.fileIndex.findIndex((entry) => entry.path === existingPath))
      .not.toBe(originalIndex);
    expect(reloaded.graph.fileIndex.find((entry) => entry.path === existingPath)?.nodeIds)
      .toContain("server_node_roundtrip_component");
    expect(result.graphHash).toBe(await computeProjectGraphHash(reloaded.graph));
  });

  it("persists committed hybrid graph freshness into current-work.json", async () => {
    const workspaceRoot = copySampleWorkspace();
    const store = new ProjectOSWorkspaceStore();
    const workspace = store.loadWorkspace(workspaceRoot);
    const coordinator = new WorkspaceTransactionCoordinator(
      store,
      new RecoverableWriteTransactionKernel(),
    );

    const result = await coordinator.commit({
      runId: "persist_graph_freshness",
      workspace,
      changeSet: await renameLoginChangeSet(workspace, "Freshness persistence revision"),
      semanticTree: workspace.semanticTree,
      sourceOperations: [],
      idFactory,
      updatedAt: "2026-07-21T12:30:00.000Z",
    });
    const reloaded = store.loadWorkspace(workspaceRoot);

    expect(reloaded.currentWork.graphFreshness).toMatchObject({
      stale: true,
      structuralRevision: {
        revision: 1,
        effectiveGraphHash: result.graphHash,
        updatedAt: "2026-07-21T12:30:00.000Z",
      },
    });
    expect(workspace.currentWork.graphFreshness).toEqual(reloaded.currentWork.graphFreshness);
  });

  it("commits and undoes source, graph overlay, and tree as one transaction", async () => {
    const workspaceRoot = copySampleWorkspace();
    const store = new ProjectOSWorkspaceStore();
    const workspace = store.loadWorkspace(workspaceRoot);
    const kernel = new RecoverableWriteTransactionKernel();
    const coordinator = new WorkspaceTransactionCoordinator(store, kernel);
    const sourcePath = "app/login/page.tsx";
    const sourceTarget = join(workspaceRoot, sourcePath);
    const sourceBefore = readFileSync(sourceTarget, { encoding: null });
    const sourceAfter = new TextEncoder().encode(`${new TextDecoder().decode(sourceBefore)}\n// mixed\n`);
    const treeBefore = readFileSync(join(workspace.projectOSRoot, "semantic-tree.json"), { encoding: null });

    const applied = await coordinator.commit({
      runId: "mixed_workspace",
      workspace,
      changeSet: await renameLoginChangeSet(workspace, "Mixed graph revision"),
      semanticTree: workspace.semanticTree,
      sourceOperations: [{
        authorization: bindExistingFileAuthorization({
          operation: "modify",
          projectId: workspace.project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath: sourcePath,
        }),
        beforeBytes: sourceBefore,
        afterBytes: sourceAfter,
      }],
      idFactory,
      updatedAt: "2026-07-19T09:00:00.000Z",
    });

    expect(readFileSync(sourceTarget, { encoding: null })).toEqual(Buffer.from(sourceAfter));
    expect(existsSync(join(workspace.projectOSRoot, "graph-product-overlay.json"))).toBe(true);
    const undone = await coordinator.undo(workspace, applied.backupId);
    expect(undone.outcome).toBe("committed");
    expect(readFileSync(sourceTarget, { encoding: null })).toEqual(sourceBefore);
    expect(readFileSync(join(workspace.projectOSRoot, "semantic-tree.json"), { encoding: null }))
      .toEqual(treeBefore);
    expect(existsSync(join(workspace.projectOSRoot, "graph-product-overlay.json"))).toBe(false);
    expect(workspace.graph.nodes.find((node) => node.id === "feat_login")?.summary)
      .not.toBe("Mixed graph revision");
  });

  it("refuses a legacy unclassified workspace backup outside startup recovery", async () => {
    const workspaceRoot = copySampleWorkspace();
    const store = new ProjectOSWorkspaceStore();
    const workspace = store.loadWorkspace(workspaceRoot);
    const coordinator = new WorkspaceTransactionCoordinator(
      store,
      new RecoverableWriteTransactionKernel(),
    );
    const applied = await coordinator.commit({
      runId: "legacy_workspace",
      workspace,
      changeSet: await renameLoginChangeSet(workspace, "Legacy unclassified revision"),
      semanticTree: workspace.semanticTree,
      sourceOperations: [],
      idFactory,
      updatedAt: "2026-07-23T13:00:00.000Z",
    });
    const manifestPath = join(
      workspace.projectOSRoot,
      "apply-backups",
      applied.backupId,
      "manifest.json",
    );
    const {
      restoreAuthority: _restoreAuthority,
      ...manifest
    } = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ ...manifest, version: 3 }, null, 2)}\n`,
      "utf8",
    );

    await expect(coordinator.undo(workspace, applied.backupId)).rejects.toMatchObject({
      code: "backup_not_found",
    });
    expect(workspace.graph.nodes.find((node) => node.id === "feat_login")?.summary)
      .toBe("Legacy unclassified revision");
  });

  it("recovers a crash between source and internal commits to the all-original state", async () => {
    const workspaceRoot = copySampleWorkspace();
    const store = new ProjectOSWorkspaceStore();
    const workspace = store.loadWorkspace(workspaceRoot);
    const kernel = new RecoverableWriteTransactionKernel();
    const coordinator = new WorkspaceTransactionCoordinator(store, kernel);
    const sourcePath = "app/login/page.tsx";
    const sourceTarget = join(workspaceRoot, sourcePath);
    const sourceBefore = readFileSync(sourceTarget, { encoding: null });
    const treePath = join(workspace.projectOSRoot, "semantic-tree.json");
    const treeBefore = readFileSync(treePath, { encoding: null });
    const result = await coordinator.commit({
      runId: "crash_between_resources",
      workspace,
      changeSet: await renameLoginChangeSet(workspace, "Crash graph revision"),
      semanticTree: workspace.semanticTree,
      sourceOperations: [{
        authorization: bindExistingFileAuthorization({
          operation: "modify",
          projectId: workspace.project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath: sourcePath,
        }),
        beforeBytes: sourceBefore,
        afterBytes: new TextEncoder().encode(`${new TextDecoder().decode(sourceBefore)}\n// crash\n`),
      }],
      idFactory,
      updatedAt: "2026-07-19T10:00:00.000Z",
    });
    const backupRoot = join(workspace.projectOSRoot, "apply-backups", result.backupId);
    const journalPath = join(backupRoot, "transaction-journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: Array<Record<string, unknown>>;
      [key: string]: unknown;
    };
    unlinkSync(join(workspace.projectOSRoot, "graph-product-overlay.json"));
    writeFileSync(treePath, treeBefore);
    writeFileSync(journalPath, `${JSON.stringify({
      ...journal,
      state: "committing",
      entries: journal.entries.map((entry, index) => ({ ...entry, committed: index === 0 })),
    }, null, 2)}\n`, "utf8");

    const api = new ProjectOSLocalApi({ sampleWorkspaceRoot: workspaceRoot });
    const project = await api.openSampleWorkspace();
    expect(readFileSync(sourceTarget, { encoding: null })).toEqual(sourceBefore);
    expect(readFileSync(treePath, { encoding: null })).toEqual(treeBefore);
    expect(existsSync(join(workspace.projectOSRoot, "graph-product-overlay.json"))).toBe(false);
    expect((await api.getProjectGraph(project.projectId)).nodes.find(
      (node) => node.id === "feat_login",
    )?.summary).not.toBe("Crash graph revision");
  });

  it("fails closed when the composed graph moves before commit", async () => {
    const workspaceRoot = copySampleWorkspace();
    const store = new ProjectOSWorkspaceStore();
    const workspace = store.loadWorkspace(workspaceRoot);
    const changeSet = await renameLoginChangeSet(workspace, "Stale graph revision");
    const graphPath = join(workspace.projectOSRoot, "graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf8")) as Record<string, unknown>;
    writeFileSync(
      graphPath,
      `${JSON.stringify({ ...graph, projectName: "concurrent analyzer update" }, null, 2)}\n`,
      "utf8",
    );

    await expect(new WorkspaceTransactionCoordinator(
      store,
      new RecoverableWriteTransactionKernel(),
    ).commit({
      runId: "stale_graph",
      workspace,
      changeSet,
      semanticTree: workspace.semanticTree,
      sourceOperations: [],
      idFactory,
      updatedAt: "2026-07-19T11:00:00.000Z",
    })).rejects.toMatchObject({ code: "diff_stale" });
    expect(existsSync(join(workspace.projectOSRoot, "graph-product-overlay.json"))).toBe(false);
  });

  it("rejects orphan creates and structurally-dangling deletes before the kernel", async () => {
    const workspaceRoot = copySampleWorkspace();
    const store = new ProjectOSWorkspaceStore();
    const workspace = store.loadWorkspace(workspaceRoot);
    const coordinator = new WorkspaceTransactionCoordinator(
      store,
      new RecoverableWriteTransactionKernel(),
    );
    const changeSet = await renameLoginChangeSet(workspace, "Ownership guard");
    await expect(coordinator.commit({
      runId: "orphan_create",
      workspace,
      changeSet,
      semanticTree: workspace.semanticTree,
      sourceOperations: [{
        authorization: bindCreateAuthorization({
          projectId: workspace.project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath: "app/orphan.ts",
        }),
        afterBytes: new TextEncoder().encode("export {};\n"),
      }],
      idFactory,
      updatedAt: "2026-07-19T12:00:00.000Z",
    })).rejects.toMatchObject({ code: "diff_scope_violation" });
    expect(existsSync(join(workspaceRoot, "app/orphan.ts"))).toBe(false);

    const deletePath = "app/login/page.tsx";
    await expect(coordinator.commit({
      runId: "dangling_delete",
      workspace,
      changeSet,
      semanticTree: workspace.semanticTree,
      sourceOperations: [{
        authorization: bindExistingFileAuthorization({
          operation: "delete",
          projectId: workspace.project.projectId,
          nodeId: "feat_login",
          workspaceRoot,
          relativePath: deletePath,
        }),
        beforeBytes: readFileSync(join(workspaceRoot, deletePath), { encoding: null }),
      }],
      idFactory,
      updatedAt: "2026-07-19T12:00:00.000Z",
    })).rejects.toMatchObject({ code: "diff_scope_violation" });
    expect(existsSync(join(workspaceRoot, deletePath))).toBe(true);
  });
});

async function renameLoginChangeSet(
  workspace: ReturnType<ProjectOSWorkspaceStore["loadWorkspace"]>,
  summary: string,
): Promise<GraphChangeSet> {
  return {
    version: "0.1.0",
    projectId: workspace.project.projectId,
    baseGraphHash: await computeProjectGraphHash(workspace.graph),
    operations: [{
      kind: "updateNodeFields",
      node: { kind: "existing", nodeId: "feat_login" },
      fields: { summary },
    }],
  };
}

function copySampleWorkspace(): string {
  const tempRoot = mkdtempSync(join(tmpdir(), "projectos-workspace-transaction-"));
  temporaryRoots.push(tempRoot);
  const workspaceRoot = join(tempRoot, "sample-graph-saas");
  cpSync(sampleWorkspaceRoot, workspaceRoot, { recursive: true });
  rmSync(join(workspaceRoot, ".projectos", "settings.json"), { force: true });
  rmSync(join(workspaceRoot, ".projectos", "apply-backups"), { recursive: true, force: true });
  rmSync(join(workspaceRoot, ".projectos", "graph-product-overlay.json"), { force: true });
  return workspaceRoot;
}
