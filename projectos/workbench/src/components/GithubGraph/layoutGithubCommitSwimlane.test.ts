import { describe, expect, it } from 'vitest'
import {
  filterFirstParentCommits,
  layoutGithubCommitSwimlane,
} from './layoutGithubCommitSwimlane'

describe('layoutGithubCommitSwimlane', () => {
  it('places a linear history on one lane', () => {
    const layout = layoutGithubCommitSwimlane([
      { id: 'c', parentIds: ['b'] },
      { id: 'b', parentIds: ['a'] },
      { id: 'a', parentIds: [] },
    ])
    expect(layout.laneCount).toBe(1)
    expect(layout.rows.map((row) => row.lane)).toEqual([0, 0, 0])
  })

  it('opens a side lane for a merge parent', () => {
    // newest-first: merge M of (b, s), then b, s, then base a
    const layout = layoutGithubCommitSwimlane([
      { id: 'm', parentIds: ['b', 's'] },
      { id: 'b', parentIds: ['a'] },
      { id: 's', parentIds: ['a'] },
      { id: 'a', parentIds: [] },
    ])
    expect(layout.rows[0]?.isMerge).toBe(true)
    expect(layout.laneCount).toBeGreaterThanOrEqual(2)
    const merge = layout.rows[0]
    expect(merge?.parentLanes.length).toBe(2)
  })

  it('keeps WIP on lane 0 without consuming parents', () => {
    const layout = layoutGithubCommitSwimlane([
      { id: 'wip', parentIds: [], wip: true },
      { id: 'c', parentIds: ['a'] },
      { id: 'a', parentIds: [] },
    ])
    expect(layout.rows[0]?.wip).toBe(true)
    expect(layout.rows[0]?.lane).toBe(0)
  })
})

describe('filterFirstParentCommits', () => {
  it('walks only first parents from tips', () => {
    const filtered = filterFirstParentCommits(
      [
        { id: 'm', parentIds: ['b', 's'] },
        { id: 'b', parentIds: ['a'] },
        { id: 's', parentIds: ['a'] },
        { id: 'a', parentIds: [] },
      ],
      ['m'],
    )
    expect(filtered.map((row) => row.id)).toEqual(['m', 'b', 'a'])
    expect(filtered.find((row) => row.id === 'm')?.parentIds).toEqual(['b'])
  })
})
