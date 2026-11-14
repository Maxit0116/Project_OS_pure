import { describe, expect, it } from 'vitest'
import type { IntentGraph, IntentGraphNode } from '@contracts/index'
import { LOOP_NODE_H, LOOP_NODE_W, rectsOverlap } from './loopEdgeRouting'
import { routeAllLoopWorkflowEdges } from './loopEdgeBatchRouting'

function node(
  partial: Partial<IntentGraphNode> & Pick<IntentGraphNode, 'id'>,
): IntentGraphNode {
  return {
    title: partial.title ?? partial.id,
    prompt: '',
    position: partial.position ?? { x: 0, y: 0 },
    ...partial,
  }
}

describe('loopEdgeBatchRouting', () => {
  it('parks labels so neighboring chips do not stack', () => {
    const a = node({
      id: 'a',
      type: 'action',
      actionIntegration: 'terminal',
      position: { x: 0, y: 0 },
    })
    const b = node({
      id: 'b',
      type: 'action',
      actionIntegration: 'terminal',
      position: { x: 320, y: 0 },
    })
    const c = node({
      id: 'c',
      type: 'action',
      actionIntegration: 'terminal',
      position: { x: 640, y: 0 },
    })
    const draft: IntentGraph = {
      revision: 1,
      graphPrompt: '',
      nodes: [a, b, c],
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          kind: 'depends',
          prompt: 'Hand plan to implementation',
        },
        {
          id: 'e2',
          source: 'b',
          target: 'c',
          kind: 'depends',
          prompt: 'Hand implementation to review',
        },
      ],
    }
    const routes = routeAllLoopWorkflowEdges({
      draft,
      sizeOf: () => ({ width: LOOP_NODE_W, height: LOOP_NODE_H }),
    })
    const r1 = routes.get('e1')!
    const r2 = routes.get('e2')!
    expect(rectsOverlap(r1.labelRect, r2.labelRect, 8)).toBe(false)
  })

  it('keeps workflow paths attached with rounded SVG output', () => {
    const a = node({
      id: 'a',
      type: 'action',
      actionIntegration: 'terminal',
      position: { x: 0, y: 40 },
    })
    const b = node({
      id: 'b',
      type: 'action',
      actionIntegration: 'terminal',
      position: { x: 360, y: 40 },
    })
    const draft: IntentGraph = {
      revision: 1,
      graphPrompt: '',
      nodes: [a, b],
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'b',
          kind: 'depends',
          prompt: 'Continue',
        },
      ],
    }
    const routes = routeAllLoopWorkflowEdges({
      draft,
      sizeOf: () => ({ width: LOOP_NODE_W, height: LOOP_NODE_H }),
    })
    const routed = routes.get('e1')!
    expect(routed.d.startsWith('M ')).toBe(true)
    expect(routed.points.length).toBeGreaterThanOrEqual(2)
    expect(routed.mid.x).toBeGreaterThan(a.position.x)
    expect(routed.mid.x).toBeLessThan(b.position.x + LOOP_NODE_W)
  })
})
