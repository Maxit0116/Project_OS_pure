/** Camera for the frozen screenshot stage. Zoom is a multiplier on the fit-to-host scale. */

export type CameraPoint = { x: number; y: number }
export type CameraSize = { width: number; height: number }

export const CAPTURE_ZOOM_MIN = 1
export const CAPTURE_ZOOM_MAX = 8

const PAN_MARGIN = 72

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  return Math.min(CAPTURE_ZOOM_MAX, Math.max(CAPTURE_ZOOM_MIN, zoom))
}

export function captureContentSize(
  viewport: CameraSize,
  fitScale: number,
  zoom: number,
): CameraSize {
  const scale = Math.max(0, fitScale) * clampZoom(zoom)
  return {
    width: Math.max(1, viewport.width) * scale,
    height: Math.max(1, viewport.height) * scale,
  }
}

/** True when the scaled screenshot is larger than the visible host on either axis. */
export function captureViewOverflows(host: CameraSize, content: CameraSize): boolean {
  return content.width > host.width + 0.5 || content.height > host.height + 0.5
}

/**
 * Pan is an extra translation on top of flex centering.
 * When the screenshot still fits, pan stays at 0.
 * When it overflows, a margin of the image stays inside the host.
 */
export function clampCapturePan(
  pan: CameraPoint,
  host: CameraSize,
  content: CameraSize,
): CameraPoint {
  if (!captureViewOverflows(host, content)) return { x: 0, y: 0 }
  const baseX = (host.width - content.width) / 2
  const baseY = (host.height - content.height) / 2
  return {
    x: clampAxis(pan.x, baseX, host.width, content.width),
    y: clampAxis(pan.y, baseY, host.height, content.height),
  }
}

function clampAxis(
  pan: number,
  base: number,
  host: number,
  content: number,
): number {
  const min = PAN_MARGIN - content - base
  const max = host - PAN_MARGIN - base
  if (min > max) return 0
  return Math.min(max, Math.max(min, pan))
}

/**
 * Keep the viewport point under (hostX, hostY) fixed while zoom changes.
 * Host coordinates are relative to the stage viewport element.
 */
export function panForZoomAtPoint(input: {
  pan: CameraPoint
  zoom: number
  nextZoom: number
  hostX: number
  hostY: number
  host: CameraSize
  viewport: CameraSize
  fitScale: number
}): CameraPoint {
  const zoom = clampZoom(input.zoom)
  const nextZoom = clampZoom(input.nextZoom)
  const content = captureContentSize(input.viewport, input.fitScale, zoom)
  const nextContent = captureContentSize(input.viewport, input.fitScale, nextZoom)
  const scale = content.width / Math.max(1, input.viewport.width)
  const nextScale = nextContent.width / Math.max(1, input.viewport.width)
  const baseX = (input.host.width - content.width) / 2
  const baseY = (input.host.height - content.height) / 2
  const nextBaseX = (input.host.width - nextContent.width) / 2
  const nextBaseY = (input.host.height - nextContent.height) / 2
  const visualLeft = baseX + input.pan.x
  const visualTop = baseY + input.pan.y
  const vx = (input.hostX - visualLeft) / Math.max(1e-6, scale)
  const vy = (input.hostY - visualTop) / Math.max(1e-6, scale)
  return clampCapturePan(
    {
      x: input.hostX - nextBaseX - vx * nextScale,
      y: input.hostY - nextBaseY - vy * nextScale,
    },
    input.host,
    nextContent,
  )
}
