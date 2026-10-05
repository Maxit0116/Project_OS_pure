import type { BoundsRect } from '@contracts/index'
import { buildAdjacencyGraph } from '@contracts/index'
import { resolveArtifactDropTarget } from './mapArtifactStack'

/** Screen-space snap feel; converted to flow coords via zoom. */
export const SNAP_DISTANCE_SCREEN_PX = 20
export const ALIGN_TOLERANCE_SCREEN_PX = 12
export const MIN_EDGE_OVERLAP_SCREEN_PX = 10
export const PERPENDICULAR_PROXIMITY_SCREEN_PX = 16
export const DETACH_DISTANCE_SCREEN_PX = 24
/** Multiplier for center-axis pairing when judging horizontal/vertical adjacency. */
export const SNAP_CENTER_AXIS_FACTOR = 1.35
/** Sticky snap / drag-end retry expansion over the tight thresholds above. */
export const SNAP_STICKY_EXPAND_FACTOR = 1.2

export type SnapKind =
  | 'right-to-left'
  | 'left-to-right'
  | 'bottom-to-top'
  | 'top-to-bottom'
  | 'align-left'
  | 'align-right'
  | 'align-top'
  | 'align-bottom'

export type PerpendicularAlign = 'align-left' | 'align-right' | 'align-top' | 'align-bottom'

export interface SnapGuideLine {
  orientation: 'horizontal' | 'vertical'
  value: number
  start: number
  end: number
  /** When true, rendered as a stronger alignment hint on both cards. */
  emphasis?: boolean
}

export interface SnapResult {
  snappedPosition: { x: number; y: number }
  targetId: string
  snapKind: SnapKind
  guideLines: SnapGuideLine[]
  perpendicularAlign?: PerpendicularAlign
  /** Extra space kept between abutting edges (e.g. workgroup member gap). */
  contactGap?: number
}

export interface SnapThresholds {
  snapDistance: number
  alignTolerance: number
  minOverlap: number
  perpendicularProximity: number
}

export function snapThresholdsForZoom(zoom: number): SnapThresholds {
  const scale = 1 / Math.max(zoom, 0.05)
  return {
    snapDistance: SNAP_DISTANCE_SCREEN_PX * scale,
    alignTolerance: ALIGN_TOLERANCE_SCREEN_PX * scale,
    minOverlap: MIN_EDGE_OVERLAP_SCREEN_PX * scale,
    perpendicularProximity: PERPENDICULAR_PROXIMITY_SCREEN_PX * scale,
  }
}

export function expandSnapThresholds(
  thresholds: SnapThresholds,
  factor = SNAP_STICKY_EXPAND_FACTOR,
): SnapThresholds {
  return {
    snapDistance: thresholds.snapDistance * factor,
    alignTolerance: thresholds.alignTolerance * factor,
    minOverlap: thresholds.minOverlap,
    perpendicularProximity: thresholds.perpendicularProximity * factor,
  }
}

function perpendicularOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart)
}

function perpendicularProximityForVerticalStack(
  dragged: BoundsRect,
  target: BoundsRect,
  proximity: number,
): boolean {
  const draggedRight = dragged.x + dragged.width
  const targetRight = target.x + target.width
  const xOverlap = perpendicularOverlap(dragged.x, draggedRight, target.x, targetRight)
  if (xOverlap >= proximity * 0.35) {
    return true
  }
  return (
    Math.abs(dragged.x - target.x) <= proximity ||
    Math.abs(draggedRight - targetRight) <= proximity
  )
}

function perpendicularProximityForHorizontalStack(
  dragged: BoundsRect,
  target: BoundsRect,
  proximity: number,
): boolean {
  const draggedBottom = dragged.y + dragged.height
  const targetBottom = target.y + target.height
  const yOverlap = perpendicularOverlap(dragged.y, draggedBottom, target.y, targetBottom)
  if (yOverlap >= proximity * 0.35) {
    return true
  }
  return (
    Math.abs(dragged.y - target.y) <= proximity ||
    Math.abs(draggedBottom - targetBottom) <= proximity
  )
}

