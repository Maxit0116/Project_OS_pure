import type { BoundsRect } from '@contracts/index'

/** Idle stacking (manual zIndexMode). */
export const Z_WORKGROUP = 0
export const Z_FEATURE = 2
export const Z_ARTIFACT = 5
/** Drag-time lift so the dragged side paints above its counterpart. */
export const Z_DRAG_LIFT = 1000
/** Edge hover detail labels — above drag lift and all map nodes. */
export const Z_EDGE_DETAIL = 10000

export function aabbOverlaps(a: BoundsRect, b: BoundsRect, epsilon = 0): boolean {
  return (
    a.x + epsilon < b.x + b.width &&
    a.x + a.width > b.x + epsilon &&
    a.y + epsilon < b.y + b.height &&
    a.y + a.height > b.y + epsilon
  )
}

/**
 * Shortest axis-aligned translation that separates `moving` from `obstacle`.
 * Flush edges (zero gap) count as separated.
 */
export function shortestSeparationDelta(
  moving: BoundsRect,
  obstacle: BoundsRect,
): { x: number; y: number } {
  if (!aabbOverlaps(moving, obstacle)) {
    return { x: 0, y: 0 }
  }

  const moveLeft = obstacle.x - (moving.x + moving.width)
  const moveRight = obstacle.x + obstacle.width - moving.x
  const moveUp = obstacle.y - (moving.y + moving.height)
  const moveDown = obstacle.y + obstacle.height - moving.y

  const candidates = [
    { x: moveLeft, y: 0 },
    { x: moveRight, y: 0 },
    { x: 0, y: moveUp },
    { x: 0, y: moveDown },
  ]

  let best = candidates[0]!
  let bestAbs = Math.abs(best.x) + Math.abs(best.y)
  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i]!
    const abs = Math.abs(candidate.x) + Math.abs(candidate.y)
    if (abs < bestAbs) {
      best = candidate
      bestAbs = abs
    }
  }
  return best
}

/**
 * Nudge `moving` until it no longer overlaps any obstacle (iterative shortest pushes).
 * Returns the total delta applied to the top-left corner.
 */
export function separateFromObstacles(
  moving: BoundsRect,
  obstacles: BoundsRect[],
  maxIterations = 24,
): { x: number; y: number } {
  if (obstacles.length === 0) {
    return { x: 0, y: 0 }
  }

  let x = moving.x
  let y = moving.y

  for (let i = 0; i < maxIterations; i++) {
    const current: BoundsRect = { ...moving, x, y }
    let delta: { x: number; y: number } | null = null
    for (const obstacle of obstacles) {
      const step = shortestSeparationDelta(current, obstacle)
      if (step.x !== 0 || step.y !== 0) {
        delta = step
        break
      }
    }
    if (!delta) {
      break
    }
    x += delta.x
    y += delta.y
  }

  const resolved: BoundsRect = { ...moving, x, y }
  if (obstacles.some((obstacle) => aabbOverlaps(resolved, obstacle))) {
    // Iterative shortest pushes can cycle in a dense obstacle arrangement.
    // Fall back to the nearest side of the complete obstacle envelope; each
    // candidate is provably outside every obstacle on one axis.
    const minX = Math.min(...obstacles.map((obstacle) => obstacle.x))
    const maxX = Math.max(...obstacles.map((obstacle) => obstacle.x + obstacle.width))
    const minY = Math.min(...obstacles.map((obstacle) => obstacle.y))
    const maxY = Math.max(...obstacles.map((obstacle) => obstacle.y + obstacle.height))
    const candidates = [
      { x: minX - moving.width, y },
      { x: maxX, y },
      { x, y: minY - moving.height },
      { x, y: maxY },
    ]
    const best = candidates.reduce((nearest, candidate) => {
      const nearestDistance = Math.abs(nearest.x - x) + Math.abs(nearest.y - y)
      const candidateDistance = Math.abs(candidate.x - x) + Math.abs(candidate.y - y)
      return candidateDistance < nearestDistance ? candidate : nearest
    })
    x = best.x
    y = best.y
  }

  return { x: x - moving.x, y: y - moving.y }
}

export function translateBounds(
  bounds: BoundsRect,
  delta: { x: number; y: number },
): BoundsRect {
  return {
    ...bounds,
    x: bounds.x + delta.x,
    y: bounds.y + delta.y,
  }
}
