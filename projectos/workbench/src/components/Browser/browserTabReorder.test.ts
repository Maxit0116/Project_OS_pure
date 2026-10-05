import { describe, expect, it } from 'vitest'
import { computeTabDropIndex, moveTabInArray } from './browserTabReorder'

describe('moveTabInArray', () => {
  it('moves an item forward', () => {
    expect(moveTabInArray(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('moves an item backward', () => {
    expect(moveTabInArray(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('returns a copy when indices match', () => {
    expect(moveTabInArray(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })
})

describe('computeTabDropIndex', () => {
  const storeTabIds = ['a', 'b', 'c']
  const metrics = [
    { id: 'a', left: 0, width: 100 },
    { id: 'b', left: 110, width: 100 },
    { id: 'c', left: 220, width: 100 },
  ]

  it('inserts before the first tab', () => {
    expect(computeTabDropIndex(10, storeTabIds, metrics, 'b')).toBe(0)
  })

  it('inserts between middle tabs', () => {
    expect(computeTabDropIndex(170, storeTabIds, metrics, 'a')).toBe(1)
  })

  it('inserts at the end', () => {
    expect(computeTabDropIndex(400, storeTabIds, metrics, 'a')).toBe(2)
  })
})
