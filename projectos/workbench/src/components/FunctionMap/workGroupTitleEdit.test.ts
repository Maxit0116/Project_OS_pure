import { describe, expect, it, vi } from 'vitest'

import { settleWorkGroupTitleEdit } from './workGroupTitleEdit'

describe('work-group title edit session', () => {
  it('commits once when Enter is followed by the induced blur', () => {
    const session = { settled: false }
    const onTitleChange = vi.fn()

    expect(settleWorkGroupTitleEdit(session, 'Renamed', 'Original', onTitleChange)).toBe(true)
    expect(settleWorkGroupTitleEdit(session, 'Renamed', 'Original', onTitleChange)).toBe(false)
    expect(onTitleChange).toHaveBeenCalledOnce()
    expect(onTitleChange).toHaveBeenCalledWith('Renamed')
  })
})
