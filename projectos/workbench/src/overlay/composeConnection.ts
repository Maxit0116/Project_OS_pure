import type { AnnotationAnchor, ScreenRect } from '@contracts/spatial-pin'
import {
  EDGE_ANCHORS,
  screenPointForAnchor,
  toEdgeAnchor,
} from './regionAnchors'
import { composeAttachScreenPoint } from './composeLayout'
import type { OverlayArrow, OverlayRegion } from './overlayRegions'
import {
  placementsForArrow,
  stageRectForPlacement,
} from '../components/SpatialCaptures/stencils/placeStencil'

export type Point = { x: number; y: number }

function centerOf(rect: ScreenRect): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}

/**
 * Edge of `rect` that faces `toward` (center → point → NESW).
 * Used for both compose-card and region/stencil ports.
 */
export function facingEdgeAnchor(
  rect: ScreenRect,
  toward: Point,
): AnnotationAnchor {
  const c = centerOf(rect)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left'
  }
  return dy >= 0 ? 'bottom' : 'top'
}

/** Auto-pick facing edge midpoints between compose card and target. */
export function pickFacingEdgePorts(
  card: ScreenRect,
  target: ScreenRect,
): { cardAnchor: AnnotationAnchor; targetAnchor: AnnotationAnchor } {
  const cardCenter = centerOf(card)
  const targetCenter = centerOf(target)
  return {
    cardAnchor: facingEdgeAnchor(card, targetCenter),
    targetAnchor: facingEdgeAnchor(target, cardCenter),
  }
}

/**
 * Connection target for an arrow: linked stencil box if present, else the region.
 */
export function arrowTargetRect(
  region: OverlayRegion,
  arrow: OverlayArrow,
): ScreenRect {
  const linked = placementsForArrow(region, arrow.id)
  if (linked[0]) return stageRectForPlacement(region, linked[0])
  return region.captureRect
}

/** Stage-space obstacle rects the curve must travel around. */
export function arrowObstacles(
  region: OverlayRegion,
  arrow: OverlayArrow,
  card: ScreenRect,
  extra: ScreenRect[] = [],
): ScreenRect[] {
  const rects: ScreenRect[] = [region.captureRect, card]
  for (const placement of region.stencils ?? []) {
    rects.push(stageRectForPlacement(region, placement))
  }
  for (const item of extra) rects.push(item)
  return rects
}

export function resolveArrowEdgeConnection(
  region: OverlayRegion,
  arrow: OverlayArrow,
  card: ScreenRect,
): {
  cardAnchor: AnnotationAnchor
  targetAnchor: AnnotationAnchor
  headScreen: Point
  attachScreen: Point
  target: ScreenRect
  obstacles: ScreenRect[]
} {
  const target = arrowTargetRect(region, arrow)
  const { cardAnchor, targetAnchor } = pickFacingEdgePorts(card, target)
  const headScreen = screenPointForAnchor(target, targetAnchor)
  const attachScreen = composeAttachScreenPoint(card, cardAnchor)
  return {
    cardAnchor,
    targetAnchor,
    headScreen,
    attachScreen,
    target,
    obstacles: arrowObstacles(region, arrow, card),
  }
}

/** Collapse legacy corner composeAttach onto an edge midpoint. */
export function normalizeComposeAttach(
  attach: AnnotationAnchor | undefined,
): AnnotationAnchor {
  if (!attach) return 'left'
  return toEdgeAnchor(attach)
}

export { EDGE_ANCHORS }
