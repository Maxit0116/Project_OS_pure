import type { FunctionalEdge, FunctionalNode } from '@contracts/index'
import { C4_DEFAULT_NODE_SIZE } from './shapes'
import { resolveC4ShapeKindFromNode } from './shapeKind'
import type { C4DiagramEdge, C4DiagramNode } from './types'

export function emptyBounds() {
  return { minX: 0, minY: 0, width: 800, height: 480 }
}

export function computeBounds(
  nodes: Array<{ position: { x: number; y: number }; width: number; height: number }>,
  padding = 48,
): { minX: number; minY: number; width: number; height: number } {
  if (nodes.length === 0) return emptyBounds()
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + node.width)
    maxY = Math.max(maxY, node.position.y + node.height)
  }
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: Math.max(320, maxX - minX + padding * 2),
    height: Math.max(240, maxY - minY + padding * 2),
  }
}

export function toC4Edge(edge: FunctionalEdge): C4DiagramEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    technology: edge.technology,
    relation: edge.relation,
    purpose: edge.purpose,
    confidence: edge.confidence,
  }
}

export function toC4Node(
  node: FunctionalNode,
  position: { x: number; y: number },
): C4DiagramNode {
  const shape = resolveC4ShapeKindFromNode(node)
  const size = C4_DEFAULT_NODE_SIZE[shape]
  return {
    id: node.id,
    shape,
    label: node.name,
    description: node.responsibility ?? node.summary ?? node.description,
    technology: node.technology,
    elementType: node.elementType,
    level: node.level,
    sourceNodeId: node.id,
    position,
    width: size.width,
    height: size.height,
  }
}

export function filterLevelNodes(
  nodes: FunctionalNode[],
  level: string,
  parentId?: string,
): FunctionalNode[] {
  return nodes.filter(
    (node) =>
      node.level === level &&
      (parentId === undefined || node.parentId === parentId),
  )
}

export function filterEdgesAmong(
  edges: FunctionalEdge[],
  nodeIds: Set<string>,
): FunctionalEdge[] {
  return edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  )
}
