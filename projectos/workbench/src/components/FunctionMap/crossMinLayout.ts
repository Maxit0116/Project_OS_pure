/**
 * Edge-aware node layout for the Function Map.
 *
 * Goal: use the available panel space with the LARGEST possible node boxes,
 * subject to low overlap. On-screen node size = NODE_WIDTH * fitZoom, and
 * fitZoom = min(area / bounding-box), so the biggest nodes come from the
 * tightest bounding box that matches the panel aspect. A free force layout
 * wastes space (loose, tall), so instead we:
 *
 *   1. Run a quick force layout only to ORDER nodes (who sits near whom).
 *   2. Pack every node into a tight grid sized to the panel aspect — this is
 *      near the theoretical max node size for the area. Cells that fall under
 *      overlay chrome (zoom controls / minimap corners) are passed as
 *      `exclusions` and left EMPTY so nodes never hide behind those widgets;
 *      the bottom-center between them is still used.
 *   3. Swap grid cells to minimize edge crossings and edges-through-boxes
 *      (this also tucks unconnected nodes into cells that block nothing —
 *      "见缝插针").
 *   4. Nudge any node still sitting on an edge off it, keeping cards apart, then
 *      shove any node that drifted into a chrome corner back out.
 *
 * Grid gap is small (low overlap == comfortable spacing, not big margins).
 */

import {
  NODE_WIDTH,
  NODE_HEIGHT,
  GRID_MARGIN,
  type GridAreaRect,
  type GridPoint,
  gridBoundingBox,
} from './autoGridLayout'

/** Target center-to-center distance for a connected pair (ordering sim only). */
const IDEAL_EDGE_LEN = 160
const ITERATIONS = 300
/** Edge spring stiffness toward IDEAL_EDGE_LEN. */
const SPRING = 0.12
/** Pull toward the graph centroid — bounds the layout so it stays compact. */
const GRAVITY = 0.05
/** Short-range repulsion so non-adjacent nodes spread without inflating. */
const REPEL = 70_000
const REPEL_RANGE = 360
/** Collision push while simulating (soft) and during final cleanup (hard). */
const COLLISION_SIM = 0.5
const COLLISION_FINAL = 1.0
const COLLISION_FINAL_PASSES = 20
/** Minimum empty gap enforced between node rectangles. */
const MIN_SEP = 12
const STEP_TEMP = 30
const STEP_BASE = 3
/** Empty gap between cells in the packed grid. */
const GRID_GAP = 12
/**
 * Node-edge avoidance: keep a non-endpoint node's box off an edge segment.
 * The force starts after the graph has partly settled so it nudges rather
 * than fights the initial layout.
 */
const NE_MARGIN = 10
const NE_STRENGTH = 0.6
const NE_START_FRAC = 0.25
/** Weight of an edge-through-node hit relative to an edge crossing in swaps. */
const HIT_WEIGHT = 6
/** Deterministic passes that push blocking nodes clear of edges at the end. */
const NUDGE_PASSES = 24

export interface LayoutEdgeRef {
  source: string
  target: string
}

export interface CrossMinLayoutResult {
  /** Top-left positions keyed by node id. */
  positionsById: Record<string, GridPoint>
  /** Same order as `nodeIds` input — convenience for callers that still index. */
  positions: GridPoint[]
  bounds: { minX: number; minY: number; width: number; height: number }
}

export type CrossMinLayoutComplexityMode = 'detailed' | 'bounded'

/**
 * The detailed path deliberately does quadratic crossing and node/edge work.
 * Beyond this envelope, use a deterministic O(nodes × exclusions) grid so a
 * large graph cannot monopolize the renderer thread. Small-graph output stays
 * byte-for-byte on the existing algorithm.
 */
const DETAILED_LAYOUT_MAX_NODES = 48
const DETAILED_LAYOUT_MAX_EDGES = 96
const DETAILED_LAYOUT_MAX_NODE_EDGE_PAIRS = 3_000

