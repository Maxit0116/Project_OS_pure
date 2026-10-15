import type { FunctionalNode } from '@contracts/index'
import type { C4Boundary, C4Diagram, C4DiagramInput } from '../types'
import {
  computeBounds,
  emptyBounds,
  filterEdgesAmong,
  toC4Edge,
  toC4Node,
} from '../diagramShared'

const BOUNDARY_ORIGIN = { x: 48, y: 48 }
/** Inner padding: left/right around containers; top leaves room for the boundary label. */
const INNER_PAD_X = 56
const INNER_PAD_TOP = 72
const INNER_PAD_BOTTOM = 48
const COLS = 3
/** Wide gaps so orthogonal edges + labels clear neighbouring boxes. */
const GAP_X = 96
const GAP_Y = 88
const EXTERNAL_GAP = 120
const MIN_BOUNDARY_WIDTH = 520
const MIN_BOUNDARY_HEIGHT = 320

function resolveSystem(input: C4DiagramInput): FunctionalNode | undefined {
  const parentId = input.scope?.parentId
  if (parentId) {
    return input.nodes.find((n) => n.id === parentId)
  }
  return pickPrimarySoftwareSystem(input.nodes)
}

function pickPrimarySoftwareSystem(
  nodes: FunctionalNode[],
): FunctionalNode | undefined {
  const systems = nodes.filter((n) => n.elementType === 'software_system')
  if (systems.length === 0) return undefined
  const withContainers = systems.find((system) =>
    nodes.some((n) => n.level === 'container' && n.parentId === system.id),
  )
  return withContainers ?? systems[0]
}

/**
 * Container diagram: dashed system boundary + containers inside, externals outside.
 * Classic C4: zoom into one software_system; containers live inside its boundary.
 */
export function buildContainerDiagram(input: C4DiagramInput): C4Diagram {
  const system = resolveSystem(input)
  const systemId = input.scope?.parentId ?? system?.id

  const containers = systemId
    ? input.nodes.filter(
        (n) => n.level === 'container' && n.parentId === systemId,
      )
    : input.nodes.filter((n) => n.level === 'container')

  const externals = input.nodes.filter(
    (n) => n.level === 'context' && n.elementType === 'external_system',
  )

  if (!system && containers.length === 0 && externals.length === 0) {
    return {
      level: 'container',
      nodes: [],
      edges: [],
      boundaries: [],
      bounds: emptyBounds(),
    }
  }

  const startX = BOUNDARY_ORIGIN.x + INNER_PAD_X
  const startY = BOUNDARY_ORIGIN.y + INNER_PAD_TOP

  const placedContainers = containers.map((node, index) => {
    const col = index % COLS
    const row = Math.floor(index / COLS)
    const base = toC4Node(node, { x: 0, y: 0 })
    const placed = toC4Node(node, {
      x: startX + col * (base.width + GAP_X),
      y: startY + row * (base.height + GAP_Y),
    })
    const kind =
      placed.shape === 'database'
        ? 'Database'
        : placed.shape === 'queue'
          ? 'Queue'
          : placed.shape === 'web_app'
            ? 'Web Application'
            : placed.shape === 'mobile_app'
              ? 'Mobile App'
              : placed.shape === 'desktop_app'
                ? 'Desktop App'
                : 'Container'
    return {
      ...placed,
      stereotype: node.technology ? `[${kind}: ${node.technology}]` : `[${kind}]`,
    }
  })

  let contentMaxX = startX
  let contentMaxY = startY
  for (const node of placedContainers) {
    contentMaxX = Math.max(contentMaxX, node.position.x + node.width)
    contentMaxY = Math.max(contentMaxY, node.position.y + node.height)
  }

  const boundary: C4Boundary | null = system
    ? {
        id: `boundary_${system.id}`,
        label: system.name,
        description: system.responsibility ?? system.summary,
        position: { x: BOUNDARY_ORIGIN.x, y: BOUNDARY_ORIGIN.y },
        width: Math.max(
          MIN_BOUNDARY_WIDTH,
          contentMaxX - BOUNDARY_ORIGIN.x + INNER_PAD_X,
        ),
        height: Math.max(
          MIN_BOUNDARY_HEIGHT,
          contentMaxY - BOUNDARY_ORIGIN.y + INNER_PAD_BOTTOM,
        ),
      }
    : null

  const externalX =
    (boundary?.position.x ?? BOUNDARY_ORIGIN.x) +
    (boundary?.width ?? MIN_BOUNDARY_WIDTH) +
    EXTERNAL_GAP

  let externalY = BOUNDARY_ORIGIN.y + INNER_PAD_TOP
  const placedExternals = externals.map((node) => {
    const diagramNode = toC4Node(node, { x: externalX, y: externalY })
    externalY += diagramNode.height + GAP_Y
    return diagramNode
  })

  const placed = [...placedContainers, ...placedExternals]
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
    level: 'container',
    nodes: placed,
    edges,
    boundaries: boundary ? [boundary] : [],
    bounds: computeBounds(boundsItems),
  }
}
