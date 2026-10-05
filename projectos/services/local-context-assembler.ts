import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";
import { spawnSync } from "node:child_process";

import {
  canonicalizeLocalContextBundle,
  NodeContextBundleSchema,
  LocalContextBundleSchema,
  type AgentContextBundle,
  type AgentContextBundleHashInput,
  type LocalContextBundle,
  type LocalContextBundleHashInput,
  type LocalContextFile,
  type LocalContextFileOmissionReason,
  type LocalContextNodeSummary,
  type NodeContextBundle,
  type NodeContextBundleHashInput,
} from "../contracts/local-context.js";
import { estimateProjectDescriptionTokens } from "../contracts/project-description.js";
import {
  canonicalizeCreateFileContextBundle,
  CreateFileContextBundleSchema,
  type CreateFileContextBundle,
  type CreateFileContextBundleHashInput,
} from "../contracts/create-file-context.js";
import type {
  FunctionalNode,
  LinkedFileRole,
} from "../contracts/graph.js";
import type { SemanticTreeNode } from "../contracts/semantic-tree.js";
import { ProjectOSError } from "../errors.js";
import type { LoadedProjectOSWorkspace } from "../persistence/workspace-store.js";
import { resolveContainedPath } from "../utils/path-containment.js";
import { containsHighConfidenceSecret } from "./high-confidence-secret-patterns.js";

export const SELECTED_FILE_MAX_ESTIMATED_TOKENS = 3_000;
export const CONNECTED_CONTEXT_TOKEN_LIMIT = 8_000;
export const CONNECTED_FILE_TOKEN_LIMIT = 2_000;
export const CONNECTED_FILE_LIMIT = 8;
export const CHILD_NODE_LIMIT = 24;
export const CHILD_NODE_CONTEXT_TOKEN_LIMIT = 2_000;

const CONNECTED_FILE_HARD_BYTE_LIMIT = 1_048_576;
const SELECTED_FILE_HARD_BYTE_LIMIT = 1_048_576;
const SYNOPSIS_NODE_LIMIT = 8;
const SYNOPSIS_SUMMARY_CHARACTER_LIMIT = 180;

const LINKED_ROLE_ORDER: Record<LinkedFileRole, number> = {
  primary: 0,
  supporting: 1,
  config: 2,
  test: 3,
};

const ALWAYS_IGNORED_COMPONENTS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
]);

const SENSITIVE_EXTENSIONS = new Set([
  ".key",
  ".pem",
  ".p12",
  ".pfx",
  ".crt",
  ".cer",
]);

export interface WorkspaceIgnorePolicy {
  ignoredPaths(workspaceRoot: string, paths: string[]): Set<string>;
}

export class DefaultWorkspaceIgnorePolicy implements WorkspaceIgnorePolicy {
  ignoredPaths(workspaceRoot: string, paths: string[]): Set<string> {
    const normalizedPaths = paths.map(normalizeRelativePath);
    const ignored = new Set(
      normalizedPaths.filter((path) => hasIgnoredComponent(path)),
    );

    if (!existsSync(join(workspaceRoot, ".git"))) {
      return ignored;
    }

    const gitCandidates = normalizedPaths.filter(
      (path) => !isUnsafeRelativePath(path) && !targetsProtectedPath(path),
    );
    if (gitCandidates.length === 0) {
      return ignored;
    }

    const result = spawnSync(
      "git",
      ["-C", workspaceRoot, "check-ignore", "--no-index", "-z", "--stdin"],
      {
        input: `${gitCandidates.join("\0")}\0`,
        encoding: "utf8",
      },
    );
    if (result.error || (result.status !== 0 && result.status !== 1)) {
      return ignored;
    }
    for (const path of result.stdout.split("\0")) {
      if (path) {
        ignored.add(normalizeRelativePath(path));
      }
    }
    return ignored;
  }
}

export interface AssembleLocalContextInput {
  workspace: LoadedProjectOSWorkspace;
  nodeId: string;
  selectedFilePath: string;
  responseLanguage: string;
  assembledAt: string;
}

export interface AssembleNodeContextInput {
  workspace: LoadedProjectOSWorkspace;
  nodeId: string;
  responseLanguage: string;
  assembledAt: string;
}

export interface AssembleCreateFileContextInput {
  workspace: LoadedProjectOSWorkspace;
  nodeContext: NodeContextBundle;
  intendedFilePath: string;
  responsibility: string;
  assembledAt: string;
}

export interface AssembleScaffoldFileContextInput {
  workspace: LoadedProjectOSWorkspace;
  parentNodeContext: NodeContextBundle;
  prospectiveNode: LocalContextNodeSummary;
  intendedFilePath: string;
  responsibility: string;
  assembledAt: string;
}

export interface AssembleGreenfieldScaffoldFileContextInput {
  workspace: LoadedProjectOSWorkspace;
  prospectiveNode: LocalContextNodeSummary;
  prospectiveParent: LocalContextNodeSummary | null;
  intendedFilePath: string;
  responsibility: string;
  responseLanguage: string;
  assembledAt: string;
}

export interface LocalContextAssemblerOptions {
  ignorePolicy?: WorkspaceIgnorePolicy;
}

interface FileCandidate {
  path: string;
  role: LinkedFileRole;
  relationship: "selected" | "connected";
}

