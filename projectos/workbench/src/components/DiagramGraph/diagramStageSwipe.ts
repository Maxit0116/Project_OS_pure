/** Pure helpers for Diagram Graph stage left/right paging. */

export interface DiagramNeighbors {
  prevId: string | null
  nextId: string | null
  index: number
}

export function resolveDiagramNeighbors(
  orderedIds: string[],
  currentId: string | null,
): DiagramNeighbors {
  if (!currentId) return { prevId: null, nextId: null, index: -1 }
  const index = orderedIds.indexOf(currentId)
  if (index < 0) return { prevId: null, nextId: null, index: -1 }
  return {
    prevId: index > 0 ? orderedIds[index - 1]! : null,
    nextId: index < orderedIds.length - 1 ? orderedIds[index + 1]! : null,
    index,
  }
}

/** Dominant-axis check shared by pointer + wheel gestures. */
export function isHorizontalGesture(deltaX: number, deltaY: number, minPx = 6): boolean {
  return Math.abs(deltaX) >= minPx && Math.abs(deltaX) > Math.abs(deltaY)
}

/**
 * Clamp live drag offset so the track cannot overscroll past a missing neighbor.
 * Positive offset reveals previous; negative reveals next.
 */
export function clampPagerOffset(
  offsetPx: number,
  hasPrev: boolean,
  hasNext: boolean,
): number {
  if (offsetPx > 0 && !hasPrev) return 0
  if (offsetPx < 0 && !hasNext) return 0
  return offsetPx
}

/**
 * Decide whether to commit a swipe.
 * @returns `1` previous, `-1` next, `0` snap back
 */
export function shouldCommitPagerSwipe(
  offsetPx: number,
  widthPx: number,
  velocityPxPerMs: number,
): -1 | 0 | 1 {
  if (widthPx <= 0) return 0
  const distanceThreshold = Math.min(140, Math.max(64, widthPx * 0.2))
  const velocityThreshold = 0.55
  if (offsetPx <= -distanceThreshold || velocityPxPerMs <= -velocityThreshold) return -1
  if (offsetPx >= distanceThreshold || velocityPxPerMs >= velocityThreshold) return 1
  return 0
}

/** Target translate for the 3-slot track (prev | current | next). */
export function pagerTrackTranslatePx(viewportWidth: number, dragOffsetPx: number): number {
  return -viewportWidth + dragOffsetPx
}
