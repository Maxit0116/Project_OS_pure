import { describe, expect, it } from 'vitest'
import type { GithubDomainModel } from '../../../../contracts/github-domain.js'
import {
  resolveDefaultRepoHistoryScope,
  resolveGithubHistoryScope,
} from './resolveGithubHistoryScope'

const sha = (n: number) => n.toString(16).padStart(40, '0')

function model(overrides?: Partial<GithubDomainModel>): GithubDomainModel {
  return {
    repo: {
      posId: 'repo:demo',
      fullName: 'acme/demo',
      defaultBranch: 'main',
    },
    features: [
      {
        id: 'feat:auth',
        title: 'Auth',
        status: 'active',
      },
    ],
    branches: [
      { name: 'main', remote: false, headSha: sha(1), deleted: false },
      { name: 'alice/auth', remote: false, headSha: sha(2), deleted: false },
      { name: 'alice/ui', remote: false, headSha: sha(3), deleted: false },
    ],
    commits: [],
    pullRequests: [
      {
        number: 12,
        title: 'Auth PR',
        url: 'https://example.com/pr/12',
        headRef: 'alice/auth',
        baseRef: 'main',
        state: 'open',
        headSha: sha(2),
      },
    ],
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
        toKey: 'alice/ui',
        source: 'user',
        stale: false,
      },
    ],
    ...overrides,
  }
}

describe('resolveGithubHistoryScope', () => {
  it('scopes a branch node to that tip', () => {
    const scope = resolveGithubHistoryScope({
      node: {
        id: 'branch:alice/auth',
        kind: 'branch',
        name: 'alice/auth',
        current: false,
        remote: false,
        pending: false,
      },
      model: model(),
      returnMode: 'partition',
    })
    expect(scope.branchRefs).toEqual(['alice/auth'])
    expect(scope.emptyReason).toBeUndefined()
    expect(scope.returnMode).toBe('partition')
  })

  it('unions feature-associated branches (F1)', () => {
    const scope = resolveGithubHistoryScope({
      node: {
        id: 'feature:feat:auth',
        kind: 'feature',
        name: 'Auth',
        current: false,
        remote: false,
        pending: false,
      },
      model: model(),
      returnMode: 'feature-tree',
    })
    expect(scope.branchRefs.sort()).toEqual(['alice/auth', 'alice/ui'].sort())
    expect(scope.highlightFeatureId).toBe('feat:auth')
    expect(scope.highlightBranchRefs?.sort()).toEqual(
      ['alice/auth', 'alice/ui'].sort(),
    )
  })

  it('returns empty association for unbound feature', () => {
    const scope = resolveGithubHistoryScope({
      node: {
        id: 'feature:feat:orphan',
        kind: 'feature',
        name: 'Orphan',
        current: false,
        remote: false,
        pending: false,
      },
      model: model({
        features: [{ id: 'feat:orphan', title: 'Orphan', status: 'planned' }],
        relations: [],
      }),
      returnMode: 'feature-tree',
    })
    expect(scope.branchRefs).toEqual([])
    expect(scope.emptyReason).toBe('no-association')
  })

  it('scopes PR to base/head', () => {
    const scope = resolveGithubHistoryScope({
      node: {
        id: 'pr:12',
        kind: 'pr',
        name: 'Auth PR',
        current: false,
        remote: false,
        pending: false,
        prNumber: 12,
      },
      model: model(),
      returnMode: 'partition',
    })
    expect(scope.prNumber).toBe(12)
    expect(scope.prBaseRef).toBe('main')
    expect(scope.prHeadRef).toBe('alice/auth')
  })

  it('scopes group to path prefixes', () => {
    const scope = resolveGithubHistoryScope({
      node: {
        id: 'group:alice',
        kind: 'group',
        name: 'alice',
        current: false,
        remote: false,
        pending: false,
      },
      model: model(),
      returnMode: 'partition',
    })
    expect(scope.branchRefs.sort()).toEqual(['alice/auth', 'alice/ui'].sort())
  })
})

describe('resolveDefaultRepoHistoryScope', () => {
  it('includes default + open PR heads', () => {
    const scope = resolveDefaultRepoHistoryScope(model(), 'partition')
    expect(scope.branchRefs).toContain('main')
    expect(scope.branchRefs).toContain('alice/auth')
  })
})