interface InspectedFile {
  path: string;
  canonicalPath: string;
  identity: string;
  bytes: Uint8Array;
  content: string;
  sha256: string;
  device: number;
  inode: number;
}

interface InspectionFailure {
  path: string;
  reason: LocalContextFileOmissionReason;
  byteLength?: number;
  sha256?: string;
}

interface ManifestAssemblyResult {
  manifest: LocalContextFile[];
  selectedEstimatedTokens: number;
  connectedEstimatedTokensIncluded: number;
}

export class LocalContextAssembler {
  private readonly ignorePolicy: WorkspaceIgnorePolicy;

  constructor(options: LocalContextAssemblerOptions = {}) {
    this.ignorePolicy = options.ignorePolicy ?? new DefaultWorkspaceIgnorePolicy();
  }

  assemble(input: AssembleLocalContextInput): LocalContextBundle {
    const { workspace } = input;
    assertProjectDescriptionBinding(workspace);
    const selectedNode = workspace.graph.nodes.find(
      (node) => node.id === input.nodeId,
    );
    if (!selectedNode) {
      throw new ProjectOSError(
        "local_context_unavailable",
        `Selected node '${input.nodeId}' was not found in project '${workspace.project.projectId}'`,
      );
    }

    const selectedPath = normalizeRelativePath(input.selectedFilePath);
    const linkedCandidates = collectNodeFileCandidates(workspace, selectedNode);
    const selectedLinkedFile = linkedCandidates.find(
      (candidate) => candidate.path === selectedPath,
    );
    if (!selectedLinkedFile) {
      throw new ProjectOSError(
        "local_context_unavailable",
        `Selected file '${selectedPath}' is not linked to node '${selectedNode.id}'`,
      );
    }

    const candidates: FileCandidate[] = [
      { ...selectedLinkedFile, relationship: "selected" },
      ...linkedCandidates
        .filter((candidate) => candidate.path !== selectedPath)
        .sort(compareConnectedCandidates)
        .map((candidate) => ({ ...candidate, relationship: "connected" as const })),
    ];
    const {
      manifest,
      selectedEstimatedTokens,
      connectedEstimatedTokensIncluded,
    } = this.assembleManifest(workspace, candidates);

    const selectedManifest = manifest.find(
      (file) => file.relationship === "selected",
    );
    if (!selectedManifest || selectedManifest.disposition !== "exact") {
      throw new ProjectOSError(
        "local_context_unavailable",
        `Selected file '${selectedPath}' could not be included exactly`,
      );
    }

    const projectSynopsis = deriveProjectSynopsis(workspace);
    const descriptionEstimatedTokens = estimateProjectDescriptionTokens(
      workspace.projectDescription.conciseDescription,
    );
    const neighborhood = deriveNeighborhood(workspace, selectedNode);
    const allowedReadPaths = manifest
      .filter((file) => file.disposition !== "omitted")
      .map((file) => file.path);
    const hashInput: LocalContextBundleHashInput = {
      version: "0.2.0",
      projectId: workspace.project.projectId,
      assembledAt: input.assembledAt,
      scope: {
        nodeId: selectedNode.id,
        selectedFilePath: selectedManifest.path,
      },
      responseLanguage: input.responseLanguage,
      project: {
        displayName: workspace.project.displayName,
        framework: workspace.project.framework,
        description: {
          content: workspace.projectDescription.conciseDescription,
          source: workspace.projectDescription.source,
          estimatedTokens: descriptionEstimatedTokens,
        },
        synopsis: projectSynopsis.synopsis,
        synopsisSource: "derived_project_graph",
        graphAnalyzedAt: workspace.graph.analyzedAt,
        graphAnalysisStatus: workspace.graph.analysisStatus,
        synopsisOmittedNodeCount: projectSynopsis.omittedNodeCount,
      },
      neighborhood,
      fileManifest: manifest,
      allowedReadPaths,
      allowedWritePaths: [selectedManifest.path],
      budget: {
        estimator: "unicode_chars_div_4_v1",
        descriptionEstimatedTokens,
        selectedEstimatedTokens,
        connectedTokenLimit: CONNECTED_CONTEXT_TOKEN_LIMIT,
        connectedEstimatedTokensIncluded,
        connectedFileLimit: CONNECTED_FILE_LIMIT,
      },
    };
    return LocalContextBundleSchema.parse({
      ...hashInput,
      bundleHash: computeLocalContextBundleHash(hashInput),
    });
  }

