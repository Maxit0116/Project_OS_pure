/** How long the pointer must rest on a session node before its description preview opens. */
export const SESSION_NODE_PREVIEW_DELAY_MS = 500
/** Grace period when leaving the node so the pointer can enter the preview. */
export const SESSION_NODE_PREVIEW_HIDE_MS = 140
export const SESSION_NODE_PREVIEW_WIDTH = 280
export const SESSION_NODE_PREVIEW_MAX_HEIGHT = 240
export const SESSION_NODE_PREVIEW_GAP = 10
export const SESSION_NODE_PREVIEW_MARGIN = 12

export interface ViewportRect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Place the preview beside an anchor (node card, title, or strip row).
 * Prefer right, then left, then below — clamped to the viewport.
 * Vertical origin tracks the anchor top so strip-row previews sit beside that row.
 */
export function resolveSessionNodePreviewPosition(
  anchorRect: DOMRectReadOnly,
  previewWidth = SESSION_NODE_PREVIEW_WIDTH,
  previewHeight = SESSION_NODE_PREVIEW_MAX_HEIGHT,
  viewport: ViewportRect = {
    left: 0,
    top: 0,
    right: typeof window !== 'undefined' ? window.innerWidth : previewWidth,
    bottom: typeof window !== 'undefined' ? window.innerHeight : previewHeight,
  },
  gap = SESSION_NODE_PREVIEW_GAP,
  margin = SESSION_NODE_PREVIEW_MARGIN,
): { x: number; y: number } {
  const spaceRight = viewport.right - margin - (anchorRect.right + gap)
  const spaceLeft = anchorRect.left - gap - (viewport.left + margin)

  let x: number
  if (spaceRight >= previewWidth || spaceRight >= spaceLeft) {
    x = anchorRect.right + gap
  } else {
    x = anchorRect.left - gap - previewWidth
  }

  let y = anchorRect.top
  const maxX = viewport.right - margin - previewWidth
  const maxY = viewport.bottom - margin - previewHeight
  x = Math.max(viewport.left + margin, Math.min(x, maxX))
  y = Math.max(viewport.top + margin, Math.min(y, maxY))

  // If horizontal placement still collides with the anchor, drop below.
  const overlapsHorizontally =
    x < anchorRect.right + gap && x + previewWidth > anchorRect.left - gap
  const overlapsVertically =
    y < anchorRect.bottom + gap && y + previewHeight > anchorRect.top - gap
  if (overlapsHorizontally && overlapsVertically) {
    y = Math.min(anchorRect.bottom + gap, maxY)
    y = Math.max(viewport.top + margin, y)
  }

  return { x, y }
}
