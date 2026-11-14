import type { IntentEdgeKind, IntentEdgePort } from '@contracts/index'

export type SemanticLayoutEdgeRole = 'forward' | 'back'

/** Geometric role after layering — drives X assignment (SL-D11). */
export type SemanticNodeRole = 'spine' | 'side' | 'parked'

export type SemanticLayoutNodeSize = {
  id: string
  width: number
  height: number
}

export type SemanticLayoutEdge = {
  id: string
  source: string
  target: string
  kind?: IntentEdgeKind
  role: SemanticLayoutEdgeRole
}

export type SemanticLayoutGraph = {
  nodeIds: string[]
  sizes: Map<string, { width: number; height: number }>
  edges: SemanticLayoutEdge[]
}

export type SemanticLayoutOptions = {
  origin?: { x: number; y: number }
  gapX?: number
  gapY?: number
  /** World X used as happy-path spine center. Default: origin.x + 200 */
  spineX?: number
  baryIterations?: number
  /** Horizontal offset from spine center to side-corridor column centers. */
  corridorOffset?: number
  /** Gap between primary AABB and parked stack. */
  parkGapX?: number
}

export type SemanticLayoutResult = {
  positions: Map<string, { x: number; y: number }>
  ranks: Map<string, number>
  layers: string[][]
  spineX: number
  roles: Map<string, SemanticNodeRole>
  spineIds: string[]
}

export type SemanticPortPreference = {
  sourcePort: IntentEdgePort
  targetPort: IntentEdgePort
}

export const SEM_GAP_X = 64
export const SEM_GAP_Y = 88
export const SEM_BARY_ITERS = 8
export const SEM_ORIGIN = { x: 72, y: 72 } as const
/**
 * Minimum pixel gap between the right edge of a side-corridor node and the
 * left edge of a spine node (and vice-versa for the right corridor).
 * The actual spineX is derived from actual node sizes + this gap so the
 * columns never overlap regardless of card width.
 */
export const SEM_CORRIDOR_GAP = 80
/** @deprecated Use SEM_CORRIDOR_GAP — this constant is no longer used for
 *  default spineX computation; kept for callers that pass corridorOffset
 *  explicitly through SemanticLayoutOptions. */
export const SEM_CORRIDOR_OFFSET = 320
/** Vertical drop from the previous band's bottom to a side-only rank's top. */
export const SEM_SIDE_DROP = 32
/** Gap between primary bounding box and parked components. */
export const SEM_PARK_GAP_X = 96
export const SEM_PARK_GAP_Y = 48
