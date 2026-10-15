import { describe, expect, it } from 'vitest'
import { liveRouteFrame } from './liveEdgeRoutes'
import { routeAllOrthogonalEdges, type RouteRect } from './orthogonalRoute'

function onBorder(point: { x: number; y: number }, rect: RouteRect, eps = 1.5): boolean {
  const withinX = point.x >= rect.x - eps && point.x <= rect.x + rect.width + eps
  const withinY = point.y >= rect.y - eps && point.y <= rect.y + rect.height + eps
  const onVertical =
    (Math.abs(point.x - rect.x) <= eps || Math.abs(point.x - (rect.x + rect.width)) <= eps) &&
    withinY
  const onHorizontal =
    (Math.abs(point.y - rect.y) <= eps || Math.abs(point.y - (rect.y + rect.height)) <= eps) &&
    withinX
  return onVertical || onHorizontal
}

function segmentEntersRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  rect: RouteRect,
): boolean {
  const steps = 24
  for (let step = 1; step < steps; step += 1) {
    const t = step / steps
    const x = a.x + (b.x - a.x) * t
    const y = a.y + (b.y - a.y) * t
    if (
      x > rect.x + 2 &&
      x < rect.x + rect.width - 2 &&
      y > rect.y + 2 &&
      y < rect.y + rect.height - 2
    ) {
      return true
    }
  }
  return false
}

function rectsOverlap(a: RouteRect, b: RouteRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

describe('liveRouteFrame', () => {
  const source: RouteRect = { id: 'a', x: 0, y: 80, width: 120, height: 72 }
  const target: RouteRect = { id: 'b', x: 420, y: 80, width: 120, height: 72 }
  const edges = [
    {
      id: 'e1',
      source: 'a',
      target: 'b',
      labelBox: { width: 72, height: 22 },
    },
  ]

  it('keeps the moved endpoint on the new node border', () => {
    const first = liveRouteFrame({
      nodes: [source, target],
      edges,
      mode: 'full',
      clearance: 36,
    })
    const moved: RouteRect = { ...source, x: 48, y: 140 }
    const next = liveRouteFrame({
      nodes: [moved, target],
      edges,
      previous: first,
      dirtyNodeIds: new Set(['a']),
      mode: 'incremental',
      clearance: 36,
    })
    const points = next.get('e1')!.points
    expect(onBorder(points[0]!, moved)).toBe(true)
    expect(onBorder(points[points.length - 1]!, target)).toBe(true)
  })

  it('routes around a node blocking the channel', () => {
    const blocker: RouteRect = { id: 'c', x: 190, y: 60, width: 140, height: 120 }
    const routes = liveRouteFrame({
      nodes: [source, blocker, target],
      edges,
      mode: 'full',
      clearance: 36,
    })
    const points = routes.get('e1')!.points
    for (let index = 1; index < points.length; index += 1) {
      expect(segmentEntersRect(points[index - 1]!, points[index]!, blocker)).toBe(false)
    }
    expect(points.length).toBeGreaterThanOrEqual(3)
  })

  it('keeps unrelated edge points identical while a node moves', () => {
    const c: RouteRect = { id: 'c', x: 0, y: 320, width: 120, height: 72 }
    const d: RouteRect = { id: 'd', x: 420, y: 320, width: 120, height: 72 }
    const graphEdges = [
      ...edges,
      { id: 'e2', source: 'c', target: 'd', labelBox: { width: 72, height: 22 } },
    ]
    const nodes = [source, target, c, d]
    const first = liveRouteFrame({ nodes, edges: graphEdges, mode: 'full', clearance: 36 })
    const moved = nodes.map((node) => (node.id === 'a' ? { ...node, x: node.x + 70 } : node))
    const next = liveRouteFrame({
      nodes: moved,
      edges: graphEdges,
      previous: first,
      dirtyNodeIds: new Set(['a']),
      mode: 'incremental',
      clearance: 36,
    })
    expect(next.get('e2')!.points).toBe(first.get('e2')!.points)
    expect(next.get('e1')!.points).not.toBe(first.get('e1')!.points)
  })

  it('places two edge labels so they do not overlap', () => {
    const c: RouteRect = { id: 'c', x: 0, y: 280, width: 140, height: 80 }
    const d: RouteRect = { id: 'd', x: 400, y: 280, width: 140, height: 80 }
    const graphEdges = [
      { id: 'e1', source: 'a', target: 'b', labelBox: { width: 88, height: 24 } },
      { id: 'e2', source: 'c', target: 'd', labelBox: { width: 88, height: 24 } },
    ]
    const routes = liveRouteFrame({
      nodes: [source, target, c, d],
      edges: graphEdges,
      mode: 'full',
      clearance: 36,
    })
    expect(rectsOverlap(routes.get('e1')!.labelRect, routes.get('e2')!.labelRect)).toBe(false)
  })

  it('matches routeAllOrthogonalEdges in full mode', () => {
    const nodes = [source, target]
    const full = routeAllOrthogonalEdges({ nodes, edges, clearance: 36 })
    const via = liveRouteFrame({ nodes, edges, mode: 'full', clearance: 36 })
    expect([...via.keys()]).toEqual([...full.keys()])
    for (const id of full.keys()) {
      expect(via.get(id)).toEqual(full.get(id))
    }
  })
})