export function crossMinLayoutComplexityMode(
  nodeCount: number,
  edgeCount: number,
): CrossMinLayoutComplexityMode {
  return nodeCount <= DETAILED_LAYOUT_MAX_NODES &&
    edgeCount <= DETAILED_LAYOUT_MAX_EDGES &&
    nodeCount * edgeCount <= DETAILED_LAYOUT_MAX_NODE_EDGE_PAIRS
    ? 'detailed'
    : 'bounded'
}

interface SimNode {
  id: string
  x: number
  y: number
  vx: number
  vy: number
}

export function hashUnit(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // Divide by 2^32, not UINT32_MAX: the latter can return exactly 1 and
  // produce an out-of-range array index after Math.floor(value * length).
  return (h >>> 0) / 0x1_0000_0000
}

function centersFromTopLeft(p: GridPoint): { cx: number; cy: number } {
  return { cx: p.x + NODE_WIDTH / 2, cy: p.y + NODE_HEIGHT / 2 }
}

function topLeftFromCenter(cx: number, cy: number): GridPoint {
  return { x: cx - NODE_WIDTH / 2, y: cy - NODE_HEIGHT / 2 }
}

function segmentsCross(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): boolean {
  const d =
    (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x)
  if (Math.abs(d) < 1e-9) return false
  const t =
    ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d
  const u =
    ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / d
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98
}

function countCrossings(
  centers: Map<string, { x: number; y: number }>,
  edges: LayoutEdgeRef[],
): number {
  const segs = edges
    .map((e) => {
      const a = centers.get(e.source)
      const b = centers.get(e.target)
      if (!a || !b) return null
      return { a, b, s: e.source, t: e.target }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)

  let count = 0
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const A = segs[i]
      const B = segs[j]
      if (A.s === B.s || A.s === B.t || A.t === B.s || A.t === B.t) continue
      if (segmentsCross(A.a, A.b, B.a, B.b)) count++
    }
  }
  return count
}

/**
 * Does segment a→b pass through the axis-aligned box centered at c
 * (half extents hW, hH)? Liang–Barsky clip; ignores grazes at the very ends.
 */
function segmentHitsBox(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  hW: number,
  hH: number,
): boolean {
  const dx = bx - ax
  const dy = by - ay
  const p = [-dx, dx, -dy, dy]
  const q = [ax - (cx - hW), cx + hW - ax, ay - (cy - hH), cy + hH - ay]
  let u1 = 0
  let u2 = 1
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) {
      if (q[i] < 0) return false
    } else {
      const r = q[i] / p[i]
      if (p[i] < 0) {
        if (r > u2) return false
        if (r > u1) u1 = r
      } else {
        if (r < u1) return false
        if (r < u2) u2 = r
      }
    }
  }
  return u1 <= u2 && u2 > 0.02 && u1 < 0.98
}

/** Count (edge, non-endpoint node) pairs where the node box blocks the edge. */
function countNodeEdgeHits(
  centers: Map<string, { x: number; y: number }>,
  ids: string[],
  edges: LayoutEdgeRef[],
): number {
  const hW = NODE_WIDTH / 2 + MIN_SEP / 2
  const hH = NODE_HEIGHT / 2 + MIN_SEP / 2
  let hits = 0
  for (const e of edges) {
    const a = centers.get(e.source)
    const b = centers.get(e.target)
    if (!a || !b) continue
    for (const id of ids) {
      if (id === e.source || id === e.target) continue
      const c = centers.get(id)
      if (!c) continue
      if (segmentHitsBox(a.x, a.y, b.x, b.y, c.x, c.y, hW, hH)) hits++
    }
  }
  return hits
}

function applyCollision(nodes: SimNode[], strength: number): void {
  const halfW = NODE_WIDTH / 2 + MIN_SEP / 2
  const halfH = NODE_HEIGHT / 2 + MIN_SEP / 2
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const overlapX = halfW * 2 - Math.abs(dx)
      const overlapY = halfH * 2 - Math.abs(dy)
      if (overlapX <= 0 || overlapY <= 0) continue
      // Resolve along the axis of least penetration.
      if (overlapX < overlapY) {
        const push = (overlapX / 2) * strength * Math.sign(dx || 1)
        a.x -= push
        b.x += push
      } else {
        const push = (overlapY / 2) * strength * Math.sign(dy || 1)
        a.y -= push
        b.y += push
      }
    }
  }
}