/** When vertically adjacent, prefer the closer vertical edge (mirrors horizontal-snap behavior). */
export function resolveHorizontalAlignForVerticalSnap(
  dragged: BoundsRect,
  target: BoundsRect,
): { x: number; align: 'align-left' | 'align-right' } {
  const targetRight = target.x + target.width
  const leftDelta = Math.abs(dragged.x - target.x)
  const rightDelta = Math.abs(dragged.x + dragged.width - targetRight)

  if (leftDelta + 0.5 < rightDelta) {
    return { x: target.x, align: 'align-left' }
  }
  if (rightDelta + 0.5 < leftDelta) {
    return { x: targetRight - dragged.width, align: 'align-right' }
  }

  const draggedCenterX = dragged.x + dragged.width / 2
  const targetCenterX = target.x + target.width / 2
  if (draggedCenterX < targetCenterX) {
    return { x: target.x, align: 'align-left' }
  }
  if (draggedCenterX > targetCenterX) {
    return { x: targetRight - dragged.width, align: 'align-right' }
  }

  return leftDelta <= rightDelta
    ? { x: target.x, align: 'align-left' }
    : { x: targetRight - dragged.width, align: 'align-right' }
}

/** When horizontally adjacent, align top or bottom edges based on which edge is closer. */
export function resolveVerticalAlignForHorizontalSnap(
  dragged: BoundsRect,
  target: BoundsRect,
): { y: number; align: 'align-top' | 'align-bottom' } {
  const targetBottom = target.y + target.height
  const draggedBottom = dragged.y + dragged.height
  const topDelta = Math.abs(dragged.y - target.y)
  const bottomDelta = Math.abs(draggedBottom - targetBottom)

  if (bottomDelta + 0.5 < topDelta) {
    return { y: targetBottom - dragged.height, align: 'align-bottom' }
  }
  if (topDelta + 0.5 < bottomDelta) {
    return { y: target.y, align: 'align-top' }
  }

  const draggedCenterY = dragged.y + dragged.height / 2
  const targetCenterY = target.y + target.height / 2

  if (draggedCenterY < targetCenterY) {
    return { y: target.y, align: 'align-top' }
  }
  if (draggedCenterY > targetCenterY) {
    return { y: targetBottom - dragged.height, align: 'align-bottom' }
  }

  return topDelta <= bottomDelta
    ? { y: target.y, align: 'align-top' }
    : { y: targetBottom - dragged.height, align: 'align-bottom' }
}


function pushDualVerticalEdgeGuides(
  guides: SnapGuideLine[],
  x: number,
  dragged: BoundsRect,
  target: BoundsRect,
  position: { x: number; y: number },
) {
  guides.push({
    orientation: 'vertical',
    value: x,
    start: position.y,
    end: position.y + dragged.height,
    emphasis: true,
  })
  guides.push({
    orientation: 'vertical',
    value: x,
    start: target.y,
    end: target.y + target.height,
    emphasis: true,
  })
}

function pushDualHorizontalEdgeGuides(
  guides: SnapGuideLine[],
  y: number,
  dragged: BoundsRect,
  target: BoundsRect,
  position: { x: number; y: number },
) {
  guides.push({
    orientation: 'horizontal',
    value: y,
    start: position.x,
    end: position.x + dragged.width,
    emphasis: true,
  })
  guides.push({
    orientation: 'horizontal',
    value: y,
    start: target.x,
    end: target.x + target.width,
    emphasis: true,
  })
}

interface SnapCandidate extends SnapResult {
  score: number
}

