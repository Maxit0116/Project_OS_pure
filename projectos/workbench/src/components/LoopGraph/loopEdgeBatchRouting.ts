/**
 * C4-inspired batch routing for Loops Graph workflow edges.
 *
 * Coordinates port assignment, orthogonal paths, label parking, wire crossings,
 * and label↔label / label↔wire deconfliction — while preserving Loop-specific
 * rules (Agent/diamond single slots, provides curves handled elsewhere).
 */

import type { IntentGraph, IntentGraphNode } from '@contracts/index'
import {
  LOOP_EDGE_CORNER_RADIUS,
  LOOP_EDGE_NODE_CLEARANCE,
  countPolylineCrossings,
  estimateEdgeLabelSpan,
  formatEdgeLabel,
  labelRectAt,
  nodeRect,
  pickClearOrthogonalRoute,
  placeEdgeLabelOnPolyline,
  pointsToRoundedPath,
  portPoint,
  rectsOverlap,
  simplifyOrthogonalPoints,
  type LabelRect,
  type ObstacleRect,
  type Point,
} from './loopEdgeRouting'
import {
  assignLoopWorkflowPorts,
  type LoopPortAssignment,
} from './loopPortAssignment'

export type LoopBatchedEdgeRoute = {
  edgeId: string
  d: string
  points: Point[]
  mid: Point
  labelRect: LabelRect
  sourcePort: LoopPortAssignment['sourcePort']
  targetPort: LoopPortAssignment['targetPort']
  sourceAlong: number
  targetAlong: number
}

const LABEL_HEIGHT = 20

