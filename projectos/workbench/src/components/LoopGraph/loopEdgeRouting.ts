import type { IntentEdgePort, IntentGraphNode } from '@contracts/index'

export type Point = { x: number; y: number }

export const LOOP_NODE_W = 200
export const LOOP_NODE_H = 56
export const LOOP_PORT_INSET = 0

/** Stub length leaving / entering a port before the first bend. */
export const LOOP_EDGE_OFFSET = 20
/** Corner fillet radius for orthogonal bends (workflow-style). */
export const LOOP_EDGE_CORNER_RADIUS = 10
/**
 * Near-aligned ports within this px snap to a straight edge (no jog).
 * Reduces noisy micro-bends when nodes are almost facing.
 */
export const LOOP_EDGE_ALIGN_SNAP = 14
/** Keep labels this far from polyline corners. */
export const LOOP_EDGE_LABEL_CORNER_PAD = 18
/** Minimum usable straight run for parking a label. */
export const LOOP_EDGE_LABEL_MIN_SEGMENT = 36
/** Keep wires this far outside every node AABB (including source/target). */
export const LOOP_EDGE_NODE_CLEARANCE = 12

const PORTS: IntentEdgePort[] = ['n', 'e', 's', 'w']
const EPS = 0.5

export type ObstacleRect = {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/**
 * N/E/S/W attach points on the node AABB.
 * `along` (0..1) slides the point along the side (C4 multi-port). Default 0.5
 * is mid-side — for flat diamonds that is still the corner vertex.
 */
export function portPoint(
  node: Pick<IntentGraphNode, 'position'>,
  port: IntentEdgePort,
  width = LOOP_NODE_W,
  height = LOOP_NODE_H,
  along = 0.5,
): Point {
  const { x, y } = node.position
  const a = Math.min(1, Math.max(0, along))
  switch (port) {
    case 'n':
      return { x: x + width * a, y: y + LOOP_PORT_INSET }
    case 'e':
      return { x: x + width - LOOP_PORT_INSET, y: y + height * a }
    case 's':
      return { x: x + width * a, y: y + height - LOOP_PORT_INSET }
    case 'w':
      return { x: x + LOOP_PORT_INSET, y: y + height * a }
  }
}

export function portNormal(port: IntentEdgePort): Point {
  switch (port) {
    case 'n':
      return { x: 0, y: -1 }
    case 'e':
      return { x: 1, y: 0 }
    case 's':
      return { x: 0, y: 1 }
    case 'w':
      return { x: -1, y: 0 }
  }
}

function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPS
}

export function nearestPort(
  node: Pick<IntentGraphNode, 'position'>,
  point: Point,
  width = LOOP_NODE_W,
  height = LOOP_NODE_H,
  allowedPorts: readonly IntentEdgePort[] = PORTS,
): IntentEdgePort {
  const allowed =
    allowedPorts.length > 0 ? allowedPorts : (PORTS as readonly IntentEdgePort[])
  let best: IntentEdgePort = allowed[0] ?? 'n'
  let bestDist = Number.POSITIVE_INFINITY
  for (const port of allowed) {
    const d = dist2(portPoint(node, port, width, height), point)
    if (d < bestDist) {
      bestDist = d
      best = port
    }
  }
  return best
}

/**
 * Prefer the port pair with the fewest orthogonal bends (0 → 1 → 2),
 * among routes that do not overlap nodes. Ties break toward facing centers.
 */
export function preferredPortsForPair(
  source: Pick<IntentGraphNode, 'position' | 'id'>,
  target: Pick<IntentGraphNode, 'position' | 'id'>,
  width = LOOP_NODE_W,
  height = LOOP_NODE_H,
  sourceAllowed: readonly IntentEdgePort[] = PORTS,
  targetAllowed: readonly IntentEdgePort[] = PORTS,
  targetWidth = width,
  targetHeight = height,
  obstacles: ObstacleRect[] = [],
): { sourcePort: IntentEdgePort; targetPort: IntentEdgePort } {
  const sc = {
    x: source.position.x + width / 2,
    y: source.position.y + height / 2,
  }
  const tc = {
    x: target.position.x + targetWidth / 2,
    y: target.position.y + targetHeight / 2,
  }
  const facingSource = nearestPort(source, tc, width, height, sourceAllowed)
  const facingTarget = nearestPort(target, sc, targetWidth, targetHeight, targetAllowed)

  let best = { sourcePort: facingSource, targetPort: facingTarget }
  let bestScore = Number.POSITIVE_INFINITY

  for (const sp of sourceAllowed) {
    for (const tp of targetAllowed) {
      const start = portPoint(source, sp, width, height)
      const end = portPoint(target, tp, targetWidth, targetHeight)
      const points = pickClearOrthogonalRoute({
        start,
        end,
        sourcePort: sp,
        targetPort: tp,
        obstacles,
        sourceId: source.id,
        targetId: target.id,
      })
      const overlaps = polylineOverlapsObstacles(points, obstacles, {
        sourceId: source.id,
        targetId: target.id,
      })
      const bends = bendCount(points)
      const facingBonus =
        (sp === facingSource ? 0 : 0.35) + (tp === facingTarget ? 0 : 0.35)
      const score =
        (overlaps ? 1_000_000 : 0) + bends * 1000 + facingBonus * 100 + pathLength(points)
      if (score < bestScore) {
        bestScore = score
        best = { sourcePort: sp, targetPort: tp }
      }
    }
  }
  return best
}

export function nodeRect(
  node: Pick<IntentGraphNode, 'position' | 'id'>,
  width = LOOP_NODE_W,
  height = LOOP_NODE_H,
  pad = LOOP_EDGE_NODE_CLEARANCE,
): ObstacleRect {
  return {
    id: node.id,
    x: node.position.x - pad,
    y: node.position.y - pad,
    w: width + pad * 2,
    h: height + pad * 2,
  }
}

function pointInRect(p: Point, r: ObstacleRect, inset = 0): boolean {
  return (
    p.x > r.x + inset &&
    p.x < r.x + r.w - inset &&
    p.y > r.y + inset &&
    p.y < r.y + r.h - inset
  )
}

/**
 * Orthogonal segment vs AABB: true when the open segment crosses the rect
 * interior (edge grazing at exact boundary counts as a hit for clearance).
 */
