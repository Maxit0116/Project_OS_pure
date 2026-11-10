import type { LoopSpec, LoopSpecEdge, LoopSpecNode } from '@contracts/index'

export const REVIEW_NODE_W = 148
export const REVIEW_NODE_H = 40
const GAP_X = 40
const GAP_Y = 56
const PAD = 28
const ROW_MAX = 5

export type ReviewLayoutNode = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type ReviewLayoutEdge = {
  id: string
  from: string
  to: string
  kind: LoopSpecEdge['kind']
  d: string
  mid: { x: number; y: number }
  branchKey?: string
  when?: string
}

export type ReviewLayoutGroup = {
  id: string
  kind: 'parallel' | 'loop'
  nodeIds: string[]
  x: number
  y: number
  width: number
  height: number
  label: string
}

export type ReviewLayout = {
  width: number
  height: number
  nodes: ReviewLayoutNode[]
  edges: ReviewLayoutEdge[]
  orderedNodeIds: string[]
  groups: ReviewLayoutGroup[]
}

function detectReviewGroups(
  spec: Pick<LoopSpec, 'nodes' | 'edges'>,
  pos: Map<string, ReviewLayoutNode>,
): ReviewLayoutGroup[] {
  const groups: ReviewLayoutGroup[] = []
  const depends = spec.edges.filter((edge) => edge.kind === 'depends')
  const out = new Map<string, string[]>()
  const inn = new Map<string, string[]>()
  for (const edge of depends) {
    const outs = out.get(edge.from) ?? []
    outs.push(edge.to)
    out.set(edge.from, outs)
    const ins = inn.get(edge.to) ?? []
    ins.push(edge.from)
    inn.set(edge.to, ins)
  }

  for (const [fromId, children] of out) {
    if (children.length < 2) continue
    const memberIds = new Set<string>([fromId, ...children])
    for (const [toId, parents] of inn) {
      if (parents.length >= 2 && parents.every((p) => children.includes(p))) {
        memberIds.add(toId)
      }
    }
    const boxes = [...memberIds]
      .map((id) => pos.get(id))
      .filter((box): box is ReviewLayoutNode => Boolean(box))
    if (boxes.length < 2) continue
    const minX = Math.min(...boxes.map((b) => b.x)) - 12
    const minY = Math.min(...boxes.map((b) => b.y)) - 18
    const maxX = Math.max(...boxes.map((b) => b.x + b.width)) + 12
    const maxY = Math.max(...boxes.map((b) => b.y + b.height)) + 12
    groups.push({
      id: `parallel_${fromId}`,
      kind: 'parallel',
      nodeIds: [...memberIds],
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      label: 'Parallel',
    })
  }

  for (const edge of spec.edges) {
    if (edge.kind !== 'feedback') continue
    const from = pos.get(edge.from)
    const to = pos.get(edge.to)
    if (!from || !to) continue
    const minX = Math.min(from.x, to.x) - 12
    const minY = Math.min(from.y, to.y) - 28
    const maxX = Math.max(from.x + from.width, to.x + to.width) + 12
    const maxY = Math.max(from.y + from.height, to.y + to.height) + 12
    groups.push({
      id: `loop_${edge.id}`,
      kind: 'loop',
      nodeIds: [edge.from, edge.to],
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      label: 'Loop',
    })
  }

  return groups
}

function forwardEdges(edges: LoopSpecEdge[]): LoopSpecEdge[] {
  return edges.filter((edge) => edge.kind === 'depends' || edge.kind === 'conditional')
}

function topoOrder(nodes: LoopSpecNode[], edges: LoopSpecEdge[]): string[] {
  const ids = nodes.map((node) => node.id)
  const idSet = new Set(ids)
  const indegree = new Map(ids.map((id) => [id, 0]))
  const adj = new Map(ids.map((id) => [id, [] as string[]]))

  for (const edge of forwardEdges(edges)) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to)) continue
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)
    adj.get(edge.from)!.push(edge.to)
  }

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0)
  const ordered: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    ordered.push(id)
    for (const next of adj.get(id) ?? []) {
      const nextDeg = (indegree.get(next) ?? 0) - 1
      indegree.set(next, nextDeg)
      if (nextDeg === 0) queue.push(next)
    }
  }

  if (ordered.length !== ids.length) {
    // Cycle in forward edges — fall back to declaration order.
    return ids
  }
  return ordered
}

