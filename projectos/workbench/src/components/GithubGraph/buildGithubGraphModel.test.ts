import { describe, expect, it } from 'vitest'
import {
  buildGithubGraphModel,
  composeChildBranchName,
  githubGroupId,
  GITHUB_NODE_WIDTH,
  layoutGithubGraphTree,
  resolveCreateFromTip,
} from './buildGithubGraphModel'
import type { GithubGraphNode } from '@contracts/github-graph'

describe('composeChildBranchName', () => {
  it('composes under a group path', () => {
    const group: GithubGraphNode = {
      id: 'group:alice/auth',
      kind: 'group',
      name: 'auth',
      parentId: 'group:alice',
      current: false,
      remote: false,
      pending: false,
    }
    expect(composeChildBranchName(group, 'login')).toBe('alice/auth/login')
  })

  it('composes under a real branch as parent tip', () => {
    const branch: GithubGraphNode = {
      id: 'branch:alice/auth/login',
      kind: 'branch',
      name: 'alice/auth/login',
      parentId: 'group:alice/auth',
      current: false,
      remote: false,
      pending: false,
    }
    expect(composeChildBranchName(branch, 'hotfix')).toBe(
      'alice/auth/login/hotfix',
    )
  })

  it('keeps short name under default', () => {
    const root: GithubGraphNode = {
      id: 'branch:main',
      kind: 'default',
      name: 'main',
      parentId: null,
      current: true,
      remote: false,
      pending: false,
    }
    expect(composeChildBranchName(root, 'backend')).toBe('backend')
  })
})

