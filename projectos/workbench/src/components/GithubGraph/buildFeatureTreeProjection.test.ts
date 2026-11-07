import { describe, expect, it } from 'vitest'
import type { GithubDomainModel } from '@contracts/github-domain'
import {
  buildFeatureTreeProjection,
  featureNodeId,
  layoutFeatureTreeProjection,
} from './buildFeatureTreeProjection'

const base: GithubDomainModel = {
  repo: {
    posId: 'repo:acme/demo',
    fullName: 'acme/demo',
    defaultBranch: 'main',
  },
  features: [
    { id: 'feat:auth', title: 'Auth', status: 'active' },
    {
      id: 'feat:login',
      title: 'Login',
      status: 'planned',
      parentFeatureId: 'feat:auth',
    },
  ],
  branches: [],
  commits: [],
  pullRequests: [],
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
      kind: 'feature-reviewed-by',
      fromType: 'feature',
      fromKey: 'feat:auth',
      toType: 'pr',
      toKey: '12',
      source: 'user',
      stale: false,
    },
  ],
}

describe('buildFeatureTreeProjection', () => {
  it('projects feature hierarchy with association badge counts', () => {
    const model = buildFeatureTreeProjection(base, {
      expandedFeatureIds: ['feat:auth'],
    })
    const auth = model.nodes.find((node) => node.id === featureNodeId('feat:auth'))
    const login = model.nodes.find((node) => node.id === featureNodeId('feat:login'))
    expect(auth?.kind).toBe('feature')
    expect(auth?.ahead).toBe(1)
    expect(auth?.behind).toBe(1)
    expect(login?.parentId).toBe(featureNodeId('feat:auth'))
  })

  it('collapses children when parent is not expanded', () => {
    const model = buildFeatureTreeProjection(base, { expandedFeatureIds: [] })
    expect(
      model.nodes.some((node) => node.id === featureNodeId('feat:login')),
    ).toBe(false)
  })

  it('lays out left-to-right', () => {
    const model = buildFeatureTreeProjection(base, {
      expandedFeatureIds: ['feat:auth'],
    })
    const layout = layoutFeatureTreeProjection(model)
    const auth = layout.nodes.find(
      (item) => item.node.id === featureNodeId('feat:auth'),
    )
    const login = layout.nodes.find(
      (item) => item.node.id === featureNodeId('feat:login'),
    )
    expect(auth && login && login.x > auth.x).toBe(true)
  })
})