function runForceLayout(
  ids: string[],
  edges: LayoutEdgeRef[],
  aspect: number,
): Map<string, { x: number; y: number }> {
  const n = ids.length
  if (n === 0) return new Map()

  // Anisotropic gravity: for a wide viewport (aspect > 1) pull harder on Y and
  // seed wider on X, so the settled blob is wide-and-short like the panel.
  const sa = Math.sqrt(aspect)
  const gravityX = GRAVITY / sa
  const gravityY = GRAVITY * sa

  // Seed on a small ring (radius scales gently with n) so the sim starts
  // with angular spread but stays compact.
  const seedR = (IDEAL_EDGE_LEN * Math.sqrt(n)) / 3
  const nodes: SimNode[] = ids.map((id, i) => {
    const angle = (2 * Math.PI * i) / n + hashUnit(id) * 0.2
    const r = seedR + hashUnit(id + ':j') * 40
    return {
      id,
      x: Math.cos(angle) * r * sa,
      y: (Math.sin(angle) * r) / sa,
      vx: 0,
      vy: 0,
    }
  })

  const index = new Map(nodes.map((node, i) => [node.id, i]))
  const links = edges
    .map((e) => {
      const si = index.get(e.source)
      const ti = index.get(e.target)
      if (si === undefined || ti === undefined || si === ti) return null
      return { si, ti }
    })
    .filter((l): l is { si: number; ti: number } => l !== null)

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const temp = 1 - iter / ITERATIONS

    for (const node of nodes) {
      node.vx = 0
      node.vy = 0
    }

    // Centroid gravity — keeps the graph from inflating.
    let cx = 0
    let cy = 0
    for (const node of nodes) {
      cx += node.x
      cy += node.y
    }
    cx /= n
    cy /= n
    for (const node of nodes) {
      node.vx += (cx - node.x) * gravityX
      node.vy += (cy - node.y) * gravityY
    }

    // Short-range repulsion (only within REPEL_RANGE) so spacing is even
    // without a long-range field that would spread the graph out.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i]
        const b = nodes[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let dist2 = dx * dx + dy * dy
        if (dist2 < 1) {
          dx = (hashUnit(a.id) - 0.5) * 2
          dy = (hashUnit(b.id) - 0.5) * 2
          dist2 = dx * dx + dy * dy || 1
        }
        const dist = Math.sqrt(dist2)
        if (dist >= REPEL_RANGE) continue
        const force = REPEL / dist2
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        a.vx -= fx
        a.vy -= fy
        b.vx += fx
        b.vy += fy
      }
    }

    // Edge springs toward the ideal length.
    for (const { si, ti } of links) {
      const a = nodes[si]
      const b = nodes[ti]
      let dx = b.x - a.x
      let dy = b.y - a.y
      let dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 1e-6) {
        dx = 1
        dy = 0
        dist = 1
      }
      const force = SPRING * (dist - IDEAL_EDGE_LEN)
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }

    // Node-edge avoidance: push a blocking node off the segment (perpendicular)
    // and nudge the edge endpoints slightly the other way.
    if (iter > ITERATIONS * NE_START_FRAC) {
      const hW = NODE_WIDTH / 2
      const hH = NODE_HEIGHT / 2
      for (const { si, ti } of links) {
        const a = nodes[si]
        const b = nodes[ti]
        const dxs = b.x - a.x
        const dys = b.y - a.y
        const l2 = dxs * dxs + dys * dys || 1
        for (let k = 0; k < n; k++) {
          if (k === si || k === ti) continue
          const c = nodes[k]
          const t = ((c.x - a.x) * dxs + (c.y - a.y) * dys) / l2
          if (t <= 0.12 || t >= 0.88) continue
          const px = a.x + t * dxs
          const py = a.y + t * dys
          let vx = c.x - px
          let vy = c.y - py
          let dist = Math.sqrt(vx * vx + vy * vy)
          if (dist < 1e-6) {
            vx = hashUnit(c.id) - 0.5
            vy = hashUnit(c.id + ':y') - 0.5
            dist = Math.sqrt(vx * vx + vy * vy) || 1
          }
          const nx = vx / dist
          const ny = vy / dist
          const radius = hW * Math.abs(nx) + hH * Math.abs(ny) + NE_MARGIN
          if (dist < radius) {
            const push = (radius - dist) * NE_STRENGTH
            c.vx += nx * push
            c.vy += ny * push
            a.vx -= nx * push * 0.5
            a.vy -= ny * push * 0.5
            b.vx -= nx * push * 0.5
            b.vy -= ny * push * 0.5
          }
        }
      }
    }

    const stepCap = STEP_TEMP * temp + STEP_BASE
    for (const node of nodes) {
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy) || 1
      const capped = Math.min(speed, stepCap)
      node.x += (node.vx / speed) * capped
      node.y += (node.vy / speed) * capped
    }

    applyCollision(nodes, COLLISION_SIM)
  }

  // Final hard separation so no rectangles overlap after settling.
  for (let p = 0; p < COLLISION_FINAL_PASSES; p++) {
    applyCollision(nodes, COLLISION_FINAL)
  }

  return new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]))
}

