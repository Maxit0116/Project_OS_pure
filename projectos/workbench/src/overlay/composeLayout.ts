import type { AnnotationAnchor, ScreenRect } from '@contracts/spatial-pin'
import { EDGE_ANCHORS, pointInRect, toEdgeAnchor } from './regionAnchors'

const DEFAULT_MARGIN = 12
/** Matches `.overlay-panel { border-radius: var(--radius-lg) }` (12px). */
export const COMPOSE_CARD_RADIUS_PX = 12
/** Half-width of the arrow shaft for occlusion tests (px). */
const ARROW_STROKE_HALF = 5
/** Exclude the last N px of the shaft near the tip (docking zone). */
const TIP_EXCLUDE_PX = 16

/**
 * Offset of an attach anchor within the card, inset for rounded corners so the
 * tip lands on the visible chrome instead of the transparent box corner.
 */
export function composeAttachOffset(
  attach: AnnotationAnchor,
  panelWidth: number,
  panelHeight: number,
  radius = COMPOSE_CARD_RADIUS_PX,
): { x: number; y: number } {
  const r = Math.min(radius, panelWidth / 2, panelHeight / 2)
  const inset = r * (1 - Math.SQRT1_2)
  switch (attach) {
    case 'topLeft':
      return { x: inset, y: inset }
    case 'top':
      return { x: panelWidth / 2, y: 0 }
    case 'topRight':
      return { x: panelWidth - inset, y: inset }
    case 'right':
      return { x: panelWidth, y: panelHeight / 2 }
    case 'bottomRight':
      return { x: panelWidth - inset, y: panelHeight - inset }
    case 'bottom':
      return { x: panelWidth / 2, y: panelHeight }
    case 'bottomLeft':
      return { x: inset, y: panelHeight - inset }
    case 'left':
      return { x: 0, y: panelHeight / 2 }
    default:
      return { x: 0, y: panelHeight / 2 }
  }
}

export function composeAttachScreenPoint(
  card: ScreenRect,
  attach: AnnotationAnchor,
  radius = COMPOSE_CARD_RADIUS_PX,
): { x: number; y: number } {
  const off = composeAttachOffset(attach, card.width, card.height, radius)
  return { x: card.x + off.x, y: card.y + off.y }
}

export interface ComposeLayoutInput {
  region: ScreenRect
  /** Arrow head on the capture region (screen coords). */
  headScreen: { x: number; y: number }
  /**
   * User-drawn arrow tip — kept fixed (direction + length preserved).
   * The compose card docks one of its 4 edge midpoints onto this point.
   */
  preferredTailScreen: { x: number; y: number }
  panelWidth: number
  panelHeight: number
  viewport: { width: number; height: number }
  margin?: number
}

export interface ComposeLayoutResult {
  card: ScreenRect
  /** Which of the card's 4 edge midpoints sits on the fixed arrow tip. */
  attach: AnnotationAnchor
  /** Always equals preferredTailScreen (arrow tip unchanged). */
  attachScreen: { x: number; y: number }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function rectsOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}

export function overlapArea(a: ScreenRect, b: ScreenRect): number {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.width, b.x + b.width)
  const y1 = Math.min(a.y + a.height, b.y + b.height)
  if (x1 <= x0 || y1 <= y0) return 0
  return (x1 - x0) * (y1 - y0)
}

/** Place card so the given (rounded) attach anchor coincides with the fixed tip. */
export function cardPinnedToTip(
  tip: { x: number; y: number },
  attach: AnnotationAnchor,
  panelWidth: number,
  panelHeight: number,
  radius = COMPOSE_CARD_RADIUS_PX,
): ScreenRect {
  const off = composeAttachOffset(attach, panelWidth, panelHeight, radius)
  return {
    x: tip.x - off.x,
    y: tip.y - off.y,
    width: panelWidth,
    height: panelHeight,
  }
}

function inflateRect(rect: ScreenRect, pad: number): ScreenRect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }
}

/**
 * True if the arrow shaft (head → tip) intersects the card interior,
 * ignoring a small docking neighborhood around the tip.
 */
