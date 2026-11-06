import { describe, expect, it } from 'vitest'
import { commitsQueryFromScope } from './commitsQueryFromScope'

describe('commitsQueryFromScope', () => {
  it('uses tips for commit-cap window', () => {
    expect(
      commitsQueryFromScope(
        {
          sourceKind: 'branch',
          sourceId: 'branch:dev',
          branchRefs: ['dev'],
          window: { kind: 'commit-cap', commitCap: 200 },
          firstParentOnly: false,
          returnMode: 'partition',
        },
        'main',
      ),
    ).toEqual({
      limit: 200,
      tips: ['dev'],
      firstParentOnly: undefined,
    })
  })

  it('uses range for PR scopes', () => {
    expect(
      commitsQueryFromScope(
        {
          sourceKind: 'pr',
          sourceId: 'pr:1',
          branchRefs: ['feat'],
          prNumber: 1,
          prBaseRef: 'main',
          prHeadRef: 'feat',
          window: { kind: 'commit-cap', commitCap: 100 },
          firstParentOnly: true,
          returnMode: 'partition',
        },
        'main',
      ),
    ).toMatchObject({
      limit: 100,
      range: { base: 'main', head: 'feat' },
      firstParentOnly: true,
    })
  })

  it('maps since-fork to sinceForkBase', () => {
    expect(
      commitsQueryFromScope(
        {
          sourceKind: 'branch',
          sourceId: 'branch:dev',
          branchRefs: ['dev'],
          window: { kind: 'since-fork', commitCap: 200 },
          firstParentOnly: false,
          returnMode: 'partition',
        },
        'main',
      ),
    ).toMatchObject({
      tips: ['dev'],
      sinceForkBase: 'main',
    })
  })
})
