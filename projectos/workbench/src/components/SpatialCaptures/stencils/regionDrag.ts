import type { ScreenRect } from '@contracts/spatial-pin'

/** Pointer movement (stage px) before a region press becomes a drag. */
export const REGION_DRAG_THRESHOLD_PX = 5

/** Pointer movement before a library press becomes a place-drag. */
export const STENCIL_DRAG_THRESHOLD_PX = 6

/** Padding around a newly placed stencil when creating a dedicated region. */
export const STENCIL_REGION_PAD_PX = 24

/** Minimum region / placement size when resizing from a corner. */
export const MIN_RESIZE_SIZE_PX = 48

export type ResizeHandle =
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'

export const RESIZE_HANDLES: ResizeHandle[] = [
  'topLeft',
  'topRight',
  'bottomLeft',
  'bottomRight',
]

/** Translate a capture rect, clamped inside the viewport. */
export function movedCaptureRect(
  origin: ScreenRect,
  dx: number,
  dy: number,
  viewport: { width: number; height: number },
): ScreenRect {
  const maxX = Math.max(0, viewport.width - origin.width)
  const maxY = Math.max(0, viewport.height - origin.height)
  return {
    x: Math.max(0, Math.min(origin.x + dx, maxX)),
    y: Math.max(0, Math.min(origin.y + dy, maxY)),
    width: origin.width,
    height: origin.height,
  }
}

/** Stage-space rect for a new region snug around a stencil drop. */
export function regionRectForStencilDrop(
  stagePoint: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  pad = STENCIL_REGION_PAD_PX,
): ScreenRect {
  const width = Math.min(viewport.width, size.width + pad * 2)
  const height = Math.min(viewport.height, size.height + pad * 2)
  const x = Math.max(
    0,
    Math.min(stagePoint.x - width / 2, viewport.width - width),
  )
  const y = Math.max(
    0,
    Math.min(stagePoint.y - height / 2, viewport.height - height),
  )
  return { x, y, width, height }
}

/** Move a region-local placement rect, clamped inside the region. */
export function movedPlacementLocalRect(
  origin: ScreenRect,
  dx: number,
  dy: number,
  region: ScreenRect,
): ScreenRect {
  const maxX = Math.max(0, region.width - origin.width)
  const maxY = Math.max(0, region.height - origin.height)
  return {
    x: Math.max(0, Math.min(origin.x + dx, maxX)),
    y: Math.max(0, Math.min(origin.y + dy, maxY)),
    width: origin.width,
    height: origin.height,
  }
}

export function resizeHandleScreenPoint(
  rect: ScreenRect,
  handle: ResizeHandle,
): { x: number; y: number } {
  switch (handle) {
    case 'topLeft':
      return { x: rect.x, y: rect.y }
    case 'topRight':
      return { x: rect.x + rect.width, y: rect.y }
    case 'bottomLeft':
      return { x: rect.x, y: rect.y + rect.height }
    case 'bottomRight':
      return { x: rect.x + rect.width, y: rect.y + rect.height }
  }
}

/** Hit-test a corner resize handle in stage / screen space. */
export function hitTestResizeHandle(
  rect: ScreenRect,
  x: number,
  y: number,
  radiusPx = 10,
): ResizeHandle | null {
  const r2 = radiusPx * radiusPx
  let best: ResizeHandle | null = null
  let bestD = Infinity
  for (const handle of RESIZE_HANDLES) {
    const p = resizeHandleScreenPoint(rect, handle)
    const d = (p.x - x) ** 2 + (p.y - y) ** 2
    if (d <= r2 && d < bestD) {
      bestD = d
      best = handle
    }
  }
  return best
}

/**
 * Resize a rect from a corner handle. When `bounds` is set, the result stays
 * inside that box (stage viewport or parent region).
 */
export function resizedRectFromHandle(
  origin: ScreenRect,
  handle: ResizeHandle,
  pointerX: number,
  pointerY: number,
  minSize = MIN_RESIZE_SIZE_PX,
  bounds?: { x: number; y: number; width: number; height: number },
): ScreenRect {
  let left = origin.x
  let top = origin.y
  let right = origin.x + origin.width
  let bottom = origin.y + origin.height

  if (handle === 'topLeft' || handle === 'bottomLeft') {
    left = pointerX
  } else {
    right = pointerX
  }
  if (handle === 'topLeft' || handle === 'topRight') {
    top = pointerY
  } else {
    bottom = pointerY
  }

  if (right - left < minSize) {
    if (handle === 'topLeft' || handle === 'bottomLeft') {
      left = right - minSize
    } else {
      right = left + minSize
    }
  }
  if (bottom - top < minSize) {
    if (handle === 'topLeft' || handle === 'topRight') {
      top = bottom - minSize
    } else {
      bottom = top + minSize
    }
  }

  if (bounds) {
    const maxRight = bounds.x + bounds.width
    const maxBottom = bounds.y + bounds.height
    left = Math.max(bounds.x, Math.min(left, maxRight - minSize))
    top = Math.max(bounds.y, Math.min(top, maxBottom - minSize))
    right = Math.max(left + minSize, Math.min(right, maxRight))
    bottom = Math.max(top + minSize, Math.min(bottom, maxBottom))
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

/** Keep a local placement rect inside a (possibly shrunken) region. */
export function clampLocalRectInRegion(
  local: ScreenRect,
  regionRect: ScreenRect,
): ScreenRect {
  const width = Math.min(local.width, regionRect.width)
  const height = Math.min(local.height, regionRect.height)
  return {
    x: Math.max(0, Math.min(local.x, regionRect.width - width)),
    y: Math.max(0, Math.min(local.y, regionRect.height - height)),
    width,
    height,
  }
}

/**
 * Move a placement in stage space. When the stub would clamp inside a snug
 * region, shift the region so the stub keeps following the pointer.
 */
export function movedPlacementWithRegionFollow(
  originLocal: ScreenRect,
  dx: number,
  dy: number,
  regionCapture: ScreenRect,
  viewport: { width: number; height: number },
): { nextCapture: ScreenRect; nextLocal: ScreenRect } {
  const desiredLocal = {
    x: originLocal.x + dx,
    y: originLocal.y + dy,
    width: originLocal.width,
    height: originLocal.height,
  }
  const overflowX =
    desiredLocal.x < 0
      ? desiredLocal.x
      : desiredLocal.x + desiredLocal.width > regionCapture.width
        ? desiredLocal.x + desiredLocal.width - regionCapture.width
        : 0
  const overflowY =
    desiredLocal.y < 0
      ? desiredLocal.y
      : desiredLocal.y + desiredLocal.height > regionCapture.height
        ? desiredLocal.y + desiredLocal.height - regionCapture.height
        : 0
  const nextCapture =
    overflowX !== 0 || overflowY !== 0
      ? movedCaptureRect(regionCapture, overflowX, overflowY, viewport)
      : regionCapture
  const nextLocal = movedPlacementLocalRect(
    originLocal,
    dx - (nextCapture.x - regionCapture.x),
    dy - (nextCapture.y - regionCapture.y),
    nextCapture,
  )
  return { nextCapture, nextLocal }
}
