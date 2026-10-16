/**
 * Pure C4 view helpers shared by structure-graph services and the workbench.
 * No Node / React deps — safe for browser bundles.
 */

import type {
  ArchitectureLevel,
  ArchitectureView,
  FunctionalEdge,
  FunctionalNode,
  GraphSourceKind,
} from '../../contracts/graph.js'

export interface ArchitectureViewScope {
  parentId?: string
  focusNodeId?: string
}

export interface ResolvedArchitectureView {
  view: ArchitectureView
  scope: ArchitectureViewScope
}

const SOURCE_KIND_PRIORITY: Record<GraphSourceKind, number> = {
  authored: 50,
  runtime: 40,
  ai: 30,
  import: 20,
  heuristic: 10,
}

export function sourceKindPriority(kind: GraphSourceKind | undefined): number {
  if (!kind) return 0
  return SOURCE_KIND_PRIORITY[kind] ?? 0
}

function stableViewKey(level: ArchitectureLevel, parentId?: string | null): string {
  if (level === 'context' || !parentId) return `view_${level}`
  return `view_${level}_${parentId}`
}

/**
 * Synthesize default named views: one context, one container per system,
 * one component per container. Keys are stable across regenerates.
 */
export function synthesizeDefaultArchitectureViews(
  nodes: FunctionalNode[],
  options?: { sourceKind?: GraphSourceKind },
): ArchitectureView[] {
  const sourceKind = options?.sourceKind ?? 'ai'
  const views: ArchitectureView[] = [
    {
      key: stableViewKey('context'),
      title: 'System Context',
      level: 'context',
      sourceKind,
    },
  ]

  const systems = nodes.filter((node) => node.elementType === 'software_system')
  for (const system of systems) {
    views.push({
      key: stableViewKey('container', system.id),
      title: `${system.name} Containers`,
      level: 'container',
      parentId: system.id,
      sourceKind,
    })
  }
  if (systems.length === 0 && nodes.some((node) => node.level === 'container')) {
    views.push({
      key: stableViewKey('container'),
      title: 'Containers',
      level: 'container',
      sourceKind,
    })
  }

  const containers = nodes.filter((node) => node.level === 'container')
  for (const container of containers) {
    views.push({
      key: stableViewKey('component', container.id),
      title: `${container.name} Components`,
      level: 'component',
      parentId: container.id,
      sourceKind,
    })
  }

  const componentsWithFiles = nodes.filter(
    (node) =>
      node.level === 'component' &&
      (node.linkedFiles.length > 0 || (node.children?.length ?? 0) > 0),
  )
  for (const component of componentsWithFiles) {
    if (component.linkedFiles.length === 0) continue
    views.push({
      key: stableViewKey('code', component.id),
      title: `${component.name} Code`,
      level: 'code',
      parentId: component.id,
      sourceKind,
    })
  }

  return views
}

/**
 * Merge auto-generated views with preserved user/locked views.
 * regenerate: replace unlocked auto views; keep locked/authored.
 * refine: never drop existing keys; only add missing auto views.
 */
export function mergeArchitectureViews(input: {
  existing?: ArchitectureView[]
  generated: ArchitectureView[]
  mode: 'regenerate' | 'refine'
}): ArchitectureView[] {
  const existing = input.existing ?? []
  const preserved = existing.filter(
    (view) =>
      view.locked === true ||
      view.sourceKind === 'authored' ||
      (input.mode === 'refine' && !view.sourceKind),
  )
  const preservedKeys = new Set(preserved.map((view) => view.key))
  if (input.mode === 'refine') {
    const byKey = new Map(existing.map((view) => [view.key, view]))
    for (const view of input.generated) {
      if (!byKey.has(view.key)) byKey.set(view.key, view)
    }
    return [...byKey.values()]
  }
  const generated = input.generated.filter((view) => !preservedKeys.has(view.key))
  return [...preserved, ...generated]
}

