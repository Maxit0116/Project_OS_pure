import type { GithubCommit } from '@contracts/github-domain'
import {
  GITHUB_LAYOUT_PAD,
  GITHUB_NODE_GAP_X,
  GITHUB_NODE_GAP_Y,
  GITHUB_NODE_HEIGHT,
  GITHUB_NODE_WIDTH,
} from './buildGithubGraphModel'

export interface LaidOutCommitNode {
  sha: string
  message: string
  parentShas: string[]
  x: number
  y: number
  depth: number
}

export interface GithubCommitDagLayout {
  nodes: LaidOutCommitNode[]
  width: number
  height: number
}

/**
 * Simple layered DAG: depth = longest distance from a root (no parents in set).
 * Children fan vertically. Good enough for M1; ELK can replace later.
 */
export function layoutGithubCommitDag(
  commits: readonly GithubCommit[],
): GithubCommitDagLayout {
  if (commits.length === 0) {
    return { nodes: [], width: 400, height: 240 }
  }

  const bySha = new Map(commits.map((commit) => [commit.sha, commit]))
  const depthMemo = new Map<string, number>()

  function depthOf(sha: string, stack: Set<string>): number {
    const cached = depthMemo.get(sha)
    if (cached !== undefined) return cached
    if (stack.has(sha)) return 0
    stack.add(sha)
    const commit = bySha.get(sha)
    const parents = (commit?.parentShas ?? []).filter((parent) =>
      bySha.has(parent),
    )
    const depth =
      parents.length === 0
        ? 0
        : 1 + Math.max(...parents.map((parent) => depthOf(parent, stack)))
    stack.delete(sha)
    depthMemo.set(sha, depth)
    return depth
  }

  for (const commit of commits) depthOf(commit.sha, new Set())

  const byDepth = new Map<number, GithubCommit[]>()
  for (const commit of commits) {
    const depth = depthMemo.get(commit.sha) ?? 0
    const list = byDepth.get(depth) ?? []
    list.push(commit)
    byDepth.set(depth, list)
  }

  const colPitch = GITHUB_NODE_WIDTH + GITHUB_NODE_GAP_X
  const rowPitch = GITHUB_NODE_HEIGHT + GITHUB_NODE_GAP_Y
  const nodes: LaidOutCommitNode[] = []

  const depths = [...byDepth.keys()].sort((a, b) => a - b)
  for (const depth of depths) {
    const column = byDepth.get(depth) ?? []
    column.forEach((commit, index) => {
      nodes.push({
        sha: commit.sha,
        message: commit.message.split('\n')[0] ?? commit.message,
        parentShas: commit.parentShas,
        x: GITHUB_LAYOUT_PAD + depth * colPitch,
        y: GITHUB_LAYOUT_PAD + index * rowPitch,
        depth,
      })
    })
  }

  const width =
    Math.max(
      GITHUB_LAYOUT_PAD * 2 + GITHUB_NODE_WIDTH,
      ...nodes.map((node) => node.x + GITHUB_NODE_WIDTH + GITHUB_LAYOUT_PAD),
    ) || 800
  const height =
    Math.max(
      GITHUB_LAYOUT_PAD * 2 + GITHUB_NODE_HEIGHT,
      ...nodes.map((node) => node.y + GITHUB_NODE_HEIGHT + GITHUB_LAYOUT_PAD),
    ) || 480

  return { nodes, width, height }
}
