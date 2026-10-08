import { describe, expect, it } from 'vitest'
import type { FunctionalEdge, FunctionalNode } from '@contracts/index'
import { emptyBounds } from '../diagramShared'
import { buildContextDiagram } from './buildContextDiagram'

function node(
  id: string,
  elementType: NonNullable<FunctionalNode['elementType']>,
  level: NonNullable<FunctionalNode['level']> = 'context',
): FunctionalNode {
  return {
    id,
    type: 'capability',
    name: id,
    status: 'active',
    description: id,
    summary: id,
    responsibility: `${id} responsibility`,
    elementType,
    level,
    layer: 'application',
    linkedFiles: [],
    upstream: [],
    downstream: [],
    confidence: 1,
    tags: [],
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  extras?: Partial<Pick<FunctionalEdge, 'label' | 'technology' | 'purpose'>>,
): FunctionalEdge {
  return {
    id,
    source,
    target,
    relation: 'uses',
    label: extras?.label,
    technology: extras?.technology,
    purpose: extras?.purpose,
    confidence: 1,
  }
}

describe('buildContextDiagram', () => {
  it('returns an empty diagram with emptyBounds for an empty graph', () => {
    const diagram = buildContextDiagram({
      level: 'context',
      nodes: [],
      edges: [],
    })

    expect(diagram).toEqual({
      level: 'context',
      nodes: [],
      edges: [],
      boundaries: [],
      bounds: emptyBounds(),
    })
  })

  it('places person left, software_system center, external_system right', () => {
    const diagram = buildContextDiagram({
      level: 'context',
      nodes: [
        node('user', 'person'),
        node('app', 'software_system'),
        node('stripe', 'external_system'),
      ],
      edges: [],
    })

    const byId = Object.fromEntries(diagram.nodes.map((n) => [n.id, n]))
    expect(byId.user!.position.x).toBeLessThan(byId.app!.position.x)
    expect(byId.app!.position.x).toBeLessThan(byId.stripe!.position.x)
    expect(byId.user!.shape).toBe('person')
    expect(byId.app!.shape).toBe('system')
    expect(byId.stripe!.shape).toBe('external_system')
    expect(diagram.boundaries).toEqual([])
  })

  it('keeps edge label, technology, and purpose between context nodes', () => {
    const diagram = buildContextDiagram({
      level: 'context',
      nodes: [
        node('user', 'person'),
        node('app', 'software_system'),
        node('mail', 'external_system'),
      ],
      edges: [
        edge('e1', 'user', 'app', {
          label: 'Uses',
          purpose: 'Interact with the product',
        }),
        edge('e2', 'app', 'mail', {
          label: 'Sends emails via',
          technology: 'SMTP',
          purpose: 'Transactional mail',
        }),
      ],
    })

    expect(diagram.edges).toHaveLength(2)
    expect(diagram.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'e1',
          source: 'user',
          target: 'app',
          label: 'Uses',
          purpose: 'Interact with the product',
        }),
        expect.objectContaining({
          id: 'e2',
          source: 'app',
          target: 'mail',
          label: 'Sends emails via',
          technology: 'SMTP',
          purpose: 'Transactional mail',
        }),
      ]),
    )
  })

  it('ignores non-context nodes and non-context element types', () => {
    const diagram = buildContextDiagram({
      level: 'context',
      nodes: [
        node('user', 'person'),
        node('app', 'software_system'),
        node('web', 'container', 'container'),
        node('api', 'component', 'component'),
      ],
      edges: [edge('skip', 'app', 'web', { label: 'contains' })],
    })

    expect(diagram.nodes.map((n) => n.id).sort()).toEqual(['app', 'user'])
    expect(diagram.edges).toEqual([])
    expect(diagram.boundaries).toEqual([])
  })
})
