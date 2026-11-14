import { describe, expect, it } from 'vitest'

import type { IntentGraphEdge, IntentGraphNode } from '@contracts/index'
import {
  clampSatelliteToAgent,
  LOOP_CONFIG_NODE_H,
  LOOP_CONFIG_NODE_W,
  LOOP_SATELLITE_BELOW_GAP,
  LOOP_SATELLITE_MAX_DISTANCE,
  listAgentProvidesSatellites,
  satelliteFollowAgentPatches,
} from './loopWiringVisuals'

function agent(
  partial: Partial<IntentGraphNode> & { id: string },
): IntentGraphNode {
  return {
    title: 'Coder',
    prompt: 'Ship',
    type: 'agent',
    position: { x: 100, y: 100 },
    ...partial,
  }
}

function satellite(
  partial: Partial<IntentGraphNode> & { id: string },
): IntentGraphNode {
  return {
    title: 'Model',
    prompt: '',
    type: 'config',
    satelliteKind: 'model',
    position: { x: 120, y: 220 },
    ...partial,
  }
}

describe('satellite tether helpers', () => {
  it('lists provides satellites for an agent', () => {
    const nodes = [
      agent({ id: 'a1' }),
      satellite({ id: 'm1' }),
      satellite({ id: 'm2', satelliteKind: 'mcp', title: 'MCP' }),
      agent({ id: 'a2' }),
      satellite({ id: 'm3' }),
    ]
    const edges: IntentGraphEdge[] = [
      { id: 'e1', source: 'm1', target: 'a1', kind: 'provides' },
      { id: 'e2', source: 'm2', target: 'a1', kind: 'provides' },
      { id: 'e3', source: 'm3', target: 'a2', kind: 'provides' },
      { id: 'e4', source: 'a1', target: 'a2', kind: 'depends' },
    ]
    const sats = listAgentProvidesSatellites('a1', { nodes, edges })
    expect(sats.map((s) => s.id).sort()).toEqual(['m1', 'm2'])
  })

  it('clamps satellites beyond max center distance while staying below', () => {
    const agentSize = { width: 200, height: 100 }
    const far = clampSatelliteToAgent({
      agentPosition: { x: 0, y: 0 },
      agentSize,
      satellitePosition: { x: 80, y: 800 },
      maxDistance: 200,
    })
    const minY = 0 + agentSize.height + LOOP_SATELLITE_BELOW_GAP
    expect(far.y).toBeGreaterThanOrEqual(minY)
    const agentCenter = { x: 100, y: 50 }
    const satCenter = {
      x: far.x + LOOP_CONFIG_NODE_W / 2,
      y: far.y + LOOP_CONFIG_NODE_H / 2,
    }
    expect(
      Math.hypot(satCenter.x - agentCenter.x, satCenter.y - agentCenter.y),
    ).toBeLessThanOrEqual(200 + 0.5)
  })

  it('forces satellites that sit above the agent back below it', () => {
    const agentSize = { width: 200, height: 100 }
    const next = clampSatelliteToAgent({
      agentPosition: { x: 100, y: 100 },
      agentSize,
      satellitePosition: { x: 140, y: 40 },
    })
    expect(next.y).toBe(
      100 + agentSize.height + LOOP_SATELLITE_BELOW_GAP,
    )
  })

  it('translates satellites with the agent and keeps them in range', () => {
    const a1 = agent({ id: 'a1', position: { x: 100, y: 100 } })
    const m1 = satellite({ id: 'm1', position: { x: 120, y: 220 } })
    const draft = {
      nodes: [a1, m1],
      edges: [
        {
          id: 'e1',
          source: 'm1',
          target: 'a1',
          kind: 'provides' as const,
        },
      ],
    }
    const patches = satelliteFollowAgentPatches({
      agentId: 'a1',
      previousAgentPosition: { x: 100, y: 100 },
      nextAgentPosition: { x: 400, y: 300 },
      agentSize: { width: 200, height: 100 },
      draft,
    })
    expect(patches).toHaveLength(1)
    expect(patches[0]!.id).toBe('m1')
    // Relative offset preserved: +300,+200
    expect(patches[0]!.position).toEqual({ x: 420, y: 420 })
  })

  it('pulls an over-long satellite back when agent moves', () => {
    const a1 = agent({ id: 'a1', position: { x: 0, y: 0 } })
    const m1 = satellite({
      id: 'm1',
      position: { x: 0, y: LOOP_SATELLITE_MAX_DISTANCE + 400 },
    })
    const patches = satelliteFollowAgentPatches({
      agentId: 'a1',
      previousAgentPosition: { x: 0, y: 0 },
      nextAgentPosition: { x: 50, y: 50 },
      agentSize: { width: 200, height: 100 },
      draft: {
        nodes: [a1, m1],
        edges: [
          { id: 'e1', source: 'm1', target: 'a1', kind: 'provides' },
        ],
      },
    })
    expect(patches).toHaveLength(1)
    const satCenter = {
      x: patches[0]!.position.x + LOOP_CONFIG_NODE_W / 2,
      y: patches[0]!.position.y + LOOP_CONFIG_NODE_H / 2,
    }
    const agentCenter = { x: 50 + 100, y: 50 + 50 }
    expect(
      Math.hypot(satCenter.x - agentCenter.x, satCenter.y - agentCenter.y),
    ).toBeLessThanOrEqual(LOOP_SATELLITE_MAX_DISTANCE + 0.5)
  })
})
