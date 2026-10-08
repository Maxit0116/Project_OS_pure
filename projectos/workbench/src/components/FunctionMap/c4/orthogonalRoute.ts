/**
 * Classic C4-style orthogonal (multi-bend) edge routing with label-aware
 * placement: labels sit centered on a clear segment; parallel approach lanes
 * fan out by label height; labels slide away from wire crossings.
 */

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
}

export type RouteSide = 'left' | 'right' | 'top' | 'bottom'

export interface OrthogonalRouteInput {
  source: RouteRect
  target: RouteRect
  /** Other nodes the route should try to avoid. */
  obstacles?: RouteRect[]
  /** Already-placed label boxes from sibling edges. */
  reservedLabels?: RouteRect[]
  /** Already-routed foreign polylines (wires) to keep clear of labels. */
  foreignWires?: RoutePoint[][]
  /** Desired label box size (centered on the chosen segment). */
  labelBox?: { width: number; height: number }
  /** Index among edges sharing the same unordered pair (for parallel offset). */
  parallelIndex?: number
  parallelCount?: number
  /** Fan-in to the same target (different sources). */
  fanInIndex?: number
  fanInCount?: number
  /** Fan-out from the same source (different targets). */
  fanOutIndex?: number
  fanOutCount?: number
  /** Minimum clear gap between parallel lanes (label-aware). */
  laneGap?: number
  /** Global index used to stagger bend channels across the diagram. */
  edgeIndex?: number
  /** Minimum clear gap between nodes when scoring / offsetting. */
  clearance?: number
}

export interface OrthogonalRouteResult {
  points: RoutePoint[]
  /** Center of the label box — sits on the edge midline. */
  label: RoutePoint
  /** Axis-aligned label occupancy used by subsequent edges. */
  labelRect: RouteRect
  sourceSide: RouteSide
  targetSide: RouteSide
  path: string
}

const DEFAULT_CLEARANCE = 36
const CORNER_RADIUS = 10
const MIN_LABEL_SEGMENT = 72
/** Extra air between a label box and a foreign wire. */
const LABEL_WIRE_PAD = 10
/** Minimum centre-to-centre gap for parallel horizontal lanes. */
const MIN_LANE_GAP = 40

function center(rect: RouteRect): RoutePoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

function attach(rect: RouteRect, side: RouteSide, along = 0.5): RoutePoint {
  const t = Math.min(0.88, Math.max(0.12, along))
  switch (side) {
    case 'left':
      return { x: rect.x, y: rect.y + rect.height * t }
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height * t }
    case 'top':
      return { x: rect.x + rect.width * t, y: rect.y }
    case 'bottom':
      return { x: rect.x + rect.width * t, y: rect.y + rect.height }
  }
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

/** Orthogonal segment crossing (H×V). Returns the intersection point or null. */
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

/** Exit → vertical corridor → long horizontal → rejoin (creates a long label lane). */
function detourHorizontalLane(
  start: RoutePoint,
  end: RoutePoint,
  sourceSide: RouteSide,
  laneY: number,
  exit: number,
): RoutePoint[] {
  const dir = sourceSide === 'left' ? -1 : 1
  const x1 = start.x + dir * exit
  const x2 = end.x - dir * exit
  return simplify([
    start,
    { x: x1, y: start.y },
    { x: x1, y: laneY },
    { x: x2, y: laneY },
    { x: x2, y: end.y },
    end,
  ])
}

function pickSides(
  source: RouteRect,
  target: RouteRect,
): { sourceSide: RouteSide; targetSide: RouteSide; mode: 'hvh' | 'vhv' } {
  const sc = center(source)
  const tc = center(target)
  const dx = tc.x - sc.x
  const dy = tc.y - sc.y

  if (Math.abs(dx) >= Math.abs(dy) * 0.85) {
    if (dx >= 0) {
      return { sourceSide: 'right', targetSide: 'left', mode: 'hvh' }
    }
    return { sourceSide: 'left', targetSide: 'right', mode: 'hvh' }
  }
  if (dy >= 0) {
    return { sourceSide: 'bottom', targetSide: 'top', mode: 'vhv' }
  }
  return { sourceSide: 'top', targetSide: 'bottom', mode: 'vhv' }
}

