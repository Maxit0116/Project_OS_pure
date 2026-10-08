import { describe, expect, it } from 'vitest'
import type { FunctionalEdge, FunctionalNode } from '@contracts/index'
import { buildComponentDiagram } from './buildComponentDiagram'

function node(
  id: string,
  overrides: Partial<FunctionalNode> & {
    level: NonNullable<FunctionalNode['level']>
  },
): FunctionalNode {
  const level = overrides.level
  const elementType =
    overrides.elementType ??
    (level === 'context'
      ? 'software_system'
      : level === 'code'
        ? 'code_element'
        : level)

  return {
    id,
    type: 'capability',
    name: overrides.name ?? id,
    status: 'active',
    description: id,
    summary: id,
    responsibility: overrides.responsibility ?? `${id} responsibility`,
    elementType,
    level,
    layer: 'application',
    linkedFiles: [],
    upstream: [],
    downstream: [],
    confidence: 1,
    tags: [],
    parentId: overrides.parentId,
    technology: overrides.technology,
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

describe('buildComponentDiagram', () => {
  const web = node('web', {
    level: 'container',
    name: 'Web Application',
    technology: 'Next.js',
    elementType: 'container',
  })
  const api = node('api', {
    level: 'container',
    name: 'API',
    elementType: 'container',
  })
  const auth = node('auth', {
    level: 'component',
    parentId: 'web',
    name: 'Auth Controller',
    elementType: 'component',
  })
  const session = node('session', {
    level: 'component',
    parentId: 'web',
    name: 'Session Service',
    elementType: 'component',
  })
  const otherComponent = node('billing', {
    level: 'component',
    parentId: 'api',
    name: 'Billing',
    elementType: 'component',
  })
  const db = node('db', {
    level: 'container',
    name: 'Database',
    elementType: 'data_store',
    technology: 'PostgreSQL',
  })
  const paymentGw = node('payment_gw', {
    level: 'context',
    name: 'Payment Gateway',
    elementType: 'external_system',
  })

  it('places only components with matching parentId inside the container boundary', () => {
    const diagram = buildComponentDiagram({
      level: 'component',
      nodes: [web, api, auth, session, otherComponent, db],
      edges: [
        edge('e1', 'auth', 'session'),
        edge('e2', 'billing', 'db'),
      ],
      scope: { parentId: 'web' },
    })

    const insideIds = diagram.nodes
      .filter((n) => {
        const b = diagram.boundaries[0]
        if (!b) return false
        return (
          n.position.x >= b.position.x &&
          n.position.y >= b.position.y &&
          n.position.x + n.width <= b.position.x + b.width &&
          n.position.y + n.height <= b.position.y + b.height
        )
      })
      .map((n) => n.id)
      .sort()

    expect(insideIds).toEqual(['auth', 'session'])
    expect(diagram.nodes.map((n) => n.id)).not.toContain('billing')
    expect(diagram.boundaries).toHaveLength(1)

    const boundary = diagram.boundaries[0]!
    expect(boundary.id).toBe('boundary_web')
    expect(boundary.label).toBe('Web Application')
    expect(boundary.description).toBe('[Next.js]')

    for (const id of ['auth', 'session']) {
      const n = diagram.nodes.find((node) => node.id === id)!
      expect(n.position.x).toBeGreaterThanOrEqual(boundary.position.x)
      expect(n.position.y).toBeGreaterThanOrEqual(boundary.position.y)
      expect(n.position.x + n.width).toBeLessThanOrEqual(
        boundary.position.x + boundary.width,
      )
      expect(n.position.y + n.height).toBeLessThanOrEqual(
        boundary.position.y + boundary.height,
      )
    }
  })

  it('places edged data_store and external_system nodes outside on the right', () => {
    const diagram = buildComponentDiagram({
      level: 'component',
      nodes: [web, auth, session, db, paymentGw, otherComponent],
      edges: [
        edge('e1', 'auth', 'session'),
        edge('e2', 'session', 'db', 'Reads from'),
        edge('e3', 'auth', 'payment_gw', 'Charges via'),
        edge('e4', 'billing', 'db'),
      ],
      scope: { parentId: 'web' },
    })

    const boundary = diagram.boundaries[0]!
    expect(boundary).toBeDefined()

    const outside = diagram.nodes.filter((n) =>
      ['db', 'payment_gw'].includes(n.id),
    )
    expect(outside.map((n) => n.id).sort()).toEqual(['db', 'payment_gw'])

    for (const n of outside) {
      expect(n.position.x).toBeGreaterThanOrEqual(
        boundary.position.x + boundary.width,
      )
    }

    expect(diagram.edges.map((e) => e.id).sort()).toEqual([
      'e1',
      'e2',
      'e3',
    ])
  })

  it('falls back to the primary container when scope.parentId is missing', () => {
    const diagram = buildComponentDiagram({
      level: 'component',
      nodes: [web, auth, session],
      edges: [],
    })
    expect(diagram.nodes.map((n) => n.id).sort()).toEqual(['auth', 'session'])
    expect(diagram.boundaries).toHaveLength(1)
    expect(diagram.boundaries[0]?.id).toBe('boundary_web')
  })

  it('returns empty when there is no container to scope', () => {
    const diagram = buildComponentDiagram({
      level: 'component',
      nodes: [auth, session],
      edges: [],
    })
    expect(diagram.nodes).toEqual([])
    expect(diagram.boundaries).toEqual([])
  })

  it('does not pull unconnected data_store / external nodes outside', () => {
    const diagram = buildComponentDiagram({
      level: 'component',
      nodes: [web, auth, db, paymentGw],
      edges: [],
      scope: { parentId: 'web' },
    })
    expect(diagram.nodes.map((n) => n.id)).toEqual(['auth'])
    expect(diagram.boundaries).toHaveLength(1)
  })
})
