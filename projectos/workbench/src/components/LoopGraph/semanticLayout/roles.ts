import type {
  SemanticLayoutEdge,
  SemanticLayoutGraph,
  SemanticNodeRole,
} from './types'

/**
 * Undirected connected components over all workflow edges (forward + back).
 */
export function findConnectedComponents(
  graph: SemanticLayoutGraph,
): string[][] {
  const adj = new Map<string, Set<string>>()
  for (const id of graph.nodeIds) adj.set(id, new Set())
  for (const edge of graph.edges) {
    if (!adj.has(edge.source) || !adj.has(edge.target)) continue
    adj.get(edge.source)!.add(edge.target)
    adj.get(edge.target)!.add(edge.source)
  }

  const seen = new Set<string>()
  const components: string[][] = []
  for (const id of graph.nodeIds) {
    if (seen.has(id)) continue
    const stack = [id]
    const comp: string[] = []
    seen.add(id)
    while (stack.length > 0) {
      const cur = stack.pop()!
      comp.push(cur)
      for (const next of adj.get(cur) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        stack.push(next)
      }
    }
    components.push(comp.sort((a, b) => a.localeCompare(b)))
  }
  return components
}

/**
 * Primary = component with the most workflow edges; tie-break by node count,
 * then lexicographic first id (stable).
 */
export function pickPrimaryComponent(
  graph: SemanticLayoutGraph,
  components: string[][],
): { primaryIds: Set<string>; parkedIds: string[] } {
  if (components.length === 0) {
    return { primaryIds: new Set(), parkedIds: [] }
  }
  if (components.length === 1) {
    return {
      primaryIds: new Set(components[0]),
      parkedIds: [],
    }
  }

  const edgeCount = (ids: Set<string>) =>
    graph.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    ).length

  let best = components[0]!
  let bestEdges = edgeCount(new Set(best))
  for (let i = 1; i < components.length; i += 1) {
    const comp = components[i]!
    const edges = edgeCount(new Set(comp))
    if (
      edges > bestEdges ||
      (edges === bestEdges && comp.length > best.length) ||
      (edges === bestEdges &&
        comp.length === best.length &&
        (comp[0] ?? '') < (best[0] ?? ''))
    ) {
      best = comp
      bestEdges = edges
    }
  }

  const primaryIds = new Set(best)
  const parkedIds = graph.nodeIds.filter((id) => !primaryIds.has(id))
  return { primaryIds, parkedIds }
}

export function subgraphForIds(
  graph: SemanticLayoutGraph,
  ids: ReadonlySet<string>,
): SemanticLayoutGraph {
  const nodeIds = graph.nodeIds.filter((id) => ids.has(id))
  const sizes = new Map<string, { width: number; height: number }>()
  for (const id of nodeIds) {
    const size = graph.sizes.get(id)
    if (size) sizes.set(id, size)
  }
  const edges = graph.edges.filter(
    (edge) => ids.has(edge.source) && ids.has(edge.target),
  )
  return { nodeIds, sizes, edges }
}

/**
 * Longest depends-only chain from a top entry, then compress shortcuts so
 * optional detours (Coder→Tests→Condition while Coder→Condition exists)
 * become side branches instead of spine (matches Fig.1 TB stem).
 */
export function pickSpineNodeIds(
  graph: SemanticLayoutGraph,
  ranks: Map<string, number>,
): string[] {
  const forward = graph.edges.filter(
    (edge) => edge.role === 'forward' && edge.kind !== 'fallback',
  )
  const succs = new Map<string, string[]>()
  const edgeKeys = new Set<string>()
  for (const edge of forward) {
    const list = succs.get(edge.source) ?? []
    list.push(edge.target)
    succs.set(edge.source, list)
    edgeKeys.add(`${edge.source}->${edge.target}`)
  }

  const entries = graph.nodeIds
    .filter((id) => (ranks.get(id) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b))
  if (entries.length === 0) return []

  let bestSpine: string[] = []
  for (const start of entries) {
    const spine = growChain(start, succs)
    if (
      spine.length > bestSpine.length ||
      (spine.length === bestSpine.length &&
        spine.join('\0') < bestSpine.join('\0'))
    ) {
      bestSpine = spine
    }
  }
  return compressSpineWithShortcuts(bestSpine, edgeKeys)
}

/**
 * If Si → Sj (j > i+1) exists on the chain, skip intermediates (they become side).
 */
export function compressSpineWithShortcuts(
  spine: string[],
  edgeKeys: ReadonlySet<string>,
): string[] {
  if (spine.length <= 2) return spine
  const compressed: string[] = []
  let i = 0
  while (i < spine.length) {
    compressed.push(spine[i]!)
    let jump = i
    for (let j = spine.length - 1; j > i + 1; j -= 1) {
      if (edgeKeys.has(`${spine[i]}->${spine[j]}`)) {
        jump = j
        break
      }
    }
    i = jump > i ? jump : i + 1
  }
  return compressed
}

