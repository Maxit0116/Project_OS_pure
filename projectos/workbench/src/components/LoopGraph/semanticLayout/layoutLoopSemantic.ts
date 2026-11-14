import type { IntentGraph, IntentGraphNode } from '@contracts/index'
import { assignSemanticCoordinates } from './coordinateAssign'
import { orderLayersByBarycenter } from './crossingReduction'
import { buildSemanticLayoutGraph } from './graphModel'
import {
  assignLongestPathRanks,
  breakForwardCycles,
  forwardEdgesOf,
  layersFromRanks,
} from './layering'
import {
  assignNodeRoles,
  demoteActionPassthroughs,
  findConnectedComponents,
  pickPrimaryComponent,
  pickSpineNodeIds,
  subgraphForIds,
} from './roles'
import type {
  SemanticLayoutNodeSize,
  SemanticLayoutOptions,
  SemanticLayoutResult,
  SemanticNodeRole,
} from './types'
import { SEM_ORIGIN } from './types'

/**
 * Top-to-bottom semantic layout with spine / side / parked roles (SL-D11–D14).
 */
export function layoutNodesSemantically(input: {
  draft: Pick<IntentGraph, 'nodes' | 'edges'>
  sizes: SemanticLayoutNodeSize[]
  includeIds?: ReadonlySet<string>
  redirect?: Map<string, string>
  options?: SemanticLayoutOptions
}): SemanticLayoutResult {
  const emptyRoles = new Map<string, SemanticNodeRole>()
  const graph = breakForwardCycles(
    buildSemanticLayoutGraph({
      draft: input.draft,
      sizes: input.sizes,
      includeIds: input.includeIds,
      redirect: input.redirect,
    }),
  )
  if (graph.nodeIds.length === 0) {
    return {
      positions: new Map(),
      ranks: new Map(),
      layers: [],
      spineX: input.options?.spineX ?? SEM_ORIGIN.x + 200,
      roles: emptyRoles,
      spineIds: [],
    }
  }
  if (graph.nodeIds.length === 1) {
    const id = graph.nodeIds[0]!
    const origin = input.options?.origin ?? SEM_ORIGIN
    const roles = new Map<string, SemanticNodeRole>([[id, 'spine']])
    return {
      positions: new Map([[id, { x: origin.x, y: origin.y }]]),
      ranks: new Map([[id, 0]]),
      layers: [[id]],
      spineX: origin.x + (graph.sizes.get(id)?.width ?? 200) / 2,
      roles,
      spineIds: [id],
    }
  }

  const components = findConnectedComponents(graph)
  const { primaryIds, parkedIds } = pickPrimaryComponent(graph, components)
  const primaryGraph = subgraphForIds(graph, primaryIds)

  // All-parked edge case: nothing connected — treat as a vertical parked stack.
  if (primaryGraph.nodeIds.length === 0) {
    const origin = input.options?.origin ?? SEM_ORIGIN
    const positions = new Map<string, { x: number; y: number }>()
    const roles = new Map<string, SemanticNodeRole>()
    let y = origin.y
    const sorted = [...graph.nodeIds].sort((a, b) => a.localeCompare(b))
    for (const id of sorted) {
      const size = graph.sizes.get(id) ?? { width: 200, height: 88 }
      positions.set(id, { x: origin.x, y })
      roles.set(id, 'parked')
      y += size.height + 48
    }
    return {
      positions,
      ranks: new Map(sorted.map((id, index) => [id, index])),
      layers: sorted.map((id) => [id]),
      spineX: origin.x + 140,
      roles,
      spineIds: [],
    }
  }

  const ranks = assignLongestPathRanks(primaryGraph)
  let layers = layersFromRanks(ranks, primaryGraph.nodeIds)
  layers = orderLayersByBarycenter({
    layers,
    forwardEdges: forwardEdgesOf(primaryGraph),
    iterations: input.options?.baryIterations,
  })

  const rawSpineIds = pickSpineNodeIds(primaryGraph, ranks)

  // Build a node-type lookup (non-redirected nodes only; composite WG ids are
  // not in this map so they default to 'agent' and are never demoted).
  const nodeTypes = new Map<string, string>()
  for (const draftNode of input.draft.nodes) {
    if (!input.redirect?.has(draftNode.id)) {
      nodeTypes.set(draftNode.id, draftNode.type ?? 'agent')
    }
  }

  // Demote action pass-through nodes from spine to side corridor even when no
  // direct shortcut edge exists (e.g. Coder → Run Tests → Condition without
  // a Coder → Condition edge).
  const spineIds = demoteActionPassthroughs({
    spineIds: rawSpineIds,
    primaryGraph,
    nodeTypes,
  })

  const { roles, sideCorridor } = assignNodeRoles({
    primaryIds,
    spineIds,
    parkedIds,
  })

  // Ensure every primary node has a role (spine pick may miss isolates inside primary).
  for (const id of primaryIds) {
    if (!roles.has(id)) {
      roles.set(id, spineIds.includes(id) ? 'spine' : 'side')
      if (!spineIds.includes(id) && !sideCorridor.has(id)) {
        sideCorridor.set(id, 'left')
      }
    }
  }

  return assignSemanticCoordinates({
    graph, // full sizes for parked
    layers,
    ranks,
    roles,
    spineIds,
    sideCorridor,
    parkedIds,
    options: input.options,
  })
}

/**
 * Apply layout positions to draft nodes; translate provides satellites by the
 * same delta as their target agent.
 */
export function applySemanticPositionsToNodes(input: {
  nodes: IntentGraphNode[]
  edges: IntentGraph['edges']
  positions: Map<string, { x: number; y: number }>
}): IntentGraphNode[] {
  const deltaById = new Map<string, { dx: number; dy: number }>()
  for (const node of input.nodes) {
    const next = input.positions.get(node.id)
    if (!next) continue
    deltaById.set(node.id, {
      dx: next.x - node.position.x,
      dy: next.y - node.position.y,
    })
  }

  const agentBySatellite = new Map<string, string>()
  for (const edge of input.edges) {
    if (edge.kind !== 'provides') continue
    if (!deltaById.has(edge.target)) continue
    agentBySatellite.set(edge.source, edge.target)
  }

  return input.nodes.map((node) => {
    const next = input.positions.get(node.id)
    if (next) return { ...node, position: next }
    const agentId = agentBySatellite.get(node.id)
    if (!agentId) return node
    const delta = deltaById.get(agentId)
    if (!delta) return node
    return {
      ...node,
      position: {
        x: node.position.x + delta.dx,
        y: node.position.y + delta.dy,
      },
    }
  })
}
