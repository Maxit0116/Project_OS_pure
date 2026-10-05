import { describe, expect, it } from 'vitest'
import type { ArchitectureLayer, FileEntry, FileRelation, FunctionalEdge, FunctionalNode } from '@contracts/index'
import graphFixture from '@client/sample-projectos-fixtures/graph.json'
import { NODE_HEIGHT, NODE_WIDTH } from './autoGridLayout'
import {
  computeLayeredArchitectureLayout,
  countBandSeparationViolations,
  countNodeBoxOverlaps,
} from './layeredArchitectureLayout'
import { projectArchitectureView } from './architectureView'

const layers: ArchitectureLayer[] = [
  { id: 'experience', label: 'Experience', order: 0, description: 'User-facing entry points' },
  { id: 'application', label: 'Application', order: 1, description: 'Application responsibilities' },
  { id: 'data', label: 'Data', order: 2, description: 'Persistence' },
]

function node(id: string, layer: string): FunctionalNode {
  return {
    id,
    type: 'capability',
    name: id,
    status: 'active',
    description: id,
    summary: id,
    responsibility: id,
    elementType: 'component',
    level: 'component',
    layer,
    linkedFiles: [],
    upstream: [],
    downstream: [],
    confidence: 1,
    tags: [],
  }
}

function fileNode(id: string, layer: string): FunctionalNode {
  return {
    ...node(id, layer),
    elementType: 'code_element',
    level: 'code',
  }
}

function nodeCenter(result: ReturnType<typeof computeLayeredArchitectureLayout>, id: string) {
  const position = result.positionsById[id]
  return {
    x: position.x + NODE_WIDTH / 2,
    y: position.y + NODE_HEIGHT / 2,
  }
}

function segmentHitsNodeBox(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  const hW = NODE_WIDTH / 2 + 6
  const hH = NODE_HEIGHT / 2 + 6
  const dx = bx - ax
  const dy = by - ay
  const p = [-dx, dx, -dy, dy]
  const q = [ax - (cx - hW), cx + hW - ax, ay - (cy - hH), cy + hH - ay]
  let u1 = 0
  let u2 = 1
  for (let i = 0; i < 4; i += 1) {
    if (Math.abs(p[i]) < 1e-12) {
      if (q[i] < 0) return false
    } else {
      const r = q[i] / p[i]
      if (p[i] < 0) {
        if (r > u2) return false
        if (r > u1) u1 = r
      } else {
        if (r < u1) return false
        if (r < u2) u2 = r
      }
    }
  }
  return u1 <= u2 && u2 > 0.04 && u1 < 0.96
}

function countEdgeHitsOnNodes(
  positionsById: Record<string, { x: number; y: number }>,
  edges: Array<{ source: string; target: string }>,
  margin = 14,
): number {
  const center = (id: string) => {
    const p = positionsById[id]
    if (!p) return null
    return { x: p.x + NODE_WIDTH / 2, y: p.y + NODE_HEIGHT / 2 }
  }
  let hits = 0
  for (const edge of edges) {
    const a = center(edge.source)
    const b = center(edge.target)
    if (!a || !b) continue
    for (const id of Object.keys(positionsById)) {
      if (id === edge.source || id === edge.target) continue
      const c = center(id)
      if (!c) continue
      if (segmentHitsNodeBox(a.x, a.y, b.x, b.y, c.x, c.y, margin)) hits += 1
    }
  }
  return hits
}