export function orthoSegmentHitsRect(
  a: Point,
  b: Point,
  r: ObstacleRect,
): boolean {
  if (almostEqual(a.x, b.x) && almostEqual(a.y, b.y)) {
    return pointInRect(a, r)
  }
  if (almostEqual(a.y, b.y)) {
    const y = a.y
    if (y <= r.y || y >= r.y + r.h) return false
    const x0 = Math.min(a.x, b.x)
    const x1 = Math.max(a.x, b.x)
    return x1 > r.x && x0 < r.x + r.w
  }
  if (almostEqual(a.x, b.x)) {
    const x = a.x
    if (x <= r.x || x >= r.x + r.w) return false
    const y0 = Math.min(a.y, b.y)
    const y1 = Math.max(a.y, b.y)
    return y1 > r.y && y0 < r.y + r.h
  }
  // Non-orthogonal: sample densely as a fallback.
  const steps = 24
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps
    if (
      pointInRect(
        { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        r,
      )
    ) {
      return true
    }
  }
  return false
}

/**
 * True when the wire overlaps any node. Source/target may only be touched at
 * the port endpoints — interior bends and mid segments must stay clear.
 */
export function polylineOverlapsObstacles(
  points: Point[],
  obstacles: ObstacleRect[],
  options?: {
    sourceId?: string | null
    targetId?: string | null
  },
): boolean {
  if (points.length < 2) return false
  const sourceId = options?.sourceId ?? null
  const targetId = options?.targetId ?? null
  const start = points[0]!
  const end = points[points.length - 1]!

  // Interior vertices (bends) must never sit inside a node clearance box.
  for (let i = 1; i < points.length - 1; i += 1) {
    const p = points[i]!
    for (const rect of obstacles) {
      if (pointInRect(p, rect)) return true
    }
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    for (const rect of obstacles) {
      if (!orthoSegmentHitsRect(a, b, rect)) continue

      // First segment may leave the source node through its port.
      if (
        i === 0 &&
        rect.id === sourceId &&
        almostEqual(a.x, start.x) &&
        almostEqual(a.y, start.y) &&
        !pointInRect(b, rect)
      ) {
        continue
      }
      // Last segment may enter the target node through its port.
      if (
        i === points.length - 2 &&
        rect.id === targetId &&
        almostEqual(b.x, end.x) &&
        almostEqual(b.y, end.y) &&
        !pointInRect(a, rect)
      ) {
        continue
      }
      return true
    }
  }
  return false
}

/** Drop near-duplicate / colinear middle points. */
export function simplifyOrthogonalPoints(points: Point[]): Point[] {
  if (points.length <= 2) return points.slice()
  const cleaned: Point[] = [points[0]!]
  for (let i = 1; i < points.length; i += 1) {
    const prev = cleaned[cleaned.length - 1]!
    const cur = points[i]!
    if (almostEqual(prev.x, cur.x) && almostEqual(prev.y, cur.y)) continue
    cleaned.push(cur)
  }
  if (cleaned.length <= 2) return cleaned

  const result: Point[] = [cleaned[0]!]
  for (let i = 1; i < cleaned.length - 1; i += 1) {
    const prev = result[result.length - 1]!
    const cur = cleaned[i]!
    const next = cleaned[i + 1]!
    const colinearH =
      almostEqual(prev.y, cur.y) && almostEqual(cur.y, next.y)
    const colinearV =
      almostEqual(prev.x, cur.x) && almostEqual(cur.x, next.x)
    if (colinearH || colinearV) continue
    result.push(cur)
  }
  result.push(cleaned[cleaned.length - 1]!)
  return result
}

function inferFacingPort(start: Point, end: Point): IntentEdgePort {
  if (Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)) {
    return end.x >= start.x ? 'w' : 'e'
  }
  return end.y >= start.y ? 'n' : 's'
}

function bendCount(points: Point[]): number {
  return Math.max(0, simplifyOrthogonalPoints(points).length - 2)
}

/** True when a straight orthogonal run leaves `port` toward `end`. */
function straightExitOk(
  start: Point,
  end: Point,
  port: IntentEdgePort,
): boolean {
  const n = portNormal(port)
  if (Math.abs(n.x) > Math.abs(n.y)) {
    // Horizontal exit: must share Y and move along the normal.
    if (!almostEqual(start.y, end.y)) return false
    return (end.x - start.x) * n.x > EPS
  }
  if (!almostEqual(start.x, end.x)) return false
  return (end.y - start.y) * n.y > EPS
}

function tryStraightRoute(
  start: Point,
  end: Point,
  sourcePort: IntentEdgePort,
  targetPort: IntentEdgePort,
): Point[] | null {
  if (!straightExitOk(start, end, sourcePort)) return null
  // Arriving into target: travel should oppose the outward normal.
  const tn = portNormal(targetPort)
  if (Math.abs(tn.x) > Math.abs(tn.y)) {
    if (!almostEqual(start.y, end.y)) return null
    if ((start.x - end.x) * tn.x <= EPS) return null
  } else {
    if (!almostEqual(start.x, end.x)) return null
    if ((start.y - end.y) * tn.y <= EPS) return null
  }
  return simplifyOrthogonalPoints([start, end])
}

/**
 * Near-aligned facing ports → short jogs onto a shared spine, then one long
 * straight run (still attached to real ports). Preferable to a wide mid-lane S.
 */
function tryNearAlignRoute(
  start: Point,
  end: Point,
  sourcePort: IntentEdgePort,
  targetPort: IntentEdgePort,
): Point[] | null {
  const sn = portNormal(sourcePort)
  const tn = portNormal(targetPort)
  const bothVertical =
    Math.abs(sn.y) > Math.abs(sn.x) && Math.abs(tn.y) > Math.abs(tn.x)
  const bothHorizontal =
    Math.abs(sn.x) > Math.abs(sn.y) && Math.abs(tn.x) > Math.abs(tn.y)

  if (bothVertical && Math.abs(start.x - end.x) <= LOOP_EDGE_ALIGN_SNAP) {
    // Must leave along source normal and arrive against target normal.
    if ((end.y - start.y) * sn.y <= EPS) return null
    if ((start.y - end.y) * tn.y <= EPS) return null
    const x = (start.x + end.x) / 2
    return simplifyOrthogonalPoints([
      start,
      { x, y: start.y },
      { x, y: end.y },
      end,
    ])
  }
  if (bothHorizontal && Math.abs(start.y - end.y) <= LOOP_EDGE_ALIGN_SNAP) {
    if ((end.x - start.x) * sn.x <= EPS) return null
    if ((start.x - end.x) * tn.x <= EPS) return null
    const y = (start.y + end.y) / 2
    return simplifyOrthogonalPoints([
      start,
      { x: start.x, y },
      { x: end.x, y },
      end,
    ])
  }
  return null
}

