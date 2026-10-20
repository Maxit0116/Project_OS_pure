import { describe, expect, it } from 'vitest'
import {
  buildPlacementAtStagePoint,
  clampPlacementRect,
  defaultStencilSize,
  withMotionModifier,
} from './placeStencil'

describe('placeStencil', () => {
  it('sizes common stencils by id/category', () => {
    expect(defaultStencilSize('btn-primary').width).toBe(160)
    expect(defaultStencilSize('dialog').height).toBe(160)
    expect(defaultStencilSize('fade-in').width).toBe(120)
  })

  it('clamps placement inside bounds', () => {
    const clamped = clampPlacementRect(
      { x: -20, y: -10, width: 100, height: 40 },
      { x: 0, y: 0, width: 200, height: 100 },
    )
    expect(clamped.x).toBe(0)
    expect(clamped.y).toBe(0)
    expect(clamped.width).toBe(100)
  })

  it('builds region-local rect from stage point', () => {
    const placement = buildPlacementAtStagePoint({
      id: 'place_1',
      stencilId: 'btn-primary',
      stagePoint: { x: 150, y: 80 },
      region: { captureRect: { x: 100, y: 50, width: 200, height: 120 } },
      arrowId: 'arrow_1',
    })
    expect(placement.arrowId).toBe('arrow_1')
    expect(placement.rect.width).toBe(160)
    expect(placement.rect.x).toBeGreaterThanOrEqual(0)
    expect(placement.rect.y).toBeGreaterThanOrEqual(0)
    expect(placement.rect.x + placement.rect.width).toBeLessThanOrEqual(200)
  })

  it('attaches a single motion modifier when placing attachable base', () => {
    const placement = buildPlacementAtStagePoint({
      id: 'place_2',
      stencilId: 'btn-primary',
      stagePoint: { x: 50, y: 50 },
      region: { captureRect: { x: 0, y: 0, width: 400, height: 300 } },
      motionModifierId: 'fade-in',
    })
    expect(placement.motionModifierIds).toEqual(['fade-in'])
  })

  it('ignores motion modifier on non-attachable stencils', () => {
    const placement = buildPlacementAtStagePoint({
      id: 'place_3',
      stencilId: 'toast',
      stagePoint: { x: 50, y: 50 },
      region: { captureRect: { x: 0, y: 0, width: 400, height: 300 } },
      motionModifierId: 'fade-in',
    })
    expect(placement.motionModifierIds).toBeUndefined()
  })

  it('withMotionModifier sets and clears modifiers', () => {
    const base = buildPlacementAtStagePoint({
      id: 'place_4',
      stencilId: 'card',
      stagePoint: { x: 40, y: 40 },
      region: { captureRect: { x: 0, y: 0, width: 400, height: 300 } },
    })
    const withFade = withMotionModifier(base, 'fade-in')
    expect(withFade.motionModifierIds).toEqual(['fade-in'])
    expect(withMotionModifier(withFade, null).motionModifierIds).toBeUndefined()
  })
})
