import { describe, expect, it, vi } from 'vitest'

import { createDiffScrollSynchronizer } from './diffScrollSynchronizer'

describe('diff scroll synchronization', () => {
  it('holds the guard until the mirrored scroll echo is consumed', () => {
    const scheduled: Array<() => void> = []
    const synchronizer = createDiffScrollSynchronizer(
      (callback) => {
        scheduled.push(callback)
        return scheduled.length
      },
      vi.fn(),
    )
    const before = { scrollTop: 100 }
    let afterScrollTop = 0
    const after = {
      get scrollTop() {
        return afterScrollTop
      },
      set scrollTop(value: number) {
        afterScrollTop = Math.min(value, 60)
      },
    }

    expect(synchronizer.sync('before', 100, after)).toBe(true)
    expect(after.scrollTop).toBe(60)

    expect(synchronizer.sync('after', 60, before)).toBe(false)
    expect(before.scrollTop).toBe(100)
  })
})
