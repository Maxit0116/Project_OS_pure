import type { LoadedProjectOSWorkspace } from "../persistence/workspace-store.js";
import { ProjectOSError } from "../errors.js";
import { FileOwnershipErrorDetailsSchema } from "../contracts/agent-conversation.js";

export interface ResolvedFileOwnerScope {
  nodeId: string;
  selectedFilePath: string;
  candidateNodeIds: string[];
}

export function resolveFileOwnerScope(
  workspace: LoadedProjectOSWorkspace,
  selectedFilePath: string,
  preferredNodeId?: string,
): ResolvedFileOwnerScope {
  const candidateNodeIds = collectFileOwnerNodeIds(workspace, selectedFilePath);
  if (candidateNodeIds.length === 0) {
    throw new ProjectOSError(
      "file_owner_not_found",
      `File '${selectedFilePath}' is not owned or linked by any functional node`,
      {
        details: FileOwnershipErrorDetailsSchema.parse({
          selectedFilePath,
          candidateNodeIds,
        }),
      },
    );
  }
  if (preferredNodeId && candidateNodeIds.includes(preferredNodeId)) {
    return { nodeId: preferredNodeId, selectedFilePath, candidateNodeIds };
  }
  if (candidateNodeIds.length === 1) {
    return {
      nodeId: candidateNodeIds[0]!,
      selectedFilePath,
      candidateNodeIds,
    };
  }
  throw new ProjectOSError(
    "ownership_ambiguous",
    `File '${selectedFilePath}' belongs to multiple functional nodes; select one explicitly`,
    {
      details: FileOwnershipErrorDetailsSchema.parse({
        selectedFilePath,
        candidateNodeIds,
      }),
    },
  );
}

export function collectFileOwnerNodeIds(
  workspace: LoadedProjectOSWorkspace,
  selectedFilePath: string,
): string[] {
  const candidates: string[] = [];
  const indexed = workspace.graph.fileIndex.find(
    (file) => file.path === selectedFilePath,
  );
  candidates.push(...(indexed?.nodeIds ?? []));
  visitSemanticTree(workspace.semanticTree.roots, (node) => {
    if (node.path === selectedFilePath && node.sourceNodeId) {
      candidates.push(node.sourceNodeId);
    }
  });
  for (const node of workspace.graph.nodes) {
    if (node.linkedFiles.some((file) => file.path === selectedFilePath)) {
      candidates.push(node.id);
    }
  }
  const existingNodeIds = new Set(workspace.graph.nodes.map((node) => node.id));
  return [...new Set(candidates)].filter((nodeId) => existingNodeIds.has(nodeId));
}

function visitSemanticTree(
  nodes: LoadedProjectOSWorkspace["semanticTree"]["roots"],
  visit: (node: LoadedProjectOSWorkspace["semanticTree"]["roots"][number]) => void,
): void {
  for (const node of nodes) {
    visit(node);
    visitSemanticTree(node.children, visit);
  }
}
