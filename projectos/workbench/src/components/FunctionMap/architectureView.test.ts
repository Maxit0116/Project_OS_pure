import { describe, expect, it } from 'vitest'
import type { FileEntry, FileRelation, FunctionalEdge, FunctionalNode } from '@contracts/index'
import {
  architectureFileNodeId,
  availableArchitectureLevels,
  architectureScopeForSelection,
  computeOneHopLinkedIds,
  defaultArchitectureScopeId,
  projectArchitectureView,
} from './architectureView'

function node(
  id: string,
  level?: FunctionalNode['level'],
  parentId?: string,
): FunctionalNode {
  const elementType =
    level === 'context'
      ? 'software_system'
      : level === 'code'
        ? 'code_element'
        : level

  return {
    id,
    type: 'capability',
    name: id,
    status: 'active',
    description: id,
    summary: id,
    responsibility: level ? `${id} responsibility` : undefined,
    elementType,
    level,
    layer: level ? 'application' : undefined,
    linkedFiles: [],
    upstream: [],
    downstream: [],
    confidence: 1,
    tags: [],
    parentId,
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
    relation: label ? 'calls' : 'imports',
    label,
    confidence: 1,
  }
}

describe('projectArchitectureView', () => {
  it('keeps projected file node IDs unique for paths with similar punctuation', () => {
    expect(architectureFileNodeId('identity', 'a-b.ts')).not.toBe(
      architectureFileNodeId('identity', 'a/b.ts'),
    )
  })

  it('shows one semantic zoom level and excludes legacy file-derived nodes', () => {
    const nodes = [
      node('system', 'context'),
      node('web', 'container'),
      node('identity', 'component'),
      node('legacy-route'),
    ]
    const edges = [
      edge('context_edge', 'system', 'web', 'contains runtime'),
      edge('component_edge', 'identity', 'identity', 'validates session'),
      edge('legacy_edge', 'identity', 'legacy-route'),
    ]

    const projected = projectArchitectureView(nodes, edges, 'component')

    expect(projected.nodes.map((item) => item.id)).toEqual(['identity'])
    expect(projected.edges.map((item) => item.id)).toEqual(['component_edge'])
  })

  it('falls back to the existing graph when no architecture metadata exists', () => {
    const nodes = [node('legacy-a'), node('legacy-b')]
    const edges = [edge('legacy', 'legacy-a', 'legacy-b')]

    expect(projectArchitectureView(nodes, edges, 'component')).toEqual({ nodes, edges })
  })

  it('scopes a level to one parent so every module gets its own graph', () => {
    const nodes = [
      node('web', 'container', 'product'),
      node('worker', 'container', 'product'),
      node('identity', 'component', 'web'),
      node('account', 'component', 'web'),
      node('jobs', 'component', 'worker'),
    ]
    const edges = [
      edge('identity_account', 'identity', 'account', 'updates account'),
      edge('identity_jobs', 'identity', 'jobs', 'queues job'),
    ]

    const projected = projectArchitectureView(nodes, edges, 'component', {
      parentId: 'web',
    })

    expect(projected.nodes.map((item) => item.id)).toEqual(['identity', 'account'])
    expect(projected.edges.map((item) => item.id)).toEqual(['identity_account'])
  })

  it('focuses a component graph on the module and its direct collaborators', () => {
    const nodes = [
      node('api', 'component', 'web'),
      node('identity', 'component', 'web'),
      node('account', 'component', 'web'),
      node('content', 'component', 'web'),
    ]
    const edges = [
      edge('api_identity', 'api', 'identity', 'verifies identity'),
      edge('identity_account', 'identity', 'account', 'loads account'),
      edge('account_content', 'account', 'content', 'reads content'),
    ]

    const projected = projectArchitectureView(nodes, edges, 'component', {
      parentId: 'web',
      focusNodeId: 'identity',
    })

    expect(projected.nodes.map((item) => item.id)).toEqual(['api', 'identity', 'account'])
    expect(projected.edges.map((item) => item.id)).toEqual([
      'api_identity',
      'identity_account',
    ])
  })

  it('derives a focus scope when the selected node is on the active level', () => {
    const nodes = [
      node('web', 'container', 'product'),
      node('identity', 'component', 'web'),
    ]

    expect(architectureScopeForSelection(nodes, 'component', 'identity')).toEqual({
      parentId: 'web',
      focusNodeId: 'identity',
    })
  })

  it('derives a parent scope when the selected node owns the active level', () => {
    const nodes = [
      node('web', 'container', 'product'),
      node('identity', 'component', 'web'),
    ]

    expect(architectureScopeForSelection(nodes, 'component', 'web')).toEqual({
      parentId: 'web',
    })
  })

  it('derives an ancestor focus scope when the active level contains an ancestor', () => {
    const nodes = [
      node('system', 'context'),
      node('web', 'container', 'system'),
      node('identity', 'component', 'web'),
    ]

    expect(architectureScopeForSelection(nodes, 'container', 'identity')).toEqual({
      parentId: 'system',
      focusNodeId: 'web',
    })
  })

  it('terminates scope resolution when parent links contain a cycle', () => {
    const cyclicNodes = [
      node('component-a', 'component', 'container-b'),
      node('container-b', 'container', 'component-a'),
    ]
    const selfParentedNode = [node('component-self', 'component', 'component-self')]

    expect(
      architectureScopeForSelection(cyclicNodes, 'context', 'component-a'),
    ).toEqual({})
    expect(
      architectureScopeForSelection(selfParentedNode, 'context', 'component-self'),
    ).toEqual({})
  })

  it('projects a component internal graph from its real linked files', () => {
    const nodes = [
      node('system', 'context'),
      node('web', 'container', 'system'),
      node('identity', 'component', 'web'),
    ]
    nodes[2].linkedFiles = [
      {
        path: 'app/login/page.tsx',
        role: 'primary',
        summary: '显示登录页面并提交登录信息。',
      },
      {
        path: 'lib/auth.ts',
        role: 'supporting',
        summary: '验证登录信息并创建会话。',
      },
    ]
    const loginPageId = architectureFileNodeId('identity', 'app/login/page.tsx')
    const authFileId = architectureFileNodeId('identity', 'lib/auth.ts')
    const fileRelations: FileRelation[] = [
      {
        id: 'login_auth',
        sourcePath: 'app/login/page.tsx',
        targetPath: 'lib/auth.ts',
        relation: 'calls',
        label: '提交登录信息',
        confidence: 1,
        evidence: 'app/login/page.tsx -> lib/auth.ts',
      },
    ]
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
        imports: [],
        exports: ['verifyCredentials'],
      },
    ]

    expect(availableArchitectureLevels(nodes)).toEqual([
      'context',
      'container',
      'component',
      'code',
    ])
    expect(
      architectureScopeForSelection(nodes, 'code', 'identity'),
    ).toEqual({ parentId: 'identity' })
    expect(
      projectArchitectureView(
        nodes,
        [],
        'code',
        { parentId: 'identity' },
        fileIndex,
        fileRelations,
      ),
    ).toMatchObject({
      nodes: [
        {
          id: loginPageId,
          name: 'page.tsx',
          elementType: 'code_element',
          linkedFiles: [{ path: 'app/login/page.tsx' }],
        },
        {
          id: authFileId,
          name: 'auth.ts',
          elementType: 'code_element',
          linkedFiles: [{ path: 'lib/auth.ts' }],
        },
      ],
      edges: [{ id: 'login_auth', source: loginPageId, target: authFileId }],
    })
  })

  it('focuses a file graph on the selected file and its one-hop neighbors', () => {
    const component = node('identity', 'component', 'web')
    const paths = ['a.ts', 'b.ts', 'c.ts', 'd.ts']
    component.linkedFiles = paths.map((path) => ({
      path,
      role: 'supporting' as const,
      summary: `${path} purpose`,
    }))
    const fileIndex: FileEntry[] = paths.map((path) => ({
      path,
      type: 'lib',
      nodeIds: ['identity'],
      imports: [],
      exports: [],
    }))
    const fileRelations: FileRelation[] = [
      relation('a_b', 'a.ts', 'b.ts'),
      relation('b_c', 'b.ts', 'c.ts'),
      relation('c_d', 'c.ts', 'd.ts'),
    ]
    const bId = architectureFileNodeId('identity', 'b.ts')

    const projected = projectArchitectureView(
      [component],
      [],
      'code',
      { parentId: component.id, focusNodeId: bId },
      fileIndex,
      fileRelations,
    )

    expect(projected.nodes.map((item) => item.name)).toEqual([
      'a.ts',
      'b.ts',
      'c.ts',
    ])
    expect(projected.edges.map((item) => item.id)).toEqual(['a_b', 'b_c'])
  })

  it('falls back to the full file graph when the focus id is stale', () => {
    const component = node('identity', 'component', 'web')
    const paths = ['a.ts', 'b.ts', 'c.ts']
    component.linkedFiles = paths.map((path) => ({
      path,
      role: 'supporting' as const,
      summary: `${path} purpose`,
    }))
    const fileIndex: FileEntry[] = paths.map((path) => ({
      path,
      type: 'lib',
      nodeIds: ['identity'],
      imports: [],
      exports: [],
    }))
    const fileRelations = [
      relation('a_b', 'a.ts', 'b.ts'),
      relation('b_c', 'b.ts', 'c.ts'),
    ]

    const projected = projectArchitectureView(
      [component],
      [],
      'code',
      { parentId: component.id, focusNodeId: 'missing-file-node' },
      fileIndex,
      fileRelations,
    )

    expect(projected.nodes.map((item) => item.name)).toEqual(paths)
    expect(projected.edges.map((item) => item.id)).toEqual(['a_b', 'b_c'])
  })

  it('explains what an internal import provides and why the source needs it', () => {
    const component = node('identity', 'component', 'web')
    component.linkedFiles = [
      {
        path: 'app/api/auth/route.ts',
        role: 'primary',
        summary: '验证登录信息并返回会话。',
      },
      {
        path: 'lib/auth.ts',
        role: 'supporting',
        summary: '查询用户、验证凭据并创建会话。',
      },
      {
        path: 'app/middleware.ts',
        role: 'supporting',
        summary: '拦截未登录用户对受保护页面的访问。',
      },
    ]
    const fileIndex: FileEntry[] = [
      {
        path: 'app/api/auth/route.ts',
        type: 'api',
        nodeIds: ['identity'],
        imports: ['lib/auth.ts'],
        exports: [],
      },
      {
        path: 'lib/auth.ts',
        type: 'lib',
        nodeIds: ['identity'],
        imports: [],
        exports: ['validateCredentials'],
      },
      {
        path: 'app/middleware.ts',
        type: 'other',
        nodeIds: ['identity'],
        imports: [],
        exports: ['middleware'],
      },
    ]

    const projected = projectArchitectureView(
      [component],
      [],
      'code',
      { parentId: 'identity' },
      fileIndex,
    )

    expect(projected.edges).toMatchObject([
      {
        relation: 'imports',
        label: '导入：validateCredentials',
        purpose: '用于：验证登录信息并返回会话',
      },
    ])
    expect(projected.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'auth.ts', layer: 'application' }),
        expect.objectContaining({ name: 'middleware.ts', layer: 'interface' }),
      ]),
    )
  })

  it('resolves root aliases and relative imports to real file-index paths', () => {
    const component = node('dashboard', 'component', 'web')
    const paths = [
      'app/dashboard/page.tsx',
      'components/StatsCard.tsx',
      'lib/data/index.ts',
    ]
    component.linkedFiles = paths.map((path) => ({
      path,
      role: 'supporting' as const,
      summary: `${path} purpose`,
    }))
    const fileIndex: FileEntry[] = [
      {
        path: 'app/dashboard/page.tsx',
        type: 'page',
        nodeIds: ['dashboard'],
        imports: ['@/components/StatsCard', '../../lib/data'],
        exports: ['default'],
      },
      {
        path: 'components/StatsCard.tsx',
        type: 'component',
        nodeIds: ['dashboard'],
        imports: [],
        exports: ['default'],
      },
      {
        path: 'lib/data/index.ts',
        type: 'lib',
        nodeIds: ['dashboard'],
        imports: [],
        exports: ['getStats'],
      },
    ]

    const projected = projectArchitectureView(
      [component],
      [],
      'code',
      { parentId: component.id },
      fileIndex,
    )

    const pageId = architectureFileNodeId(component.id, 'app/dashboard/page.tsx')
    expect(projected.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: pageId,
          target: architectureFileNodeId(component.id, 'components/StatsCard.tsx'),
        }),
        expect.objectContaining({
          source: pageId,
          target: architectureFileNodeId(component.id, 'lib/data/index.ts'),
        }),
      ]),
    )
  })
})