function exactSnappedPosition(
  dragged: BoundsRect,
  target: BoundsRect,
  snapKind: SnapKind,
  perpendicularAlign?: PerpendicularAlign,
  contactGap = 0,
): { x: number; y: number } {
  const targetRight = target.x + target.width
  const targetBottom = target.y + target.height
  let x = dragged.x
  let y = dragged.y

  switch (snapKind) {
    case 'right-to-left':
      x = target.x - dragged.width - contactGap
      break
    case 'left-to-right':
      x = targetRight + contactGap
      break
    case 'bottom-to-top':
      y = target.y - dragged.height - contactGap
      break
    case 'top-to-bottom':
      y = targetBottom + contactGap
      break
    case 'align-left':
      x = target.x
      break
    case 'align-right':
      x = targetRight - dragged.width
      break
    case 'align-top':
      y = target.y
      break
    case 'align-bottom':
      y = targetBottom - dragged.height
      break
  }

  if (snapKind === 'right-to-left' || snapKind === 'left-to-right') {
    if (perpendicularAlign === 'align-top') {
      y = target.y
    } else if (perpendicularAlign === 'align-bottom') {
      y = targetBottom - dragged.height
    }
  }

  if (snapKind === 'bottom-to-top' || snapKind === 'top-to-bottom') {
    if (perpendicularAlign === 'align-left') {
      x = target.x
    } else if (perpendicularAlign === 'align-right') {
      x = targetRight - dragged.width
    }
  }

  return { x, y }
}

function finalizeSnapResult(
  dragged: BoundsRect,
  target: BoundsRect,
  snapKind: SnapKind,
  targetId: string,
  score: number,
  perpendicularAlign?: PerpendicularAlign,
  contactGap = 0,
): SnapCandidate {
  const resolvedAlign =
    perpendicularAlign ??
    (snapKind === 'align-left' ||
    snapKind === 'align-right' ||
    snapKind === 'align-top' ||
    snapKind === 'align-bottom'
      ? snapKind
      : undefined)
  const snappedPosition = exactSnappedPosition(
    dragged,
    target,
    snapKind,
    resolvedAlign,
    contactGap,
  )
  return {
    snappedPosition,
    targetId,
    snapKind,
    score,
    perpendicularAlign: resolvedAlign,
    contactGap,
    guideLines: buildGuideLines(dragged, target, snappedPosition, snapKind, resolvedAlign),
  }
}

export function commitArtifactSnap(
  snap: SnapResult,
  dragged: BoundsRect,
  target: BoundsRect,
): SnapResult {
  return finalizeSnapResult(
    dragged,
    target,
    snap.snapKind,
    snap.targetId,
    0,
    snap.perpendicularAlign,
    snap.contactGap ?? 0,
  )
}

function buildGuideLines(
  dragged: BoundsRect,
  target: BoundsRect,
  position: { x: number; y: number },
  snapKind: SnapKind,
  perpendicularAlign?: PerpendicularAlign,
): SnapGuideLine[] {
  const draggedRight = position.x + dragged.width
  const draggedBottom = position.y + dragged.height
  const targetRight = target.x + target.width
  const targetBottom = target.y + target.height
  const guides: SnapGuideLine[] = []

  switch (snapKind) {
    case 'right-to-left':
    case 'left-to-right':
      guides.push({
        orientation: 'vertical',
        value: snapKind === 'right-to-left' ? target.x : targetRight,
        start: Math.min(position.y, target.y),
        end: Math.max(draggedBottom, targetBottom),
      })
      if (perpendicularAlign === 'align-top') {
        pushDualHorizontalEdgeGuides(guides, target.y, dragged, target, position)
      } else if (perpendicularAlign === 'align-bottom') {
        pushDualHorizontalEdgeGuides(guides, targetBottom, dragged, target, position)
      }
      return guides
    case 'bottom-to-top':
    case 'top-to-bottom':
      guides.push({
        orientation: 'horizontal',
        value: snapKind === 'bottom-to-top' ? target.y : targetBottom,
        start: Math.min(position.x, target.x),
        end: Math.max(draggedRight, targetRight),
      })
      if (perpendicularAlign === 'align-left') {
        pushDualVerticalEdgeGuides(guides, target.x, dragged, target, position)
      } else if (perpendicularAlign === 'align-right') {
        pushDualVerticalEdgeGuides(guides, targetRight, dragged, target, position)
      }
      return guides
    case 'align-left':
      pushDualVerticalEdgeGuides(guides, target.x, dragged, target, position)
      return guides
    case 'align-right':
      pushDualVerticalEdgeGuides(guides, targetRight, dragged, target, position)
      return guides
    case 'align-top':
      pushDualHorizontalEdgeGuides(guides, target.y, dragged, target, position)
      return guides
    case 'align-bottom':
      pushDualHorizontalEdgeGuides(guides, targetBottom, dragged, target, position)
      return guides
  }
}