function ensureMinStub(
  start: Point,
  end: Point,
  normal: Point,
  offset: number,
): Point {
  const projected =
    Math.abs(normal.x) > Math.abs(normal.y)
      ? (end.x - start.x) * normal.x
      : (end.y - start.y) * normal.y
  // Keep stubs short; long forced stubs create extra zigzags.
  const distance =
    projected > offset * 2
      ? offset
      : Math.max(offset, projected > 0 ? Math.min(offset, projected * 0.35) : offset)
  return {
    x: start.x + normal.x * distance,
    y: start.y + normal.y * distance,
  }
}

/**
 * Push a port stub outward until it (and the exit segment) clear foreign nodes.
 */
function clearExitStub(
  start: Point,
  port: IntentEdgePort,
  obstacles: ObstacleRect[],
  selfId: string | null | undefined,
  minOffset: number,
): Point {
  const normal = portNormal(port)
  let dist = minOffset
  for (let i = 0; i < 32; i += 1) {
    const stub = {
      x: start.x + normal.x * dist,
      y: start.y + normal.y * dist,
    }
    const insideForeign = obstacles.some(
      (r) => r.id !== selfId && pointInRect(stub, r),
    )
    const segmentHitsForeign = obstacles.some(
      (r) =>
        r.id !== selfId && orthoSegmentHitsRect(start, stub, r),
    )
    if (!insideForeign && !segmentHitsForeign) return stub
    dist += LOOP_EDGE_NODE_CLEARANCE
  }
  return {
    x: start.x + normal.x * dist,
    y: start.y + normal.y * dist,
  }
}

function routeWithStubs(
  start: Point,
  end: Point,
  sourcePort: IntentEdgePort,
  targetPort: IntentEdgePort,
  offset: number,
  laneOffset: number,
): Point[] {
  const sn = portNormal(sourcePort)
  const tn = portNormal(targetPort)
  const sourceStub = ensureMinStub(start, end, sn, offset)
  const targetStub = ensureMinStub(end, start, tn, offset)
  const sourceHoriz = Math.abs(sn.x) > Math.abs(sn.y)
  const targetHoriz = Math.abs(tn.x) > Math.abs(tn.y)

  let bends: Point[] = []
  if (almostEqual(sourceStub.x, targetStub.x) || almostEqual(sourceStub.y, targetStub.y)) {
    bends = []
  } else if (sourceHoriz && targetHoriz) {
    const midX = (sourceStub.x + targetStub.x) / 2 + laneOffset
    bends = [
      { x: midX, y: sourceStub.y },
      { x: midX, y: targetStub.y },
    ]
  } else if (!sourceHoriz && !targetHoriz) {
    const midY = (sourceStub.y + targetStub.y) / 2 + laneOffset
    bends = [
      { x: sourceStub.x, y: midY },
      { x: targetStub.x, y: midY },
    ]
  } else if (sourceHoriz) {
    bends = [{ x: targetStub.x, y: sourceStub.y }]
  } else {
    bends = [{ x: sourceStub.x, y: targetStub.y }]
  }

  return simplifyOrthogonalPoints([
    start,
    sourceStub,
    ...bends,
    targetStub,
    end,
  ])
}

/** One-corner candidates (no forced stubs) when ports allow. */
function tryOneBendRoutes(
  start: Point,
  end: Point,
  sourcePort: IntentEdgePort,
  targetPort: IntentEdgePort,
): Point[][] {
  const tn = portNormal(targetPort)
  const candidates: Point[][] = []

  // Corner at (end.x, start.y): leave horizontally then arrive vertically.
  const c1 = { x: end.x, y: start.y }
  const via1 = simplifyOrthogonalPoints([start, c1, end])
  if (
    bendCount(via1) === 1 &&
    straightExitOk(start, c1, sourcePort) &&
    // Arrival into end along -tn
    ((Math.abs(tn.x) > Math.abs(tn.y) &&
      almostEqual(c1.y, end.y) &&
      (c1.x - end.x) * tn.x > EPS) ||
      (Math.abs(tn.y) > Math.abs(tn.x) &&
        almostEqual(c1.x, end.x) &&
        (c1.y - end.y) * tn.y > EPS))
  ) {
    candidates.push(via1)
  }

  // Corner at (start.x, end.y): leave vertically then arrive horizontally.
  const c2 = { x: start.x, y: end.y }
  const via2 = simplifyOrthogonalPoints([start, c2, end])
  if (
    bendCount(via2) === 1 &&
    straightExitOk(start, c2, sourcePort) &&
    ((Math.abs(tn.x) > Math.abs(tn.y) &&
      almostEqual(c2.y, end.y) &&
      (c2.x - end.x) * tn.x > EPS) ||
      (Math.abs(tn.y) > Math.abs(tn.x) &&
        almostEqual(c2.x, end.x) &&
        (c2.y - end.y) * tn.y > EPS))
  ) {
    candidates.push(via2)
  }

  return candidates.filter((pts) => bendCount(pts) <= 1 && pts.length >= 2)
}

function pathLength(points: Point[]): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    total += Math.hypot(
      points[i + 1]!.x - points[i]!.x,
      points[i + 1]!.y - points[i]!.y,
    )
  }
  return total
}

function dedupePolylines(candidates: Point[][]): Point[][] {
  const seen = new Set<string>()
  const out: Point[][] = []
  for (const pts of candidates) {
    const simplified = simplifyOrthogonalPoints(pts)
    if (simplified.length < 2) continue
    const key = simplified.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(simplified)
  }
  return out
}

/**
 * Exterior routes via obstacle hull / corners. Stubs are pushed clear of
 * foreign nodes first so vertical/horizontal runs never start inside a card.
 */
