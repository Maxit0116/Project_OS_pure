import type { ProjectGraph, SemanticTree, SemanticTreeNode } from '@contracts/index'

export type FileOwnerSelection =
  | { status: 'resolved'; nodeId: string; candidateNodeIds: string[] }
  | { status: 'ambiguous'; candidateNodeIds: string[] }
  | { status: 'not_mapped'; candidateNodeIds: [] }

export function resolveFileOwnerSelection(
  graph: ProjectGraph,
  tree: SemanticTree | null,
  filePath: string,
  preferredNodeId?: string,
): FileOwnerSelection {
  const candidates: string[] = []
  const indexed = graph.fileIndex.find((file) => file.path === filePath)
  candidates.push(...(indexed?.nodeIds ?? []))
  if (tree) {
    visitSemanticTree(tree.roots, (node) => {
      if (node.path === filePath && node.sourceNodeId) candidates.push(node.sourceNodeId)
    })
  }
  for (const node of graph.nodes) {
    if (node.linkedFiles.some((file) => file.path === filePath)) candidates.push(node.id)
  }
  const existingNodeIds = new Set(graph.nodes.map((node) => node.id))
  const candidateNodeIds = [...new Set(candidates)].filter((id) => existingNodeIds.has(id))

  if (preferredNodeId && candidateNodeIds.includes(preferredNodeId)) {
    return { status: 'resolved', nodeId: preferredNodeId, candidateNodeIds }
  }
  if (candidateNodeIds.length === 1) {
    return { status: 'resolved', nodeId: candidateNodeIds[0]!, candidateNodeIds }
  }
  if (candidateNodeIds.length > 1) {
    return { status: 'ambiguous', candidateNodeIds }
  }
  return { status: 'not_mapped', candidateNodeIds: [] }
}

function visitSemanticTree(
  nodes: SemanticTreeNode[],
  visit: (node: SemanticTreeNode) => void,
): void {
  for (const node of nodes) {
    visit(node)
    visitSemanticTree(node.children, visit)
  }
}
