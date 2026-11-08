import type { ProjectGraph } from "../contracts/graph.js";

/**
 * Which functional nodes a file that no node owns most likely belongs to, so a person is offered
 * "add it to Team & Roles" instead of a dead end. Pure and dependency-free: the workbench ranks
 * the choices with it and the server checks the same rule when the choice is applied.
 *
 * A node is a candidate when it already owns files in the same folder as this one. The deeper the
 * shared folder, the better the match; a file at the top of the project (package.json,
 * tsconfig.json) is only matched with nodes that own other top-level files.
 */

export interface FileOwnerSuggestion {
  nodeId: string;
  /** The folder the file shares with this node's files; "" for the top of the project. */
  sharedDirectory: string;
  /** How many of the node's files sit in that shared folder. */
  filesInSharedDirectory: number;
}

type GraphNodes = { nodes: Array<Pick<ProjectGraph["nodes"][number], "id" | "level" | "linkedFiles">> };

function directorySegments(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  segments.pop();
  return segments;
}

function sharedDepth(a: string[], b: string[]): number {
  let depth = 0;
  while (depth < a.length && depth < b.length && a[depth] === b[depth]) depth += 1;
  return depth;
}

export function suggestOwnersForFile(graph: GraphNodes, filePath: string, limit = 4): FileOwnerSuggestion[] {
  const own = directorySegments(filePath);
  const candidates: Array<FileOwnerSuggestion & { levelRank: number }> = [];

  for (const node of graph.nodes) {
    if (node.level === "context") continue;
    let bestDepth = -1;
    let filesAtBest = 0;
    for (const file of node.linkedFiles ?? []) {
      if (file.path === filePath) continue;
      const other = directorySegments(file.path);
      const depth = sharedDepth(own, other);
      // Only a top-level file may match on "no shared folder", and only another top-level file.
      const matches = own.length === 0 ? other.length === 0 : depth >= 1;
      if (!matches) continue;
      if (depth > bestDepth) {
        bestDepth = depth;
        filesAtBest = 1;
      } else if (depth === bestDepth) {
        filesAtBest += 1;
      }
    }
    if (bestDepth < 0) continue;
    candidates.push({
      nodeId: node.id,
      sharedDirectory: own.slice(0, bestDepth).join("/"),
      filesInSharedDirectory: filesAtBest,
      levelRank: node.level === "component" ? 0 : 1,
    });
  }

  return candidates
    .sort((left, right) =>
      right.sharedDirectory.split("/").filter(Boolean).length - left.sharedDirectory.split("/").filter(Boolean).length ||
      right.filesInSharedDirectory - left.filesInSharedDirectory ||
      left.levelRank - right.levelRank ||
      left.nodeId.localeCompare(right.nodeId))
    .slice(0, limit)
    .map(({ levelRank: _levelRank, ...suggestion }) => suggestion);
}
