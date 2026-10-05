export const DEFAULT_DIFF_BODY_HEIGHT = 420
export const MIN_DIFF_BODY_HEIGHT = 240

export function maxDiffBodyHeight(viewportHeight = window.innerHeight): number {
  return Math.round(viewportHeight * 0.8)
}

export function clampDiffBodyHeight(
  height: number,
  viewportHeight = window.innerHeight,
): number {
  return Math.min(maxDiffBodyHeight(viewportHeight), Math.max(MIN_DIFF_BODY_HEIGHT, height))
}
