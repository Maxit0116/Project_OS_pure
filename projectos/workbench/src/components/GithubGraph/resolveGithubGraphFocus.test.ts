import { describe, expect, it } from 'vitest'
import type { GithubDomainModel } from '@contracts/github-domain'
import {
  resolveFeatureToHistoryFocus,
  resolveHistoryToFeatureFocus,
} from './resolveGithubGraphFocus'

function model(
  overrides: Partial<GithubDomainModel> = {},
): GithubDomainModel {
  return {
    repo: {
      posId: 'repo:acme/demo',
      fullName: 'acme/demo',
      defaultBranch: 'main',
    },
    features: [
      { id: 'feat:auth', title: 'Auth', status: 'active' },
      { id: 'feat:billing', title: 'Billing', status: 'planned' },
    ],
    branches: [
      { name: 'alice/auth', remote: false, deleted: false, headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { name: 'bob/auth', remote: false, deleted: false },
    ],
    commits: [],
    pullRequests: [
      {
        number: 7,
        title: 'Auth PR',
        url: 'https://github.com/acme/demo/pull/7',
        headRef: 'alice/auth',
        baseRef: 'main',
        state: 'open',
      },
    ],
    relations: [],
    ...overrides,
  }
}

describe('resolveFeatureToHistoryFocus', () => {
  it('returns none without associations', () => {
    const result = resolveFeatureToHistoryFocus(model(), 'feat:auth')
    expect(result.kind).toBe('none')
  })

  it('returns one for a single branch', () => {
    const result = resolveFeatureToHistoryFocus(
      model({
        relations: [
          {
            id: 'rel:1',
            kind: 'feature-implemented-by',
            fromType: 'feature',
            fromKey: 'feat:auth',
            toType: 'branch',
            toKey: 'alice/auth',
            source: 'user',
            stale: false,
          },
        ],
      }),
      'feat:auth',
    )
    expect(result).toEqual({
      kind: 'one',
      featureId: 'feat:auth',
      branchRef: 'alice/auth',
      commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })
  })

  it('returns many for multiple associations', () => {
    const result = resolveFeatureToHistoryFocus(
      model({
        relations: [
          {
            id: 'rel:1',
            kind: 'feature-implemented-by',
            fromType: 'feature',
            fromKey: 'feat:auth',
            toType: 'branch',
            toKey: 'alice/auth',
            source: 'user',
            stale: false,
          },
          {
            id: 'rel:2',
            kind: 'feature-implemented-by',
            fromType: 'feature',
            fromKey: 'feat:auth',
            toType: 'branch',
            toKey: 'bob/auth',
            source: 'user',
            stale: false,
          },
        ],
      }),
      'feat:auth',
    )
    expect(result.kind).toBe('many')
    if (result.kind === 'many') {
      expect(result.options).toHaveLength(2)
    }
  })
})

describe('resolveHistoryToFeatureFocus', () => {
  it('returns none when unlinked', () => {
    const result = resolveHistoryToFeatureFocus(model(), {
      branchRef: 'alice/auth',
    })
    expect(result.kind).toBe('none')
  })

  it('returns one feature for a linked branch', () => {
    const result = resolveHistoryToFeatureFocus(
      model({
        relations: [
          {
            id: 'rel:1',
            kind: 'feature-implemented-by',
            fromType: 'feature',
            fromKey: 'feat:auth',
            toType: 'branch',
            toKey: 'alice/auth',
            source: 'user',
            stale: false,
          },
        ],
      }),
      { branchRef: 'alice/auth' },
    )
    expect(result).toEqual({ kind: 'one', featureId: 'feat:auth' })
  })

  it('returns many when a branch maps to multiple features', () => {
    const result = resolveHistoryToFeatureFocus(
      model({
        relations: [
          {
            id: 'rel:1',
            kind: 'feature-implemented-by',
            fromType: 'feature',
            fromKey: 'feat:auth',
            toType: 'branch',
            toKey: 'alice/auth',
            source: 'user',
            stale: false,
          },
          {
            id: 'rel:2',
            kind: 'feature-implemented-by',
            fromType: 'feature',
            fromKey: 'feat:billing',
            toType: 'branch',
            toKey: 'alice/auth',
            source: 'user',
            stale: false,
          },
        ],
      }),
      { branchRef: 'alice/auth' },
    )
    expect(result.kind).toBe('many')
  })
})
