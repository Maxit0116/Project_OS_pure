import { describe, expect, it } from 'vitest'

import {
  facingEdgeAnchor,
  pickFacingEdgePorts,
} from './composeConnection'

describe('composeConnection', () => {
  it('picks the edge facing the other rect', () => {
    const left = { x: 0, y: 0, width: 100, height: 80 }
    const right = { x: 200, y: 0, width: 100, height: 80 }
    expect(facingEdgeAnchor(left, { x: 250, y: 40 })).toBe('right')
    expect(facingEdgeAnchor(right, { x: 50, y: 40 })).toBe('left')

    const ports = pickFacingEdgePorts(left, right)
    expect(ports.cardAnchor).toBe('right')
    expect(ports.targetAnchor).toBe('left')
  })

  it('picks vertical edges when stacked', () => {
    const top = { x: 0, y: 0, width: 120, height: 60 }
    const bottom = { x: 0, y: 200, width: 120, height: 60 }
    const ports = pickFacingEdgePorts(bottom, top)
    expect(ports.cardAnchor).toBe('top')
    expect(ports.targetAnchor).toBe('bottom')
  })
})