  assembleNode(input: AssembleNodeContextInput): NodeContextBundle {
    const { workspace } = input;
    assertProjectDescriptionBinding(workspace);
    const selectedNode = workspace.graph.nodes.find(
      (node) => node.id === input.nodeId,
    );
    if (!selectedNode) {
      throw new ProjectOSError(
        "local_context_unavailable",
        `Selected node '${input.nodeId}' was not found in project '${workspace.project.projectId}'`,
      );
    }

    const candidates: FileCandidate[] = collectNodeFileCandidates(
      workspace,
      selectedNode,
    )
      .sort(compareConnectedCandidates)
      .map((candidate) => ({ ...candidate, relationship: "connected" }));
    const { manifest, connectedEstimatedTokensIncluded } = this.assembleManifest(
      workspace,
      candidates,
    );
    const projectSynopsis = deriveProjectSynopsis(workspace);
    const descriptionEstimatedTokens = estimateProjectDescriptionTokens(
      workspace.projectDescription.conciseDescription,
    );
    const hashInput: NodeContextBundleHashInput = {
      version: "0.2.0",
      projectId: workspace.project.projectId,
      assembledAt: input.assembledAt,
      scope: {
        kind: "node",
        nodeId: selectedNode.id,
      },
      responseLanguage: input.responseLanguage,
      project: {
        displayName: workspace.project.displayName,
        framework: workspace.project.framework,
        description: {
          content: workspace.projectDescription.conciseDescription,
          source: workspace.projectDescription.source,
          estimatedTokens: descriptionEstimatedTokens,
        },
        synopsis: projectSynopsis.synopsis,
        synopsisSource: "derived_project_graph",
        graphAnalyzedAt: workspace.graph.analyzedAt,
        graphAnalysisStatus: workspace.graph.analysisStatus,
        synopsisOmittedNodeCount: projectSynopsis.omittedNodeCount,
      },
      neighborhood: deriveNeighborhood(workspace, selectedNode),
      fileManifest: manifest,
      allowedReadPaths: manifest
        .filter((file) => file.disposition !== "omitted")
        .map((file) => file.path),
      allowedWritePaths: [],
      budget: {
        estimator: "unicode_chars_div_4_v1",
        descriptionEstimatedTokens,
        selectedEstimatedTokens: 0,
        connectedTokenLimit: CONNECTED_CONTEXT_TOKEN_LIMIT,
        connectedEstimatedTokensIncluded,
        connectedFileLimit: CONNECTED_FILE_LIMIT,
      },
    };
    return NodeContextBundleSchema.parse({
      ...hashInput,
      bundleHash: computeLocalContextBundleHash(hashInput),
    });
  }

