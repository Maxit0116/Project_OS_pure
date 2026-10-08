import { describe, expect, it } from 'vitest'
import { applyElkLayoutToDiagram, layoutWithElk } from './layoutWithElk'
import type { C4Diagram } from './types'

function sampleDiagram(): C4Diagram {
  return {
    level: 'container',
    nodes: [
      {
        id: 'web',
        shape: 'web_app',
        label: 'Web',
        sourceNodeId: 'web',
        position: { x: 80, y: 104 },
        width: 180,
        height: 96,
        elementType: 'container',
        level: 'container',
      },
      {
        id: 'api',
        shape: 'server',
        label: 'API',
        sourceNodeId: 'api',
        position: { x: 288, y: 104 },
        width: 180,
        height: 96,
        elementType: 'container',
        level: 'container',
      },
      {
        id: 'db',
        shape: 'database',
        label: 'DB',
        sourceNodeId: 'db',
        position: { x: 496, y: 104 },
        width: 160,
        height: 110,
        elementType: 'data_store',
        level: 'container',
      },
      {
        id: 'stripe',
        shape: 'external_system',
        label: 'Stripe',
        sourceNodeId: 'stripe',
        position: { x: 760, y: 120 },
        width: 180,
        height: 96,
        elementType: 'external_system',
        level: 'context',
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'web',
        target: 'api',
        relation: 'uses',
        label: 'Uses',
        technology: 'HTTPS',
      },
      {
        id: 'e2',
        source: 'api',
        target: 'db',
        relation: 'reads_from',
        label: 'Reads',
        technology: 'SQL',
      },
    ],
    boundaries: [
      {
        id: 'boundary_system',
        label: 'Demo',
        position: { x: 48, y: 48 },
        width: 640,
        height: 220,
      },
    ],
    bounds: { minX: 0, minY: 0, width: 1000, height: 400 },
  }
}

describe('layoutWithElk', () => {
  it('repositions nodes and resizes the system boundary', async () => {
    const laidOut = await layoutWithElk(sampleDiagram())
    expect(laidOut.nodes).toHaveLength(4)
    expect(laidOut.boundaries).toHaveLength(1)
    const boundary = laidOut.boundaries[0]!
    expect(boundary.width).toBeGreaterThan(100)
    expect(boundary.height).toBeGreaterThan(100)
    for (const node of laidOut.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true)
      expect(Number.isFinite(node.position.y)).toBe(true)
    }
  })

  it('falls back to the input diagram when layout fails', async () => {
    const empty: C4Diagram = {
      level: 'context',
      nodes: [],
      edges: [],
      boundaries: [],
      bounds: { minX: 0, minY: 0, width: 800, height: 480 },
    }
    await expect(applyElkLayoutToDiagram(empty)).resolves.toEqual(empty)
  })
})
