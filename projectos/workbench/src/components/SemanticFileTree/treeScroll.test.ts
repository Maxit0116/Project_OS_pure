import { describe, expect, it, vi } from 'vitest'

import { scrollTreeRowIntoView } from './treeScroll'

describe('tree-local scrolling', () => {
  it('scrolls only the owning tree container to reveal a row', () => {
    const scrollTo = vi.fn()
    const container = {
      scrollTop: 40,
      getBoundingClientRect: () => ({ top: 100, bottom: 300 }),
      scrollTo,
    }
    const row = {
      closest: vi.fn(() => container),
      getBoundingClientRect: () => ({ top: 320, bottom: 350 }),
    }

    scrollTreeRowIntoView(row)

    expect(row.closest).toHaveBeenCalledWith('[role="tree"]')
    expect(scrollTo).toHaveBeenCalledWith({ top: 90, behavior: 'smooth' })
  })
})