function routeForward(
  from: ReviewLayoutNode,
  to: ReviewLayoutNode,
): { d: string; mid: { x: number; y: number } } {
  const x1 = from.x + from.width
  const y1 = from.y + from.height / 2
  const x2 = to.x
  const y2 = to.y + to.height / 2
  const dx = Math.max(24, (x2 - x1) / 2)
  const c1x = x1 + dx
  const c2x = x2 - dx
  return {
    d: `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`,
    mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
  }
}

function routeFeedback(
  from: ReviewLayoutNode,
  to: ReviewLayoutNode,
): { d: string; mid: { x: number; y: number } } {
  const x1 = from.x + from.width / 2
  const y1 = from.y
  const x2 = to.x + to.width / 2
  const y2 = to.y
  const lift = 36 + Math.min(48, Math.abs(x1 - x2) * 0.08)
  const midY = Math.min(y1, y2) - lift
  return {
    d: `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`,
    mid: { x: (x1 + x2) / 2, y: midY + 8 },
  }
}

/** Auto-layout a compiled LoopSpec for the read-only Review Path Map. */
export function layoutLoopReviewPath(
  spec: Pick<LoopSpec, 'nodes' | 'edges'>,
): ReviewLayout {
  const orderedIds = topoOrder(spec.nodes, spec.edges)
  const byId = new Map(spec.nodes.map((node) => [node.id, node]))
  const placed: ReviewLayoutNode[] = []

  orderedIds.forEach((id, index) => {
    if (!byId.has(id)) return
    const col = index % ROW_MAX
    const row = Math.floor(index / ROW_MAX)
    placed.push({
      id,
      x: PAD + col * (REVIEW_NODE_W + GAP_X),
      y: PAD + 28 + row * (REVIEW_NODE_H + GAP_Y),
      width: REVIEW_NODE_W,
      height: REVIEW_NODE_H,
    })
  })

  const pos = new Map(placed.map((node) => [node.id, node]))
  const edges: ReviewLayoutEdge[] = []

  for (const edge of spec.edges) {
    const from = pos.get(edge.from)
    const to = pos.get(edge.to)
    if (!from || !to) continue
    const routed =
      edge.kind === 'feedback' ? routeFeedback(from, to) : routeForward(from, to)
    edges.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      kind: edge.kind,
      d: routed.d,
      mid: routed.mid,
      ...(edge.branchKey ? { branchKey: edge.branchKey } : {}),
      ...(edge.when ? { when: edge.when } : {}),
    })
  }

  const groups = detectReviewGroups(spec, pos)
  const maxRight = placed.reduce((m, n) => Math.max(m, n.x + n.width), PAD)
  const maxBottom = placed.reduce((m, n) => Math.max(m, n.y + n.height), PAD)
  const feedbackLift = edges.some((e) => e.kind === 'feedback') ? 40 : 0
  const groupPad = groups.length > 0 ? 16 : 0

  return {
    width: Math.max(320, maxRight + PAD + groupPad),
    height: Math.max(120, maxBottom + PAD + feedbackLift + groupPad),
    nodes: placed,
    edges,
    orderedNodeIds: orderedIds,
    groups,
  }
}

export function areReviewGatesReady(
  assumptions: ReadonlyArray<{ id: string }>,
  cycleGates: ReadonlyArray<{ edgeId: string }>,
  acceptedAssumptions: Record<string, boolean>,
  confirmedCycles: Record<string, boolean>,
): boolean {
  for (const item of assumptions) {
    if (!acceptedAssumptions[item.id]) return false
  }
  for (const gate of cycleGates) {
    if (!confirmedCycles[gate.edgeId]) return false
  }
  return true
}

export function isReviewCompileStale(
  draftRevision: number,
  compiledGraphRevision: number,
): boolean {
  return draftRevision !== compiledGraphRevision
}
