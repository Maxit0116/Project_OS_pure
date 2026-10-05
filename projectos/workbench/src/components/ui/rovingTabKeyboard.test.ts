import { describe, expect, it } from 'vitest'

import { nextRovingTabIndex } from './rovingTabKeyboard'

describe('roving tab keyboard navigation', () => {
  it('wraps arrows and supports Home/End', () => {
    expect(nextRovingTabIndex('ArrowRight', 2, 3)).toBe(0)
    expect(nextRovingTabIndex('ArrowLeft', 0, 3)).toBe(2)
    expect(nextRovingTabIndex('ArrowDown', 0, 3)).toBe(1)
    expect(nextRovingTabIndex('Home', 2, 3)).toBe(0)
    expect(nextRovingTabIndex('End', 0, 3)).toBe(2)
    expect(nextRovingTabIndex('Enter', 0, 3)).toBeUndefined()
  })
})
