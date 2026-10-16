import { describe, expect, it } from 'vitest'
import type { FunctionalEdge, FunctionalNode } from '@contracts/index'
import { buildDiagram } from './buildDiagram'

function node(
  partial: Pick<FunctionalNode, 'id' | 'name' | 'elementType' | 'level'> &
    Partial<Pick<FunctionalNode, 'parentId' | 'technology' | 'linkedFiles'>>,
): FunctionalNode {
  return {
    id: partial.id,
    type: 'capability',
    name: partial.name,
    status: 'active',
    description: partial.name,
    summary: partial.name,
    responsibility: `${partial.name} responsibility`,
    elementType: partial.elementType,
    level: partial.level,
    layer: 'application',
    technology: partial.technology,
    linkedFiles: partial.linkedFiles ?? [],
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
  label: string,
): FunctionalEdge {
  return {
    id,
    source,
    target,
    relation: 'uses',
    label,
    confidence: 1,
    evidence: id,
  }
}

const sampleNodes: FunctionalNode[] = [
  node({
    id: 'person',
    name: 'User',
    elementType: 'person',
    level: 'context',
  }),
  node({
    id: 'system',
    name: 'Acme',
    elementType: 'software_system',
    level: 'context',
  }),
  node({
    id: 'ext',
    name: 'Payments',
    elementType: 'external_system',
    level: 'context',
  }),
  node({
    id: 'web',
    name: 'Web',
    elementType: 'container',
    level: 'container',
    parentId: 'system',
    technology: 'Next.js',
  }),
  node({
    id: 'api',
    name: 'API',
    elementType: 'container',
    level: 'container',
    parentId: 'system',
    technology: 'Node.js',
  }),
  node({
    id: 'identity',
    name: 'Identity',
    elementType: 'component',
    level: 'component',
    parentId: 'web',
    linkedFiles: [{ path: 'lib/auth.ts', role: 'primary' }],
  }),
]

const sampleEdges: FunctionalEdge[] = [
  edge('e1', 'person', 'system', 'Uses'),
  edge('e2', 'web', 'api', 'Calls'),
  edge('e3', 'web', 'ext', 'Charges via'),
]

describe('buildDiagram boundaries', () => {
  it('keeps a system boundary on container diagrams after view wiring', () => {
    const diagram = buildDiagram({
      level: 'container',
      nodes: sampleNodes,
      edges: sampleEdges,
      scope: { parentId: 'system' },
      views: [
        {
          key: 'view_container_system',
          title: 'Acme Containers',
          level: 'container',
          parentId: 'system',
          sourceKind: 'ai',
        },
      ],
      viewKey: 'view_container_system',
    })

    expect(diagram.boundaries).toHaveLength(1)
    expect(diagram.boundaries[0]?.id).toBe('boundary_system')
    expect(diagram.boundaries[0]?.label).toBe('Acme')
    expect(diagram.nodes.map((item) => item.id).sort()).toEqual(['api', 'ext', 'web'])
  })

  it('keeps a container boundary on component diagrams after view wiring', () => {
    const diagram = buildDiagram({
      level: 'component',
      nodes: sampleNodes,
      edges: sampleEdges,
      scope: { parentId: 'web' },
      views: [
        {
          key: 'view_component_web',
          title: 'Web Components',
          level: 'component',
          parentId: 'web',
          sourceKind: 'ai',
        },
      ],
      viewKey: 'view_component_web',
    })

    expect(diagram.boundaries).toHaveLength(1)
    expect(diagram.boundaries[0]?.id).toBe('boundary_web')
    expect(diagram.boundaries[0]?.label).toBe('Web')
    expect(diagram.nodes.map((item) => item.id)).toEqual(['identity'])
  })

  it('still applies include filters without dropping the parent boundary', () => {
    const diagram = buildDiagram({
      level: 'container',
      nodes: sampleNodes,
      edges: sampleEdges,
      scope: { parentId: 'system' },
      views: [
        {
          key: 'view_web_only',
          title: 'Web only',
          level: 'container',
          parentId: 'system',
          includeNodeIds: ['web'],
          sourceKind: 'authored',
        },
      ],
      viewKey: 'view_web_only',
    })

    expect(diagram.boundaries).toHaveLength(1)
    expect(diagram.boundaries[0]?.label).toBe('Acme')
    expect(diagram.nodes.map((item) => item.id).sort()).toEqual(['ext', 'web'])
  })
})
