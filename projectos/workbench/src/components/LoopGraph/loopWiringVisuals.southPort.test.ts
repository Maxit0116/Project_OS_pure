import { describe, expect, it } from 'vitest'

import type { IntentGraphNode } from '@contracts/index'
import { portPoint } from './loopEdgeRouting'
import {
  buildAgentWiringLayout,
  LOOP_AGENT_DUTY_BODY_H,
  LOOP_AGENT_WIRING_STRIP_H,
  nodeBoxSize,
  workflowPortBoxSize,
} from './loopWiringVisuals'

describe('Agent south workflow port', () => {
  it('places S on the outer bottom border of the wired agent AABB', () => {
    const agent: IntentGraphNode = {
      id: 'a1',
      title: 'UI/UX Designer',
      prompt: 'Describe flows, layouts, and interaction states.',
      type: 'agent',
      position: { x: 40, y: 60 },
    }
    const draft = {
      nodes: [
        agent,
        {
          id: 'm1',
          title: 'Model',
          prompt: '',
          type: 'config' as const,
          satelliteKind: 'model' as const,
          position: { x: 50, y: 200 },
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'm1',
          target: 'a1',
          kind: 'provides' as const,
          configPort: 'model' as const,
        },
      ],
    }

    const layout = buildAgentWiringLayout(agent, draft)
    const box = nodeBoxSize(agent, draft)
    const ports = workflowPortBoxSize(agent, draft)
    expect(box.height).toBe(LOOP_AGENT_DUTY_BODY_H + LOOP_AGENT_WIRING_STRIP_H)
    expect(ports.height).toBe(box.height)
    expect(layout.height).toBe(box.height)

    const south = portPoint(agent, 's', ports.width, ports.height)
    // Center of the bottom edge — not inset into the wiring strip.
    expect(south.y).toBe(agent.position.y + box.height)
    expect(south.x).toBe(agent.position.x + ports.width / 2)
  })
})