/** Combined penalty: edge crossings plus (weighted) edges blocked by nodes. */
function layoutBadness(
  centers: Map<string, { x: number; y: number }>,
  ids: string[],
  edges: LayoutEdgeRef[],
): number {
  return (
    countCrossings(centers, edges) +
    HIT_WEIGHT * countNodeEdgeHits(centers, ids, edges)
  )
}

function reduceCrossings(
  centers: Map<string, { x: number; y: number }>,
  connectedIds: string[],
  edges: LayoutEdgeRef[],
): void {
  if (connectedIds.length < 2 || edges.length < 2) return

  let best = layoutBadness(centers, connectedIds, edges)
  if (best === 0) return

  // Swapping two node positions keeps rectangle separation valid (positions
  // are just exchanged), so this only ever trades crossings / blocked edges,
  // never overlap.
  const tries = Math.min(800, Math.max(150, connectedIds.length * 40))
  for (let t = 0; t < tries; t++) {
    const i = Math.floor(hashUnit(`swap:${t}:a`) * connectedIds.length)
    const j = Math.floor(hashUnit(`swap:${t}:b`) * connectedIds.length)
    if (i === j) continue
    const idA = connectedIds[i]
    const idB = connectedIds[j]
    const ca = centers.get(idA)
    const cb = centers.get(idB)
    if (!ca || !cb) continue

    centers.set(idA, { x: cb.x, y: cb.y })
    centers.set(idB, { x: ca.x, y: ca.y })
    const next = layoutBadness(centers, connectedIds, edges)
    if (next < best) {
      best = next
      if (best === 0) return
    } else {
      centers.set(idA, ca)
      centers.set(idB, cb)
    }
  }
}

/** Hard rectangle separation operating on a center map (post-processing). */
function separateCenters(
  centers: Map<string, { x: number; y: number }>,
  ids: string[],
  strength: number,
): void {
  const hW = NODE_WIDTH / 2 + MIN_SEP / 2
  const hH = NODE_HEIGHT / 2 + MIN_SEP / 2
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = centers.get(ids[i])
      const b = centers.get(ids[j])
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const overlapX = hW * 2 - Math.abs(dx)
      const overlapY = hH * 2 - Math.abs(dy)
      if (overlapX <= 0 || overlapY <= 0) continue
      if (overlapX < overlapY) {
        const push = (overlapX / 2) * strength * Math.sign(dx || 1)
        a.x -= push
        b.x += push
      } else {
        const push = (overlapY / 2) * strength * Math.sign(dy || 1)
        a.y -= push
        b.y += push
      }
    }
  }
}

/**
 * A rectangle in grid (pre-normalize center) space that no node box may overlap
 * — e.g. the screen region covered by the zoom controls or the minimap, mapped
 * into layout coordinates by the caller.
 */
