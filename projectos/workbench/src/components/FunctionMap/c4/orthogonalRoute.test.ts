import { describe, expect, it } from 'vitest'
import {
  buildOrthogonalRoute,
  laneGapForLabels,
  minNodeGap,
  orthogonalCrossing,
  placeCenteredLabel,
  pointsToRoundedPath,
  routeAllOrthogonalEdges,
} from './orthogonalRoute'

describe('buildOrthogonalRoute', () => {
  it('builds a multi-bend orthogonal path between horizontally separated nodes', () => {
    const route = buildOrthogonalRoute({
      source: { id: 'a', x: 0, y: 40, width: 180, height: 96 },
      target: { id: 'b', x: 360, y: 200, width: 180, height: 96 },
    })
    expect(route.points.length).toBeGreaterThanOrEqual(3)
    expect(route.path.startsWith('M ')).toBe(true)
    expect(route.path).toContain('Q')
    expect(route.sourceSide).toBe('right')
    expect(route.targetSide).toBe('left')
  })

  it('offsets parallel edges so they do not share the same channel', () => {
    const a = buildOrthogonalRoute({
      source: { id: 'a', x: 0, y: 40, width: 180, height: 96 },
      target: { id: 'b', x: 360, y: 40, width: 180, height: 96 },
      parallelIndex: 0,
      parallelCount: 2,
    })
    const b = buildOrthogonalRoute({
      source: { id: 'a', x: 0, y: 40, width: 180, height: 96 },
      target: { id: 'b', x: 360, y: 40, width: 180, height: 96 },
      parallelIndex: 1,
      parallelCount: 2,
    })
    expect(a.points[0]!.y).not.toBe(b.points[0]!.y)
  })

  it('routes around an obstacle when the straight mid channel is blocked', () => {
    const route = buildOrthogonalRoute({
      source: { id: 'a', x: 0, y: 100, width: 120, height: 80 },
      target: { id: 'c', x: 400, y: 100, width: 120, height: 80 },
      obstacles: [{ id: 'b', x: 180, y: 80, width: 140, height: 120 }],
      clearance: 24,
      labelBox: { width: 100, height: 22 },
    })
    const midYs = route.points.map((point) => point.y)
    const blocked = midYs.every((y) => y >= 80 && y <= 200)
    const midXs = route.points.map((point) => point.x)
    const dodgedX = midXs.some((x) => x < 170 || x > 330)
    expect(blocked && !dodgedX).toBe(false)
    expect(route.label).toBeTruthy()
  })

  it('places the label center on a route segment (midline)', () => {
    const route = buildOrthogonalRoute({
      source: { id: 'a', x: 0, y: 40, width: 160, height: 80 },
      target: { id: 'b', x: 420, y: 200, width: 160, height: 80 },
      labelBox: { width: 120, height: 24 },
    })
    // Label must lie on some segment of the polyline.
    const onSegment = route.points.slice(0, -1).some((a, i) => {
      const b = route.points[i + 1]!
      const colinearH =
        Math.abs(a.y - b.y) < 1e-6 &&
        Math.abs(route.label.y - a.y) < 1e-6 &&
        route.label.x >= Math.min(a.x, b.x) - 1e-6 &&
        route.label.x <= Math.max(a.x, b.x) + 1e-6
      const colinearV =
        Math.abs(a.x - b.x) < 1e-6 &&
        Math.abs(route.label.x - a.x) < 1e-6 &&
        route.label.y >= Math.min(a.y, b.y) - 1e-6 &&
        route.label.y <= Math.max(a.y, b.y) + 1e-6
      return colinearH || colinearV
    })
    expect(onSegment).toBe(true)
    expect(route.labelRect.width).toBe(120)
    expect(route.labelRect.height).toBe(24)
  })
})