function estimateLabelBox(text: string): { width: number; height: number } {
  const span = estimateEdgeLabelSpan(text)
  // Soft wrap once past ~160px so tall chips get horizontal room.
  if (span <= 160) return { width: span, height: LABEL_HEIGHT }
  const lines = Math.min(3, Math.ceil(span / 140))
  return {
    width: Math.min(280, Math.max(96, span / lines + 8)),
    height: LABEL_HEIGHT * lines + (lines - 1) * 2,
  }
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`
}

function shiftHorizontalBand(
  points: Point[],
  bandY: number,
  delta: number,
): Point[] {
  if (points.length < 3 || Math.abs(delta) < 0.5) return points
  const pinY = [points[0]!.y, points[points.length - 1]!.y]
  return points.map((p, idx, arr) => {
    if (idx === 0 || idx === arr.length - 1) return p
    if (pinY.some((y) => Math.abs(p.y - y) < 0.5)) return p
    if (Math.abs(p.y - bandY) < 0.5) return { x: p.x, y: p.y + delta }
    return p
  })
}

/**
 * Soft-separate nearly coincident horizontal corridors so labels/wires stack
 * with readable gaps (C4 `separateParallelLanes` lite).
 */
function separateParallelLanes(
  routes: Map<string, LoopBatchedEdgeRoute>,
  labelHeights: Map<string, number>,
): void {
  const entries = [...routes.entries()]
  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const [idA, routeA] = entries[i]!
        const [idB, routeB] = entries[j]!
        const segsA = horizontalSegments(routeA.points)
        const segsB = horizontalSegments(routeB.points)
        for (const sa of segsA) {
          for (const sb of segsB) {
            const overlapX =
              Math.min(sa.a.x, sa.b.x) < Math.max(sb.a.x, sb.b.x) - 8 &&
              Math.min(sb.a.x, sb.b.x) < Math.max(sa.a.x, sa.b.x) - 8
            if (!overlapX) continue
            const dy = Math.abs(sa.a.y - sb.a.y)
            const need =
              Math.max(
                labelHeights.get(idA) ?? LABEL_HEIGHT,
                labelHeights.get(idB) ?? LABEL_HEIGHT,
              ) /
                2 +
              18
            if (dy >= need || dy < 1e-3) continue
            const delta = (need - dy) / 2 + 2
            const shiftA = sa.a.y <= sb.a.y ? -delta : delta
            routeA.points = simplifyOrthogonalPoints(
              shiftHorizontalBand(routeA.points, sa.a.y, shiftA),
            )
            routeB.points = simplifyOrthogonalPoints(
              shiftHorizontalBand(routeB.points, sb.a.y, -shiftA),
            )
            routeA.d = pointsToRoundedPath(routeA.points, LOOP_EDGE_CORNER_RADIUS)
            routeB.d = pointsToRoundedPath(routeB.points, LOOP_EDGE_CORNER_RADIUS)
            moved = true
          }
        }
      }
    }
    if (!moved) break
  }
}

function horizontalSegments(points: Point[]): Array<{ a: Point; b: Point }> {
  const out: Array<{ a: Point; b: Point }> = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    if (Math.abs(a.y - b.y) < 0.5) out.push({ a, b })
  }
  return out
}

function elongateForLabel(points: Point[], minWidth: number): Point[] {
  if (points.length < 4) return points
  const start = points[0]!
  const end = points[points.length - 1]!
  const sExit = points[1] ?? start
  const tApproach = points[points.length - 2] ?? end
  let bestLen = -1
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    if (Math.abs(a.y - b.y) > 0.5) continue
    bestLen = Math.max(bestLen, Math.abs(b.x - a.x))
  }
  if (bestLen >= minWidth) return points
  // Only a monotone Z-band is allowed: widening past both endpoints would make
  // the wire double back on itself (visible as a small loop). When the ends are
  // too close horizontally, keep the route and let the label sit on a vertical run.
  if (Math.abs(sExit.x - tApproach.x) < minWidth) return points
  const midY = (sExit.y + tApproach.y) / 2
  return simplifyOrthogonalPoints([
    start,
    sExit,
    { x: sExit.x, y: midY },
    { x: tApproach.x, y: midY },
    tApproach,
    end,
  ])
}

function resolveLabelOverlays(input: {
  routes: Map<string, LoopBatchedEdgeRoute>
  obstacles: ObstacleRect[]
  labelBoxes: Map<string, { width: number; height: number }>
  maxPasses?: number
}): void {
  const maxPasses = input.maxPasses ?? 6
  const ids = [...input.routes.keys()]

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let dirty = false
    for (const id of ids) {
      const route = input.routes.get(id)!
      const box = input.labelBoxes.get(id) ?? {
        width: 96,
        height: LABEL_HEIGHT,
      }
      const otherWires = ids
        .filter((other) => other !== id)
        .map((other) => input.routes.get(other)!.points)
      const otherLabels = ids
        .filter((other) => other !== id)
        .map((other) => input.routes.get(other)!.labelRect)

      const clear =
        !otherLabels.some((other) => rectsOverlap(route.labelRect, other, 10)) &&
        !input.obstacles.some((obs) =>
          rectsOverlap(
            route.labelRect,
            { x: obs.x, y: obs.y, w: obs.w, h: obs.h },
            4,
          ),
        ) &&
        countPolylineCrossings(
          [
            {
              x: route.labelRect.x,
              y: route.labelRect.y + route.labelRect.h / 2,
            },
            {
              x: route.labelRect.x + route.labelRect.w,
              y: route.labelRect.y + route.labelRect.h / 2,
            },
          ],
          otherWires,
        ) === 0

      // Cheaper clear check via placement score / overlaps.
      const placement = placeEdgeLabelOnPolyline(route.points, {
        labelSpan: box.width,
        labelHeight: box.height,
        obstacles: input.obstacles,
        reservedLabels: otherLabels,
        foreignWires: otherWires,
        labelId: `label:${id}`,
      })
      const stillBlocked =
        placement.score < 0 ||
        otherLabels.some((other) =>
          rectsOverlap(placement.labelRect, other, 10),
        )

      if (!stillBlocked && clear) {
        route.mid = placement.point
        route.labelRect = placement.labelRect
        continue
      }

      dirty = true
      let points = route.points
      let next = placement
      if (stillBlocked) {
        points = elongateForLabel(points, box.width + 64 + pass * 16)
        next = placeEdgeLabelOnPolyline(points, {
          labelSpan: box.width,
          labelHeight: box.height,
          obstacles: input.obstacles,
          reservedLabels: otherLabels,
          foreignWires: otherWires,
          labelId: `label:${id}`,
        })
      }
      route.points = points
      route.d = pointsToRoundedPath(points, LOOP_EDGE_CORNER_RADIUS)
      route.mid = next.point
      route.labelRect = next.labelRect
    }
    if (!dirty) return
  }
}

/**
 * Route every workflow edge together (skip `provides`). Returns a map keyed by
 * edge id for Overlay / Preview to consume.
 */
export function routeAllLoopWorkflowEdges(input: {
  draft: IntentGraph
  sizeOf: (node: IntentGraphNode) => { width: number; height: number }
  /** Optional pending-label copy for incomplete edges. */
  pendingLabel?: string
}): Map<string, LoopBatchedEdgeRoute> {
  const { draft, sizeOf } = input
  const workflowEdges = draft.edges.filter((edge) => edge.kind !== 'provides')
  const results = new Map<string, LoopBatchedEdgeRoute>()
  if (workflowEdges.length === 0) return results

  const assignments = assignLoopWorkflowPorts({ draft, sizeOf })
  const obstacles: ObstacleRect[] = draft.nodes.map((node) => {
    const size = sizeOf(node)
    return nodeRect(node, size.width, size.height, LOOP_EDGE_NODE_CLEARANCE)
  })

  const foreignWires: Point[][] = []
  const reservedLabels: LabelRect[] = []
  const labelBoxes = new Map<string, { width: number; height: number }>()
  const labelHeights = new Map<string, number>()

  const pairCounts = new Map<string, number>()
  const pairSeen = new Map<string, number>()
  for (const edge of workflowEdges) {
    const key = pairKey(edge.source, edge.target)
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
  }

  // Longer / busier labels first so they claim clear seats early.
  const ordered = [...workflowEdges].sort((a, b) => {
    const la = formatEdgeLabel(
      a.branchKey ? `${a.branchKey}: ${a.prompt ?? ''}` : (a.prompt ?? ''),
    )
    const lb = formatEdgeLabel(
      b.branchKey ? `${b.branchKey}: ${b.prompt ?? ''}` : (b.prompt ?? ''),
    )
    return lb.length - la.length
  })

  for (const edge of ordered) {
    const source = draft.nodes.find((n) => n.id === edge.source)
    const target = draft.nodes.find((n) => n.id === edge.target)
    if (!source || !target) continue
    const sourceSize = sizeOf(source)
    const targetSize = sizeOf(target)
    const assigned = assignments.get(edge.id)
    const sourcePort = assigned?.sourcePort ?? edge.sourcePort ?? 'e'
    const targetPort = assigned?.targetPort ?? edge.targetPort ?? 'w'
    const sourceAlong = assigned?.sourceAlong ?? 0.5
    const targetAlong = assigned?.targetAlong ?? 0.5

    const labelText =
      formatEdgeLabel(
        edge.branchKey
          ? `${edge.branchKey}: ${edge.prompt ?? ''}`
          : (edge.prompt ?? ''),
      ) ||
      input.pendingLabel ||
      '…'
    const labelBox = estimateLabelBox(labelText)
    labelBoxes.set(edge.id, labelBox)
    labelHeights.set(edge.id, labelBox.height)

    const start = portPoint(
      source,
      sourcePort,
      sourceSize.width,
      sourceSize.height,
      sourceAlong,
    )
    const end = portPoint(
      target,
      targetPort,
      targetSize.width,
      targetSize.height,
      targetAlong,
    )

    const key = pairKey(edge.source, edge.target)
    const parallelCount = pairCounts.get(key) ?? 1
    const parallelIndex = pairSeen.get(key) ?? 0
    pairSeen.set(key, parallelIndex + 1)
    const laneNudge =
      parallelCount > 1
        ? (parallelIndex - (parallelCount - 1) / 2) * Math.max(28, labelBox.height + 8)
        : 0

    let points = pickClearOrthogonalRoute({
      start,
      end,
      sourcePort,
      targetPort,
      obstacles,
      sourceId: source.id,
      targetId: target.id,
      foreignWires,
      reservedLabels,
      labelBox,
    })

    // Parallel siblings: nudge mid horizontal bands apart before labeling.
    if (laneNudge !== 0 && points.length >= 4) {
      const midIdx = Math.floor(points.length / 2)
      const band = points[midIdx]!
      if (
        midIdx > 0 &&
        midIdx < points.length - 1 &&
        Math.abs(band.y - points[midIdx - 1]!.y) < 0.5
      ) {
        points = simplifyOrthogonalPoints(
          shiftHorizontalBand(points, band.y, laneNudge),
        )
      } else if (
        midIdx > 0 &&
        midIdx < points.length - 1 &&
        Math.abs(band.x - points[midIdx - 1]!.x) < 0.5
      ) {
        // Vertical mid — nudge via a short detour highway.
        const y = band.y + laneNudge
        points = simplifyOrthogonalPoints([
          points[0]!,
          points[1] ?? points[0]!,
          { x: (points[1] ?? points[0]!).x, y },
          { x: (points[points.length - 2] ?? points[points.length - 1]!).x, y },
          points[points.length - 2] ?? points[points.length - 1]!,
          points[points.length - 1]!,
        ])
      }
    }

    const placement = placeEdgeLabelOnPolyline(points, {
      labelSpan: labelBox.width,
      labelHeight: labelBox.height,
      obstacles,
      reservedLabels,
      foreignWires,
      labelId: `label:${edge.id}`,
    })

    const routed: LoopBatchedEdgeRoute = {
      edgeId: edge.id,
      d: pointsToRoundedPath(points, LOOP_EDGE_CORNER_RADIUS),
      points,
      mid: placement.point,
      labelRect: placement.labelRect,
      sourcePort,
      targetPort,
      sourceAlong,
      targetAlong,
    }
    results.set(edge.id, routed)
    foreignWires.push(points)
    reservedLabels.push(placement.labelRect)
  }

  separateParallelLanes(results, labelHeights)

  // Re-seat labels after lane shifts.
  for (const [id, route] of results) {
    const box = labelBoxes.get(id) ?? { width: 96, height: LABEL_HEIGHT }
    const otherWires = [...results.entries()]
      .filter(([otherId]) => otherId !== id)
      .map(([, r]) => r.points)
    const otherLabels = [...results.entries()]
      .filter(([otherId]) => otherId !== id)
      .map(([, r]) => r.labelRect)
    const placement = placeEdgeLabelOnPolyline(route.points, {
      labelSpan: box.width,
      labelHeight: box.height,
      obstacles,
      reservedLabels: otherLabels,
      foreignWires: otherWires,
      labelId: `label:${id}`,
    })
    route.mid = placement.point
    route.labelRect = placement.labelRect
    route.d = pointsToRoundedPath(route.points, LOOP_EDGE_CORNER_RADIUS)
  }

  resolveLabelOverlays({
    routes: results,
    obstacles,
    labelBoxes,
    maxPasses: 6,
  })

  return results
}

/** Empty placeholder label rect for provides / missing edges. */
export function emptyLabelRect(mid: Point): LabelRect {
  return labelRectAt(mid, 0, 0)
}
