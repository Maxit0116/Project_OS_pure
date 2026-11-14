import type { SemanticLayoutEdge, SemanticLayoutGraph } from './types'

/**
 * Reclassify forward edges that close a cycle (e.g. a `conditional` fail
 * branch Condition → Coder) as `back`, so the forward graph is a DAG.
 * DFS starts from forward-indegree-0 nodes in stable id order, then from any
 * remaining (pure-cycle) nodes; an edge to a node on the DFS stack is a back edge.
 */
export function breakForwardCycles(
  graph: SemanticLayoutGraph,
): SemanticLayoutGraph {
  const idSet = new Set(graph.nodeIds)
  const outEdges = new Map<string, SemanticLayoutEdge[]>()
  const indegree = new Map<string, number>()
  for (const id of graph.nodeIds) {
    outEdges.set(id, [])
    indegree.set(id, 0)
  }
  for (const edge of graph.edges) {
    if (edge.role !== 'forward') continue
    if (!idSet.has(edge.source) || !idSet.has(edge.target)) continue
    outEdges.get(edge.source)!.push(edge)
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }
  // Prefer following non-conditional edges first so the happy path claims
  // tree edges and the conditional return edge becomes the back edge.
  for (const list of outEdges.values()) {
    list.sort(
      (a, b) =>
        Number(a.kind === 'conditional') - Number(b.kind === 'conditional') ||
        a.target.localeCompare(b.target),
    )
  }

  const sorted = [...graph.nodeIds].sort((a, b) => a.localeCompare(b))
  const starts = [
    ...sorted.filter((id) => (indegree.get(id) ?? 0) === 0),
    ...sorted.filter((id) => (indegree.get(id) ?? 0) > 0),
  ]

  const state = new Map<string, 0 | 1 | 2>()
  const backIds = new Set<string>()
  for (const start of starts) {
    if (state.get(start)) continue
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }]
    state.set(start, 1)
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!
      const edges = outEdges.get(frame.id) ?? []
      if (frame.next >= edges.length) {
        state.set(frame.id, 2)
        stack.pop()
        continue
      }
      const edge = edges[frame.next]!
      frame.next += 1
      const s = state.get(edge.target) ?? 0
      if (s === 1) {
        backIds.add(edge.id)
      } else if (s === 0) {
        state.set(edge.target, 1)
        stack.push({ id: edge.target, next: 0 })
      }
    }
  }

  if (backIds.size === 0) return graph
  return {
    ...graph,
    edges: graph.edges.map((edge) =>
      backIds.has(edge.id) && edge.role === 'forward'
        ? { ...edge, role: 'back' as const }
        : edge,
    ),
  }
}

/**
 * Longest-path layering on the forward DAG (back edges ignored).
 * Entries (indegree 0 on forward) get rank 0.
 */
export function assignLongestPathRanks(
  graph: SemanticLayoutGraph,
): Map<string, number> {
  const forward = graph.edges.filter((edge) => edge.role === 'forward')
  const ids = graph.nodeIds
  const idSet = new Set(ids)
  const preds = new Map<string, string[]>()
  const succs = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const id of ids) {
    preds.set(id, [])
    succs.set(id, [])
    indegree.set(id, 0)
  }
  for (const edge of forward) {
    if (!idSet.has(edge.source) || !idSet.has(edge.target)) continue
    succs.get(edge.source)!.push(edge.target)
    preds.get(edge.target)!.push(edge.source)
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }

  // Kahn with longest-path rank: rank(v) = 1 + max(rank(preds))
  const ranks = new Map<string, number>()
  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0)
  for (const id of queue) ranks.set(id, 0)

  const ordered: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    ordered.push(id)
    const base = ranks.get(id) ?? 0
    for (const next of succs.get(id) ?? []) {
      const candidate = base + 1
      ranks.set(next, Math.max(ranks.get(next) ?? 0, candidate))
      const nextDeg = (indegree.get(next) ?? 0) - 1
      indegree.set(next, nextDeg)
      if (nextDeg === 0) queue.push(next)
    }
  }

  // Nodes only reachable via back edges / cycles: park at max+1 or 0.
  let maxRank = 0
  for (const rank of ranks.values()) maxRank = Math.max(maxRank, rank)
  for (const id of ids) {
    if (!ranks.has(id)) {
      // Isolated or cyclic remainder — keep near top if no preds, else below.
      const hasPred = (preds.get(id) ?? []).length > 0
      ranks.set(id, hasPred ? maxRank + 1 : 0)
    }
  }

  return ranks
}

export function layersFromRanks(
  ranks: Map<string, number>,
  nodeIds: string[],
): string[][] {
  let maxRank = 0
  for (const id of nodeIds) {
    maxRank = Math.max(maxRank, ranks.get(id) ?? 0)
  }
  const layers: string[][] = Array.from({ length: maxRank + 1 }, () => [])
  for (const id of nodeIds) {
    const rank = ranks.get(id) ?? 0
    layers[rank]!.push(id)
  }
  // Stable initial order by id
  for (const layer of layers) {
    layer.sort((a, b) => a.localeCompare(b))
  }
  return layers
}

export function forwardEdgesOf(
  graph: SemanticLayoutGraph,
): SemanticLayoutEdge[] {
  return graph.edges.filter((edge) => edge.role === 'forward')
}