  assembleCreateFile(input: AssembleCreateFileContextInput): CreateFileContextBundle {
    const { workspace } = input;
    const nodeContext = NodeContextBundleSchema.parse(input.nodeContext);
    if (!verifyNodeContextBundleHash(nodeContext)) {
      throw new ProjectOSError("local_context_unavailable", "Node context hash is invalid");
    }
    const node = workspace.graph.nodes.find(
      (candidate) => candidate.id === nodeContext.scope.nodeId,
    );
    if (!node || node.level !== "component" || node.elementType !== "component") {
      throw new ProjectOSError(
        "local_context_unavailable",
        "New files can only be created inside an existing component node",
      );
    }
    const intendedFilePath = normalizeRelativePath(input.intendedFilePath);
    if (
      isUnsafeRelativePath(input.intendedFilePath) ||
      targetsProtectedPath(intendedFilePath) ||
      basename(intendedFilePath) !== basename(input.intendedFilePath) ||
      basename(intendedFilePath).length === 0
    ) {
      throw new ProjectOSError("diff_scope_violation", "Proposed create path is unsafe");
    }
    const rawParentDirectory = dirname(intendedFilePath);
    const parentDirectoryPath = rawParentDirectory === "."
      ? "."
      : normalizeRelativePath(rawParentDirectory);
    const ownedParentDirectories = new Set(
      collectNodeFileCandidates(workspace, node).map((file) => {
        const parent = dirname(file.path);
        return parent === "." ? "." : normalizeRelativePath(parent);
      }),
    );
    if (!ownedParentDirectories.has(parentDirectoryPath)) {
      throw new ProjectOSError(
        "diff_scope_violation",
        "Proposed file is outside the component's existing directory scope",
      );
    }
    const parentCanonicalPath = resolveContainedPath(
      workspace.workspaceRoot,
      parentDirectoryPath,
    );
    const parentStats = lstatSync(parentCanonicalPath);
    if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
      throw new ProjectOSError("diff_scope_violation", "Authorized create parent is invalid");
    }
    if (existsSync(resolve(parentCanonicalPath, basename(intendedFilePath)))) {
      throw new ProjectOSError("diff_stale", `Create target '${intendedFilePath}' already exists`);
    }
    const responsibility = input.responsibility.trim();
    if (!responsibility || responsibility.length > 2_000) {
      throw new ProjectOSError("local_context_unavailable", "File responsibility is invalid");
    }
    const hashInput: CreateFileContextBundleHashInput = {
      version: "0.1.0",
      projectId: workspace.project.projectId,
      assembledAt: input.assembledAt,
      scope: {
        kind: "leaf-create",
        nodeId: node.id,
        intendedFilePath,
        parentDirectoryPath,
        responsibility,
      },
      responseLanguage: nodeContext.responseLanguage,
      nodeContext,
      allowedReadPaths: [...nodeContext.allowedReadPaths],
      allowedWritePaths: [intendedFilePath],
    };
    return CreateFileContextBundleSchema.parse({
      ...hashInput,
      bundleHash: computeCreateFileContextBundleHash(hashInput),
    });
  }

  assembleScaffoldFile(input: AssembleScaffoldFileContextInput): CreateFileContextBundle {
    const parentContext = NodeContextBundleSchema.parse(input.parentNodeContext);
    if (!verifyNodeContextBundleHash(parentContext)) {
      throw new ProjectOSError("local_context_unavailable", "Parent node context hash is invalid");
    }
    const intendedFilePath = normalizeRelativePath(input.intendedFilePath);
    if (
      isUnsafeRelativePath(input.intendedFilePath) ||
      targetsProtectedPath(intendedFilePath) ||
      basename(intendedFilePath) !== basename(input.intendedFilePath) ||
      basename(intendedFilePath).length === 0
    ) {
      throw new ProjectOSError("diff_scope_violation", "Proposed scaffold path is unsafe");
    }
    const parentDirectoryPath = dirname(intendedFilePath) === "."
      ? "."
      : normalizeRelativePath(dirname(intendedFilePath));
    const parentCanonicalPath = resolveContainedPath(
      input.workspace.workspaceRoot,
      parentDirectoryPath,
    );
    const parentStats = lstatSync(parentCanonicalPath);
    if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
      throw new ProjectOSError("diff_scope_violation", "Scaffold parent directory is invalid");
    }
    if (existsSync(resolve(parentCanonicalPath, basename(intendedFilePath)))) {
      throw new ProjectOSError("diff_stale", `Create target '${intendedFilePath}' already exists`);
    }
    const responsibility = input.responsibility.trim();
    if (!responsibility || responsibility.length > 2_000) {
      throw new ProjectOSError("local_context_unavailable", "File responsibility is invalid");
    }
    const { bundleHash: _parentBundleHash, ...parentContextHashable } = parentContext;
    const prospectiveHashInput: NodeContextBundleHashInput = {
      ...parentContextHashable,
      assembledAt: input.assembledAt,
      scope: { kind: "node", nodeId: input.prospectiveNode.id },
      neighborhood: {
        selected: input.prospectiveNode,
        parent: parentContext.neighborhood.selected,
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
    };
    const nodeContext = NodeContextBundleSchema.parse({
      ...prospectiveHashInput,
      bundleHash: computeLocalContextBundleHash(prospectiveHashInput),
    });
    const hashInput: CreateFileContextBundleHashInput = {
      version: "0.1.0",
      projectId: input.workspace.project.projectId,
      assembledAt: input.assembledAt,
      scope: {
        kind: "leaf-create",
        nodeId: input.prospectiveNode.id,
        intendedFilePath,
        parentDirectoryPath,
        responsibility,
      },
      responseLanguage: nodeContext.responseLanguage,
      nodeContext,
      allowedReadPaths: [...nodeContext.allowedReadPaths],
      allowedWritePaths: [intendedFilePath],
    };
    return CreateFileContextBundleSchema.parse({
      ...hashInput,
      bundleHash: computeCreateFileContextBundleHash(hashInput),
    });
  }

  assembleGreenfieldScaffoldFile(
    input: AssembleGreenfieldScaffoldFileContextInput,
  ): CreateFileContextBundle {
    const { workspace } = input;
    assertProjectDescriptionBinding(workspace);
    const intendedFilePath = normalizeRelativePath(input.intendedFilePath);
    if (
      isUnsafeRelativePath(input.intendedFilePath) ||
      targetsProtectedPath(intendedFilePath) ||
      basename(intendedFilePath) !== basename(input.intendedFilePath) ||
      basename(intendedFilePath).length === 0
    ) {
      throw new ProjectOSError("diff_scope_violation", "Proposed greenfield scaffold path is unsafe");
    }
    const parentDirectoryPath = dirname(intendedFilePath) === "."
      ? "."
      : normalizeRelativePath(dirname(intendedFilePath));
    const parentCanonicalPath = resolveContainedPath(workspace.workspaceRoot, parentDirectoryPath);
    const parentStats = lstatSync(parentCanonicalPath);
    if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
      throw new ProjectOSError("diff_scope_violation", "Greenfield scaffold parent directory is invalid");
    }
    if (existsSync(resolve(parentCanonicalPath, basename(intendedFilePath)))) {
      throw new ProjectOSError("diff_stale", `Create target '${intendedFilePath}' already exists`);
    }
    const responsibility = input.responsibility.trim();
    if (!responsibility || responsibility.length > 2_000) {
      throw new ProjectOSError("local_context_unavailable", "File responsibility is invalid");
    }
    const projectSynopsis = deriveProjectSynopsis(workspace);
    const descriptionEstimatedTokens = estimateProjectDescriptionTokens(
      workspace.projectDescription.conciseDescription,
    );
    const nodeHashInput: NodeContextBundleHashInput = {
      version: "0.2.0",
      projectId: workspace.project.projectId,
      assembledAt: input.assembledAt,
      scope: { kind: "node", nodeId: input.prospectiveNode.id },
      responseLanguage: input.responseLanguage,
      project: {
        displayName: workspace.project.displayName,
        framework: workspace.project.framework,
        description: {
          content: workspace.projectDescription.conciseDescription,
          source: workspace.projectDescription.source,
          estimatedTokens: descriptionEstimatedTokens,
        },
        synopsis: projectSynopsis.synopsis,
        synopsisSource: "derived_project_graph",
        graphAnalyzedAt: workspace.graph.analyzedAt,
        graphAnalysisStatus: workspace.graph.analysisStatus,
        synopsisOmittedNodeCount: projectSynopsis.omittedNodeCount,
      },
      neighborhood: {
        selected: input.prospectiveNode,
        parent: input.prospectiveParent,
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
      fileManifest: [],
      allowedReadPaths: [],
      allowedWritePaths: [],
      budget: {
        estimator: "unicode_chars_div_4_v1",
        descriptionEstimatedTokens,
        selectedEstimatedTokens: 0,
        connectedTokenLimit: CONNECTED_CONTEXT_TOKEN_LIMIT,
        connectedEstimatedTokensIncluded: 0,
        connectedFileLimit: CONNECTED_FILE_LIMIT,
      },
    };
    const nodeContext = NodeContextBundleSchema.parse({
      ...nodeHashInput,
      bundleHash: computeLocalContextBundleHash(nodeHashInput),
    });
    const hashInput: CreateFileContextBundleHashInput = {
      version: "0.1.0",
      projectId: workspace.project.projectId,
      assembledAt: input.assembledAt,
      scope: {
        kind: "leaf-create",
        nodeId: input.prospectiveNode.id,
        intendedFilePath,
        parentDirectoryPath,
        responsibility,
      },
      responseLanguage: input.responseLanguage,
      nodeContext,
      allowedReadPaths: [],
      allowedWritePaths: [intendedFilePath],
    };
    return CreateFileContextBundleSchema.parse({
      ...hashInput,
      bundleHash: computeCreateFileContextBundleHash(hashInput),
    });
  }

  private assembleManifest(
    workspace: LoadedProjectOSWorkspace,
    candidates: FileCandidate[],
  ): ManifestAssemblyResult {
    const ignoredPaths = this.ignorePolicy.ignoredPaths(
      workspace.workspaceRoot,
      candidates.map((candidate) => candidate.path),
    );
    const manifest: LocalContextFile[] = [];
    const seenCanonicalPaths = new Set<string>();
    const seenIdentities = new Set<string>();
    let selectedEstimatedTokens = 0;
    let connectedEstimatedTokensIncluded = 0;
    let connectedFilesIncluded = 0;

    for (const candidate of candidates) {
      if (candidate.relationship === "connected") {
        if (connectedEstimatedTokensIncluded >= CONNECTED_CONTEXT_TOKEN_LIMIT) {
          manifest.push(omittedManifestEntry(candidate, "budget_exhausted"));
          continue;
        }
        if (connectedFilesIncluded >= CONNECTED_FILE_LIMIT) {
          manifest.push(omittedManifestEntry(candidate, "connected_file_limit"));
          continue;
        }
      }

      const failureBeforeRead = classifyPathBeforeRead(candidate.path, ignoredPaths);
      if (failureBeforeRead) {
        this.handleUnavailableCandidate(candidate, failureBeforeRead);
        manifest.push(omittedManifestEntry(candidate, failureBeforeRead));
        continue;
      }
      const inspected = inspectWorkspaceFile(
        workspace.workspaceRoot,
        candidate.path,
        candidate.relationship,
      );
      if ("reason" in inspected) {
        this.handleUnavailableCandidate(candidate, inspected.reason);
        manifest.push(
          omittedManifestEntry(
            candidate,
            inspected.reason,
            inspected.byteLength,
            inspected.sha256,
          ),
        );
        continue;
      }
      if (
        seenCanonicalPaths.has(inspected.canonicalPath) ||
        seenIdentities.has(inspected.identity)
      ) {
        continue;
      }
      seenCanonicalPaths.add(inspected.canonicalPath);
      seenIdentities.add(inspected.identity);

      if (containsHighConfidenceSecret(inspected.content)) {
        this.handleUnavailableCandidate(candidate, "secret_risk");
        manifest.push(
          omittedManifestEntry(
            candidate,
            "secret_risk",
            inspected.bytes.byteLength,
            inspected.sha256,
          ),
        );
        continue;
      }

      const estimatedTokens = estimateTokens(inspected.content);
      if (candidate.relationship === "selected") {
        if (estimatedTokens > SELECTED_FILE_MAX_ESTIMATED_TOKENS) {
          throw unavailableSelectedFile(candidate.path, "selected_file_too_large");
        }
        selectedEstimatedTokens = estimatedTokens;
        manifest.push(exactManifestEntry(candidate, inspected));
        continue;
      }

      const remainingTokens =
        CONNECTED_CONTEXT_TOKEN_LIMIT - connectedEstimatedTokensIncluded;
      const includedTokenLimit = Math.min(CONNECTED_FILE_TOKEN_LIMIT, remainingTokens);
      if (includedTokenLimit <= 0) {
        manifest.push(
          omittedManifestEntry(
            candidate,
            "budget_exhausted",
            inspected.bytes.byteLength,
            inspected.sha256,
          ),
        );
        continue;
      }
      if (estimatedTokens <= includedTokenLimit) {
        manifest.push(exactManifestEntry(candidate, inspected));
        connectedEstimatedTokensIncluded += estimatedTokens;
      } else {
        const content = truncateToEstimatedTokens(inspected.content, includedTokenLimit);
        const includedByteLength = new TextEncoder().encode(content).byteLength;
        manifest.push({
          path: candidate.path,
          relationship: candidate.relationship,
          linkedRole: candidate.role,
          disposition: "truncated",
          byteLength: inspected.bytes.byteLength,
          sha256: inspected.sha256,
          includedByteLength,
          content,
          truncation: {
            strategy: "utf8_prefix",
            omittedByteLength: inspected.bytes.byteLength - includedByteLength,
          },
        });
        connectedEstimatedTokensIncluded += estimateTokens(content);
      }
      connectedFilesIncluded += 1;
    }
    return {
      manifest,
      selectedEstimatedTokens,
      connectedEstimatedTokensIncluded,
    };
  }

  resolveAllowedWriteTarget(
    workspaceRoot: string,
    relativePath: string,
    expectedSha256: string,
  ): ResolvedLocalContextWriteTarget {
    const normalizedPath = normalizeRelativePath(relativePath);
    const failureBeforeRead = classifyPathBeforeRead(normalizedPath, new Set());
    if (failureBeforeRead) {
      throw unavailableSelectedFile(normalizedPath, failureBeforeRead);
    }
    const inspected = inspectWorkspaceFile(workspaceRoot, normalizedPath, "selected");
    if ("reason" in inspected) {
      throw unavailableSelectedFile(normalizedPath, inspected.reason);
    }
    if (inspected.sha256 !== expectedSha256) {
      throw new ProjectOSError(
        "local_context_unavailable",
        `Selected file '${normalizedPath}' changed while local context was assembled`,
      );
    }
    return {
      relativePath: normalizedPath,
      canonicalPath: inspected.canonicalPath,
      device: inspected.device,
      inode: inspected.inode,
    };
  }

  private handleUnavailableCandidate(
    candidate: FileCandidate,
    reason: LocalContextFileOmissionReason,
  ): void {
    if (candidate.relationship === "selected") {
      throw unavailableSelectedFile(candidate.path, reason);
    }
  }
}

