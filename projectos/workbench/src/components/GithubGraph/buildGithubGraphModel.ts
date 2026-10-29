import type { GithubGraphModel, GithubGraphNode } from '@contracts/github-graph'
import type { WorkspaceGitBranch } from '@contracts/workspace-git'
import type { WorkspaceGitPullRequest } from '@contracts/workspace-git'

export const GITHUB_NODE_WIDTH = 200
export const GITHUB_NODE_HEIGHT = 64
export const GITHUB_NODE_GAP_X = 48
export const GITHUB_NODE_GAP_Y = 72
export const GITHUB_LAYOUT_PAD = 48

export type BuildGithubGraphBranch = WorkspaceGitBranch & {
  /** Client-only: create/push (or delete) still in flight. */
  pending?: boolean
}

export interface BuildGithubGraphInput {
  repoLabel: string
  defaultBranch: string | null
  currentBranch: string | null
  remoteUrl?: string
  dirty: boolean
  branches: readonly BuildGithubGraphBranch[]
  pullRequests?: readonly WorkspaceGitPullRequest[]
  worktrees?: readonly { id: string; branch?: string | null }[]
  /**
   * Explicit parent node id by branch name (create-child intent).
   * Wins over slash inference when the parent id is already in the tree.
   */
  parentByBranchName?: Readonly<Record<string, string>>
}

/** Group id for a slash path prefix (e.g. alice/auth → group:alice/auth). */
export function githubGroupId(path: string): string {
  return `group:${path}`
}

/** Path used when composing a child branch under this node. */
export function parentPathForNode(node: GithubGraphNode): string | null {
  if (node.kind === 'group') {
    return node.id.startsWith('group:')
      ? node.id.slice('group:'.length)
      : node.name
  }
  if (node.kind === 'branch') return node.name
  if (node.kind === 'default') return null
  return null
}

/**
 * Compose a full ref name from a parent node + user short name.
 * Short names should not start with `/`; nested segments under the parent are allowed.
 */
export function composeChildBranchName(
  parent: GithubGraphNode,
  shortName: string,
): string {
  const short = shortName
    .trim()
    .replace(/^\/+/u, '')
    .replace(/\/+$/u, '')
  if (!short) return ''
  const path = parentPathForNode(parent)
  if (!path) return short
  if (short === path || short.startsWith(`${path}/`)) return short
  return `${path}/${short}`
}

/** Real git tip for create — never a synthetic group name. */
export function resolveCreateFromTip(
  node: GithubGraphNode,
  defaultBranch: string,
  branches: readonly { name: string; current?: boolean }[],
): string {
  if (node.kind === 'default' || node.kind === 'branch') return node.name
  if (node.kind === 'group') {
    const path = parentPathForNode(node) ?? ''
    const under = branches.filter(
      (branch) => branch.name === path || branch.name.startsWith(`${path}/`),
    )
    const current = under.find((branch) => branch.current)
    if (current) return current.name
    under.sort((a, b) => b.name.length - a.name.length)
    if (under[0]) return under[0].name
  }
  return defaultBranch
}

/**
 * Ensure intermediate slash-path parents exist under default.
 * Prefers an existing / known real branch over a synthetic group for the same path.
 */
export function ensureBranchPathParent(
  branchName: string,
  defaultId: string,
  nodes: GithubGraphNode[],
  seen: Set<string>,
  knownBranchNames: ReadonlySet<string>,
): string {
  const segments = branchName.split('/').filter(Boolean)
  if (segments.length <= 1) return defaultId

  let parentId = defaultId
  let path = ''
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]!
    path = path ? `${path}/${segment}` : segment
    const branchId = `branch:${path}`
    if (seen.has(branchId) || knownBranchNames.has(path)) {
      parentId = branchId
      continue
    }
    const id = githubGroupId(path)
    if (!seen.has(id)) {
      seen.add(id)
      nodes.push({
        id,
        kind: 'group',
        name: segment,
        parentId,
        current: false,
      })
    }
    parentId = id
  }
  return parentId
}

function pathDepth(name: string): number {
  return name.split('/').filter(Boolean).length
}

/** Partition tree: default → path groups / parent branches → feature leaves. */
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
  const knownBranchNames = new Set(
    input.branches
      .map((branch) => branch.name)
      .filter((name) => name !== defaultBranch),
  )
  const overrides = input.parentByBranchName ?? {}

  const ordered = [...input.branches].sort(
    (a, b) => pathDepth(a.name) - pathDepth(b.name),
  )

  for (const branch of ordered) {
    if (branch.name === defaultBranch) {
      const root = nodes[0]!
      root.current = branch.current || root.current
      root.remote = branch.remote
      if (branch.ahead !== undefined) root.ahead = branch.ahead
      if (branch.behind !== undefined) root.behind = branch.behind
      continue
    }
    if (seen.has(branch.id)) continue
    const overrideParent = overrides[branch.name]
    const parentId =
      overrideParent && seen.has(overrideParent)
        ? overrideParent
        : ensureBranchPathParent(
            branch.name,
            defaultId,
            nodes,
            seen,
            knownBranchNames,
          )
    seen.add(branch.id)
    nodes.push({
      id: branch.id,
      kind: 'branch',
      name: branch.name,
      parentId,
      current: branch.current,
      remote: branch.remote,
      pending: Boolean(branch.pending),
      ...(branch.ahead !== undefined ? { ahead: branch.ahead } : {}),
      ...(branch.behind !== undefined ? { behind: branch.behind } : {}),
    })
  }

  for (const pr of input.pullRequests ?? []) {
    const headId = `branch:${pr.headRef}`
    if (!seen.has(headId)) {
      knownBranchNames.add(pr.headRef)
      const parentId = ensureBranchPathParent(
        pr.headRef,
        defaultId,
        nodes,
        seen,
        knownBranchNames,
      )
      seen.add(headId)
      nodes.push({
        id: headId,
        kind: 'branch',
        name: pr.headRef,
        parentId,
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
      knownBranchNames.add(worktree.branch)
      const pathParent = ensureBranchPathParent(
        worktree.branch,
        defaultId,
        nodes,
        seen,
        knownBranchNames,
      )
      seen.add(parentId)
      nodes.push({
        id: parentId,
        kind: 'branch',
        name: worktree.branch,
        parentId: pathParent,
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

/** Left-to-right tree layout (depth → x, siblings → y). */
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
        x: GITHUB_LAYOUT_PAD + depth * colPitch,
        y: GITHUB_LAYOUT_PAD + leafIndex * rowPitch,
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
      x: GITHUB_LAYOUT_PAD + depth * colPitch,
      y: GITHUB_LAYOUT_PAD + mid * rowPitch,
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