function exteriorHighwayRoutes(
  start: Point,
  end: Point,
  sourcePort: IntentEdgePort,
  targetPort: IntentEdgePort,
  offset: number,
  obstacles: ObstacleRect[],
  sourceId?: string | null,
  targetId?: string | null,
): Point[][] {
  const sourceStub = clearExitStub(
    start,
    sourcePort,
    obstacles,
    sourceId,
    offset,
  )
  const targetStub = clearExitStub(
    end,
    targetPort,
    obstacles,
    targetId,
    offset,
  )
  const routes: Point[][] = []
  if (obstacles.length === 0) return routes

  const pad = LOOP_EDGE_NODE_CLEARANCE
  let minX = Math.min(sourceStub.x, targetStub.x)
  let maxX = Math.max(sourceStub.x, targetStub.x)
  let minY = Math.min(sourceStub.y, targetStub.y)
  let maxY = Math.max(sourceStub.y, targetStub.y)
  for (const r of obstacles) {
    minX = Math.min(minX, r.x)
    maxX = Math.max(maxX, r.x + r.w)
    minY = Math.min(minY, r.y)
    maxY = Math.max(maxY, r.y + r.h)
  }

  const hullY = [minY - pad, maxY + pad]
  const hullX = [minX - pad, maxX + pad]

  for (const y of hullY) {
    // Reach the highway on a clear column (hull sides), then cross.
    for (const x of hullX) {
      routes.push(
        simplifyOrthogonalPoints([
          start,
          sourceStub,
          { x: sourceStub.x, y },
          { x, y },
          { x, y: targetStub.y },
          targetStub,
          end,
        ]),
      )
      routes.push(
        simplifyOrthogonalPoints([
          start,
          sourceStub,
          { x, y: sourceStub.y },
          { x, y },
          { x: targetStub.x, y },
          targetStub,
          end,
        ]),
      )
    }
    routes.push(
      simplifyOrthogonalPoints([
        start,
        sourceStub,
        { x: sourceStub.x, y },
        { x: targetStub.x, y },
        targetStub,
        end,
      ]),
    )
  }

  for (const x of hullX) {
    routes.push(
      simplifyOrthogonalPoints([
        start,
        sourceStub,
        { x, y: sourceStub.y },
        { x, y: targetStub.y },
        targetStub,
        end,
      ]),
    )
  }

  // Corner waypoints around each obstacle (including source/target boxes).
  for (const r of obstacles) {
    const corners = [
      { x: r.x - pad, y: r.y - pad },
      { x: r.x + r.w + pad, y: r.y - pad },
      { x: r.x - pad, y: r.y + r.h + pad },
      { x: r.x + r.w + pad, y: r.y + r.h + pad },
    ]
    for (const corner of corners) {
      routes.push(
        simplifyOrthogonalPoints([
          start,
          sourceStub,
          { x: sourceStub.x, y: corner.y },
          { x: corner.x, y: corner.y },
          { x: corner.x, y: targetStub.y },
          targetStub,
          end,
        ]),
      )
      routes.push(
        simplifyOrthogonalPoints([
          start,
          sourceStub,
          { x: corner.x, y: sourceStub.y },
          { x: corner.x, y: corner.y },
          { x: targetStub.x, y: corner.y },
          targetStub,
          end,
        ]),
      )
    }
  }

  return routes
}

/**
 * Enumerate orthogonal candidates ordered later by bend count + clearance.
 * Callers must filter with {@link polylineOverlapsObstacles}.
 */
export function enumerateOrthogonalCandidates(input: {
  start: Point
  end: Point
  sourcePort: IntentEdgePort
  targetPort?: IntentEdgePort | null
  offset?: number
  obstacles?: ObstacleRect[]
  sourceId?: string | null
  targetId?: string | null
}): Point[][] {
  const offset = input.offset ?? LOOP_EDGE_OFFSET
  const targetPort = input.targetPort ?? inferFacingPort(input.start, input.end)
  const { start, end } = input
  const obstacles = input.obstacles ?? []
  const candidates: Point[][] = []

  const straight = tryStraightRoute(start, end, input.sourcePort, targetPort)
  if (straight) candidates.push(straight)

  const nearAlign = tryNearAlignRoute(start, end, input.sourcePort, targetPort)
  if (nearAlign) candidates.push(nearAlign)

  candidates.push(...tryOneBendRoutes(start, end, input.sourcePort, targetPort))

  const laneOffsets = [0, 36, -36, 72, -72, 108, -108, 144, -144]
  for (const lane of laneOffsets) {
    candidates.push(
      routeWithStubs(start, end, input.sourcePort, targetPort, offset, lane),
    )
  }

  // Stub-cleared 2-bend using exit points that sit outside foreign nodes.
  if (obstacles.length > 0) {
    const sourceStub = clearExitStub(
      start,
      input.sourcePort,
      obstacles,
      input.sourceId,
      offset,
    )
    const targetStub = clearExitStub(
      end,
      targetPort,
      obstacles,
      input.targetId,
      offset,
    )
    if (
      !almostEqual(sourceStub.x, targetStub.x) &&
      !almostEqual(sourceStub.y, targetStub.y)
    ) {
      candidates.push(
        simplifyOrthogonalPoints([
          start,
          sourceStub,
          { x: targetStub.x, y: sourceStub.y },
          targetStub,
          end,
        ]),
      )
      candidates.push(
        simplifyOrthogonalPoints([
          start,
          sourceStub,
          { x: sourceStub.x, y: targetStub.y },
          targetStub,
          end,
        ]),
      )
    } else {
      candidates.push(
        simplifyOrthogonalPoints([start, sourceStub, targetStub, end]),
      )
    }
  }

  candidates.push(
    ...exteriorHighwayRoutes(
      start,
      end,
      input.sourcePort,
      targetPort,
      offset,
      obstacles,
      input.sourceId,
      input.targetId,
    ),
  )

  return dedupePolylines(candidates)
}

