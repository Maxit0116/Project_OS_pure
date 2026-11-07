import { describe, expect, it } from 'vitest'
import type { LoopGraphHead } from '@contracts/index'
import {
  createLoopRailFolder,
  moveLoopFolderIntoFolder,
  moveLoopIntoFolder,
  removeLoopFromLayout,
  syncRailLayoutWithLoops,
} from './loopGraphRailLayout'

const now = '2026-08-02T00:00:00.000Z'

function head(partial: Partial<LoopGraphHead> & Pick<LoopGraphHead, 'id'>): LoopGraphHead {
  return {
    title: partial.title ?? partial.id,
    status: partial.status ?? 'draft',
    linkedSessionIds: [],
    draftRevision: partial.draftRevision ?? 0,
    createdAt: now,
    updatedAt: partial.updatedAt ?? now,
    ...partial,
  }
}

describe('loopGraphRailLayout', () => {
  it('syncs missing loops onto the rail and prunes gone ones', () => {
    const synced = syncRailLayoutWithLoops(
      {
        version: 2,
        entries: [
          { kind: 'loop', loopId: 'gone' },
          { kind: 'loop', loopId: 'loop_1' },
        ],
      },
      [head({ id: 'loop_1' }), head({ id: 'loop_2', updatedAt: '2026-08-03T00:00:00.000Z' })],
    )
    expect(synced.entries.map((e) => (e.kind === 'loop' ? e.loopId : e.id))).toEqual([
      'loop_1',
      'loop_2',
    ])
  })

  it('moves a loop into a folder and removes the top-level entry', () => {
    const created = createLoopRailFolder(
      { version: 2, entries: [{ kind: 'loop', loopId: 'loop_1' }] },
      'Auth',
    )
    const layout = moveLoopIntoFolder(created.layout, 'loop_1', created.folderId)
    expect(layout.entries).toHaveLength(1)
    expect(layout.entries[0]).toMatchObject({
      kind: 'folder',
      children: [{ kind: 'loop', loopId: 'loop_1' }],
    })
  })

  it('nests folders and rejects cycles', () => {
    const a = createLoopRailFolder({ version: 2, entries: [] }, 'A')
    const b = createLoopRailFolder(a.layout, 'B')
    const nested = moveLoopFolderIntoFolder(b.layout, b.folderId, a.folderId)
    expect(nested.entries).toHaveLength(1)
    expect(nested.entries[0]).toMatchObject({
      kind: 'folder',
      id: a.folderId,
      children: [{ kind: 'folder', id: b.folderId }],
    })
    expect(moveLoopFolderIntoFolder(nested, a.folderId, b.folderId)).toEqual(nested)
  })

  it('removes loop entries from folders and top level', () => {
    const created = createLoopRailFolder(
      { version: 2, entries: [{ kind: 'loop', loopId: 'loop_1' }] },
      'Auth',
    )
    const nested = moveLoopIntoFolder(created.layout, 'loop_1', created.folderId)
    expect(removeLoopFromLayout(nested, 'loop_1').entries).toEqual([
      { kind: 'folder', id: created.folderId, title: 'Auth', children: [] },
    ])
  })
})
