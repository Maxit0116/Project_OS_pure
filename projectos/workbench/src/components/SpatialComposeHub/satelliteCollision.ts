export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  )
}

/**
 * Push `moving` out of any overlapping `others` along the shallowest axis.
 * Iterates a few times so multi-body piles separate.
 */
export function separateFromOthers(
  moving: Rect,
  others: readonly Rect[],
  gap = 10,
  iterations = 6,
): Rect {
  let current = { ...moving }
  for (let pass = 0; pass < iterations; pass += 1) {
    let moved = false
    for (const other of others) {
      if (!rectsOverlap(current, other, gap)) continue
      const overlapLeft = current.x + current.width + gap - other.x
      const overlapRight = other.x + other.width + gap - current.x
      const overlapTop = current.y + current.height + gap - other.y
      const overlapBottom = other.y + other.height + gap - current.y
      const minX = Math.min(overlapLeft, overlapRight)
      const minY = Math.min(overlapTop, overlapBottom)
      if (minX < minY) {
        current = {
          ...current,
          x:
            overlapLeft < overlapRight
              ? other.x - current.width - gap
              : other.x + other.width + gap,
        }
      } else {
        current = {
          ...current,
          y:
            overlapTop < overlapBottom
              ? other.y - current.height - gap
              : other.y + other.height + gap,
        }
      }
      moved = true
    }
    if (!moved) break
  }
  return current
}

/** Keep a rect inside an optional viewport with padding. */
export function clampRectToBounds(
  rect: Rect,
  bounds: { width: number; height: number } | null,
  padding = 8,
): Rect {
  if (!bounds) return rect
  const maxX = Math.max(padding, bounds.width - rect.width - padding)
  const maxY = Math.max(padding, bounds.height - rect.height - padding)
  return {
    ...rect,
    x: Math.min(maxX, Math.max(padding, rect.x)),
    y: Math.min(maxY, Math.max(padding, rect.y)),
  }
}
