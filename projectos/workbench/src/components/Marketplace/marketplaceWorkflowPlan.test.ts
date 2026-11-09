import { describe, expect, it } from 'vitest'
import type { IntentGraph } from '@contracts/index'
import { orderDraftNodesForPlan } from './marketplaceWorkflowPlan'

function draft(partial: Partial<IntentGraph> & Pick<IntentGraph, 'nodes' | 'edges'>): IntentGraph {
  return {
    revision: 1,
    graphPrompt: 'demo',
    ...partial,
  }
}

describe('orderDraftNodesForPlan', () => {
  it('orders process nodes by flow edges and skips config satellites', () => {
    const graph = draft({
      nodes: [
        {
          id: 'coder',
          title: 'Coder',
          prompt: 'code',
          type: 'agent',
          position: { x: 40, y: 200 },
        },
        {
          id: 'planner',
          title: 'Planner',
          prompt: 'plan',
          type: 'agent',
          position: { x: 40, y: 40 },
        },
        {
          id: 'model',
          title: 'Model',
          prompt: '',
          type: 'config',
          satelliteKind: 'model',
          position: { x: 260, y: 40 },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'planner',
          target: 'coder',
          kind: 'depends',
          prompt: 'hand off',
        },
        {
          id: 'e2',
          source: 'model',
          target: 'planner',
          kind: 'provides',
          prompt: '',
        },
      ],
    })

    expect(orderDraftNodesForPlan(graph).map((node) => node.id)).toEqual([
      'planner',
      'coder',
    ])
  })

  it('falls back to canvas position when edges are missing', () => {
    const graph = draft({
      nodes: [
        {
          id: 'b',
          title: 'B',
          prompt: 'b',
          type: 'action',
          position: { x: 40, y: 140 },
        },
        {
          id: 'a',
          title: 'A',
          prompt: 'a',
          type: 'agent',
          position: { x: 40, y: 40 },
        },
      ],
      edges: [],
    })

    expect(orderDraftNodesForPlan(graph).map((node) => node.id)).toEqual(['a', 'b'])
  })
})
