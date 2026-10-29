import { describe, expect, it } from 'vitest'

import { placeSatellitePicker } from './placeSatellitePicker'

describe('placeSatellitePicker', () => {
  const viewport = { width: 1200, height: 800 }

  it('prefers the right side when clear', () => {
    const placed = placeSatellitePicker({
      anchor: { x: 100, y: 200, width: 200, height: 100 },
      obstacles: [],
      preferredSide: 'right',
      viewport,
    })
    expect(placed.side).toBe('right')
    expect(placed.x).toBe(310)
    expect(placed.y).toBe(200)
  })

  it('flips left when the right side collides and left space is clear', () => {
    const placed = placeSatellitePicker({
      anchor: { x: 400, y: 200, width: 200, height: 100 },
      obstacles: [{ x: 620, y: 180, width: 200, height: 120 }],
      preferredSide: 'right',
      viewport,
    })
    expect(placed.side).toBe('left')
    expect(placed.x + 220).toBeLessThanOrEqual(400)
  })

  it('falls back below when left and right collide', () => {
    const placed = placeSatellitePicker({
      anchor: { x: 400, y: 200, width: 200, height: 100 },
      obstacles: [
        { x: 620, y: 180, width: 200, height: 140 },
        { x: 160, y: 180, width: 200, height: 140 },
      ],
      preferredSide: 'right',
      viewport,
    })
    expect(placed.side).toBe('below')
    expect(placed.y).toBeGreaterThanOrEqual(310)
  })
})
