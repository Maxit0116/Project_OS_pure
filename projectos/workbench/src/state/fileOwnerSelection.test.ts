import { describe, expect, it } from 'vitest'

import { createMockSampleWorkspace } from '../../../client/mock-project-os-api-client.js'
import { resolveFileOwnerSelection } from './fileOwnerSelection'

describe('resolveFileOwnerSelection', () => {
  it('resolves a file with exactly one owner', () => {
    const workspace = createMockSampleWorkspace()

    expect(resolveFileOwnerSelection(
      workspace.graph,
      workspace.semanticTree,
      'app/login/page.tsx',
    )).toEqual({
      status: 'resolved',
      nodeId: 'feat_login',
      candidateNodeIds: ['feat_login'],
    })
  })

  it('requires an explicit choice for multiple owners and respects a valid preference', () => {
    const workspace = createMockSampleWorkspace()
    const graph = structuredClone(workspace.graph)
    graph.fileIndex.find((file) => file.path === 'app/login/page.tsx')!.nodeIds.push('feat_home')

    expect(resolveFileOwnerSelection(
      graph,
      workspace.semanticTree,
      'app/login/page.tsx',
    )).toEqual({
      status: 'ambiguous',
      candidateNodeIds: ['feat_login', 'feat_home'],
    })
    expect(resolveFileOwnerSelection(
      graph,
      workspace.semanticTree,
      'app/login/page.tsx',
      'feat_home',
    )).toMatchObject({ status: 'resolved', nodeId: 'feat_home' })
  })

  it('reports files with no functional owner', () => {
    const workspace = createMockSampleWorkspace()

    expect(resolveFileOwnerSelection(
      workspace.graph,
      workspace.semanticTree,
      'unmapped/file.ts',
    )).toEqual({ status: 'not_mapped', candidateNodeIds: [] })
  })
})
