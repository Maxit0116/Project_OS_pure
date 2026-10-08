import type { FunctionalNode } from '@contracts/index'
import type { C4Boundary, C4Diagram, C4DiagramInput } from '../types'
import {
  computeBounds,
  emptyBounds,
  filterEdgesAmong,
  toC4Edge,
  toC4Node,
} from '../diagramShared'

const OUTSIDE_ELEMENT_TYPES = new Set(['data_store', 'external_system'])

function resolveContainer(input: C4DiagramInput): FunctionalNode | undefined {
  const parentId = input.scope?.parentId
  if (parentId) {
    return input.nodes.find((n) => n.id === parentId)
  }
  const containers = input.nodes.filter((n) => n.level === 'container')
  return (
    containers.find((container) =>
      input.nodes.some(
        (n) => n.level === 'component' && n.parentId === container.id,
      ),
    ) ?? containers[0]
  )
}

/**
 * Classic C4 Component diagram: dashed parent-container boundary with
 * components (parentId === container) inside. Connected data_store /
 * external_system nodes are placed outside on the right when edged.
 */
export function buildComponentDiagram(input: C4DiagramInput): C4Diagram {
  const container = resolveContainer(input)
  const parentId = input.scope?.parentId ?? container?.id
  if (!parentId) {
    return {
      level: 'component',
      nodes: [],
      edges: [],
      boundaries: [],
      bounds: emptyBounds(),
    }
  }

  const components = input.nodes.filter(
    (n) => n.level === 'component' && n.parentId === parentId,
  )
  const componentIds = new Set(components.map((n) => n.id))

  const outsideRefs = collectOutsideReferences(
    input.nodes,
    input.edges,
    componentIds,
  )

  if (components.length === 0 && outsideRefs.length === 0) {
    return {
      level: 'component',
      nodes: [],
      edges: [],
      boundaries: [],
      bounds: emptyBounds(),
    }
  }

  const PAD = 56
  const COLS = 3
  const GAP_X = 88
  const GAP_Y = 80
  const startX = PAD + 32
  const startY = PAD + 64

  const placedComponents = components.map((node, index) => {
    const col = index % COLS
    const row = Math.floor(index / COLS)
    const base = toC4Node(node, { x: 0, y: 0 })
    const placed = toC4Node(node, {
      x: startX + col * (base.width + GAP_X),
      y: startY + row * (base.height + GAP_Y),
    })
    return {
      ...placed,
      stereotype: node.technology
        ? `[Component: ${node.technology}]`
        : '[Component]',
    }
  })

  let contentMaxX = startX
  let contentMaxY = startY
  for (const node of placedComponents) {
    contentMaxX = Math.max(contentMaxX, node.position.x + node.width)
    contentMaxY = Math.max(contentMaxY, node.position.y + node.height)
  }

  const boundary: C4Boundary | null =
    container && components.length > 0
      ? {
          id: `boundary_${container.id}`,
          label: container.name,
          description: container.technology
            ? `[${container.technology}]`
            : container.responsibility,
          position: { x: PAD, y: PAD },
          width: Math.max(420, contentMaxX - PAD + 40),
          height: Math.max(240, contentMaxY - PAD + 40),
        }
      : null

  let externalY = PAD + 56
  const outsideX =
    (boundary?.position.x ?? PAD) + (boundary?.width ?? 420) + 48
  const placedOutside = outsideRefs.map((node) => {
    const diagramNode = toC4Node(node, { x: outsideX, y: externalY })
    externalY += diagramNode.height + GAP_Y
    return diagramNode
  })

  const placed = [...placedComponents, ...placedOutside]
  const ids = new Set(placed.map((n) => n.id))
  const edges = filterEdgesAmong(input.edges, ids).map(toC4Edge)
  const boundsItems = [
    ...placed,
    ...(boundary
      ? [
          {
            position: boundary.position,
            width: boundary.width,
            height: boundary.height,
          },
        ]
      : []),
  ]

  return {
    level: 'component',
    nodes: placed,
    edges,
    boundaries: boundary ? [boundary] : [],
    bounds: computeBounds(boundsItems),
  }
}

/** data_store / external_system nodes edged to in-scope components, not inside the boundary. */
function collectOutsideReferences(
  nodes: FunctionalNode[],
  edges: C4DiagramInput['edges'],
  componentIds: Set<string>,
): FunctionalNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const outsideIds = new Set<string>()

  for (const edge of edges) {
    const sourceInside = componentIds.has(edge.source)
    const targetInside = componentIds.has(edge.target)
    if (sourceInside === targetInside) continue

    const outerId = sourceInside ? edge.target : edge.source
    if (componentIds.has(outerId) || outsideIds.has(outerId)) continue

    const outer = byId.get(outerId)
    if (!outer || !OUTSIDE_ELEMENT_TYPES.has(outer.elementType ?? '')) continue
    outsideIds.add(outerId)
  }

  return [...outsideIds]
    .map((id) => byId.get(id))
    .filter((n): n is FunctionalNode => n != null)
}
