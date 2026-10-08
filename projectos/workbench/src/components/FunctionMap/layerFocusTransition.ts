import type { Viewport } from '@xyflow/react'
import type { ArchitectureLayerBandLayout } from './layeredArchitectureLayout'

/** Matches `--duration-map-layer-focus` in tokens.css. */
export const LAYER_FOCUS_TRANSITION_MS = 200

/**
 * Zero velocity at t=0 and t=1 — slow launch, cruise, gentle settle (Perlin smootherstep).
 * Models inertia: object accelerates from rest, decelerates into the target pose.
 */
export function smootherStep(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/**
 * Strong ease-in-out for opacity — slightly quicker than motion so fades feel natural.
 */
export function easeInOutQuint(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped < 0.5
    ? 16 * clamped ** 5
    : 1 - ((-2 * clamped + 2) ** 5) / 2
}

export interface LayerFocusLayoutSnapshot {
  positionsById: Record<string, { x: number; y: number }>
  layerBands: ArchitectureLayerBandLayout[]
  viewport: Viewport
}

export interface LayerFocusEdgeRef {
  id: string
  source: string
  target: string
}

export interface LayerFocusTransition {
  direction: 'enter' | 'exit'
  focusNodeId: string
  linkedIds: ReadonlySet<string>
  /** Architecture layer ids that contain at least one linked node. */
  linkedLayerIds: ReadonlySet<string>
  allNodeIds: ReadonlySet<string>
  layoutFrom: LayerFocusLayoutSnapshot
  layoutTo: LayerFocusLayoutSnapshot
  edges: readonly LayerFocusEdgeRef[]
  startedAt: number
  durationMs: number
}

export interface LayerBandFrame {
  id: string
  label: string
  description: string
  position: { x: number; y: number }
  width: number
  height: number
  opacity: number
}

export interface LayerFocusTransitionSample {
  progress: number
  fadeProgress: number
  positionsById: Record<string, { x: number; y: number }>
  nodeOpacityById: Record<string, number>
  edgeOpacityById: Record<string, number>
  layerBands: LayerBandFrame[]
  viewport: Viewport
}

export function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return 1 - (1 - clamped) ** 3
}

/** Gentle start and end — smoother than ease-out for layout + fade transitions. */
export function easeInOutQuart(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped < 0.5
    ? 8 * clamped ** 4
    : 1 - ((-2 * clamped + 2) ** 4) / 2
}

export function interpolatePosition(
  from: { x: number; y: number },
  to: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  }
}

export function interpolateViewport(from: Viewport, to: Viewport, t: number): Viewport {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    zoom: from.zoom + (to.zoom - from.zoom) * t,
  }
}

function bandOpacityForTransition(
  band: ArchitectureLayerBandLayout,
  linkedLayerIds: ReadonlySet<string>,
  unlinkedOpacity: number,
): number {
  return linkedLayerIds.has(band.id) ? 1 : unlinkedOpacity
}

function interpolateBands(
  fromBands: ArchitectureLayerBandLayout[],
  toBands: ArchitectureLayerBandLayout[],
  t: number,
  linkedLayerIds: ReadonlySet<string>,
  unlinkedOpacity: number,
): LayerBandFrame[] {
  const toById = new Map(toBands.map((band) => [band.id, band]))
  const fromById = new Map(fromBands.map((band) => [band.id, band]))
  const bandIds = new Set([...fromBands.map((b) => b.id), ...toBands.map((b) => b.id)])

  return [...bandIds].map((id) => {
    const from = fromById.get(id)
    const to = toById.get(id)
    const label = to?.label ?? from?.label ?? id
    const description = to?.description ?? from?.description ?? ''
    const fromPos = from?.position ?? to?.position ?? { x: 0, y: 0 }
    const toPos = to?.position ?? from?.position ?? { x: 0, y: 0 }
    const fromW = from?.width ?? to?.width ?? 0
    const toW = to?.width ?? from?.width ?? 0
    const fromH = from?.height ?? to?.height ?? 0
    const toH = to?.height ?? from?.height ?? 0
    const position = interpolatePosition(fromPos, toPos, t)
    const width = fromW + (toW - fromW) * t
    const height = fromH + (toH - fromH) * t
    const bandFrame: ArchitectureLayerBandLayout = {
      id,
      label,
      description,
      position,
      width,
      height,
    }
    const opacity = bandOpacityForTransition(bandFrame, linkedLayerIds, unlinkedOpacity)
    return {
      id,
      label,
      description,
      position,
      width,
      height,
      opacity,
    }
  })
}

export function sampleLayerFocusTransition(
  transition: LayerFocusTransition,
  now: number,
): LayerFocusTransitionSample {
  const elapsed = now - transition.startedAt
  const rawT = transition.durationMs <= 0 ? 1 : elapsed / transition.durationMs
  const clampedT = Math.min(1, rawT)
  const motionProgress = smootherStep(clampedT)
  // Linear fade so unlinked nodes reach opacity 0 exactly when the transition ends.
  const fadeProgress = clampedT
  const { layoutFrom, layoutTo, linkedIds, allNodeIds, direction } = transition

  const positionsById: Record<string, { x: number; y: number }> = {}
  const nodeOpacityById: Record<string, number> = {}

  for (const nodeId of allNodeIds) {
    const fromPos = layoutFrom.positionsById[nodeId]
    const toPos = layoutTo.positionsById[nodeId]
    const isLinked = linkedIds.has(nodeId)

    if (isLinked && fromPos && toPos) {
      positionsById[nodeId] = interpolatePosition(fromPos, toPos, motionProgress)
      nodeOpacityById[nodeId] = 1
    } else if (isLinked && toPos) {
      positionsById[nodeId] = toPos
      nodeOpacityById[nodeId] = 1
    } else if (!isLinked && fromPos) {
      if (direction === 'enter') {
        positionsById[nodeId] = fromPos
        nodeOpacityById[nodeId] = 1 - fadeProgress
      } else {
        positionsById[nodeId] = toPos
          ? interpolatePosition(fromPos, toPos, motionProgress)
          : fromPos
        nodeOpacityById[nodeId] = fadeProgress
      }
    } else if (toPos) {
      positionsById[nodeId] = toPos
      nodeOpacityById[nodeId] = direction === 'exit' ? fadeProgress : 0
    }
  }

  const unlinkedOpacity = direction === 'enter' ? 1 - fadeProgress : fadeProgress

  const edgeOpacityById: Record<string, number> = {}
  for (const edge of transition.edges) {
    const linked =
      linkedIds.has(edge.source) && linkedIds.has(edge.target)
    edgeOpacityById[edge.id] = linked ? 1 : unlinkedOpacity
  }

  const layerBands = interpolateBands(
    layoutFrom.layerBands,
    layoutTo.layerBands,
    motionProgress,
    transition.linkedLayerIds,
    unlinkedOpacity,
  )

  const viewport = interpolateViewport(
    layoutFrom.viewport,
    layoutTo.viewport,
    motionProgress,
  )

  return {
    progress: motionProgress,
    fadeProgress,
    positionsById,
    nodeOpacityById,
    edgeOpacityById,
    layerBands,
    viewport,
  }
}
