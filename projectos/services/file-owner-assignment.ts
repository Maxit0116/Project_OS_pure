import type { ProjectGraph } from "../contracts/graph.js";
import { ProjectOSError } from "../errors.js";

/**
 * Give a file that no node owns to one node, in the graph only. Ownership is what lets Agent change
 * a file (an approved change must name every node that owns what it touches), so a file nobody owns
 * can be read but never changed; this is how a person fixes that without regenerating the map.
 *
 * Refuses a file that is already owned (the owner choice already covers those), a node that is the
 * project context, and an unknown node. Returns a new graph; the argument is not changed.
 */
export function assignFileToNode(graph: ProjectGraph, filePath: string, nodeId: string): ProjectGraph {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new ProjectOSError("node_not_found", `Node '${nodeId}' does not exist in this project`);
  }
  if (node.level === "context") {
    throw new ProjectOSError(
      "invalid_file_owner",
      "The whole-project node cannot own a file; choose a feature or component",
    );
  }
  const owners = new Set<string>();
  for (const entry of graph.fileIndex) {
    if (entry.path === filePath) for (const id of entry.nodeIds) owners.add(id);
  }
  for (const candidate of graph.nodes) {
    if (candidate.linkedFiles.some((file) => file.path === filePath)) owners.add(candidate.id);
  }
  if (owners.size > 0) {
    throw new ProjectOSError(
      "file_already_owned",
      `'${filePath}' already belongs to ${[...owners].join(", ")}`,
      { details: { nodeIds: [...owners] } },
    );
  }

  const hasEntry = graph.fileIndex.some((entry) => entry.path === filePath);
  return {
    ...graph,
    nodes: graph.nodes.map((candidate) =>
      candidate.id === nodeId
        ? { ...candidate, linkedFiles: [...candidate.linkedFiles, { path: filePath, role: "supporting" as const }] }
        : candidate),
    fileIndex: hasEntry
      ? graph.fileIndex.map((entry) => (entry.path === filePath ? { ...entry, nodeIds: [nodeId] } : entry))
      : [...graph.fileIndex, { path: filePath, type: "other" as const, nodeIds: [nodeId], imports: [], exports: [] }],
  };
}
