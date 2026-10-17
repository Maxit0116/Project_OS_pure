/**
 * Classic C4-style orthogonal (multi-bend) edge routing with:
 * - ports on all four sides of each node (or a shape-specific subset)
 * - same-side sharing when space allows (readability)
 * - hard per-side port limit to avoid crowded attachments
 * - label-aware lane spacing + crossing avoidance
 * - irregular silhouettes (person / database / queue / …) attach to
 *   straight body edges via shapePortProfile
 */

import type { C4ShapeKind } from './types'
import {
  getShapePortProfile,
  sideAttachMode,
} from './shapePortProfile'

export interface RoutePoint {
  x: number
  y: number
}

export interface RouteRect {
  id: string
  x: number
  y: number
  width: number
  height: number
  /** When set, port layout follows the silhouette profile for this shape. */
  shape?: C4ShapeKind
}

export type RouteSide = 'left' | 'right' | 'top' | 'bottom'

/** Left/right sides: 3 fixed ports, evenly dividing the edge. */
export const PORTS_LEFT_RIGHT = 3
/** Top/bottom sides: 4 fixed ports, evenly dividing the edge. */
export const PORTS_TOP_BOTTOM = 4
/** Largest per-side count (kept for callers that pass a single max). */
export const MAX_PORTS_PER_SIDE = PORTS_TOP_BOTTOM
/** Minimum spacing along a side used when shrinking tiny-node capacity. */
export const MIN_PORT_GAP = 28
/** @deprecated Equal division uses (i+1)/(n+1); kept for tests/compat. */
export const PORT_INSET = 0.2
/** Extra pad so labels never touch node chrome. */
export const LABEL_NODE_PAD = 8

export interface OrthogonalRouteInput {
  source: RouteRect
  target: RouteRect
  obstacles?: RouteRect[]
  reservedLabels?: RouteRect[]
  foreignWires?: RoutePoint[][]
  labelBox?: { width: number; height: number }
  /** Forced attachment sides (from global port assignment). */
  sourceSide?: RouteSide
  targetSide?: RouteSide
  /** Fixed port index on that side (0-based into fixedPortAlongs). */
  sourceSlot?: number
  sourceSlotCount?: number
  targetSlot?: number
  targetSlotCount?: number
  /** Exact along fraction from fixed port grid (preferred). */
  sourceAlong?: number
  targetAlong?: number
  parallelIndex?: number
  parallelCount?: number
  fanInIndex?: number
  fanInCount?: number
  fanOutIndex?: number
  fanOutCount?: number
  laneGap?: number
  edgeIndex?: number
  clearance?: number
  maxPortsPerSide?: number
}

export interface OrthogonalRouteResult {
  points: RoutePoint[]
  label: RoutePoint
  labelRect: RouteRect
  sourceSide: RouteSide
  targetSide: RouteSide
  sourceAlong: number
  targetAlong: number
  path: string
}

export interface PortAssignment {
  sourceSide: RouteSide
  targetSide: RouteSide
  sourceSlot: number
  sourceSlotCount: number
  targetSlot: number
  targetSlotCount: number
  sourceAlong: number
  targetAlong: number
  sourceShared: boolean
  targetShared: boolean
}

const DEFAULT_CLEARANCE = 40
const CORNER_RADIUS = 10
const MIN_LABEL_SEGMENT = 72
const LABEL_WIRE_PAD = 10
const MIN_LANE_GAP = 40
const ALL_SIDES: RouteSide[] = ['right', 'left', 'bottom', 'top']

/** Target fixed-port count for a side on a typical rectangular node. */
export function portsForSide(side: RouteSide): number {
  return side === 'left' || side === 'right' ? PORTS_LEFT_RIGHT : PORTS_TOP_BOTTOM
}

/** Silhouette body rect (AABB minus shape insets). Used for straight-edge ports. */
export function portBodyRect(node: RouteRect): RouteRect {
  const { bodyInset } = getShapePortProfile(node.shape)
  const left = bodyInset.left
  const right = bodyInset.right
  const top = bodyInset.top
  const bottom = bodyInset.bottom
  return {
    id: node.id,
    x: node.x + left,
    y: node.y + top,
    width: Math.max(1, node.width - left - right),
    height: Math.max(1, node.height - top - bottom),
    shape: node.shape,
  }
}

/**
 * Rect whose border hosts ports for `side`.
 * Most sides use the body; arcs/caps (database top, queue ends) use the outer AABB.
 */
export function portAttachRect(node: RouteRect, side: RouteSide): RouteRect {
  const profile = getShapePortProfile(node.shape)
  if (sideAttachMode(profile, side) === 'outer') {
    return node
  }
  return portBodyRect(node)
}

/** First ranked side that still has port capacity (skips disabled silhouette faces). */
export function firstPortableSide(
  rect: RouteRect,
  ranks: RouteSide[],
): RouteSide {
  for (const side of ranks) {
    if (sidePortCapacity(rect, side) > 0) return side
  }
  return ranks[0] ?? 'right'
}

/**
 * Fixed ports that equally divide a side: at (i+1)/(count+1).
 * - 3 → 0.25, 0.5, 0.75
 * - 4 → 0.2, 0.4, 0.6, 0.8
 */
export function fixedPortAlongs(count: number): number[] {
  if (count <= 1) return [0.5]
  const out: number[] = []
  for (let i = 0; i < count; i += 1) {
    out.push((i + 1) / (count + 1))
  }
  return out
}

/**
 * Which port indices to use when `need` stubs share a side of `count` ports.
 * Prefer centered slots for 1–2 stubs (symmetric when possible).
 */