export interface ResolvedLocalContextWriteTarget {
  relativePath: string;
  canonicalPath: string;
  device: number;
  inode: number;
}

export function computeLocalContextBundleHash(
  bundle: AgentContextBundle | AgentContextBundleHashInput,
): string {
  const digest = createHash("sha256")
    .update(canonicalizeLocalContextBundle(bundle), "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

export function verifyLocalContextBundleHash(bundle: LocalContextBundle): boolean {
  const parsed = LocalContextBundleSchema.safeParse(bundle);
  return parsed.success && computeLocalContextBundleHash(parsed.data) === bundle.bundleHash;
}

export function verifyNodeContextBundleHash(bundle: NodeContextBundle): boolean {
  const parsed = NodeContextBundleSchema.safeParse(bundle);
  return parsed.success && computeLocalContextBundleHash(parsed.data) === bundle.bundleHash;
}

export function computeCreateFileContextBundleHash(
  bundle: CreateFileContextBundle | CreateFileContextBundleHashInput,
): string {
  return `sha256:${createHash("sha256")
    .update(canonicalizeCreateFileContextBundle(bundle), "utf8")
    .digest("hex")}`;
}

export function verifyCreateFileContextBundleHash(bundle: CreateFileContextBundle): boolean {
  const parsed = CreateFileContextBundleSchema.safeParse(bundle);
  return parsed.success && computeCreateFileContextBundleHash(parsed.data) === bundle.bundleHash;
}

function collectNodeFileCandidates(
  workspace: LoadedProjectOSWorkspace,
  node: FunctionalNode,
): Array<{ path: string; role: LinkedFileRole }> {
  const byPath = new Map<string, LinkedFileRole>();
  for (const linkedFile of node.linkedFiles) {
    addCandidateRole(byPath, linkedFile.path, linkedFile.role);
  }
  visitSemanticTree(workspace.semanticTree.roots, (semanticNode) => {
    if (semanticNode.sourceNodeId === node.id && semanticNode.path) {
      addCandidateRole(
        byPath,
        semanticNode.path,
        roleForSemanticNode(semanticNode),
      );
    }
  });
  return [...byPath.entries()].map(([path, role]) => ({ path, role }));
}

function assertProjectDescriptionBinding(workspace: LoadedProjectOSWorkspace): void {
  if (workspace.projectDescription.projectId !== workspace.project.projectId) {
    throw new ProjectOSError(
      "local_context_unavailable",
      "Project description does not belong to the selected project",
    );
  }
}

function addCandidateRole(
  byPath: Map<string, LinkedFileRole>,
  path: string,
  role: LinkedFileRole,
): void {
  const normalizedPath = normalizeRelativePath(path);
  const existing = byPath.get(normalizedPath);
  if (!existing || LINKED_ROLE_ORDER[role] < LINKED_ROLE_ORDER[existing]) {
    byPath.set(normalizedPath, role);
  }
}

function visitSemanticTree(
  roots: SemanticTreeNode[],
  visitor: (node: SemanticTreeNode) => void,
): void {
  for (const node of roots) {
    visitor(node);
    visitSemanticTree(node.children, visitor);
  }
}

function roleForSemanticNode(node: SemanticTreeNode): LinkedFileRole {
  if (node.kind === "config") return "config";
  if (node.kind === "test") return "test";
  return node.kind === "route" ? "primary" : "supporting";
}

function compareConnectedCandidates(
  left: { path: string; role: LinkedFileRole },
  right: { path: string; role: LinkedFileRole },
): number {
  const roleDifference = LINKED_ROLE_ORDER[left.role] - LINKED_ROLE_ORDER[right.role];
  return roleDifference !== 0 ? roleDifference : compareCodeUnits(left.path, right.path);
}

function deriveProjectSynopsis(workspace: LoadedProjectOSWorkspace): {
  synopsis: string;
  omittedNodeCount: number;
} {
  const topLevelNodes = workspace.graph.nodes.filter((node) => !node.parentId);
  const includedNodes = topLevelNodes.slice(0, SYNOPSIS_NODE_LIMIT);
  const lines = [
    `${workspace.project.displayName} is a ${workspace.project.framework} project represented by the ${workspace.graph.projectName} graph.`,
    "",
    "Primary capabilities:",
    ...includedNodes.map((node) =>
      `- ${node.nameEn ?? node.name}: ${truncateCharacters(node.summary, SYNOPSIS_SUMMARY_CHARACTER_LIMIT)}`,
    ),
    "",
    `Graph analysis: ${workspace.graph.analysisStatus}, analyzed ${workspace.graph.analyzedAt}.`,
  ];
  const omittedNodeCount = topLevelNodes.length - includedNodes.length;
  if (omittedNodeCount > 0) {
    const omittedSubject = omittedNodeCount === 1
      ? "1 top-level graph node is"
      : `${omittedNodeCount} top-level graph nodes are`;
    lines.push(
      `${omittedSubject} not listed in this concise project synopsis. ` +
        "This does not describe coverage of the selected-node neighborhood or file context.",
    );
  }
  return { synopsis: lines.join("\n"), omittedNodeCount };
}

function deriveNeighborhood(
  workspace: LoadedProjectOSWorkspace,
  selectedNode: FunctionalNode,
): LocalContextBundle["neighborhood"] {
  const nodesById = new Map(workspace.graph.nodes.map((node) => [node.id, node]));
  const unresolvedNodeIds: string[] = [];
  const resolveNodes = (ids: string[]): LocalContextNodeSummary[] => {
    const resolved: LocalContextNodeSummary[] = [];
    for (const id of ids) {
      const node = nodesById.get(id);
      if (node) {
        resolved.push(toNodeSummary(node));
      } else if (!unresolvedNodeIds.includes(id)) {
        unresolvedNodeIds.push(id);
      }
    }
    return resolved;
  };
  const parent = selectedNode.parentId
    ? resolveNodes([selectedNode.parentId])[0] ?? null
    : null;
  const resolvedChildren = resolveNodes(selectedNode.children ?? []);
  const children: LocalContextNodeSummary[] = [];
  let estimatedTokensIncluded = 0;
  for (const child of resolvedChildren) {
    if (children.length >= CHILD_NODE_LIMIT) break;
    const estimatedTokens = estimateTokens(JSON.stringify(child));
    if (
      estimatedTokensIncluded + estimatedTokens >
      CHILD_NODE_CONTEXT_TOKEN_LIMIT
    ) {
      break;
    }
    children.push(child);
    estimatedTokensIncluded += estimatedTokens;
  }
  return {
    selected: toNodeSummary(selectedNode),
    parent,
    children,
    childrenCoverage: {
      totalCount: resolvedChildren.length,
      includedCount: children.length,
      omittedCount: resolvedChildren.length - children.length,
      estimatedTokensIncluded,
    },
    upstream: resolveNodes(selectedNode.upstream),
    downstream: resolveNodes(selectedNode.downstream),
    unresolvedNodeIds,
  };
}

function toNodeSummary(node: FunctionalNode): LocalContextNodeSummary {
  return {
    id: node.id,
    name: node.nameEn ?? node.name,
    summary: node.summary,
    ...(node.responsibility ? { responsibility: node.responsibility } : {}),
    status: node.status,
  };
}

function classifyPathBeforeRead(
  path: string,
  ignoredPaths: Set<string>,
): LocalContextFileOmissionReason | undefined {
  if (isUnsafeRelativePath(path) || targetsProtectedPath(path)) {
    return "protected_path";
  }
  if (ignoredPaths.has(normalizeRelativePath(path))) {
    return "ignored";
  }
  if (isSensitivePath(path)) {
    return "sensitive_path";
  }
  return undefined;
}

function inspectWorkspaceFile(
  workspaceRoot: string,
  path: string,
  relationship: "selected" | "connected",
): InspectedFile | InspectionFailure {
  const normalizedPath = normalizeRelativePath(path);
  const realRoot = realpathSync(workspaceRoot);
  const lexicalPath = resolve(realRoot, normalizedPath);
  const relativeLexicalPath = relative(realRoot, lexicalPath);
  if (
    relativeLexicalPath === ".." ||
    relativeLexicalPath.startsWith(`..${sep}`) ||
    isAbsolute(relativeLexicalPath)
  ) {
    return { path: normalizedPath, reason: "protected_path" };
  }

  let current = realRoot;
  for (const component of relativeLexicalPath.split(sep).filter(Boolean)) {
    current = join(current, component);
    if (!existsSync(current)) {
      return { path: normalizedPath, reason: "missing" };
    }
    try {
      if (lstatSync(current).isSymbolicLink()) {
        return { path: normalizedPath, reason: "symlink" };
      }
    } catch {
      return { path: normalizedPath, reason: "read_failed" };
    }
  }

  let canonicalPath: string;
  try {
    canonicalPath = resolveContainedPath(realRoot, normalizedPath);
  } catch {
    return { path: normalizedPath, reason: "read_failed" };
  }
  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = lstatSync(canonicalPath);
  } catch {
    return { path: normalizedPath, reason: "read_failed" };
  }
  if (!stats.isFile()) {
    return { path: normalizedPath, reason: "not_regular" };
  }
  if (
    relationship === "selected" &&
    stats.size > SELECTED_FILE_HARD_BYTE_LIMIT
  ) {
    return { path: normalizedPath, reason: "selected_file_too_large" };
  }
  if (
    relationship === "connected" &&
    stats.size > CONNECTED_FILE_HARD_BYTE_LIMIT
  ) {
    return { path: normalizedPath, reason: "connected_file_too_large" };
  }

  let bytes: Uint8Array;
  try {
    bytes = readFileSync(canonicalPath, { encoding: null });
  } catch {
    return { path: normalizedPath, reason: "read_failed" };
  }
  const sha256 = hashBytes(bytes);
  if (bytes.includes(0)) {
    return {
      path: normalizedPath,
      reason: "binary",
      byteLength: bytes.byteLength,
      sha256,
    };
  }

  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return {
      path: normalizedPath,
      reason: "invalid_utf8",
      byteLength: bytes.byteLength,
      sha256,
    };
  }
  return {
    path: normalizedPath,
    canonicalPath,
    identity: `${stats.dev}:${stats.ino}`,
    bytes,
    content,
    sha256,
    device: stats.dev,
    inode: stats.ino,
  };
}