describe('computeOneHopLinkedIds', () => {
  it('returns focus node plus one-hop neighbors', () => {
    const nodes = [
      node('api', 'component', 'web'),
      node('identity', 'component', 'web'),
      node('account', 'component', 'web'),
      node('content', 'component', 'web'),
    ]
    const edges = [
      edge('api_identity', 'api', 'identity', 'verifies identity'),
      edge('identity_account', 'identity', 'account', 'loads account'),
      edge('account_content', 'account', 'content', 'reads content'),
    ]

    const linkedIds = computeOneHopLinkedIds(nodes, edges, 'identity')
    expect([...linkedIds].sort()).toEqual(['account', 'api', 'identity'])
  })

  it('matches focusOneHop node ids from projectArchitectureView', () => {
    const nodes = [
      node('api', 'component', 'web'),
      node('identity', 'component', 'web'),
      node('account', 'component', 'web'),
    ]
    const edges = [
      edge('api_identity', 'api', 'identity', 'verifies identity'),
      edge('identity_account', 'identity', 'account', 'loads account'),
    ]

    const projected = projectArchitectureView(nodes, edges, 'component', {
      parentId: 'web',
      focusNodeId: 'identity',
    })
    const linkedIds = computeOneHopLinkedIds(nodes, edges, 'identity')
    expect(projected.nodes.map((item) => item.id).sort()).toEqual([...linkedIds].sort())
  })

  it('defaultArchitectureScopeId prefers parentId reverse links for C4 levels', () => {
    const nodes: FunctionalNode[] = [
      {
        ...node('person', 'context'),
        elementType: 'person',
      },
      {
        ...node('system', 'context'),
        elementType: 'software_system',
      },
      {
        ...node('web', 'container', 'system'),
        elementType: 'container',
      },
      {
        ...node('identity', 'component', 'web'),
        elementType: 'component',
        linkedFiles: [{ path: 'lib/auth.ts', role: 'primary' }],
      },
    ]

    expect(defaultArchitectureScopeId(nodes, 'context')).toBeNull()
    expect(defaultArchitectureScopeId(nodes, 'container')).toBe('system')
    expect(defaultArchitectureScopeId(nodes, 'component')).toBe('web')
    expect(defaultArchitectureScopeId(nodes, 'code')).toBe('identity')
  })

  it('lifts cross-level relationships to visible context ancestors', () => {
    const nodes = [
      { ...node('person', 'context'), elementType: 'person' as const },
      { ...node('system', 'context'), elementType: 'software_system' as const },
      { ...node('ext', 'context'), elementType: 'external_system' as const },
      { ...node('web', 'container', 'system'), elementType: 'container' as const },
    ]
    const edges = [
      edge('person_uses', 'person', 'system', 'Uses'),
      edge('web_calls_ext', 'web', 'ext', 'Calls payment API'),
    ]

    const projected = projectArchitectureView(nodes, edges, 'context')
    expect(projected.nodes.map((item) => item.id).sort()).toEqual([
      'ext',
      'person',
      'system',
    ])
    expect(projected.edges.some((item) => item.source === 'system' && item.target === 'ext')).toBe(
      true,
    )
  })

  it('applies named view include filters', () => {
    const nodes = [
      node('web', 'container', 'system'),
      node('worker', 'container', 'system'),
    ]
    const views = [
      {
        key: 'view_container_system',
        title: 'Web only',
        level: 'container' as const,
        parentId: 'system',
        includeNodeIds: ['web'],
      },
    ]
    const projected = projectArchitectureView(
      nodes,
      [],
      'container',
      { parentId: 'system' },
      [],
      [],
      { views, viewKey: 'view_container_system' },
    )
    expect(projected.nodes.map((item) => item.id)).toEqual(['web'])
  })
})

function relation(
  id: string,
  sourcePath: string,
  targetPath: string,
): FileRelation {
  return {
    id,
    sourcePath,
    targetPath,
    relation: 'calls',
    label: id,
    confidence: 1,
    evidence: `${sourcePath} -> ${targetPath}`,
  }
}