export interface ExclusionRect {
  x: number
  y: number
  w: number
  h: number
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  b: ExclusionRect,
): boolean {
  return ax < b.x + b.w && ax + aw > b.x && ay < b.y + b.h && ay + ah > b.y
}

/** A node centered at (cx, cy) collides with any exclusion rectangle. */
function cellBlocked(cx: number, cy: number, exclusions: ExclusionRect[]): boolean {
  const x = cx - NODE_WIDTH / 2
  const y = cy - NODE_HEIGHT / 2
  for (const e of exclusions) {
    if (rectsOverlap(x, y, NODE_WIDTH, NODE_HEIGHT, e)) return true
  }
  return false
}

/**
 * Build tight grid cell centers (row-major) sized to fill `area` with the
 * largest node scale — i.e. choose the column count whose grid bounding box
 * gives the highest fit zoom for the panel. Cells overlapping an `exclusions`
 * rectangle (zoom controls / minimap corners) are left EMPTY so nodes never
 * sit under those widgets; rows are grown as needed to keep enough free cells.
 * Returns exactly `count` free cells.
 */
function computeAspectGrid(
  count: number,
  area: { width: number; height: number },
  gap: number,
  exclusions: ExclusionRect[] = [],
): { cells: { x: number; y: number }[]; cols: number; rows: number } {
  const w = area.width > 0 ? area.width : NODE_WIDTH
  const h = area.height > 0 ? area.height : NODE_HEIGHT
  const pitchX = NODE_WIDTH + gap
  const pitchY = NODE_HEIGHT + gap
  const cellCenter = (r: number, c: number) => ({
    x: c * pitchX + NODE_WIDTH / 2,
    y: r * pitchY + NODE_HEIGHT / 2,
  })

  // Best config that fits `count` non-blocked cells, and a plain fallback that
  // ignores exclusions (used only if widgets are so big nothing fits cleanly).
  let best: { zoom: number; cols: number; rows: number } | null = null
  let fallback: { zoom: number; cols: number; rows: number } | null = null

  for (let cols = 1; cols <= count; cols++) {
    const baseRows = Math.ceil(count / cols)
    const gwBase = cols * NODE_WIDTH + (cols - 1) * gap
    const ghBase = baseRows * NODE_HEIGHT + (baseRows - 1) * gap
    const zoomBase = Math.min(w / gwBase, h / ghBase)
    if (!fallback || zoomBase > fallback.zoom) {
      fallback = { zoom: zoomBase, cols, rows: baseRows }
    }

    if (exclusions.length === 0) {
      if (!best || zoomBase > best.zoom) best = { zoom: zoomBase, cols, rows: baseRows }
      continue
    }

    // Grow rows until enough non-blocked cells exist (bounded search).
    for (let rows = baseRows; rows <= baseRows + count; rows++) {
      let free = 0
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cc = cellCenter(r, c)
          if (!cellBlocked(cc.x, cc.y, exclusions)) free++
        }
      }
      if (free >= count) {
        const gw = cols * NODE_WIDTH + (cols - 1) * gap
        const gh = rows * NODE_HEIGHT + (rows - 1) * gap
        const zoom = Math.min(w / gw, h / gh)
        if (!best || zoom > best.zoom) best = { zoom, cols, rows }
        break
      }
    }
  }

  const usedExclusions = exclusions.length > 0 && best !== null
  const chosen = best ?? fallback ?? { zoom: 0, cols: 1, rows: count }

  const cells: { x: number; y: number }[] = []
  for (let r = 0; r < chosen.rows && cells.length < count; r++) {
    for (let c = 0; c < chosen.cols && cells.length < count; c++) {
      const cc = cellCenter(r, c)
      if (usedExclusions && cellBlocked(cc.x, cc.y, exclusions)) continue
      cells.push(cc)
    }
  }
  // Safety net: if the exclusion-aware fill came up short, top up with any
  // remaining cells so callers always receive `count` positions.
  for (let r = 0; r < chosen.rows + count && cells.length < count; r++) {
    for (let c = 0; c < chosen.cols && cells.length < count; c++) {
      const cc = cellCenter(r, c)
      if (!cells.some((p) => p.x === cc.x && p.y === cc.y)) cells.push(cc)
    }
  }
  return { cells, cols: chosen.cols, rows: chosen.rows }
}

