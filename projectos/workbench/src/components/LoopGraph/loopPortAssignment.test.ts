import { describe, expect, it } from 'vitest'
import type { IntentGraph, IntentGraphNode } from '@contracts/index'
import {
  LOOP_NODE_H,
  LOOP_NODE_W,
} from './loopEdgeRouting'
import {
  assignLoopWorkflowPorts,
  isSingleSlotLoopNode,
  loopNodePortSlots,
  loopSidePortCapacity,
} from './loopPortAssignment'

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

describe('loopPortAssignment', () => {
  it('keeps agent and diamond nodes single-slot per side', () => {
    const agent = node({ id: 'a', type: 'agent', position: { x: 0, y: 0 } })
    const diamond = node({
      id: 'c',
      type: 'logic',
      logicKind: 'condition',
      position: { x: 0, y: 0 },
    })
    const action = node({
      id: 'x',
      type: 'action',
      actionIntegration: 'terminal',
      position: { x: 0, y: 0 },
    })
    expect(isSingleSlotLoopNode(agent)).toBe(true)
    expect(isSingleSlotLoopNode(diamond)).toBe(true)
    expect(isSingleSlotLoopNode(action)).toBe(false)
    expect(loopSidePortCapacity(agent, 'e', LOOP_NODE_W, LOOP_NODE_H)).toBe(1)
    expect(loopSidePortCapacity(diamond, 'n', LOOP_NODE_W, LOOP_NODE_H)).toBe(1)
    expect(
      loopSidePortCapacity(action, 'e', LOOP_NODE_W, LOOP_NODE_H),
    ).toBeGreaterThan(1)
    expect(
      loopSidePortCapacity(action, 'n', LOOP_NODE_W, LOOP_NODE_H),
    ).toBeGreaterThan(1)
  })

  it('exposes multiple UI slots on action nodes', () => {
    const action = node({
      id: 'x',
      type: 'action',
      actionIntegration: 'terminal',
    })
    const slots = loopNodePortSlots(action, LOOP_NODE_W, LOOP_NODE_H)
    expect(slots.length).toBeGreaterThan(4)
    expect(slots.some((s) => s.port === 'e' && s.index === 1)).toBe(true)
  })

  it('never assigns the same attach point to both in and out on one node', () => {
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
      position: { x: 280, y: 0 },
    })
    const c = node({
      id: 'c',
      type: 'action',
      actionIntegration: 'terminal',
      position: { x: 560, y: 0 },
    })
    const draft: IntentGraph = {
      revision: 1,
      graphPrompt: '',
      nodes: [a, b, c],
      edges: [
        { id: 'e1', source: 'a', target: 'b', kind: 'depends' },
        { id: 'e2', source: 'b', target: 'c', kind: 'depends' },
      ],
    }
    const assigned = assignLoopWorkflowPorts({
      draft,
      sizeOf: () => ({ width: LOOP_NODE_W, height: LOOP_NODE_H }),
    })
    const inOnB = assigned.get('e1')!
    const outOnB = assigned.get('e2')!
    expect(
      `${inOnB.targetPort}:${inOnB.targetPortIndex}`,
    ).not.toBe(`${outOnB.sourcePort}:${outOnB.sourcePortIndex}`)
  })

  it('keeps agent single mid-side even with multiple edges', () => {
    const agent = node({
      id: 'agent',
      type: 'agent',
      position: { x: 200, y: 0 },
    })
    const left = node({
      id: 'left',
      type: 'action',
      actionIntegration: 'terminal',
      position: { x: 0, y: 0 },
    })
    const right = node({
      id: 'right',
      type: 'action',
      actionIntegration: 'terminal',
      position: { x: 480, y: 0 },
    })
    const draft: IntentGraph = {
      revision: 1,
      graphPrompt: '',
      nodes: [left, agent, right],
      edges: [
        { id: 'in', source: 'left', target: 'agent', kind: 'depends' },
        { id: 'out', source: 'agent', target: 'right', kind: 'depends' },
      ],
    }
    const assigned = assignLoopWorkflowPorts({
      draft,
      sizeOf: () => ({ width: LOOP_NODE_W, height: LOOP_NODE_H }),
    })
    const incoming = assigned.get('in')!
    const outgoing = assigned.get('out')!
    // Agent in/out must use different sides (only one slot per side).
    expect(
      `${incoming.targetPort}:${incoming.targetPortIndex}`,
    ).not.toBe(`${outgoing.sourcePort}:${outgoing.sourcePortIndex}`)
    expect(incoming.targetPortIndex).toBe(0)
    expect(outgoing.sourcePortIndex).toBe(0)
  })
})
