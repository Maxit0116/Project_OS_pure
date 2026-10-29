import { describe, expect, it } from 'vitest'
import {
  buildGithubGraphModel,
  GITHUB_NODE_WIDTH,
  layoutGithubGraphTree,
} from './buildGithubGraphModel'

describe('buildGithubGraphModel', () => {
  it('roots feature branches under default', () => {
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
    expect(
      model.nodes.find((n) => n.id === 'branch:feat/x')?.parentId,
    ).toBe('branch:main')
    expect(model.nodes.some((n) => n.kind === 'pr' && n.prNumber === 7)).toBe(
      true,
    )
  })

  it('layouts a world with width/height and unique node positions', () => {
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
  })
})