export function selectCenteredPortIndices(count: number, need: number): number[] {
  const n = Math.max(1, count)
  const take = Math.max(1, Math.min(need, n))
  if (take >= n) return Array.from({ length: n }, (_, i) => i)

  if (take === 1) {
    // Exact center when odd; nearer-center lower index when even.
    return [Math.floor((n - 1) / 2)]
  }

  if (take === 2) {
    if (n === 3) return [0, 2] // 0.25 & 0.75 — symmetric about center
    if (n === 4) return [1, 2] // 0.4 & 0.6 — the two middle ports
    if (n % 2 === 0) {
      const mid = n / 2
      return [mid - 1, mid]
    }
    const mid = Math.floor(n / 2)
    return [mid - 1, mid + 1]
  }

  // 3+ but under capacity: grow outward from center.
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

function center(rect: RouteRect): RoutePoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/** Attach at an exact along fraction (0–1). No clamp — fixed ports use 0.25/0.5/0.75. */
export function attach(
  rect: RouteRect,
  side: RouteSide,
  along = 0.5,
): RoutePoint {
  const box = portAttachRect(rect, side)
  const t = Math.min(1, Math.max(0, along))
  switch (side) {
    case 'left':
      return { x: box.x, y: box.y + box.height * t }
    case 'right':
      return { x: box.x + box.width, y: box.y + box.height * t }
    case 'top':
      return { x: box.x + box.width * t, y: box.y }
    case 'bottom':
      return { x: box.x + box.width * t, y: box.y + box.height }
  }
}

/**
 * Force polyline endpoints (and their exit/approach stubs) onto fixed ports.
 * Mid-corridor bends may move; port positions on the node border stay exact.
 */
export function pinRouteToPorts(
  points: RoutePoint[],
  source: RouteRect,
  target: RouteRect,
  sourceSide: RouteSide,
  targetSide: RouteSide,
  sourceAlong: number,
  targetAlong: number,
): RoutePoint[] {
  if (points.length < 2) return points
  const start = attach(source, sourceSide, sourceAlong)
  const end = attach(target, targetSide, targetAlong)
  const next = points.map((point) => ({ ...point }))
  next[0] = start
  next[next.length - 1] = end

  if (next.length >= 2) {
    const stub = next[1]!
    if (sourceSide === 'left' || sourceSide === 'right') {
      next[1] = { x: stub.x, y: start.y }
    } else {
      next[1] = { x: start.x, y: stub.y }
    }
  }
  if (next.length >= 3) {
    const i = next.length - 2
    const stub = next[i]!
    if (targetSide === 'left' || targetSide === 'right') {
      next[i] = { x: stub.x, y: end.y }
    } else {
      next[i] = { x: end.x, y: stub.y }
    }
  }
  return simplify(next)
}

function inflate(rect: RouteRect, pad: number): RouteRect {
  return {
    id: rect.id,
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }
}

function rectsOverlap(a: RouteRect, b: RouteRect, pad = 0): boolean {
  return !(
    a.x + a.width + pad <= b.x ||
    b.x + b.width + pad <= a.x ||
    a.y + a.height + pad <= b.y ||
    b.y + b.height + pad <= a.y
  )
}

function segmentHitsRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rect: RouteRect,
): boolean {
  const minX = Math.min(ax, bx)
  const maxX = Math.max(ax, bx)
  const minY = Math.min(ay, by)
  const maxY = Math.max(ay, by)
  const rx1 = rect.x
  const ry1 = rect.y
  const rx2 = rect.x + rect.width
  const ry2 = rect.y + rect.height

  if (Math.abs(ay - by) < 1e-6) {
    if (ay < ry1 || ay > ry2) return false
    return maxX >= rx1 && minX <= rx2
  }
  if (Math.abs(ax - bx) < 1e-6) {
    if (ax < rx1 || ax > rx2) return false
    return maxY >= ry1 && minY <= ry2
  }
  return false
}

function polylineHitsObstacles(
  points: RoutePoint[],
  obstacles: RouteRect[],
): number {
  let hits = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    for (const obstacle of obstacles) {
      if (segmentHitsRect(a.x, a.y, b.x, b.y, obstacle)) hits += 1
    }
  }
  return hits
}

/** Orthogonal segment crossing (H×V). */
export function orthogonalCrossing(
  a1: RoutePoint,
  a2: RoutePoint,
  b1: RoutePoint,
  b2: RoutePoint,
): RoutePoint | null {
  const aH = Math.abs(a1.y - a2.y) < 1e-6
  const aV = Math.abs(a1.x - a2.x) < 1e-6
  const bH = Math.abs(b1.y - b2.y) < 1e-6
  const bV = Math.abs(b1.x - b2.x) < 1e-6
  if (aH && bV) {
    const y = a1.y
    const x = b1.x
    const inA =
      x >= Math.min(a1.x, a2.x) - 1e-6 && x <= Math.max(a1.x, a2.x) + 1e-6
    const inB =
      y >= Math.min(b1.y, b2.y) - 1e-6 && y <= Math.max(b1.y, b2.y) + 1e-6
    return inA && inB ? { x, y } : null
  }
  if (aV && bH) {
    const x = a1.x
    const y = b1.y
    const inA =
      y >= Math.min(a1.y, a2.y) - 1e-6 && y <= Math.max(a1.y, a2.y) + 1e-6
    const inB =
      x >= Math.min(b1.x, b2.x) - 1e-6 && x <= Math.max(b1.x, b2.x) + 1e-6
    return inA && inB ? { x, y } : null
  }
  return null
}

function collectCrossings(
  hostSeg: { a: RoutePoint; b: RoutePoint },
  foreignWires: RoutePoint[][],
): RoutePoint[] {
  const out: RoutePoint[] = []
  for (const wire of foreignWires) {
    for (let i = 0; i < wire.length - 1; i += 1) {
      const cross = orthogonalCrossing(hostSeg.a, hostSeg.b, wire[i]!, wire[i + 1]!)
      if (cross) out.push(cross)
    }
  }
  return out
}

function labelOverlapsWire(
  rect: RouteRect,
  foreignWires: RoutePoint[][],
  pad = LABEL_WIRE_PAD,
): number {
  const inflated = inflate(rect, pad)
  let hits = 0
  for (const wire of foreignWires) {
    for (let i = 0; i < wire.length - 1; i += 1) {
      const a = wire[i]!
      const b = wire[i + 1]!
      if (segmentHitsRect(a.x, a.y, b.x, b.y, inflated)) hits += 1
    }
  }
  return hits
}

function simplify(points: RoutePoint[]): RoutePoint[] {
  if (points.length <= 2) return points
  const out: RoutePoint[] = [points[0]!]
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = out[out.length - 1]!
    const cur = points[i]!
    const next = points[i + 1]!
    const colinearH =
      Math.abs(prev.y - cur.y) < 1e-6 && Math.abs(cur.y - next.y) < 1e-6
    const colinearV =
      Math.abs(prev.x - cur.x) < 1e-6 && Math.abs(cur.x - next.x) < 1e-6
    if (colinearH || colinearV) continue
    out.push(cur)
  }
  out.push(points[points.length - 1]!)
  return out
}

function hvh(start: RoutePoint, end: RoutePoint, midX: number): RoutePoint[] {
  return simplify([
    start,
    { x: midX, y: start.y },
    { x: midX, y: end.y },
    end,
  ])
}

function vhv(start: RoutePoint, end: RoutePoint, midY: number): RoutePoint[] {
  return simplify([
    start,
    { x: start.x, y: midY },
    { x: end.x, y: midY },
    end,
  ])
}

function outward(side: RouteSide): RoutePoint {
  switch (side) {
    case 'left':
      return { x: -1, y: 0 }
    case 'right':
      return { x: 1, y: 0 }
    case 'top':
      return { x: 0, y: -1 }
    case 'bottom':
      return { x: 0, y: 1 }
  }
}

function exitFrom(point: RoutePoint, side: RouteSide, dist: number): RoutePoint {
  const d = outward(side)
  return { x: point.x + d.x * dist, y: point.y + d.y * dist }
}

/**
 * How many ports fit on a side.
 * Default rectangle: left/right = 3, top/bottom = 4; shrink if the side is tiny.
 * Shaped nodes use `shapePortProfile.sidePorts` and the attach-rect length.
 */
export function sidePortCapacity(
  rect: RouteRect,
  side: RouteSide,
  maxPerSide?: number,
  minGap = MIN_PORT_GAP,
): number {
  const profile = getShapePortProfile(rect.shape)
  const profileTarget = profile.sidePorts[side]
  if (profileTarget <= 0) return 0
  // Never exceed the silhouette's per-side budget (e.g. database arcs = 1).
  const target =
    maxPerSide == null ? profileTarget : Math.min(profileTarget, maxPerSide)
  if (target <= 0) return 0
  const box = portAttachRect(rect, side)
  const length =
    side === 'left' || side === 'right' ? box.height : box.width
  const bySpace = Math.max(1, Math.floor((length - 20) / minGap) + 1)
  return Math.min(target, bySpace)
}