function growChain(
  start: string,
  succs: Map<string, string[]>,
): string[] {
  const depthMemo = new Map<string, number>()
  const depthToSink = (id: string, visiting: Set<string>): number => {
    const cached = depthMemo.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 0
    visiting.add(id)
    let best = 0
    for (const next of succs.get(id) ?? []) {
      best = Math.max(best, 1 + depthToSink(next, visiting))
    }
    visiting.delete(id)
    depthMemo.set(id, best)
    return best
  }

  const spine: string[] = [start]
  const seen = new Set<string>([start])
  let current = start
  while (true) {
    const nexts = (succs.get(current) ?? []).filter((id) => !seen.has(id))
    if (nexts.length === 0) break
    // Follow the successor with the longest remaining path to a sink.
    nexts.sort(
      (a, b) =>
        depthToSink(b, new Set()) - depthToSink(a, new Set()) ||
        a.localeCompare(b),
    )
    const next = nexts[0]!
    spine.push(next)
    seen.add(next)
    current = next
  }
  return spine
}

/**
 * Classify primary nodes: spine vs side. Parked handled outside.
 * Side corridor: 'left' if node id hash even / first side neighbor prefers left.
 */
export function assignNodeRoles(input: {
  primaryIds: ReadonlySet<string>
  spineIds: readonly string[]
  parkedIds: readonly string[]
}): {
  roles: Map<string, SemanticNodeRole>
  sideCorridor: Map<string, 'left' | 'right'>
} {
  const spineSet = new Set(input.spineIds)
  const roles = new Map<string, SemanticNodeRole>()
  const sideCorridor = new Map<string, 'left' | 'right'>()

  for (const id of input.parkedIds) {
    roles.set(id, 'parked')
  }
  for (const id of input.spineIds) {
    roles.set(id, 'spine')
  }

  let sideIndex = 0
  const primarySorted = [...input.primaryIds].sort((a, b) =>
    a.localeCompare(b),
  )
  for (const id of primarySorted) {
    if (spineSet.has(id)) continue
    roles.set(id, 'side')
    // Alternate left/right for multiple side nodes; stable by id order.
    sideCorridor.set(id, sideIndex % 2 === 0 ? 'left' : 'right')
    sideIndex += 1
  }

  return { roles, sideCorridor }
}

export function forwardDependsEdges(
  edges: SemanticLayoutEdge[],
): SemanticLayoutEdge[] {
  return edges.filter(
    (edge) =>
      edge.role === 'forward' &&
      edge.kind !== 'conditional' &&
      edge.kind !== 'fallback',
  )
}

/**
 * Demote `action` type pass-through nodes from spine to side corridor.
 *
 * A node is demoted when:
 *   - Its node type is 'action' (duty/integration step, not an agent/human/logic)
 *   - It has forward in-degree = 1 AND forward out-degree ≤ 1 within the primary graph
 *     (i.e. it is a linear detour, not a fan-in/fan-out branch point)
 *   - It is not the first or last node of the spine (entry/exit stay on the trunk)
 *
 * This lets graphs like `Coder → Run Tests → Condition` place Run Tests in
 * the side corridor even when no direct Coder → Condition shortcut edge exists,
 * matching the Fig.1 TB layout target.
 */
export function demoteActionPassthroughs(input: {
  spineIds: string[]
  primaryGraph: SemanticLayoutGraph
  /** node id → IntentGraphNode type string ('agent' | 'action' | 'logic' | …) */
  nodeTypes: ReadonlyMap<string, string>
}): string[] {
  const { spineIds, primaryGraph, nodeTypes } = input
  // Nothing to demote in trivial spines.
  if (spineIds.length <= 1) return spineIds

  const fwdEdges = primaryGraph.edges.filter((e) => e.role === 'forward')
  const fwdInDeg = new Map<string, number>()
  const fwdOutDeg = new Map<string, number>()
  for (const id of primaryGraph.nodeIds) {
    fwdInDeg.set(id, 0)
    fwdOutDeg.set(id, 0)
  }
  for (const edge of fwdEdges) {
    fwdInDeg.set(edge.target, (fwdInDeg.get(edge.target) ?? 0) + 1)
    fwdOutDeg.set(edge.source, (fwdOutDeg.get(edge.source) ?? 0) + 1)
  }

  return spineIds.filter((id, index) => {
    // Always keep the entry and exit of the spine.
    if (index === 0 || index === spineIds.length - 1) return true
    const type = nodeTypes.get(id) ?? 'agent'
    if (type !== 'action') return true
    // Keep branch/merge points on spine.
    const inDeg = fwdInDeg.get(id) ?? 0
    const outDeg = fwdOutDeg.get(id) ?? 0
    if (inDeg > 1 || outDeg > 1) return true
    // Linear action pass-through → demote to side corridor.
    return false
  })
}