/** Guaranteed-clear perimeter route far outside every obstacle hull. */
function forcedPerimeterRoute(
  start: Point,
  end: Point,
  sourcePort: IntentEdgePort,
  targetPort: IntentEdgePort,
  offset: number,
  obstacles: ObstacleRect[],
  sourceId?: string | null,
  targetId?: string | null,
): Point[] {
  const sourceStub = clearExitStub(start, sourcePort, obstacles, sourceId, offset)
  const targetStub = clearExitStub(end, targetPort, obstacles, targetId, offset)

  let minX = Math.min(start.x, end.x, sourceStub.x, targetStub.x)
  let maxX = Math.max(start.x, end.x, sourceStub.x, targetStub.x)
  let minY = Math.min(start.y, end.y, sourceStub.y, targetStub.y)
  let maxY = Math.max(start.y, end.y, sourceStub.y, targetStub.y)
  for (const r of obstacles) {
    minX = Math.min(minX, r.x)
    maxX = Math.max(maxX, r.x + r.w)
    minY = Math.min(minY, r.y)
    maxY = Math.max(maxY, r.y + r.h)
  }
  const margin = LOOP_EDGE_NODE_CLEARANCE * 2 + offset
  const top = minY - margin
  const bottom = maxY + margin
  const left = minX - margin
  const right = maxX + margin

  const options: Point[][] = [
    // Top perimeter via left/right columns (never climb through a card).
    simplifyOrthogonalPoints([
      start,
      sourceStub,
      { x: left, y: sourceStub.y },
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: targetStub.y },
      targetStub,
      end,
    ]),
    simplifyOrthogonalPoints([
      start,
      sourceStub,
      { x: right, y: sourceStub.y },
      { x: right, y: top },
      { x: left, y: top },
      { x: left, y: targetStub.y },
      targetStub,
      end,
    ]),
    simplifyOrthogonalPoints([
      start,
      sourceStub,
      { x: left, y: sourceStub.y },
      { x: left, y: bottom },
      { x: right, y: bottom },
      { x: right, y: targetStub.y },
      targetStub,
      end,
    ]),
    simplifyOrthogonalPoints([
      start,
      sourceStub,
      { x: right, y: sourceStub.y },
      { x: right, y: bottom },
      { x: left, y: bottom },
      { x: left, y: targetStub.y },
      targetStub,
      end,
    ]),
  ]

  let best: Point[] = options[0]!
  let bestLen = pathLength(best)
  for (const pts of options) {
    const len = pathLength(pts)
    if (len < bestLen) {
      bestLen = len
      best = pts
    }
  }
  return best
}

/**
 * Pick the fewest-bend clear route. Never returns a path that overlaps a node
 * when a clear alternative exists (including a far perimeter fallback).
 * When foreign wires / label box are provided, also prefer fewer crossings and
 * a seat that can host the label (C4-style soft scoring).
 */
export function pickClearOrthogonalRoute(input: {
  start: Point
  end: Point
  sourcePort: IntentEdgePort
  targetPort?: IntentEdgePort | null
  offset?: number
  obstacles?: ObstacleRect[]
  sourceId?: string | null
  targetId?: string | null
  foreignWires?: Point[][]
  reservedLabels?: LabelRect[]
  labelBox?: { width: number; height: number }
}): Point[] {
  const offset = input.offset ?? LOOP_EDGE_OFFSET
  const targetPort = input.targetPort ?? inferFacingPort(input.start, input.end)
  const obstacles = input.obstacles ?? []
  const foreignWires = input.foreignWires ?? []
  const reservedLabels = input.reservedLabels ?? []
  const labelBox = input.labelBox
  const hitOpts = {
    sourceId: input.sourceId,
    targetId: input.targetId,
  }

  const candidates = enumerateOrthogonalCandidates({
    start: input.start,
    end: input.end,
    sourcePort: input.sourcePort,
    targetPort,
    offset,
    obstacles,
    sourceId: input.sourceId,
    targetId: input.targetId,
  })

  const clear: Point[][] = candidates.filter(
    (pts) => !polylineOverlapsObstacles(pts, obstacles, hitOpts),
  )

  if (clear.length === 0) {
    const forced = forcedPerimeterRoute(
      input.start,
      input.end,
      input.sourcePort,
      targetPort,
      offset,
      obstacles,
      input.sourceId,
      input.targetId,
    )
    // Far perimeter is the escape hatch when every local corridor is blocked.
    return forced
  }

  const scoreRoute = (pts: Point[]) => {
    // Lower is better.
    let score = bendCount(pts) * 1000 + pathLength(pts) * 0.15
    score += countPolylineCrossings(pts, foreignWires) * 70
    if (labelBox) {
      const place = placeEdgeLabelOnPolyline(pts, {
        labelSpan: labelBox.width,
        labelHeight: labelBox.height,
        obstacles,
        reservedLabels,
        foreignWires,
      })
      // Invert label score (higher placement score → lower route cost).
      score -= Math.max(-500, Math.min(400, place.score)) * 0.35
    }
    return score
  }

  clear.sort((a, b) => scoreRoute(a) - scoreRoute(b))
  return clear[0]!
}

/**
 * Build an orthogonal polyline from source port → target port (or free end).
 * Prefers 0 bends, then near-align jogs, then 1 bend, then stubbed 2-bend.
 * When obstacles are provided, only node-clear routes are preferred.
 */
export function buildOrthogonalEdgePoints(input: {
  start: Point
  end: Point
  sourcePort: IntentEdgePort
  targetPort?: IntentEdgePort | null
  offset?: number
  laneOffset?: number
  obstacles?: ObstacleRect[]
  sourceId?: string | null
  targetId?: string | null
}): Point[] {
  if (input.obstacles && input.obstacles.length > 0) {
    return pickClearOrthogonalRoute({
      start: input.start,
      end: input.end,
      sourcePort: input.sourcePort,
      targetPort: input.targetPort,
      offset: input.offset,
      obstacles: input.obstacles,
      sourceId: input.sourceId,
      targetId: input.targetId,
    })
  }

  const offset = input.offset ?? LOOP_EDGE_OFFSET
  const laneOffset = input.laneOffset ?? 0
  const targetPort = input.targetPort ?? inferFacingPort(input.start, input.end)
  const { start, end } = input

  const straight = tryStraightRoute(start, end, input.sourcePort, targetPort)
  if (straight) return straight

  if (laneOffset === 0) {
    const nearAlign = tryNearAlignRoute(
      start,
      end,
      input.sourcePort,
      targetPort,
    )
    if (nearAlign) return nearAlign

    const oneBend = tryOneBendRoutes(start, end, input.sourcePort, targetPort)
    if (oneBend.length > 0) {
      oneBend.sort((a, b) => pathLength(b) - pathLength(a))
      return oneBend[0]!
    }
  }

  return routeWithStubs(
    start,
    end,
    input.sourcePort,
    targetPort,
    offset,
    laneOffset,
  )
}

