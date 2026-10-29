import type { WorkspaceGitBranch } from '@contracts/workspace-git'

export interface GithubBranchFolderNode {
  kind: 'folder'
  id: string
  name: string
  children: GithubBranchTreeNode[]
}

export interface GithubBranchLeafNode {
  kind: 'branch'
  id: string
  name: string
  fullName: string
  current: boolean
  remote: boolean
  ahead?: number
  behind?: number
}

export type GithubBranchTreeNode = GithubBranchFolderNode | GithubBranchLeafNode

/** Build a nested folder tree from branch names (`feat/foo` → folder feat → leaf foo). */
export function buildGithubBranchTree(
  branches: readonly WorkspaceGitBranch[],
): GithubBranchTreeNode[] {
  const root: GithubBranchFolderNode = {
    kind: 'folder',
    id: 'root',
    name: '',
    children: [],
  }

  for (const branch of branches) {
    const parts = branch.name.split('/').filter(Boolean)
    if (parts.length === 0) continue
    let cursor = root
    for (let i = 0; i < parts.length - 1; i += 1) {
      const segment = parts[i]!
      const folderId = `folder:${parts.slice(0, i + 1).join('/')}`
      let next = cursor.children.find(
        (child): child is GithubBranchFolderNode =>
          child.kind === 'folder' && child.name === segment,
      )
      if (!next) {
        next = { kind: 'folder', id: folderId, name: segment, children: [] }
        cursor.children.push(next)
      }
      cursor = next
    }
    const leafName = parts[parts.length - 1]!
    cursor.children.push({
      kind: 'branch',
      id: branch.id,
      name: leafName,
      fullName: branch.name,
      current: branch.current,
      remote: branch.remote,
      ...(branch.ahead !== undefined ? { ahead: branch.ahead } : {}),
      ...(branch.behind !== undefined ? { behind: branch.behind } : {}),
    })
  }

  sortTree(root.children)
  return root.children
}

function sortTree(nodes: GithubBranchTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const node of nodes) {
    if (node.kind === 'folder') sortTree(node.children)
  }
}

export function filterBranchesByQuery(
  branches: readonly WorkspaceGitBranch[],
  query: string,
): WorkspaceGitBranch[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...branches]
  return branches.filter((branch) => branch.name.toLowerCase().includes(q))
}

export function childrenAtPath(
  roots: readonly GithubBranchTreeNode[],
  pathSegments: readonly string[],
): GithubBranchTreeNode[] {
  let nodes = [...roots]
  for (const segment of pathSegments) {
    const folder = nodes.find(
      (node): node is GithubBranchFolderNode =>
        node.kind === 'folder' && node.name === segment,
    )
    if (!folder) return []
    nodes = folder.children
  }
  return nodes
}
