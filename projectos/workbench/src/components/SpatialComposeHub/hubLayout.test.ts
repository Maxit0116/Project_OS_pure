import { describe, expect, it } from 'vitest'

import { layoutSatellites, satelliteConnectorPath } from './hubLayout'

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
