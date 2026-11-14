import { beforeEach, describe, expect, it } from 'vitest'

import { normalizeLoopGraphDocument } from '@contracts/index'
import { useLoopGraphStore } from './loopGraphStore'

const now = '2026-01-01T00:00:00.000Z'

describe('work-group leave keeps provides satellites with the agent', () => {
  beforeEach(() => {
    useLoopGraphStore.getState().clear()
  })

  it('translates model/mcp/skill satellites by the exit delta', () => {
    const doc = normalizeLoopGraphDocument({
      version: '0.1.0',
      id: 'loop_wg_sat',
      projectId: 'proj',
      title: 'WG satellites',
      draft: {
        revision: 1,
        graphPrompt: '',
        nodes: [
          {
            id: 'agent_1',
            title: 'Coder',
            prompt: 'Build',
            type: 'agent',
            agentDefinitionId: 'def_coder',
            workGroupId: 'wg_1',
            position: { x: 100, y: 100 },
          },
          {
            id: 'sat_model',
            title: 'Model',
            prompt: '',
            type: 'config',
            satelliteKind: 'model',
            position: { x: 110, y: 160 },
          },
          {
            id: 'sat_mcp',
            title: 'MCP',
            prompt: '',
            type: 'config',
            satelliteKind: 'mcp',
            position: { x: 80, y: 160 },
          },
        ],
        edges: [
          {
            id: 'p_model',
            source: 'sat_model',
            target: 'agent_1',
            kind: 'provides',
            configPort: 'model',
          },
          {
            id: 'p_mcp',
            source: 'sat_mcp',
            target: 'agent_1',
            kind: 'provides',
            configPort: 'mcp',
          },
        ],
        workGroups: [
          {
            id: 'wg_1',
            title: 'Squad',
            memberNodeIds: ['agent_1'],
            collaborationMode: 'parallel_join',
            createdAt: now,
            updatedAt: now,
            origin: { x: 60, y: 40 },
          },
        ],
        workGroupSeq: 1,
      },
      approvedSpecs: [],
      instances: [],
      linkedSessionIds: [],
      createdAt: now,
      updatedAt: now,
    })

    useLoopGraphStore.setState({
      document: doc,
      activeLoopId: doc.id,
      phase: 'draw',
    })

    useLoopGraphStore.getState().removeNodeFromWorkGroup('agent_1', {
      exitPosition: { x: 400, y: 300 },
    })

    const next = useLoopGraphStore.getState().document!
    const agent = next.draft.nodes.find((n) => n.id === 'agent_1')!
    const model = next.draft.nodes.find((n) => n.id === 'sat_model')!
    const mcp = next.draft.nodes.find((n) => n.id === 'sat_mcp')!

    expect(agent.workGroupId).toBeUndefined()
    expect(agent.position).toEqual({ x: 400, y: 300 })
    // Exit delta applied, then clamped to stay below the free-canvas agent card.
    expect(model.position.x).toBe(410)
    expect(mcp.position.x).toBe(380)
    expect(model.position.y).toBeGreaterThanOrEqual(agent.position.y + 100)
    expect(mcp.position.y).toBeGreaterThanOrEqual(agent.position.y + 100)
    expect(model.position.y).toBe(mcp.position.y)
    expect(next.draft.workGroups[0]?.memberNodeIds).toEqual([])
  })
})
