import { describe, expect, it } from 'vitest'

import { routeComposeArrowCurve } from './composeArrowCurve'

describe('routeComposeArrowCurve', () => {
  it('builds a cubic path that adapts to side placement', () => {
    const right = routeComposeArrowCurve({
      from: { x: 300, y: 100 },
      to: { x: 100, y: 100 },
      fromAnchor: 'left',
      toAnchor: 'right',
    })
    expect(right.d).toMatch(/^M 300 100 C /)
    expect(right.d).toContain('100 100')
    expect(right.mid.x).toBeGreaterThan(100)
    expect(right.mid.x).toBeLessThan(300)

    const below = routeComposeArrowCurve({
      from: { x: 100, y: 300 },
      to: { x: 100, y: 100 },
      fromAnchor: 'top',
      toAnchor: 'bottom',
    })
    expect(below.mid.y).toBeGreaterThan(100)
    expect(below.mid.y).toBeLessThan(300)
  })

  it('nudges around an obstacle between the endpoints', () => {
    const clear = routeComposeArrowCurve({
      from: { x: 0, y: 100 },
      to: { x: 400, y: 100 },
      fromAnchor: 'right',
      toAnchor: 'left',
    })
    const routed = routeComposeArrowCurve({
      from: { x: 0, y: 100 },
      to: { x: 400, y: 100 },
      fromAnchor: 'right',
      toAnchor: 'left',
      obstacles: [{ x: 150, y: 60, width: 100, height: 80 }],
    })
    // Control points / mid should differ once the obstacle forces a lateral nudge.
    expect(routed.d).not.toBe(clear.d)
    expect(Math.abs(routed.mid.y - 100)).toBeGreaterThan(8)
  })
})
