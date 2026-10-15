import { createHash } from "node:crypto";

import type { FileEntry } from "../contracts/graph.js";
import {
  SEMANTIC_TREE_LIMITS,
  SemanticTreeSchema,
  type SemanticTree,
  type SemanticTreeNode,
  type SemanticTreeNodeKind,
} from "../contracts/semantic-tree.js";

export function semanticKindForIndexedFile(entry: FileEntry): SemanticTreeNodeKind {
  switch (entry.type) {
    case "page":
      return "route";
    case "api":
      return "api";
    case "config":
      return "config";
    case "test":
      return "test";
    default:
      return "file";
  }
}

/**
 * Hang indexed source files under the pathless feature that owns them.
 * Paths already present in the tree are left alone, so authored sample trees
 * keep their existing leaves.
 */
export function attachIndexedFilesToSemanticTree(
  tree: SemanticTree,
  fileIndex: readonly FileEntry[],
): SemanticTree {
  const next = structuredClone(tree);
  const features = new Map<string, SemanticTreeNode>();
  const paths = new Set<string>();
  const ids = new Set<string>();

  const walk = (nodes: SemanticTreeNode[]): void => {
    for (const node of nodes) {
      ids.add(node.id);
      if (node.path) paths.add(node.path);
      if (
        node.kind === "feature" &&
        node.path === undefined &&
        node.sourceNodeId &&
        !features.has(node.sourceNodeId)
      ) {
        features.set(node.sourceNodeId, node);
      }
      walk(node.children);
    }
  };
  walk(next.roots);

  const pending = [...fileIndex].sort((left, right) => left.path.localeCompare(right.path));
  let nodeCount = ids.size;
  for (const entry of pending) {
    if (paths.has(entry.path) || nodeCount >= SEMANTIC_TREE_LIMITS.nodes) continue;
    const ownerId = entry.nodeIds.find((id) => features.has(id));
    if (!ownerId) continue;
    const owner = features.get(ownerId)!;
    if (owner.children.length >= SEMANTIC_TREE_LIMITS.childrenPerNode) continue;

    const id = uniqueFileNodeId(ids, ownerId, entry.path);
    const basename = entry.path.split("/").pop() || entry.path;
    const label = owner.children.some((child) => child.label === basename)
      ? entry.path
      : basename;
    owner.children.push({
      id,
      label,
      kind: semanticKindForIndexedFile(entry),
      path: entry.path,
      sourceNodeId: ownerId,
      status: entry.status === "error" ? "error" : "normal",
      children: [],
    });
    paths.add(entry.path);
    nodeCount += 1;
  }

  return SemanticTreeSchema.parse(next);
}

function uniqueFileNodeId(ids: Set<string>, ownerId: string, path: string): string {
  const digest = createHash("sha256").update(`${ownerId}\0${path}`).digest("hex").slice(0, 16);
  let id = `tree_file_${digest}`;
  let suffix = 2;
  while (ids.has(id)) {
    id = `tree_file_${digest}_${suffix}`;
    suffix += 1;
  }
  ids.add(id);
  return id;
}