describe('computeLayeredArchitectureLayout', () => {
  it('places architecture layers in configured order without node overlap', () => {
    const result = computeLayeredArchitectureLayout(
      [node('database', 'data'), node('web', 'experience'), node('auth', 'application'), node('billing', 'application')],
      layers,
      { originX: 0, originY: 0, width: 920, height: 640 },
    )

    expect(result.positionsById.web.y).toBeLessThan(result.positionsById.auth.y)
    expect(result.positionsById.auth.y).toBeLessThan(result.positionsById.database.y)
    expect(Math.abs(result.positionsById.auth.x - result.positionsById.billing.x)).toBeGreaterThanOrEqual(NODE_WIDTH)
    expect(result.bands.map((band) => band.id)).toEqual(['experience', 'application', 'data'])
    expect(result.bounds.height).toBeGreaterThan(NODE_HEIGHT * 3)
  })

  it('is deterministic regardless of input order', () => {
    const input = [node('billing', 'application'), node('auth', 'application'), node('web', 'experience')]
    const area = { originX: 0, originY: 0, width: 920, height: 640 }

    const first = computeLayeredArchitectureLayout(input, layers, area)
    const second = computeLayeredArchitectureLayout([...input].reverse(), layers, area)

    expect(second.positionsById).toEqual(first.positionsById)
  })

  it('keeps a readable C4 layer on one row before wrapping peers', () => {
    const applicationNodes = Array.from({ length: 6 }, (_, index) =>
      node(`component-${index}`, 'application'),
    )

    const result = computeLayeredArchitectureLayout(applicationNodes, layers, {
      originX: 0,
      originY: 0,
      width: 920,
      height: 640,
    })

    expect(new Set(applicationNodes.map((item) => result.positionsById[item.id].y))).toHaveLength(1)
    expect(result.bounds.width).toBeGreaterThan(920)
  })

  it('uses the standard gap for sparse internal-file rows inside a unified band', () => {
    const result = computeLayeredArchitectureLayout(
      [fileNode('lib-auth', 'application'), fileNode('lib-payments', 'application')],
      layers,
      { originX: 0, originY: 0, width: 920, height: 640 },
    )

    expect(result.positionsById['lib-payments'].x - result.positionsById['lib-auth'].x).toBe(
      NODE_WIDTH + 22,
    )
    expect(result.bounds.width).toBeLessThan(920)
  })

  it('keeps full internal-file rows at the standard gap', () => {
    const result = computeLayeredArchitectureLayout(
      [
        fileNode('route-auth', 'interface'),
        fileNode('route-checkout', 'interface'),
        fileNode('route-users', 'interface'),
      ],
      layers,
      { originX: 0, originY: 0, width: 920, height: 640 },
    )

    expect(result.positionsById['route-checkout'].x - result.positionsById['route-auth'].x)
      .toBe(NODE_WIDTH + 22)
  })

  it('keeps sparse non-file architecture rows at the standard gap', () => {
    const result = computeLayeredArchitectureLayout(
      [node('auth', 'application'), node('billing', 'application')],
      layers,
      { originX: 0, originY: 0, width: 920, height: 640 },
    )

    expect(result.positionsById.billing.x - result.positionsById.auth.x).toBe(
      NODE_WIDTH + 22,
    )
    expect(result.bounds.width).toBeLessThan(920)
  })

  it('sizes each architecture layer band to its own node footprint', () => {
    const result = computeLayeredArchitectureLayout(
      [node('web', 'experience'), node('auth', 'application'), node('billing', 'application')],
      layers,
      { originX: 0, originY: 0, width: 920, height: 640 },
    )

    const experienceBand = result.bands.find((band) => band.id === 'experience')
    const applicationBand = result.bands.find((band) => band.id === 'application')
    expect(experienceBand).toBeDefined()
    expect(applicationBand).toBeDefined()
    expect(applicationBand!.width).toBeGreaterThan(experienceBand!.width)
    expect(applicationBand!.width).toBeLessThan(920)
  })

  it('aligns cross-layer edges and clears blocking middle-layer nodes', () => {
    const input = [
      node('web', 'experience'),
      node('auth', 'application'),
      node('billing', 'application'),
      node('database', 'data'),
    ]
    const area = { originX: 0, originY: 0, width: 920, height: 640 }
    const edges = [
      { source: 'web', target: 'database' },
      { source: 'web', target: 'auth' },
      { source: 'billing', target: 'database' },
    ]

    const result = computeLayeredArchitectureLayout(input, layers, area, edges)
    const web = nodeCenter(result, 'web')
    const database = nodeCenter(result, 'database')
    const auth = nodeCenter(result, 'auth')
    const billing = nodeCenter(result, 'billing')

    expect(Math.abs(web.x - database.x)).toBeLessThan(NODE_WIDTH * 1.2)
    expect(segmentHitsNodeBox(web.x, web.y, database.x, database.y, auth.x, auth.y)).toBe(false)
    expect(segmentHitsNodeBox(web.x, web.y, database.x, database.y, billing.x, billing.y)).toBe(false)
  })

  it('clears edge blockers in saas-starter component architecture view', () => {
    const projected = projectArchitectureView(
      graphFixture.nodes as FunctionalNode[],
      graphFixture.edges as FunctionalEdge[],
      'component',
      { parentId: 'container_next_web' },
    )
    const area = { originX: 0, originY: 0, width: 1200, height: 900 }
    const layoutEdges = projected.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    }))
    const result = computeLayeredArchitectureLayout(
      projected.nodes,
      graphFixture.architecture.layers,
      area,
      layoutEdges,
    )

    expect(projected.nodes.length).toBeGreaterThan(4)
    expect(countEdgeHitsOnNodes(result.positionsById, layoutEdges)).toBe(0)
    expect(result.bands.length).toBeGreaterThan(0)
    expect(result.bands.every((band) => band.position.x >= area.originX)).toBe(true)
  })

  it('clears edge blockers on wide viewports for saas-starter web components', () => {
    const projected = projectArchitectureView(
      graphFixture.nodes as FunctionalNode[],
      graphFixture.edges as FunctionalEdge[],
      'component',
      { parentId: 'container_next_web' },
    )
    const area = { originX: 0, originY: 0, width: 2400, height: 1200 }
    const layoutEdges = projected.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    }))
    const result = computeLayeredArchitectureLayout(
      projected.nodes,
      graphFixture.architecture.layers,
      area,
      layoutEdges,
    )
    expect(projected.nodes.length).toBeGreaterThan(4)
    expect(countEdgeHitsOnNodes(result.positionsById, layoutEdges)).toBe(0)
    expect(countNodeBoxOverlaps(result.positionsById)).toBe(0)
    expect(result.bands.length).toBeGreaterThan(0)
  })

  it('keeps layer bands separated without packing nodes into a rectangle', () => {
    const projected = projectArchitectureView(
      graphFixture.nodes as FunctionalNode[],
      graphFixture.edges as FunctionalEdge[],
      'component',
      { parentId: 'container_next_web' },
    )
    const layoutEdges = projected.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    }))
    const result = computeLayeredArchitectureLayout(
      projected.nodes,
      graphFixture.architecture.layers,
      { originX: 0, originY: 0, width: 1200, height: 900 },
      layoutEdges,
    )

    expect(countBandSeparationViolations(result.bands)).toBe(0)

    // Relationship layout may leave uneven intra-layer gaps; do not require a
    // packed rectangular grid. Bands must still tightly wrap their members.
    for (const band of result.bands) {
      const memberIds = projected.nodes
        .filter((node) => node.layer === band.id)
        .map((node) => node.id)
      const xs = memberIds.map((id) => result.positionsById[id]!.x)
      const ys = memberIds.map((id) => result.positionsById[id]!.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs) + NODE_WIDTH
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys) + NODE_HEIGHT
      expect(band.position.x).toBeCloseTo(minX - 18, 5)
      expect(band.position.y).toBeCloseTo(minY - 38 - 18, 5)
      expect(band.width).toBeCloseTo(maxX - minX + 36, 5)
      expect(band.height).toBeCloseTo(maxY - minY + 38 + 36, 5)
    }
  })

  it('has no node box overlaps on component architecture view', () => {
    const projected = projectArchitectureView(
      graphFixture.nodes as FunctionalNode[],
      graphFixture.edges as FunctionalEdge[],
      'component',
      { parentId: 'container_next_web' },
    )
    const area = { originX: 0, originY: 0, width: 1200, height: 900 }
    const layoutEdges = projected.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    }))
    const result = computeLayeredArchitectureLayout(
      projected.nodes,
      graphFixture.architecture.layers,
      area,
      layoutEdges,
    )

    expect(countNodeBoxOverlaps(result.positionsById)).toBe(0)
  })

  it('has no node box overlaps on context architecture view', () => {
    const projected = projectArchitectureView(
      graphFixture.nodes as FunctionalNode[],
      graphFixture.edges as FunctionalEdge[],
      'context',
    )
    const area = { originX: 0, originY: 0, width: 1200, height: 900 }
    const layoutEdges = projected.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    }))
    const result = computeLayeredArchitectureLayout(
      projected.nodes,
      graphFixture.architecture.layers,
      area,
      layoutEdges,
    )

    expect(countNodeBoxOverlaps(result.positionsById)).toBe(0)
  })

  it('keeps Prisma internal-file layer bands narrow without packing rows into a rectangle', () => {
    const projected = projectArchitectureView(
      graphFixture.nodes as FunctionalNode[],
      graphFixture.edges as FunctionalEdge[],
      'code',
      { parentId: 'feat_database' },
      graphFixture.files as FileEntry[],
      graphFixture.fileRelations as FileRelation[],
    )
    const layoutEdges = projected.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    }))
    const result = computeLayeredArchitectureLayout(
      projected.nodes,
      graphFixture.architecture.layers,
      { originX: 0, originY: 0, width: 1200, height: 900 },
      layoutEdges,
    )

    expect(projected.nodes.length).toBeGreaterThan(6)
    expect(countNodeBoxOverlaps(result.positionsById)).toBe(0)

    const band = result.bands.find((item) => item.id === 'infrastructure')
    expect(band).toBeDefined()
    expect(band!.width).toBeLessThan(700)

    const ys = new Set(projected.nodes.map((node) => result.positionsById[node.id]!.y))
    expect(ys.size).toBeGreaterThan(3)

    const memberIds = projected.nodes.map((node) => node.id)
    const xs = memberIds.map((id) => result.positionsById[id]!.x)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs) + NODE_WIDTH
    expect(band!.position.x).toBeCloseTo(minX - 18, 5)
    expect(band!.width).toBeCloseTo(maxX - minX + 36, 5)
  })
})