/** SVG path with filleted orthogonal corners (quadratic). */
export function pointsToRoundedPath(
  points: Point[],
  radius = LOOP_EDGE_CORNER_RADIUS,
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

function pointAlongSegment(a: Point, b: Point, t: number): Point {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }
}

function midpointOnPolyline(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]!
  let total = 0
  const lengths: number[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const len = Math.hypot(
      points[i + 1]!.x - points[i]!.x,
      points[i + 1]!.y - points[i]!.y,
    )
    lengths.push(len)
    total += len
  }
  if (total <= 0) return points[0]!
  let remaining = total / 2
  for (let i = 0; i < lengths.length; i += 1) {
    const len = lengths[i]!
    if (remaining <= len) {
      const t = len === 0 ? 0 : remaining / len
      return pointAlongSegment(points[i]!, points[i + 1]!, t)
    }
    remaining -= len
  }
  return points[points.length - 1]!
}

export interface EdgeLabelPlacement {
  /** Anchor for the label chip (center). */
  point: Point
  /** Index of the polyline segment used. */
  segmentIndex: number
  /** Usable length of that segment after corner padding. */
  usableLength: number
}

export type LabelRect = {
  id?: string
  x: number
  y: number
  w: number
  h: number
}

export function labelRectAt(
  mid: Point,
  width: number,
  height: number,
  id?: string,
): LabelRect {
  return {
    id,
    x: mid.x - width / 2,
    y: mid.y - height / 2,
    w: width,
    h: height,
  }
}

export function rectsOverlap(
  a: LabelRect,
  b: LabelRect,
  pad = 0,
): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  )
}

/** Orthogonal H×V segment crossing point, or null. */
export function orthogonalCrossing(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): Point | null {
  const aH = almostEqual(a1.y, a2.y)
  const aV = almostEqual(a1.x, a2.x)
  const bH = almostEqual(b1.y, b2.y)
  const bV = almostEqual(b1.x, b2.x)
  if (aH && bV) {
    const y = a1.y
    const x = b1.x
    const inA = x >= Math.min(a1.x, a2.x) - EPS && x <= Math.max(a1.x, a2.x) + EPS
    const inB = y >= Math.min(b1.y, b2.y) - EPS && y <= Math.max(b1.y, b2.y) + EPS
    return inA && inB ? { x, y } : null
  }
  if (aV && bH) {
    const x = a1.x
    const y = b1.y
    const inA = y >= Math.min(a1.y, a2.y) - EPS && y <= Math.max(a1.y, a2.y) + EPS
    const inB = x >= Math.min(b1.x, b2.x) - EPS && x <= Math.max(b1.x, b2.x) + EPS
    return inA && inB ? { x, y } : null
  }
  return null
}

export function countPolylineCrossings(
  points: Point[],
  foreignWires: Point[][],
): number {
  let count = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const a1 = points[i]!
    const a2 = points[i + 1]!
    for (const wire of foreignWires) {
      for (let j = 0; j < wire.length - 1; j += 1) {
        if (orthogonalCrossing(a1, a2, wire[j]!, wire[j + 1]!)) count += 1
      }
    }
  }
  return count
}

function labelOverlapsWire(
  rect: LabelRect,
  foreignWires: Point[][],
  pad = 6,
): number {
  const inflated: ObstacleRect = {
    id: 'label',
    x: rect.x - pad,
    y: rect.y - pad,
    w: rect.w + pad * 2,
    h: rect.h + pad * 2,
  }
  let hits = 0
  for (const wire of foreignWires) {
    for (let i = 0; i < wire.length - 1; i += 1) {
      if (orthoSegmentHitsRect(wire[i]!, wire[i + 1]!, inflated)) hits += 1
    }
  }
  return hits
}

/**
 * Park the edge label on a clear straight run (C4-style): prefer long
 * horizontal segments, sample along the run, and reject seats that hit nodes,
 * other labels, foreign wires, or crossings.
 */
