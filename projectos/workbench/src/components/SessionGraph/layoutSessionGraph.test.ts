import { describe, expect, it } from 'vitest'
import type { ChatSessionHead } from '@contracts/index'
import { buildSessionGraph } from '@contracts/index'
import { layoutSessionGraph } from './layoutSessionGraph'

const now = '2026-08-02T00:00:00.000Z'

function head(partial: Partial<ChatSessionHead> & Pick<ChatSessionHead, 'id'>): ChatSessionHead {
  return {
    title: partial.title ?? partial.id,
    createdAt: now,
    lastUpdatedAt: now,
    chatMode: 'ask',
    isArchived: false,
    status: 'idle',
    classification: 'topic',
    ...partial,
  }
}

describe('layoutSessionGraph', () => {
  it('places a parent above its child', async () => {
    const model = buildSessionGraph([
      head({ id: 'root', title: 'Login' }),
      head({ id: 'child', title: 'Callback', parentSessionId: 'root' }),
      head({ id: 'other', title: 'Billing' }),
    ])
    const layout = await layoutSessionGraph(model)
    const root = layout.positions.root
    const child = layout.positions.child
    const other = layout.positions.other
    expect(root).toBeTruthy()
    expect(child).toBeTruthy()
    expect(other).toBeTruthy()
    expect(root!.y).toBeLessThan(child!.y)
  })
})
