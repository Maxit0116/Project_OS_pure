/**
 * Pure, front-end-only node layout for the Function Map canvas.
 *
 * Independent of edges / backend graph linking — only decides where nodes sit
 * and how they fill the measured safe viewport at native node size (252×152).
 */

/** Native on-screen footprint of a feature node (see FeatureNode.module.css). */
export const NODE_WIDTH = 252
export const NODE_HEIGHT = 152

/** Minimum gap between nodes and between the grid and the safe-area edge. */
export const MIN_GAP = 16
export const GRID_MARGIN = 16

export interface GridAreaRect {
  originX: number
  originY: number
  width: number
  height: number
}

export type GridArea = GridAreaRect

export const DEFAULT_GRID_AREA: GridAreaRect = {
  originX: 0,
  originY: 0,
  width: 900,
  height: 600,
}

export interface GridPoint {
  x: number
  y: number
}

export interface GridLayoutResult {
  positions: GridPoint[]
  /** Bounding box of the laid-out group (flow-local, zoom = 1). */
  bounds: { minX: number; minY: number; width: number; height: number }
}

/**
 * Bounding box of positioned nodes at native size.
 */
export function gridBoundingBox(points: GridPoint[]): {
  minX: number
  minY: number
  width: number
  height: number
} {
  if (points.length === 0) return { minX: 0, minY: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x + NODE_WIDTH > maxX) maxX = p.x + NODE_WIDTH
    if (p.y + NODE_HEIGHT > maxY) maxY = p.y + NODE_HEIGHT
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Lay out `count` nodes in a grid that fills `area` at native node size.
 *
 * Picks the column count that fits both width and height with the largest
 * uniform gap (fill-style). When no column count fits at native size with
 * MIN_GAP, uses the widest layout that fits horizontally and the tightest
 * vertical gap — the caller may apply zoom < 1 only in that edge case.
 */
export function computeFillGridLayout(count: number, area: GridAreaRect): GridLayoutResult {
  if (count <= 0) {
    return { positions: [], bounds: { minX: 0, minY: 0, width: 0, height: 0 } }
  }

  const w = area.width
  const h = area.height

  const pickColumns = (minGap: number): number => {
    let bestCols = 1
    let bestScore = -Infinity
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols)
      const gapX = cols > 1 ? (w - cols * NODE_WIDTH) / (cols - 1) : Infinity
      const gapY = rows > 1 ? (h - rows * NODE_HEIGHT) / (rows - 1) : Infinity
      if (gapX < minGap || gapY < minGap) continue
      const score = Math.min(gapX, gapY)
      if (score > bestScore) {
        bestScore = score
        bestCols = cols
      }
    }
    return bestScore >= minGap ? bestCols : 0
  }

  // Prefer comfortable gaps; fall back to tight packing so zoom stays at 1.
  let bestCols = pickColumns(MIN_GAP) || pickColumns(4) || pickColumns(0)

  if (bestCols === 0) {
    bestCols = Math.max(
      1,
      Math.min(count, Math.floor((w + MIN_GAP) / (NODE_WIDTH + MIN_GAP))),
    )
  }

  const rows = Math.ceil(count / bestCols)
  const gapX =
    bestCols > 1 ? Math.max(0, (w - bestCols * NODE_WIDTH) / (bestCols - 1)) : 0
  const gapY =
    rows > 1 ? Math.max(0, (h - rows * NODE_HEIGHT) / (rows - 1)) : 0

  const pitchX = NODE_WIDTH + gapX
  const pitchY = NODE_HEIGHT + gapY

  const positions = Array.from({ length: count }, (_, i) => ({
    x: area.originX + (i % bestCols) * pitchX,
    y: area.originY + Math.floor(i / bestCols) * pitchY,
  }))

  return { positions, bounds: gridBoundingBox(positions) }
}

/** @deprecated Use computeFillGridLayout */
export function computeAutoGridLayout(count: number, area: GridAreaRect): GridPoint[] {
  return computeFillGridLayout(count, area).positions
}

/** Camera zoom floor — only used when the graph cannot fit at native size. */
export const MIN_FIT_ZOOM = 0.15
