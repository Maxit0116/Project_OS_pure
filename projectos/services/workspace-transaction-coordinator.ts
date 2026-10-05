import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ApplyBackupManifestWithOperationsSchema,
  CurrentWorkStateSchema,
  SemanticTreeSchema,
  classifyApplyBackupRestoreAuthority,
  type GraphChangeSet,
  type SemanticTree,
  type SemanticTreeNode,
} from "../contracts/index.js";
import type {
  LoadedProjectOSWorkspace,
  ProjectOSWorkspaceStore,
} from "../persistence/workspace-store.js";
import { ProjectOSError } from "../errors.js";
import { resolveContainedPath } from "../utils/path-containment.js";
import {
  applyGraphChangeSet,
  computeProjectGraphHash,
  type GraphChangeSetIdFactory,
} from "./graph-change-set-engine.js";
import { deriveGraphProductOverlay, resolveHybridGraphFreshness } from "./graph-provenance.js";
import {
  RecoverableWriteTransactionKernel,
  bindCreateAuthorization,
  bindExistingFileAuthorization,
  bindInternalResourceAuthorization,
  type AuthorizedWriteOperation,
  type WriteTransactionResult,
} from "./recoverable-write-transaction.js";

export interface WorkspaceTransactionRequest {
  runId: string;
  workspace: LoadedProjectOSWorkspace;
  changeSet: GraphChangeSet;
  semanticTree: SemanticTree;
  sourceOperations: AuthorizedWriteOperation[];
  idFactory: GraphChangeSetIdFactory;
  updatedAt: string;
  beforeCommit?: () => void | Promise<void>;
}

export interface WorkspaceTransactionCoordinatorResult extends WriteTransactionResult {
  graphHash: string;
}

export class WorkspaceTransactionCoordinator {
  constructor(
    private readonly workspaceStore: ProjectOSWorkspaceStore,
    private readonly kernel: RecoverableWriteTransactionKernel,
  ) {}

  async commit(
    request: WorkspaceTransactionRequest,
  ): Promise<WorkspaceTransactionCoordinatorResult> {
    const projectId = request.workspace.project.projectId;
    if (request.changeSet.projectId !== projectId) {
      throw new ProjectOSError("diff_scope_violation", "Graph change set belongs to another project");
    }
    for (const operation of request.sourceOperations) {
      if (operation.authorization.operation === "internal") {
        throw new ProjectOSError(
          "diff_scope_violation",
          "Caller-supplied source operations cannot authorize internal resources",
        );
      }
    }

    const fresh = this.workspaceStore.loadWorkspace(request.workspace.workspaceRoot);
    const onDiskGraphHash = await computeProjectGraphHash(fresh.graph);
    if (onDiskGraphHash !== request.changeSet.baseGraphHash) {
      throw new ProjectOSError("diff_stale", "Effective graph changed before transaction commit");
    }
    const graphResult = await applyGraphChangeSet({
      graph: fresh.graph,
      changeSet: request.changeSet,
      idFactory: request.idFactory,
      references: { mapContent: fresh.mapContent },
    });
    const semanticTree = SemanticTreeSchema.parse(request.semanticTree);
    validateSemanticTreeAgainstGraph(semanticTree, graphResult.graph);
    validateSourceOperationsAgainstStructure(
      request.sourceOperations,
      graphResult.graph,
      semanticTree,
    );
    const overlay = await deriveGraphProductOverlay({
      analyzerBase: fresh.graphBase ?? fresh.graph,
      effectiveGraph: graphResult.graph,
      ...(fresh.graphOverlay ? { previousOverlay: fresh.graphOverlay } : {}),
      revision: (fresh.graphOverlay?.structuralRevision.revision ?? 0) + 1,
      updatedAt: request.updatedAt,
      analyzerEvidenceStale: true,
    });
    const overlayDocument = this.workspaceStore.prepareGraphOverlayPersistence(
      fresh.workspaceRoot,
      overlay,
    );
    const treeDocument = this.workspaceStore.prepareSemanticTreePersistence(
      fresh.workspaceRoot,
      semanticTree,
    );
    const currentWork = CurrentWorkStateSchema.parse({
      ...fresh.currentWork,
      graphFreshness: await resolveHybridGraphFreshness(
        fresh.graphBase ?? fresh.graph,
        overlay,
      ),
    });
    const currentWorkDocument = this.workspaceStore.prepareCurrentWorkPersistence(
      fresh.workspaceRoot,
      currentWork,
    );
    const internalOperations: AuthorizedWriteOperation[] = [
      {
        authorization: bindInternalResourceAuthorization({
          resource: "graph_product_overlay",
          projectId,
          workspaceRoot: fresh.workspaceRoot,
        }),
        ...(overlayDocument.beforeBytes ? { beforeBytes: overlayDocument.beforeBytes } : {}),
        afterBytes: overlayDocument.afterBytes,
        mode: 0o600,
      },
      {
        authorization: bindInternalResourceAuthorization({
          resource: "semantic_tree",
          projectId,
          workspaceRoot: fresh.workspaceRoot,
        }),
        ...(treeDocument.beforeBytes ? { beforeBytes: treeDocument.beforeBytes } : {}),
        afterBytes: treeDocument.afterBytes,
        mode: 0o600,
      },
      {
        authorization: bindInternalResourceAuthorization({
          resource: "current_work",
          projectId,
          workspaceRoot: fresh.workspaceRoot,
        }),
        ...(currentWorkDocument.beforeBytes ? { beforeBytes: currentWorkDocument.beforeBytes } : {}),
        afterBytes: currentWorkDocument.afterBytes,
        mode: 0o600,
      },
    ];

    const transaction = await this.kernel.execute({
      runId: request.runId,
      projectId,
      workspaceRoot: fresh.workspaceRoot,
      projectOSRoot: fresh.projectOSRoot,
      restoreAuthority: { kind: "project_api" },
      operations: [...request.sourceOperations, ...internalOperations],
      beforeCommit: async () => {
        const commitWorkspace = this.workspaceStore.loadWorkspace(fresh.workspaceRoot);
        if ((await computeProjectGraphHash(commitWorkspace.graph)) !== request.changeSet.baseGraphHash) {
          throw new ProjectOSError("diff_stale", "Effective graph changed at transaction commit");
        }
        await request.beforeCommit?.();
      },
    });
    if (transaction.outcome === "committed") {
      const reloaded = this.workspaceStore.loadWorkspace(fresh.workspaceRoot);
      replaceWorkspaceState(request.workspace, reloaded);
    }
    return { ...transaction, graphHash: graphResult.graphHash };
  }

