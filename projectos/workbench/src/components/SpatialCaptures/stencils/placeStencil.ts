import type { ScreenRect } from '@contracts/spatial-pin'
import {
  getStencilById,
  listStencilsByCategory,
  renderPlacementBrief,
  type StencilDefinition,
  type StencilGenerationScope,
  type StencilPlacement,
} from '@contracts/ui-stencil'
import type { OverlayRegion } from '../../../overlay/overlayRegions'

export const DEFAULT_STENCIL_SCOPE: StencilGenerationScope = 'ui_only'

const REDUCED_MOTION_NOTE =
  'User prefers reduced motion: keep transitions instant or opacity-only; skip stagger/parallax.'

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function listMotionModifierStencils(): StencilDefinition[] {
  return listStencilsByCategory('motion')
}

export function isMotionAttachable(stencilId: string): boolean {
  return getStencilById(stencilId)?.motionAttachable === true
}

/** Default placement size in region-local pixels by category / id. */
export function defaultStencilSize(stencilId: string): {
  width: number
  height: number
} {
  const def = getStencilById(stencilId)
  if (!def) return { width: 160, height: 48 }
  if (def.category === 'preset') {
    if (def.id === 'preset-dashboard') return { width: 360, height: 240 }
    return { width: 280, height: 320 }
  }
  if (def.category === 'motion') return { width: 120, height: 36 }
  if (def.id === 'dialog' || def.id === 'sheet') return { width: 220, height: 160 }
  if (def.id === 'table-basic') return { width: 280, height: 140 }
  if (def.id === 'card' || def.id === 'command') return { width: 200, height: 120 }
  if (def.id.startsWith('bg-')) return { width: 240, height: 160 }
  if (def.id.startsWith('text-')) return { width: 200, height: 48 }
  if (def.category === 'visual') return { width: 160, height: 64 }
  return { width: 160, height: 48 }
}

export function clampPlacementRect(
  rect: ScreenRect,
  bounds: ScreenRect,
): ScreenRect {
  const width = Math.min(rect.width, bounds.width)
  const height = Math.min(rect.height, bounds.height)
  const x = Math.max(
    bounds.x,
    Math.min(rect.x, bounds.x + bounds.width - width),
  )
  const y = Math.max(
    bounds.y,
    Math.min(rect.y, bounds.y + bounds.height - height),
  )
  return { x, y, width, height }
}

/**
 * Build a placement whose `rect` is region-local (origin at region top-left).
 * `stagePoint` is in the same coordinate space as `region.captureRect`.
 */
export function buildPlacementAtStagePoint(input: {
  id: string
  stencilId: string
  stagePoint: { x: number; y: number }
  region: Pick<OverlayRegion, 'captureRect'>
  arrowId?: string
  props?: StencilPlacement['props']
  /** Optional single motion modifier (MVP max 1 when placing). */
  motionModifierId?: string
}): StencilPlacement {
  const size = defaultStencilSize(input.stencilId)
  const stageRect = clampPlacementRect(
    {
      x: input.stagePoint.x - size.width / 2,
      y: input.stagePoint.y - size.height / 2,
      width: size.width,
      height: size.height,
    },
    input.region.captureRect,
  )
  const local: ScreenRect = {
    x: stageRect.x - input.region.captureRect.x,
    y: stageRect.y - input.region.captureRect.y,
    width: stageRect.width,
    height: stageRect.height,
  }
  const motionOk =
    input.motionModifierId &&
    isMotionAttachable(input.stencilId) &&
    getStencilById(input.motionModifierId)?.category === 'motion'
  return {
    id: input.id,
    stencilId: input.stencilId,
    rect: local,
    ...(input.arrowId ? { arrowId: input.arrowId } : {}),
    ...(input.props ? { props: input.props } : {}),
    ...(motionOk && input.motionModifierId
      ? { motionModifierIds: [input.motionModifierId] }
      : {}),
  }
}

/** Set or clear the single motion modifier on a placement (MVP: 0–1). */
export function withMotionModifier(
  placement: StencilPlacement,
  motionId: string | null,
): StencilPlacement {
  if (!motionId) {
    const { motionModifierIds: _drop, ...rest } = placement
    return rest
  }
  if (
    !isMotionAttachable(placement.stencilId) ||
    getStencilById(motionId)?.category !== 'motion'
  ) {
    return placement
  }
  return { ...placement, motionModifierIds: [motionId] }
}

export function placementsForArrow(
  region: OverlayRegion,
  arrowId: string,
): StencilPlacement[] {
  return (region.stencils ?? []).filter((item) => item.arrowId === arrowId)
}

export function combinedBriefForArrow(
  region: OverlayRegion,
  arrowId: string,
  options?: { respectReducedMotion?: boolean },
): string | undefined {
  const linked = placementsForArrow(region, arrowId)
  if (linked.length === 0) return undefined
  let brief = linked.map((item) => renderPlacementBrief(item)).join('\n\n')
  const hasMotion = linked.some(
    (item) => (item.motionModifierIds?.length ?? 0) > 0,
  )
  if (
    hasMotion &&
    options?.respectReducedMotion !== false &&
    prefersReducedMotion()
  ) {
    brief = `${brief}\n\n${REDUCED_MOTION_NOTE}`
  }
  return brief
}

export function stencilTitle(stencilId: string): string {
  return getStencilById(stencilId)?.title ?? stencilId
}

export function stencilDefinition(
  stencilId: string,
): StencilDefinition | undefined {
  return getStencilById(stencilId)
}

export function stageRectForPlacement(
  region: OverlayRegion,
  placement: StencilPlacement,
): ScreenRect {
  return {
    x: region.captureRect.x + placement.rect.x,
    y: region.captureRect.y + placement.rect.y,
    width: placement.rect.width,
    height: placement.rect.height,
  }
}