function exactManifestEntry(
  candidate: FileCandidate,
  inspected: InspectedFile,
): LocalContextFile {
  return {
    path: candidate.path,
    relationship: candidate.relationship,
    linkedRole: candidate.role,
    disposition: "exact",
    byteLength: inspected.bytes.byteLength,
    sha256: inspected.sha256,
    includedByteLength: inspected.bytes.byteLength,
    content: inspected.content,
  };
}

function omittedManifestEntry(
  candidate: FileCandidate,
  reason: LocalContextFileOmissionReason,
  byteLength?: number,
  sha256?: string,
): LocalContextFile {
  return {
    path: candidate.path,
    relationship: candidate.relationship,
    linkedRole: candidate.role,
    disposition: "omitted",
    ...(byteLength === undefined ? {} : { byteLength }),
    ...(sha256 === undefined ? {} : { sha256 }),
    includedByteLength: 0,
    omissionReason: reason,
  };
}

function unavailableSelectedFile(
  path: string,
  reason: LocalContextFileOmissionReason,
): ProjectOSError {
  return new ProjectOSError(
    "local_context_unavailable",
    `Selected file '${path}' cannot be used for local context: ${reason}`,
  );
}

function normalizeRelativePath(path: string): string {
  const slashPath = path.replace(/\\/gu, "/");
  const components = slashPath.split("/");
  const normalized = components
    .filter((component) => component && component !== ".")
    .join("/");
  return slashPath.startsWith("/") ? `/${normalized}` : normalized;
}