function fanOffset(index: number, count: number, gap: number): number {
  if (count <= 1) return 0
  const mid = (count - 1) / 2
  return (index - mid) * gap
}

/** Minimum centre-to-centre lane gap so two label boxes don't cover each other's wire. */
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

/**
 * Pick a label center that sits on the edge midline and whose box clears
 * nodes, reserved labels, foreign wires, and crossing points.
 */
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
    // Dense samples so we can slide off crossings / wires.
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
        if (rectsOverlap(rect, obstacle, 4)) {
          score -= 500
          clear = false
        }
      }
      for (const reserved of reservedLabels) {
        if (rectsOverlap(rect, reserved, 8)) {
          score -= 480
          clear = false
        }
      }

      const wireHits = labelOverlapsWire(rect, foreignWires, LABEL_WIRE_PAD)
      if (wireHits > 0) {
        score -= wireHits * 420
        clear = false
      }

      // Keep label boxes off crossings / bend junctions.
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

/** Build an SVG path with slight corner rounding for classic C4 look. */
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

function scoreRoute(
  points: RoutePoint[],
  obstacles: RouteRect[],
  reservedLabels: RouteRect[],
  foreignWires: RoutePoint[][],
  labelBox: { width: number; height: number },
  labelId: string,
): { total: number; placement: ReturnType<typeof placeCenteredLabel> } {
  const hits = polylineHitsObstacles(points, obstacles)
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
  // Prefer clear routes; mild length reward when it buys label clearance.
  const total =
    placement.score -
    hits * 500 -
    Math.max(0, len - 560) * 0.06 +
    Math.min(len, 480) * 0.02
  return { total, placement }
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
  const fanInIndex = input.fanInIndex ?? 0
  const fanInCount = input.fanInCount ?? 1
  const fanOutIndex = input.fanOutIndex ?? 0
  const fanOutCount = input.fanOutCount ?? 1
  const edgeIndex = input.edgeIndex ?? parallelIndex
  const labelBox = input.labelBox ?? { width: 96, height: 22 }
  const laneGap = input.laneGap ?? laneGapForLabels(labelBox.height)
  const labelId = `label:${input.source.id}->${input.target.id}:${parallelIndex}`

  const { sourceSide, targetSide, mode } = pickSides(input.source, input.target)

  // Spread attach points so parallel / fan-in edges stay parallel but spaced
  // by at least one label-box height (prevents label covering neighbour wire).
  const pairBias = fanOffset(parallelIndex, parallelCount, laneGap * 0.55)
  const inBias = fanOffset(fanInIndex, fanInCount, laneGap)
  const outBias = fanOffset(fanOutIndex, fanOutCount, laneGap * 0.85)
  const approachBias = pairBias + inBias
  const departBias = pairBias + outBias

  const sourceAlong =
    sourceSide === 'left' || sourceSide === 'right'
      ? 0.5 + departBias / Math.max(48, input.source.height)
      : 0.5 + departBias / Math.max(48, input.source.width)
  const targetAlong =
    targetSide === 'left' || targetSide === 'right'
      ? 0.5 + approachBias / Math.max(48, input.target.height)
      : 0.5 + approachBias / Math.max(48, input.target.width)

  const start = attach(input.source, sourceSide, sourceAlong)
  const end = attach(input.target, targetSide, targetAlong)

  const obstacles = (input.obstacles ?? [])
    .filter(
      (obstacle) =>
        obstacle.id !== input.source.id && obstacle.id !== input.target.id,
    )
    .map((obstacle) => inflate(obstacle, clearance * 0.4))

  const reservedLabels = input.reservedLabels ?? []
  const foreignWires = input.foreignWires ?? []
  const sc = center(input.source)
  const tc = center(input.target)
  const candidates: RoutePoint[][] = []
  const channelStagger = approachBias + (edgeIndex % 3) * 12

  if (mode === 'hvh') {
    const gapMid = (sc.x + tc.x) / 2
    const mids = [
      gapMid + channelStagger * 0.2,
      gapMid + 56 + channelStagger * 0.1,
      gapMid - 56 + channelStagger * 0.1,
      gapMid + 112,
      gapMid - 112,
      gapMid + 168,
      gapMid - 168,
      input.source.x + input.source.width + clearance + 24 + channelStagger * 0.1,
      input.target.x - clearance - 24 + channelStagger * 0.1,
    ]
    for (const midX of mids) {
      candidates.push(hvh(start, end, midX))
    }

    // Parallel horizontal approach lanes: keep wires parallel, spaced by laneGap.
    const baseLaneYs = [
      start.y,
      end.y,
      (start.y + end.y) / 2,
      Math.min(start.y, end.y) - laneGap,
      Math.max(start.y, end.y) + laneGap,
      Math.min(input.source.y, input.target.y) - clearance - laneGap,
      Math.max(
        input.source.y + input.source.height,
        input.target.y + input.target.height,
      ) +
        clearance +
        laneGap,
    ]
    for (const laneY of baseLaneYs) {
      candidates.push(
        detourHorizontalLane(
          start,
          end,
          sourceSide,
          laneY,
          clearance + 36 + Math.abs(approachBias) * 0.3,
        ),
      )
      candidates.push(
        detourHorizontalLane(
          start,
          end,
          sourceSide,
          laneY,
          clearance + 88 + Math.abs(approachBias) * 0.3,
        ),
      )
    }

    // Extra elongated mid-channel: exit further, hold a long H lane at approach Y.
    if (fanInCount > 1 || fanOutCount > 1 || parallelCount > 1) {
      const holdY = end.y
      const exit = clearance + 50 + Math.abs(approachBias)
      candidates.push(
        detourHorizontalLane(start, end, sourceSide, holdY, exit),
      )
      candidates.push(
        detourHorizontalLane(
          start,
          end,
          sourceSide,
          holdY + (fanInIndex % 2 === 0 ? laneGap : -laneGap),
          exit + 40,
        ),
      )
    }
  } else {
    const gapMid = (sc.y + tc.y) / 2
    const mids = [
      gapMid + channelStagger * 0.2,
      gapMid + 56,
      gapMid - 56,
      gapMid + 112,
      gapMid - 112,
      input.source.y + input.source.height + clearance + 24,
      input.target.y - clearance - 24,
    ]
    for (const midY of mids) {
      candidates.push(vhv(start, end, midY))
    }
    const leftLane =
      Math.min(input.source.x, input.target.x) - clearance - 40 - Math.abs(approachBias)
    const rightLane =
      Math.max(
        input.source.x + input.source.width,
        input.target.x + input.target.width,
      ) +
      clearance +
      40 +
      Math.abs(approachBias)
    for (const laneX of [
      leftLane,
      rightLane,
      leftLane - laneGap,
      rightLane + laneGap,
    ]) {
      candidates.push(
        simplify([
          start,
          {
            x: start.x,
            y:
              start.y +
              (sourceSide === 'bottom' ? clearance + 20 : -(clearance + 20)),
          },
          {
            x: laneX,
            y:
              start.y +
              (sourceSide === 'bottom' ? clearance + 20 : -(clearance + 20)),
          },
          { x: laneX, y: end.y },
          end,
        ]),
      )
    }
  }

  let bestPoints = candidates[0] ?? [start, end]
  let bestScore = Number.NEGATIVE_INFINITY
  let bestPlacement = placeCenteredLabel(
    bestPoints,
    labelBox,
    obstacles,
    reservedLabels,
    labelId,
    foreignWires,
  )

  for (const candidate of candidates) {
    const { total, placement } = scoreRoute(
      candidate,
      obstacles,
      reservedLabels,
      foreignWires,
      labelBox,
      labelId,
    )
    if (total > bestScore) {
      bestScore = total
      bestPoints = candidate
      bestPlacement = placement
    }
  }

  const points = simplify(bestPoints)
  return {
    points,
    label: bestPlacement.label,
    labelRect: bestPlacement.labelRect,
    sourceSide,
    targetSide,
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

function groupFanIndexes(edges: RoutedEdgeSpec[]): {
  fanIn: Map<string, { index: number; count: number }>
  fanOut: Map<string, { index: number; count: number }>
} {
  const byTarget = new Map<string, string[]>()
  const bySource = new Map<string, string[]>()
  for (const edge of edges) {
    const t = byTarget.get(edge.target) ?? []
    t.push(edge.id)
    byTarget.set(edge.target, t)
    const s = bySource.get(edge.source) ?? []
    s.push(edge.id)
    bySource.set(edge.source, s)
  }
  const fanIn = new Map<string, { index: number; count: number }>()
  const fanOut = new Map<string, { index: number; count: number }>()
  for (const ids of byTarget.values()) {
    ids.forEach((id, index) => {
      fanIn.set(id, { index, count: ids.length })
    })
  }
  for (const ids of bySource.values()) {
    ids.forEach((id, index) => {
      fanOut.set(id, { index, count: ids.length })
    })
  }
  return { fanIn, fanOut }
}

/**
 * Shift nearly-parallel horizontal lanes further apart when a label would
 * cover a neighbour wire — keeps them parallel, just with more air.
 */
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
            // Shift only the overlapping horizontal band of each polyline.
            const bandA = sa.a.y
            const bandB = sb.a.y
            routeA.points = routeA.points.map((p) =>
              Math.abs(p.y - bandA) < 1e-3 ? { x: p.x, y: p.y + shiftA } : p,
            )
            routeB.points = routeB.points.map((p) =>
              Math.abs(p.y - bandB) < 1e-3 ? { x: p.x, y: p.y + shiftB } : p,
            )
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
 * Route all edges: fan-in/out lane spacing by label height, then place labels
 * so they clear foreign wires and crossings (slide along segment / prefer
 * elongated lanes).
 */
export function routeAllOrthogonalEdges(input: {
  nodes: RouteRect[]
  edges: RoutedEdgeSpec[]
  clearance?: number
}): Map<string, OrthogonalRouteResult> {
  const byId = new Map(input.nodes.map((node) => [node.id, node]))
  const results = new Map<string, OrthogonalRouteResult>()
  const labelHeights = new Map<string, number>()
  const { fanIn, fanOut } = groupFanIndexes(input.edges)

  const pairKey = (a: string, b: string) => (a < b ? `${a}::${b}` : `${b}::${a}`)
  const pairCounts = new Map<string, number>()
  const pairSeen = new Map<string, number>()
  for (const edge of input.edges) {
    const key = pairKey(edge.source, edge.target)
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
  }

  // Phase 1 — geometry with fan spacing; accumulate wires for later edges.
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
    const fi = fanIn.get(edge.id) ?? { index: 0, count: 1 }
    const fo = fanOut.get(edge.id) ?? { index: 0, count: 1 }

    const routed = buildOrthogonalRoute({
      source,
      target,
      obstacles: input.nodes,
      reservedLabels: [...reservedLabels],
      foreignWires: [...foreignWires],
      labelBox,
      parallelIndex,
      parallelCount,
      fanInIndex: fi.index,
      fanInCount: fi.count,
      fanOutIndex: fo.index,
      fanOutCount: fo.count,
      laneGap: laneGapForLabels(labelBox.height),
      edgeIndex,
      clearance: input.clearance,
    })
    results.set(edge.id, routed)
    foreignWires.push(routed.points)
    reservedLabels.push(routed.labelRect)
  })

  // Phase 2 — pull nearly-parallel lanes further apart (label-height aware).
  separateParallelLanes(results, labelHeights)

  // Phase 3 — re-place every label against the final set of wires so a label
  // never sits on a crossing or covers a neighbour wire.
  const allIds = [...results.keys()]
  for (let pass = 0; pass < 2; pass += 1) {
    for (const id of allIds) {
      const route = results.get(id)!
      const edge = input.edges.find((candidate) => candidate.id === id)
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
      const obstacles = input.nodes
        .filter(
          (node) =>
            node.id !== edge?.source && node.id !== edge?.target,
        )
        .map((node) => inflate(node, (input.clearance ?? DEFAULT_CLEARANCE) * 0.35))

      const placement = placeCenteredLabel(
        route.points,
        labelBox,
        obstacles,
        otherLabels,
        `label:${id}`,
        others,
      )
      route.label = placement.label
      route.labelRect = placement.labelRect
      route.path = pointsToRoundedPath(route.points)
    }
  }

  return results
}

/** Estimate spacing pressure — used by layout to expand when nodes are cramped. */
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
