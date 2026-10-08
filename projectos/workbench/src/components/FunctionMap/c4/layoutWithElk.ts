import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js'
import type { C4Boundary, C4Diagram, C4DiagramNode } from './types'
import { computeBounds, emptyBounds } from './diagramShared'

const elk = new ELK()

const BOUNDARY_PAD = {
  left: 32,
  right: 32,
  top: 56,
  bottom: 32,
} as const

/**
 * Re-layout a C4 diagram with ELK hierarchical packing.
 * Falls back to the input diagram (grid positions) on failure.
 */
export async function applyElkLayoutToDiagram(
  diagram: C4Diagram,
): Promise<C4Diagram> {
  if (diagram.nodes.length === 0) return diagram

  try {
    const laidOut = await layoutWithElk(diagram)
    return laidOut
  } catch {
    return diagram
  }
}

export async function layoutWithElk(diagram: C4Diagram): Promise<C4Diagram> {
  const nodeById = new Map(diagram.nodes.map((node) => [node.id, node]))
  const boundary = diagram.boundaries[0]

  const insideIds = new Set<string>()
  if (boundary) {
    for (const node of diagram.nodes) {
      const inside =
        node.position.x >= boundary.position.x &&
        node.position.y >= boundary.position.y &&
        node.position.x + node.width <=
          boundary.position.x + boundary.width + 1 &&
        node.position.y + node.height <=
          boundary.position.y + boundary.height + 1
      if (inside) insideIds.add(node.id)
    }
    // Prefer children that were placed inside the boundary by builders.
    if (insideIds.size === 0) {
      for (const node of diagram.nodes) {
        if (
          node.level === 'container' ||
          node.level === 'component' ||
          node.level === 'code' ||
          node.elementType === 'data_store' ||
          node.elementType === 'container' ||
          node.elementType === 'component'
        ) {
          // Heuristic: non-external/person are inside when a boundary exists
          // at container/component/code levels.
          if (
            node.elementType !== 'external_system' &&
            node.elementType !== 'person'
          ) {
            insideIds.add(node.id)
          }
        }
      }
    }
  }

  const outsideNodes = boundary
    ? diagram.nodes.filter((node) => !insideIds.has(node.id))
    : diagram.nodes
  const insideNodes = boundary
    ? diagram.nodes.filter((node) => insideIds.has(node.id))
    : []

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '72',
      'elk.padding': '[top=24,left=24,bottom=24,right=24]',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    },
    children: [],
    edges: diagram.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  }

  if (boundary && insideNodes.length > 0) {
    graph.children!.push({
      id: boundary.id,
      labels: [{ text: boundary.label }],
      layoutOptions: {
        'elk.padding': `[top=${BOUNDARY_PAD.top},left=${BOUNDARY_PAD.left},bottom=${BOUNDARY_PAD.bottom},right=${BOUNDARY_PAD.right}]`,
        'elk.spacing.nodeNode': '36',
        'elk.layered.spacing.nodeNodeBetweenLayers': '48',
      },
      children: insideNodes.map((node) => elkLeaf(node)),
    })
    for (const node of outsideNodes) {
      graph.children!.push(elkLeaf(node))
    }
  } else {
    for (const node of diagram.nodes) {
      graph.children!.push(elkLeaf(node))
    }
  }

  const result = await elk.layout(graph)
  const positions = new Map<string, { x: number; y: number }>()
  const collect = (elkNode: ElkNode, ox: number, oy: number) => {
    const x = ox + (elkNode.x ?? 0)
    const y = oy + (elkNode.y ?? 0)
    if (elkNode.id !== 'root' && nodeById.has(elkNode.id)) {
      positions.set(elkNode.id, { x, y })
    }
    for (const child of elkNode.children ?? []) {
      collect(child, elkNode.id === 'root' ? 0 : x, elkNode.id === 'root' ? 0 : y)
    }
  }
  collect(result, 0, 0)

  const placedNodes: C4DiagramNode[] = diagram.nodes.map((node) => {
    const position = positions.get(node.id)
    return position ? { ...node, position } : node
  })

  let boundaries: C4Boundary[] = []
  if (boundary) {
    const compound = (result.children ?? []).find((child) => child.id === boundary.id)
    if (compound) {
      boundaries = [
        {
          ...boundary,
          position: { x: compound.x ?? 0, y: compound.y ?? 0 },
          width: Math.max(compound.width ?? boundary.width, 200),
          height: Math.max(compound.height ?? boundary.height, 160),
        },
      ]
    } else if (insideNodes.length > 0) {
      const insidePlaced = placedNodes.filter((node) => insideIds.has(node.id))
      const bounds = computeBounds(insidePlaced, 0)
      boundaries = [
        {
          ...boundary,
          position: {
            x: bounds.minX - BOUNDARY_PAD.left,
            y: bounds.minY - BOUNDARY_PAD.top,
          },
          width: bounds.width + BOUNDARY_PAD.left + BOUNDARY_PAD.right,
          height: bounds.height + BOUNDARY_PAD.top + BOUNDARY_PAD.bottom,
        },
      ]
    } else {
      boundaries = [boundary]
    }
  }

  const frame = [...placedNodes, ...boundaries]
  return {
    ...diagram,
    nodes: placedNodes,
    boundaries,
    bounds: frame.length > 0 ? computeBounds(frame) : emptyBounds(),
  }
}

function elkLeaf(node: C4DiagramNode): ElkNode {
  return {
    id: node.id,
    width: node.width,
    height: node.height,
    labels: [{ text: node.label }],
  }
}
