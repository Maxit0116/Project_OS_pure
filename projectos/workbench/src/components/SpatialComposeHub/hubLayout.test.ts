import { describe, expect, it } from 'vitest'

import {
  computeReferencesHeight,
  computeScopeHeight,
  layoutSatellites,
  REFERENCES_MAX_HEIGHT,
  REFERENCES_MIN_HEIGHT,
  SCOPE_MAX_HEIGHT,
  SCOPE_MIN_HEIGHT,
  satelliteConnectorPath,
} from './hubLayout'

describe('hubLayout', () => {
  const card = { x: 400, y: 200, width: 320, height: 140 }

  it('stacks left and right satellites centered on the card', () => {
    const rects = layoutSatellites(card, [
      { id: 'repo', side: 'left', index: 0, count: 2 },
      { id: 'skills', side: 'left', index: 1, count: 2 },
      { id: 'a1', side: 'right', index: 0, count: 1 },
    ])
    expect(rects).toHaveLength(3)
    const left = rects.filter((r) => r.side === 'left')
    expect(left[0]!.x + left[0]!.width).toBeLessThan(card.x)
    expect(rects.find((r) => r.id === 'a1')!.x).toBeGreaterThan(
      card.x + card.width,
    )
  })

  it('fans hub ports so stacked left satellites get vertical delta (curves)', () => {
    const rects = layoutSatellites(card, [
      { id: 'repo', side: 'left', index: 0, count: 2 },
      { id: 'skills', side: 'left', index: 1, count: 2 },
    ])
    const [top, bottom] = rects
    expect(top!.hubPoint.y).not.toBe(top!.satPoint.y)
    expect(bottom!.hubPoint.y).not.toBe(bottom!.satPoint.y)
    expect(Math.abs(top!.hubPoint.y - bottom!.hubPoint.y)).toBeLessThan(
      Math.abs(top!.satPoint.y - bottom!.satPoint.y),
    )
  })

  it('places bottom research under the card center', () => {
    const [research] = layoutSatellites(card, [
      { id: 'research', side: 'bottom', index: 0, count: 1 },
    ])
    expect(research).toBeDefined()
    expect(research!.y).toBeGreaterThan(card.y + card.height)
    expect(research!.hubPoint.x).toBe(card.x + card.width / 2)
  })

  it('places references under the card and stacks research below it', () => {
    const rects = layoutSatellites(
      card,
      [
        { id: 'references', side: 'bottom', index: 0, count: 2 },
        { id: 'research', side: 'bottom', index: 1, count: 2 },
      ],
      { referencesHeight: 140 },
    )
    const references = rects.find((r) => r.id === 'references')!
    const research = rects.find((r) => r.id === 'research')!
    expect(references.y).toBeGreaterThan(card.y + card.height)
    expect(references.width).toBe(card.width)
    expect(references.height).toBe(140)
    expect(research.y).toBeGreaterThan(references.y + references.height)
  })

  it('grows references height until five rows, then caps for scroll', () => {
    expect(computeReferencesHeight(0)).toBe(REFERENCES_MIN_HEIGHT)
    expect(computeReferencesHeight(2)).toBeGreaterThan(REFERENCES_MIN_HEIGHT)
    expect(computeReferencesHeight(4)).toBeLessThan(REFERENCES_MAX_HEIGHT)
    expect(computeReferencesHeight(5)).toBe(REFERENCES_MAX_HEIGHT)
    expect(computeReferencesHeight(40)).toBe(REFERENCES_MAX_HEIGHT)
  })

  it('grows scope height until five rows, then caps for scroll', () => {
    expect(computeScopeHeight(0)).toBe(SCOPE_MIN_HEIGHT)
    expect(computeScopeHeight(2)).toBeGreaterThan(SCOPE_MIN_HEIGHT)
    expect(computeScopeHeight(4)).toBeLessThan(SCOPE_MAX_HEIGHT)
    expect(computeScopeHeight(5)).toBe(SCOPE_MAX_HEIGHT)
    expect(computeScopeHeight(40)).toBe(SCOPE_MAX_HEIGHT)
  })

  it('sizes the scope satellite from scopeHeight option', () => {
    const rects = layoutSatellites(
      card,
      [
        { id: 'repo', side: 'left', index: 0, count: 2 },
        { id: 'scope', side: 'left', index: 1, count: 2 },
      ],
      { scopeHeight: 200 },
    )
    expect(rects.find((r) => r.id === 'scope')!.height).toBe(200)
  })

  it('builds a cubic connector with horizontal pull (not a flat line)', () => {
    const path = satelliteConnectorPath(
      { x: 400, y: 250 },
      { x: 300, y: 180 },
      'left',
    )
    expect(path.startsWith('M ')).toBe(true)
    expect(path.includes('C ')).toBe(true)
    // Control points should pull left of hub and right of sat.
    expect(path).toMatch(/C 3\d\d/)
  })

  it('builds a soft U-curve for bottom research', () => {
    const path = satelliteConnectorPath(
      { x: 500, y: 300 },
      { x: 500, y: 380 },
      'bottom',
    )
    expect(path.includes('C ')).toBe(true)
  })
})
