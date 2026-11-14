import type {
  IntentGraph,
  IntentGraphNode,
  LoopSpec,
  LoopSpecEdge,
  LoopSpecNode,
} from '@contracts/index'
import {
  buildOrthogonalEdgePoints,
  pointsToRoundedPath,
} from './loopEdgeRouting'
import { layoutNodesSemantically } from './semanticLayout'

export const REVIEW_NODE_W = 148
export const REVIEW_NODE_H = 40
const GAP_X = 48
const GAP_Y = 64
const PAD = 28

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
  kind: 'parallel' | 'loop' | 'workgroup'
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
  spec: Pick<LoopSpec, 'nodes' | 'edges' | 'workGroups'>,
  pos: Map<string, ReviewLayoutNode>,
): ReviewLayoutGroup[] {
  const groups: ReviewLayoutGroup[] = []

  for (const workGroup of spec.workGroups ?? []) {
    const boxes = workGroup.memberNodeIds
      .map((id) => pos.get(id))
      .filter((box): box is ReviewLayoutNode => Boolean(box))
    if (boxes.length === 0) continue
    const minX = Math.min(...boxes.map((b) => b.x)) - 14
    const minY = Math.min(...boxes.map((b) => b.y)) - 22
    const maxX = Math.max(...boxes.map((b) => b.x + b.width)) + 14
    const maxY = Math.max(...boxes.map((b) => b.y + b.height)) + 14
    groups.push({
      id: `workgroup_${workGroup.id}`,
      kind: 'workgroup',
      nodeIds: [...workGroup.memberNodeIds],
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      label: `Work Group · ${workGroup.title}`,
    })
  }

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
  // TB spine: south → north
  const start = { x: from.x + from.width / 2, y: from.y + from.height }
  const end = { x: to.x + to.width / 2, y: to.y }
  const points = buildOrthogonalEdgePoints({
    start,
    end,
    sourcePort: 's',
    targetPort: 'n',
    offset: 20,
  })
  return {
    d: pointsToRoundedPath(points),
    mid: {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    },
  }
}

function routeFeedback(
  from: ReviewLayoutNode,
  to: ReviewLayoutNode,
): { d: string; mid: { x: number; y: number } } {
  // Side corridor: exit east, re-enter east (avoids crossing the TB spine).
  const start = { x: from.x + from.width, y: from.y + from.height / 2 }
  const end = { x: to.x + to.width, y: to.y + to.height / 2 }
  const points = buildOrthogonalEdgePoints({
    start,
    end,
    sourcePort: 'e',
    targetPort: 'e',
    offset: 28,
    laneOffset: 48,
  })
  const rightX = Math.max(...points.map((p) => p.x))
  return {
    d: pointsToRoundedPath(points),
    mid: { x: rightX - 8, y: (start.y + end.y) / 2 },
  }
}

function specToLayoutDraft(
  spec: Pick<LoopSpec, 'nodes' | 'edges'>,
): Pick<IntentGraph, 'nodes' | 'edges'> {
  const nodes: IntentGraphNode[] = spec.nodes.map((node) => ({
    id: node.id,
    title: node.goal || node.id,
    prompt: node.goal || '',
    type: (node.type as IntentGraphNode['type']) ?? 'agent',
    position: { x: 0, y: 0 },
  }))
  const edges: IntentGraph['edges'] = spec.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    kind:
      edge.kind === 'fallback'
        ? 'depends'
        : (edge.kind as IntentGraph['edges'][number]['kind']),
    prompt: edge.when ?? '',
    ...(edge.branchKey ? { branchKey: edge.branchKey } : {}),
  }))
  return { nodes, edges }
}

/** Auto-layout a compiled LoopSpec for the read-only Review Path Map (TB). */
export function layoutLoopReviewPath(
  spec: Pick<LoopSpec, 'nodes' | 'edges'>,
): ReviewLayout {
  const orderedIds = topoOrder(spec.nodes, spec.edges)
  const sizes = spec.nodes.map((node) => ({
    id: node.id,
    width: REVIEW_NODE_W,
    height: REVIEW_NODE_H,
  }))
  const laidOut = layoutNodesSemantically({
    draft: specToLayoutDraft(spec),
    sizes,
    options: {
      origin: { x: PAD, y: PAD + 28 },
      gapX: GAP_X,
      gapY: GAP_Y,
    },
  })

  const placed: ReviewLayoutNode[] = spec.nodes.map((node) => {
    const pos = laidOut.positions.get(node.id) ?? {
      x: PAD,
      y: PAD + 28,
    }
    return {
      id: node.id,
      x: pos.x,
      y: pos.y,
      width: REVIEW_NODE_W,
      height: REVIEW_NODE_H,
    }
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
  const feedbackLift = edges.some((e) => e.kind === 'feedback') ? 56 : 0
  const groupPad = groups.length > 0 ? 16 : 0

  return {
    width: Math.max(320, maxRight + PAD + groupPad + feedbackLift),
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
