import type { Viewport } from '@xyflow/react'
import type { GridArea } from '../autoGridLayout'
import type { C4Diagram } from './types'

const FIT_MAX_ZOOM = 2.2
const MIN_FIT_ZOOM = 0.15
const GRID_MARGIN = 24

/**
 * Convert a C4 diagram's absolute positions into a FunctionMap layout snapshot
 * (positions + camera fit). No layer bands — classic C4 owns the composition.
 */
export function layoutFromC4Diagram(
  diagram: C4Diagram,
  safe: {
    sx: number
    sy: number
    sw: number
    sh: number
  },
): {
  area: GridArea
  positionsById: Record<string, { x: number; y: number }>
  sizesById: Record<string, { width: number; height: number }>
  layerBands: []
  viewport: Viewport
} {
  const positionsById: Record<string, { x: number; y: number }> = {}
  const sizesById: Record<string, { width: number; height: number }> = {}

  for (const node of diagram.nodes) {
    positionsById[node.id] = { ...node.position }
    sizesById[node.id] = { width: node.width, height: node.height }
  }

  const padW = Math.max(1, safe.sw - GRID_MARGIN * 2)
  const padH = Math.max(1, safe.sh - GRID_MARGIN * 2)
  const bounds = diagram.bounds
  const zoom = Math.min(
    FIT_MAX_ZOOM,
    Math.max(
      MIN_FIT_ZOOM,
      Math.min(padW / Math.max(bounds.width, 1), padH / Math.max(bounds.height, 1)),
    ),
  )
  const tx =
    safe.sx + GRID_MARGIN + (padW - bounds.width * zoom) / 2 - bounds.minX * zoom
  const ty =
    safe.sy + GRID_MARGIN + (padH - bounds.height * zoom) / 2 - bounds.minY * zoom

  return {
    area: {
      originX: 0,
      originY: 0,
      width: Math.max(bounds.width, padW),
      height: Math.max(bounds.height, padH),
    },
    positionsById,
    sizesById,
    layerBands: [],
    viewport: { x: tx, y: ty, zoom },
  }
}
