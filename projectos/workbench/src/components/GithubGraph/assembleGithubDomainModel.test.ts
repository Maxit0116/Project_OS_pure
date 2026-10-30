import { describe, expect, it } from 'vitest'
import { assembleGithubDomainModel } from './assembleGithubDomainModel'
import { layoutGithubCommitDag } from './layoutGithubCommitDag'

describe('assembleGithubDomainModel', () => {
  it('emits commit-parent relations from real parent SHAs', () => {
    const a = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const b = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const model = assembleGithubDomainModel({
      repoLabel: 'acme/demo',
      defaultBranch: 'main',
      branches: [
        { id: 'branch:main', name: 'main', current: true, remote: false },
      ],
      commits: [
        { sha: a, parentShas: [], message: 'init' },
        { sha: b, parentShas: [a], message: 'feat' },
      ],
    })
    expect(model.commits).toHaveLength(2)
    expect(
      model.relations.some(
        (rel) =>
          rel.kind === 'commit-parent' &&
          rel.fromKey === b &&
          rel.toKey === a &&
          rel.source === 'git',
      ),
    ).toBe(true)
  })
})

describe('layoutGithubCommitDag', () => {
  it('places children to the right of parents', () => {
    const a = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const b = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const layout = layoutGithubCommitDag([
      { sha: a, parentShas: [], message: 'init' },
      { sha: b, parentShas: [a], message: 'feat' },
    ])
    const root = layout.nodes.find((node) => node.sha === a)
    const child = layout.nodes.find((node) => node.sha === b)
    expect(root && child && child.x > root.x).toBe(true)
  })
})
