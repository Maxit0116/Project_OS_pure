import { describe, expect, it } from 'vitest'
import type { DiagramArtifactMeta } from '@contracts/index'
import {
  createDiagramRailFolder,
  moveDiagramFolderIntoFolder,
  moveDiagramIntoFolder,
  removeDiagramFromLayout,
  syncRailLayoutWithDiagrams,
} from './diagramGraphRailLayout'

const now = '2026-08-02T00:00:00.000Z'

function meta(
  partial: Partial<DiagramArtifactMeta> & Pick<DiagramArtifactMeta, 'id'>,
): DiagramArtifactMeta {
  return {
    title: partial.title ?? partial.id,
    visualType: partial.visualType ?? 'architecture',
    prompt: partial.prompt ?? 'prompt',
    createdAt: partial.createdAt ?? now,
    htmlRelPath: partial.htmlRelPath ?? `.projectos/diagrams/${partial.id}.html`,
    sourceSessionId: partial.sourceSessionId ?? null,
    ...partial,
  }
}

describe('diagramGraphRailLayout', () => {
  it('syncs missing diagrams onto the rail and prunes gone ones', () => {
    const synced = syncRailLayoutWithDiagrams(
      {
        version: 2,
        entries: [
          { kind: 'diagram', diagramId: 'gone' },
          { kind: 'diagram', diagramId: 'd1' },
        ],
      },
      [meta({ id: 'd1' }), meta({ id: 'd2', createdAt: '2026-08-03T00:00:00.000Z' })],
    )
    expect(synced.entries.map((e) => (e.kind === 'diagram' ? e.diagramId : e.id))).toEqual([
      'd1',
      'd2',
    ])
  })

  it('moves a diagram into a folder and removes the top-level entry', () => {
    const created = createDiagramRailFolder(
      { version: 2, entries: [{ kind: 'diagram', diagramId: 'd1' }] },
      'Auth',
    )
    const layout = moveDiagramIntoFolder(created.layout, 'd1', created.folderId)
    expect(layout.entries).toHaveLength(1)
    expect(layout.entries[0]).toMatchObject({
      kind: 'folder',
      children: [{ kind: 'diagram', diagramId: 'd1' }],
    })
  })

  it('nests folders and rejects cycles', () => {
    const a = createDiagramRailFolder({ version: 2, entries: [] }, 'A')
    const b = createDiagramRailFolder(a.layout, 'B')
    const nested = moveDiagramFolderIntoFolder(b.layout, b.folderId, a.folderId)
    expect(nested.entries).toHaveLength(1)
    expect(nested.entries[0]).toMatchObject({
      kind: 'folder',
      id: a.folderId,
      children: [{ kind: 'folder', id: b.folderId }],
    })
    expect(moveDiagramFolderIntoFolder(nested, a.folderId, b.folderId)).toEqual(nested)
  })

  it('removes diagram entries from folders and top level', () => {
    const created = createDiagramRailFolder(
      { version: 2, entries: [{ kind: 'diagram', diagramId: 'd1' }] },
      'Auth',
    )
    const nested = moveDiagramIntoFolder(created.layout, 'd1', created.folderId)
    expect(removeDiagramFromLayout(nested, 'd1').entries).toEqual([
      { kind: 'folder', id: created.folderId, title: 'Auth', children: [] },
    ])
  })
})
