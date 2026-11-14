/**
 * C4-inspired multi-port assignment for Loops Graph workflow edges.
 *
 * Preserves Loop-specific rules:
 * - Agent nodes: one attach per side (S corridor / wiring unchanged)
 * - Condition / Human Approval diamonds: one attach per corner (N/E/S/W)
 * - Other rectangular nodes: multiple slots per side (3 L/R, 5 T/B)
 * - On any node, an in-stub and out-stub never share the same (side, index)
 */

import {
  isConfigNode,
  type IntentEdgePort,
  type IntentGraph,
  type IntentGraphEdge,
  type IntentGraphNode,
} from '@contracts/index'
import { isDiamondLoopNode } from './loopNodeVisuals'
import {
  LOOP_NODE_H,
  LOOP_NODE_W,
  nearestPort,
  portPoint,
  type Point,
} from './loopEdgeRouting'

export const LOOP_PORTS_LEFT_RIGHT = 3
/** Odd so a lone top/bottom edge lands on the center slot and stays colinear with the spine. */
export const LOOP_PORTS_TOP_BOTTOM = 5
export const LOOP_MIN_PORT_GAP = 28

const SIDES: IntentEdgePort[] = ['n', 'e', 's', 'w']

export type LoopPortAssignment = {
  sourcePort: IntentEdgePort
  targetPort: IntentEdgePort
  sourcePortIndex: number
  targetPortIndex: number
  sourceAlong: number
  targetAlong: number
  sourceSlotCount: number
  targetSlotCount: number
}

export function fixedPortAlongs(count: number): number[] {
  if (count <= 1) return [0.5]
  const out: number[] = []
  for (let i = 0; i < count; i += 1) {
    out.push((i + 1) / (count + 1))
  }
  return out
}

export function selectCenteredPortIndices(
  count: number,
  need: number,
): number[] {
  const n = Math.max(1, count)
  const take = Math.max(1, Math.min(need, n))
  if (take >= n) return Array.from({ length: n }, (_, i) => i)
  if (take === 1) return [Math.floor((n - 1) / 2)]
  if (take === 2) {
    if (n === 3) return [0, 2]
    if (n === 4) return [1, 2]
    if (n % 2 === 0) {
      const mid = n / 2
      return [mid - 1, mid]
    }
    const mid = Math.floor(n / 2)
    return [mid - 1, mid + 1]
  }
  const alongs = fixedPortAlongs(n)
  return alongs
    .map((_, index) => index)
    .sort(
      (a, b) =>
        Math.abs(alongs[a]! - 0.5) - Math.abs(alongs[b]! - 0.5) || a - b,
    )
    .slice(0, take)
    .sort((a, b) => a - b)
}

/** Nodes that keep a single mid-side (or corner) attach per face. */
export function isSingleSlotLoopNode(node: IntentGraphNode): boolean {
  if (isConfigNode(node)) return true
  if (isDiamondLoopNode(node)) return true
  return (node.type ?? 'agent') === 'agent'
}

export function loopSidePortCapacity(
  node: IntentGraphNode,
  side: IntentEdgePort,
  width: number,
  height: number,
): number {
  if (isConfigNode(node)) return 0
  if (isSingleSlotLoopNode(node)) return 1
  const target =
    side === 'e' || side === 'w' ? LOOP_PORTS_LEFT_RIGHT : LOOP_PORTS_TOP_BOTTOM
  const length = side === 'e' || side === 'w' ? height : width
  const bySpace = Math.max(
    1,
    Math.floor((length - 20) / LOOP_MIN_PORT_GAP) + 1,
  )
  return Math.min(target, bySpace)
}

function mapSide(port: IntentEdgePort): 'n' | 'e' | 's' | 'w' {
  return port
}