/**
 * Linear-time fallback for large graphs. It estimates a single aspect-aware
 * column count rather than scoring every possible grid and never runs the
 * force/crossing/nudge passes. Exclusions remain best-effort: bounded scanning
 * skips them first, then fills blocked cells only if the chrome covers an
 * implausibly large portion of the layout plane.
 */
function computeBoundedAspectGrid(
  count: number,
  area: { width: number; height: number },
  gap: number,
  exclusions: ExclusionRect[],
): { x: number; y: number }[] {
  const w = area.width > 0 ? area.width : NODE_WIDTH
  const h = area.height > 0 ? area.height : NODE_HEIGHT
  const aspectAdjustedCount = count * (w / h) * (NODE_HEIGHT / NODE_WIDTH)
  const cols = Math.max(1, Math.min(count, Math.round(Math.sqrt(aspectAdjustedCount))))
  const pitchX = NODE_WIDTH + gap
  const pitchY = NODE_HEIGHT + gap
  const candidateAt = (index: number) => ({
    x: (index % cols) * pitchX + NODE_WIDTH / 2,
    y: Math.floor(index / cols) * pitchY + NODE_HEIGHT / 2,
  })

  const cells: Array<{ x: number; y: number }> = []
  const accepted = new Set<string>()
  const scanLimit = Math.max(count * 4, count + 256)
  for (let index = 0; index < scanLimit && cells.length < count; index += 1) {
    const candidate = candidateAt(index)
    if (cellBlocked(candidate.x, candidate.y, exclusions)) continue
    cells.push(candidate)
    accepted.add(`${candidate.x}:${candidate.y}`)
  }

  for (let index = 0; cells.length < count; index += 1) {
    const candidate = candidateAt(index)
    const key = `${candidate.x}:${candidate.y}`
    if (accepted.has(key)) continue
    cells.push(candidate)
    accepted.add(key)
  }
  return cells
}

/**
 * Safety pass: shove any node whose box overlaps an exclusion rectangle out of
 * it along the shallowest axis (usually upward, off the bottom corners), then
 * re-separate so cards stay apart.
 */
function pushCentersOutOfExclusions(
  centers: Map<string, { x: number; y: number }>,
  ids: string[],
  exclusions: ExclusionRect[],
): void {
  if (exclusions.length === 0) return
  const hW = NODE_WIDTH / 2
  const hH = NODE_HEIGHT / 2
  for (let pass = 0; pass < 8; pass++) {
    let moved = false
    for (const id of ids) {
      const c = centers.get(id)
      if (!c) continue
      for (const e of exclusions) {
        if (!rectsOverlap(c.x - hW, c.y - hH, NODE_WIDTH, NODE_HEIGHT, e)) continue
        const up = c.y + hH - e.y
        const down = e.y + e.h - (c.y - hH)
        const left = c.x + hW - e.x
        const right = e.x + e.w - (c.x - hW)
        const min = Math.min(up, down, left, right)
        if (min === up) c.y -= up + 1
        else if (min === down) c.y += down + 1
        else if (min === left) c.x -= left + 1
        else c.x += right + 1
        moved = true
      }
    }
    separateCenters(centers, ids, 1.0)
    if (!moved) break
  }
}

/**
 * Deterministically push any node that still blocks an edge perpendicular off
 * that segment, re-separating after each pass so cards stay non-overlapping.
 */