export function findArchitectureView(
  views: ArchitectureView[] | undefined,
  key: string | undefined,
): ArchitectureView | undefined {
  if (!key || !views?.length) return undefined
  return views.find((view) => view.key === key)
}

export function viewsForLevel(
  views: ArchitectureView[] | undefined,
  level: ArchitectureLevel,
): ArchitectureView[] {
  return (views ?? []).filter((view) => view.level === level)
}

/**
 * Resolve a named view or synthesize a transient one from level + scope.
 */
export function resolveArchitectureView(input: {
  views?: ArchitectureView[]
  viewKey?: string
  level: ArchitectureLevel
  scope?: ArchitectureViewScope
}): ResolvedArchitectureView {
  const named = findArchitectureView(input.views, input.viewKey)
  if (named) {
    return {
      view: named,
      scope: {
        ...(named.parentId ? { parentId: named.parentId } : {}),
        ...(named.focusNodeId ? { focusNodeId: named.focusNodeId } : {}),
        ...input.scope,
      },
    }
  }

  const scope = input.scope ?? {}
  return {
    view: {
      key: stableViewKey(input.level, scope.parentId),
      title: input.level.charAt(0).toUpperCase() + input.level.slice(1),
      level: input.level,
      ...(scope.parentId ? { parentId: scope.parentId } : {}),
      ...(scope.focusNodeId ? { focusNodeId: scope.focusNodeId } : {}),
      sourceKind: 'heuristic',
    },
    scope,
  }
}

function nearestVisibleAncestor(
  nodeId: string,
  nodesById: Map<string, FunctionalNode>,
  visibleIds: ReadonlySet<string>,
): string | null {
  let current = nodesById.get(nodeId)
  const visited = new Set<string>()
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (visibleIds.has(current.id)) return current.id
    current =
      current.parentId === null || current.parentId === undefined
        ? undefined
        : nodesById.get(current.parentId)
  }
  return null
}

/**
 * Lift edges whose endpoints are outside the visible set up to the nearest
 * visible ancestors (Structurizr view semantics). Same-ancestor edges drop.
 */
export function liftRelationshipsToVisibleAncestors(
  nodes: FunctionalNode[],
  edges: FunctionalEdge[],
  visibleIds: ReadonlySet<string>,
): FunctionalEdge[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const lifted: FunctionalEdge[] = []
  const seen = new Set<string>()

  for (const edge of edges) {
    const sourceVisible = visibleIds.has(edge.source)
    const targetVisible = visibleIds.has(edge.target)
    if (sourceVisible && targetVisible) {
      const key = `${edge.source}\u0000${edge.target}\u0000${edge.label ?? edge.relation}`
      if (seen.has(key)) continue
      seen.add(key)
      lifted.push(edge)
      continue
    }

    const liftedSource = sourceVisible
      ? edge.source
      : nearestVisibleAncestor(edge.source, nodesById, visibleIds)
    const liftedTarget = targetVisible
      ? edge.target
      : nearestVisibleAncestor(edge.target, nodesById, visibleIds)
    if (!liftedSource || !liftedTarget || liftedSource === liftedTarget) continue

    const key = `${liftedSource}\u0000${liftedTarget}\u0000${edge.label ?? edge.relation}`
    if (seen.has(key)) continue
    seen.add(key)
    lifted.push({
      ...edge,
      id: `lifted_${edge.id}_${liftedSource}_${liftedTarget}`,
      source: liftedSource,
      target: liftedTarget,
    })
  }

  return lifted
}

export function applyViewNodeFilters(
  nodes: FunctionalNode[],
  view: ArchitectureView,
): FunctionalNode[] {
  let result = nodes
  if (view.includeNodeIds?.length) {
    const include = new Set(view.includeNodeIds)
    result = result.filter((node) => include.has(node.id))
  }
  if (view.excludeNodeIds?.length) {
    const exclude = new Set(view.excludeNodeIds)
    result = result.filter((node) => !exclude.has(node.id))
  }
  return result
}