/**
 * Rank sides for leaving `from` toward `to` (source) or entering `to` from `from` (target).
 * All four sides are candidates; preferred face ranks first.
 */
export function rankSides(
  from: RouteRect,
  to: RouteRect,
  role: 'source' | 'target',
): RouteSide[] {
  const sc = center(from)
  const tc = center(to)
  const dx = tc.x - sc.x
  const dy = tc.y - sc.y

  // Source: leave on the side facing the target.
  // Target: enter on the side facing the source.
  const facing: RouteSide =
    role === 'source'
      ? Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? 'right'
          : 'left'
        : dy >= 0
          ? 'bottom'
          : 'top'
      : Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? 'left'
          : 'right'
        : dy >= 0
          ? 'top'
          : 'bottom'

  const secondary: RouteSide =
    role === 'source'
      ? Math.abs(dx) >= Math.abs(dy)
        ? dy >= 0
          ? 'bottom'
          : 'top'
        : dx >= 0
          ? 'right'
          : 'left'
      : Math.abs(dx) >= Math.abs(dy)
        ? dy >= 0
          ? 'top'
          : 'bottom'
        : dx >= 0
          ? 'left'
          : 'right'

  const opposite: Record<RouteSide, RouteSide> = {
    left: 'right',
    right: 'left',
    top: 'bottom',
    bottom: 'top',
  }
  const rest = ALL_SIDES.filter(
    (side) => side !== facing && side !== secondary && side !== opposite[facing],
  )
  return [facing, secondary, opposite[facing], ...rest].filter(
    (side, index, arr) => arr.indexOf(side) === index,
  )
}

function fanOffset(index: number, count: number, gap: number): number {
  if (count <= 1) return 0
  const mid = (count - 1) / 2
  return (index - mid) * gap
}

export function labelOverlapsNodes(
  rect: RouteRect,
  nodes: RouteRect[],
  pad = LABEL_NODE_PAD,
): boolean {
  return nodes.some((node) => rectsOverlap(rect, node, pad))
}

export function laneGapForLabels(
  heightA: number,
  heightB: number = heightA,
): number {
  return Math.max(MIN_LANE_GAP, heightA / 2 + heightB / 2 + 18)
}

interface SegmentInfo {
  a: RoutePoint
  b: RoutePoint
  mid: RoutePoint
  length: number
  horizontal: boolean
}

function segmentsOf(points: RoutePoint[]): SegmentInfo[] {
  const out: SegmentInfo[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length < 1) continue
    out.push({
      a,
      b,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      length,
      horizontal: Math.abs(a.y - b.y) < 1e-6,
    })
  }
  return out
}

function labelRectAt(
  mid: RoutePoint,
  width: number,
  height: number,
  id: string,
): RouteRect {
  return {
    id,
    x: mid.x - width / 2,
    y: mid.y - height / 2,
    width,
    height,
  }
}

export function placeCenteredLabel(
  points: RoutePoint[],
  box: { width: number; height: number },
  obstacles: RouteRect[],
  reservedLabels: RouteRect[],
  labelId: string,
  foreignWires: RoutePoint[][] = [],
): { label: RoutePoint; labelRect: RouteRect; score: number } {
  const segs = segmentsOf(points)
  const ranked = [...segs].sort((a, b) => {
    if (a.horizontal !== b.horizontal) return a.horizontal ? -1 : 1
    return b.length - a.length
  })

  let best: { label: RoutePoint; labelRect: RouteRect; score: number } | null =
    null

  for (const seg of ranked) {
    const crossings = collectCrossings(seg, foreignWires)
    const samples = seg.horizontal
      ? [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78, 0.15, 0.85, 0.1, 0.9]
      : [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]

    for (const t of samples) {
      const mid = {
        x: seg.a.x + (seg.b.x - seg.a.x) * t,
        y: seg.a.y + (seg.b.y - seg.a.y) * t,
      }
      const rect = labelRectAt(mid, box.width, box.height, labelId)
      let score = 0
      let clear = true

      score += Math.min(seg.length, 280) * (seg.horizontal ? 1.4 : 0.7)
      if (seg.length + 8 < box.width && seg.horizontal) score -= 120
      if (seg.length < MIN_LABEL_SEGMENT) score -= 60
      score += (1 - Math.abs(t - 0.5) * 2) * 28

      for (const obstacle of obstacles) {
        if (rectsOverlap(rect, obstacle, LABEL_NODE_PAD)) {
          // Hard reject — labels must never cover node boxes.
          score -= 2000
          clear = false
        }
      }
      for (const reserved of reservedLabels) {
        if (rectsOverlap(rect, reserved, 10)) {
          // Hard reject — labels must not stack on each other.
          score -= 1600
          clear = false
        }
      }

      const wireHits = labelOverlapsWire(rect, foreignWires, LABEL_WIRE_PAD)
      if (wireHits > 0) {
        // Hard reject — labels must not cover other wires / crossings.
        score -= wireHits * 900
        clear = false
      }

      // Prefer host segments that can fully contain the label box.
      if (seg.horizontal && seg.length + 4 < box.width) {
        score -= 800
        clear = false
      }

      for (const cross of crossings) {
        const dx = Math.abs(mid.x - cross.x)
        const dy = Math.abs(mid.y - cross.y)
        const clearX = box.width / 2 + 14
        const clearY = box.height / 2 + 14
        if (dx < clearX && dy < clearY) {
          score -= 600
          clear = false
        } else if (dx < clearX + 40 && dy < clearY + 20) {
          score -= 120
        }
      }

      const distStart = Math.hypot(mid.x - points[0]!.x, mid.y - points[0]!.y)
      const distEnd = Math.hypot(
        mid.x - points[points.length - 1]!.x,
        mid.y - points[points.length - 1]!.y,
      )
      score += Math.min(distStart, distEnd) * 0.12

      if (!best || score > best.score) {
        best = { label: mid, labelRect: rect, score }
      }
      if (clear && Math.abs(t - 0.5) < 0.05 && score > 120) return best
    }
  }

  const fallbackMid = ranked[0]?.mid ?? points[0] ?? { x: 0, y: 0 }
  return (
    best ?? {
      label: fallbackMid,
      labelRect: labelRectAt(fallbackMid, box.width, box.height, labelId),
      score: -999,
    }
  )
}