function rankSidesForRole(
  from: Point,
  to: Point,
  role: 'source' | 'target',
): IntentEdgePort[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const facing: IntentEdgePort =
    role === 'source'
      ? Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? 'e'
          : 'w'
        : dy >= 0
          ? 's'
          : 'n'
      : Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? 'w'
          : 'e'
        : dy >= 0
          ? 'n'
          : 's'
  const secondary: IntentEdgePort =
    role === 'source'
      ? Math.abs(dx) >= Math.abs(dy)
        ? dy >= 0
          ? 's'
          : 'n'
        : dx >= 0
          ? 'e'
          : 'w'
      : Math.abs(dx) >= Math.abs(dy)
        ? dy >= 0
          ? 'n'
          : 's'
        : dx >= 0
          ? 'w'
          : 'e'
  const opposite: Record<IntentEdgePort, IntentEdgePort> = {
    n: 's',
    s: 'n',
    e: 'w',
    w: 'e',
  }
  const rest = SIDES.filter(
    (side) =>
      side !== facing && side !== secondary && side !== opposite[facing],
  )
  return [facing, secondary, opposite[facing], ...rest].filter(
    (side, index, arr) => arr.indexOf(side) === index,
  )
}

const SIDE_DIR: Record<IntentEdgePort, Point> = {
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  e: { x: 1, y: 0 },
  w: { x: -1, y: 0 },
}

/**
 * Bends an orthogonal wire needs between two side midpoints, ignoring
 * obstacles: 0 straight, 1 L, 2 Z / U, 3–4 when it must wrap around.
 */
export function estimateOrthogonalBends(
  sourcePoint: Point,
  sourceSide: IntentEdgePort,
  targetPoint: Point,
  targetSide: IntentEdgePort,
): number {
  const ds = SIDE_DIR[sourceSide]
  const dt = SIDE_DIR[targetSide]
  const dx = targetPoint.x - sourcePoint.x
  const dy = targetPoint.y - sourcePoint.y
  // Progress of the target along the source exit, and of the source along the
  // target's outward normal (the wire arrives travelling against it).
  const ahead = dx * ds.x + dy * ds.y
  const behindTarget = -(dx * dt.x + dy * dt.y)
  const sourceVertical = ds.x === 0
  const targetVertical = dt.x === 0
  if (sourceVertical === targetVertical) {
    const opposite = ds.x === -dt.x && ds.y === -dt.y
    if (opposite) {
      const lateral = sourceVertical ? Math.abs(dx) : Math.abs(dy)
      if (ahead > 0 && lateral < 2) return 0
      return ahead > 0 ? 2 : 4
    }
    return 2
  }
  return ahead > 0 && behindTarget > 0 ? 1 : 3
}

type SlotRole = 'in' | 'out'

type Occupancy = Map<string, SlotRole>

function slotKey(nodeId: string, side: IntentEdgePort, index: number): string {
  return `${nodeId}:${side}:${index}`
}

function sideKey(nodeId: string, side: IntentEdgePort): string {
  return `${nodeId}:${side}`
}

/**
 * Assign cardinal side + slot index for every workflow edge.
 * Skips `provides` (Agent↔config uses wiring ports, not these slots).
 */
