/**
 * Flat-diamond sizing for Condition / Human Approval nodes.
 *
 * A centered axis-aligned content box (cw × ch) fits inside a diamond of
 * AABB (W × H) when:  cw/W + ch/H ≤ 1 − margin
 * (diamond inequality at the content corners).
 */

/** Preferred flat aspect ratio W/H. */
export const LOOP_DIAMOND_ASPECT = 1.85

/**
 * Keep content inside the stroke: require cw/W + ch/H ≤ 1 − margin.
 * 0.14 ≈ comfortable inset along the diagonals.
 */
export const LOOP_DIAMOND_FIT_MARGIN = 0.14

export const LOOP_DIAMOND_MIN_W = 132
export const LOOP_DIAMOND_MIN_H = 76
export const LOOP_DIAMOND_CONTENT_MAX_W = 152
export const LOOP_DIAMOND_PAD_X = 6
export const LOOP_DIAMOND_PAD_Y = 4

/** Default AABB before first measure (also used as fallback). */
export const LOOP_DIAMOND_NODE_W = 176
export const LOOP_DIAMOND_NODE_H = 100

/**
 * Match LoopDiamondAutosize SVG: `50,1.2 98.8,50 50,98.8 1.2,50` in a 0–100 viewBox.
 * Vertices sit 1.2% in from each AABB edge so stroke stays inside the box.
 */
export const LOOP_DIAMOND_SVG_INSET = 0.012

export type DiamondBox = { width: number; height: number }

/**
 * True when a point in node-local coordinates lies inside the visible flat diamond
 * (not merely the rectangular AABB). Used so drag/select hit-tests match the shape.
 */
export function pointInFlatDiamond(
  localX: number,
  localY: number,
  width: number,
  height: number,
  inset = LOOP_DIAMOND_SVG_INSET,
): boolean {
  if (width <= 0 || height <= 0) return false
  const half = 0.5 - inset
  if (half <= 0) return false
  const nx = localX / width
  const ny = localY / height
  return Math.abs(nx - 0.5) / half + Math.abs(ny - 0.5) / half <= 1 + 1e-9
}

/**
 * Smallest flat diamond AABB that fully wraps a measured content box.
 */
export function diamondSizeForContent(
  contentWidth: number,
  contentHeight: number,
): DiamondBox {
  const cw = Math.max(1, contentWidth + LOOP_DIAMOND_PAD_X * 2)
  const ch = Math.max(1, contentHeight + LOOP_DIAMOND_PAD_Y * 2)
  const m = LOOP_DIAMOND_FIT_MARGIN
  const R = LOOP_DIAMOND_ASPECT
  const denom = 1 - m

  let height = (cw / R + ch) / denom
  let width = R * height

  width = Math.max(width, LOOP_DIAMOND_MIN_W)
  height = Math.max(height, LOOP_DIAMOND_MIN_H)

  // Mins / rounding can break the fit inequality — scale up uniformly.
  const score = cw / width + ch / height
  if (score > denom) {
    const scale = score / denom
    width *= scale
    height *= scale
  }

  return {
    width: Math.ceil(width),
    height: Math.ceil(height),
  }
}

/** Rough first-paint estimate from title/prompt before ResizeObserver fires. */
export function estimateDiamondBox(input: {
  title?: string
  prompt?: string
  shortLabel?: string
}): DiamondBox {
  const title = (input.title?.trim() || input.shortLabel || 'Node').slice(0, 48)
  const prompt = (input.prompt?.trim() || '').slice(0, 120)
  const titleW = Math.min(
    LOOP_DIAMOND_CONTENT_MAX_W,
    Math.max(64, title.length * 7.2 + 40),
  )
  const promptLines = prompt
    ? Math.min(3, Math.max(1, Math.ceil(prompt.length / 26)))
    : 0
  const contentW = Math.min(
    LOOP_DIAMOND_CONTENT_MAX_W,
    Math.max(titleW, prompt ? Math.min(LOOP_DIAMOND_CONTENT_MAX_W, 120) : titleW),
  )
  const contentH = 26 + (promptLines > 0 ? 4 + promptLines * 13 : 0)
  return diamondSizeForContent(contentW, contentH)
}