describe('placeCenteredLabel', () => {
  it('avoids reserved sibling label boxes when possible', () => {
    const points = [
      { x: 0, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 220 },
      { x: 400, y: 220 },
    ]
    const reserved = [
      {
        id: 'prev',
        x: 140,
        y: 88,
        width: 120,
        height: 24,
      },
    ]
    const placed = placeCenteredLabel(
      points,
      { width: 120, height: 24 },
      [],
      reserved,
      'next',
    )
    const overlapsReserved =
      placed.labelRect.x < reserved[0]!.x + reserved[0]!.width &&
      reserved[0]!.x < placed.labelRect.x + placed.labelRect.width &&
      placed.labelRect.y < reserved[0]!.y + reserved[0]!.height &&
      reserved[0]!.y < placed.labelRect.y + placed.labelRect.height
    expect(overlapsReserved).toBe(false)
  })

  it('slides the label away from a foreign wire crossing', () => {
    // Host horizontal lane crossed by a vertical foreign wire at x=200.
    const points = [
      { x: 0, y: 100 },
      { x: 400, y: 100 },
    ]
    const foreign = [[{ x: 200, y: 0 }, { x: 200, y: 200 }]]
    const placed = placeCenteredLabel(
      points,
      { width: 140, height: 28 },
      [],
      [],
      'host',
      foreign,
    )
    // Label centre must not sit on the crossing.
    expect(Math.abs(placed.label.x - 200)).toBeGreaterThan(70)
    // And the box should not cover the vertical wire.
    const coversWire =
      placed.labelRect.x - 8 <= 200 &&
      placed.labelRect.x + placed.labelRect.width + 8 >= 200 &&
      placed.labelRect.y - 8 <= 100 &&
      placed.labelRect.y + placed.labelRect.height + 8 >= 100
    expect(coversWire).toBe(false)
  })
})

describe('orthogonalCrossing', () => {
  it('finds H×V intersections', () => {
    const cross = orthogonalCrossing(
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      { x: 40, y: 0 },
      { x: 40, y: 100 },
    )
    expect(cross).toEqual({ x: 40, y: 50 })
  })
})

describe('laneGapForLabels', () => {
  it('grows with label height so parallel wires clear each other', () => {
    expect(laneGapForLabels(28, 28)).toBeGreaterThanOrEqual(46)
    expect(laneGapForLabels(40, 40)).toBeGreaterThan(laneGapForLabels(22, 22))
  })
})