  async undo(
    workspace: LoadedProjectOSWorkspace,
    backupId: string,
  ): Promise<WriteTransactionResult> {
    if (!/^[A-Za-z0-9_-]+$/u.test(backupId)) {
      throw new ProjectOSError("backup_not_found", "Workspace transaction backup was not found");
    }
    const backupRoot = resolveContainedPath(
      workspace.projectOSRoot,
      join("apply-backups", backupId),
    );
    const manifest = ApplyBackupManifestWithOperationsSchema.parse(JSON.parse(
      readFileSync(join(backupRoot, "manifest.json"), "utf8"),
    ));
    if (manifest.projectId !== workspace.project.projectId || manifest.backupId !== backupId) {
      throw new ProjectOSError("backup_not_found", "Workspace transaction backup belongs to another project");
    }
    const restoreClassification = classifyApplyBackupRestoreAuthority(manifest);
    if (
      restoreClassification.state !== "authoritative" ||
      restoreClassification.authority.kind !== "project_api"
    ) {
      throw new ProjectOSError("backup_not_found", "Workspace transaction backup was not found");
    }
    const restoreAuthority = restoreClassification.authority;
    const operations: AuthorizedWriteOperation[] = [];
    for (const entry of manifest.files) {
      if (entry.operation === "internal") {
        const authorization = bindInternalResourceAuthorization({
          resource: entry.resource,
          projectId: manifest.projectId,
          workspaceRoot: workspace.workspaceRoot,
        });
        if (!authorization.existedAtBind || authorization.boundSha256 !== entry.afterSha256) {
          throw new ProjectOSError("undo_stale", `Internal resource '${entry.path}' changed after apply`);
        }
        const currentBytes = readFileSync(authorization.targetPath, { encoding: null });
        if (entry.existedBefore) {
          const originalBytes = readVerifiedBackup(backupRoot, entry.backupFile!, entry.originalSha256!);
          operations.push({ authorization, beforeBytes: currentBytes, afterBytes: originalBytes, mode: entry.mode });
        } else {
          operations.push({ authorization, beforeBytes: currentBytes, mode: entry.mode });
        }
        continue;
      }
      operations.push(reverseSourceOperation(workspace, backupRoot, entry));
    }
    const result = await this.kernel.execute({
      runId: `${manifest.runId}.undo.${backupId}`,
      projectId: manifest.projectId,
      workspaceRoot: workspace.workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      restoreAuthority,
      operations,
    });
    if (result.outcome === "committed") {
      replaceWorkspaceState(workspace, this.workspaceStore.loadWorkspace(workspace.workspaceRoot));
    }
    return result;
  }

