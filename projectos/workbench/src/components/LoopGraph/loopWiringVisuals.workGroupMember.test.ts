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

describe('work-group member card sizing', () => {
  it('detects agents nested in a work group', () => {
    expect(
      isWorkGroupMemberAgent(agent({ id: 'a1', workGroupId: 'wg_1' })),
    ).toBe(true)
    expect(isWorkGroupMemberAgent(agent({ id: 'a2' }))).toBe(false)
  })

  it('sizes members from title + description instead of a fixed chip', () => {
    const member = agent({
      id: 'a1',
      title: 'Backend Engineer',
      workGroupId: 'wg_1',
      prompt: '',
    })
    const size = nodeBoxSize(member)
    expect(size.height).toBeGreaterThanOrEqual(LOOP_WORK_GROUP_MEMBER_H)
    expect(size.width).toBeGreaterThanOrEqual(LOOP_WORK_GROUP_MEMBER_MIN_W)
    expect(size.width).toBeLessThanOrEqual(LOOP_WORK_GROUP_MEMBER_MAX_W)
    expect(size.width).toBe(workGroupMemberBoxSize(member).width)
    // Longer title needs more than the old 200px fixed card.
    expect(size.width).toBeGreaterThan(200)
    // Empty-duty hint needs room for two lines — taller than the old 64px chip.
    expect(size.height).toBeGreaterThan(LOOP_WORK_GROUP_MEMBER_H)
    // No Model/MCP/Skill strip on L1 surface members.
    expect(size.height).toBeLessThan(
      LOOP_AGENT_DUTY_BODY_H + LOOP_AGENT_WIRING_STRIP_H,
    )
  })

  it('keeps short complete members near the compact baseline', () => {
    const member = agent({
      id: 'a1',
      title: 'QA',
      prompt: 'Ship',
      workGroupId: 'wg_1',
    })
    const size = workGroupMemberBoxSize(member)
    expect(size.width).toBeGreaterThanOrEqual(LOOP_WORK_GROUP_MEMBER_MIN_W)
    expect(size.height).toBeGreaterThanOrEqual(LOOP_WORK_GROUP_MEMBER_H)
  })

  it('grows the L1 chip so a multi-item duty list is not clipped under 120px', () => {
    const member = agent({
      id: 'a1',
      title: 'Backend',
      workGroupId: 'wg_1',
      dutyItems: [
        { id: 'd1', text: 'Draft API', kind: 'machine', required: true },
        { id: 'd2', text: 'Write tests', kind: 'machine', required: true },
        { id: 'd3', text: 'Review PR', kind: 'human', required: true },
        { id: 'd4', text: 'Ship', kind: 'machine', required: true },
        { id: 'd5', text: 'Monitor', kind: 'machine', required: true },
      ],
    })
    const size = workGroupMemberBoxSize(member)
    expect(size.height).toBeGreaterThan(120)
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