describe('routeAllOrthogonalEdges', () => {
  it('reserves labels so later edges bend / place away from earlier ones', () => {
    const nodes = [
      { id: 'a', x: 0, y: 0, width: 140, height: 80 },
      { id: 'b', x: 360, y: 0, width: 140, height: 80 },
      { id: 'c', x: 0, y: 220, width: 140, height: 80 },
      { id: 'd', x: 360, y: 220, width: 140, height: 80 },
    ]
    const routes = routeAllOrthogonalEdges({
      nodes,
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          labelBox: { width: 140, height: 28 },
        },
        {
          id: 'e2',
          source: 'c',
          target: 'd',
          labelBox: { width: 140, height: 28 },
        },
      ],
    })
    const a = routes.get('e1')!
    const b = routes.get('e2')!
    expect(a).toBeTruthy()
    expect(b).toBeTruthy()
    const overlapX =
      a.labelRect.x < b.labelRect.x + b.labelRect.width &&
      b.labelRect.x < a.labelRect.x + a.labelRect.width
    const overlapY =
      a.labelRect.y < b.labelRect.y + b.labelRect.height &&
      b.labelRect.y < a.labelRect.y + a.labelRect.height
    expect(overlapX && overlapY).toBe(false)
  })

  it('fans in to a shared target with label-height lane spacing', () => {
    const nodes = [
      { id: 'android', x: 0, y: 40, width: 160, height: 100 },
      { id: 'macos', x: 0, y: 200, width: 160, height: 100 },
      { id: 'supabase', x: 520, y: 100, width: 180, height: 120 },
    ]
    const routes = routeAllOrthogonalEdges({
      nodes,
      edges: [
        {
          id: 'e1',
          source: 'android',
          target: 'supabase',
          labelBox: { width: 200, height: 28 },
        },
        {
          id: 'e2',
          source: 'macos',
          target: 'supabase',
          labelBox: { width: 200, height: 28 },
        },
      ],
    })
    const a = routes.get('e1')!
    const b = routes.get('e2')!
    // Approach attach Y on the shared target should differ by ~lane gap.
    const endYA = a.points[a.points.length - 1]!.y
    const endYB = b.points[b.points.length - 1]!.y
    expect(Math.abs(endYA - endYB)).toBeGreaterThanOrEqual(
      laneGapForLabels(28, 28) - 4,
    )
    // Neither label should cover the other edge's polyline.
    const aHitsB = a.labelRect
    const bWire = b.points
    let covers = false
    for (let i = 0; i < bWire.length - 1; i += 1) {
      const p = bWire[i]!
      const q = bWire[i + 1]!
      const minX = Math.min(p.x, q.x)
      const maxX = Math.max(p.x, q.x)
      const minY = Math.min(p.y, q.y)
      const maxY = Math.max(p.y, q.y)
      const hitH =
        Math.abs(p.y - q.y) < 1e-6 &&
        p.y >= aHitsB.y - 8 &&
        p.y <= aHitsB.y + aHitsB.height + 8 &&
        maxX >= aHitsB.x - 8 &&
        minX <= aHitsB.x + aHitsB.width + 8
      const hitV =
        Math.abs(p.x - q.x) < 1e-6 &&
        p.x >= aHitsB.x - 8 &&
        p.x <= aHitsB.x + aHitsB.width + 8 &&
        maxY >= aHitsB.y - 8 &&
        minY <= aHitsB.y + aHitsB.height + 8
      if (hitH || hitV) covers = true
    }
    expect(covers).toBe(false)
  })

  it('keeps labels off the crossing of two edges', () => {
    const nodes = [
      { id: 'top', x: 200, y: 0, width: 120, height: 70 },
      { id: 'bottom', x: 200, y: 280, width: 120, height: 70 },
      { id: 'left', x: 0, y: 140, width: 120, height: 70 },
      { id: 'right', x: 400, y: 140, width: 120, height: 70 },
    ]
    const routes = routeAllOrthogonalEdges({
      nodes,
      edges: [
        {
          id: 'vertical',
          source: 'top',
          target: 'bottom',
          labelBox: { width: 160, height: 28 },
        },
        {
          id: 'horizontal',
          source: 'left',
          target: 'right',
          labelBox: { width: 160, height: 28 },
        },
      ],
    })
    const h = routes.get('horizontal')!
    const v = routes.get('vertical')!
    // Find crossings between the two polylines.
    const crosses: { x: number; y: number }[] = []
    for (let i = 0; i < h.points.length - 1; i += 1) {
      for (let j = 0; j < v.points.length - 1; j += 1) {
        const c = orthogonalCrossing(
          h.points[i]!,
          h.points[i + 1]!,
          v.points[j]!,
          v.points[j + 1]!,
        )
        if (c) crosses.push(c)
      }
    }
    for (const cross of crosses) {
      for (const route of [h, v]) {
        const dx = Math.abs(route.label.x - cross.x)
        const dy = Math.abs(route.label.y - cross.y)
        const farEnough =
          dx > route.labelRect.width / 2 + 10 ||
          dy > route.labelRect.height / 2 + 10
        expect(farEnough).toBe(true)
      }
    }
  })
})

describe('pointsToRoundedPath', () => {
  it('emits a simple line for two points', () => {
    expect(
      pointsToRoundedPath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toBe('M 0 0 L 10 0')
  })
})

describe('minNodeGap', () => {
  it('reports the clear gap between non-overlapping boxes', () => {
    const gap = minNodeGap([
      { id: 'a', x: 0, y: 0, width: 100, height: 80 },
      { id: 'b', x: 140, y: 0, width: 100, height: 80 },
    ])
    expect(gap).toBe(40)
  })
})
