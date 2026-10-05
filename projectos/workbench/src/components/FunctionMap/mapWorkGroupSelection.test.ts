import { describe, expect, it } from 'vitest'

import type { MapArtifact, MapContentDocument } from '@contracts/index'
import {
  buildWorkGroupSelectCandidates,
  filterCandidatesByQuery,
  isMemberCoveredBySelection,
  previewMergeOutcome,
  rankSuggestions,
  resolveSelectedItems,
} from './mapWorkGroupSelection'

const base = {
  scope: 'project' as const,
  position: { x: 0, y: 0 },
  size: { width: 100, height: 100 },
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

function noteArtifact(id: string, title: string, position = { x: 0, y: 0 }): MapArtifact {
  return {
    ...base,
    id,
    type: 'note',
    note: { body: id, title },
    position,
  }
}

const labels = {
  untitled: 'Untitled',
  workgroup: 'WorkGroup',
  memberCount: (count: number) => `${count} members`,
  artifactType: {
    note: 'Note',
    plan: 'Plan',
    acceptance_list: 'Acceptance',
    terminal: 'Terminal',
    image: 'Image',
  },
}

describe('mapWorkGroupSelection', () => {
  const document: MapContentDocument = {
    version: '0.2.0',
    projectId: 'proj_test',
    artifacts: [
      noteArtifact('art_a', 'Alpha', { x: 0, y: 0 }),
      noteArtifact('art_b', 'Beta', { x: 100, y: 0 }),
    ],
    workGroups: [
      {
        id: 'wg_1',
        title: 'Group One',
        memberNodeIds: ['art_a'],
        createdAt: base.createdAt,
        updatedAt: base.updatedAt,
      },
    ],
    workGroupSeq: 1,
  }

  const candidates = buildWorkGroupSelectCandidates(
    document.artifacts,
    document.workGroups,
    labels,
    (artifactId) => {
      const artifact = document.artifacts.find((item) => item.id === artifactId)
      return artifact?.type === 'note' ? artifact.note.title ?? 'Untitled' : 'Untitled'
    },
  )

  it('builds workgroup and member candidates', () => {
    expect(candidates.some((item) => item.key === 'workgroup:wg_1')).toBe(true)
    expect(candidates.some((item) => item.key === 'member:art_b')).toBe(true)
  })

  it('filters and ranks suggestions by query', () => {
    const filtered = filterCandidatesByQuery(candidates, 'alp')
    expect(filtered.some((item) => item.title === 'Alpha')).toBe(true)
    const suggestions = rankSuggestions(candidates, 'bet')
    expect(suggestions[0]?.title).toBe('Beta')
  })

  it('marks members covered by a selected workgroup as disabled', () => {
    const selected = new Set(['workgroup:wg_1'])
    expect(isMemberCoveredBySelection('art_a', selected, candidates)).toBe(true)
    expect(isMemberCoveredBySelection('art_b', selected, candidates)).toBe(false)
  })

  it('resolves selected items for mutation payload', () => {
    const selected = new Set(['workgroup:wg_1', 'member:art_b'])
    const items = resolveSelectedItems(candidates, selected)
    expect(items).toEqual([
      { kind: 'workgroup', workGroupId: 'wg_1' },
      { kind: 'member', memberNodeId: 'art_b' },
    ])
  })

  it('previews merge outcome and layout validity', () => {
    const adjacent = previewMergeOutcome(document, [
      { kind: 'workgroup', workGroupId: 'wg_1' },
      { kind: 'member', memberNodeId: 'art_b' },
    ])
    expect(adjacent.effectiveMemberCount).toBe(2)
    expect(adjacent.layoutValid).toBe(true)
    expect(adjacent.willCreateNew).toBe(false)

    const separated = previewMergeOutcome(
      {
        ...document,
        artifacts: [
          noteArtifact('art_a', 'Alpha', { x: 0, y: 0 }),
          noteArtifact('art_c', 'Gamma', { x: 500, y: 0 }),
        ],
      },
      [
        { kind: 'member', memberNodeId: 'art_a' },
        { kind: 'member', memberNodeId: 'art_c' },
      ],
    )
    expect(separated.layoutValid).toBe(false)
    expect(separated.willRearrange).toBe(true)
  })
})
