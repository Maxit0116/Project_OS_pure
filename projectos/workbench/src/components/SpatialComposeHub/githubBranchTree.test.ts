import { describe, expect, it } from 'vitest'
import {
  buildGithubBranchTree,
  childrenAtPath,
  filterBranchesByQuery,
} from './githubBranchTree'

describe('githubBranchTree', () => {
  const branches = [
    {
      id: 'branch:main',
      name: 'main',
      current: true,
      remote: false,
    },
    {
      id: 'branch:feat/capture-hub',
      name: 'feat/capture-hub',
      current: false,
      remote: false,
    },
    {
      id: 'branch:feat/mcp',
      name: 'feat/mcp',
      current: false,
      remote: true,
    },
  ]

  it('nests slash segments into folders', () => {
    const tree = buildGithubBranchTree(branches)
    expect(tree.some((n) => n.kind === 'branch' && n.fullName === 'main')).toBe(
      true,
    )
    const feat = tree.find((n) => n.kind === 'folder' && n.name === 'feat')
    expect(feat?.kind).toBe('folder')
    if (feat?.kind !== 'folder') return
    expect(feat.children.map((c) => c.name).sort()).toEqual([
      'capture-hub',
      'mcp',
    ])
  })

  it('filters by query', () => {
    expect(filterBranchesByQuery(branches, 'mcp').map((b) => b.name)).toEqual([
      'feat/mcp',
    ])
  })

  it('resolves children at path', () => {
    const tree = buildGithubBranchTree(branches)
    const kids = childrenAtPath(tree, ['feat'])
    expect(kids.every((k) => k.kind === 'branch')).toBe(true)
  })
})