describe('buildGithubGraphModel', () => {
  it('partitions slash paths into group → branch under default', () => {
    const model = buildGithubGraphModel({
      repoLabel: 'demo',
      defaultBranch: 'main',
      currentBranch: 'feat/x',
      dirty: false,
      branches: [
        { id: 'branch:main', name: 'main', current: false, remote: false },
        { id: 'branch:feat/x', name: 'feat/x', current: true, remote: false },
      ],
      pullRequests: [
        {
          number: 7,
          title: 'Add x',
          url: 'https://github.com/o/r/pull/7',
          headRef: 'feat/x',
          baseRef: 'main',
          state: 'open',
        },
      ],
    })
    expect(model.nodes.find((n) => n.kind === 'default')?.name).toBe('main')
    expect(model.nodes.find((n) => n.id === githubGroupId('feat'))).toMatchObject({
      kind: 'group',
      name: 'feat',
      parentId: 'branch:main',
    })
    expect(
      model.nodes.find((n) => n.id === 'branch:feat/x')?.parentId,
    ).toBe(githubGroupId('feat'))
    const pr = model.nodes.find((n) => n.kind === 'pr' && n.prNumber === 7)
    expect(pr?.parentId).toBe('branch:feat/x')
  })

  it('hangs child feature under parent branch tip when both exist', () => {
    const model = buildGithubGraphModel({
      repoLabel: 'demo',
      defaultBranch: 'main',
      currentBranch: 'alice/auth/login/hotfix',
      dirty: false,
      branches: [
        { id: 'branch:main', name: 'main', current: false, remote: false },
        {
          id: 'branch:alice/auth/login',
          name: 'alice/auth/login',
          current: false,
          remote: false,
        },
        {
          id: 'branch:alice/auth/login/hotfix',
          name: 'alice/auth/login/hotfix',
          current: true,
          remote: false,
        },
      ],
    })
    expect(
      model.nodes.find((n) => n.id === 'branch:alice/auth/login')?.parentId,
    ).toBe(githubGroupId('alice/auth'))
    expect(
      model.nodes.find((n) => n.id === 'branch:alice/auth/login/hotfix')
        ?.parentId,
    ).toBe('branch:alice/auth/login')
  })

  it('honors explicit parentByBranchName overrides', () => {
    const model = buildGithubGraphModel({
      repoLabel: 'demo',
      defaultBranch: 'main',
      currentBranch: 'main',
      dirty: false,
      branches: [
        { id: 'branch:main', name: 'main', current: true, remote: false },
        {
          id: 'branch:alice/auth/login',
          name: 'alice/auth/login',
          current: false,
          remote: false,
        },
        {
          id: 'branch:alice/auth/login/hotfix',
          name: 'alice/auth/login/hotfix',
          current: false,
          remote: false,
        },
      ],
      parentByBranchName: {
        'alice/auth/login/hotfix': 'branch:alice/auth/login',
      },
    })
    expect(
      model.nodes.find((n) => n.id === 'branch:alice/auth/login/hotfix')
        ?.parentId,
    ).toBe('branch:alice/auth/login')
  })

  it('builds person → module → feature chains', () => {
    const model = buildGithubGraphModel({
      repoLabel: 'demo',
      defaultBranch: 'main',
      currentBranch: 'alice/auth/login',
      dirty: false,
      branches: [
        { id: 'branch:main', name: 'main', current: false, remote: false },
        {
          id: 'branch:alice/auth/login',
          name: 'alice/auth/login',
          current: true,
          remote: false,
        },
      ],
    })
    expect(model.nodes.find((n) => n.id === githubGroupId('alice'))).toMatchObject({
      kind: 'group',
      parentId: 'branch:main',
    })
    expect(
      model.nodes.find((n) => n.id === githubGroupId('alice/auth')),
    ).toMatchObject({
      kind: 'group',
      name: 'auth',
      parentId: githubGroupId('alice'),
    })
    expect(
      model.nodes.find((n) => n.id === 'branch:alice/auth/login')?.parentId,
    ).toBe(githubGroupId('alice/auth'))
  })

  it('shares group nodes for a common path prefix', () => {
    const model = buildGithubGraphModel({
      repoLabel: 'demo',
      defaultBranch: 'main',
      currentBranch: 'main',
      dirty: false,
      branches: [
        { id: 'branch:main', name: 'main', current: true, remote: false },
        {
          id: 'branch:alice/auth/login',
          name: 'alice/auth/login',
          current: false,
          remote: false,
        },
        {
          id: 'branch:alice/auth/logout',
          name: 'alice/auth/logout',
          current: false,
          remote: false,
        },
      ],
    })
    expect(
      model.nodes.filter((n) => n.id === githubGroupId('alice')),
    ).toHaveLength(1)
    expect(
      model.nodes.filter((n) => n.id === githubGroupId('alice/auth')),
    ).toHaveLength(1)
  })

  it('parents flat branch names under default', () => {
    const model = buildGithubGraphModel({
      repoLabel: 'couple_recording',
      defaultBranch: 'main',
      currentBranch: 'main',
      dirty: false,
      branches: [
        { id: 'branch:main', name: 'main', current: true, remote: false },
        { id: 'branch:backend', name: 'backend', current: false, remote: true },
        { id: 'branch:frontend', name: 'frontend', current: false, remote: true },
      ],
    })
    expect(model.nodes.find((n) => n.name === 'backend')).toMatchObject({
      remote: true,
      parentId: 'branch:main',
      kind: 'branch',
    })
    expect(model.nodes.every((n) => n.kind !== 'group')).toBe(true)
  })

  it('passes pending through for in-flight create/push nodes', () => {
    const model = buildGithubGraphModel({
      repoLabel: 'demo',
      defaultBranch: 'main',
      currentBranch: 'main',
      dirty: false,
      branches: [
        { id: 'branch:main', name: 'main', current: true, remote: false },
        {
          id: 'branch:feat/new',
          name: 'feat/new',
          current: false,
          remote: false,
          pending: true,
        },
      ],
    })
    expect(model.nodes.find((n) => n.name === 'feat/new')?.pending).toBe(true)
  })

  it('layouts left-to-right with children deeper on x', () => {
    const model = buildGithubGraphModel({
      repoLabel: 'demo',
      defaultBranch: 'main',
      currentBranch: 'main',
      dirty: false,
      branches: [
        { id: 'branch:main', name: 'main', current: true, remote: false },
        { id: 'branch:a', name: 'a', current: false, remote: false },
        { id: 'branch:b', name: 'b', current: false, remote: false },
      ],
    })
    const layout = layoutGithubGraphTree(model)
    expect(layout.nodes.length).toBe(model.nodes.length)
    expect(new Set(layout.nodes.map((n) => n.node.id)).size).toBe(
      model.nodes.length,
    )
    expect(layout.width).toBeGreaterThan(GITHUB_NODE_WIDTH)
    expect(layout.height).toBeGreaterThan(0)
    const root = layout.nodes.find((n) => n.node.kind === 'default')
    const child = layout.nodes.find((n) => n.node.name === 'a')
    expect(root && child && child.x > root.x).toBe(true)
  })
})

describe('resolveCreateFromTip', () => {
  it('uses branch tip when creating from a branch', () => {
    const branch: GithubGraphNode = {
      id: 'branch:alice/auth/login',
      kind: 'branch',
      name: 'alice/auth/login',
      parentId: 'group:alice/auth',
      current: false,
      remote: false,
      pending: false,
    }
    expect(
      resolveCreateFromTip(branch, 'main', [
        { name: 'alice/auth/login', current: false },
      ]),
    ).toBe('alice/auth/login')
  })

  it('picks deepest branch under a group path', () => {
    const group: GithubGraphNode = {
      id: 'group:alice/auth',
      kind: 'group',
      name: 'auth',
      parentId: 'group:alice',
      current: false,
      remote: false,
      pending: false,
    }
    expect(
      resolveCreateFromTip(group, 'main', [
        { name: 'alice/auth/login', current: false },
        { name: 'alice/auth/login/hotfix', current: false },
      ]),
    ).toBe('alice/auth/login/hotfix')
  })
})
