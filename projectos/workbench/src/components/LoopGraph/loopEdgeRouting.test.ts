import { describe, expect, it } from 'vitest'
import {
  LOOP_NODE_H,
  LOOP_NODE_W,
  LOOP_EDGE_LABEL_CORNER_PAD,
  LOOP_EDGE_NODE_CLEARANCE,
  nearestPort,
  portPoint,
  preferredPortsForPair,
  routeLoopEdge,
  routeProvidesCurve,
  formatEdgeLabel,
  truncateEdgeLabel,
  buildOrthogonalEdgePoints,
  pointsToRoundedPath,
  placeEdgeLabelOnPolyline,
  polylineOverlapsObstacles,
  snapGraphNodePosition,
  simplifyOrthogonalPoints,
  nodeRect,
} from './loopEdgeRouting'

function countBends(points: { x: number; y: number }[]): number {
  return Math.max(0, simplifyOrthogonalPoints(points).length - 2)
}

const nodeA = {
  id: 'a',
  title: 'A',
  prompt: '',
  position: { x: 0, y: 0 },
}

const nodeB = {
  id: 'b',
  title: 'B',
  prompt: '',
  position: { x: 280, y: 0 },
}

describe('loopEdgeRouting', () => {
  it('maps ports to node mid-sides', () => {
    expect(portPoint(nodeA, 'n')).toEqual({ x: LOOP_NODE_W / 2, y: 0 })
    expect(portPoint(nodeA, 'e')).toEqual({
      x: LOOP_NODE_W,
      y: LOOP_NODE_H / 2,
    })
    expect(portPoint(nodeA, 's')).toEqual({
      x: LOOP_NODE_W / 2,
      y: LOOP_NODE_H,
    })
    expect(portPoint(nodeA, 'w')).toEqual({ x: 0, y: LOOP_NODE_H / 2 })
  })

  it('picks the nearest port to a pointer', () => {
    expect(nearestPort(nodeA, { x: LOOP_NODE_W / 2, y: -20 })).toBe('n')
    expect(nearestPort(nodeA, { x: LOOP_NODE_W + 40, y: LOOP_NODE_H / 2 })).toBe('e')
    // Bottom reserved (Agent with satellites): never pick S even when the
    // pointer is clearly below the node.
    expect(
      nearestPort(
        nodeA,
        { x: LOOP_NODE_W / 2, y: LOOP_NODE_H + 40 },
        LOOP_NODE_W,
        LOOP_NODE_H,
        ['n', 'e', 'w'],
      ),
    ).not.toBe('s')
  })

  it('prefers facing ports between a horizontal pair', () => {
    const ports = preferredPortsForPair(nodeA, nodeB)
    expect(ports.sourcePort).toBe('e')
    expect(ports.targetPort).toBe('w')
  })

  it('routes an orthogonal path with rounded corners', () => {
    const routed = routeLoopEdge({
      source: nodeA,
      target: nodeB,
      sourcePort: 'e',
      targetPort: 'w',
      obstacles: [],
    })
    expect(routed.d.startsWith('M ')).toBe(true)
    expect(routed.d.includes(' C ')).toBe(false)
    expect(routed.d.includes(' L ') || routed.d.includes(' Q ')).toBe(true)
    expect(routed.sourcePort).toBe('e')
    expect(routed.targetPort).toBe('w')
    expect(routed.points.length).toBeGreaterThanOrEqual(2)
    expect(routed.mid.x).toBeGreaterThan(nodeA.position.x)
    expect(routed.mid.x).toBeLessThan(nodeB.position.x + LOOP_NODE_W)
  })

  it('routes provides wiring as a soft cubic curve', () => {
    const routed = routeProvidesCurve({
      start: { x: 100, y: 200 },
      end: { x: 140, y: 80 },
    })
    expect(routed.d.includes(' C ')).toBe(true)
    expect(routed.d.includes(' Q ')).toBe(false)
    expect(routed.mid.y).toBe(140)
  })

  it('builds orthogonal bends for facing east→west ports', () => {
    const start = { x: 200, y: 28 }
    const end = { x: 280, y: 80 }
    const points = buildOrthogonalEdgePoints({
      start,
      end,
      sourcePort: 'e',
      targetPort: 'w',
    })
    // Only axis-aligned steps.
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i]!
      const b = points[i + 1]!
      expect(a.x === b.x || a.y === b.y).toBe(true)
    }
    expect(points[0]).toEqual(start)
    expect(points[points.length - 1]).toEqual(end)
  })

  it('prefers a straight edge when ports already share an axis', () => {
    const points = buildOrthogonalEdgePoints({
      start: { x: 100, y: 40 },
      end: { x: 300, y: 40 },
      sourcePort: 'e',
      targetPort: 'w',
    })
    expect(countBends(points)).toBe(0)
  })

  it('uses at most one bend for mixed-orientation ports', () => {
    const points = buildOrthogonalEdgePoints({
      start: { x: 100, y: 40 },
      end: { x: 260, y: 160 },
      sourcePort: 'e',
      targetPort: 'n',
    })
    expect(countBends(points)).toBeLessThanOrEqual(1)
  })

  it('parks labels on the longest segment away from corners', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 120 },
      { x: 40, y: 120 },
    ]
    const placed = placeEdgeLabelOnPolyline(points, {
      labelSpan: 64,
      cornerPad: LOOP_EDGE_LABEL_CORNER_PAD,
    })
    // Long vertical run is the parking spot.
    expect(placed.segmentIndex).toBe(1)
    expect(placed.point.x).toBe(20)
    expect(placed.point.y).toBeGreaterThan(LOOP_EDGE_LABEL_CORNER_PAD)
    expect(placed.point.y).toBeLessThan(120 - LOOP_EDGE_LABEL_CORNER_PAD)
  })

  it('snaps a node toward a neighbor to share a center axis', () => {
    const snapped = snapGraphNodePosition({
      position: { x: 0, y: 6 },
      width: LOOP_NODE_W,
      height: LOOP_NODE_H,
      neighbors: [
        {
          position: { x: 280, y: 0 },
          width: LOOP_NODE_W,
          height: LOOP_NODE_H,
          localPort: 'e',
        },
      ],
    })
    expect(snapped.y).toBe(0)
    expect(snapped.x).toBe(0)
  })

  it('fillets corners with quadratic segments', () => {
    const path = pointsToRoundedPath([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
    ])
    expect(path).toContain('Q ')
  })

  it('simplifies colinear orthogonal points', () => {
    expect(
      simplifyOrthogonalPoints([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 10 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
    ])
  })

  it('formats edge labels without dropping content', () => {
    expect(formatEdgeLabel('  short  label ')).toBe('short label')
    const long = 'On review pass, request final approval before create PR'
    expect(formatEdgeLabel(long)).toBe(long)
  })

  it('keeps truncateEdgeLabel for callers that still need a short preview', () => {
    expect(truncateEdgeLabel('short')).toBe('short')
    expect(truncateEdgeLabel('x'.repeat(50)).endsWith('…')).toBe(true)
  })

  it('routes around a blocking node instead of cutting through it', () => {
    const source = {
      id: 'src',
      title: 'Src',
      prompt: '',
      position: { x: 0, y: 0 },
    }
    const target = {
      id: 'dst',
      title: 'Dst',
      prompt: '',
      position: { x: 400, y: 0 },
    }
    // Non-overlapping blocker sitting on the straight E→W corridor.
    const blocker = {
      id: 'block',
      title: 'Block',
      prompt: '',
      position: { x: 230, y: -10 },
    }
    const targetFar = {
      ...target,
      position: { x: 500, y: 0 },
    }
    const routed = routeLoopEdge({
      source,
      target: targetFar,
      sourcePort: 'e',
      targetPort: 'w',
      obstacles: [source, blocker, targetFar],
    })
    const obstacles = [
      nodeRect(source, LOOP_NODE_W, LOOP_NODE_H, LOOP_EDGE_NODE_CLEARANCE),
      nodeRect(blocker, LOOP_NODE_W, LOOP_NODE_H, LOOP_EDGE_NODE_CLEARANCE),
      nodeRect(targetFar, LOOP_NODE_W, LOOP_NODE_H, LOOP_EDGE_NODE_CLEARANCE),
    ]
    expect(
      polylineOverlapsObstacles(routed.points, obstacles, {
        sourceId: source.id,
        targetId: targetFar.id,
      }),
    ).toBe(false)
    for (let i = 1; i < routed.points.length - 1; i += 1) {
      const p = routed.points[i]!
      const insideBlocker =
        p.x > blocker.position.x - LOOP_EDGE_NODE_CLEARANCE &&
        p.x < blocker.position.x + LOOP_NODE_W + LOOP_EDGE_NODE_CLEARANCE &&
        p.y > blocker.position.y - LOOP_EDGE_NODE_CLEARANCE &&
        p.y < blocker.position.y + LOOP_NODE_H + LOOP_EDGE_NODE_CLEARANCE
      expect(insideBlocker).toBe(false)
    }
  })

  it('does not hide bends under the source or target node', () => {
    const source = {
      id: 'a2',
      title: 'A',
      prompt: '',
      position: { x: 0, y: 0 },
    }
    const target = {
      id: 'b2',
      title: 'B',
      prompt: '',
      position: { x: 80, y: 160 },
    }
    const routed = routeLoopEdge({
      source,
      target,
      sourcePort: 'e',
      targetPort: 'w',
      obstacles: [source, target],
    })
    const obstacles = [
      nodeRect(source, LOOP_NODE_W, LOOP_NODE_H, LOOP_EDGE_NODE_CLEARANCE),
      nodeRect(target, LOOP_NODE_W, LOOP_NODE_H, LOOP_EDGE_NODE_CLEARANCE),
    ]
    expect(
      polylineOverlapsObstacles(routed.points, obstacles, {
        sourceId: source.id,
        targetId: target.id,
      }),
    ).toBe(false)
  })
})
