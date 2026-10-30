import type { GithubDomainModel, GithubFeature } from '@contracts/github-domain'
import type { GithubGraphModel, GithubGraphNode } from '@contracts/github-graph'
import {
  GITHUB_LAYOUT_PAD,
  GITHUB_NODE_GAP_X,
  GITHUB_NODE_GAP_Y,
  GITHUB_NODE_HEIGHT,
  GITHUB_NODE_WIDTH,
  type GithubGraphLayout,
  type LaidOutGithubNode,
} from './buildGithubGraphModel'

export function featureNodeId(featureId: string): string {
  return `feature:${featureId}`
}

function countAssociations(
  model: GithubDomainModel,
  featureId: string,
): { branches: number; prs: number } {
  let branches = 0
  let prs = 0
  for (const rel of model.relations) {
    if (rel.stale) continue
    if (rel.fromType !== 'feature' || rel.fromKey !== featureId) continue
    if (rel.kind === 'feature-implemented-by' && rel.toType === 'branch') {
      branches += 1
    }
    if (rel.kind === 'feature-reviewed-by' && rel.toType === 'pr') {
      prs += 1
    }
  }
  return { branches, prs }
}

/**
 * Project domain features into a GithubGraphModel-compatible tree.
 * Falls back to empty feature roots when no features exist (caller uses partition tree).
 */
export function buildFeatureTreeProjection(
  model: GithubDomainModel,
  options: { expandedFeatureIds?: readonly string[] } = {},
): GithubGraphModel {
  const expanded = new Set(options.expandedFeatureIds ?? [])
  const repoId = `repo:${model.repo.fullName}`
  const nodes: GithubGraphNode[] = [
    {
      id: repoId,
      kind: 'default',
      name: model.repo.defaultBranch,
      parentId: null,
      current: false,
      remote: false,
      pending: false,
    },
  ]

  const byParent = new Map<string | null, GithubFeature[]>()
  for (const feature of model.features) {
    const key = feature.parentFeatureId ?? null
    const list = byParent.get(key) ?? []
    list.push(feature)
    byParent.set(key, list)
  }

  function walk(feature: GithubFeature, parentId: string) {
    const id = featureNodeId(feature.id)
    const counts = countAssociations(model, feature.id)
    nodes.push({
      id,
      kind: 'feature',
      name: feature.title,
      parentId,
      current: false,
      remote: false,
      pending: false,
      ahead: counts.branches,
      behind: counts.prs,
    })
    if (!expanded.has(feature.id) && (byParent.get(feature.id)?.length ?? 0) > 0) {
      return
    }
    for (const child of byParent.get(feature.id) ?? []) {
      walk(child, id)
    }
  }

  for (const root of byParent.get(null) ?? []) {
    walk(root, repoId)
  }

  return {
    repoLabel: model.repo.fullName,
    defaultBranch: model.repo.defaultBranch,
    currentBranch: null,
    ...(model.repo.remoteUrl ? { remoteUrl: model.repo.remoteUrl } : {}),
    dirty: false,
    nodes,
  }
}

/** Left-to-right layout identical pitch to partition tree. */
export function layoutFeatureTreeProjection(
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
      before === after ? leafIndex : (before + after - 1) / 2
    laid.push({
      node,
      x: GITHUB_LAYOUT_PAD + depth * colPitch,
      y: GITHUB_LAYOUT_PAD + mid * rowPitch,
      depth,
    })
  }

  for (const root of byParent.get(null) ?? []) walk(root, 0)

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
