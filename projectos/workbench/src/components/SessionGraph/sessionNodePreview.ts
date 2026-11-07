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

/** Place the preview beside the node (prefer right, then left, then below), clamped to the viewport. */
export function resolveSessionNodePreviewPosition(
  nodeRect: DOMRectReadOnly,
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
  const spaceRight = viewport.right - margin - (nodeRect.right + gap)
  const spaceLeft = nodeRect.left - gap - (viewport.left + margin)

  let x: number
  if (spaceRight >= previewWidth || spaceRight >= spaceLeft) {
    x = nodeRect.right + gap
  } else {
    x = nodeRect.left - gap - previewWidth
  }

  let y = nodeRect.top
  const maxX = viewport.right - margin - previewWidth
  const maxY = viewport.bottom - margin - previewHeight
  x = Math.max(viewport.left + margin, Math.min(x, maxX))
  y = Math.max(viewport.top + margin, Math.min(y, maxY))

  // If horizontal placement still collides with the node, drop below.
  const overlapsNodeHorizontally =
    x < nodeRect.right + gap && x + previewWidth > nodeRect.left - gap
  const overlapsNodeVertically =
    y < nodeRect.bottom + gap && y + previewHeight > nodeRect.top - gap
  if (overlapsNodeHorizontally && overlapsNodeVertically) {
    y = Math.min(nodeRect.bottom + gap, maxY)
    y = Math.max(viewport.top + margin, y)
  }

  return { x, y }
}
