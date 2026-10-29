import type { GithubGraphModel, GithubGraphNode } from '@contracts/github-graph'
import type { WorkspaceGitBranch } from '@contracts/workspace-git'
import type { WorkspaceGitPullRequest } from '@contracts/workspace-git'

export const GITHUB_NODE_WIDTH = 200
export const GITHUB_NODE_HEIGHT = 64
export const GITHUB_NODE_GAP_X = 48
export const GITHUB_NODE_GAP_Y = 72
export const GITHUB_LAYOUT_PAD = 48

export interface BuildGithubGraphInput {
  repoLabel: string
  defaultBranch: string | null
  currentBranch: string | null
  remoteUrl?: string
  dirty: boolean
  branches: readonly WorkspaceGitBranch[]
  pullRequests?: readonly WorkspaceGitPullRequest[]
  worktrees?: readonly { id: string; branch?: string | null }[]
}

/** Partition tree: default root → feature branches; PR / worktree as children. */
export function buildGithubGraphModel(
  input: BuildGithubGraphInput,
): GithubGraphModel {
  const defaultBranch = input.defaultBranch ?? 'main'
  const defaultId = `branch:${defaultBranch}`
  const nodes: GithubGraphNode[] = [
    {
      id: defaultId,
      kind: 'default',
      name: defaultBranch,
      parentId: null,
      current: input.currentBranch === defaultBranch,
    },
  ]

  const seen = new Set<string>([defaultId])

  for (const branch of input.branches) {
    if (branch.name === defaultBranch) {
      const root = nodes[0]!
      root.current = branch.current || root.current
      if (branch.ahead !== undefined) root.ahead = branch.ahead
      if (branch.behind !== undefined) root.behind = branch.behind
      continue
    }
    if (seen.has(branch.id)) continue
    seen.add(branch.id)
    nodes.push({
      id: branch.id,
      kind: 'branch',
      name: branch.name,
      parentId: defaultId,
      current: branch.current,
      ...(branch.ahead !== undefined ? { ahead: branch.ahead } : {}),
      ...(branch.behind !== undefined ? { behind: branch.behind } : {}),
    })
  }

  for (const pr of input.pullRequests ?? []) {
    const headId = `branch:${pr.headRef}`
    if (!seen.has(headId)) {
      seen.add(headId)
      nodes.push({
        id: headId,
        kind: 'branch',
        name: pr.headRef,
        parentId: defaultId,
        current: input.currentBranch === pr.headRef,
      })
    }
    const prId = `pr:${pr.number}`
    nodes.push({
      id: prId,
      kind: 'pr',
      name: `#${pr.number} ${pr.title}`,
      parentId: headId,
      current: false,
      prNumber: pr.number,
      prUrl: pr.url,
    })
  }

  for (const worktree of input.worktrees ?? []) {
    const parentId = worktree.branch
      ? `branch:${worktree.branch}`
      : defaultId
    if (worktree.branch && !seen.has(parentId)) {
      seen.add(parentId)
      nodes.push({
        id: parentId,
        kind: 'branch',
        name: worktree.branch,
        parentId: defaultId,
        current: false,
      })
    }
    nodes.push({
      id: `worktree:${worktree.id}`,
      kind: 'worktree',
      name: worktree.id,
      parentId: seen.has(parentId) ? parentId : defaultId,
      current: false,
      worktreeId: worktree.id,
    })
  }

  return {
    repoLabel: input.repoLabel,
    defaultBranch,
    currentBranch: input.currentBranch,
    ...(input.remoteUrl ? { remoteUrl: input.remoteUrl } : {}),
    dirty: input.dirty,
    nodes,
  }
}

export interface LaidOutGithubNode {
  node: GithubGraphNode
  x: number
  y: number
  depth: number
}

export interface GithubGraphLayout {
  nodes: LaidOutGithubNode[]
  width: number
  height: number
}

/** Top-down tree layout aligned to Session/Loop world coordinates. */
export function layoutGithubGraphTree(
  model: GithubGraphModel,
): GithubGraphLayout {
  const byParent = new Map<string | null, GithubGraphNode[]>()
  for (const node of model.nodes) {
    const key = node.parentId ?? null
    const list = byParent.get(key) ?? []
    list.push(node)
    byParent.set(key, list)
  }

  const laid: LaidOutGithubNode[] = []
  let leafIndex = 0
  const colPitch = GITHUB_NODE_WIDTH + GITHUB_NODE_GAP_X
  const rowPitch = GITHUB_NODE_HEIGHT + GITHUB_NODE_GAP_Y

  function walk(node: GithubGraphNode, depth: number) {
    const children = byParent.get(node.id) ?? []
    if (children.length === 0) {
      laid.push({
        node,
        x: GITHUB_LAYOUT_PAD + leafIndex * colPitch,
        y: GITHUB_LAYOUT_PAD + depth * rowPitch,
        depth,
      })
      leafIndex += 1
      return
    }
    const before = leafIndex
    for (const child of children) walk(child, depth + 1)
    const after = leafIndex
    const mid =
      before === after
        ? leafIndex
        : (before + after - 1) / 2
    laid.push({
      node,
      x: GITHUB_LAYOUT_PAD + mid * colPitch,
      y: GITHUB_LAYOUT_PAD + depth * rowPitch,
      depth,
    })
  }

  const roots = byParent.get(null) ?? model.nodes.filter((n) => !n.parentId)
  for (const root of roots) walk(root, 0)

  const width =
    Math.max(
      GITHUB_LAYOUT_PAD * 2 + GITHUB_NODE_WIDTH,
      ...laid.map((item) => item.x + GITHUB_NODE_WIDTH + GITHUB_LAYOUT_PAD),
    ) || 800
  const height =
    Math.max(
      GITHUB_LAYOUT_PAD * 2 + GITHUB_NODE_HEIGHT,
      ...laid.map((item) => item.y + GITHUB_NODE_HEIGHT + GITHUB_LAYOUT_PAD),
    ) || 480

  return { nodes: laid, width, height }
}
