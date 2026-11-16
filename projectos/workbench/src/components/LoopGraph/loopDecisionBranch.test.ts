import { describe, expect, it } from 'vitest'

import type { IntentGraphNode } from '@contracts/index'
import {
  decisionBranchKeyForPort,
  decisionBranchKindForNode,
  decisionBranchLabelKeyForPort,
  decisionBranchLabelPoint,
  decisionBranchPatchForPort,
  decisionBranchRoleForPort,
  isDecisionBranchSourceNode,
  isStockDecisionBranchLabel,
  pointAlongPolyline,
  resolveDecisionBranchDisplayLabel,
} from './loopDecisionBranch'

function node(
  partial: Partial<IntentGraphNode> & { id: string },
): IntentGraphNode {
  return {
    title: 'Node',
    prompt: '',
    position: { x: 0, y: 0 },
    ...partial,
  }
}

describe('loopDecisionBranch', () => {
  it('treats Condition and Human Approval diamonds as decision sources', () => {
    expect(
      isDecisionBranchSourceNode(
        node({ id: 'c', type: 'logic', logicKind: 'condition' }),
      ),
    ).toBe(true)
    expect(
      isDecisionBranchSourceNode(
        node({ id: 'a', type: 'human', humanMode: 'approval' }),
      ),
    ).toBe(true)
    expect(
      isDecisionBranchSourceNode(
        node({ id: 'd', type: 'human', humanMode: 'decision' }),
      ),
    ).toBe(false)
    expect(
      isDecisionBranchSourceNode(node({ id: 'ag', type: 'agent' })),
    ).toBe(false)
  })

  it('maps S/W/E ports to pass/fail/other roles', () => {
    expect(decisionBranchRoleForPort('s')).toBe('pass')
    expect(decisionBranchRoleForPort('w')).toBe('fail')
    expect(decisionBranchRoleForPort('e')).toBe('other')
    expect(decisionBranchRoleForPort('n')).toBe('custom')
  })

  it('uses agree/disagree keys for approval and pass/fail for condition', () => {
    expect(decisionBranchKindForNode(node({ id: 'a', type: 'human', humanMode: 'approval' }))).toBe(
      'approval',
    )
    expect(
      decisionBranchLabelKeyForPort('s', 'approval'),
    ).toBe('agree')
    expect(
      decisionBranchLabelKeyForPort('w', 'approval'),
    ).toBe('disagree')
    expect(decisionBranchKeyForPort('s', 'condition')).toBe('pass')
    expect(decisionBranchKeyForPort('w', 'condition')).toBe('fail')
    expect(decisionBranchKeyForPort('e', 'condition')).toBe('other')
  })

  it('builds a patch that forces conditional kind for condition sources', () => {
    const condition = node({ id: 'c', type: 'logic', logicKind: 'condition' })
    const patch = decisionBranchPatchForPort('s', condition, (key) => key)
    expect(patch).toEqual({
      sourcePort: 's',
      branchKey: 'pass',
      branchLabel: 'pass',
      kind: 'conditional',
    })

    const approval = node({ id: 'a', type: 'human', humanMode: 'approval' })
    const agree = decisionBranchPatchForPort('s', approval, (key) => key)
    expect(agree.kind).toBeUndefined()
    expect(agree.branchKey).toBe('agree')
    expect(agree.branchLabel).toBe('agree')
  })

  it('samples a point along a polyline', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]
    expect(pointAlongPolyline(points, 0)).toEqual({ x: 0, y: 0 })
    expect(pointAlongPolyline(points, 1)).toEqual({ x: 100, y: 100 })
    const mid = pointAlongPolyline(points, 0.5)
    expect(mid.x).toBe(100)
    expect(mid.y).toBe(0)
  })

  it('parks the branch chip outside the source diamond', () => {
    const points = [
      { x: 50, y: 40 },
      { x: 50, y: 200 },
    ]
    const anchor = decisionBranchLabelPoint(points, {
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    })
    expect(anchor.y).toBeGreaterThan(80)
  })

  it('localizes stock Agree/Disagree labels from branchKey', () => {
    expect(isStockDecisionBranchLabel('Agree', 'agree')).toBe(true)
    expect(isStockDecisionBranchLabel('同意', 'agree')).toBe(true)
    expect(isStockDecisionBranchLabel('需法务复核', 'agree')).toBe(false)
    expect(
      resolveDecisionBranchDisplayLabel(
        { branchKey: 'agree', branchLabel: 'Agree' },
        (key) => (key === 'agree' ? '同意' : key),
      ),
    ).toBe('同意')
    expect(
      resolveDecisionBranchDisplayLabel(
        { branchKey: 'agree', branchLabel: '需法务复核' },
        (key) => (key === 'agree' ? '同意' : key),
      ),
    ).toBe('需法务复核')
  })
})
