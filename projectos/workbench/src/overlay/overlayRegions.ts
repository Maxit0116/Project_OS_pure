import type {
  AnnotationAnchor,
  AnnotationStroke,
  ScreenRect,
  SpatialPinMode,
} from '@contracts/spatial-pin'
import type { StencilPlacement } from '@contracts/ui-stencil'
import { pointInRect } from './regionAnchors'

export type RegionTool = 'arrow' | 'draw' | 'stencil'

export interface OverlayArrow {
  id: string
  index: number
  color: string
  /** Arrow head dock on the capture region. */
  anchor: AnnotationAnchor
  head: { x: number; y: number }
  tail: { x: number; y: number }
  /**
   * Locked compose-card connection point (set once on commit).
   * Dragging the card moves the tip but never changes this attach.
   */
  composeAttach: AnnotationAnchor
  prompt: string
  pinId: string
  /** Submitted run id if any. */
  runId?: string
  status: 'draft' | 'submitting' | 'submitted' | 'error'
}

export interface OverlayRegion {
  id: string
  captureRect: ScreenRect
  mode: SpatialPinMode
  /** Optional region-level note (modes chrome); arrow prompts are primary. */
  regionPrompt: string
  arrows: OverlayArrow[]
  drawStrokes: AnnotationStroke[]
  snapshotAssetPath?: string
  /** True once ≥1 arrow has been committed (tail locked + compose card shown). */
  flowComplete: boolean
  /** Show 8 anchor dots after click when flowComplete. */
  showAnchors: boolean
  tool: RegionTool
  /** UI stencil placements on this region (M0+; Library UI in M1). */
  stencils: StencilPlacement[]
}

/** Box + arrow + compose card. Bare selections are discarded on exit. */
export function isCompleteCaptureRegion(
  region: Pick<OverlayRegion, 'flowComplete' | 'arrows'>,
): boolean {
  return region.flowComplete && region.arrows.length > 0
}

export function rectsOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  )
}

/** All regions whose captureRect contains the client point (overlap → multiple). */
export function regionsContainingPoint(
  regions: OverlayRegion[],
  clientX: number,
  clientY: number,
): OverlayRegion[] {
  return regions.filter((region) =>
    pointInRect(region.captureRect, clientX, clientY),
  )
}

/**
 * Focus set for a click:
 * - Outside all regions → empty (caller may start a new selection)
 * - Inside one → that region
 * - Inside overlap → all containing regions
 */
export function focusIdsForClick(
  regions: OverlayRegion[],
  clientX: number,
  clientY: number,
): string[] {
  return regionsContainingPoint(regions, clientX, clientY).map((r) => r.id)
}

export function isRegionFocused(
  focusedIds: ReadonlySet<string> | readonly string[],
  regionId: string,
): boolean {
  if (focusedIds instanceof Set) return focusedIds.has(regionId)
  return (focusedIds as readonly string[]).includes(regionId)
}

/** True if point is outside every existing region (used to start a new drag). */
export function isOutsideAllRegions(
  regions: OverlayRegion[],
  clientX: number,
  clientY: number,
): boolean {
  return regionsContainingPoint(regions, clientX, clientY).length === 0
}