export function placeEdgeLabelOnPolyline(
  points: Point[],
  options?: {
    cornerPad?: number
    minSegment?: number
    /** Estimated label footprint along the wire (px); biases longer runs. */
    labelSpan?: number
    labelHeight?: number
    obstacles?: ObstacleRect[]
    reservedLabels?: LabelRect[]
    foreignWires?: Point[][]
    labelId?: string
  },
): EdgeLabelPlacement & { labelRect: LabelRect; score: number } {
  const cornerPad = options?.cornerPad ?? LOOP_EDGE_LABEL_CORNER_PAD
  const minSegment = options?.minSegment ?? LOOP_EDGE_LABEL_MIN_SEGMENT
  const labelSpan = Math.max(48, options?.labelSpan ?? 96)
  const labelHeight = Math.max(16, options?.labelHeight ?? 20)
  const obstacles = options?.obstacles ?? []
  const reservedLabels = options?.reservedLabels ?? []
  const foreignWires = options?.foreignWires ?? []
  const simplified = simplifyOrthogonalPoints(points)

  const emptyRect = labelRectAt({ x: 0, y: 0 }, labelSpan, labelHeight, options?.labelId)
  if (simplified.length === 0) {
    return {
      point: { x: 0, y: 0 },
      segmentIndex: 0,
      usableLength: 0,
      labelRect: emptyRect,
      score: -9999,
    }
  }
  if (simplified.length === 1) {
    const point = simplified[0]!
    return {
      point,
      segmentIndex: 0,
      usableLength: 0,
      labelRect: labelRectAt(point, labelSpan, labelHeight, options?.labelId),
      score: -999,
    }
  }

  type Seg = {
    index: number
    a: Point
    b: Point
    length: number
    usable: number
    horizontal: boolean
  }
  const segments: Seg[] = []
  for (let i = 0; i < simplified.length - 1; i += 1) {
    const a = simplified[i]!
    const b = simplified[i + 1]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const pad = Math.min(cornerPad, length / 2)
    segments.push({
      index: i,
      a,
      b,
      length,
      usable: Math.max(0, length - pad * 2),
      horizontal: almostEqual(a.y, b.y),
    })
  }

  const ranked = [...segments].sort((a, b) => {
    if (a.horizontal !== b.horizontal) return a.horizontal ? -1 : 1
    return b.length - a.length
  })

  let best: EdgeLabelPlacement & { labelRect: LabelRect; score: number } | null =
    null

  for (const seg of ranked) {
    const pad = Math.min(cornerPad, seg.length / 2)
    const t0 = seg.length > 0 ? pad / seg.length : 0
    const t1 = 1 - t0
    const samples = seg.horizontal
      ? [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78, 0.15, 0.85]
      : [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]
    const crossings: Point[] = []
    for (const wire of foreignWires) {
      for (let j = 0; j < wire.length - 1; j += 1) {
        const cross = orthogonalCrossing(seg.a, seg.b, wire[j]!, wire[j + 1]!)
        if (cross) crossings.push(cross)
      }
    }

    for (const rawT of samples) {
      const t = Math.min(t1, Math.max(t0, rawT))
      const mid = pointAlongSegment(seg.a, seg.b, t)
      const rect = labelRectAt(mid, labelSpan, labelHeight, options?.labelId)
      let score = Math.min(seg.length, 280) * (seg.horizontal ? 1.4 : 0.7)
      score += (1 - Math.abs(t - 0.5) * 2) * 28
      if (seg.usable >= Math.max(minSegment, labelSpan * 0.55)) score += 40
      if (seg.index > 0 && seg.index < segments.length - 1) score += 6

      let clear = true
      for (const obstacle of obstacles) {
        if (
          rectsOverlap(
            rect,
            { x: obstacle.x, y: obstacle.y, w: obstacle.w, h: obstacle.h },
            4,
          )
        ) {
          score -= 2000
          clear = false
        }
      }
      for (const reserved of reservedLabels) {
        if (rectsOverlap(rect, reserved, 10)) {
          score -= 1600
          clear = false
        }
      }
      const wireHits = labelOverlapsWire(rect, foreignWires, 6)
      if (wireHits > 0) {
        score -= wireHits * 900
        clear = false
      }
      if (seg.horizontal && seg.length + 4 < labelSpan) {
        score -= 800
        clear = false
      }
      for (const cross of crossings) {
        const dx = Math.abs(mid.x - cross.x)
        const dy = Math.abs(mid.y - cross.y)
        if (dx < labelSpan / 2 + 14 && dy < labelHeight / 2 + 14) {
          score -= 600
          clear = false
        } else if (dx < labelSpan / 2 + 40 && dy < labelHeight / 2 + 20) {
          score -= 120
        }
      }

      const candidate = {
        point: mid,
        segmentIndex: seg.index,
        usableLength: seg.usable,
        labelRect: rect,
        score,
      }
      if (!best || score > best.score) best = candidate
      if (clear && Math.abs(t - 0.5) < 0.05 && score > 120) return candidate
    }
  }

  if (best) return best
  const fallback = midpointOnPolyline(simplified)
  return {
    point: fallback,
    segmentIndex: 0,
    usableLength: 0,
    labelRect: labelRectAt(fallback, labelSpan, labelHeight, options?.labelId),
    score: -999,
  }
}

export interface RoutedEdge {
  d: string
  x1: number
  y1: number
  x2: number
  y2: number
  mid: Point
  sourcePort: IntentEdgePort
  targetPort: IntentEdgePort | null
  points: Point[]
}

/**
 * Soft cubic curve for Agent wiring ↔ config satellite (`provides`).
 * Intentionally not orthogonal — curves mark capability wiring vs workflow edges.
 */
export function routeProvidesCurve(input: {
  start: Point
  end: Point
}): { d: string; mid: Point; points: Point[] } {
  const { start, end } = input
  const midY = (start.y + end.y) / 2
  const c1 = { x: start.x, y: midY }
  const c2 = { x: end.x, y: midY }
  const mid = {
    x: (start.x + end.x) / 2,
    y: midY,
  }
  return {
    d: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
    mid,
    points: [start, c1, c2, end],
  }
}

/**
 * Route an orthogonal edge (H/V segments + rounded corners) from a source port
 * to a target port — or a free-floating point while dragging a new edge.
 * Do not use for `provides` wiring — call {@link routeProvidesCurve} instead.
 */
