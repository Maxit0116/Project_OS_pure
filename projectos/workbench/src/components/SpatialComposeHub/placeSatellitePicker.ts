export interface PickerRect {
  x: number
  y: number
  width: number
  height: number
}

export type PickerSide = 'right' | 'left' | 'below' | 'above'

export const PICKER_WIDTH = 220
export const PICKER_HEIGHT = 240
export const PICKER_GAP = 10

function overlapArea(a: PickerRect, b: PickerRect): number {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  const w = right - left
  const h = bottom - top
  if (w <= 0 || h <= 0) return 0
  return w * h
}

function totalOverlap(candidate: PickerRect, obstacles: readonly PickerRect[]): number {
  let sum = 0
  for (const obstacle of obstacles) sum += overlapArea(candidate, obstacle)
  return sum
}

function clampToViewport(
  rect: PickerRect,
  viewport: { width: number; height: number },
  margin = 8,
): PickerRect {
  const maxX = Math.max(margin, viewport.width - rect.width - margin)
  const maxY = Math.max(margin, viewport.height - rect.height - margin)
  return {
    ...rect,
    x: Math.min(maxX, Math.max(margin, rect.x)),
    y: Math.min(maxY, Math.max(margin, rect.y)),
  }
}

function candidateForSide(
  anchor: PickerRect,
  side: PickerSide,
  size: { width: number; height: number },
  gap: number,
): PickerRect {
  switch (side) {
    case 'right':
      return {
        x: anchor.x + anchor.width + gap,
        y: anchor.y,
        width: size.width,
        height: size.height,
      }
    case 'left':
      return {
        x: anchor.x - size.width - gap,
        y: anchor.y,
        width: size.width,
        height: size.height,
      }
    case 'below':
      return {
        x: anchor.x,
        y: anchor.y + anchor.height + gap,
        width: size.width,
        height: size.height,
      }
    case 'above':
      return {
        x: anchor.x,
        y: anchor.y - size.height - gap,
        width: size.width,
        height: size.height,
      }
  }
}

/**
 * Place a secondary picker near `anchor`, preferring the natural side for the
 * anchor's hub stack, while minimizing overlap with other satellites / card.
 */
export function placeSatellitePicker(input: {
  anchor: PickerRect
  obstacles?: readonly PickerRect[]
  /** Prefer this side first (e.g. left-stack satellites → 'right'). */
  preferredSide?: PickerSide
  pickerSize?: { width: number; height: number }
  viewport?: { width: number; height: number }
  gap?: number
}): { x: number; y: number; side: PickerSide } {
  const size = input.pickerSize ?? {
    width: PICKER_WIDTH,
    height: PICKER_HEIGHT,
  }
  const gap = input.gap ?? PICKER_GAP
  const viewport = input.viewport ?? {
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }
  // Avoid covering the anchor card itself after viewport clamping.
  const obstacles = [...(input.obstacles ?? []), input.anchor]
  const preferred = input.preferredSide ?? 'right'
  const order: PickerSide[] = [
    preferred,
    ...(['right', 'left', 'below', 'above'] as const).filter(
      (side) => side !== preferred,
    ),
  ]

  let best: { x: number; y: number; side: PickerSide; score: number } | null =
    null

  for (const side of order) {
    const raw = candidateForSide(input.anchor, side, size, gap)
    const placed = clampToViewport(raw, viewport)
    const overlap = totalOverlap(placed, obstacles)
    // Prefer zero-overlap first; among equals keep earlier preferred side.
    // Clamp overflow is secondary — still better than overlapping another card.
    const overflow =
      Math.abs(placed.x - raw.x) + Math.abs(placed.y - raw.y)
    const score = overlap * 10_000 + overflow
    if (!best || score < best.score) {
      best = { x: placed.x, y: placed.y, side, score }
    }
    // First zero-overlap candidate in preference order wins.
    if (overlap === 0) break
  }

  return best ?? { x: 8, y: 8, side: preferred }
}
