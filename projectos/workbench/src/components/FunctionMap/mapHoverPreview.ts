import type { FunctionalNode } from '@contracts/index'

export interface MapClusterPreview {
  label: string
  description: string
  layerId: string
}

export type MapHoverPreview =
  | {
      kind: 'node'
      node: FunctionalNode
      x: number
      y: number
      fixed?: boolean
      anchorNodeId?: string
    }
  | {
      kind: 'cluster'
      cluster: MapClusterPreview
      x: number
      y: number
      fixed?: boolean
      anchorClusterId?: string
    }

export const GALAXY_PREVIEW_FOLLOW_MS = 1000

/** How long the pointer must rest on a node before the preview opens. */
export const PREVIEW_DWELL_MS = 1000
/** Movement inside this radius still counts as resting. */
export const PREVIEW_DWELL_SLOP_PX = 12

export function previewDwellMoved(
  anchor: { x: number; y: number },
  point: { x: number; y: number },
  slop = PREVIEW_DWELL_SLOP_PX,
): boolean {
  const dx = point.x - anchor.x
  const dy = point.y - anchor.y
  return dx * dx + dy * dy > slop * slop
}

export const PREVIEW_CURSOR_OFFSET_X = 18
export const PREVIEW_CURSOR_OFFSET_Y = 14
export const PREVIEW_VIEWPORT_MARGIN = 12

export interface GalaxyPreviewFollowAnchor {
  nodeId?: string
  clusterId?: string
  until: number
}

export interface PreviewViewportBounds {
  left: number
  top: number
  right: number
  bottom: number
}

export function resolvePreviewPosition(
  clientX: number,
  clientY: number,
  bounds: PreviewViewportBounds,
  previewWidth: number,
  previewHeight: number,
  margin: number = PREVIEW_VIEWPORT_MARGIN,
): { x: number; y: number } {
  let x = clientX + PREVIEW_CURSOR_OFFSET_X
  let y = clientY + PREVIEW_CURSOR_OFFSET_Y

  if (x + previewWidth > bounds.right - margin) {
    x = bounds.right - previewWidth - margin
  }
  if (x < bounds.left + margin) {
    x = bounds.left + margin
  }
  if (y + previewHeight > bounds.bottom - margin) {
    y = bounds.bottom - previewHeight - margin
  }
  if (y < bounds.top + margin) {
    y = bounds.top + margin
  }

  return { x, y }
}

export function resolvePreviewViewportBounds(input: {
  chromeRect: DOMRect | null | undefined
  chromeInsets: { left: number; right: number; top: number; bottom: number }
  flowRect: DOMRect | null | undefined
}): PreviewViewportBounds {
  const { chromeRect, chromeInsets, flowRect } = input

  if (chromeRect && chromeRect.width >= 1 && chromeRect.height >= 1) {
    return {
      left: chromeRect.left,
      top: chromeRect.top,
      right: chromeRect.right,
      bottom: chromeRect.bottom,
    }
  }

  if (chromeInsets.top > 40 || chromeInsets.left > 0 || chromeInsets.right > 0) {
    return {
      left: chromeInsets.left,
      top: chromeInsets.top,
      right: window.innerWidth - chromeInsets.right,
      bottom: window.innerHeight - chromeInsets.bottom,
    }
  }

  if (flowRect && flowRect.width >= 1 && flowRect.height >= 1) {
    return {
      left: flowRect.left,
      top: flowRect.top,
      right: flowRect.right,
      bottom: flowRect.bottom,
    }
  }

  return {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  }
}
