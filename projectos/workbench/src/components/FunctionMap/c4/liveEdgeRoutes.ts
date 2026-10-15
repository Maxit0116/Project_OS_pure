import {
  buildOrthogonalRoute,
  laneGapForLabels,
  resolveOverlayConflicts,
  routeAllOrthogonalEdges,
  type OrthogonalRouteResult,
  type RoutePoint,
  type RouteRect,
  type RoutedEdgeSpec,
} from './orthogonalRoute'

export interface LiveRouteFrameInput {
  nodes: RouteRect[]
  edges: RoutedEdgeSpec[]
  previous?: Map<string, OrthogonalRouteResult> | null
  dirtyNodeIds?: ReadonlySet<string>
  mode: 'incremental' | 'full'
  clearance?: number
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`
}

/**
 * Full mode is the existing global orthogonal pass.
 * Incremental mode reroutes only edges that touch a dirty node and leaves
 * every other route object untouched so stable wires stay put during a drag.
 */
export function liveRouteFrame(input: LiveRouteFrameInput): Map<string, OrthogonalRouteResult> {
  if (input.mode === 'full' || !input.previous || input.previous.size === 0) {
    return routeAllOrthogonalEdges({
      nodes: input.nodes,
      edges: input.edges,
      clearance: input.clearance,
    })
  }

  const dirtyNodes = input.dirtyNodeIds ?? new Set<string>()
  const byId = new Map(input.nodes.map((node) => [node.id, node]))
  const results = new Map<string, OrthogonalRouteResult>()
  const dirtyEdgeIds = new Set<string>()

  for (const edge of input.edges) {
    if (
      dirtyNodes.has(edge.source) ||
      dirtyNodes.has(edge.target) ||
      !input.previous.has(edge.id)
    ) {
      dirtyEdgeIds.add(edge.id)
    }
  }

  const pairCounts = new Map<string, number>()
  const pairSeen = new Map<string, number>()
  for (const edge of input.edges) {
    const key = pairKey(edge.source, edge.target)
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
  }

  const frozenWires: RoutePoint[][] = []
  const frozenLabels: RouteRect[] = []
  for (const edge of input.edges) {
    if (dirtyEdgeIds.has(edge.id)) continue
    const previous = input.previous.get(edge.id)
    if (!previous) continue
    results.set(edge.id, previous)
    frozenWires.push(previous.points)
    frozenLabels.push(previous.labelRect)
  }

  input.edges.forEach((edge, edgeIndex) => {
    if (!dirtyEdgeIds.has(edge.id)) return
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) return
    const key = pairKey(edge.source, edge.target)
    const parallelCount = pairCounts.get(key) ?? 1
    const parallelIndex = pairSeen.get(key) ?? 0
    pairSeen.set(key, parallelIndex + 1)
    const previous = input.previous?.get(edge.id)
    const labelBox = edge.labelBox ?? { width: 96, height: 22 }
    const routed = buildOrthogonalRoute({
      source,
      target,
      obstacles: input.nodes,
      reservedLabels: [...frozenLabels],
      foreignWires: frozenWires.map((points) => [...points]),
      labelBox,
      sourceSide: previous?.sourceSide,
      targetSide: previous?.targetSide,
      sourceAlong: previous?.sourceAlong,
      targetAlong: previous?.targetAlong,
      parallelIndex,
      parallelCount,
      laneGap: laneGapForLabels(labelBox.height),
      edgeIndex,
      clearance: input.clearance ?? 36,
    })
    results.set(edge.id, routed)
  })

  resolveOverlayConflicts({
    nodes: input.nodes,
    edges: input.edges,
    routes: results,
    maxPasses: 4,
    onlyEdgeIds: dirtyEdgeIds,
  })

  return results
}