function nudgeNodesOffEdges(
  centers: Map<string, { x: number; y: number }>,
  ids: string[],
  edges: LayoutEdgeRef[],
): void {
  const hitHW = NODE_WIDTH / 2 + MIN_SEP / 2 + 2
  const hitHH = NODE_HEIGHT / 2 + MIN_SEP / 2 + 2
  const hW = NODE_WIDTH / 2
  const hH = NODE_HEIGHT / 2
  for (let pass = 0; pass < NUDGE_PASSES; pass++) {
    let moved = false
    for (const e of edges) {
      const a = centers.get(e.source)
      const b = centers.get(e.target)
      if (!a || !b) continue
      const dxs = b.x - a.x
      const dys = b.y - a.y
      const l2 = dxs * dxs + dys * dys || 1
      for (const id of ids) {
        if (id === e.source || id === e.target) continue
        const c = centers.get(id)
        if (!c) continue
        if (!segmentHitsBox(a.x, a.y, b.x, b.y, c.x, c.y, hitHW, hitHH)) continue
        let t = ((c.x - a.x) * dxs + (c.y - a.y) * dys) / l2
        t = Math.max(0, Math.min(1, t))
        const px = a.x + t * dxs
        const py = a.y + t * dys
        let vx = c.x - px
        let vy = c.y - py
        let dist = Math.sqrt(vx * vx + vy * vy)
        if (dist < 1e-6) {
          vx = hashUnit(id) - 0.5
          vy = hashUnit(id + ':y') - 0.5
          dist = Math.sqrt(vx * vx + vy * vy) || 1
        }
        const nx = vx / dist
        const ny = vy / dist
        const radius = hW * Math.abs(nx) + hH * Math.abs(ny) + MIN_SEP
        const push = radius - dist + 2
        c.x += nx * push
        c.y += ny * push
        moved = true
      }
    }
    separateCenters(centers, ids, 1.0)
    if (!moved) break
  }
}

/**
 * Place nodes to maximize node size (tight grid), then minimize crossings and
 * edges-through-boxes. Positions are top-left coordinates in flow space
 * (origin near 0,0 after normalize).
 */
export function computeCrossMinLayout(
  nodeIds: string[],
  edges: LayoutEdgeRef[],
  area?: GridAreaRect,
  exclusions: ExclusionRect[] = [],
): CrossMinLayoutResult {
  const aspect =
    area && area.width > 0 && area.height > 0 ? area.width / area.height : 1

  if (nodeIds.length === 0) {
    return {
      positionsById: {},
      positions: [],
      bounds: { minX: 0, minY: 0, width: 0, height: 0 },
    }
  }

  const idSet = new Set(nodeIds)
  const validEdges = edges.filter(
    (e) => idSet.has(e.source) && idSet.has(e.target) && e.source !== e.target,
  )

  const degree = new Map<string, number>()
  for (const id of nodeIds) degree.set(id, 0)
  for (const e of validEdges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }

  const connectedIds = nodeIds.filter((id) => (degree.get(id) ?? 0) > 0)
  const isolateIds = nodeIds.filter((id) => (degree.get(id) ?? 0) === 0)

  const positionsById: Record<string, GridPoint> = {}
  const gridArea = area && area.width > 0 && area.height > 0
    ? area
    : { width: NODE_WIDTH * 4, height: NODE_HEIGHT * 4 }

  if (crossMinLayoutComplexityMode(nodeIds.length, validEdges.length) === 'bounded') {
    const cells = computeBoundedAspectGrid(
      nodeIds.length,
      gridArea,
      GRID_GAP,
      exclusions,
    )
    nodeIds.forEach((id, index) => {
      const cell = cells[index] ?? { x: 0, y: 0 }
      positionsById[id] = topLeftFromCenter(cell.x, cell.y)
    })
  } else if (validEdges.length === 0) {
    // No edges — just pack everything into the tightest aspect-fit grid,
    // skipping cells under the zoom controls / minimap.
    const { cells } = computeAspectGrid(nodeIds.length, gridArea, GRID_GAP, exclusions)
    nodeIds.forEach((id, i) => {
      const c = cells[i] ?? { x: 0, y: 0 }
      positionsById[id] = topLeftFromCenter(c.x, c.y)
    })
  } else {
    // 1. Force layout — used only to ORDER nodes so neighbors land near each
    //    other in the grid (shorter edges, fewer crossings before swaps).
    const ordering = runForceLayout(connectedIds, validEdges, aspect)
    const orderedConnected = [...connectedIds].sort((a, b) => {
      const ca = ordering.get(a)!
      const cb = ordering.get(b)!
      return ca.y - cb.y || ca.x - cb.x
    })
    const ordered = [...orderedConnected, ...isolateIds]

    // 2. Pack into a tight grid sized to the panel — near-max node size — with
    //    the corner cells under the zoom controls / minimap left empty.
    const { cells } = computeAspectGrid(ordered.length, gridArea, GRID_GAP, exclusions)
    const centers = new Map<string, { x: number; y: number }>()
    ordered.forEach((id, i) => {
      const c = cells[i] ?? { x: 0, y: 0 }
      centers.set(id, { x: c.x, y: c.y })
    })

    // 3. Swap cell assignments to cut crossings + edges-through-boxes. Swaps
    //    keep the grid tight (node size unchanged) and naturally move isolates
    //    to cells that block nothing.
    reduceCrossings(centers, nodeIds, validEdges)

    // 4. Nudge any node still sitting on an edge off it (keeps cards apart).
    nudgeNodesOffEdges(centers, nodeIds, validEdges)

    // 5. Safety: shove any node back out of the widget corners it may have
    //    drifted into during nudging.
    pushCentersOutOfExclusions(centers, nodeIds, exclusions)

    for (const id of nodeIds) {
      const c = centers.get(id)
      if (!c) continue
      positionsById[id] = topLeftFromCenter(c.x, c.y)
    }
  }

  // Normalize so the group sits near origin with a small margin.
  const allPoints = nodeIds.map((id) => positionsById[id])
  const raw = gridBoundingBox(allPoints)
  const ox = raw.minX - GRID_MARGIN
  const oy = raw.minY - GRID_MARGIN
  for (const id of nodeIds) {
    positionsById[id] = {
      x: positionsById[id].x - ox,
      y: positionsById[id].y - oy,
    }
  }

  const positions = nodeIds.map((id) => positionsById[id])
  return {
    positionsById,
    positions,
    bounds: gridBoundingBox(positions),
  }
}

