import { describe, expect, it, vi } from 'vitest'
import type { SemanticTreeNode } from '@contracts/index'

import { handleSemanticTreeRowKey } from './semanticTreeRowInteraction'

describe('semantic tree row keyboard interaction', () => {
  it('selects a feature with children when Enter is pressed', () => {
    const node: SemanticTreeNode = {
      id: 'feature-dashboard',
      label: 'Dashboard',
      kind: 'feature',
      sourceNodeId: 'feat_dashboard',
      status: 'active',
      children: [
        {
          id: 'dashboard-page',
          label: 'page.tsx',
          kind: 'file',
          path: 'app/dashboard/page.tsx',
          sourceNodeId: 'feat_dashboard',
          status: 'active',
          children: [],
        },
      ],
    }
    const selectNode = vi.fn()
    const toggleExpanded = vi.fn()
    const event = {
      key: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }

    expect(handleSemanticTreeRowKey(event, node, false, {
      selectFile: vi.fn(),
      selectNode,
      toggleExpanded,
    })).toBe(true)
    expect(selectNode).toHaveBeenCalledWith('feat_dashboard')
    expect(toggleExpanded).not.toHaveBeenCalled()
  })

  it('uses horizontal arrows to expand and collapse child rows', () => {
    const node = {
      id: 'folder',
      label: 'Folder',
      kind: 'folder',
      status: 'active',
      children: [{ id: 'child' }],
    } as SemanticTreeNode
    const toggleExpanded = vi.fn()
    const actions = { selectFile: vi.fn(), selectNode: vi.fn(), toggleExpanded }

    handleSemanticTreeRowKey({ key: 'ArrowRight', preventDefault: vi.fn(), stopPropagation: vi.fn() }, node, false, actions)
    handleSemanticTreeRowKey({ key: 'ArrowLeft', preventDefault: vi.fn(), stopPropagation: vi.fn() }, node, true, actions)

    expect(toggleExpanded).toHaveBeenCalledTimes(2)
  })
})
