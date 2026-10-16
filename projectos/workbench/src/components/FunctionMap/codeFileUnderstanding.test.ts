import { describe, expect, it } from 'vitest'

import type {
  FileEntry,
  FileRelation,
  FunctionalEdge,
  FunctionalNode,
  ProjectGraph,
} from '@contracts/index'
import {
  buildNodeUnderstanding,
  changeRiskFromDependentCount,
  neighborDisplayLabel,
} from './codeFileUnderstanding'

function codeNode(
  partial: Partial<FunctionalNode> & Pick<FunctionalNode, 'id' | 'name'>,
): FunctionalNode {
  return {
    type: 'capability',
    status: 'active',
    description: partial.description ?? partial.name,
    summary: partial.summary ?? partial.name,
    responsibility: partial.responsibility ?? partial.name,
    elementType: 'code_element',
    level: 'code',
    linkedFiles: partial.linkedFiles ?? [
      { path: partial.name, role: 'primary' },
    ],
    upstream: [],
    downstream: [],
    confidence: 1,
    tags: [],
    parentId: 'comp_auth',
    children: [],
    refs: [],
    depth: 3,
    ...partial,
  }
}

function archNode(
  partial: Partial<FunctionalNode> & Pick<FunctionalNode, 'id' | 'name'>,
): FunctionalNode {
  return {
    type: 'capability',
    status: 'active',
    description: partial.description ?? partial.name,
    summary: partial.summary ?? partial.name,
    responsibility: partial.responsibility ?? partial.name,
    elementType: 'component',
    level: 'component',
    linkedFiles: [],
    upstream: [],
    downstream: [],
    confidence: 1,
    tags: [],
    parentId: null,
    children: [],
    refs: [],
    depth: 2,
    ...partial,
  }
}

describe('codeFileUnderstanding', () => {
  it('ranks change risk by dependent count', () => {
    expect(changeRiskFromDependentCount(0)).toBe('low')
    expect(changeRiskFromDependentCount(1)).toBe('low')
    expect(changeRiskFromDependentCount(2)).toBe('medium')
    expect(changeRiskFromDependentCount(5)).toBe('high')
  })

  it('prefers responsibility over raw ids for neighbor labels', () => {
    const node = codeNode({
      id: 'code_file_login',
      name: 'login.ts',
      responsibility: 'Handles login',
    })
    expect(neighborDisplayLabel(node, 'code_file_login')).toBe('Handles login')
    expect(neighborDisplayLabel(undefined, 'src/auth/session.ts')).toBe(
      'session.ts',
    )
  })

  it('builds used-by / depends-on from projected edges for code nodes', () => {
    const login = codeNode({
      id: 'code_file_login',
      name: 'login.ts',
      responsibility: 'Login entry',
      linkedFiles: [{ path: 'auth/login.ts', role: 'primary' }],
    })
    const form = codeNode({
      id: 'code_file_form',
      name: 'LoginForm.tsx',
      responsibility: 'Login form UI',
      linkedFiles: [{ path: 'components/LoginForm.tsx', role: 'primary' }],
    })
    const service = codeNode({
      id: 'code_file_service',
      name: 'authService.ts',
      responsibility: 'Auth service',
      linkedFiles: [{ path: 'auth/authService.ts', role: 'primary' }],
    })
    const edges: FunctionalEdge[] = [
      {
        id: 'e1',
        source: 'code_file_form',
        target: 'code_file_login',
        relation: 'imports',
        label: 'imports',
        confidence: 1,
      },
      {
        id: 'e2',
        source: 'code_file_login',
        target: 'code_file_service',
        relation: 'imports',
        label: 'imports',
        confidence: 1,
      },
    ]
    const fileIndex: FileEntry[] = [
      {
        path: 'auth/login.ts',
        type: 'lib',
        nodeIds: [],
        imports: ['auth/authService.ts'],
        exports: ['authenticateUser'],
      },
    ]

    const understanding = buildNodeUnderstanding({
      node: login,
      layerNodes: [login, form, service],
      layerEdges: edges,
      fileIndex,
      fileRelations: [],
      durableGraph: null,
    })

    expect(understanding.isCodeNode).toBe(true)
    expect(understanding.fileType).toBe('lib')
    expect(understanding.stereotype).toBe('[Module]')
    expect(understanding.usedBy.map((item) => item.label)).toEqual([
      'Login form UI',
    ])
    expect(understanding.dependsOn.map((item) => item.label)).toEqual([
      'Auth service',
    ])
    expect(understanding.changeRisk).toBe('low')
  })

  it('falls back to fileRelations when projected edges are empty', () => {
    const login = codeNode({
      id: 'code_file_login',
      name: 'login.ts',
      linkedFiles: [{ path: 'auth/login.ts', role: 'primary' }],
    })
    const relations: FileRelation[] = [
      {
        id: 'r1',
        sourcePath: 'components/LoginForm.tsx',
        targetPath: 'auth/login.ts',
        relation: 'imports',
        label: 'imports',
        confidence: 1,
        evidence: 'import',
      },
    ]

    const understanding = buildNodeUnderstanding({
      node: login,
      layerNodes: [login],
      layerEdges: [],
      fileIndex: [],
      fileRelations: relations,
      durableGraph: null,
    })

    expect(understanding.usedBy.map((item) => item.label)).toEqual([
      'LoginForm.tsx',
    ])
  })

  it('uses durable-graph impact for architecture nodes, not code_file ids', () => {
    const auth = archNode({ id: 'comp_auth', name: 'Auth' })
    const payment = archNode({ id: 'comp_payment', name: 'Payment' })
    const durableGraph = {
      version: '0.5.0',
      projectId: 'p1',
      projectName: 'demo',
      projectType: 'nextjs',
      analyzedAt: new Date(0).toISOString(),
      analysisStatus: 'complete',
      architecture: {
        notation: 'c4',
        defaultLevel: 'component',
        layers: [{ id: 'app', label: 'App', order: 0, description: 'App' }],
      },
      nodes: [auth, payment],
      edges: [
        {
          id: 'e1',
          source: 'comp_payment',
          target: 'comp_auth',
          relation: 'uses',
          label: 'uses',
          confidence: 1,
        },
      ],
      fileIndex: [],
      fileRelations: [],
      topology: { rootIds: ['comp_auth'], maxDepth: 1, totalNodes: 2 },
    } as ProjectGraph

    const understanding = buildNodeUnderstanding({
      node: auth,
      layerNodes: [auth, payment],
      layerEdges: durableGraph.edges,
      fileIndex: [],
      fileRelations: [],
      durableGraph,
    })

    expect(understanding.isCodeNode).toBe(false)
    expect(understanding.impactDependentCount).toBeGreaterThanOrEqual(1)
    expect(understanding.usedBy.some((item) => item.label === 'Payment')).toBe(
      true,
    )
    expect(understanding.changeRisk).toBe('low')
  })
})
