import type { SemanticTreeNode } from '@contracts/index'

/** Default: only root-level folders expanded (VS Code–like first open). */
export const TREE_DEFAULT_EXPAND_DEPTH = 1

export function resolveTreeExpanded(
  expansion: Record<string, boolean>,
  key: string,
  depth: number,
): boolean {
  if (key in expansion) return expansion[key]
  return depth < TREE_DEFAULT_EXPAND_DEPTH
}

/** Semantic roots are feature groups, so start them collapsed like IDE outline groups. */
export function resolveSemanticTreeExpanded(
  expansion: Record<string, boolean>,
  key: string,
  depth: number,
): boolean {
  return resolveTreeExpanded(expansion, key, depth + 1)
}

export function collectSemanticAncestorIdsForPaths(
  roots: SemanticTreeNode[],
  paths: string[],
): string[] {
  if (paths.length === 0) return []
  const pathSet = new Set(paths)
  const ids = new Set<string>()
  const walk = (node: SemanticTreeNode, ancestors: string[]) => {
    if (node.path && pathSet.has(node.path)) {
      ancestors.forEach((id) => ids.add(id))
    }
    node.children.forEach((child) => walk(child, [...ancestors, node.id]))
  }
  roots.forEach((root) => walk(root, []))
  return [...ids]
}

export function collectDirectoryAncestorPaths(filePath: string): string[] {
  const parts = filePath.split('/').filter(Boolean)
  if (parts.length <= 1) return []
  const paths: string[] = []
  for (let i = 0; i < parts.length - 1; i++) {
    paths.push(parts.slice(0, i + 1).join('/'))
  }
  return paths
}

export function mergeTreeExpansion(
  expansion: Record<string, boolean>,
  keys: string[],
): Record<string, boolean> {
  if (keys.length === 0) return expansion
  const next = { ...expansion }
  keys.forEach((key) => {
    next[key] = true
  })
  return next
}

export function isSemanticFileKind(kind: string): boolean {
  return kind === 'file' || kind === 'api' || kind === 'route' || kind === 'config'
}