export function assignLoopWorkflowPorts(input: {
  draft: IntentGraph
  sizeOf: (node: IntentGraphNode) => { width: number; height: number }
}): Map<string, LoopPortAssignment> {
  const { draft, sizeOf } = input
  const byId = new Map(draft.nodes.map((node) => [node.id, node]))
  const workflowEdges = draft.edges.filter((edge) => edge.kind !== 'provides')
  const result = new Map<string, LoopPortAssignment>()
  if (workflowEdges.length === 0) return result

  const occupancy: Occupancy = new Map()
  const sideOutCount = new Map<string, number>()
  const sideInCount = new Map<string, number>()

  const capacity = (node: IntentGraphNode, side: IntentEdgePort) => {
    const size = sizeOf(node)
    return loopSidePortCapacity(node, side, size.width, size.height)
  }

  const canUseSlot = (
    nodeId: string,
    side: IntentEdgePort,
    index: number,
    role: SlotRole,
  ): boolean => {
    const existing = occupancy.get(slotKey(nodeId, side, index))
    if (!existing) return true
    // Same role may share only when over capacity (handled by caller).
    // Opposite role must never share.
    return existing === role
  }

  const reserveSlot = (
    nodeId: string,
    side: IntentEdgePort,
    index: number,
    role: SlotRole,
  ) => {
    occupancy.set(slotKey(nodeId, side, index), role)
    const sk = sideKey(nodeId, side)
    if (role === 'out') {
      sideOutCount.set(sk, (sideOutCount.get(sk) ?? 0) + 1)
    } else {
      sideInCount.set(sk, (sideInCount.get(sk) ?? 0) + 1)
    }
  }

  const pickSlot = (
    node: IntentGraphNode,
    preferredSides: IntentEdgePort[],
    role: SlotRole,
    lockedSide?: IntentEdgePort,
    lockedIndex?: number,
  ): { side: IntentEdgePort; index: number; along: number; cap: number } => {
    const sides = lockedSide
      ? [lockedSide, ...preferredSides.filter((s) => s !== lockedSide)]
      : preferredSides

    for (const side of sides) {
      const cap = capacity(node, side)
      if (cap <= 0) continue
      const alongs = fixedPortAlongs(cap)

      if (
        lockedSide === side &&
        lockedIndex != null &&
        lockedIndex >= 0 &&
        lockedIndex < cap &&
        canUseSlot(node.id, side, lockedIndex, role)
      ) {
        const existing = occupancy.get(slotKey(node.id, side, lockedIndex))
        if (!existing || existing === role) {
          return {
            side,
            index: lockedIndex,
            along: alongs[lockedIndex] ?? 0.5,
            cap,
          }
        }
      }

      // Prefer completely free slots first (no in/out mix risk).
      for (let index = 0; index < cap; index += 1) {
        if (!occupancy.has(slotKey(node.id, side, index))) {
          return {
            side,
            index,
            along: alongs[index] ?? 0.5,
            cap,
          }
        }
      }

      // Then same-role reuse when the side is over-subscribed.
      for (let index = 0; index < cap; index += 1) {
        if (canUseSlot(node.id, side, index, role)) {
          const existing = occupancy.get(slotKey(node.id, side, index))
          if (existing === role) {
            return {
              side,
              index,
              along: alongs[index] ?? 0.5,
              cap,
            }
          }
        }
      }
    }

    // Fallback: first portable side, first index (should be rare).
    const side = sides.find((s) => capacity(node, s) > 0) ?? 'e'
    const cap = Math.max(1, capacity(node, side))
    return { side, index: 0, along: 0.5, cap }
  }

  // Harder (busier) nodes first, matching C4 assignEdgePorts.
  const stubCount = new Map<string, number>()
  for (const edge of workflowEdges) {
    stubCount.set(edge.source, (stubCount.get(edge.source) ?? 0) + 1)
    stubCount.set(edge.target, (stubCount.get(edge.target) ?? 0) + 1)
  }
  const ordered = [...workflowEdges].sort((a, b) => {
    const aHard =
      (stubCount.get(a.source) ?? 0) + (stubCount.get(a.target) ?? 0)
    const bHard =
      (stubCount.get(b.source) ?? 0) + (stubCount.get(b.target) ?? 0)
    return bHard - aHard
  })

  // Pass 1: choose sides with facing preference + capacity.
  type SideChoice = {
    edge: IntentGraphEdge
    sourceSide: IntentEdgePort
    targetSide: IntentEdgePort
  }
  const sideChoices: SideChoice[] = []
  const tentativeSideOut = new Map<string, number>()
  const tentativeSideIn = new Map<string, number>()

  const canReserveSide = (
    node: IntentGraphNode,
    side: IntentEdgePort,
    role: SlotRole,
    tentative: Map<string, number>,
  ) => {
    const cap = capacity(node, side)
    if (cap <= 0) return false
    // Single-slot faces (Agent sides, diamond corners) can't mix in and out.
    if (cap === 1) {
      const oppositeTentative =
        (role === 'out' ? tentativeSideIn : tentativeSideOut).get(
          sideKey(node.id, side),
        ) ?? 0
      if (oppositeTentative > 0) return false
    }
    const used =
      (role === 'out'
        ? sideOutCount.get(sideKey(node.id, side))
        : sideInCount.get(sideKey(node.id, side))) ?? 0
    const pending = tentative.get(sideKey(node.id, side)) ?? 0
    // Leave room so opposite role can still claim distinct slots when possible.
    const oppositeUsed =
      (role === 'out'
        ? sideInCount.get(sideKey(node.id, side))
        : sideOutCount.get(sideKey(node.id, side))) ?? 0
    return used + pending + oppositeUsed < cap || used + pending < cap
  }

  for (const edge of ordered) {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) continue
    const sourceSize = sizeOf(source)
    const targetSize = sizeOf(target)
    const sc = {
      x: source.position.x + sourceSize.width / 2,
      y: source.position.y + sourceSize.height / 2,
    }
    const tc = {
      x: target.position.x + targetSize.width / 2,
      y: target.position.y + targetSize.height / 2,
    }

    const sourceRanks = edge.sourcePort
      ? [
          edge.sourcePort,
          ...rankSidesForRole(sc, tc, 'source').filter(
            (s) => s !== edge.sourcePort,
          ),
        ]
      : rankSidesForRole(sc, tc, 'source')
    const targetRanks = edge.targetPort
      ? [
          edge.targetPort,
          ...rankSidesForRole(sc, tc, 'target').filter(
            (s) => s !== edge.targetPort,
          ),
        ]
      : rankSidesForRole(sc, tc, 'target')

    let chosenSource = sourceRanks[0]!
    let chosenTarget = targetRanks[0]!
    let best = Number.NEGATIVE_INFINITY

    for (const sSide of sourceRanks) {
      if (!canReserveSide(source, sSide, 'out', tentativeSideOut)) continue
      for (const tSide of targetRanks) {
        if (!canReserveSide(target, tSide, 'in', tentativeSideIn)) continue
        let score = 0
        score += (sourceRanks.length - sourceRanks.indexOf(sSide)) * 10
        score += (targetRanks.length - targetRanks.indexOf(tSide)) * 10
        const opposite =
          (sSide === 'e' && tSide === 'w') ||
          (sSide === 'w' && tSide === 'e') ||
          (sSide === 'n' && tSide === 's') ||
          (sSide === 's' && tSide === 'n')
        if (opposite) score += 8
        const sp = portPoint(source, sSide, sourceSize.width, sourceSize.height)
        const tp = portPoint(target, tSide, targetSize.width, targetSize.height)
        score -= estimateOrthogonalBends(sp, sSide, tp, tSide) * 40
        score -= (Math.abs(tp.x - sp.x) + Math.abs(tp.y - sp.y)) * 0.02
        if (edge.sourcePort === sSide) score += 200
        if (edge.targetPort === tSide) score += 200
        if (score > best) {
          best = score
          chosenSource = sSide
          chosenTarget = tSide
        }
      }
    }

    if (best === Number.NEGATIVE_INFINITY) {
      chosenSource =
        sourceRanks.find((s) => capacity(source, s) > 0) ??
        nearestPort(source, tc, sourceSize.width, sourceSize.height)
      chosenTarget =
        targetRanks.find((s) => capacity(target, s) > 0) ??
        nearestPort(target, sc, targetSize.width, targetSize.height)
    }

    tentativeSideOut.set(
      sideKey(source.id, chosenSource),
      (tentativeSideOut.get(sideKey(source.id, chosenSource)) ?? 0) + 1,
    )
    tentativeSideIn.set(
      sideKey(target.id, chosenTarget),
      (tentativeSideIn.get(sideKey(target.id, chosenTarget)) ?? 0) + 1,
    )
    sideChoices.push({
      edge,
      sourceSide: mapSide(chosenSource),
      targetSide: mapSide(chosenTarget),
    })
  }

  // Pass 2: assign concrete indices with in/out exclusivity.
  // Group stubs per node+side, sort by other endpoint, pick distinct slots.
  type Stub = {
    edgeId: string
    role: SlotRole
    lockedIndex?: number
  }
  const groups = new Map<string, Stub[]>()
  for (const choice of sideChoices) {
    const sk = sideKey(choice.edge.source, choice.sourceSide)
    const tk = sideKey(choice.edge.target, choice.targetSide)
    const sList = groups.get(sk) ?? []
    sList.push({
      edgeId: choice.edge.id,
      role: 'out',
      lockedIndex: choice.edge.sourcePortIndex,
    })
    groups.set(sk, sList)
    const tList = groups.get(tk) ?? []
    tList.push({
      edgeId: choice.edge.id,
      role: 'in',
      lockedIndex: choice.edge.targetPortIndex,
    })
    groups.set(tk, tList)
  }

  const stubSlot = new Map<
    string,
    { side: IntentEdgePort; index: number; along: number; cap: number }
  >()

  for (const [groupKey, stubs] of groups) {
    const [nodeId, sideRaw] = groupKey.split(':') as [string, IntentEdgePort]
    const side = sideRaw
    const node = byId.get(nodeId)
    if (!node) continue
    const cap = capacity(node, side)
    const alongs = fixedPortAlongs(cap)
    const size = sizeOf(node)

    const sorted = [...stubs].sort((a, b) => {
      const edgeA = workflowEdges.find((e) => e.id === a.edgeId)
      const edgeB = workflowEdges.find((e) => e.id === b.edgeId)
      if (!edgeA || !edgeB) return 0
      const otherA = byId.get(
        a.role === 'out' ? edgeA.target : edgeA.source,
      )
      const otherB = byId.get(
        b.role === 'out' ? edgeB.target : edgeB.source,
      )
      if (!otherA || !otherB) return 0
      const aSize = sizeOf(otherA)
      const bSize = sizeOf(otherB)
      const ac = {
        x: otherA.position.x + aSize.width / 2,
        y: otherA.position.y + aSize.height / 2,
      }
      const bc = {
        x: otherB.position.x + bSize.width / 2,
        y: otherB.position.y + bSize.height / 2,
      }
      if (side === 'e' || side === 'w') return ac.y - bc.y
      return ac.x - bc.x
    })

    // Partition: assign outs and ins to disjoint index sets when possible.
    const outs = sorted.filter((s) => s.role === 'out')
    const ins = sorted.filter((s) => s.role === 'in')
    const freeIndices = Array.from({ length: cap }, (_, i) => i)

    const takeIndices = (need: number, preferCentered: boolean) => {
      if (need <= 0) return [] as number[]
      const pool = [...freeIndices]
      if (pool.length === 0) return [] as number[]
      const chosen = preferCentered
        ? selectCenteredPortIndices(pool.length, Math.min(need, pool.length)).map(
            (i) => pool[i]!,
          )
        : pool.slice(0, need)
      for (const index of chosen) {
        const at = freeIndices.indexOf(index)
        if (at >= 0) freeIndices.splice(at, 1)
      }
      return chosen
    }

    // Prefer giving unique slots to the larger role group first.
    const primary = outs.length >= ins.length ? outs : ins
    const secondary = outs.length >= ins.length ? ins : outs
    const primaryIdx = takeIndices(primary.length, true)
    const secondaryIdx = takeIndices(secondary.length, true)

    const assignGroup = (group: Stub[], indices: number[]) => {
      group.forEach((stub, i) => {
        let index =
          stub.lockedIndex != null &&
          stub.lockedIndex >= 0 &&
          stub.lockedIndex < cap &&
          canUseSlot(nodeId, side, stub.lockedIndex, stub.role)
            ? stub.lockedIndex
            : (indices[i] ?? indices[indices.length - 1] ?? 0)

        // If locked/primary pick collides with opposite role, find another.
        if (!canUseSlot(nodeId, side, index, stub.role)) {
          const alt = Array.from({ length: cap }, (_, j) => j).find((j) =>
            canUseSlot(nodeId, side, j, stub.role),
          )
          if (alt != null) index = alt
        }

        // Last resort: still avoid opposite role — spill to another side.
        if (!canUseSlot(nodeId, side, index, stub.role)) {
          const ranks = rankSidesForRole(
            {
              x: node.position.x + size.width / 2,
              y: node.position.y + size.height / 2,
            },
            { x: node.position.x + size.width / 2 + 40, y: node.position.y },
            stub.role === 'out' ? 'source' : 'target',
          )
          const picked = pickSlot(node, ranks, stub.role)
          reserveSlot(node.id, picked.side, picked.index, stub.role)
          stubSlot.set(`${stub.edgeId}:${stub.role}`, picked)
          return
        }

        reserveSlot(nodeId, side, index, stub.role)
        stubSlot.set(`${stub.edgeId}:${stub.role}`, {
          side,
          index,
          along: alongs[index] ?? 0.5,
          cap,
        })
      })
    }

    assignGroup(primary, primaryIdx)
    assignGroup(secondary, secondaryIdx)
  }

  for (const choice of sideChoices) {
    const sourceStub =
      stubSlot.get(`${choice.edge.id}:out`) ??
      (() => {
        const node = byId.get(choice.edge.source)!
        const ranks = [choice.sourceSide]
        return pickSlot(
          node,
          ranks,
          'out',
          choice.sourceSide,
          choice.edge.sourcePortIndex,
        )
      })()
    const targetStub =
      stubSlot.get(`${choice.edge.id}:in`) ??
      (() => {
        const node = byId.get(choice.edge.target)!
        const ranks = [choice.targetSide]
        return pickSlot(
          node,
          ranks,
          'in',
          choice.targetSide,
          choice.edge.targetPortIndex,
        )
      })()

    if (!stubSlot.has(`${choice.edge.id}:out`)) {
      reserveSlot(
        choice.edge.source,
        sourceStub.side,
        sourceStub.index,
        'out',
      )
    }
    if (!stubSlot.has(`${choice.edge.id}:in`)) {
      reserveSlot(
        choice.edge.target,
        targetStub.side,
        targetStub.index,
        'in',
      )
    }

    result.set(choice.edge.id, {
      sourcePort: sourceStub.side,
      targetPort: targetStub.side,
      sourcePortIndex: sourceStub.index,
      targetPortIndex: targetStub.index,
      sourceAlong: sourceStub.along,
      targetAlong: targetStub.along,
      sourceSlotCount: sourceStub.cap,
      targetSlotCount: targetStub.cap,
    })
  }

  return result
}

/** Attach point for a side + slot (along fraction). */
export function loopPortAttachPoint(
  node: Pick<IntentGraphNode, 'position'>,
  port: IntentEdgePort,
  width: number,
  height: number,
  along = 0.5,
): Point {
  return portPoint(node, port, width, height, along)
}

/** List visible port slots for UI handles on a node. */
export function loopNodePortSlots(
  node: IntentGraphNode,
  width: number,
  height: number,
  allowedSides: readonly IntentEdgePort[] = SIDES,
): Array<{ port: IntentEdgePort; index: number; along: number }> {
  const slots: Array<{ port: IntentEdgePort; index: number; along: number }> =
    []
  for (const side of allowedSides) {
    const cap = loopSidePortCapacity(node, side, width, height)
    if (cap <= 0) continue
    const alongs = fixedPortAlongs(cap)
    alongs.forEach((along, index) => {
      slots.push({ port: side, index, along })
    })
  }
  return slots
}
