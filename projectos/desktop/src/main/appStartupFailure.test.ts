import { describe, expect, it, vi } from 'vitest'

import { handleAppStartupFailure } from './appStartupFailure.js'

describe('desktop startup failure handling', () => {
  it('surfaces initialization failure and quits instead of leaking a rejection', () => {
    const showErrorBox = vi.fn()
    const quit = vi.fn()

    handleAppStartupFailure(new Error('native module unavailable'), {
      showErrorBox,
      quit,
    })

    expect(showErrorBox).toHaveBeenCalledWith(
      'ProjectOS failed to start',
      expect.stringContaining('native module unavailable'),
    )
    expect(quit).toHaveBeenCalledOnce()
  })
})
