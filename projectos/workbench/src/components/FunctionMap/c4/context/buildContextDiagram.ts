import type { FunctionalNode } from '@contracts/index'
import type { C4Diagram, C4DiagramInput, C4DiagramNode } from '../types'
import {
  computeBounds,
  emptyBounds,
  filterEdgesAmong,
  filterLevelNodes,
  toC4Edge,
  toC4Node,
} from '../diagramShared'

/** Sparse horizontal gaps between classic C4 context columns. */
const COL_X = {
  person: 80,
  system: 480,
  external: 960,
} as const

/** Vertical gap between stacked nodes in a column. */
const GAP_Y = 96

/** Top padding after vertical centering. */
const TOP_Y = 96

/**
 * System Context diagram: people left, software system center, externals right.
 * No dashed boundary at this level. Edges keep label/technology/purpose.
 */
export function buildContextDiagram(input: C4DiagramInput): C4Diagram {
  const levelNodes = filterLevelNodes(input.nodes, 'context')
  const people = levelNodes.filter((n) => n.elementType === 'person')
  const systems = levelNodes.filter((n) => n.elementType === 'software_system')
  const externals = levelNodes.filter((n) => n.elementType === 'external_system')

  if (people.length === 0 && systems.length === 0 && externals.length === 0) {
    return {
      level: 'context',
      nodes: [],
      edges: [],
      boundaries: [],
      bounds: emptyBounds(),
    }
  }

  const personCol = stackColumn(people, COL_X.person)
  const systemCol = stackColumn(systems, COL_X.system)
  const externalCol = stackColumn(externals, COL_X.external)

  const maxHeight = Math.max(
    columnHeight(personCol),
    columnHeight(systemCol),
    columnHeight(externalCol),
  )

  const placed = [
    ...centerColumn(personCol, maxHeight),
    ...centerColumn(systemCol, maxHeight),
    ...centerColumn(externalCol, maxHeight),
  ]

  const ids = new Set(placed.map((n) => n.id))
  const edges = filterEdgesAmong(input.edges, ids).map(toC4Edge)

  return {
    level: 'context',
    nodes: placed,
    edges,
    boundaries: [],
    bounds: computeBounds(placed),
  }
}

function stackColumn(nodes: FunctionalNode[], x: number): C4DiagramNode[] {
  let y = 0
  return nodes.map((node) => {
    const diagramNode = toC4Node(node, { x, y })
    y += diagramNode.height + GAP_Y
    const stereotype =
      node.elementType === 'person'
        ? '[Person]'
        : node.elementType === 'external_system'
          ? '[External System]'
          : node.elementType === 'software_system'
            ? '[Software System]'
            : undefined
    return stereotype ? { ...diagramNode, stereotype } : diagramNode
  })
}

function columnHeight(nodes: C4DiagramNode[]): number {
  if (nodes.length === 0) return 0
  const last = nodes[nodes.length - 1]!
  return last.position.y + last.height
}

/** Vertically center a column within the tallest column's height. */
function centerColumn(
  nodes: C4DiagramNode[],
  maxHeight: number,
): C4DiagramNode[] {
  const height = columnHeight(nodes)
  const offsetY = TOP_Y + (maxHeight - height) / 2
  return nodes.map((node) => ({
    ...node,
    position: { x: node.position.x, y: node.position.y + offsetY },
  }))
}