export function routeLoopEdge(input: {
  source: IntentGraphNode
  target?: IntentGraphNode | null
  endPoint?: Point | null
  sourcePort?: IntentEdgePort
  targetPort?: IntentEdgePort
  /** Restrict auto-picked / clamped source ports (e.g. Agent bottom reserved). */
  sourceAllowedPorts?: readonly IntentEdgePort[]
  targetAllowedPorts?: readonly IntentEdgePort[]
  obstacles?: IntentGraphNode[]
  /**
   * Per-node box size for obstacle clearance. Defaults to source width/height
   * when omitted — callers should pass real sizes for Agents/diamonds.
   */
  obstacleSize?: (
    node: IntentGraphNode,
  ) => { width: number; height: number }
  width?: number
  height?: number
  targetWidth?: number
  targetHeight?: number
  /** Parallel-edge lane nudge (px) when several edges share a corridor. */
  laneOffset?: number
  offset?: number
  cornerRadius?: number
  /** When set, label parking prefers segments that can host this chip. */
  labelText?: string
  /** Along-side fraction (0..1) for multi-port attach. Default mid-side. */
  sourceAlong?: number
  targetAlong?: number
}): RoutedEdge {
  const width = input.width ?? LOOP_NODE_W
  const height = input.height ?? LOOP_NODE_H
  const targetWidth = input.targetWidth ?? width
  const targetHeight = input.targetHeight ?? height
  const sourceAllowed = input.sourceAllowedPorts ?? PORTS
  const targetAllowed = input.targetAllowedPorts ?? PORTS
  const sourceAlong = input.sourceAlong ?? 0.5
  const targetAlong = input.targetAlong ?? 0.5
  const sizeOf =
    input.obstacleSize ??
    ((node: IntentGraphNode) => {
      if (node.id === input.source.id) return { width, height }
      if (node.id === input.target?.id) {
        return { width: targetWidth, height: targetHeight }
      }
      return { width, height }
    })

  const obstacleRects: ObstacleRect[] = (input.obstacles ?? []).map((node) => {
    const size = sizeOf(node)
    return nodeRect(node, size.width, size.height, LOOP_EDGE_NODE_CLEARANCE)
  })

  // Always include source/target as obstacles so bends cannot hide under them.
  const ensureObstacle = (
    node: IntentGraphNode,
    w: number,
    h: number,
  ) => {
    if (!obstacleRects.some((r) => r.id === node.id)) {
      obstacleRects.push(nodeRect(node, w, h, LOOP_EDGE_NODE_CLEARANCE))
    }
  }
  ensureObstacle(input.source, width, height)
  if (input.target) ensureObstacle(input.target, targetWidth, targetHeight)

  const end: Point =
    input.endPoint ??
    (input.target
      ? {
          x: input.target.position.x + targetWidth / 2,
          y: input.target.position.y + targetHeight / 2,
        }
      : portPoint(
          input.source,
          sourceAllowed.includes('s') ? 's' : (sourceAllowed[0] ?? 'n'),
          width,
          height,
          sourceAlong,
        ))

  const sourceFixed =
    Boolean(input.sourcePort) && sourceAllowed.includes(input.sourcePort!)
  const targetFixed =
    Boolean(input.targetPort) &&
    Boolean(input.target) &&
    targetAllowed.includes(input.targetPort!)

  let sourcePort: IntentEdgePort
  let targetPort: IntentEdgePort | null = null

  if (input.target && (!sourceFixed || !targetFixed)) {
    const preferred = preferredPortsForPair(
      input.source,
      input.target,
      width,
      height,
      sourceAllowed,
      targetAllowed,
      targetWidth,
      targetHeight,
      obstacleRects,
    )
    sourcePort = sourceFixed ? input.sourcePort! : preferred.sourcePort
    targetPort = targetFixed ? input.targetPort! : preferred.targetPort
  } else {
    sourcePort =
      sourceFixed
        ? input.sourcePort!
        : nearestPort(input.source, end, width, height, sourceAllowed)
    if (input.target) {
      targetPort = targetFixed
        ? input.targetPort!
        : nearestPort(
            input.target,
            portPoint(input.source, sourcePort, width, height, sourceAlong),
            targetWidth,
            targetHeight,
            targetAllowed,
          )
    } else {
      targetPort = input.targetPort ?? null
    }
  }

  const p0 = portPoint(input.source, sourcePort, width, height, sourceAlong)
  const p3 =
    input.target && targetPort
      ? portPoint(
          input.target,
          targetPort,
          targetWidth,
          targetHeight,
          targetAlong,
        )
      : end

  // Lane offset nudges are folded into candidate enumeration; keep API compat.
  const baseLane = input.laneOffset ?? 0
  let points = pickClearOrthogonalRoute({
    start: p0,
    end: p3,
    sourcePort,
    targetPort,
    offset: input.offset,
    obstacles: obstacleRects,
    sourceId: input.source.id,
    targetId: input.target?.id ?? null,
  })

  if (baseLane !== 0 && targetPort) {
    const nudged = routeWithStubs(
      p0,
      p3,
      sourcePort,
      targetPort,
      input.offset ?? LOOP_EDGE_OFFSET,
      baseLane,
    )
    if (
      !polylineOverlapsObstacles(nudged, obstacleRects, {
        sourceId: input.source.id,
        targetId: input.target?.id ?? null,
      })
    ) {
      points = nudged
    }
  }

  const labelSpan = input.labelText
    ? estimateEdgeLabelSpan(input.labelText)
    : 0
  const labelPlace = placeEdgeLabelOnPolyline(points, { labelSpan })
  return {
    d: pointsToRoundedPath(points, input.cornerRadius ?? LOOP_EDGE_CORNER_RADIUS),
    x1: p0.x,
    y1: p0.y,
    x2: p3.x,
    y2: p3.y,
    mid: labelPlace.point,
    sourcePort,
    targetPort,
    points,
  }
}

/** Normalize whitespace for edge labels. Full text is shown; the chip sizes to content. */
export function formatEdgeLabel(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

/** Rough chip width estimate for routing/label parking (matches CSS max 280). */
export function estimateEdgeLabelSpan(text: string): number {
  const trimmed = formatEdgeLabel(text)
  if (!trimmed) return 0
  // ~6.2px per character at 10px medium + horizontal padding.
  return Math.min(280, Math.max(48, trimmed.length * 6.2 + 16))
}

export type AlignNeighbor = {
  /** Neighbor top-left. */
  position: Point
  width: number
  height: number
  /** Port on the moving node for this link, when known. */
  localPort?: IntentEdgePort | null
}

/**
 * Soft-align a dragged node to neighbors so facing ports share an axis
 * (fewer orthogonal bends). Only snaps within {@link LOOP_EDGE_ALIGN_SNAP}*3.
 */
export function snapGraphNodePosition(input: {
  position: Point
  width: number
  height: number
  neighbors: AlignNeighbor[]
  snapPx?: number
}): Point {
  const snapPx = input.snapPx ?? LOOP_EDGE_ALIGN_SNAP * 3
  let { x, y } = input.position
  const cx = x + input.width / 2
  const cy = y + input.height / 2

  let bestDx = 0
  let bestDy = 0
  let bestDxAbs = snapPx + 1
  let bestDyAbs = snapPx + 1

  for (const neighbor of input.neighbors) {
    const ncx = neighbor.position.x + neighbor.width / 2
    const ncy = neighbor.position.y + neighbor.height / 2
    const port = neighbor.localPort
    const preferHorizontal =
      port === 'e' ||
      port === 'w' ||
      (!port && Math.abs(ncx - cx) >= Math.abs(ncy - cy))
    const preferVertical = port === 'n' || port === 's' || !preferHorizontal

    if (preferHorizontal) {
      const dy = ncy - cy
      const abs = Math.abs(dy)
      if (abs <= snapPx && abs < bestDyAbs) {
        bestDyAbs = abs
        bestDy = dy
      }
    }
    if (preferVertical) {
      const dx = ncx - cx
      const abs = Math.abs(dx)
      if (abs <= snapPx && abs < bestDxAbs) {
        bestDxAbs = abs
        bestDx = dx
      }
    }
  }

  if (bestDxAbs <= snapPx) x += bestDx
  if (bestDyAbs <= snapPx) y += bestDy
  return { x, y }
}

/** @deprecated Prefer formatEdgeLabel — canvas labels are no longer truncated. */
export function truncateEdgeLabel(text: string, max = 36): string {
  const trimmed = formatEdgeLabel(text)
  if (!trimmed) return ''
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}
