import { isConfigNode, type IntentGraph, type IntentGraphNode } from '@contracts/index'

/**
 * Order process nodes for a read-only marketplace plan summary.
 * Prefer flow-edge topological order; fall back to canvas position.
 */
export function orderDraftNodesForPlan(draft: IntentGraph): IntentGraphNode[] {
  const processNodes = draft.nodes.filter((node) => !isConfigNode(node))
  if (processNodes.length <= 1) return processNodes

  const ids = new Set(processNodes.map((node) => node.id))
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, string[]>()
  for (const id of ids) {
    incoming.set(id, 0)
    outgoing.set(id, [])
  }

  for (const edge of draft.edges) {
    if (edge.kind === 'provides') continue
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue
    if (edge.source === edge.target) continue
    outgoing.get(edge.source)!.push(edge.target)
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1)
  }

  const byId = new Map(processNodes.map((node) => [node.id, node]))
  const queue = processNodes
    .filter((node) => (incoming.get(node.id) ?? 0) === 0)
    .sort(compareByPosition)
    .map((node) => node.id)

  const ordered: IntentGraphNode[] = []
  const seen = new Set<string>()
  while (queue.length > 0) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    const node = byId.get(id)
    if (node) ordered.push(node)
    const nextIds = [...(outgoing.get(id) ?? [])].sort((a, b) => {
      const left = byId.get(a)
      const right = byId.get(b)
      if (!left || !right) return a.localeCompare(b)
      return compareByPosition(left, right)
    })
    for (const next of nextIds) {
      const remaining = (incoming.get(next) ?? 0) - 1
      incoming.set(next, remaining)
      if (remaining <= 0) queue.push(next)
    }
  }

  if (ordered.length === processNodes.length) return ordered

  const rest = processNodes
    .filter((node) => !seen.has(node.id))
    .sort(compareByPosition)
  return [...ordered, ...rest]
}

function compareByPosition(a: IntentGraphNode, b: IntentGraphNode): number {
  if (a.position.y !== b.position.y) return a.position.y - b.position.y
  if (a.position.x !== b.position.x) return a.position.x - b.position.x
  return a.id.localeCompare(b.id)
}
