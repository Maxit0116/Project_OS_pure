import { describe, expect, it } from 'vitest'

import { nextTreeRowIndex } from './treeKeyboardNavigation'

describe('tree roving keyboard navigation', () => {
  it('moves between visible rows without wrapping', () => {
    expect(nextTreeRowIndex('ArrowDown', 0, 3)).toBe(1)
    expect(nextTreeRowIndex('ArrowDown', 2, 3)).toBe(2)
    expect(nextTreeRowIndex('ArrowUp', 0, 3)).toBe(0)
    expect(nextTreeRowIndex('Home', 2, 3)).toBe(0)
    expect(nextTreeRowIndex('End', 0, 3)).toBe(2)
  })
})
