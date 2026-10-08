import { describe, expect, it } from 'vitest'
import type { FunctionalEdge, FunctionalNode } from '@contracts/index'
import { buildContainerDiagram } from './buildContainerDiagram'

function node(
  partial: Pick<FunctionalNode, 'id' | 'name' | 'elementType' | 'level'> &
    Partial<Pick<FunctionalNode, 'parentId' | 'technology' | 'responsibility'>>,
): FunctionalNode {
  return {
    id: partial.id,
    type: 'capability',
    name: partial.name,
    status: 'active',
    description: partial.name,
    summary: partial.name,
    responsibility: partial.responsibility ?? `${partial.name} responsibility`,
    elementType: partial.elementType,
    level: partial.level,
    layer: 'application',
    technology: partial.technology,
    linkedFiles: [],
    upstream: [],
    downstream: [],
    confidence: 1,
    tags: [],
    parentId: partial.parentId,
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  label?: string,
): FunctionalEdge {
  return {
    id,
    source,
    target,
    relation: 'calls',
    label,
    confidence: 1,
  }
}

function isInsideBoundary(
  box: { position: { x: number; y: number }; width: number; height: number },
  boundary: { position: { x: number; y: number }; width: number; height: number },
): boolean {
  return (
    box.position.x >= boundary.position.x &&
    box.position.y >= boundary.position.y &&
    box.position.x + box.width <= boundary.position.x + boundary.width &&
    box.position.y + box.height <= boundary.position.y + boundary.height
  )
}

describe('buildContainerDiagram', () => {
  const system = node({
    id: 'sys',
    name: 'Internet Banking System',
    elementType: 'software_system',
    level: 'context',
  })
  const otherSystem = node({
    id: 'sys-other',
    name: 'Other System',
    elementType: 'software_system',
    level: 'context',
  })
  const web = node({
    id: 'web',
    name: 'Web Application',
    elementType: 'container',
    level: 'container',
    parentId: 'sys',
    technology: 'React',
  })
  const api = node({
    id: 'api',
    name: 'API Application',
    elementType: 'container',
    level: 'container',
    parentId: 'sys',
    technology: 'Node.js / Express',
  })
  const db = node({
    id: 'db',
    name: 'Database',
    elementType: 'container',
    level: 'container',
    parentId: 'sys',
    technology: 'PostgreSQL',
  })
  const orphanContainer = node({
    id: 'orphan',
    name: 'Orphan Service',
    elementType: 'container',
    level: 'container',
    parentId: 'sys-other',
    technology: 'Go',
  })
  const email = node({
    id: 'email',
    name: 'E-mail System',
    elementType: 'external_system',
    level: 'context',
  })
  const mainframe = node({
    id: 'mainframe',
    name: 'Mainframe Banking System',
    elementType: 'external_system',
    level: 'context',
  })

  const graph = {
    nodes: [
      system,
      otherSystem,
      web,
      api,
      db,
      orphanContainer,
      email,
      mainframe,
    ],
    edges: [
      edge('e1', 'web', 'api', 'Makes API calls to'),
      edge('e2', 'api', 'db', 'Reads from and writes to'),
      edge('e3', 'api', 'email', 'Sends e-mail using'),
      edge('e4', 'api', 'mainframe', 'Uses'),
      edge('e5', 'orphan', 'email', 'Should not appear'),
    ],
  }

  it('places containers inside a system boundary and externals outside', () => {
    const diagram = buildContainerDiagram({
      level: 'container',
      ...graph,
    })

    expect(diagram.level).toBe('container')
    expect(diagram.boundaries).toHaveLength(1)

    const boundary = diagram.boundaries[0]!
    expect(boundary.id).toBe('boundary_sys')
    expect(boundary.label).toBe('Internet Banking System')

    const placedIds = diagram.nodes.map((n) => n.id)
    expect(placedIds).toEqual(
      expect.arrayContaining(['web', 'api', 'db', 'email', 'mainframe']),
    )
    expect(placedIds).not.toContain('orphan')
    expect(placedIds).not.toContain('sys')

    const inside = diagram.nodes.filter((n) =>
      ['web', 'api', 'db'].includes(n.id),
    )
    const outside = diagram.nodes.filter((n) =>
      ['email', 'mainframe'].includes(n.id),
    )

    expect(inside).toHaveLength(3)
    expect(outside).toHaveLength(2)

    for (const container of inside) {
      expect(isInsideBoundary(container, boundary)).toBe(true)
    }

    for (const external of outside) {
      expect(external.position.x).toBeGreaterThanOrEqual(
        boundary.position.x + boundary.width,
      )
      expect(isInsideBoundary(external, boundary)).toBe(false)
    }

    expect(diagram.nodes.find((n) => n.id === 'web')?.shape).toBe('web_app')
    expect(diagram.nodes.find((n) => n.id === 'api')?.shape).toBe('server')
    expect(diagram.nodes.find((n) => n.id === 'db')?.shape).toBe('database')
    expect(diagram.nodes.find((n) => n.id === 'email')?.shape).toBe(
      'external_system',
    )

    const edgeIds = diagram.edges.map((e) => e.id).sort()
    expect(edgeIds).toEqual(['e1', 'e2', 'e3', 'e4'])
  })

  it('respects scope.parentId when choosing which system to expand', () => {
    const diagram = buildContainerDiagram({
      level: 'container',
      ...graph,
      scope: { parentId: 'sys-other' },
    })

    expect(diagram.boundaries).toHaveLength(1)
    expect(diagram.boundaries[0]?.label).toBe('Other System')
    expect(diagram.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining(['orphan', 'email', 'mainframe']),
    )
    expect(diagram.nodes.map((n) => n.id)).not.toContain('web')

    const boundary = diagram.boundaries[0]!
    const orphan = diagram.nodes.find((n) => n.id === 'orphan')!
    expect(isInsideBoundary(orphan, boundary)).toBe(true)
  })

  it('returns empty diagram when there is nothing to place', () => {
    const diagram = buildContainerDiagram({
      level: 'container',
      nodes: [],
      edges: [],
    })
    expect(diagram.nodes).toEqual([])
    expect(diagram.edges).toEqual([])
    expect(diagram.boundaries).toEqual([])
  })
})