export function pointsToRoundedPath(
  points: RoutePoint[],
  radius = CORNER_RADIUS,
): string {
  if (points.length === 0) return ''
  if (points.length === 1) {
    const p = points[0]!
    return `M ${p.x} ${p.y}`
  }
  if (points.length === 2) {
    const a = points[0]!
    const b = points[1]!
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
  }

  let d = `M ${points[0]!.x} ${points[0]!.y}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]!
    const cur = points[i]!
    const next = points[i + 1]!
    const inDx = cur.x - prev.x
    const inDy = cur.y - prev.y
    const outDx = next.x - cur.x
    const outDy = next.y - cur.y
    const inLen = Math.hypot(inDx, inDy) || 1
    const outLen = Math.hypot(outDx, outDy) || 1
    const r = Math.min(radius, inLen / 2, outLen / 2)
    const before = {
      x: cur.x - (inDx / inLen) * r,
      y: cur.y - (inDy / inLen) * r,
    }
    const after = {
      x: cur.x + (outDx / outLen) * r,
      y: cur.y + (outDy / outLen) * r,
    }
    d += ` L ${before.x} ${before.y} Q ${cur.x} ${cur.y} ${after.x} ${after.y}`
  }
  const last = points[points.length - 1]!
  d += ` L ${last.x} ${last.y}`
  return d
}

function countPolylineCrossings(
  points: RoutePoint[],
  foreignWires: RoutePoint[][],
): number {
  let count = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    for (const wire of foreignWires) {
      for (let j = 0; j < wire.length - 1; j += 1) {
        if (orthogonalCrossing(points[i]!, points[i + 1]!, wire[j]!, wire[j + 1]!)) {
          count += 1
        }
      }
    }
  }
  return count
}

function scoreRoute(
  points: RoutePoint[],
  obstacles: RouteRect[],
  reservedLabels: RouteRect[],
  foreignWires: RoutePoint[][],
  labelBox: { width: number; height: number },
  labelId: string,
): { total: number; placement: ReturnType<typeof placeCenteredLabel> } {
  const hits = polylineHitsObstacles(points, obstacles)
  const crossings = countPolylineCrossings(points, foreignWires)
  const bends = Math.max(0, points.length - 2)
  let len = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    len += Math.hypot(b.x - a.x, b.y - a.y)
  }
  const placement = placeCenteredLabel(
    points,
    labelBox,
    obstacles,
    reservedLabels,
    labelId,
    foreignWires,
  )
  // Priority: label/node clearance (in placement.score) ≫ obstacle hits
  // ≫ fewer bends ≫ fewer edge crossings (crossings are soft).
  const total =
    placement.score -
    hits * 500 -
    bends * 35 -
    crossings * 70 -
    Math.max(0, len - 560) * 0.06 +
    Math.min(len, 480) * 0.02
  return { total, placement }
}

/**
 * Build orthogonal candidates between arbitrary attachment sides.
 * Always exits outward from source side and approaches from outside target side.
 */
function candidatesForSides(
  start: RoutePoint,
  end: RoutePoint,
  sourceSide: RouteSide,
  targetSide: RouteSide,
  clearance: number,
  laneGap: number,
  channelBias: number,
): RoutePoint[][] {
  const sExit = exitFrom(start, sourceSide, clearance)
  const tApproach = exitFrom(end, targetSide, clearance)
  const candidates: RoutePoint[][] = [
    simplify([start, sExit, { x: tApproach.x, y: sExit.y }, tApproach, end]),
    simplify([start, sExit, { x: sExit.x, y: tApproach.y }, tApproach, end]),
  ]

  const midXs = [
    (sExit.x + tApproach.x) / 2 + channelBias * 0.2,
    (sExit.x + tApproach.x) / 2 + 64,
    (sExit.x + tApproach.x) / 2 - 64,
    (sExit.x + tApproach.x) / 2 + 128,
    (sExit.x + tApproach.x) / 2 - 128,
  ]
  for (const midX of midXs) {
    candidates.push(
      simplify([
        start,
        sExit,
        { x: midX, y: sExit.y },
        { x: midX, y: tApproach.y },
        tApproach,
        end,
      ]),
    )
  }

  const midYs = [
    (sExit.y + tApproach.y) / 2 + channelBias * 0.2,
    (sExit.y + tApproach.y) / 2 + laneGap,
    (sExit.y + tApproach.y) / 2 - laneGap,
    (sExit.y + tApproach.y) / 2 + laneGap * 2,
    (sExit.y + tApproach.y) / 2 - laneGap * 2,
  ]
  for (const midY of midYs) {
    candidates.push(
      simplify([
        start,
        sExit,
        { x: sExit.x, y: midY },
        { x: tApproach.x, y: midY },
        tApproach,
        end,
      ]),
    )
  }

  const far = clearance + 72
  const sFar = exitFrom(start, sourceSide, far)
  const tFar = exitFrom(end, targetSide, far)
  candidates.push(
    simplify([start, sFar, { x: sFar.x, y: tFar.y }, tFar, end]),
    simplify([start, sFar, { x: tFar.x, y: sFar.y }, tFar, end]),
  )

  return candidates
}

interface FixedPort {
  side: RouteSide
  index: number
  along: number
}

function buildNodePortGrid(node: RouteRect): FixedPort[] {
  const ports: FixedPort[] = []
  for (const side of ALL_SIDES) {
    const cap = sidePortCapacity(node, side)
    if (cap <= 0) continue
    const alongs = fixedPortAlongs(cap)
    alongs.forEach((along, index) => {
      ports.push({ side, index, along })
    })
  }
  return ports
}

/**
 * Assign fixed port slots on all four sides.
 * - Left/right: 3 equally spaced ports; top/bottom: 4.
 * - Unique ports while stubs ≤ total capacity; share only when over capacity.
 * - When a side has only 1–2 stubs, prefer the centered port(s).
 */
export function assignEdgePorts(input: {
  nodes: RouteRect[]
  edges: Array<{ id: string; source: string; target: string }>
  maxPortsPerSide?: number
}): Map<string, PortAssignment> {
  const byId = new Map(input.nodes.map((node) => [node.id, node]))
  const grids = new Map<string, FixedPort[]>()
  const stubCount = new Map<string, number>()
  const sideUsage = new Map<string, number>() // `${nodeId}:${side}` → reserved count

  for (const node of input.nodes) {
    grids.set(node.id, buildNodePortGrid(node))
    stubCount.set(node.id, 0)
  }
  for (const edge of input.edges) {
    stubCount.set(edge.source, (stubCount.get(edge.source) ?? 0) + 1)
    stubCount.set(edge.target, (stubCount.get(edge.target) ?? 0) + 1)
  }

  const sideKey = (nodeId: string, side: RouteSide) => `${nodeId}:${side}`

  const canReserveSide = (nodeId: string, side: RouteSide): boolean => {
    const node = byId.get(nodeId)
    if (!node) return false
    const cap = sidePortCapacity(node, side)
    return (sideUsage.get(sideKey(nodeId, side)) ?? 0) < cap
  }

  const reserveSide = (nodeId: string, side: RouteSide) => {
    const k = sideKey(nodeId, side)
    sideUsage.set(k, (sideUsage.get(k) ?? 0) + 1)
  }

  // Pass 1 — pick sides (facing preferred; spill when a side is full).
  const ordered = [...input.edges].sort((a, b) => {
    const aHard =
      (stubCount.get(a.source) ?? 0) /
        Math.max(1, (grids.get(a.source) ?? []).length) +
      (stubCount.get(a.target) ?? 0) /
        Math.max(1, (grids.get(a.target) ?? []).length)
    const bHard =
      (stubCount.get(b.source) ?? 0) /
        Math.max(1, (grids.get(b.source) ?? []).length) +
      (stubCount.get(b.target) ?? 0) /
        Math.max(1, (grids.get(b.target) ?? []).length)
    return bHard - aHard
  })

  const sideChoice = new Map<
    string,
    { sourceSide: RouteSide; targetSide: RouteSide }
  >()

  for (const edge of ordered) {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) continue
    const sourceRanks = rankSides(source, target, 'source')
    const targetRanks = rankSides(source, target, 'target')

    let chosenSource = sourceRanks[0]!
    let chosenTarget = targetRanks[0]!
    let best = Number.NEGATIVE_INFINITY

    for (const sSide of sourceRanks) {
      if (!canReserveSide(edge.source, sSide)) continue
      for (const tSide of targetRanks) {
        if (!canReserveSide(edge.target, tSide)) continue
        let score = 0
        score += (sourceRanks.length - sourceRanks.indexOf(sSide)) * 10
        score += (targetRanks.length - targetRanks.indexOf(tSide)) * 10
        const opposite =
          (sSide === 'right' && tSide === 'left') ||
          (sSide === 'left' && tSide === 'right') ||
          (sSide === 'top' && tSide === 'bottom') ||
          (sSide === 'bottom' && tSide === 'top')
        if (opposite) score += 8
        if (score > best) {
          best = score
          chosenSource = sSide
          chosenTarget = tSide
        }
      }
    }

    if (best === Number.NEGATIVE_INFINITY) {
      // Over-subscribed node — still take preferred portable faces (will share ports).
      chosenSource = firstPortableSide(source, sourceRanks)
      chosenTarget = firstPortableSide(target, targetRanks)
    }

    reserveSide(edge.source, chosenSource)
    reserveSide(edge.target, chosenTarget)
    sideChoice.set(edge.id, {
      sourceSide: chosenSource,
      targetSide: chosenTarget,
    })
  }

  // Pass 2 — on each node+side, assign centered fixed ports for 1–2 stubs.
  type Stub = { edgeId: string; role: 'source' | 'target' }
  const sideGroups = new Map<string, Stub[]>()
  for (const edge of input.edges) {
    const choice = sideChoice.get(edge.id)
    if (!choice) continue
    const sk = sideKey(edge.source, choice.sourceSide)
    const tk = sideKey(edge.target, choice.targetSide)
    const sList = sideGroups.get(sk) ?? []
    sList.push({ edgeId: edge.id, role: 'source' })
    sideGroups.set(sk, sList)
    const tList = sideGroups.get(tk) ?? []
    tList.push({ edgeId: edge.id, role: 'target' })
    sideGroups.set(tk, tList)
  }

  const stubPort = new Map<
    string,
    { side: RouteSide; index: number; along: number; shared: boolean; cap: number }
  >() // key: `${edgeId}:${role}`

  for (const [groupKey, stubs] of sideGroups) {
    const [nodeId, side] = groupKey.split(':') as [string, RouteSide]
    const node = byId.get(nodeId)
    if (!node) continue
    const cap = sidePortCapacity(node, side)
    const alongs = fixedPortAlongs(cap)
    // Ports sorted along the side (top→bottom / left→right).
    const portIndices = selectCenteredPortIndices(cap, stubs.length).sort(
      (a, b) => (alongs[a] ?? 0) - (alongs[b] ?? 0),
    )

    // Match by other-endpoint position on the same axis — top source → top port
    // — so approach paths do not cross at the node border.
    const sorted = [...stubs].sort((a, b) => {
      const edgeA = input.edges.find((e) => e.id === a.edgeId)
      const edgeB = input.edges.find((e) => e.id === b.edgeId)
      if (!edgeA || !edgeB) return 0
      const otherA = byId.get(
        a.role === 'source' ? edgeA.target : edgeA.source,
      )
      const otherB = byId.get(
        b.role === 'source' ? edgeB.target : edgeB.source,
      )
      if (!otherA || !otherB) return 0
      if (side === 'left' || side === 'right') {
        return center(otherA).y - center(otherB).y
      }
      return center(otherA).x - center(otherB).x
    })

    sorted.forEach((stub, i) => {
      const resolvedIndex =
        stubs.length <= cap
          ? (portIndices[i] ?? portIndices[portIndices.length - 1] ?? 0)
          : i % cap
      const along = alongs[resolvedIndex] ?? 0.5
      stubPort.set(`${stub.edgeId}:${stub.role}`, {
        side,
        index: resolvedIndex,
        along,
        shared: stubs.length > cap,
        cap,
      })
    })
  }

  const result = new Map<string, PortAssignment>()
  for (const edge of input.edges) {
    const sourceStub = stubPort.get(`${edge.id}:source`)
    const targetStub = stubPort.get(`${edge.id}:target`)
    const choice = sideChoice.get(edge.id)
    if (!sourceStub || !targetStub || !choice) continue
    result.set(edge.id, {
      sourceSide: sourceStub.side,
      targetSide: targetStub.side,
      sourceSlot: sourceStub.index,
      sourceSlotCount: sourceStub.cap,
      targetSlot: targetStub.index,
      targetSlotCount: targetStub.cap,
      sourceAlong: sourceStub.along,
      targetAlong: targetStub.along,
      sourceShared: sourceStub.shared,
      targetShared: targetStub.shared,
    })
  }
  return result
}

/**
 * Stretch the longest horizontal lane so a label box can sit clear of nodes.
 */
export function elongateRouteForLabel(
  points: RoutePoint[],
  minSegmentLength: number,
  outward = 48,
): RoutePoint[] {
  if (points.length < 4) return points
  const segs = segmentsOf(points)
  let bestIdx = -1
  let bestLen = -1
  segs.forEach((seg, index) => {
    if (seg.horizontal && seg.length > bestLen) {
      bestLen = seg.length
      bestIdx = index
    }
  })
  if (bestIdx < 0 || bestLen >= minSegmentLength) return points

  // Rebuild with a longer mid horizontal detour between exit stubs.
  const start = points[0]!
  const end = points[points.length - 1]!
  const sExit = points[1] ?? start
  const tApproach = points[points.length - 2] ?? end
  const midY =
    (sExit.y + tApproach.y) / 2 +
    (Math.abs(sExit.y - tApproach.y) < 8 ? -outward : 0)
  const left = Math.min(sExit.x, tApproach.x) - outward
  const right = Math.max(sExit.x, tApproach.x) + outward
  return simplify([
    start,
    sExit,
    { x: sExit.x, y: midY },
    { x: left, y: midY },
    { x: right, y: midY },
    { x: tApproach.x, y: midY },
    tApproach,
    end,
  ])
}

/**
 * Acceptance pass: if a label still covers a node / wire / crossing, slide it
 * densely along the polyline; if still blocked, elongate then retry.
 */
export function auditAndFixLabel(input: {
  points: RoutePoint[]
  labelBox: { width: number; height: number }
  nodes: RouteRect[]
  reservedLabels?: RouteRect[]
  foreignWires?: RoutePoint[][]
  labelId: string
}): { points: RoutePoint[]; label: RoutePoint; labelRect: RouteRect } {
  const nodeObstacles = input.nodes.map((node) => inflate(node, LABEL_NODE_PAD))
  const reserved = input.reservedLabels ?? []
  const wires = input.foreignWires ?? []

  const place = (pts: RoutePoint[]) =>
    placeCenteredLabel(
      pts,
      input.labelBox,
      nodeObstacles,
      reserved,
      input.labelId,
      wires,
    )

  let points = input.points
  let placement = place(points)

  const isClear = (rect: RouteRect) =>
    !labelOverlapsNodes(rect, input.nodes, LABEL_NODE_PAD) &&
    labelOverlapsWire(rect, wires, LABEL_WIRE_PAD) === 0

  if (!isClear(placement.labelRect)) {
    // Dense micro-adjust along every segment.
    let best = placement
    for (const seg of segmentsOf(points)) {
      for (let step = 0; step <= 20; step += 1) {
        const t = step / 20
        const mid = {
          x: seg.a.x + (seg.b.x - seg.a.x) * t,
          y: seg.a.y + (seg.b.y - seg.a.y) * t,
        }
        const rect = labelRectAt(
          mid,
          input.labelBox.width,
          input.labelBox.height,
          input.labelId,
        )
        if (!isClear(rect)) continue
        const score = placeCenteredLabel(
          points,
          input.labelBox,
          nodeObstacles,
          reserved,
          input.labelId,
          wires,
        ).score
        if (!best || score >= best.score) {
          best = { label: mid, labelRect: rect, score }
        }
        if (isClear(rect)) {
          return { points, label: mid, labelRect: rect }
        }
      }
    }
    placement = best

    if (!isClear(placement.labelRect)) {
      points = elongateRouteForLabel(
        points,
        input.labelBox.width + 40,
        56,
      )
      placement = place(points)
      if (!isClear(placement.labelRect)) {
        // Second elongation pass with a larger detour.
        points = elongateRouteForLabel(points, input.labelBox.width + 80, 96)
        placement = place(points)
      }
    }
  }

  return {
    points,
    label: placement.label,
    labelRect: placement.labelRect,
  }
}

/**
 * Route an orthogonal multi-bend edge between two node boxes.
 */
export function buildOrthogonalRoute(
  input: OrthogonalRouteInput,
): OrthogonalRouteResult {
  const clearance = input.clearance ?? DEFAULT_CLEARANCE
  const parallelIndex = input.parallelIndex ?? 0
  const parallelCount = input.parallelCount ?? 1
  const edgeIndex = input.edgeIndex ?? parallelIndex
  const labelBox = input.labelBox ?? { width: 96, height: 22 }
  const laneGap = input.laneGap ?? laneGapForLabels(labelBox.height)
  const labelId = `label:${input.source.id}->${input.target.id}:${parallelIndex}`

  const sourceRanks = rankSides(input.source, input.target, 'source')
  const targetRanks = rankSides(input.source, input.target, 'target')
  const sourceSide =
    input.sourceSide ?? firstPortableSide(input.source, sourceRanks)
  const targetSide =
    input.targetSide ?? firstPortableSide(input.target, targetRanks)

  const sourceSlot = input.sourceSlot ?? 0
  const sourceSlotCount = Math.max(1, input.sourceSlotCount ?? 1)
  const targetSlot = input.targetSlot ?? 0
  const targetSlotCount = Math.max(1, input.targetSlotCount ?? 1)

  const sourceAlongs = fixedPortAlongs(sourceSlotCount)
  const targetAlongs = fixedPortAlongs(targetSlotCount)
  const sourceAlong =
    input.sourceAlong ??
    sourceAlongs[Math.min(sourceSlot, sourceAlongs.length - 1)] ??
    0.5
  const targetAlong =
    input.targetAlong ??
    targetAlongs[Math.min(targetSlot, targetAlongs.length - 1)] ??
    0.5

  const start = attach(input.source, sourceSide, sourceAlong)
  const end = attach(input.target, targetSide, targetAlong)

  // Route geometry avoids foreign nodes; labels also treat endpoints as taboo.
  const routeObstacles = (input.obstacles ?? [])
    .filter(
      (obstacle) =>
        obstacle.id !== input.source.id && obstacle.id !== input.target.id,
    )
    .map((obstacle) => inflate(obstacle, clearance * 0.45))

  const labelObstacles = [
    ...routeObstacles,
    inflate(input.source, LABEL_NODE_PAD),
    inflate(input.target, LABEL_NODE_PAD),
  ]

  const reservedLabels = input.reservedLabels ?? []
  const foreignWires = input.foreignWires ?? []
  const channelBias =
    fanOffset(targetSlot, targetSlotCount, laneGap) + (edgeIndex % 3) * 10

  const candidates = candidatesForSides(
    start,
    end,
    sourceSide,
    targetSide,
    clearance,
    laneGap,
    channelBias,
  )
  // Extra elongated candidates when the label is wide.
  if (labelBox.width > 120) {
    candidates.push(
      ...candidatesForSides(
        start,
        end,
        sourceSide,
        targetSide,
        clearance + 48,
        laneGap + 24,
        channelBias,
      ),
    )
  }

  // Facing left↔right / top↔bottom: also try classic mid channels.
  if (
    (sourceSide === 'right' && targetSide === 'left') ||
    (sourceSide === 'left' && targetSide === 'right')
  ) {
    const gapMid = (start.x + end.x) / 2
    for (const midX of [gapMid, gapMid + 64, gapMid - 64, gapMid + 120, gapMid - 120]) {
      candidates.push(hvh(start, end, midX))
    }
  }
  if (
    (sourceSide === 'bottom' && targetSide === 'top') ||
    (sourceSide === 'top' && targetSide === 'bottom')
  ) {
    const gapMid = (start.y + end.y) / 2
    for (const midY of [gapMid, gapMid + 64, gapMid - 64, gapMid + laneGap]) {
      candidates.push(vhv(start, end, midY))
    }
  }

  let bestPoints = candidates[0] ?? [start, end]
  let bestScore = Number.NEGATIVE_INFINITY
  let bestPlacement = placeCenteredLabel(
    bestPoints,
    labelBox,
    labelObstacles,
    reservedLabels,
    labelId,
    foreignWires,
  )

  for (const candidate of candidates) {
    const routeHits = polylineHitsObstacles(candidate, routeObstacles)
    const { total, placement } = scoreRoute(
      candidate,
      labelObstacles,
      reservedLabels,
      foreignWires,
      labelBox,
      labelId,
    )
    // Prefer routes whose label clears endpoint nodes.
    const labelClear = !labelOverlapsNodes(
      placement.labelRect,
      [input.source, input.target],
      LABEL_NODE_PAD,
    )
    const adjusted =
      total - routeHits * 200 + (labelClear ? 400 : -1200)
    if (adjusted > bestScore) {
      bestScore = adjusted
      bestPoints = candidate
      bestPlacement = placement
    }
  }

  let points = simplify(bestPoints)
  // Per-edge acceptance: elongate / micro-slide if label still hits a node.
  const audited = auditAndFixLabel({
    points,
    labelBox,
    nodes: [
      input.source,
      input.target,
      ...(input.obstacles ?? []).filter(
        (obstacle) =>
          obstacle.id !== input.source.id && obstacle.id !== input.target.id,
      ),
    ],
    reservedLabels,
    foreignWires,
    labelId,
  })
  // Re-pin ports after elongation so labels never drag attachments to corners.
  points = pinRouteToPorts(
    audited.points,
    input.source,
    input.target,
    sourceSide,
    targetSide,
    sourceAlong,
    targetAlong,
  )
  const labelPlacement = placeCenteredLabel(
    points,
    labelBox,
    labelObstacles,
    reservedLabels,
    labelId,
    foreignWires,
  )

  return {
    points,
    label: labelPlacement.label,
    labelRect: labelPlacement.labelRect,
    sourceSide,
    targetSide,
    sourceAlong,
    targetAlong,
    path: pointsToRoundedPath(points),
  }
}

export interface RoutedEdgeSpec {
  id: string
  source: string
  target: string
  labelText?: string
  labelBox?: { width: number; height: number }
}

/**
 * Rematch ports on each node side by the other endpoint's position so a
 * geometrically higher neighbour always gets the higher port (0.25 before 0.5).
 * Uses neighbour centres — not pinned stub Y (which always equals the port).
 */
export function uncrossSidePortsByApproach(input: {
  nodes: RouteRect[]
  edges: RoutedEdgeSpec[]
  routes: Map<string, OrthogonalRouteResult>
}): void {
  const byId = new Map(input.nodes.map((node) => [node.id, node]))

  type Member = {
    edgeId: string
    role: 'source' | 'target'
    /** Sort key: other node centre on the side axis. */
    rank: number
    along: number
  }

  const groups = new Map<string, Member[]>()

  for (const edge of input.edges) {
    const route = input.routes.get(edge.id)
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!route || !source || !target) continue

    const sourceKey = `${edge.source}:${route.sourceSide}`
    const targetKey = `${edge.target}:${route.targetSide}`

    const sourceRank =
      route.sourceSide === 'left' || route.sourceSide === 'right'
        ? center(target).y
        : center(target).x
    const targetRank =
      route.targetSide === 'left' || route.targetSide === 'right'
        ? center(source).y
        : center(source).x

    const sList = groups.get(sourceKey) ?? []
    sList.push({
      edgeId: edge.id,
      role: 'source',
      rank: sourceRank,
      along: route.sourceAlong,
    })
    groups.set(sourceKey, sList)

    const tList = groups.get(targetKey) ?? []
    tList.push({
      edgeId: edge.id,
      role: 'target',
      rank: targetRank,
      along: route.targetAlong,
    })
    groups.set(targetKey, tList)
  }

  for (const [, members] of groups) {
    if (members.length < 2) continue
    const byRank = [...members].sort((a, b) => a.rank - b.rank)
    const alongsSorted = [...members]
      .map((m) => m.along)
      .sort((a, b) => a - b)

    let inverted = false
    for (let i = 0; i < byRank.length; i += 1) {
      if (Math.abs(byRank[i]!.along - alongsSorted[i]!) > 1e-6) {
        inverted = true
        break
      }
    }
    if (!inverted) continue

    byRank.forEach((member, i) => {
      const route = input.routes.get(member.edgeId)
      const edge = input.edges.find((e) => e.id === member.edgeId)
      if (!route || !edge) return
      const newAlong = alongsSorted[i]!
      if (member.role === 'source') route.sourceAlong = newAlong
      else route.targetAlong = newAlong
      const source = byId.get(edge.source)
      const target = byId.get(edge.target)
      if (!source || !target) return
      route.points = pinRouteToPorts(
        route.points,
        source,
        target,
        route.sourceSide,
        route.targetSide,
        route.sourceAlong,
        route.targetAlong,
      )
      route.path = pointsToRoundedPath(route.points)
    })
  }
}

/**
 * Overlay acceptance: keep micro-adjusting labels (and elongating lanes) until
 * no label covers a node, another label, a foreign wire, or a crossing — or
 * until the iteration budget is exhausted.
 */
export function resolveOverlayConflicts(input: {
  nodes: RouteRect[]
  edges: RoutedEdgeSpec[]
  routes: Map<string, OrthogonalRouteResult>
  maxPasses?: number
  /** When set, only these edges may move. Other routes stay frozen obstacles. */
  onlyEdgeIds?: ReadonlySet<string>
}): { resolved: boolean; passes: number } {
  const maxPasses = input.maxPasses ?? 10
  const routeIds = [...input.routes.keys()]
  const mutableIds = input.onlyEdgeIds
    ? routeIds.filter((id) => input.onlyEdgeIds!.has(id))
    : routeIds
  let passes = 0

  const isClear = (
    rect: RouteRect,
    nodes: RouteRect[],
    otherLabels: RouteRect[],
    wires: RoutePoint[][],
  ) =>
    !labelOverlapsNodes(rect, nodes, LABEL_NODE_PAD) &&
    !otherLabels.some((other) => rectsOverlap(rect, other, 10)) &&
    labelOverlapsWire(rect, wires, LABEL_WIRE_PAD) === 0

  for (let pass = 0; pass < maxPasses; pass += 1) {
    passes = pass + 1
    let dirty = false

    for (const id of mutableIds) {
      const route = input.routes.get(id)!
      const edge = input.edges.find((candidate) => candidate.id === id)
      const source = edge ? input.nodes.find((n) => n.id === edge.source) : undefined
      const target = edge ? input.nodes.find((n) => n.id === edge.target) : undefined
      const labelBox = edge?.labelBox ?? {
        width: route.labelRect.width,
        height: route.labelRect.height,
      }
      const others = routeIds
        .filter((otherId) => otherId !== id)
        .map((otherId) => input.routes.get(otherId)!.points)
      const otherLabels = routeIds
        .filter((otherId) => otherId !== id)
        .map((otherId) => input.routes.get(otherId)!.labelRect)

      if (isClear(route.labelRect, input.nodes, otherLabels, others)) continue

      dirty = true
      const audited = auditAndFixLabel({
        points: route.points,
        labelBox,
        nodes: input.nodes,
        reservedLabels: otherLabels,
        foreignWires: others,
        labelId: `label:${id}`,
      })
      let points = audited.points
      if (source && target) {
        points = pinRouteToPorts(
          points,
          source,
          target,
          route.sourceSide,
          route.targetSide,
          route.sourceAlong,
          route.targetAlong,
        )
      }

      // If still blocked, force a longer horizontal detour for more label room.
      let placement = placeCenteredLabel(
        points,
        labelBox,
        input.nodes.map((node) => inflate(node, LABEL_NODE_PAD)),
        otherLabels,
        `label:${id}`,
        others,
      )
      if (!isClear(placement.labelRect, input.nodes, otherLabels, others)) {
        points = elongateRouteForLabel(points, labelBox.width + 96, 72 + pass * 24)
        if (source && target) {
          points = pinRouteToPorts(
            points,
            source,
            target,
            route.sourceSide,
            route.targetSide,
            route.sourceAlong,
            route.targetAlong,
          )
        }
        placement = placeCenteredLabel(
          points,
          labelBox,
          input.nodes.map((node) => inflate(node, LABEL_NODE_PAD)),
          otherLabels,
          `label:${id}`,
          others,
        )
      }

      route.points = points
      route.label = placement.label
      route.labelRect = placement.labelRect
      route.path = pointsToRoundedPath(points)
    }

    if (!dirty) return { resolved: true, passes }
  }

  // Final check.
  let allClear = true
  for (const id of mutableIds) {
    const route = input.routes.get(id)!
    const others = routeIds
      .filter((otherId) => otherId !== id)
      .map((otherId) => input.routes.get(otherId)!.points)
    const otherLabels = routeIds
      .filter((otherId) => otherId !== id)
      .map((otherId) => input.routes.get(otherId)!.labelRect)
    if (!isClear(route.labelRect, input.nodes, otherLabels, others)) {
      allClear = false
      break
    }
  }
  return { resolved: allClear, passes }
}

function separateParallelLanes(
  routes: Map<string, OrthogonalRouteResult>,
  labelHeights: Map<string, number>,
): void {
  const entries = [...routes.entries()]
  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const [idA, routeA] = entries[i]!
        const [idB, routeB] = entries[j]!
        const segsA = segmentsOf(routeA.points).filter((s) => s.horizontal)
        const segsB = segmentsOf(routeB.points).filter((s) => s.horizontal)
        for (const sa of segsA) {
          for (const sb of segsB) {
            const overlapX =
              Math.min(sa.a.x, sa.b.x) < Math.max(sb.a.x, sb.b.x) - 8 &&
              Math.min(sb.a.x, sb.b.x) < Math.max(sa.a.x, sa.b.x) - 8
            if (!overlapX) continue
            const dy = Math.abs(sa.a.y - sb.a.y)
            const need = laneGapForLabels(
              labelHeights.get(idA) ?? 22,
              labelHeights.get(idB) ?? 22,
            )
            if (dy >= need || dy < 1e-3) continue

            const delta = (need - dy) / 2 + 2
            const shiftA = sa.a.y <= sb.a.y ? -delta : delta
            const shiftB = -shiftA
            const bandA = sa.a.y
            const bandB = sb.a.y
            // Never move port attachment Y — only mid-corridor horizontals.
            const pinYa = [
              routeA.points[0]!.y,
              routeA.points[routeA.points.length - 1]!.y,
            ]
            const pinYb = [
              routeB.points[0]!.y,
              routeB.points[routeB.points.length - 1]!.y,
            ]
            const shiftBand = (
              points: RoutePoint[],
              band: number,
              shift: number,
              pinnedYs: number[],
            ) =>
              points.map((p, idx, arr) => {
                if (idx === 0 || idx === arr.length - 1) return p
                if (pinnedYs.some((y) => Math.abs(p.y - y) < 1e-3)) return p
                if (Math.abs(p.y - band) < 1e-3) {
                  return { x: p.x, y: p.y + shift }
                }
                return p
              })

            routeA.points = shiftBand(routeA.points, bandA, shiftA, pinYa)
            routeB.points = shiftBand(routeB.points, bandB, shiftB, pinYb)
            routeA.path = pointsToRoundedPath(routeA.points)
            routeB.path = pointsToRoundedPath(routeB.points)
            moved = true
          }
        }
      }
    }
    if (!moved) break
  }
}

/**
 * Route all edges with four-side port assignment + label-aware clearance.
 */
export function routeAllOrthogonalEdges(input: {
  nodes: RouteRect[]
  edges: RoutedEdgeSpec[]
  clearance?: number
  maxPortsPerSide?: number
}): Map<string, OrthogonalRouteResult> {
  const byId = new Map(input.nodes.map((node) => [node.id, node]))
  const results = new Map<string, OrthogonalRouteResult>()
  const labelHeights = new Map<string, number>()
  const ports = assignEdgePorts({
    nodes: input.nodes,
    edges: input.edges,
    maxPortsPerSide: input.maxPortsPerSide,
  })

  const pairKey = (a: string, b: string) => (a < b ? `${a}::${b}` : `${b}::${a}`)
  const pairCounts = new Map<string, number>()
  const pairSeen = new Map<string, number>()
  for (const edge of input.edges) {
    const key = pairKey(edge.source, edge.target)
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
  }

  const foreignWires: RoutePoint[][] = []
  const reservedLabels: RouteRect[] = []

  input.edges.forEach((edge, edgeIndex) => {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) return
    const key = pairKey(edge.source, edge.target)
    const parallelCount = pairCounts.get(key) ?? 1
    const parallelIndex = pairSeen.get(key) ?? 0
    pairSeen.set(key, parallelIndex + 1)
    const labelBox = edge.labelBox ?? { width: 96, height: 22 }
    labelHeights.set(edge.id, labelBox.height)
    const assignment = ports.get(edge.id)

    const routed = buildOrthogonalRoute({
      source,
      target,
      obstacles: input.nodes,
      reservedLabels: [...reservedLabels],
      foreignWires: [...foreignWires],
      labelBox,
      sourceSide: assignment?.sourceSide,
      targetSide: assignment?.targetSide,
      sourceSlot: assignment?.sourceSlot,
      sourceSlotCount: assignment?.sourceSlotCount,
      targetSlot: assignment?.targetSlot,
      targetSlotCount: assignment?.targetSlotCount,
      sourceAlong: assignment?.sourceAlong,
      targetAlong: assignment?.targetAlong,
      parallelIndex,
      parallelCount,
      laneGap: laneGapForLabels(labelBox.height),
      edgeIndex,
      clearance: input.clearance,
      maxPortsPerSide: input.maxPortsPerSide,
    })
    results.set(edge.id, routed)
    foreignWires.push(routed.points)
    reservedLabels.push(routed.labelRect)
  })

  // Smart port rematch from real approach geometry (fixes swapped 0.25/0.5).
  uncrossSidePortsByApproach({
    nodes: input.nodes,
    edges: input.edges,
    routes: results,
  })

  separateParallelLanes(results, labelHeights)

  // Re-uncross after lane shifts (ports stay pinned; approach order may change).
  uncrossSidePortsByApproach({
    nodes: input.nodes,
    edges: input.edges,
    routes: results,
  })

  // Acceptance loop: remove label↔label / label↔wire / label↔node overlays.
  resolveOverlayConflicts({
    nodes: input.nodes,
    edges: input.edges,
    routes: results,
    maxPasses: 10,
  })

  // Final pin + label seat so ports stay exact.
  const allIds = [...results.keys()]
  for (const id of allIds) {
    const route = results.get(id)!
    const edge = input.edges.find((candidate) => candidate.id === id)
    const source = edge ? byId.get(edge.source) : undefined
    const target = edge ? byId.get(edge.target) : undefined
    if (!source || !target) continue
    route.points = pinRouteToPorts(
      route.points,
      source,
      target,
      route.sourceSide,
      route.targetSide,
      route.sourceAlong,
      route.targetAlong,
    )
    const labelBox = edge?.labelBox ?? {
      width: route.labelRect.width,
      height: route.labelRect.height,
    }
    const others = allIds
      .filter((otherId) => otherId !== id)
      .map((otherId) => results.get(otherId)!.points)
    const otherLabels = allIds
      .filter((otherId) => otherId !== id)
      .map((otherId) => results.get(otherId)!.labelRect)
    const placement = placeCenteredLabel(
      route.points,
      labelBox,
      input.nodes.map((node) => inflate(node, LABEL_NODE_PAD)),
      otherLabels,
      `label:${id}`,
      others,
    )
    route.label = placement.label
    route.labelRect = placement.labelRect
    route.path = pointsToRoundedPath(route.points)
  }

  // One more overlay pass after final pin.
  resolveOverlayConflicts({
    nodes: input.nodes,
    edges: input.edges,
    routes: results,
    maxPasses: 4,
  })

  return results
}

export function minNodeGap(nodes: RouteRect[]): number {
  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]!
      const b = nodes[j]!
      const gapX =
        a.x < b.x ? b.x - (a.x + a.width) : a.x - (b.x + b.width)
      const gapY =
        a.y < b.y ? b.y - (a.y + a.height) : a.y - (b.y + b.height)
      if (gapX >= 0 && gapY >= 0) {
        min = Math.min(min, Math.hypot(gapX, gapY))
      } else if (gapX >= 0) {
        min = Math.min(min, gapX)
      } else if (gapY >= 0) {
        min = Math.min(min, gapY)
      } else {
        min = 0
      }
    }
  }
  return Number.isFinite(min) ? min : Number.POSITIVE_INFINITY
}
