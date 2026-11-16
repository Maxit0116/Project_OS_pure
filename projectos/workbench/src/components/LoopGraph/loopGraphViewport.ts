/** Camera for the Loops Graph world layer (screen-space translate + scale). */
export type LoopGraphViewport = {
  x: number
  y: number
  scale: number
}

export type WorldRect = {
  left: number
  top: number
  right: number
  bottom: number
}

export function formatWorldTransform(viewport: LoopGraphViewport): string {
  return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`
}

/** Convert a client (screen) point into world coordinates. */
export function clientToWorldPoint(
  clientX: number,
  clientY: number,
  canvasRect: { left: number; top: number },
  viewport: LoopGraphViewport,
): { x: number; y: number } {
  return {
    x: (clientX - canvasRect.left - viewport.x) / viewport.scale,
    y: (clientY - canvasRect.top - viewport.y) / viewport.scale,
  }
}

/**
 * Visible world AABB for the current camera, expanded by a screen-space margin
 * so nodes near the edge are not mounted/unmounted while panning.
 */
export function visibleWorldRect(
  viewport: LoopGraphViewport,
  canvasSize: { width: number; height: number },
  marginScreenPx = 240,
): WorldRect {
  const scale = Math.max(0.001, viewport.scale)
  const margin = marginScreenPx / scale
  return {
    left: -viewport.x / scale - margin,
    top: -viewport.y / scale - margin,
    right: (-viewport.x + canvasSize.width) / scale + margin,
    bottom: (-viewport.y + canvasSize.height) / scale + margin,
  }
}

export function rectIntersectsWorldView(
  x: number,
  y: number,
  width: number,
  height: number,
  view: WorldRect,
): boolean {
  return !(
    x + width < view.left ||
    y + height < view.top ||
    x > view.right ||
    y > view.bottom
  )
}
