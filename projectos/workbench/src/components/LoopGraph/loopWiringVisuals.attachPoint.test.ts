import { describe, expect, it } from 'vitest'

import type { IntentGraphEdge, IntentGraphNode } from '@contracts/index'
import {
  agentWiringPortPoint,
  buildAgentWiringLayout,
  wiringPortOffset,
} from './loopWiringVisuals'

function agent(
  partial: Partial<IntentGraphNode> & { id: string },
): IntentGraphNode {
  return {
    title: 'UI/UX Designer',
    prompt: 'Describe flows',
    type: 'agent',
    position: { x: 100, y: 80 },
    ...partial,
  }
}

function satellite(
  partial: Partial<IntentGraphNode> & { id: string },
): IntentGraphNode {
  return {
    title: 'Skill',
    prompt: '',
    type: 'config',
    satelliteKind: 'skill',
    position: { x: 120, y: 220 },
    ...partial,
  }
}

describe('Agent wiring attach points', () => {
  it('pins every skill satellite edge to the Skills icon buttonX', () => {
    const a1 = agent({ id: 'a1' })
    const skills = [
      satellite({ id: 's1', position: { x: 200, y: 220 } }),
      satellite({ id: 's2', position: { x: 240, y: 260 } }),
      satellite({ id: 's3', position: { x: 280, y: 300 } }),
    ]
    const model = satellite({
      id: 'm1',
      satelliteKind: 'model',
      title: 'Model',
      position: { x: 110, y: 220 },
    })
    const draft = {
      nodes: [a1, model, ...skills],
      edges: [
        {
          id: 'e-m',
          source: 'm1',
          target: 'a1',
          kind: 'provides' as const,
          configPort: 'model' as const,
        },
        ...skills.map(
          (sat, index): IntentGraphEdge => ({
            id: `e-s${index}`,
            source: sat.id,
            target: 'a1',
            kind: 'provides',
            configPort: 'skill',
          }),
        ),
      ],
    }

    const layout = buildAgentWiringLayout(a1, draft)
    const skillGroup = layout.groups.find((group) => group.port === 'skill')
    const modelGroup = layout.groups.find((group) => group.port === 'model')
    expect(skillGroup).toBeDefined()
    expect(modelGroup).toBeDefined()

    // All skill slots share the icon center — no zone fanning.
    const skillSlots = layout.slots.filter((slot) => slot.port === 'skill')
    expect(skillSlots).toHaveLength(3)
    for (const slot of skillSlots) {
      expect(slot.x).toBeCloseTo(skillGroup!.buttonX, 5)
    }

    const skillEnds = skills.map((sat) =>
      agentWiringPortPoint(a1, 'skill', {
        draft,
        satelliteId: sat.id,
      }),
    )
    for (const end of skillEnds) {
      expect(end.x).toBeCloseTo(a1.position.x + skillGroup!.buttonX, 5)
      expect(end.y).toBeCloseTo(a1.position.y + layout.height, 5)
    }

    // Distinct ports stay on their own icons.
    const modelEnd = agentWiringPortPoint(a1, 'model', {
      draft,
      satelliteId: 'm1',
    })
    expect(modelEnd.x).toBeCloseTo(a1.position.x + modelGroup!.buttonX, 5)
    expect(modelEnd.x).not.toBeCloseTo(skillEnds[0]!.x, 0)

    // API still accepts satelliteId but never drifts off the icon.
    const offset = wiringPortOffset('skill', layout.width, layout, 's2')
    expect(offset.x).toBeCloseTo(skillGroup!.buttonX, 5)
  })
})
