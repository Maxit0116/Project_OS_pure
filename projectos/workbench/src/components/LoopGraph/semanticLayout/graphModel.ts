import {
  isConfigNode,
  type IntentGraph,
  type IntentGraphEdge,
  type IntentGraphNode,
} from '@contracts/index'
import type {
  SemanticLayoutEdge,
  SemanticLayoutEdgeRole,
  SemanticLayoutGraph,
  SemanticLayoutNodeSize,
} from './types'

function resolveKind(
  edge: IntentGraphEdge,
): NonNullable<IntentGraphEdge['kind']> {
  return edge.kind ?? 'depends'
}

export function edgeRoleForKind(
  kind: NonNullable<IntentGraphEdge['kind']>,
): SemanticLayoutEdgeRole {
  if (kind === 'feedback') return 'back'
  // provides never enters this graph
  return 'forward'
}

/**
 * Build a layout graph from an Intent draft.
 * - Skips config / provides
 * - Only includes `includeIds` when provided (L2 subgraph)
 * - Optional `redirect`: map member id → composite id (L1 work-group collapse)
 */
export function buildSemanticLayoutGraph(input: {
  draft: Pick<IntentGraph, 'nodes' | 'edges'>
  sizes: SemanticLayoutNodeSize[]
  includeIds?: ReadonlySet<string>
  /** Redirect edge endpoints (e.g. work-group member → composite wg id). */
  redirect?: Map<string, string>
}): SemanticLayoutGraph {
  const include = input.includeIds
  const redirect = input.redirect
  const sizeMap = new Map(
    input.sizes.map((item) => [item.id, { width: item.width, height: item.height }]),
  )

  const nodeIds = input.draft.nodes
    .filter((node) => {
      if (isConfigNode(node)) return false
      if (include && !include.has(node.id)) return false
      // Composite-only ids may appear only via redirect targets — add below.
      return sizeMap.has(node.id) || Boolean(redirect?.get(node.id))
    })
    .map((node) => redirect?.get(node.id) ?? node.id)

  const idSet = new Set<string>()
  for (const id of nodeIds) {
    if (sizeMap.has(id)) idSet.add(id)
  }
  // Ensure composite targets with sizes are present even if not in draft.nodes.
  for (const size of input.sizes) {
    idSet.add(size.id)
  }

  const edges: SemanticLayoutEdge[] = []
  const seen = new Set<string>()
  for (const edge of input.draft.edges) {
    const kind = resolveKind(edge)
    if (kind === 'provides') continue
    let source = edge.source
    let target = edge.target
    if (include) {
      if (!include.has(source) || !include.has(target)) continue
    }
    if (redirect) {
      source = redirect.get(source) ?? source
      target = redirect.get(target) ?? target
    }
    if (source === target) continue
    if (!idSet.has(source) || !idSet.has(target)) continue
    const role = edgeRoleForKind(kind)
    const key = `${source}->${target}:${role}:${edge.id}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push({
      id: edge.id,
      source,
      target,
      kind,
      role,
    })
  }

  return {
    nodeIds: [...idSet],
    sizes: sizeMap,
    edges,
  }
}

/** Convenience: size list from nodes using a sizeOf callback. */
export function sizesFromNodes(
  nodes: IntentGraphNode[],
  sizeOf: (node: IntentGraphNode) => { width: number; height: number },
): SemanticLayoutNodeSize[] {
  return nodes.map((node) => {
    const size = sizeOf(node)
    return { id: node.id, width: size.width, height: size.height }
  })
}
