import { describe, expect, it } from 'vitest'

import type { IntentGraphNode } from '@contracts/index'
import {
  isWorkGroupMemberAgent,
  LOOP_AGENT_DUTY_BODY_H,
  LOOP_AGENT_NODE_MIN_W,
  LOOP_AGENT_WIRING_STRIP_H,
  LOOP_WORK_GROUP_MEMBER_H,
  LOOP_WORK_GROUP_MEMBER_MAX_W,
  LOOP_WORK_GROUP_MEMBER_MIN_W,
  nodeBoxSize,
  workGroupMemberBoxSize,
} from './loopWiringVisuals'

function agent(partial: Partial<IntentGraphNode> & { id: string }): IntentGraphNode {
  return {
    title: 'Coder',
    prompt: 'Implement the feature',
    type: 'agent',
    position: { x: 0, y: 0 },
    ...partial,
  }
}

describe('work-group member chip sizing', () => {
  it('detects agents nested in a work group', () => {
    expect(
      isWorkGroupMemberAgent(agent({ id: 'a1', workGroupId: 'wg_1' })),
    ).toBe(true)
    expect(isWorkGroupMemberAgent(agent({ id: 'a2' }))).toBe(false)
  })

  it('sizes member chips as icon+title, not full duty cards', () => {
    const member = agent({
      id: 'a1',
      title: 'Planner',
      workGroupId: 'wg_1',
    })
    const size = nodeBoxSize(member)
    expect(size.height).toBe(LOOP_WORK_GROUP_MEMBER_H)
    expect(size.width).toBeGreaterThanOrEqual(LOOP_WORK_GROUP_MEMBER_MIN_W)
    expect(size.width).toBeLessThanOrEqual(LOOP_WORK_GROUP_MEMBER_MAX_W)
    expect(size.width).toBe(workGroupMemberBoxSize(member).width)
  })

  it('keeps standalone agents on the full wiring card size', () => {
    const size = nodeBoxSize(agent({ id: 'a1' }))
    expect(size.width).toBe(LOOP_AGENT_NODE_MIN_W)
    expect(size.height).toBe(LOOP_AGENT_DUTY_BODY_H + LOOP_AGENT_WIRING_STRIP_H)
  })

  it('uses full Loops Graph agent cards when compactWorkGroupMembers is false (L2)', () => {
    const member = agent({
      id: 'a1',
      title: 'Planner',
      workGroupId: 'wg_1',
    })
    const size = nodeBoxSize(member, undefined, {
      compactWorkGroupMembers: false,
    })
    expect(size.width).toBe(LOOP_AGENT_NODE_MIN_W)
    expect(size.height).toBe(LOOP_AGENT_DUTY_BODY_H + LOOP_AGENT_WIRING_STRIP_H)
  })
})