  async undoAll(
    workspace: LoadedProjectOSWorkspace,
    backupIds: string[],
  ): Promise<WriteTransactionResult> {
    if (backupIds.length === 0 || backupIds.some((id) => !/^[A-Za-z0-9_-]+$/u.test(id))) {
      throw new ProjectOSError("backup_not_found", "Greenfield transaction backups were not found");
    }
    const records = backupIds.map((backupId) => {
      const root = resolveContainedPath(workspace.projectOSRoot, join("apply-backups", backupId));
      const manifest = ApplyBackupManifestWithOperationsSchema.parse(JSON.parse(
        readFileSync(join(root, "manifest.json"), "utf8"),
      ));
      if (manifest.projectId !== workspace.project.projectId || manifest.backupId !== backupId) {
        throw new ProjectOSError("backup_not_found", "Greenfield backup belongs to another project");
      }
      const restoreClassification = classifyApplyBackupRestoreAuthority(manifest);
      if (
        restoreClassification.state !== "authoritative" ||
        restoreClassification.authority.kind !== "project_api"
      ) {
        throw new ProjectOSError("backup_not_found", "Greenfield transaction backups were not found");
      }
      return { root, manifest };
    });
    const createdEntries = [...records].reverse().flatMap(({ root, manifest }) => manifest.files
      .filter((entry): entry is Exclude<typeof entry, { operation: "internal" }> => entry.operation !== "internal")
      .map((entry) => ({ root, entry })));
    if (
      createdEntries.some(({ entry }) => entry.operation !== "create") ||
      new Set(createdEntries.map(({ entry }) => entry.path)).size !== createdEntries.length
    ) {
      throw new ProjectOSError("backup_not_found", "Greenfield undo-all accepts distinct create operations only");
    }
    const operations: AuthorizedWriteOperation[] = createdEntries.map(({ entry }) =>
      reverseSourceOperation(workspace, "", entry));
    const resources = ["graph_product_overlay", "semantic_tree", "current_work"] as const;
    for (const resource of resources) {
      const chain = records.map(({ root, manifest }) => {
        const entry = manifest.files.find((candidate): candidate is Extract<typeof candidate, { operation: "internal" }> =>
          candidate.operation === "internal" && candidate.resource === resource);
        if (!entry) throw new ProjectOSError("backup_not_found", `Greenfield backup omits '${resource}'`);
        return { root, entry };
      });
      for (let index = 1; index < chain.length; index += 1) {
        const previous = chain[index - 1]!.entry;
        const current = chain[index]!.entry;
        if (!current.existedBefore || current.originalSha256 !== previous.afterSha256) {
          throw new ProjectOSError("undo_stale", `Greenfield '${resource}' checkpoint chain is stale`);
        }
      }
      const first = chain[0]!;
      const last = chain.at(-1)!;
      const authorization = bindInternalResourceAuthorization({
        resource,
        projectId: workspace.project.projectId,
        workspaceRoot: workspace.workspaceRoot,
      });
      if (!authorization.existedAtBind || authorization.boundSha256 !== last.entry.afterSha256) {
        throw new ProjectOSError("undo_stale", `Internal resource '${last.entry.path}' changed after initialization`);
      }
      const currentBytes = readFileSync(authorization.targetPath, { encoding: null });
      if (first.entry.existedBefore) {
        const originalBytes = readVerifiedBackup(
          first.root,
          first.entry.backupFile!,
          first.entry.originalSha256!,
        );
        operations.push({ authorization, beforeBytes: currentBytes, afterBytes: originalBytes, mode: first.entry.mode });
      } else {
        operations.push({ authorization, beforeBytes: currentBytes, mode: first.entry.mode });
      }
    }
    const result = await this.kernel.execute({
      runId: `${records[0]!.manifest.runId}.undo-all`,
      projectId: workspace.project.projectId,
      workspaceRoot: workspace.workspaceRoot,
      projectOSRoot: workspace.projectOSRoot,
      restoreAuthority: { kind: "project_api" },
      operations,
    });
    if (result.outcome === "committed") {
      replaceWorkspaceState(workspace, this.workspaceStore.loadWorkspace(workspace.workspaceRoot));
    }
    return result;
  }
}