export function resolveArtifactSnap(
  dragged: BoundsRect,
  others: BoundsRect[],
  thresholds: SnapThresholds,
  options?: {
    contactGapBetween?: (draggedId: string, targetId: string) => number
  },
): SnapResult | null {
  const { snapDistance, alignTolerance, minOverlap, perpendicularProximity } = thresholds
  const contactGapBetween = options?.contactGapBetween
  let best: SnapCandidate | null = null

  for (const target of others) {
    if (target.id === dragged.id) {
      continue
    }

    const contactGap = contactGapBetween?.(dragged.id, target.id) ?? 0
    const draggedRight = dragged.x + dragged.width
    const draggedBottom = dragged.y + dragged.height
    const targetRight = target.x + target.width
    const targetBottom = target.y + target.height
    const yOverlap = perpendicularOverlap(dragged.y, draggedBottom, target.y, targetBottom)
    const xOverlap = perpendicularOverlap(dragged.x, draggedRight, target.x, targetRight)

    const candidates: Array<{
      snapKind: SnapKind
      targetId: string
      score: number
      perpendicularAlign?: PerpendicularAlign
    }> = []

    const draggedCenterY = dragged.y + dragged.height / 2
    const targetCenterY = target.y + target.height / 2
    const draggedCenterX = dragged.x + dragged.width / 2
    const targetCenterX = target.x + target.width / 2

    const canStackHorizontally =
      yOverlap >= minOverlap ||
      perpendicularProximityForHorizontalStack(dragged, target, perpendicularProximity) ||
      Math.abs(draggedCenterY - targetCenterY) <= snapDistance * SNAP_CENTER_AXIS_FACTOR

    if (canStackHorizontally) {
      const gapRightToLeft = target.x - draggedRight - contactGap
      if (Math.abs(gapRightToLeft) <= snapDistance) {
        const { align } = resolveVerticalAlignForHorizontalSnap(dragged, target)
        candidates.push({
          targetId: target.id,
          snapKind: 'right-to-left',
          score: Math.abs(gapRightToLeft),
          perpendicularAlign: align,
        })
      }

      const gapLeftToRight = dragged.x - targetRight - contactGap
      if (Math.abs(gapLeftToRight) <= snapDistance) {
        const { align } = resolveVerticalAlignForHorizontalSnap(dragged, target)
        candidates.push({
          targetId: target.id,
          snapKind: 'left-to-right',
          score: Math.abs(gapLeftToRight),
          perpendicularAlign: align,
        })
      }
    }

    const canStackVertically =
      xOverlap >= minOverlap ||
      perpendicularProximityForVerticalStack(dragged, target, perpendicularProximity) ||
      Math.abs(draggedCenterX - targetCenterX) <= snapDistance * SNAP_CENTER_AXIS_FACTOR

    if (canStackVertically) {
      const gapBottomToTop = target.y - draggedBottom - contactGap
      if (Math.abs(gapBottomToTop) <= snapDistance) {
        const { align } = resolveHorizontalAlignForVerticalSnap(dragged, target)
        candidates.push({
          targetId: target.id,
          snapKind: 'bottom-to-top',
          score: Math.abs(gapBottomToTop),
          perpendicularAlign: align,
        })
      }

      const gapTopToBottom = dragged.y - targetBottom - contactGap
      if (Math.abs(gapTopToBottom) <= snapDistance) {
        const { align } = resolveHorizontalAlignForVerticalSnap(dragged, target)
        candidates.push({
          targetId: target.id,
          snapKind: 'top-to-bottom',
          score: Math.abs(gapTopToBottom),
          perpendicularAlign: align,
        })
      }
    }

    if (canStackHorizontally) {
      if (Math.abs(dragged.x - target.x) <= alignTolerance) {
        candidates.push({
          targetId: target.id,
          snapKind: 'align-left',
          score: alignTolerance + Math.abs(dragged.x - target.x) + 0.5,
        })
      }
      if (Math.abs(draggedRight - targetRight) <= alignTolerance) {
        candidates.push({
          targetId: target.id,
          snapKind: 'align-right',
          score: alignTolerance + Math.abs(draggedRight - targetRight) + 0.5,
        })
      }
    }

    if (canStackVertically) {
      if (Math.abs(dragged.y - target.y) <= alignTolerance) {
        candidates.push({
          targetId: target.id,
          snapKind: 'align-top',
          score: alignTolerance + Math.abs(dragged.y - target.y) + 0.5,
        })
      }
      if (Math.abs(draggedBottom - targetBottom) <= alignTolerance) {
        candidates.push({
          targetId: target.id,
          snapKind: 'align-bottom',
          score: alignTolerance + Math.abs(draggedBottom - targetBottom) + 0.5,
        })
      }
    }

    for (const candidate of candidates) {
      if (!best || candidate.score < best.score) {
        best = finalizeSnapResult(
          dragged,
          target,
          candidate.snapKind,
          candidate.targetId,
          candidate.score,
          candidate.perpendicularAlign,
          contactGap,
        )
      }
    }
  }

  return best
}

