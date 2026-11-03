import { describe, expect, it } from 'vitest'
import type { ChatSessionHead } from '@contracts/index'
import {
  createRailFolder,
  insertGraphOnRail,
  moveFolderIntoFolder,
  moveGraphIntoFolder,
  removeGraphFromLayout,
  renameRailFolder,
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
        version: 3,
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
    const created = createRailFolder(
      { version: 3, entries: [{ kind: 'graph', graphId: 'g1' }] },
      'Auth',
    )
    const layout = moveGraphIntoFolder(created.layout, 'g1', created.folderId)
    expect(layout.entries).toHaveLength(1)
    expect(layout.entries[0]).toMatchObject({
      kind: 'folder',
      children: [{ kind: 'graph', graphId: 'g1' }],
    })
  })

  it('nests folders and rejects cycles', () => {
    const a = createRailFolder({ version: 3, entries: [] }, 'A')
    const b = createRailFolder(a.layout, 'B')
    const nested = moveFolderIntoFolder(b.layout, b.folderId, a.folderId)
    expect(nested.entries).toHaveLength(1)
    expect(nested.entries[0]).toMatchObject({
      kind: 'folder',
      id: a.folderId,
      children: [{ kind: 'folder', id: b.folderId }],
    })
    const blocked = moveFolderIntoFolder(nested, a.folderId, b.folderId)
    expect(blocked).toEqual(nested)
  })

  it('inserts and removes graph entries', () => {
    const inserted = insertGraphOnRail({ version: 3, entries: [] }, 'g1')
    expect(inserted.entries).toEqual([{ kind: 'graph', graphId: 'g1' }])
    expect(removeGraphFromLayout(inserted, 'g1').entries).toEqual([])
  })

  it('renames a folder', () => {
    const created = createRailFolder({ version: 3, entries: [] }, 'Old')
    const renamed = renameRailFolder(created.layout, created.folderId, 'New')
    expect(renamed.entries[0]).toMatchObject({ kind: 'folder', title: 'New' })
  })
})
