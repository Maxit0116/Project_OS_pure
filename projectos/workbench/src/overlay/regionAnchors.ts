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

export function listRegionAnchors(rect: ScreenRect): AnchorPoint[] {
  return ALL_ANCHORS.map((anchor) => ({
    anchor,
    rel: relativePointForAnchor(anchor),
    screen: screenPointForAnchor(rect, anchor),
  }))
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
