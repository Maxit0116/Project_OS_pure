import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js'
import type { C4Boundary, C4Diagram, C4DiagramNode } from './types'
import { BOUNDARY_PAD, fitBoundaryToMemberNodes } from './boundaryFit'
import { computeBounds, emptyBounds } from './diagramShared'
import { fitEdgeLabel, horizontalGap, verticalGap } from './edgeLabelFit'
import { formatC4EdgeLabel } from '../edgePresentation'
import { minNodeGap, type RouteRect } from './orthogonalRoute'

const elk = new ELK()

/** Target clear gap between node boxes after layout (room for labels + bends). */
const TARGET_NODE_GAP = 96

/**
 * Re-layout a C4 diagram with ELK hierarchical packing + orthogonal routing space.
 * Falls back to the input diagram (grid positions) on failure.
 */
export async function applyElkLayoutToDiagram(
  diagram: C4Diagram,
): Promise<C4Diagram> {
  if (diagram.nodes.length === 0) return diagram
  // A code listing with no file-to-file edges is already a near-square matrix.
  // ELK's layered pass would stack those files into one column.
  if (isUnrelatedCodeListing(diagram)) return diagram

  try {
    const laidOut = await layoutWithElk(diagram)
    return separateNodesForLabels(expandIfCramped(laidOut))
  } catch {
    return separateNodesForLabels(expandIfCramped(diagram))
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
    if (insideIds.size === 0) {
      for (const node of diagram.nodes) {
        if (
          node.elementType !== 'external_system' &&
          node.elementType !== 'person' &&
          (node.level === 'container' ||
            node.level === 'component' ||
            node.level === 'code' ||
            node.elementType === 'data_store' ||
            node.elementType === 'container' ||
            node.elementType === 'component')
        ) {
          insideIds.add(node.id)
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
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '100',
      'elk.layered.spacing.nodeNodeBetweenLayers': '160',
      'elk.spacing.edgeNode': '48',
      'elk.spacing.edgeEdge': '28',
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
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
        'elk.spacing.nodeNode': '88',
        'elk.layered.spacing.nodeNodeBetweenLayers': '120',
        'elk.spacing.edgeNode': '40',
        'elk.edgeRouting': 'ORTHOGONAL',
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
    const insidePlaced = placedNodes.filter((node) => insideIds.has(node.id))
    boundaries =
      insidePlaced.length > 0
        ? [fitBoundaryToMemberNodes(boundary, insidePlaced)]
        : [boundary]
  }

  const frame = [...placedNodes, ...boundaries]
  return {
    ...diagram,
    nodes: placedNodes,
    boundaries,
    bounds: frame.length > 0 ? computeBounds(frame) : emptyBounds(),
  }
}

/**
 * If nodes are still closer than TARGET_NODE_GAP, uniformly expand around the
 * centroid so orthogonal edges and labels have breathing room.
 */
export function expandIfCramped(diagram: C4Diagram): C4Diagram {
  if (diagram.nodes.length < 2) return diagram

  const rects: RouteRect[] = diagram.nodes.map((node) => ({
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: node.width,
    height: node.height,
    shape: node.shape,
  }))
  const gap = minNodeGap(rects)
  if (gap >= TARGET_NODE_GAP) return diagram

  const scale = Math.min(2.2, Math.max(1.15, (TARGET_NODE_GAP + 24) / Math.max(gap, 12)))
  const cx =
    diagram.nodes.reduce((sum, node) => sum + node.position.x + node.width / 2, 0) /
    diagram.nodes.length
  const cy =
    diagram.nodes.reduce((sum, node) => sum + node.position.y + node.height / 2, 0) /
    diagram.nodes.length

  const nodes = diagram.nodes.map((node) => {
    const nx = node.position.x + node.width / 2
    const ny = node.position.y + node.height / 2
    return {
      ...node,
      position: {
        x: cx + (nx - cx) * scale - node.width / 2,
        y: cy + (ny - cy) * scale - node.height / 2,
      },
    }
  })

  const boundaries = diagram.boundaries.map((boundary) => {
    const bx = boundary.position.x + boundary.width / 2
    const by = boundary.position.y + boundary.height / 2
    const width = boundary.width * scale
    const height = boundary.height * scale
    return {
      ...boundary,
      position: {
        x: cx + (bx - cx) * scale - width / 2,
        y: cy + (by - cy) * scale - height / 2,
      },
      width,
      height,
    }
  })

  // Recompute boundary to tightly wrap inside nodes if we have a single boundary.
  if (boundaries.length === 1) {
    const boundary = boundaries[0]!
    const inside = nodes.filter((node) => {
      const nc = {
        x: node.position.x + node.width / 2,
        y: node.position.y + node.height / 2,
      }
      return (
        nc.x >= boundary.position.x &&
        nc.x <= boundary.position.x + boundary.width &&
        nc.y >= boundary.position.y &&
        nc.y <= boundary.position.y + boundary.height
      )
    })
    if (inside.length > 0) {
      boundaries[0] = fitBoundaryToMemberNodes(boundary, inside)
    }
  }

  const frame = [...nodes, ...boundaries]
  return {
    ...diagram,
    nodes,
    boundaries,
    bounds: frame.length > 0 ? computeBounds(frame) : emptyBounds(),
  }
}

/**
 * When an edge label needs a clear corridor, push endpoints apart:
 * - vertically (for wrap / detour lanes)
 * - horizontally (so the mid segment can host a centered label without
 *   covering either node or sibling wires)
 */
export function separateNodesForLabels(diagram: C4Diagram): C4Diagram {
  if (diagram.nodes.length < 2 || diagram.edges.length === 0) return diagram

  const positions = new Map(
    diagram.nodes.map((node) => [node.id, { ...node.position }]),
  )
  const sizeById = new Map(
    diagram.nodes.map((node) => [
      node.id,
      { width: node.width, height: node.height },
    ]),
  )

  let changed = false
  // Multiple passes so chains of edges can cascade spacing.
  for (let pass = 0; pass < 4; pass += 1) {
    let passChanged = false
    for (const edge of diagram.edges) {
      const sourcePos = positions.get(edge.source)
      const targetPos = positions.get(edge.target)
      const sourceSize = sizeById.get(edge.source)
      const targetSize = sizeById.get(edge.target)
      if (!sourcePos || !targetPos || !sourceSize || !targetSize) continue

      const sourceNode = diagram.nodes.find((node) => node.id === edge.source)
      const targetNode = diagram.nodes.find((node) => node.id === edge.target)
      const sourceRect: RouteRect = {
        id: edge.source,
        x: sourcePos.x,
        y: sourcePos.y,
        width: sourceSize.width,
        height: sourceSize.height,
        shape: sourceNode?.shape,
      }
      const targetRect: RouteRect = {
        id: edge.target,
        x: targetPos.x,
        y: targetPos.y,
        width: targetSize.width,
        height: targetSize.height,
        shape: targetNode?.shape,
      }
      const labelText = formatC4EdgeLabel(
        edge.label,
        edge.technology,
        edge.relation,
      )
      if (!labelText) continue

      const fit = fitEdgeLabel(labelText, sourceRect, targetRect)
      const hGap = horizontalGap(sourceRect, targetRect)
      const vGap = verticalGap(sourceRect, targetRect)
      const sourceCenterX = sourceRect.x + sourceRect.width / 2
      const targetCenterX = targetRect.x + targetRect.width / 2
      const sourceCenterY = sourceRect.y + sourceRect.height / 2
      const targetCenterY = targetRect.y + targetRect.height / 2

      // Prefer a horizontal corridor wider than the label box (+ pad) so the
      // centered mid-edge label never covers either endpoint node.
      const neededH = fit.boxWidth + 72
      if (hGap > 0 && hGap < neededH) {
        const delta = neededH - hGap
        if (targetCenterX >= sourceCenterX) {
          targetPos.x += delta
        } else {
          sourcePos.x += delta
        }
        passChanged = true
        changed = true
        continue
      }

      // Vertical room for centered labels + optional detour lanes above/below.
      const neededV = Math.max(
        fit.requestedVerticalGap,
        fit.boxHeight + 56,
        fit.needsVerticalSeparation ? fit.boxHeight + 72 : 0,
      )
      if (neededV > 0 && vGap < neededV) {
        const delta = neededV - vGap
        if (targetCenterY >= sourceCenterY) {
          targetPos.y += delta
        } else {
          sourcePos.y += delta
        }
        passChanged = true
        changed = true
      }
    }
    if (!passChanged) break
  }

  if (!changed) return diagram

  const nodes = diagram.nodes.map((node) => {
    const position = positions.get(node.id)
    return position ? { ...node, position } : node
  })

  const boundaries =
    diagram.boundaries.length === 1
      ? (() => {
          const boundary = diagram.boundaries[0]!
          const inside = nodes.filter((node) => {
            // Keep nodes that were previously near the boundary centroid.
            const prev = diagram.nodes.find((candidate) => candidate.id === node.id)
            if (!prev) return false
            const wasInside =
              prev.position.x + prev.width / 2 >= boundary.position.x &&
              prev.position.x + prev.width / 2 <=
                boundary.position.x + boundary.width &&
              prev.position.y + prev.height / 2 >= boundary.position.y &&
              prev.position.y + prev.height / 2 <=
                boundary.position.y + boundary.height
            return wasInside
          })
          if (inside.length === 0) return diagram.boundaries
          return [fitBoundaryToMemberNodes(boundary, inside)]
        })()
      : diagram.boundaries

  const frame = [...nodes, ...boundaries]
  return {
    ...diagram,
    nodes,
    boundaries,
    bounds: frame.length > 0 ? computeBounds(frame) : emptyBounds(),
  }
}

function isUnrelatedCodeListing(diagram: C4Diagram): boolean {
  if (diagram.level !== 'code' || diagram.nodes.length === 0) return false
  const ids = new Set(diagram.nodes.map((node) => node.id))
  return !diagram.edges.some(
    (edge) => ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target,
  )
}

function elkLeaf(node: C4DiagramNode): ElkNode {
  return {
    id: node.id,
    width: node.width,
    height: node.height,
    labels: [{ text: node.label }],
  }
}
