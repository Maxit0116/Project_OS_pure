import { describe, expect, it } from 'vitest'
import { computeMiscFitCount } from './miscFitCount'

describe('computeMiscFitCount', () => {
  it('fits all chips when width allows', () => {
    expect(computeMiscFitCount([40, 40, 40], 28, 200)).toBe(3)
  })

  it('reserves space for the +N badge when some chips overflow', () => {
    expect(computeMiscFitCount([40, 40, 40, 40], 28, 120)).toBe(2)
  })

  it('shows at least one chip when nothing fully fits with +N', () => {
    expect(computeMiscFitCount([100, 100], 28, 50)).toBe(1)
  })

  it('returns 0 for empty input', () => {
    expect(computeMiscFitCount([], 28, 200)).toBe(0)
  })
})