export function arrowShaftHitsCard(
  head: { x: number; y: number },
  tip: { x: number; y: number },
  card: ScreenRect,
  strokeHalf = ARROW_STROKE_HALF,
  tipExcludePx = TIP_EXCLUDE_PX,
): boolean {
  const dx = tip.x - head.x
  const dy = tip.y - head.y
  const len = Math.hypot(dx, dy)
  if (len < 1) return false
  const excludeT = clamp(tipExcludePx / len, 0, 0.85)
  const hitRect = inflateRect(card, strokeHalf)
  const steps = Math.max(8, Math.ceil(len / 6))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (t > 1 - excludeT) break
    const x = head.x + dx * t
    const y = head.y + dy * t
    if (pointInRect(hitRect, x, y)) return true
  }
  return false
}

function viewportOverflow(
  card: ScreenRect,
  viewport: { width: number; height: number },
  margin: number,
): number {
  const left = Math.max(0, margin - card.x)
  const top = Math.max(0, margin - card.y)
  const right = Math.max(0, card.x + card.width + margin - viewport.width)
  const bottom = Math.max(0, card.y + card.height + margin - viewport.height)
  return left + top + right + bottom
}

/**
 * Prefer cards that extend past the tip away from the head (continuation of
 * the arrow direction) so the shaft is less likely to cross the card.
 */
function awayFromHeadBonus(
  tip: { x: number; y: number },
  head: { x: number; y: number },
  card: ScreenRect,
): number {
  const vx = tip.x - head.x
  const vy = tip.y - head.y
  const cx = card.x + card.width / 2 - tip.x
  const cy = card.y + card.height / 2 - tip.y
  const dot = vx * cx + vy * cy
  // Negative score contribution when card continues past the tip.
  return dot > 0 ? -Math.min(80, Math.sqrt(dot) * 0.15) : 40
}

/**
 * Keep the user-drawn arrow tip fixed. Choose which of the compose card's
 * 4 edge midpoints docks onto that tip so the card avoids covering the
 * capture region and the arrow shaft.
 */
export function layoutComposeForArrow(
  input: ComposeLayoutInput,
): ComposeLayoutResult {
  const margin = input.margin ?? DEFAULT_MARGIN
  const tip = input.preferredTailScreen
  const head = input.headScreen

  let best: ComposeLayoutResult | null = null
  let bestScore = Infinity

  for (const attach of EDGE_ANCHORS) {
    const card = cardPinnedToTip(
      tip,
      attach,
      input.panelWidth,
      input.panelHeight,
    )
    const regionHit = overlapArea(card, input.region)
    const shaftHit = arrowShaftHitsCard(head, tip, card) ? 1 : 0
    const overflow = viewportOverflow(card, input.viewport, margin)
    const score =
      regionHit * 80 +
      shaftHit * 25_000 +
      overflow * 8 +
      awayFromHeadBonus(tip, head, card)

    if (score < bestScore) {
      bestScore = score
      best = { card, attach, attachScreen: { ...tip } }
    }
  }

  return (
    best ?? {
      card: cardPinnedToTip(tip, 'left', input.panelWidth, input.panelHeight),
      attach: 'left',
      attachScreen: { ...tip },
    }
  )
}

/** Pin using an edge attach (legacy corners collapse to edges). */
export function cardPinnedToTipEdge(
  tip: { x: number; y: number },
  attach: AnnotationAnchor,
  panelWidth: number,
  panelHeight: number,
  radius = COMPOSE_CARD_RADIUS_PX,
): ScreenRect {
  return cardPinnedToTip(
    tip,
    toEdgeAnchor(attach),
    panelWidth,
    panelHeight,
    radius,
  )
}

/**
 * Estimated compose panel height before the first DOM measure.
 * Prefer live `offsetHeight` via useComposePanelMetrics — a mismatch here
 * leaves a visible gap between the arrow tip and the card edge.
 */
export function estimateComposePanelHeight(withFlowRail: boolean): number {
  // header ~32 + composer ~72 + footer ~36 + padding/gaps ~40
  return withFlowRail ? 248 : 180
}

export { EDGE_ANCHORS, ALL_ANCHORS } from './regionAnchors'
