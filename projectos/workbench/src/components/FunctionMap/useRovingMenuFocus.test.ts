import { describe, expect, it } from 'vitest'

import { nextMenuItemIndex } from './useRovingMenuFocus'

describe('Function Map menu roving focus', () => {
  it('wraps arrow movement and supports Home/End', () => {
    expect(nextMenuItemIndex(3, 0, 'ArrowUp')).toBe(2)
    expect(nextMenuItemIndex(3, 2, 'ArrowDown')).toBe(0)
    expect(nextMenuItemIndex(3, 1, 'Home')).toBe(0)
    expect(nextMenuItemIndex(3, 1, 'End')).toBe(2)
  })
})
