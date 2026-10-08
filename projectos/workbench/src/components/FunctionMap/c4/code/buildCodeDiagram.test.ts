import { describe, expect, it } from 'vitest'
import type { FileEntry, FileRelation, FunctionalNode } from '@contracts/index'
import { architectureFileNodeId } from '../../architectureView'
import { buildCodeDiagram } from './buildCodeDiagram'
import { assignImportLayers } from './layoutCodeNodes'

function componentNode(id: string, linkedPaths: string[]): FunctionalNode {
  return {
    id,
    type: 'capability',
    name: id,
    status: 'active',
    description: id,
    summary: id,
    responsibility: `${id} responsibility`,
    elementType: 'component',
    level: 'component',
    layer: 'application',
    technology: 'TypeScript',
    linkedFiles: linkedPaths.map((path) => ({
      path,
      role: 'supporting' as const,
      summary: `${path} responsibility`,
    })),
    upstream: [],
    downstream: [],
    confidence: 1,
    tags: [],
    parentId: 'web',
  }
}

describe('buildCodeDiagram', () => {
  it('returns empty when there is no parent component scope', () => {
    const component = componentNode('identity', ['lib/auth.ts'])
    const diagram = buildCodeDiagram({
      level: 'code',
      nodes: [component],
      edges: [],
      scope: {},
      fileIndex: [
        {
          path: 'lib/auth.ts',
          type: 'lib',
          nodeIds: ['identity'],
          imports: [],
          exports: [],
        },
      ],
    })

    expect(diagram).toMatchObject({
      level: 'code',
      nodes: [],
      edges: [],
      boundaries: [],
    })
  })

  it('recovers code files from fileIndex.nodeIds when linkedFiles is empty', () => {
    const component = componentNode('identity', [])
    const diagram = buildCodeDiagram({
      level: 'code',
      nodes: [component],
      edges: [],
      scope: { parentId: 'identity' },
      fileIndex: [
        {
          path: 'lib/auth.ts',
          type: 'lib',
          nodeIds: ['identity'],
          imports: [],
          exports: ['validateCredentials'],
        },
      ],
    })

    expect(diagram.nodes).toHaveLength(1)
    expect(diagram.nodes[0]?.label).toBe('auth.ts')
    expect(diagram.nodes[0]?.stereotype).toBe('[Module]')
    expect(diagram.nodes[0]?.members).toEqual(['validateCredentials'])
    expect(diagram.boundaries).toHaveLength(1)
    expect(diagram.boundaries[0]?.label).toBe('identity')
  })

  it('projects linked files into class-like code boxes inside a component boundary', () => {
    const paths = [
      'app/login/page.tsx',
      'lib/auth.ts',
      'lib/session.ts',
    ]
    const component = componentNode('identity', paths)
    component.linkedFiles[0] = {
      path: paths[0]!,
      role: 'primary',
      summary: 'Render login form and submit credentials',
    }
    component.linkedFiles[1] = {
      path: paths[1]!,
      role: 'supporting',
      summary: 'Validate credentials against the user store',
    }
    component.linkedFiles[2] = {
      path: paths[2]!,
      role: 'supporting',
      summary: 'Create signed session cookies',
    }

    const fileIndex: FileEntry[] = [
      {
        path: 'app/login/page.tsx',
        type: 'page',
        nodeIds: ['identity'],
        imports: ['lib/auth.ts'],
        exports: ['default'],
      },
      {
        path: 'lib/auth.ts',
        type: 'lib',
        nodeIds: ['identity'],
        imports: ['lib/session.ts'],
        exports: ['validateCredentials'],
      },
      {
        path: 'lib/session.ts',
        type: 'lib',
        nodeIds: ['identity'],
        imports: [],
        exports: ['createSession'],
      },
    ]
    const fileRelations: FileRelation[] = []

    const pageId = architectureFileNodeId('identity', 'app/login/page.tsx')
    const authId = architectureFileNodeId('identity', 'lib/auth.ts')
    const sessionId = architectureFileNodeId('identity', 'lib/session.ts')

    const diagram = buildCodeDiagram({
      level: 'code',
      nodes: [component],
      edges: [],
      scope: { parentId: 'identity' },
      fileIndex,
      fileRelations,
    })

    expect(diagram.level).toBe('code')
    expect(diagram.nodes).toHaveLength(3)
    expect(diagram.nodes.every((node) => node.shape === 'code')).toBe(true)
    expect(diagram.boundaries).toHaveLength(1)
    expect(diagram.boundaries[0]?.description).toBe('[Component: TypeScript]')

    const byId = new Map(diagram.nodes.map((node) => [node.id, node]))
    expect(byId.get(pageId)?.label).toBe('page.tsx')
    expect(byId.get(pageId)?.stereotype).toBe('[Page]')
    expect(byId.get(authId)?.label).toBe('auth.ts')
    expect(byId.get(authId)?.members).toEqual(['validateCredentials'])
    expect(byId.get(sessionId)?.members).toEqual(['createSession'])

    expect(diagram.edges.length).toBeGreaterThanOrEqual(2)
    expect(diagram.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: pageId, target: authId }),
        expect.objectContaining({ source: authId, target: sessionId }),
      ]),
    )

    const pageY = byId.get(pageId)!.position.y
    const authY = byId.get(authId)!.position.y
    const sessionY = byId.get(sessionId)!.position.y
    expect(pageY).toBeLessThan(authY)
    expect(authY).toBeLessThan(sessionY)

    const boundary = diagram.boundaries[0]!
    for (const node of diagram.nodes) {
      expect(node.position.x).toBeGreaterThanOrEqual(boundary.position.x)
      expect(node.position.y).toBeGreaterThanOrEqual(boundary.position.y)
    }
  })
})

describe('assignImportLayers', () => {
  it('places import roots above their dependencies', () => {
    const layers = assignImportLayers(
      ['page', 'auth', 'session'],
      [
        { source: 'page', target: 'auth' },
        { source: 'auth', target: 'session' },
      ],
    )
    expect(layers.get('page')).toBe(0)
    expect(layers.get('auth')).toBe(1)
    expect(layers.get('session')).toBe(2)
  })
})