function isUnsafeRelativePath(path: string): boolean {
  return (
    !path ||
    path.includes("\0") ||
    /[\r\n]/u.test(path) ||
    isAbsolute(path) ||
    win32.isAbsolute(path) ||
    path.replace(/\\/gu, "/").split("/").includes("..")
  );
}

function targetsProtectedPath(path: string): boolean {
  const first = normalizeRelativePath(path).split("/")[0]?.toLowerCase();
  return first === ".git" || first === ".projectos";
}

function hasIgnoredComponent(path: string): boolean {
  return normalizeRelativePath(path)
    .split("/")
    .some((component) => ALWAYS_IGNORED_COMPONENTS.has(component));
}

function isSensitivePath(path: string): boolean {
  const normalized = normalizeRelativePath(path).toLowerCase();
  const components = normalized.split("/");
  const filename = components.at(-1) ?? "";
  const extensionIndex = filename.lastIndexOf(".");
  const extension = extensionIndex >= 0 ? filename.slice(extensionIndex) : "";
  if (
    filename === ".env" ||
    filename.startsWith(".env.") ||
    filename === "credentials" ||
    filename === "credentials.json" ||
    filename === "application_default_credentials.json" ||
    filename === "accesstokens.json" ||
    filename === ".netrc" ||
    filename === ".npmrc" ||
    filename === "id_rsa" ||
    filename === "id_ed25519" ||
    filename.startsWith("service-account") ||
    filename.startsWith("secrets.") ||
    SENSITIVE_EXTENSIONS.has(extension)
  ) {
    return true;
  }
  return (
    normalized === ".aws/credentials" ||
    normalized.endsWith("/.aws/credentials") ||
    normalized === ".aws/config" ||
    normalized.endsWith("/.aws/config") ||
    normalized === ".kube/config" ||
    normalized.endsWith("/.kube/config") ||
    normalized === ".docker/config.json" ||
    normalized.endsWith("/.docker/config.json") ||
    normalized.includes("/.config/gcloud/") ||
    normalized.startsWith(".config/gcloud/") ||
    normalized.includes("/.azure/") ||
    normalized.startsWith(".azure/")
  );
}

export function estimateLocalContextTokens(content: string): number {
  return estimateTokens(content);
}

function estimateTokens(content: string): number {
  return Math.ceil([...content].length / 4);
}

function truncateToEstimatedTokens(content: string, tokenLimit: number): string {
  return [...content].slice(0, tokenLimit * 4).join("");
}

function truncateCharacters(content: string, characterLimit: number): string {
  const characters = [...content];
  return characters.length <= characterLimit
    ? content
    : `${characters.slice(0, characterLimit - 1).join("")}…`;
}

function hashBytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