/** Ellipse ∩ ray from center toward (tx, ty). Used by floating edges. */
export function ellipseAttachment(
  centerX: number,
  centerY: number,
  rx: number,
  ry: number,
  towardX: number,
  towardY: number,
): { x: number; y: number } {
  const safeRx = Math.max(0, rx)
  const safeRy = Math.max(0, ry)
  const dx = towardX - centerX
  const dy = towardY - centerY
  if (safeRx < 1e-9 && safeRy < 1e-9) {
    return { x: centerX, y: centerY }
  }
  if (safeRx < 1e-9) {
    return { x: centerX, y: centerY + Math.sign(dy || 1) * safeRy }
  }
  if (safeRy < 1e-9) {
    return { x: centerX + Math.sign(dx || 1) * safeRx, y: centerY }
  }
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    return { x: centerX + safeRx, y: centerY }
  }
  // Parametric ray: center + t * d hits ellipse (x/rx)^2 + (y/ry)^2 = 1 at t>0.
  const a = (dx * dx) / (safeRx * safeRx) + (dy * dy) / (safeRy * safeRy)
  const t = 1 / Math.sqrt(a)
  return { x: centerX + t * dx, y: centerY + t * dy }
}

/** Axis-aligned rect ∩ ray from center toward (tx, ty) — flush to card borders. */
export function rectAttachment(
  centerX: number,
  centerY: number,
  halfW: number,
  halfH: number,
  towardX: number,
  towardY: number,
): { x: number; y: number } {
  const dx = towardX - centerX
  const dy = towardY - centerY
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    return { x: centerX + halfW, y: centerY }
  }
  const scaleX = Math.abs(dx) < 1e-9 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx)
  const scaleY = Math.abs(dy) < 1e-9 ? Number.POSITIVE_INFINITY : halfH / Math.abs(dy)
  const t = Math.min(scaleX, scaleY)
  return { x: centerX + dx * t, y: centerY + dy * t }
}

/** Re-export helpers useful for tests / debugging. */
export { centersFromTopLeft, countCrossings }
