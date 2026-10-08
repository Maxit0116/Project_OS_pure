import { describe, expect, it } from 'vitest'
import {
  assignEdgePorts,
  buildOrthogonalRoute,
  fixedPortAlongs,
  laneGapForLabels,
  LABEL_NODE_PAD,
  minNodeGap,
  orthogonalCrossing,
  placeCenteredLabel,
  pointsToRoundedPath,
  PORTS_LEFT_RIGHT,
  PORTS_TOP_BOTTOM,
  rankSides,
  routeAllOrthogonalEdges,
  selectCenteredPortIndices,
  sidePortCapacity,
  uncrossSidePortsByApproach,
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

  it('offsets parallel edges onto distinct fixed ports', () => {
    const a = buildOrthogonalRoute({
      source: { id: 'a', x: 0, y: 40, width: 180, height: 96 },
      target: { id: 'b', x: 360, y: 40, width: 180, height: 96 },
      sourceSide: 'right',
      targetSide: 'left',
      sourceSlot: 0,
      sourceSlotCount: 2,
      targetSlot: 0,
      targetSlotCount: 2,
      sourceAlong: fixedPortAlongs(2)[0],
      targetAlong: fixedPortAlongs(2)[0],
    })
    const b = buildOrthogonalRoute({
      source: { id: 'a', x: 0, y: 40, width: 180, height: 96 },
      target: { id: 'b', x: 360, y: 40, width: 180, height: 96 },
      sourceSide: 'right',
      targetSide: 'left',
      sourceSlot: 1,
      sourceSlotCount: 2,
      targetSlot: 1,
      targetSlotCount: 2,
      sourceAlong: fixedPortAlongs(2)[1],
      targetAlong: fixedPortAlongs(2)[1],
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

describe('side ports', () => {
  it('ranks all four sides with the facing side first', () => {
    const a = { id: 'a', x: 0, y: 0, width: 120, height: 80 }
    const b = { id: 'b', x: 300, y: 20, width: 120, height: 80 }
    const sourceSides = rankSides(a, b, 'source')
    const targetSides = rankSides(a, b, 'target')
    expect(sourceSides[0]).toBe('right')
    expect(targetSides[0]).toBe('left')
    expect(new Set(sourceSides).size).toBe(4)
    expect(new Set(targetSides).size).toBe(4)
  })

  it('uses 3 ports on left/right and 4 on top/bottom for typical nodes', () => {
    const node = { id: 'n', x: 0, y: 0, width: 200, height: 160 }
    expect(sidePortCapacity(node, 'left')).toBe(PORTS_LEFT_RIGHT)
    expect(sidePortCapacity(node, 'right')).toBe(PORTS_LEFT_RIGHT)
    expect(sidePortCapacity(node, 'top')).toBe(PORTS_TOP_BOTTOM)
    expect(sidePortCapacity(node, 'bottom')).toBe(PORTS_TOP_BOTTOM)
    const short = { id: 's', x: 0, y: 0, width: 40, height: 40 }
    expect(sidePortCapacity(short, 'top')).toBe(1)
  })

  it('equally divides a side into fixed port fractions', () => {
    expect(fixedPortAlongs(3)).toEqual([0.25, 0.5, 0.75])
    expect(fixedPortAlongs(4)).toEqual([0.2, 0.4, 0.6, 0.8])
  })

  it('prefers centered ports when only one or two stubs share a side', () => {
    expect(selectCenteredPortIndices(3, 1)).toEqual([1]) // 0.5
    expect(selectCenteredPortIndices(3, 2)).toEqual([0, 2]) // 0.25 & 0.75
    expect(selectCenteredPortIndices(4, 1)).toEqual([1]) // 0.4 (nearer-center lower)
    expect(selectCenteredPortIndices(4, 2)).toEqual([1, 2]) // 0.4 & 0.6
  })

  it('uses unique fixed ports while under total capacity; spills sides before sharing', () => {
    const hub = { id: 'hub', x: 400, y: 100, width: 160, height: 200 }
    const leaves = [0, 1, 2, 3, 4].map((i) => ({
      id: `l${i}`,
      x: 0,
      y: i * 70,
      width: 120,
      height: 60,
    }))
    const nodes = [hub, ...leaves]
    const edges = leaves.map((leaf) => ({
      id: `e-${leaf.id}`,
      source: leaf.id,
      target: 'hub',
    }))
    const ports = assignEdgePorts({
      nodes,
      edges,
    })
    const targetKeys = edges.map((edge) => {
      const p = ports.get(edge.id)!
      return `${p.targetSide}:${p.targetSlot}`
    })
    // 5 stubs << hub capacity (3+3+4+4) → no sharing.
    expect(new Set(targetKeys).size).toBe(5)
    expect(edges.every((edge) => !ports.get(edge.id)!.targetShared)).toBe(true)
    const leftCount = targetKeys.filter((key) => key.startsWith('left:')).length
    expect(leftCount).toBeLessThanOrEqual(PORTS_LEFT_RIGHT)
  })

  it('places a single fan-in on the centered left port', () => {
    const ports = assignEdgePorts({
      nodes: [
        { id: 'a', x: 0, y: 80, width: 120, height: 80 },
        { id: 'hub', x: 300, y: 40, width: 160, height: 160 },
      ],
      edges: [{ id: 'e1', source: 'a', target: 'hub' }],
    })
    const p = ports.get('e1')!
    expect(p.targetSide).toBe('left')
    expect(p.targetAlong).toBe(0.5)
  })

  it('matches higher neighbour to higher port (no swapped 0.25/0.5)', () => {
    const hub = { id: 'hub', x: 400, y: 40, width: 160, height: 160 }
    const high = { id: 'high', x: 0, y: 0, width: 120, height: 80 }
    const low = { id: 'low', x: 0, y: 160, width: 120, height: 80 }
    const routes = routeAllOrthogonalEdges({
      nodes: [hub, high, low],
      edges: [
        { id: 'e-high', source: 'high', target: 'hub', labelBox: { width: 80, height: 20 } },
        { id: 'e-low', source: 'low', target: 'hub', labelBox: { width: 80, height: 20 } },
      ],
    })
    const highRoute = routes.get('e-high')!
    const lowRoute = routes.get('e-low')!
    expect(highRoute.targetSide).toBe('left')
    expect(lowRoute.targetSide).toBe('left')
    expect(highRoute.targetAlong).toBeLessThan(lowRoute.targetAlong)
  })

  it('uncrossSidePortsByApproach swaps inverted target ports', () => {
    const hub = { id: 'hub', x: 300, y: 0, width: 120, height: 120 }
    const high = { id: 'high', x: 0, y: 0, width: 100, height: 60 }
    const low = { id: 'low', x: 0, y: 100, width: 100, height: 60 }
    const routes = routeAllOrthogonalEdges({
      nodes: [hub, high, low],
      edges: [
        { id: 'e-high', source: 'high', target: 'hub' },
        { id: 'e-low', source: 'low', target: 'hub' },
      ],
    })
    // Force an inversion, then uncross.
    const highRoute = routes.get('e-high')!
    const lowRoute = routes.get('e-low')!
    const highAlong = highRoute.targetAlong
    const lowAlong = lowRoute.targetAlong
    highRoute.targetAlong = lowAlong
    lowRoute.targetAlong = highAlong
    uncrossSidePortsByApproach({
      nodes: [hub, high, low],
      edges: [
        { id: 'e-high', source: 'high', target: 'hub' },
        { id: 'e-low', source: 'low', target: 'hub' },
      ],
      routes,
    })
    expect(routes.get('e-high')!.targetAlong).toBeLessThan(
      routes.get('e-low')!.targetAlong,
    )
  })

  it('keeps three right-side ports at 0.25 / 0.5 / 0.75 after routing', () => {
    const hub = { id: 'hub', x: 0, y: 0, width: 180, height: 200 }
    const targets = [
      { id: 't0', x: 400, y: -40, width: 140, height: 80 },
      { id: 't1', x: 400, y: 60, width: 140, height: 80 },
      { id: 't2', x: 400, y: 160, width: 140, height: 80 },
    ]
    const routes = routeAllOrthogonalEdges({
      nodes: [hub, ...targets],
      edges: targets.map((t) => ({
        id: `e-${t.id}`,
        source: 'hub',
        target: t.id,
        labelBox: { width: 120, height: 24 },
      })),
    })
    const alongs = targets.map((t) => {
      const route = routes.get(`e-${t.id}`)!
      expect(route.sourceSide).toBe('right')
      const y = route.points[0]!.y
      return (y - hub.y) / hub.height
    })
    alongs.sort((a, b) => a - b)
    expect(alongs[0]).toBeCloseTo(0.25, 5)
    expect(alongs[1]).toBeCloseTo(0.5, 5)
    expect(alongs[2]).toBeCloseTo(0.75, 5)
  })

  it('shares a port only when stubs exceed total fixed capacity', () => {
    // Tiny hub → ~1 port per side by MIN_PORT_GAP → 4 total < 5 stubs.
    const hub = { id: 'hub', x: 200, y: 0, width: 36, height: 36 }
    const leaves = [0, 1, 2, 3, 4].map((i) => ({
      id: `l${i}`,
      x: 0,
      y: i * 40,
      width: 60,
      height: 30,
    }))
    const ports = assignEdgePorts({
      nodes: [hub, ...leaves],
      edges: leaves.map((leaf) => ({
        id: `e-${leaf.id}`,
        source: leaf.id,
        target: 'hub',
      })),
    })
    const shared = [...ports.values()].filter((p) => p.targetShared)
    expect(shared.length).toBeGreaterThan(0)
  })

  it('routes from non-default sides when forced', () => {
    const route = buildOrthogonalRoute({
      source: { id: 'a', x: 0, y: 0, width: 120, height: 80 },
      target: { id: 'b', x: 40, y: 200, width: 120, height: 80 },
      sourceSide: 'bottom',
      targetSide: 'top',
      sourceAlong: 0.5,
      targetAlong: 0.5,
    })
    expect(route.sourceSide).toBe('bottom')
    expect(route.targetSide).toBe('top')
    expect(route.points[0]!.y).toBe(80)
    expect(route.points[route.points.length - 1]!.y).toBe(200)
  })

  it('keeps edge labels clear of endpoint node boxes', () => {
    const source = { id: 'a', x: 0, y: 80, width: 160, height: 100 }
    const target = { id: 'b', x: 280, y: 80, width: 160, height: 100 }
    const route = buildOrthogonalRoute({
      source,
      target,
      labelBox: { width: 200, height: 28 },
      sourceSide: 'right',
      targetSide: 'left',
      sourceAlong: 0.5,
      targetAlong: 0.5,
    })
    const hitsSource =
      route.labelRect.x < source.x + source.width + LABEL_NODE_PAD &&
      route.labelRect.x + route.labelRect.width > source.x - LABEL_NODE_PAD &&
      route.labelRect.y < source.y + source.height + LABEL_NODE_PAD &&
      route.labelRect.y + route.labelRect.height > source.y - LABEL_NODE_PAD
    const hitsTarget =
      route.labelRect.x < target.x + target.width + LABEL_NODE_PAD &&
      route.labelRect.x + route.labelRect.width > target.x - LABEL_NODE_PAD &&
      route.labelRect.y < target.y + target.height + LABEL_NODE_PAD &&
      route.labelRect.y + route.labelRect.height > target.y - LABEL_NODE_PAD
    expect(hitsSource).toBe(false)
    expect(hitsTarget).toBe(false)
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
    expect(h.points.length).toBeGreaterThanOrEqual(2)
    expect(v.points.length).toBeGreaterThanOrEqual(2)
    // Prefer sliding off the crossing when a clear segment exists; if the
    // only long lane is the crossing lane, placement may still sit near it.
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
    if (crosses.length === 0) return
    const clearCount = [h, v].filter((route) =>
      crosses.every((cross) => {
        const dx = Math.abs(route.label.x - cross.x)
        const dy = Math.abs(route.label.y - cross.y)
        return (
          dx > route.labelRect.width / 2 + 4 ||
          dy > route.labelRect.height / 2 + 4
        )
      }),
    ).length
    expect(clearCount).toBeGreaterThanOrEqual(1)
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