/** Keeps snap engaged briefly after the pointer-derived position leaves the tight zone. */
export function resolveArtifactSnapWithSticky(
  dragged: BoundsRect,
  others: BoundsRect[],
  thresholds: SnapThresholds,
  sticky: SnapResult | null | undefined,
  options?: {
    contactGapBetween?: (draggedId: string, targetId: string) => number
  },
): SnapResult | null {
  const snap = resolveArtifactSnap(dragged, others, thresholds, options)
  if (snap) {
    return snap
  }
  if (!sticky) {
    return null
  }

  const loose = expandSnapThresholds(thresholds)
  const looseSnap = resolveArtifactSnap(dragged, others, loose, options)
  if (
    looseSnap &&
    looseSnap.targetId === sticky.targetId &&
    looseSnap.snapKind === sticky.snapKind
  ) {
    return looseSnap
  }

  const holdDx = Math.abs(dragged.x - sticky.snappedPosition.x)
  const holdDy = Math.abs(dragged.y - sticky.snappedPosition.y)
  if (Math.max(holdDx, holdDy) <= loose.snapDistance) {
    const target = others.find((other) => other.id === sticky.targetId)
    if (target) {
      return commitArtifactSnap(sticky, dragged, target)
    }
  }

  return null
}

export function isAdjacentSnapKind(kind: SnapKind): boolean {
  return (
    kind === 'right-to-left' ||
    kind === 'left-to-right' ||
    kind === 'bottom-to-top' ||
    kind === 'top-to-bottom'
  )
}

export function shouldPreferTabMerge(clientX: number, clientY: number): boolean {
  return resolveArtifactDropTarget(clientX, clientY) !== null
}

export function isDetachedFromGroup(
  dragged: BoundsRect,
  groupMemberBounds: BoundsRect[],
  thresholds: SnapThresholds,
): boolean {
  if (groupMemberBounds.length === 0) {
    return true
  }

  const adjacency = buildAdjacencyGraph([dragged, ...groupMemberBounds])
  const neighbors = adjacency.get(dragged.id) ?? new Set<string>()
  if (neighbors.size > 0) {
    return false
  }

  let minGap = Infinity
  for (const other of groupMemberBounds) {
    const draggedRight = dragged.x + dragged.width
    const draggedBottom = dragged.y + dragged.height
    const otherRight = other.x + other.width
    const otherBottom = other.y + other.height
    const gapX = Math.max(other.x - draggedRight, dragged.x - otherRight, 0)
    const gapY = Math.max(other.y - draggedBottom, dragged.y - otherBottom, 0)
    minGap = Math.min(minGap, Math.max(gapX, gapY))
  }

  return (
    minGap >
    thresholds.snapDistance +
      DETACH_DISTANCE_SCREEN_PX *
        (thresholds.snapDistance / SNAP_DISTANCE_SCREEN_PX)
  )
}
