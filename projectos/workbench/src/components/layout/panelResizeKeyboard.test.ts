import { describe, expect, it, vi } from 'vitest'

import { applyPanelResizeArrowKey } from './panelResizeKeyboard'

describe('panel resize keyboard controls', () => {
  it('maps arrow keys through the handle edge and invokes the resize action', () => {
    const onDelta = vi.fn()
    const event = {
      key: 'ArrowLeft',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }

    expect(applyPanelResizeArrowKey(event, 'west', onDelta, 16)).toBe(true)
    expect(onDelta).toHaveBeenCalledWith(16)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
  })

  it('ignores unrelated keys', () => {
    const onDelta = vi.fn()
    const event = {
      key: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }

    expect(applyPanelResizeArrowKey(event, 'east', onDelta, 16)).toBe(false)
    expect(onDelta).not.toHaveBeenCalled()
  })
})
