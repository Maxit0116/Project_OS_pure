import type { AnnotationAnchor, ScreenRect } from '@contracts/spatial-pin'

export interface AnchorPoint {
  anchor: AnnotationAnchor
  /** Region-relative (0–1 on the rect edges/corners). */
  rel: { x: number; y: number }
  /** Overlay / window client coordinates. */
  screen: { x: number; y: number }
}

const ANCHOR_RELS: Record<AnnotationAnchor, { x: number; y: number }> = {
  topLeft: { x: 0, y: 0 },
  top: { x: 0.5, y: 0 },
  topRight: { x: 1, y: 0 },
  right: { x: 1, y: 0.5 },
  bottomRight: { x: 1, y: 1 },
  bottom: { x: 0.5, y: 1 },
  bottomLeft: { x: 0, y: 1 },
  left: { x: 0, y: 0.5 },
}

/** All eight anchors — used by compose-card docking. */
export const ALL_ANCHORS: AnnotationAnchor[] = [
  'topLeft',
  'top',
  'topRight',
  'right',
  'bottomRight',
  'bottom',
  'bottomLeft',
  'left',
]

/** Region arrow heads: edge midpoints only (corners are resize handles). */
export const EDGE_ANCHORS: AnnotationAnchor[] = [
  'top',
  'right',
  'bottom',
  'left',
]

export function relativePointForAnchor(
  anchor: AnnotationAnchor,
): { x: number; y: number } {
  return { ...ANCHOR_RELS[anchor] }
}

export function screenPointForAnchor(
  rect: ScreenRect,
  anchor: AnnotationAnchor,
): { x: number; y: number } {
  const rel = ANCHOR_RELS[anchor]
  return {
    x: rect.x + rel.x * rect.width,
    y: rect.y + rel.y * rect.height,
  }
}

/** Edge-midpoint anchors for drawing / hitting region→compose arrows. */
export function listRegionAnchors(rect: ScreenRect): AnchorPoint[] {
  return EDGE_ANCHORS.map((anchor) => ({
    anchor,
    rel: relativePointForAnchor(anchor),
    screen: screenPointForAnchor(rect, anchor),
  }))
}

/** Collapse a legacy corner anchor onto the nearest edge midpoint. */
export function toEdgeAnchor(anchor: AnnotationAnchor): AnnotationAnchor {
  if (
    anchor === 'top' ||
    anchor === 'right' ||
    anchor === 'bottom' ||
    anchor === 'left'
  ) {
    return anchor
  }
  const rel = ANCHOR_RELS[anchor]
  let best: AnnotationAnchor = 'top'
  let bestD = Infinity
  for (const edge of EDGE_ANCHORS) {
    const p = ANCHOR_RELS[edge]
    const d = (p.x - rel.x) ** 2 + (p.y - rel.y) ** 2
    if (d < bestD) {
      bestD = d
      best = edge
    }
  }
  return best
}

/** Convert overlay client coords → region-relative (may be outside [0,1]). */
export function clientToRelative(
  rect: ScreenRect,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const w = Math.max(1, rect.width)
  const h = Math.max(1, rect.height)
  return {
    x: (clientX - rect.x) / w,
    y: (clientY - rect.y) / h,
  }
}

/** Convert region-relative → overlay client coords. */
export function relativeToClient(
  rect: ScreenRect,
  rel: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: rect.x + rel.x * rect.width,
    y: rect.y + rel.y * rect.height,
  }
}

/** Clamp a relative point into [0,1] for pen strokes. */
export function clampRelativeInRect(rel: {
  x: number
  y: number
}): { x: number; y: number } {
  return {
    x: Math.min(1, Math.max(0, rel.x)),
    y: Math.min(1, Math.max(0, rel.y)),
  }
}

export function pointInRect(
  rect: ScreenRect,
  clientX: number,
  clientY: number,
): boolean {
  return (
    clientX >= rect.x &&
    clientX <= rect.x + rect.width &&
    clientY >= rect.y &&
    clientY <= rect.y + rect.height
  )
}
