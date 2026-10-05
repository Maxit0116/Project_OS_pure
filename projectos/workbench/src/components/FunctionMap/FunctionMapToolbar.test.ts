import { describe, expect, it, vi } from 'vitest'

import { shouldCloseToolbarMenuForScroll } from './FunctionMapToolbar'

describe('Function Map toolbar add-menu scroll dismissal', () => {
  it('ignores scroll events originating inside the open menu', () => {
    const internalTarget = {} as EventTarget
    const menu = {
      contains: vi.fn((target: Node) => target === internalTarget),
    }

    expect(shouldCloseToolbarMenuForScroll(menu, internalTarget)).toBe(false)
    expect(shouldCloseToolbarMenuForScroll(menu, {} as EventTarget)).toBe(true)
  })
})
