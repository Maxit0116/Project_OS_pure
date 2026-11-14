import { describe, expect, it } from 'vitest'
import {
  LOOP_AGENT_NODE_MIN_W,
  LOOP_AGENT_SOUTH_CORRIDOR_HALF,
  LOOP_CONFIG_NODE_W,
  parkSatelliteLocalX,
  workflowPortsForNode,
} from './loopWiringVisuals'

describe('Agent south corridor', () => {
  it('always exposes N/E/S/W for Agents with satellites', () => {
    const agent = {
      id: 'a1',
      title: 'Planner',
      prompt: 'plan',
      position: { x: 0, y: 0 },
      type: 'agent' as const,
      agentRole: 'planner' as const,
      role: 'implement' as const,
    }
    expect(
      workflowPortsForNode(agent, {
        edges: [
          {
            id: 'e1',
            source: 'mcp1',
            target: 'a1',
            kind: 'provides',
            configPort: 'mcp',
          },
        ],
      }),
    ).toEqual(['n', 'e', 's', 'w'])
  })

  it('parks MCP left of the south corridor by default', () => {
    const width = LOOP_AGENT_NODE_MIN_W
    const left = parkSatelliteLocalX({
      port: 'mcp',
      preferredCenterX: width / 2,
      agentWidth: width,
      stackIndex: 0,
    })
    const centerX = left + LOOP_CONFIG_NODE_W / 2
    expect(centerX).toBeLessThanOrEqual(
      width / 2 - LOOP_AGENT_SOUTH_CORRIDOR_HALF - LOOP_CONFIG_NODE_W / 2,
    )
  })

  it('keeps model/skill on preferred X when clear of corridor', () => {
    const width = LOOP_AGENT_NODE_MIN_W
    const modelLeft = parkSatelliteLocalX({
      port: 'model',
      preferredCenterX: width * 0.1,
      agentWidth: width,
    })
    expect(modelLeft + LOOP_CONFIG_NODE_W / 2).toBeCloseTo(width * 0.1, 0)
  })
})