function reverseSourceOperation(
  workspace: LoadedProjectOSWorkspace,
  backupRoot: string,
  entry: Exclude<
    ReturnType<typeof ApplyBackupManifestWithOperationsSchema.parse>["files"][number],
    { operation: "internal" }
  >,
): AuthorizedWriteOperation {
  const common = {
    projectId: workspace.project.projectId,
    nodeId: "workspace-transaction-undo",
    workspaceRoot: workspace.workspaceRoot,
    relativePath: entry.path,
  };
  if (entry.operation === "create") {
    const authorization = bindExistingFileAuthorization({ ...common, operation: "delete" });
    if (authorization.boundSha256 !== entry.afterSha256) {
      throw new ProjectOSError("undo_stale", `Created file '${entry.path}' changed after apply`);
    }
    return {
      authorization,
      beforeBytes: readFileSync(authorization.canonicalPath, { encoding: null }),
      mode: entry.mode,
    };
  }
  const originalBytes = readVerifiedBackup(backupRoot, entry.backupFile, entry.originalSha256);
  if (entry.operation === "delete") {
    return {
      authorization: bindCreateAuthorization(common),
      afterBytes: originalBytes,
      mode: entry.mode,
    };
  }
  const authorization = bindExistingFileAuthorization({ ...common, operation: "modify" });
  if (authorization.boundSha256 !== entry.afterSha256) {
    throw new ProjectOSError("undo_stale", `Modified file '${entry.path}' changed after apply`);
  }
  return {
    authorization,
    beforeBytes: readFileSync(authorization.canonicalPath, { encoding: null }),
    afterBytes: originalBytes,
    mode: entry.mode,
  };
}

function readVerifiedBackup(backupRoot: string, backupFile: string, expectedHash: string): Uint8Array {
  const path = resolveContainedPath(backupRoot, backupFile);
  const bytes = readFileSync(path, { encoding: null });
  if (sha256(bytes) !== expectedHash) {
    throw new ProjectOSError("backup_not_found", `Backup '${backupFile}' failed integrity validation`);
  }
  return bytes;
}

function validateSemanticTreeAgainstGraph(
  semanticTree: SemanticTree,
  graph: { projectId: string; nodes: Array<{ id: string }> },
): void {
  if (semanticTree.projectId !== graph.projectId) {
    throw new ProjectOSError("diff_scope_violation", "Semantic tree belongs to another project");
  }
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const visit = (node: SemanticTreeNode) => {
    if (node.sourceNodeId && !nodeIds.has(node.sourceNodeId)) {
      throw new ProjectOSError(
        "diff_scope_violation",
        `Semantic tree retains dangling graph node '${node.sourceNodeId}'`,
      );
    }
    node.children.forEach(visit);
  };
  semanticTree.roots.forEach(visit);
}

function validateSourceOperationsAgainstStructure(
  operations: AuthorizedWriteOperation[],
  graph: { fileIndex: Array<{ path: string; nodeIds: string[] }>; nodes: Array<{ id: string; linkedFiles: Array<{ path: string }> }> },
  semanticTree: SemanticTree,
): void {
  const semanticFiles = new Map<string, string | undefined>();
  const collect = (node: SemanticTreeNode) => {
    if (node.path) semanticFiles.set(node.path, node.sourceNodeId);
    node.children.forEach(collect);
  };
  semanticTree.roots.forEach(collect);
  for (const operation of operations) {
    const authorization = operation.authorization;
    if (authorization.operation === "internal") continue;
    const file = graph.fileIndex.find((entry) => entry.path === authorization.relativePath);
    const linkedOwners = graph.nodes
      .filter((node) => node.linkedFiles.some((linked) => linked.path === authorization.relativePath))
      .map((node) => node.id);
    if (authorization.operation === "delete") {
      if (file || linkedOwners.length > 0 || semanticFiles.has(authorization.relativePath)) {
        throw new ProjectOSError(
          "diff_scope_violation",
          `Deleted file '${authorization.relativePath}' remains referenced by workspace structure`,
        );
      }
      continue;
    }
    if (
      !file ||
      !file.nodeIds.includes(authorization.nodeId) ||
      !linkedOwners.includes(authorization.nodeId) ||
      semanticFiles.get(authorization.relativePath) !== authorization.nodeId
    ) {
      throw new ProjectOSError(
        "diff_scope_violation",
        `Written file '${authorization.relativePath}' is not owned consistently by graph and semantic tree`,
      );
    }
  }
}

function replaceWorkspaceState(
  target: LoadedProjectOSWorkspace,
  source: LoadedProjectOSWorkspace,
): void {
  target.graph = source.graph;
  if (source.graphBase) target.graphBase = source.graphBase;
  else delete target.graphBase;
  if (source.graphOverlay) target.graphOverlay = source.graphOverlay;
  else delete target.graphOverlay;
  target.semanticTree = source.semanticTree;
  target.currentWork = source.currentWork;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
