import type { AnnotationAnchor, ScreenRect } from '@contracts/spatial-pin'
import {
  EDGE_ANCHORS,
  listRegionAnchors,
  relativePointForAnchor,
  relativeToClient,
  type AnchorPoint,
} from './regionAnchors'

/** Distinct arrow colors cycling by 1-based index. */
export const ARROW_COLOR_PALETTE = [
  '#4c7dff',
  '#ff5c5c',
  '#34c759',
  '#ff9f0a',
  '#bf5af2',
  '#5ac8fa',
  '#ff375f',
  '#af52de',
] as const

export function colorForArrowIndex(index: number): string {
  const i = Math.max(1, Math.floor(index)) - 1
  return ARROW_COLOR_PALETTE[i % ARROW_COLOR_PALETTE.length]!
}

function dist2(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

/** Nearest edge-midpoint anchor to a region-relative point. */
export function nearestAnchorToRelative(
  rel: { x: number; y: number },
): AnnotationAnchor {
  let best: AnnotationAnchor = 'top'
  let bestD = Infinity
  for (const anchor of EDGE_ANCHORS) {
    const p = relativePointForAnchor(anchor)
    const d = dist2(p, rel)
    if (d < bestD) {
      bestD = d
      best = anchor
    }
  }
  return best
}

export function nearestAnchorToClient(
  rect: ScreenRect,
  clientX: number,
  clientY: number,
): AnchorPoint {
  const anchors = listRegionAnchors(rect)
  let best = anchors[0]!
  let bestD = Infinity
  for (const item of anchors) {
    const d = dist2(item.screen, { x: clientX, y: clientY })
    if (d < bestD) {
      bestD = d
      best = item
    }
  }
  return best
}

/** Hit-test an anchor dot in screen space (radius in CSS px). */
export function hitTestAnchor(
  rect: ScreenRect,
  clientX: number,
  clientY: number,
  radiusPx = 10,
): AnchorPoint | null {
  const r2 = radiusPx * radiusPx
  let best: AnchorPoint | null = null
  let bestD = Infinity
  for (const item of listRegionAnchors(rect)) {
    const d = dist2(item.screen, { x: clientX, y: clientY })
    if (d <= r2 && d < bestD) {
      bestD = d
      best = item
    }
  }
  return best
}

export function arrowScreenEndpoints(
  rect: ScreenRect,
  headRel: { x: number; y: number },
  tailRel: { x: number; y: number },
): { head: { x: number; y: number }; tail: { x: number; y: number } } {
  return {
    head: relativeToClient(rect, headRel),
    tail: relativeToClient(rect, tailRel),
  }
}

/** Renumber arrows 1..n after delete; returns new list with updated index+color. */
export function renumberArrows<
  T extends { index: number; color: string },
>(arrows: T[]): T[] {
  return arrows.map((arrow, i) => ({
    ...arrow,
    index: i + 1,
    color: colorForArrowIndex(i + 1),
  }))
}
