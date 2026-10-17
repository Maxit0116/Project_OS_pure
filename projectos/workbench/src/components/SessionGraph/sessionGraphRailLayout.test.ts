import { describe, expect, it } from 'vitest'
import type { ChatSessionHead } from '@contracts/index'
import {
  createRailFolder,
  insertGraphOnRail,
  moveGraphIntoFolder,
  removeGraphFromLayout,
  syncRailLayoutWithGraphs,
} from './sessionGraphRailLayout'

const now = '2026-08-02T00:00:00.000Z'

function head(partial: Partial<ChatSessionHead> & Pick<ChatSessionHead, 'id'>): ChatSessionHead {
  return {
    title: partial.title ?? partial.id,
    createdAt: now,
    lastUpdatedAt: partial.lastUpdatedAt ?? now,
    chatMode: 'ask',
    isArchived: false,
    status: 'idle',
    classification: 'topic',
    ...partial,
  }
}

describe('sessionGraphRailLayout (graph-centric)', () => {
  it('syncs missing topic graphs onto the rail and prunes empty ones', () => {
    const synced = syncRailLayoutWithGraphs(
      {
        version: 2,
        entries: [
          { kind: 'graph', graphId: 'gone' },
          { kind: 'graph', graphId: 'g1' },
        ],
      },
      [head({ id: 'a', graphId: 'g1' }), head({ id: 'b', graphId: 'g2' })],
    )
    expect(synced.entries.map((e) => (e.kind === 'graph' ? e.graphId : e.id))).toEqual([
      'g1',
      'g2',
    ])
  })

  it('moves a graph into a folder and removes the top-level entry', () => {
    let layout = createRailFolder(
      { version: 2, entries: [{ kind: 'graph', graphId: 'g1' }] },
      'Auth',
    )
    const folderId = (layout.entries[1] as { id: string }).id
    layout = moveGraphIntoFolder(layout, 'g1', folderId)
    expect(layout.entries).toHaveLength(1)
    expect(layout.entries[0]).toMatchObject({ kind: 'folder', graphIds: ['g1'] })
  })

  it('inserts and removes graph entries', () => {
    const inserted = insertGraphOnRail({ version: 2, entries: [] }, 'g1')
    expect(inserted.entries).toEqual([{ kind: 'graph', graphId: 'g1' }])
    expect(removeGraphFromLayout(inserted, 'g1').entries).toEqual([])
  })
})
