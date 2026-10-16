import { describe, expect, it } from 'vitest'
import type { IntentGraph } from '@contracts/index'
import {
  buildLoopAuthoringPromptFromMessages,
  findLoopAuthoringTarget,
} from './loopAuthoring'

describe('loopAuthoring helpers', () => {
  it('finds node and edge authoring targets by session id', () => {
    const draft: IntentGraph = {
      revision: 1,
      graphPrompt: '',
      nodes: [
        {
          id: 'n1',
          title: 'Untitled',
          prompt: '',
          position: { x: 0, y: 0 },
          authoringSessionId: 'chat_node',
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'n1',
          target: 'n1',
          authoringSessionId: 'chat_edge',
        },
      ],
    }
    expect(findLoopAuthoringTarget(draft, 'chat_node')).toEqual({
      type: 'node',
      id: 'n1',
      title: 'Untitled',
    })
    expect(findLoopAuthoringTarget(draft, 'chat_edge')).toMatchObject({
      type: 'edge',
      id: 'e1',
      source: 'n1',
      target: 'n1',
    })
    expect(findLoopAuthoringTarget(draft, 'missing')).toBeNull()
  })

  it('builds a clamped authoring prompt from session messages', () => {
    const prompt = buildLoopAuthoringPromptFromMessages(
      [
        {
          id: 'm1',
          role: 'user',
          content: 'Implement login redirect',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Will own the redirect fix and tests.',
          timestamp: '2026-01-01T00:00:01.000Z',
        },
      ],
      80,
      'Own login redirect',
    )
    expect(prompt.startsWith('Own login redirect')).toBe(true)
    expect(prompt).toContain('Implement login redirect')
    expect(prompt.length).toBeLessThanOrEqual(80)
  })
})
